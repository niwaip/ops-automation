"""DOCX task routing and workflow management.

Selects the high-aesthetic DOCX renderer for document generation,
while allowing bash/script execution for specialized low-level tasks
(e.g., modifying existing files, XML track changes, template substitution).
"""

from pathlib import Path
import re
from typing import Any, List, Optional


def is_docx_in_place_transform_task(prompt: str, skill: Any, files: Optional[List[str]] = None) -> bool:
    """Determines whether a DOCX task is an in-place transformation (e.g. document translation,
    format preservation modification) on an existing Word document.
    Routes to the native OOXML stream replacement engine rather than Pandoc/render_docx or scratch Document().
    """
    files = files or []
    source_fmts = getattr(skill, 'source_formats', None) or [Path(f).suffix.lower() for f in files]
    has_input_docx = any(fmt in ('.docx', '.doc') for fmt in source_fmts)
    if not has_input_docx:
        if not re.search(r'\.(?:docx?)\b', prompt, re.I):
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
        'translate', 'translation', 'format preservation', 'in-place'
    )
    return any(sig in combined_text for sig in in_place_signals)


def is_retrieval_docx_task(skill: Any) -> bool:
    """Live retrieval task leading to a DOCX document deliverable.
    External web search or retrieval is performed during planning,
    and document rendering is delegated to render_docx rather than bash scripts.
    """
    targets = getattr(skill, 'deliverables', None) or []
    has_docx_deliv = any(str(item).lower().endswith('.docx') for item in targets)
    is_docx_id = getattr(skill, 'skill_id', None) == 'docx' or getattr(skill, 'is_docx_intent', False)

    return (
        (is_docx_id or has_docx_deliv)
        and getattr(skill, 'is_generate_intent', False)
        and (getattr(skill, 'is_search_intent', False) or getattr(skill, 'is_research_intent', False))
        and not getattr(skill, 'is_modify_intent', False)
        and not getattr(skill, 'source_formats', None)
        and all(str(item).lower().endswith(('.docx', '.md')) for item in targets)
    )


def is_template_docx_task(prompt: str, skill: Any) -> bool:
    """Determines whether a DOCX task is a self-contained document authoring task
    that can take the owned render_docx path without external search or custom python scripts.
    """
    targets = getattr(skill, 'deliverables', None) or []
    has_docx_deliv = any(str(item).lower().endswith('.docx') for item in targets)
    is_docx_id = getattr(skill, 'skill_id', None) == 'docx' or getattr(skill, 'is_docx_intent', False)

    if not ((is_docx_id or has_docx_deliv) and getattr(skill, 'is_generate_intent', False)):
        return False

    # Tasks needing open-domain search, live research or modification belong to the full agent loop
    if (getattr(skill, 'is_research_intent', False)
            or getattr(skill, 'is_search_intent', False)
            or getattr(skill, 'is_modify_intent', False)):
        return False

    from .skill_router import is_text_only_request
    if is_text_only_request(prompt):
        return False

    if getattr(skill, 'source_formats', None):
        return False

    # Check semantic task requirements from task_contract / admission or prompt
    analysis_cues = (
        '核算', '税额', '折旧', '现金流', '更新预测', '对比分析', '复合', '多步'
    )
    if any(cue in prompt for cue in analysis_cues):
        return False

    admission = getattr(skill, 'admission', None) or {}
    contract = getattr(skill, 'task_contract', None) or admission.get('task_contract') or {}
    requirements = contract.get('requirements') or []
    for req in requirements:
        quote = req.get('quote', '')
        if any(act in quote for act in (
            '查看', '搜索', '搜一下', '了解', '调研', '查一下', '爬取',
            '统计', '计算', '核算', '分析', '对比', '读取', '基于', '汇总',
            '热点', '热搜', '榜单', '新闻', '资讯', '行情', '价格'
        )):
            return False

    # Dynamic temporal cues in prompt that imply web search is needed
    dynamic_temporal_cues = (
        '今天', '今日', '本周', '本月', '实时', '热点', '热搜', '榜单',
        '新闻', '资讯', '行情', '价格', '走势', '搜一下', '查一下'
    )
    if any(cue in prompt for cue in dynamic_temporal_cues):
        return False

    # Operation cues requiring low-level scripts (e.g. modifying existing docx, track changes, XML surgery)
    operation_cues = (
        '修订', '批注', 'track changes', 'python-docx', 'xml', '解包',
        '替换占位符', '合并', '拆分', '解密', '加密', '转成', '转为'
    )
    if any(op in prompt.lower() for op in operation_cues):
        return False

    if re.search(r'当前轮次用户上传附件|当前会话有效附件清单|\.(?:docx?|xlsx?|csv|pptx?)\b|(?:基于|读取|根据).{0,60}\.docx', prompt, re.I):
        return False

    named_docx = {str(t).rsplit('/', 1)[-1] for t in targets
                  if not str(t).startswith('.') and str(t).lower().endswith('.docx')}
    if len(named_docx) > 1:
        return False

    return all(str(t).lower().endswith(('.docx', '.md')) for t in targets)


DOCX_EDITORIAL_INSTRUCTION = """
【Word 文档排版规范】：
1. 结构化层次：使用清晰的 Markdown 标题分级（# 一级大标题、## 二级章节、### 三级小节），避免跨级跳跃。
2. 视觉排版元素：
   - 重点提示与注意点：必须使用标准 Callout 语法，例如 `> [!NOTE]`（说明提示）、`> [!TIP]`（操作建议）、`> [!WARNING]`（安全警告），底层引擎将自动渲染为带有双语字体、彩色强调左边框和浅底色的专业提示块。
   - 结构化对比/步骤参数：使用清晰的 Markdown 表格（| 列1 | 列2 |），底层将自动应用主题表头、斑马纹隔行交替底色及专业内边距。
   - 代码与命令：必须使用三反引号标注代码块（如 ```bash 或 ```python），保留语法缩进。
3. 严禁使用 bash 或自行编写 python 脚本生成 docx，必须直接调用 `render_docx` 工具一次性完成高质量排版与落盘。
"""

DOCX_EXECUTION_INSTRUCTION = """
【DOCX 生成执行】：使用 `render_docx` 工具提交完整 markdown 正文及目标 output_path（如 /workspace/<文件名>.docx）。
排版引擎负责企业级主题、双语字体（微软雅黑/Calibri）、行间距、表格、代码块及预览图生成，不需编写底层 python-docx 脚本。
""" + DOCX_EDITORIAL_INSTRUCTION


DOCX_IN_PLACE_TRANSLATE_INSTRUCTION = """
【DOCX 原地无损翻译与版式保留执行规范】：
1. 检测到输入为既有 Word 文档，且任务要求【保持格式不变 / 翻译 / 原地转换】。
2. ⚠️ 严禁使用 `python-docx` 的 `Document()` 从头新建文档！
   从头新建会彻底损坏原文档的页面设置（A4/Letter）、精确边距、动态页脚页码（footer1/2.xml 域代码）、字体和样式树。
3. ✅ 必须通过 bash 调用已验证的原生 OOXML 原地流式翻译引擎：
   python3 /opt/dsh/skills/docx/scripts/ooxml_docx_translate.py auto <输入文件.docx> <输出文件.docx> --target-lang <ja|en|zh|ko...>
   该引擎在 XML Text 节点执行合并与流式翻译，100% 保持 ECMA-376 架构、页面边距、表格与动态页脚。
4. 交付总结规范（面向用户的四段式业务交付，篇幅严格控制在 200~300 字以内）：
   - 🚫 红线禁令：
     * 严禁输出“关键术语对照字典”或罗列术语对照表（用户需要的是业务成果说明，不是字典！）；
     * 严禁全文倾泻长篇协议全文或长表格；
     * 严禁输出测试员暗语与工程黑话（如 Runs整合 / document.xml / OOXML / XML级注入 / 原生节点等）；
     * 严禁向客户汇报内部处理数字（如“共 21 处”、“89 处整合”）；
     * 严禁泄露容器路径：严禁在回复中直接展示 /workspace/ 等内部沙箱物理路径；
   - ✅ 标准业务交付结构：
     1. ✅ 任务完成状态（1 句话）：明确告知 Word 文档已完成高保真本地化；
     2. 📋 主要处理内容（2~3 句话）：清晰概述翻译处理的章节范围（如前言、各正式条款、表格与签署栏已全部地道转换）；
     3. 📦 交付成果物（2~3 句话）：说明生成的 Word 文件名称，确认原文档的纸张规格、版心边距、动态页脚页码及表格排版已 100% 完整保留；
     4. 💡 提示与使用建议（1~2 句话）：温和提示用户可直接点击下方文件卡片一键下载查阅，特定内部简称可直接在 Word 中微调。
"""
