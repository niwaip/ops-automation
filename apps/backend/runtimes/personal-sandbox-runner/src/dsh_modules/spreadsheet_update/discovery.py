"""
Structure discovery and WorkbookIR extraction for multi-region spreadsheets.
Constructs typed BusinessRegions with bounding boxes, header paths, and coordinate resolution.
Resilient to row/column reordering.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Set, Union
import openpyxl
from openpyxl.utils import get_column_letter, range_boundaries

from .bindings import LogicalKey, CellBinding, BindingRegistry


@dataclass
class BusinessRegion:
    region_id: str
    title: str
    sheet_name: str
    bounding_box: Tuple[int, int, int, int]  # min_row, min_col, max_row, max_col
    header_row: int
    key_column: int  # e.g. Column with department code
    metric_id: str
    unit: str
    period_to_col: Dict[str, int] = field(default_factory=dict)
    dept_code_to_row: Dict[str, int] = field(default_factory=dict)
    formula_cells: Set[str] = field(default_factory=set)
    input_cells: Set[str] = field(default_factory=set)


@dataclass
class WorkbookIR:
    file_path: str
    file_hash: str
    sheet_name: str
    regions: List[BusinessRegion] = field(default_factory=list)
    registry: BindingRegistry = field(default_factory=BindingRegistry)
    all_formula_cells: Set[str] = field(default_factory=set)
    all_budget_cells: Set[str] = field(default_factory=set)

    def find_region(self, region_id: str) -> Optional[BusinessRegion]:
        for r in self.regions:
            if r.region_id == region_id:
                return r
        return None


def extract_workbook_ir(
    file_path: Union[str, Path],
    sheet_name: str,
    region_specs: Optional[List[Dict[str, Any]]] = None,
    declared_region_ids: Optional[Set[str]] = None,
    declared_metric_ids: Optional[Set[str]] = None
) -> WorkbookIR:
    """
    Extracts structural regions from the specified worksheet and establishes
    resilient bindings between typed LogicalKeys and actual coordinates.
    """
    wb = openpyxl.load_workbook(file_path, data_only=False)
    if sheet_name not in wb.sheetnames:
        raise ValueError(f"Sheet '{sheet_name}' not found in workbook {file_path}")

    ws = wb[sheet_name]
    ir = WorkbookIR(
        file_path=str(file_path),
        file_hash="",
        sheet_name=sheet_name,
    )

    max_r = ws.max_row or 1
    max_c = ws.max_column or 1

    try:
        for row in ws:
            for cell in row:
                if cell.data_type == 'f':
                    ir.all_formula_cells.add(cell.coordinate)
        for spec in region_specs or []:
            required = {'region_id','header_row','key_col','min_row','max_row','min_col','max_col',
                        'metric_id','unit','value_kind','period_columns','department_rows'}
            if required - spec.keys():
                raise ValueError('Explicit verified region binding required: ' + ', '.join(sorted(required-spec.keys())))
            if not spec['unit'] or not spec['metric_id'] or not spec['value_kind']:
                raise ValueError('Unit, metric and value kind cannot be inferred from defaults')
            region = BusinessRegion(spec['region_id'], spec.get('title', spec['region_id']), sheet_name,
                                    (spec['min_row'],spec['min_col'],spec['max_row'],spec['max_col']),
                                    spec['header_row'],spec['key_col'],spec['metric_id'],spec['unit'],
                                    {str(p):int(c) for p,c in spec['period_columns'].items()},
                                    dict(spec['department_rows']))
            for key_text, row_index in region.dept_code_to_row.items():
                actual = ws.cell(row_index,region.key_column).value
                if str(actual).strip() != str(key_text):
                    raise ValueError('Region key no longer matches actual worksheet')
                for period,col_index in region.period_to_col.items():
                    cell=ws.cell(row_index,col_index)
                    key=LogicalKey(region.region_id,key_text,region.metric_id,period,spec['value_kind'],region.unit)
                    is_formula=cell.coordinate in ir.all_formula_cells
                    ir.registry.register(CellBinding(key,sheet_name,cell.coordinate,is_formula,
                                                     str(cell.value) if is_formula else None))
                    (region.formula_cells if is_formula else region.input_cells).add(cell.coordinate)
            for coordinate in spec.get('protected_coordinates', []):
                ir.all_budget_cells.add(coordinate)
            ir.regions.append(region)
        return ir
    finally:
        wb.close()
