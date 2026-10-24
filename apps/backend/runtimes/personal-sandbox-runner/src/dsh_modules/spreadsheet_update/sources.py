"""
Multi-source catalog, Query IR execution wrapper, and FactTable normalization.
Enforces typed Decimal arithmetic, cardinality checks (prohibits multi-to-multi cartesian joins),
and generates deterministic evidence references for update operations.
"""

from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Set, Union
import hashlib

from .bindings import LogicalKey


@dataclass
class SourceDescriptor:
    attachment_id: str
    file_path: str
    file_hash: str
    role: str  # e.g. "department_statistics"
    as_of: str
    unit: str
    is_closed: bool = True  # whether accounting period is formally closed


@dataclass
class FactRecord:
    logical_key: LogicalKey
    numeric_value: Decimal
    unit: str
    period: str
    as_of: str
    source_id: str
    source_row: int
    source_coordinate: str
    evidence_id: str


@dataclass
class CardinalityReport:
    is_valid: bool
    matched_count: int
    missing_keys: List[LogicalKey] = field(default_factory=list)
    extra_keys: List[LogicalKey] = field(default_factory=list)
    conflicting_keys: List[LogicalKey] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


class FactTable:
    """Normalized, deduplicated business facts produced from verified source queries."""

    def __init__(self, aggregation_rule: str = "reject_conflict"):
        self.aggregation_rule = aggregation_rule
        self._records: Dict[LogicalKey, FactRecord] = {}
        self._all_records: List[FactRecord] = []
        self._conflicts: Dict[LogicalKey, List[FactRecord]] = {}

    def add_fact(self, record: FactRecord):
        self._all_records.append(record)
        k = record.logical_key
        if k in self._records or k in self._conflicts:
            existing = self._records.get(k) or self._conflicts[k][0]
            if existing.numeric_value != record.numeric_value:
                # Value conflict detected without declared aggregation rule
                self._conflicts.setdefault(k, [existing]).append(record)
                if self.aggregation_rule == "sum":
                    self._records[k] = FactRecord(
                        logical_key=k,
                        numeric_value=existing.numeric_value + record.numeric_value,
                        unit=record.unit,
                        period=record.period,
                        as_of=record.as_of,
                        source_id=f"{existing.source_id}+{record.source_id}",
                        source_row=record.source_row,
                        source_coordinate="aggregated",
                        evidence_id=f"{existing.evidence_id}+{record.evidence_id}"
                    )
                    return
                else:
                    # reject_conflict / default: remove from valid facts so conflicting record cannot be used
                    self._records.pop(k, None)
                    return
        if k not in self._conflicts:
            self._records[k] = record

    def get_fact(self, key: LogicalKey) -> Optional[FactRecord]:
        return self._records.get(key)

    def all_facts(self) -> List[FactRecord]:
        return list(self._records.values())

    def check_cardinality_against_bindings(
        self,
        required_keys: List[LogicalKey]
    ) -> CardinalityReport:
        """
        Validates 1-to-1 matching against required target logical keys.
        Rejects multi-to-many duplication and flags unmapped extra/missing departments.
        """
        matched = 0
        missing = []
        conflicts = []
        errors = []

        # Check duplicate facts with differing numbers
        key_seen: Dict[LogicalKey, List[Decimal]] = {}
        for rec in self._all_records:
            key_seen.setdefault(rec.logical_key, []).append(rec.numeric_value)

        for key, values in key_seen.items():
            if len(values) > 1 and len(set(values)) > 1:
                conflicts.append(key)
                errors.append(f"Conflicting values detected for key {key.to_key_string()}: {values}")

        for k in self._conflicts.keys():
            if k not in conflicts:
                conflicts.append(k)
                errors.append(f"Source cardinality conflict recorded for {k.to_key_string()}")

        for req in required_keys:
            if req in self._records:
                matched += 1
            else:
                missing.append(req)

        extra = [k for k in self._records.keys() if k not in set(required_keys)]

        if missing:
            errors.append(f"FactTable missing facts for {len(missing)} required logical key(s): {[k.to_key_string() for k in missing]}")

        is_valid = len(conflicts) == 0 and len(errors) == 0 and len(missing) == 0
        return CardinalityReport(
            is_valid=is_valid,
            matched_count=matched,
            missing_keys=missing,
            extra_keys=extra,
            conflicting_keys=conflicts,
            errors=errors
        )


def ingest_facts_from_source_queries(sources, source_queries, mappings, workspace_dir=None, default_as_of=None):
    """Read an explicitly bound summary table; never guess fields, dates or units."""
    import openpyxl
    from openpyxl.utils.cell import range_boundaries
    root=Path(workspace_dir).resolve() if workspace_dir else Path.cwd()
    descriptors={source['source_id']:source for source in sources}
    table=FactTable();issues=[]
    required={'source_id','sheet_name','header_row','data_range','key_field','value_field',
              'period_field','target_region','metric_id','value_kind'}
    for query in source_queries:
        workbook=None
        try:
            missing=required-query.keys()
            if missing:
                raise ValueError('Explicit source binding required: '+', '.join(sorted(missing)))
            source=descriptors[query['source_id']]
            if not source.get('unit') or not (source.get('as_of') or default_as_of):
                raise ValueError('Source unit and as_of are required; no defaults are inferred')
            path=Path(source['file_path'])
            path=(root/path).resolve() if not path.is_absolute() else path.resolve()
            if not path.is_relative_to(root):
                raise ValueError('Source must remain inside configured workspace')
            digest=hashlib.sha256(path.read_bytes()).hexdigest()
            if source.get('expected_hash') and source['expected_hash']!=digest:
                raise ValueError('Source hash mismatch')
            workbook=openpyxl.load_workbook(path,data_only=True)
            ws=workbook[query['sheet_name']]
            columns={}
            for cell in ws[query['header_row']]:
                if cell.value is not None:
                    columns.setdefault(str(cell.value),[]).append(cell.column)
            bound={}
            for name in ('key_field','value_field','period_field'):
                matches=columns.get(query[name],[])
                if len(matches)!=1:
                    raise ValueError('Source field not uniquely bound: '+query[name])
                bound[name]=matches[0]
            left,first,right,last=range_boundaries(query['data_range'])
            if first<=query['header_row'] or any(not left<=col<=right for col in bound.values()):
                raise ValueError('Source range does not agree with declared headers')
            for row in range(first,last+1):
                raw_key=ws.cell(row,bound['key_field']).value
                raw_value=ws.cell(row,bound['value_field']).value
                raw_period=ws.cell(row,bound['period_field']).value
                if raw_key is None and raw_value is None and raw_period is None:
                    continue
                if any(value is None or str(value).strip()=='' for value in (raw_key,raw_value,raw_period)):
                    raise ValueError('Incomplete source row: '+str(row))
                value=Decimal(str(raw_value))
                if not value.is_finite():
                    raise ValueError('Non-finite source value')
                period=str(raw_period)
                if query.get('period') and period!=str(query['period']):
                    continue
                key=LogicalKey(query['target_region'],str(raw_key),query['metric_id'],period,
                               query['value_kind'],source['unit'])
                table.add_fact(FactRecord(key,value,source['unit'],period,source.get('as_of') or default_as_of,
                                         query['source_id'],row,ws.cell(row,bound['value_field']).coordinate,
                                         f"ev_{query['source_id']}_{raw_key}_{period}"))
        except Exception as exc:
            issues.append(str(exc))
        finally:
            if workbook:
                workbook.close()
    cardinality=table.check_cardinality_against_bindings([])
    issues.extend(cardinality.errors)
    return table,issues
