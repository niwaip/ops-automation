"""XLSX task routing and workflow management.

Selects the native OOXML in-place mutation and translation engine for existing
Excel workbooks to preserve dropdown lists (data validations),
conditional formattings, formulas, freeze panes, styles, and dimensions.
"""

from pathlib import Path
import re
from typing import Any, List, Optional


def is_xlsx_in_place_transform_task(prompt: str, skill: Any, files: Optional[List[str]] = None) -> bool:
    """Determines whether an Excel/XLSX task is an in-place transformation (e.g. document translation,
    format preservation modification) on an existing spreadsheet workbook.
    Routes to the native OOXML stream replacement engine rather than scratch Workbook() recreation.
    """
    files = files or []
    source_fmts = getattr(skill, 'source_formats', None) or [Path(f).suffix.lower() for f in files]
    has_input_xlsx = any(fmt in ('.xlsx', '.xlsm', '.xls') for fmt in source_fmts)
    if not has_input_xlsx:
        if not re.search(r'\.(?:xlsx?|xlsm)\b', prompt, re.I):
            return False

    req = prompt.split('用户指令：')[-1].lower()
    contract = getattr(skill, 'task_contract', None) or {}
    requirements = contract.get('requirements') or []
    quotes = ' '.join(r.get('quote', '').lower() for r in requirements)
    combined_text = f"{req} {quotes}"

    in_place_signals = (
        '保持格式', '保持原格式', '保留格式', '格式不变', '原版式',
        '翻译', '变成日语', '变成英语', '变成中文', '变成日文', '变成英文',
        '转成日语', '转成英语', '转成中文', '转成日文', '转成英文',
        '生成中文', '生成日文', '生成英文', '生成日语', '生成英语',
        'translate', 'translation', 'format preservation', 'in-place'
    )
    return any(sig in combined_text for sig in in_place_signals)


XLSX_IN_PLACE_TRANSLATE_INSTRUCTION = """
【已有 Excel 翻译执行规范】
保留原工作簿结构，使用已安装的原生翻译引擎，不能新建空工作簿逐格搬运。
整本 XLSX 翻译由运行时固定工作流负责，不需要自由文本规划。
备用命令：python3 /opt/dsh/skills/xlsx/scripts/ooxml_xlsx_translate.py auto <输入.xlsx> <输出.xlsx> --lang <目标语言> --no-recalc
引擎覆盖单元格、富文本段、工作表名称、下拉选项、可编辑图形和批注文本，
并同步公式的工作表引用与文本判定常量。图片内文字保留原样。
译文与原生结构验收通过后才能发布；失败保留检查点，不能返回旧文件冒充本轮结果。
保留原生部件及缓存，设置 Excel 打开时重算；不能把文件生成说成原生计算引擎验证通过。
回复简明说明完成状态、实际文件名和已执行的核验，按真实证据说明限制。
不能声称未经验证的“100%保真”“公式已生效”或“全文翻译准确”。
"""
