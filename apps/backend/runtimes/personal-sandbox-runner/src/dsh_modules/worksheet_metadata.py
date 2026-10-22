"""Coordinate metadata shared by normal and streaming worksheet readers."""

from openpyxl.utils import get_column_letter


def worksheet_dimensions(worksheet):
    """Never fabricate A1:A1 when a streaming sheet has no dimensions property.

    The OOXML used range is structural metadata, not proof of populated cells.
    Missing producer metadata may require openpyxl's streaming size calculation.
    """
    dimension = getattr(worksheet, "dimensions", None)
    if dimension:
        return dimension
    calculate = getattr(worksheet, "calculate_dimension", None)
    if calculate:
        try:
            dim = calculate()
        except (ValueError, UnboundLocalError):
            try:
                dim = calculate(force=True)
            except Exception:
                dim = None
        # Handle streaming worksheets where export tools (POI, SAP, etc.) generated
        # inaccurate/default <dimension ref="A1"/> metadata despite having real rows.
        if (dim in ("A1:A1", "A1", None) or (worksheet.max_row == 1 and worksheet.max_column == 1)) and hasattr(worksheet, "_calculate_dimension"):
            orig_r, orig_c = getattr(worksheet, "_max_row", None), getattr(worksheet, "_max_column", None)
            worksheet._max_row = None
            worksheet._max_column = None
            try:
                dim = calculate(force=True)
            except Exception:
                worksheet._max_row, worksheet._max_column = orig_r, orig_c
        return dim or "未知范围"
    rows, columns = worksheet.max_row, worksheet.max_column
    return f"A1:{get_column_letter(columns)}{rows}" if rows and columns else "未知范围"
