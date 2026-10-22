"""
Task Intent & Request Contract Parser for DeepSeek Harness (dsh).

Provides structured extraction of:
1. Primary user action (read/inspect, create/generate, modify/edit, convert, search, send)
2. Decoupled input source files (source_files) vs requested output deliverables (target_outputs)
3. Clause-bounded and transition-breaking negative constraints (forbidden_formats, forbidden_network)
4. Multi-turn task contract inheritance
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple


@dataclass
class TaskIntentContract:
    """Normalized structured contract extracted from user request and history."""
    action: str = "read"  # 'read', 'create', 'modify', 'convert', 'search', 'qa'
    is_generate_intent: bool = False
    is_inspect_intent: bool = False
    is_modify_intent: bool = False
    is_send_intent: bool = False
    is_search_intent: bool = False
    is_research_intent: bool = False
    is_text_only: bool = False
    source_files: List[str] = field(default_factory=list)
    target_formats: List[str] = field(default_factory=list)
    target_files: List[str] = field(default_factory=list)
    forbidden_formats: Set[str] = field(default_factory=set)
    forbidden_network: bool = False


DELIVERABLE_TERM_SYNONYMS = {
    "pptx": ["pptx", "ppt", "slides", "幻灯片", "演示文稿"],
    "ppt": ["pptx", "ppt", "slides", "幻灯片", "演示文稿"],
    "docx": ["docx", "word", "文档"],
    "doc": ["doc", "旧格式.doc"],
    "word": ["docx", "doc", "word", "文档"],
    "xlsx": ["xlsx", "xls", "excel", "表格", "工作簿"],
    "xls": ["xls", "旧格式.xls"],
    "excel": ["xlsx", "xls", "excel", "表格", "工作簿"],
    "html": ["html", "htm", "网页", "页面", "单页"],
    "htm": ["html", "htm", "网页", "页面", "单页"],
    "pdf": ["pdf"],
    "md": ["md", "markdown"],
    "markdown": ["md", "markdown"],
    "csv": ["csv"],
    "json": ["json"],
}

NEG_PREFIX = r'(?:不要|严禁|无需|不用|不需要|不需|禁止|切勿|免于|免做|不生成|不要生成|不要制作|不要导出|不要做|不提供|不输出|不下载|不用下载|无需下载|不含|不包含|不包括|不带|(?<![识辨区告类级各分特])别)'
VERB_OPT = r'(?:\s*(?:生成|制作|下载|导出|创建|输出|做|提供|落盘|包含|包括))?'
MOD_OPT = r'(?:\s*(?:任何|多余的|其他的|另外的|额外的|旧格式))?'
TRANSITION_BREAKERS = r'(?:而是|改为|改用|只要|换成|转而|但|但是|且只)'


def is_term_negated(query: str, term: str) -> bool:
    """Checks whether a deliverable term (e.g. ppt, html, excel, doc) is negated.

    Strictly honors contrastive transitions ('而是', '改用', '改为', '只要') to prevent scope spillover.
    Decouples exact extensions (e.g. '.doc') from broader families (e.g. '.docx').
    """
    if not query or not term:
        return False
    lower = query.lower()
    t_clean = term.lower().strip().lstrip(".")
    if len(t_clean) < 2:
        return False

    # 精确扩展名与宽泛格式族解耦
    if t_clean in ("pptx", "ppt"):
        candidates = ["pptx", ".pptx", "ppt", ".ppt", "slides", "幻灯片", "演示文稿"]
    elif t_clean == "docx":
        candidates = ["docx", ".docx", "word", "文档"]
    elif t_clean == "doc":
        candidates = ["doc", ".doc", "旧格式.doc"]
    elif t_clean in ("xlsx", "excel"):
        candidates = ["xlsx", ".xlsx", "excel", "表格", "工作簿"]
    elif t_clean in ("xls", "旧格式.xls"):
        candidates = ["xls", ".xls", "旧格式.xls"]
    elif t_clean in ("html", "htm"):
        candidates = ["html", ".html", "htm", ".htm", "网页", "页面", "单页"]
    elif t_clean in ("md", "markdown"):
        candidates = ["md", ".md", "markdown"]
    elif t_clean == "pdf":
        candidates = ["pdf", ".pdf"]
    elif t_clean == "csv":
        candidates = ["csv", ".csv"]
    elif t_clean == "json":
        candidates = ["json", ".json"]
    else:
        candidates = DELIVERABLE_TERM_SYNONYMS.get(t_clean, [t_clean])

    pattern = rf'{NEG_PREFIX}{VERB_OPT}{MOD_OPT}\s*([^，。！？；;,\n]+)'
    matches = re.findall(pattern, lower)
    non_deliverable_verbs_re = re.compile(r'^(?:覆盖|破坏|删除|移除|修改|更改|调整|变更|重命名|改动|运行|执行|调用|编辑|触碰|动)')

    for clause in matches:
        # 转折连词截断：否定范围决不能穿透到'而是'、'改用'、'改为'、'只要'等正向从句
        clause_scoped = re.split(TRANSITION_BREAKERS, clause)[0].strip()
        if not clause_scoped:
            continue
        if non_deliverable_verbs_re.search(clause_scoped):
            continue
        for cand in candidates:
            cand_pat = rf'(?<![a-zA-Z0-9]){re.escape(cand)}(?![a-zA-Z0-9])' if cand.isascii() else re.escape(cand)
            if re.search(cand_pat, clause_scoped, re.I):
                return True
    return False


def is_network_search_forbidden(query: str) -> bool:
    """Checks if the user explicitly requested not to search the network."""
    if not query:
        return False
    p = query.lower()
    network_neg_patterns = [
        r'(?:不要|无需|严禁|不用|禁止|切勿|别|不)\s*(?:联网|搜索网络|网络搜索|上网|联网查询|调用搜索|发起搜索|查网|搜索)',
    ]
    return any(bool(re.search(pat, p)) for pat in network_neg_patterns) or is_term_negated(p, "联网") or is_term_negated(p, "搜索")


def is_send_intent_requested(query: str, send_patterns: List[str]) -> bool:
    """Checks whether file sending is explicitly requested, filtering out negative directives."""
    if not query or not send_patterns:
        return False
    p = query.lower()
    for pat in send_patterns:
        if pat.lower() in p:
            # 校验该发送模式是否被否定（例如：“不要通过微信发送” 或 “不要把文件发送到微信”）
            neg_pat = rf'{NEG_PREFIX}\s*(?:通过|把[^，。！？；;\n]+(?:通过)?|将[^，。！？；;\n]+(?:通过)?)?\s*{re.escape(pat.lower())}'
            if re.search(neg_pat, p):
                continue
            return True
    return False


def is_modify_intent_requested(query: str, attached_files: Optional[List[str]] = None) -> bool:
    """Checks if the request is to modify/update an existing file or cell content."""
    if not query:
        return False
    p = query.lower()
    neg_modify_pattern = rf'(?:{NEG_PREFIX}|(?<![得可并不])不|别)\s*(?:去|对|把|将|在)?\s*[^，。！？；;\n]*(?:修改|改动|改|替换|变更|更新|调整)'
    # 明确的字段修改、换值、局部替换
    modify_patterns = [
        r'(?<![核比校结参相对])(?:把|将|对)[^，。！？；;\n]*(?:改|换成|替换|变更|更新|调整)',
        r'(?:将|把)[^，。！？；;\n]*(?:早班|晚班|班次|人员|负责人|李师傅|王师傅|预算|金额|数值|内容|字段|时间|日期)[^，。！？；;\n]*(?:换成|改为|替换为|改成)',
        r'(?:换成|改为|替换为|更新为|改成)[^，。！？；;\n]*(?:早班|晚班|班次|人员|负责人|李师傅|王师傅|\d+)',
        r'(?:仅|只)?(?:修改|替换|改动|变更|调整)[^，。！？；;\n]*内容',
    ]
    clauses = re.split(r'[，。！？；;\n]+', p)
    has_positive = False
    has_negative = False
    for c in clauses:
        c = c.strip()
        if not c:
            continue
        if re.search(neg_modify_pattern, c):
            has_negative = True
            continue
        if any(bool(re.search(pat, c)) for pat in modify_patterns):
            has_positive = True

    if has_negative and not has_positive:
        return False
    if has_positive:
        return True
    if has_negative:
        return False
    return any(bool(re.search(pat, p)) for pat in modify_patterns)


def mask_file_references(query: str, attached_files: Optional[List[str]] = None) -> Tuple[str, List[str]]:
    """Masks filenames inside quotes and known attachments with <FILE_REF> placeholders.

    Prevents action verbs inside filenames (e.g. '制作说明.docx', '生产日报.xlsx', '交接记录.txt')
    from polluting user action predicate detection.
    """
    masked = query
    extracted_refs = []

    # 1. 提取已知附件
    if attached_files:
        for f in attached_files:
            if f in masked:
                extracted_refs.append(f)
                masked = masked.replace(f, " <FILE_REF> ")

    # 2. 提取带引号的文件名与词组
    quote_pattern = r'[\"“\'‘`「]([^\"”\'’`」]+)[\"”\'’`」]'
    for m in re.finditer(quote_pattern, masked):
        ref_val = m.group(1).strip()
        extracted_refs.append(ref_val)

    masked_no_quotes = re.sub(quote_pattern, " <FILE_REF> ", masked)
    return masked_no_quotes, extracted_refs


def extract_source_and_target_artifacts(
    query: str,
    attached_files: Optional[List[str]] = None,
) -> Tuple[List[str], List[str], List[str]]:
    """Separates input source files from requested output target files/formats.

    Returns:
        (source_files, target_formats, target_files)
    """
    source_files = list(attached_files or [])
    target_formats: List[str] = []
    target_files: List[str] = []

    lower = query.lower()
    INSPECT_SOURCE_PREFIXES = r'(?:读取|基于|根据|来自|从|查看|输入|将|把|上传的|附件|核对|阅读|总结|分析|检查|审阅|提取|抽取|对账|看下|看一下|看看)'

    # 1. 提取所有带引号的文件名并根据前缀分配给 source 或 target
    quoted_matches = list(re.finditer(
        r'[\"“\'‘`「]([^\"”\'’`」]+\.(?:docx?|xlsx?|csv|pdf|txt|md|pptx?|json|sh|sql|py))[\"”\'’`」]',
        query,
        re.I
    ))
    for qm in quoted_matches:
        fn = qm.group(1).strip()
        start = qm.start()
        prefix = query[max(0, start - 20):start].lower()
        ext = "." + fn.rsplit(".", 1)[-1]
        ext_lower = ext.lower()
        if re.search(r"(?:命名为|保存为|另存为|导出为|生成|编写|创建|输出为|名称为)\s*$", prefix):
            is_quoted_src = False
        else:
            is_quoted_src = bool(re.search(rf'{INSPECT_SOURCE_PREFIXES}\s*(?:上传的|附件)?(?:\s*(?:工作表|工作簿|文档|文件|材料|报告|代码|配置|数据))?\s*$', prefix))
        if is_quoted_src:
            if fn not in source_files:
                source_files.append(fn)
        else:
            if not is_term_negated(lower, ext_lower) and not is_term_negated(lower, fn):
                if fn not in target_files:
                    target_files.append(fn)
                if ext_lower not in target_formats:
                    target_formats.append(ext_lower)

    # 2. 按标点与连词切分分句，提取未带引号的源文件与目标文件
    clauses = re.split(r'[，。！？；;,\n]+|(?:并|且|再|然后)', query)
    valid_exts = {".docx", ".doc", ".xlsx", ".xls", ".csv", ".pdf", ".txt", ".md", ".pptx", ".ppt", ".json", ".sh", ".sql", ".py"}

    for c in clauses:
        c_clean = c.strip()
        if not c_clean:
            continue
        for m in re.finditer(r'([a-zA-Z0-9_\-\u4e00-\u9fa5]+)\.([a-zA-Z0-9]+)', c_clean):
            raw_stem = m.group(1)
            ext = "." + m.group(2)
            ext_lower = ext.lower()
            if ext_lower not in valid_exts:
                continue
            # 若该文件名已在带引号集合中，则跳过
            if f'“{raw_stem}{ext}”' in query or f'"{raw_stem}{ext}"' in query:
                continue

            is_src = (
                bool(re.search(rf'^{INSPECT_SOURCE_PREFIXES}', raw_stem))
                or any(k in c_clean for k in ["读取", "基于", "输入", "来自", "核对", "阅读", "总结", "分析", "检查", "审阅", "提取", "抽取", "对账", "查看"])
            )
            # 严格剥离动词与量词修饰前缀（注意：命名引导词必须包含完整词根，严禁将裸“名”或裸“名称”当可剥除前缀，以保留“名单”、“名册”、“名称对照表”等真实文件名）
            action_prefix_pat = (
                r'^(?:只|仅仅|仅|只需|只需生成|只生成|读取|基于|根据|来自|从|查看|输入|将|把|上传的|附件|生成|制作|创建|导出|另存为|保存为|写成|整理并保存为|整理|编成|输出为|转为|转成|只要|要|和|与|及|核对|阅读|总结|分析|检查|审阅|提取|抽取|对账)+'
                r'(?:一份|一个|一张|一套)?(?:可下载的|可下载)?(?:Word|Excel|PPT|PDF|Markdown|HTML|原生)?'
                r'(?:(?:文件名|文件名称|文档名|表格名|报告名)(?:称)?(?:为|叫|是|：|:)?|文件(?:为|叫|是|：|:)|命名(?:为)?|名称(?:为|叫|是|：|:)|名字(?:为|叫|是|：|:))?'
            )
            clean_stem = re.sub(action_prefix_pat, '', raw_stem, flags=re.I).strip()
            # 只有当剥离完动作后，剩余部分以命名引导词开头且还有后续具体实体时（如“文件名方案” -> “方案”），才进一步剥除命名引导词
            if clean_stem and re.match(r'^(?:(?:文件名|文件名称|文档名|表格名|报告名)(?:称)?(?:为|叫|是|：|:)?|文件(?:为|叫|是|：|:)|命名(?:为)?|名称(?:为|叫|是|：|:)|名字(?:为|叫|是|：|:)).+', clean_stem):
                clean_stem = re.sub(r'^(?:(?:文件名|文件名称|文档名|表格名|报告名)(?:称)?(?:为|叫|是|：|:)?|文件(?:为|叫|是|：|:)|命名(?:为)?|名称(?:为|叫|是|：|:)|名字(?:为|叫|是|：|:))+', '', clean_stem).strip()
            clean_stem = clean_stem.lstrip('“"\'`')
            if not clean_stem:
                # 若完全剥除变为空，则回退为剥离纯动作词后的实体
                clean_stem = re.sub(r'^(?:只|仅仅|仅|只需|只需生成|只生成|读取|基于|根据|来自|从|查看|输入|将|把|生成|制作|创建|导出|另存为|保存为|输出为|转为|转成)+', '', raw_stem).strip()
            if not clean_stem:
                continue
            fn = clean_stem + ext
            if is_src:
                if fn not in source_files:
                    source_files.append(fn)
            else:
                if not is_term_negated(lower, ext_lower) and not is_term_negated(lower, fn):
                    if fn not in target_files:
                        target_files.append(fn)
                    if ext_lower not in target_formats:
                        target_formats.append(ext_lower)

    # 3. 针对未带具名文件名但明确要求格式的目标（如“转为可下载PDF文件”、“生成Word文档”、“保存为Markdown文件”）
    masked_for_cues, _ = mask_file_references(lower, attached_files)
    format_cue_mappings = [
        (r'(?:转为|转成|生成|制作|导出|另存为|输出为)[^，。！？；;\n]*(?:pdf|pdf文件|pdf报告)', ".pdf", "pdf"),
        (r'(?:转为|转成|生成|制作|导出|另存为|输出为)[^，。！？；;\n]*(?:word|word文档|docx|doc)', ".docx", "docx"),
        (r'(?:转为|转成|生成|制作|导出|另存为|输出为)[^，。！？；;\n]*(?:excel|excel文件|表格|xlsx|xls)', ".xlsx", "xlsx"),
        (r'(?:转为|转成|生成|制作|导出|另存为|输出为)[^，。！？；;\n]*(?:pptx?|幻灯片|演示文稿)', ".pptx", "pptx"),
        (r'(?:转为|转成|生成|制作|导出|另存为|输出为|保存为)[^，。！？；;\n]*(?:markdown|md文件|markdown文件)', ".md", "md"),
        (r'(?:导出为|保存为|生成)[^，。！？；;\n]*(?:csv|csv文件)', ".csv", "csv"),
        (r'(?:导出为|保存为|生成)[^，。！？；;\n]*(?:json|json文件)', ".json", "json"),
        (r'export[^,\.\n]*(?:as\s+a\s+pdf|to\s+pdf)', ".pdf", "pdf"),
        (r'create[^,\.\n]*(?:word\s+document|\.docx)', ".docx", "docx"),
    ]
    for pat, ext, term in format_cue_mappings:
        if re.search(pat, masked_for_cues, re.I) and not is_term_negated(lower, term):
            if ext not in target_formats:
                target_formats.append(ext)

    # 纯只读/查阅/审阅保护：若用户无正向生成动词，且明确为查阅/总结/核对意图，清空目标产物契约
    # 防止将所查看/核对的文件（如“生产日报.xlsx”、“制作说明.docx”）误作为生成交付物
    from .skill_router import GENERATE_ACTION_PATTERNS, INSPECT_ACTION_PATTERNS, READONLY_SUMMARY_PATTERNS
    has_pos_gen = has_positive_generate_action(query, GENERATE_ACTION_PATTERNS)
    is_pure_inspect = (
        not has_pos_gen
        and (any(k in lower for k in INSPECT_ACTION_PATTERNS) or any(k in lower for k in READONLY_SUMMARY_PATTERNS))
    )
    if is_pure_inspect:
        target_formats = []
        target_files = []

    return source_files, target_formats, target_files


DEFAULT_GENERATE_PATTERNS = [
    "生成", "制作", "创建", "输出", "导出", "写一个", "写一份", "写一篇", "写段", "编写",
    "写成", "整理成", "整理为", "做成", "做一份", "做个", "排版成", "排版为", "画一个", "画张", "画幅",
    "转为", "转成", "转换为", "转换成", "另存为", "保存为"
]


def has_positive_generate_action(query: str, generate_patterns: Optional[List[str]] = None) -> bool:
    """Checks whether query contains at least one positive, un-negated generative clause."""
    if generate_patterns is None:
        generate_patterns = DEFAULT_GENERATE_PATTERNS
    # 1. 遮罩引号内的文件名与词组，防止“制作说明.docx”等文件名动词干扰
    masked, _ = mask_file_references(query)
    # 2. 剥离“查看/阅读/总结/核对 + [刚才/之前/已] + 生成的”修饰短语
    cleaned = re.sub(
        r'(?:查看|看下|看一下|看看|检查|阅读|查阅|分析|浏览|总结|核对)\s*(?:刚才|之前|已|历史|沙箱)?\s*(?:生成|输出|制作|导出|新建)的?',
        ' ',
        masked
    )
    clauses = re.split(r'[，。！？；;,\n]+|(?:而是|改为|改用|只要|换成|转而|但|但是)', cleaned)
    neg_prefix_re = re.compile(rf'^{NEG_PREFIX}|{NEG_PREFIX}\s*(?:生成|制作|下载|导出|创建|做|落盘|任何|文件|产物)')

    for c in clauses:
        c_clean = c.strip()
        if not c_clean:
            continue
        # 若本分句本身是否定从句，则跳过
        if neg_prefix_re.search(c_clean):
            continue
        # 若本分句包含正向生成动词
        if any(g in c_clean.lower() for g in generate_patterns):
            return True
    return False
