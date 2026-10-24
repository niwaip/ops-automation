"""
Workbook capability probing and baseline error extraction.
Detects complex unsupported features (macros, external links, dynamic arrays)
and computes baseline formula error fingerprints for historical isolation.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Any, List, Set, Tuple, Union, Optional
import zipfile
import hashlib
import xml.etree.ElementTree as ET
import re

from ..workbook_calculation import EXCEL_ERRORS, _get_local_tag

UNSUPPORTED_FORMULA_FUNCS: Set[str] = {
    "INDIRECT",
    "OFFSET",
    "_xlfn.ANCHORARRAY",
    "_xlfn.LAMBDA",
}


@dataclass
class BaselineErrorFingerprint:
    sheet_name: str
    coordinate: str
    error_type: str
    formula: Optional[str] = None
    fingerprint_hash: str = ""

    def __post_init__(self):
        norm = f"{self.sheet_name}!{self.coordinate}:{self.error_type}:{self.formula or ''}"
        self.fingerprint_hash = hashlib.sha256(norm.encode('utf-8')).hexdigest()[:16]


@dataclass
class WorkbookCapabilityReport:
    file_path: str
    file_hash: str
    is_supported: bool
    unsupported_features: List[str] = field(default_factory=list)
    sheet_names: List[str] = field(default_factory=list)
    has_macros: bool = False
    has_external_links: bool = False
    has_pivot_tables: bool = False
    has_dynamic_arrays: bool = False
    baseline_errors: List[BaselineErrorFingerprint] = field(default_factory=list)


def probe_workbook_capabilities(file_path: Union[str, Path]) -> WorkbookCapabilityReport:
    """
    Inspects workbook archive for complex OOXML features and baseline errors.
    Returns structured report rejecting templates requiring unverified fidelity guarantees.
    """
    p = Path(file_path).resolve()
    if not p.exists() or not zipfile.is_zipfile(p):
        return WorkbookCapabilityReport(
            file_path=str(p),
            file_hash="",
            is_supported=False,
            unsupported_features=["invalid_or_missing_xlsx"]
        )

    file_bytes = p.read_bytes()
    file_hash = hashlib.sha256(file_bytes).hexdigest()

    unsupported: List[str] = []
    sheet_names: List[str] = []
    has_macros = False
    has_ext_links = False
    has_pivots = False
    has_dyn_arrays = False
    baseline_errors: List[BaselineErrorFingerprint] = []

    try:
        with zipfile.ZipFile(p, "r") as z:
            names = set(z.namelist())

            # 1. Macro detection
            if any(n.endswith("vbaProject.bin") for n in names) or p.suffix.lower() == ".xlsm":
                has_macros = True
                unsupported.append("vba_macro_present")

            # 2. External links detection
            if any(n.startswith("xl/externalLinks/") for n in names):
                has_ext_links = True
                unsupported.append("external_workbook_links")

            # 3. Pivot tables detection
            if any(n.startswith("xl/pivotTables/") for n in names):
                has_pivots = True
                unsupported.append("pivot_tables_present")

            # 4. Sheet names resolution from workbook.xml and workbook.xml.rels
            wb_xml_name = "xl/workbook.xml"
            sheet_id_to_name: Dict[str, str] = {}
            if wb_xml_name in names:
                wb_root = ET.fromstring(z.read(wb_xml_name))
                for sheet_elem in wb_root.iter():
                    if _get_local_tag(sheet_elem.tag) == "sheet":
                        s_name = sheet_elem.attrib.get("name", "")
                        r_id = sheet_elem.attrib.get(
                            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id", ""
                        )
                        if s_name:
                            sheet_names.append(s_name)
                            if r_id:
                                sheet_id_to_name[r_id] = s_name

            sheet_path_to_name: Dict[str, str] = {}
            wb_rels_name = "xl/_rels/workbook.xml.rels"
            if wb_rels_name in names:
                try:
                    rels_root = ET.fromstring(z.read(wb_rels_name))
                    for rel_elem in rels_root.iter():
                        if _get_local_tag(rel_elem.tag) == "Relationship":
                            r_id = rel_elem.attrib.get("Id", "")
                            target = rel_elem.attrib.get("Target", "")
                            if r_id in sheet_id_to_name and target:
                                clean_t = target.replace("\\", "/").lstrip("/")
                                if clean_t.startswith("xl/"):
                                    clean_t = clean_t[3:]
                                sheet_path_to_name[clean_t] = sheet_id_to_name[r_id]
                except Exception:
                    pass

            # 5. Worksheet scan for unsupported formula patterns and error baseline
            sheet_files = [n for n in names if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")]
            for sf in sheet_files:
                sf_path = Path(sf)
                clean_sf = sf.lstrip("/")
                if clean_sf.startswith("xl/"):
                    clean_sf = clean_sf[3:]
                matched_name = sheet_path_to_name.get(clean_sf, sf_path.stem)
                # Check worksheet content
                try:
                    s_root = ET.fromstring(z.read(sf))
                except Exception:
                    continue

                for elem in s_root.iter():
                    if _get_local_tag(elem.tag) == "c":
                        coord = elem.attrib.get("r", "")
                        cell_type = elem.attrib.get("t", "")
                        f_text = None
                        v_text = None

                        for child in elem:
                            local = _get_local_tag(child.tag)
                            if local == "f" and child.text:
                                f_text = child.text.strip()
                            elif local == "v" and child.text:
                                v_text = child.text.strip()

                        # Check formula functions
                        if f_text:
                            for func in UNSUPPORTED_FORMULA_FUNCS:
                                if func in f_text.upper():
                                    has_dyn_arrays = True
                                    unsupported.append(f"unsupported_formula_function_{func}")

                        # Check cell error
                        if (cell_type == "e" or v_text in EXCEL_ERRORS) and v_text:
                            baseline_errors.append(
                                BaselineErrorFingerprint(
                                    sheet_name=matched_name,
                                    coordinate=coord,
                                    error_type=v_text,
                                    formula=f_text
                                )
                            )

    except Exception as e:
        return WorkbookCapabilityReport(
            file_path=str(p),
            file_hash=file_hash,
            is_supported=False,
            unsupported_features=[f"parsing_error_{type(e).__name__}"]
        )

    dedup_unsupported = sorted(list(set(unsupported)))
    return WorkbookCapabilityReport(
        file_path=str(p),
        file_hash=file_hash,
        is_supported=len(dedup_unsupported) == 0,
        unsupported_features=dedup_unsupported,
        sheet_names=sheet_names,
        has_macros=has_macros,
        has_external_links=has_ext_links,
        has_pivot_tables=has_pivots,
        has_dynamic_arrays=has_dyn_arrays,
        baseline_errors=baseline_errors
    )


def get_baseline_formula_errors(file_path: Union[str, Path]) -> List[BaselineErrorFingerprint]:
    """Shortcut to extract baseline formula error fingerprints."""
    report = probe_workbook_capabilities(file_path)
    return report.baseline_errors
