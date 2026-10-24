"""
Typed logical keys, dimensional binding coordinates, and cell mappings for WorkbookIR.
Prevents unescaped string concatenation and distinguishes duplicate codes across distinct regions.
"""

from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Tuple, Set


@dataclass(frozen=True)
class LogicalKey:
    """
    Immutable typed 6-tuple uniquely identifying a measurable business fact.
    The same business key remains distinct across regions, metrics and periods.
    """
    region_id: str
    department_code: str
    metric_id: str
    period: str
    value_kind: str
    unit: str

    def as_tuple(self) -> Tuple[str, str, str, str, str, str]:
        return (
            self.region_id,
            self.department_code,
            self.metric_id,
            self.period,
            self.value_kind,
            self.unit,
        )

    def to_key_string(self) -> str:
        return f"{self.region_id}::{self.department_code}::{self.metric_id}::{self.period}::{self.value_kind}::{self.unit}"


@dataclass
class CellBinding:
    logical_key: LogicalKey
    sheet_name: str
    coordinate: str
    is_formula: bool = False
    existing_formula: Optional[str] = None
    is_protected: bool = False


class BindingRegistry:
    """Registry maintaining bidirectional mapping between LogicalKeys and sheet cell coordinates."""

    def __init__(self):
        self._key_to_binding: Dict[LogicalKey, CellBinding] = {}
        self._coord_to_key: Dict[Tuple[str, str], LogicalKey] = {}

    def register(self, binding: CellBinding):
        self._key_to_binding[binding.logical_key] = binding
        self._coord_to_key[(binding.sheet_name, binding.coordinate.upper())] = binding.logical_key

    def get_by_key(self, key: LogicalKey) -> Optional[CellBinding]:
        return self._key_to_binding.get(key)

    def get_by_coordinate(self, sheet_name: str, coordinate: str) -> Optional[LogicalKey]:
        return self._coord_to_key.get((sheet_name, coordinate.upper()))

    def all_bindings(self) -> List[CellBinding]:
        return list(self._key_to_binding.values())

    def bound_coordinates(self, sheet_name: str) -> Set[str]:
        return {coord for (s, coord) in self._coord_to_key.keys() if s == sheet_name}
