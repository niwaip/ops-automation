"""XLSX task routing and workflow management.

Selects the native OOXML in-place mutation and translation engine for existing
Excel workbooks to guarantee 100% preservation of dropdown lists (data validations),
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
【Excel/XLSX 原地无损翻译与版式保留执行规范】：
1. 检测到输入为既有 Excel 工作簿，且任务要求【保持格式不变 / 翻译 / 原地转换】。
2. ⚠️ 重大红线：严禁使用 `openpyxl.Workbook()` 从头新建空白工作簿并手动拷贝单元格！
   从头新建会导致原工作簿的以下底层 OOXML 结构 100% 丢失：
   - 数据验证下拉框 (ws.data_validations): 所有下拉选项与输入规则全部丢失；
   - 条件格式 (ws.conditional_formatting): 所有动态高亮与预设颜色丢失；
   - 视图与冻结窗格 (freeze_panes): 表头锁定丢失；
   - 复杂样式、行高、列宽与主题配置全部丢失。
3. ✅ 必须通过 bash 直接调用已验证的原生 OOXML 原地流式翻译引擎（严禁自行编写 Python 脚本遍历或修改单元格）：
   python3 /opt/dsh/skills/xlsx/scripts/ooxml_xlsx_translate.py auto <输入文件.xlsx> <输出文件.xlsx> --lang <zh-CN|ja-JP|en-US...>
   该引擎直接操作 xl/sharedStrings.xml、xl/workbook.xml 与工作表数据验证，100% 保持单元格坐标、样式、公式、条件格式与下拉验证，并自动运行 recalc.py 刷新公式缓存。一键闭环完成。
4. 交付总结规范（面向用户的四段式业务交付，篇幅控制在 200~300 字以内）：
   - ✅ 任务完成状态（1 句话）：明确告知用户 Excel 电子表格已成功完成高质量本地化；
   - 📋 主要处理内容（2~3 句话）：清晰概述翻译覆盖的业务模块与数据范围（例如：完整翻译了表头说明、各清单明细条目、选项判定规则及汇总统计区域）；
   - 📦 交付成果物（2~3 句话）：说明生成的 Excel 文件名称，确认原表格的数据验证下拉选择框、条件格式动态高亮规则与计算公式已 100% 完整保留并生效；
   - 💡 提示与使用建议（1~2 句话）：温和提示用户可直接点击下方文件卡片一键下载查阅，如有专属简称可在 Excel 中灵活微调；
   - 🚫 客户交互红线禁令：
     * 严禁输出“关键术语对照字典”或罗列“词汇A -> 词汇B”对照列表（用户需要的是业务交付成果说明，不是字典！）；
     * 严禁向客户暴露任何底层技术术语，如“OOXML”、“XML 级注入”、“sharedStrings”、“LibreOffice”等；
     * 严禁向客户汇报内部执行统计数字（如“全量 140 处”、“104 处去重”）；
     * 严禁在回复中泄露 /workspace/ 等内部容器物理路径，用户界面会自动挂载生成的文件卡片。
"""
