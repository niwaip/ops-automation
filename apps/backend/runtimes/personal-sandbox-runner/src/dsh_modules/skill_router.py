"""
Semantic intent routing and skill matching registry for DeepSeek Harness (dsh).
Provides progressive disclosure semantic matching, slash-command routing,
and autonomous tool-calling fallback, abandoning fragile keyword whitelists.
"""

import re
import math
from collections import Counter
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Tuple

from .skills import get_available_skills, read_skill


@dataclass
class SkillRoutingResult:
    """Result of skill and intent resolution."""
    skill_id: Optional[str] = None
    skill_context: str = ""
    is_ppt_intent: bool = False
    is_design_intent: bool = False
    is_send_intent: bool = False
    is_knowledge_intent: bool = False
    is_docx_intent: bool = False
    is_office_intent: bool = False
    is_research_intent: bool = False
    is_inspect_intent: bool = False
    is_guide_intent: bool = False
    is_search_intent: bool = False
    is_generate_intent: bool = False
    affinity_score: float = 0.0
    matched_reasons: List[str] = field(default_factory=list)
    deliverables: List[str] = field(default_factory=list)
    requires_execution: bool = False
    default_rounds: int = 0


STOP_WORDS = {
    '的', '了', '在', '是', '我', '你', '他', '它', '她', '们', '这', '那', '有', '和', '与',
    '帮', '请', '个', '把', '向', '到', '用', '为', '被', '给', '让', '得', '地',
    '一下', '看看', '了解', '分析', '研究', '这篇文章', '这段话', '这个', '那个', '什么', '怎么',
    '如何', '为什么', '有没有', '对比', '以前', '最近', '现在', '今天', '一个', '一份', '一张',
    '意思', '逻辑', '业务', '语法', '英文', '不同', '解释',
    '生成', '要生', '要生成', '不要', '不用', '严禁', '禁止', '无需', '切勿', '必须', '需要', '使用',
    '提供', '支持', '进行', '以及', '或者', '还有', '可以', '能够', '即可', '通过', '完成', '用于'
}

GENERIC_VERBS = {'生成', '制作', '创建', '做', '写', '导出', '设计', '开发', '处理', '新建', '使用', '提供'}

SEND_PATTERNS = [
    "通过微信发送", "发送到微信", "发到微信", "发我微信", "微信发我",
    "微信推送", "发送给用户微信", "推送给我微信", "发送文件给用户"
]

KNOWLEDGE_PATTERNS = [
    "个人空间", "知识库", "知识空间", "我的个人文档", "personal knowledge"
]

GUIDE_PATTERNS = [
    "安装方法", "安装教程", "安装步骤", "安装指南", "怎么安装", "如何安装",
    "部署方法", "部署教程", "部署指南", "怎么部署", "如何部署",
    "使用教程", "使用方法", "使用指南", "使用说明", "怎么使用", "如何使用", "怎么用",
    "配置指南", "配置方法", "配置教程", "怎么配置", "如何配置",
    "实现原理", "工作原理", "架构原理", "架构设计", "系统架构",
    "命令说明", "参数说明", "写法说明", "语法说明", "定义是什么", "概念是什么", "技术原理是什么", "有什么用"
]

GENERATE_ACTION_PATTERNS = [
    "生成", "制作", "创建", "导出", "新建", "编写", "写一个", "写一段", "写个脚本", "写一份脚本",
    "做个", "做一份", "做一张", "做个表", "做个ppt", "做个幻灯片",
    "写一份", "写个", "写出", "输出", "输出为", "保存为", "转为", "转成", "落盘", "另存为", "写成",
    "汇总成", "总结成", "整理成", "归纳成", "提炼成", "做成", "制成", "输出成", "排版成", "编成", "改写成",
    "做张ppt", "做套ppt", "做张表", "做份报告", "出份报告", "一张ppt", "一份ppt", "一套ppt",
    "一份word", "一份pdf", "一个excel", "一张excel", "一份报表",
    "generate", "create", "export", "build", "make", "produce"
]

INSPECT_ACTION_PATTERNS = [
    "查看", "阅读", "查阅", "读取", "看下", "看一下", "看看", "检查", "分析", "审阅", "浏览",
    "排查", "检索", "探查", "诊断", "查下", "查一下", "搜索", "搜下", "搜一下", "提取内容", "提取", "抽取", "只提取", "仅提取", "问答",
    "帮我看", "看代码", "查代码", "解释", "说明", "对比", "比较", "排序", "核对", "校验", "识别", "为什么",
    "检验", "稽核", "对账", "核查", "核验", "验算", "勾稽",
    "评估", "测算", "测一下", "变化", "原因", "read", "view", "inspect", "check", "examine", "analyze", "cat", "show", "explain", "compare"
]

READONLY_SUMMARY_PATTERNS = [
    "总结", "归纳", "汇总", "统计", "计算", "核算", "盘点", "梳理", "提炼", "列出", "列举", "概括",
    "找下", "找一下", "找出", "找到", "定位", "查出", "求出", "计算出", "算下", "算一下", "算一算",
    "求和", "占比", "达成率", "偏差", "最大", "最小"
]

CONTENT_QUERY_PATTERNS = [
    "内容是什么", "有什么内容", "写了什么", "讲了什么", "包含什么", "里面有", "里面写了", "里写了",
    "有哪些表", "有哪些工作表", "有什么表", "有哪些sheet", "什么sheet", "列出sheet", "清单", "用途",
    "附件是什么", "文件是什么", "这是什么", "上传的是什么", "上传了什么", "上传的是啥", "传了什么", "这是啥", "是什么文件",
    "这个文件是啥", "这是什么图", "图里是什么", "图片是什么", "文件内容", "附件内容", "识别图片", "解读图片",
    "商品是什么", "照片里是什么", "照片是什么", "照片里的", "图片里的", "图中的", "照片中是什么", "图片中是什么"
]

GENERATIVE_SLASH_COMMANDS = {
    "ppt", "slides", "deck", "image", "draw", "pdf", "excel", "table", "word", "docx", "doc", "design", "ui"
}


TEXT_ONLY_ACTION_TARGETS = [
    "总结", "摘要", "分析", "结论", "建议", "提纲", "大纲", "概述", "要点",
    "问答", "回答", "观点", "归纳", "汇报", "说明", "纪要", "备忘", "意见", "心法", "经验",
    "介绍", "理解", "解释", "思考", "看法", "梳理", "草案", "方案"
]

PHYSICAL_DELIVERABLE_TARGETS = [
    ".pdf", ".docx", ".xlsx", ".pptx", ".html", ".csv", ".json", ".md", ".png", ".jpg", ".jpeg",
    ".sql", ".sh", ".yml", ".yaml", "dockerfile", "docker-compose", "docker-compose.yml",
    "pdf", "word", "excel", "ppt", "html", "markdown", "md文件", "md 文件", "表格", "幻灯片", "演示文稿", "报表",
    "图片", "海报", "图", "代码文件", "脚本", "落地文件", "物理文件", "本地文件", "单页", "原型", "看板", "网页", "单页报告"
]


def is_text_only_request(query: str) -> bool:
    """Detects whether user prompt explicitly requests answer strictly within chat/text and forbids physical files or script generation."""
    if not query:
        return False
    lower = query.lower().strip()

    # 明确要求只在聊天/正文解答且不生成文件
    if re.search(r'(?:只|仅|直接)(?:在|通过)?(?:聊天|对话|正文|窗口)(?:中|里)?(?:输出|解答|回答|呈现|对比)', lower):
        if re.search(r'(?:不要|严禁|无需|不用|禁止|切勿|不)\s*(?:生成|制作|下载|导出|创建|落盘)', lower):
            return True
        if "不要生成" in lower or "不生成" in lower:
            return True

    # 明确否定任何文件/脚本落盘
    if re.search(r'(?:不要|严禁|无需|不用|禁止|切勿|不)\s*(?:生成|制作|下载|导出|创建|落盘)\s*(?:任何|多余的|其他的)?\s*(?:物理)?(?:文件|脚本|产物|附件)', lower):
        return True

    return False


from .intent_contract import (
    DELIVERABLE_TERM_SYNONYMS,
    is_term_negated,
    is_network_search_forbidden,
    is_send_intent_requested,
    is_modify_intent_requested,
    mask_file_references,
    extract_source_and_target_artifacts,
    has_positive_generate_action,
)


def check_generation_target_is_physical(lower_q: str) -> bool:
    """
    Distinguishes whether a generative action targets a physical file deliverable
    (.pdf, .docx, .xlsx, .pptx, etc.) or pure in-chat textual content (summary, outline, advice).
    """
    if is_text_only_request(lower_q):
        return False

    _, target_fmts, target_files = extract_source_and_target_artifacts(lower_q)
    if target_files or target_fmts:
        return True

    is_markdown_table = (
        re.search(r'(?:markdown|文本|聊天|对话|正文)?\s*(?:对比表格|表格对比|markdown\s*表格)', lower_q)
        and not any(ext in lower_q for ext in [".xlsx", ".xls", "excel", "工作簿", "导出表格", "下载表格", "生成表格文件"])
    )

    if (
        re.search(r'(?:一页|单页|single[- ]page)', lower_q, re.I)
        and re.search(r'(?:报告|报表|report)', lower_q, re.I)
    ):
        return True

    # 组合与交付物特征模式：[动词] + 成/为 + [量词] + [物理格式] 或 [量词] + [物理格式]
    if re.search(r'(?:成|为)\s*(?:一份|一个|一张|一套)?\s*(?:ppt|word|pdf|excel|html|markdown|csv|json|幻灯片|演示文稿|表格|文档|报表|脚本|dockerfile)', lower_q):
        m_verb = re.search(r'(?:成|为)\s*(?:一份|一个|一张|一套)?\s*([a-zA-Z0-9_\-\u4e00-\u9fa5\.]+)', lower_q)
        target_verb = m_verb.group(1).strip() if m_verb else ""
        if target_verb == "表格" and is_markdown_table:
            pass
        elif not is_term_negated(lower_q, target_verb):
            return True

    if re.search(r'(?:一张|一份|一个|一套)\s*(?:ppt|word|pdf|excel|html|markdown|csv|json|幻灯片|演示文稿|表格|文档|报表|脚本|dockerfile)', lower_q):
        m_quant = re.search(r'(?:一张|一份|一个|一套)\s*([a-zA-Z0-9_\-\u4e00-\u9fa5\.]+)', lower_q)
        target_quant = m_quant.group(1).strip() if m_quant else ""
        if target_quant == "表格" and is_markdown_table:
            pass
        elif not is_term_negated(lower_q, target_quant):
            return True

    # 查找生成动词后紧随的目标词
    m = re.search(r'(?:生成|导出|制作|创建|做|写|输出为|保存为|转为|转成|输出|汇总成|总结成|整理成|归纳成|做成|制成|提炼成|排版成|编成|另存为)\s*(?:一份|一个|一张|一套|一段|出|成|为)?\s*([a-zA-Z0-9_\-\u4e00-\u9fa5\.]+)', lower_q)
    valid_cues = [
        ".pdf", ".docx", ".xlsx", ".pptx", ".html", ".md", ".csv", ".json",
        ".sql", ".sh", ".yml", ".yaml", "dockerfile", "docker-compose",
        "word", "excel", "ppt", "html", "markdown", "md 文件", "md文件", "导出为", "保存为",
        "pdf report", "as a pdf", "word document", "pdf报告", "word文档", "excel文件"
    ]
    has_regex_format = bool(
        re.search(r'\b(?:pdf|docx|xlsx|pptx|csv|json)\b', lower_q)
        and not is_term_negated(lower_q, "pdf")
    )
    if not m:
        return any(p in lower_q and not is_term_negated(lower_q, p) for p in valid_cues) or has_regex_format

    target = m.group(1).strip()
    if is_term_negated(lower_q, target):
        return False
    if target == "表格" and is_markdown_table:
        return False

    has_physical = (
        (any(p in target for p in PHYSICAL_DELIVERABLE_TARGETS) and not is_term_negated(lower_q, target))
        or any(ext in lower_q and not is_term_negated(lower_q, ext) for ext in valid_cues)
        or has_regex_format
    )
    has_text_only = any(t in target for t in TEXT_ONLY_ACTION_TARGETS)
    if has_text_only and not any(p in target for p in PHYSICAL_DELIVERABLE_TARGETS):
        if not any(ext in lower_q and not is_term_negated(lower_q, ext) for ext in valid_cues + ["保存为", "导出为", "另存为", "写成文件", "生成文件"]):
            return False
    return has_physical


def resolve_file_action_intent(
    query: str,
    history: Optional[List[Dict[str, Any]]] = None,
    attached_files: Optional[List[str]] = None
) -> Tuple[bool, bool]:
    """
    Semantically resolves whether user intent is physical file generation (is_generate_intent)
    or read-only inspection/analysis (is_inspect_intent).
    Returns (is_generate_intent, is_inspect_intent).
    """
    if not query:
        return False, False

    lower_q = query.lower().strip()

    # 0a. 上下文追问/确认/重试优先判定（短续作指令在历史中有生成意图时直接继承）
    continuation_cues = [
        "1", "1.", "一是", "第一个", "确认", "生成", "导出", "确认生成", "请生成",
        "重新生成", "重新制作", "重做", "再次生成", "再生成一次", "重新导出", "retry", "regenerate"
    ]
    if history and lower_q in continuation_cues:
        for h in reversed(history[-4:]):
            if not isinstance(h, dict) or h.get("role") == "assistant":
                continue
            c = str(h.get("content", ""))
            c_lower = c.lower()
            if is_term_negated(c_lower, "生成") or is_text_only_request(c_lower):
                has_inspect = any(k in c_lower for k in INSPECT_ACTION_PATTERNS)
                return False, has_inspect
            if has_positive_generate_action(c):
                return True, False
            if any(k in c_lower for k in ["pdf", "word", "excel", "ppt", "html", "交接.md", "docx", "xlsx", "pptx"]) and not any(is_term_negated(c_lower, ext) for ext in ["pdf", "word", "excel", "ppt", "html", "docx", "xlsx", "pptx"]):
                return True, False

    # 0b. 明确纯文本请求或否定生成物理文件指令
    if is_text_only_request(lower_q):
        has_inspect = (
            any(k in lower_q for k in INSPECT_ACTION_PATTERNS)
            or any(k in lower_q for k in CONTENT_QUERY_PATTERNS)
            or any(k in lower_q for k in READONLY_SUMMARY_PATTERNS)
            or bool(attached_files)
        )
        return False, has_inspect

    # 1. 显式生成类 Slash 命令（确定性 100% 具有产物生成交付意图）
    if lower_q.startswith(("/", "／")):
        cmd = lower_q.split()[0].lstrip("/／")
        if cmd in GENERATIVE_SLASH_COMMANDS:
            return True, False

    # 2. 遮罩文件名与附件引用，防止文件名中的动词（如“制作说明.docx”、“生产日报.xlsx”）干扰动作判定
    masked_q, _ = mask_file_references(lower_q, attached_files)

    # 3. 基础谓词模式检测（基于遮罩后内容）
    has_inspect = (
        any(k in masked_q for k in INSPECT_ACTION_PATTERNS)
        or any(k in masked_q for k in CONTENT_QUERY_PATTERNS)
        or bool(re.search(r'(?:照片|图片|截图|附件|文件).*(?:是什么|是啥|有什么|包含什么|写了什么|是谁|哪家|哪个)', masked_q))
        or bool(re.search(r'(?:只|仅)?(?:提取|抽取).*(?:文字|文本|内容)', masked_q))
    )
    has_summary = any(k in masked_q for k in READONLY_SUMMARY_PATTERNS)
    has_generate = has_positive_generate_action(masked_q, GENERATE_ACTION_PATTERNS)

    # 4. 纯查看/分析/归纳意图
    if (has_inspect or has_summary) and not has_generate:
        return False, True

    # 5. 纯生成/导出/创建意图
    if has_generate and not has_inspect:
        is_physical = check_generation_target_is_physical(lower_q)
        if is_physical:
            return True, False
        else:
            return False, False

    # 6. 同时包含查阅与生成动词时的结构分析
    if has_inspect and has_generate:
        # 情况 A: 主语/谓词为查看，修饰语包含生成（如：“查看生成的文件”、“看看刚才导出的pdf”、“检查已生成的代码”、“查看刚才生成的交接.md”）
        if re.search(r'(查看|看下|看一下|看看|检查|阅读|查阅|分析|浏览)\s*(?:刚才|之前|已|历史|沙箱)?\s*(生成|输出|制作|导出|新建)的?', masked_q):
            return False, True

        # 情况 B: 查阅并在其基础上进行后续产出
        is_physical = check_generation_target_is_physical(lower_q)
        if is_physical:
            return True, True
        else:
            return False, True

    return False, False


def clean_semantic_query(q: str) -> str:
    """Strips polite prefixes, search verbs, and pronouns."""
    cleaned = re.sub(
        r'^(帮我|请|给我|带我|麻烦|协助)?\s*(查一下|查下|查询|搜索|查找|看下|看一下|看看|检索|了解一下|获取|调研|调查|分析一下|分析|评测一下|评测|研究一下|调用|查看|search|find|lookup|research|investigate)\s*',
        '',
        q,
        flags=re.I
    ).strip()
    cleaned = re.sub(
        r'^(关于他|关于她|关于它|关于其|关于这个|关于该|关于|有关|针对其|针对这个|针对|对于|对于这个)[的]?\s*',
        '',
        cleaned,
        flags=re.I
    ).strip()
    cleaned = re.sub(
        r'^(他|她|它|其|这个|该|对方)[的]?\s*',
        '',
        cleaned,
        flags=re.I
    ).strip()
    return cleaned or q


def extract_entity_from_history(history: Optional[List[Dict[str, Any]]]) -> Optional[str]:
    """Extracts the core subject entity from recent conversation history."""
    if not history:
        return None
    for h in reversed(history):
        if not isinstance(h, dict):
            continue
        c = str(h.get("content") or "").strip()
        if not c:
            continue
        # 1. 匹配 GitHub repo 或 URL
        gh = re.search(r'github\.com/([a-zA-Z0-9_\-\.]+/[a-zA-Z0-9_\-\.]+)', c)
        if gh:
            return gh.group(1).rstrip('.')
        url = re.search(r'https?://[^\s)\]>]+', c)
        if url:
            return url.group(0)
        # 2. 匹配加粗或代码块实体如 **[xxx]** 或 `xxx`
        bold = re.search(r'\*\*[`]?([a-zA-Z0-9_\-\./\s]{2,40})[`]?\*\*', c)
        if bold:
            ent = bold.group(1).strip()
            if ent and not any(k in ent for k in ["项目", "分析", "总结", "方案", "代码", "文件"]):
                return ent
        # 3. 若为用户输入，提取剥离动词后的主体
        if h.get("role") == "user":
            clean_u = re.sub(
                r'^(帮我|请|给我|带我|麻烦)?\s*(查一下|查下|查询|搜索|查找|看下|看一下|看看|检索|了解一下|获取|调研|调查|分析一下|分析|评测一下|评测|研究一下|调用|查看|search|find|lookup|research)\s*',
                '',
                c,
                flags=re.I
            ).strip()
            clean_u = re.sub(
                r'^(关于他|关于她|关于它|关于其|关于这个|关于该|关于|有关|针对其|针对这个|针对|对于|对于这个)[的]?\s*',
                '',
                clean_u,
                flags=re.I
            ).strip()
            clean_u = re.sub(
                r'^(这个项目|这个工具|这个库|这个框架|该项目|该工具|该库|该框架)[，,\s]*',
                '',
                clean_u
            ).strip()
            clean_u = re.sub(r'(并且进行分析|并进行分析|进行分析|做个分析|分析一下|分析|怎么样|评测)', '', clean_u).strip()
            if len(clean_u) >= 2:
                return clean_u
    return None


INDEPENDENT_DOMAIN_OR_PLATFORM_PATTERN = re.compile(
    r'(?:微博|weibo|热搜|热点|热榜|榜单|排行|热门|知乎|贴吧|抖音|快手|头条|小红书|b站|bilibili|推特|twitter|reddit|hacker\s*news|天气|气象|预报|气温|下雨|温度|股票|股价|汇率|基金|黄金|金价|新闻|赛事|票房|电影)',
    re.I
)

ELLIPTICAL_FOLLOWUP_PATTERN = re.compile(
    r'^(?:怎么|怎样|如何|为什么|为何|啥时候|什么时候|哪儿|哪里|多少|几时|能不能|可不可以|可以吗|行吗)'
    r'|^(?:安装|部署|使用|用法|教程|原理|架构|设计|评价|口碑|对比|优缺点|源码|代码|实现|官网|下载|文档|配置|参数|价格|收费|成本|作者|团队|背景|历史|版本|更新日志|changelog|license|开源协议|简介|介绍|特点|优势|劣势|细节|总结|后续|进展|报错|bug|issue|release)[呢吗呀啊\?？]?'
    r'|.*(?:呢|吗|呀|怎么样|如何|怎么用|好不好|行不行|值不值得|怎么装|怎么配|哪里买|多少钱)[?？]?$',
    re.I
)


def resolve_contextual_query(q: str, history: Optional[List[Dict[str, Any]]]) -> str:
    """Resolves pronouns or incomplete queries using conversation history entity."""
    if not history:
        return q
    cleaned = re.sub(
        r'^(帮我|请|给我|带我|麻烦|协助)?\s*(查一下|查下|查询|搜索|查找|看下|看一下|看看|检索|了解一下|获取|调研|调查|分析一下|分析|评测一下|评测|研究一下|调用|查看|search|find|lookup|research|investigate)\s*',
        '',
        q,
        flags=re.I
    ).strip()
    has_pronoun = bool(re.search(
        r'^(关于他|关于她|关于它|关于其|关于这个|关于该|关于|针对其|针对这个|针对|对于|对于这个|他|她|它|其|这个|该|对方)[的]?',
        cleaned,
        re.I
    ))
    clean_topic = re.sub(
        r'^(关于他|关于她|关于它|关于其|关于这个|关于该|关于|针对其|针对这个|针对|对于|对于这个|他|她|它|其|这个|该|对方)[的]?\s*',
        '',
        cleaned,
        flags=re.I
    ).strip()

    # 1. 若包含明确指代代词（如“关于他”、“它的评价”），判定为上下文依存查询
    # 2. 若未包含代词，必须同时满足：属于省略主语的追问模式，且不包含独立的平台/领域词（如微博、热搜、天气等独立话题）
    is_elliptical = (
        ELLIPTICAL_FOLLOWUP_PATTERN.search(clean_topic) is not None
        and INDEPENDENT_DOMAIN_OR_PLATFORM_PATTERN.search(clean_topic) is None
    )

    if has_pronoun or is_elliptical:
        ent = extract_entity_from_history(history)
        if ent:
            # 避免重复追加历史实体
            if clean_topic and (clean_topic in ent or ent in clean_topic):
                return ent
            return f"{ent} {clean_topic}".strip() if clean_topic else ent
    return q


def extract_query_features(text: str) -> List[str]:
    """Extracts alphanumeric words and CJK character n-grams (2 to 4 chars)."""
    text_lower = text.lower()
    alpha_tokens = [w for w in re.findall(r'[a-z0-9_\-\.]+', text_lower) if len(w) >= 2]
    cjk_blocks = re.findall(r'[\u4e00-\u9fff]+', text_lower)
    cjk_tokens = []
    for block in cjk_blocks:
        if 2 <= len(block) <= 6 and block not in STOP_WORDS:
            cjk_tokens.append(block)
        for i in range(len(block) - 1):
            bg = block[i:i+2]
            if bg not in STOP_WORDS:
                cjk_tokens.append(bg)
        for i in range(len(block) - 2):
            tg = block[i:i+3]
            cjk_tokens.append(tg)
    return list(dict.fromkeys(alpha_tokens + cjk_tokens))


class SemanticSkillMatcher:
    """
    Computes semantic affinity scores between query and registered skills
    using dynamic frontmatter triggers, description token overlap (IDF weighted),
    and boundary exclusion penalties.
    """

    def __init__(self, skills: List[Dict[str, Any]]):
        self.skills = skills
        self.N = len(skills)
        self.skill_data = {}
        for s in skills:
            s_id = s['id']
            triggers = [t.lower() for t in s.get('triggers', []) if len(t) >= 2]
            aliases = [a.lower() for a in s.get('aliases', []) if len(a) >= 2]
            desc_text = s.get('description', '')
            pos_desc = desc_text.split('不要用于', 1)[0].split('not for', 1)[0]
            desc_features = [f for f in extract_query_features(pos_desc) if f not in GENERIC_VERBS and f not in STOP_WORDS]
            neg_features = []
            if '不要用于' in desc_text:
                neg_part = desc_text.split('不要用于', 1)[1]
                neg_features = [f for f in extract_query_features(neg_part) if f not in GENERIC_VERBS and len(f) >= 2]
            elif 'not for' in desc_text.lower():
                neg_part = desc_text.lower().split('not for', 1)[1]
                neg_features = [f for f in extract_query_features(neg_part) if f not in GENERIC_VERBS and len(f) >= 2]

            self.skill_data[s_id] = {
                'id': s_id,
                'name': s.get('name', ''),
                'description': desc_text,
                'triggers': triggers,
                'aliases': aliases,
                'desc_features': set(desc_features),
                'neg_features': set(neg_features),
                'meta': s
            }

        df = Counter()
        for s_id, data in self.skill_data.items():
            for f in data['desc_features']:
                df[f] += 1
        self.idf = {f: math.log((self.N - count + 0.5) / (count + 0.5) + 1.0) for f, count in df.items()}

    def match(self, query: str) -> List[Tuple[str, float, List[str]]]:
        lower_q = query.lower().strip()
        cleaned_q = clean_semantic_query(query).lower().strip()
        normalized_q_no_de = re.sub(r'的', '', lower_q)

        q_features = extract_query_features(query) + extract_query_features(cleaned_q)
        q_features = list(dict.fromkeys(q_features))

        results = []
        for s_id, data in self.skill_data.items():
            score = 0.0
            reasons = []

            # 1. Exact Trigger Matches (from SKILL.md frontmatter)
            for trig in data['triggers']:
                if is_term_negated(lower_q, trig):
                    continue
                if trig in lower_q or trig in cleaned_q or trig in normalized_q_no_de:
                    t_score = 12.0 + len(trig) * 1.5
                    score += t_score
                    reasons.append(f'trigger:{trig}(+{t_score:.1f})')
                    break

            # 2. Skill ID or Alias Direct Mention
            for a in [s_id] + data['aliases']:
                if is_term_negated(lower_q, a):
                    continue
                if a in lower_q:
                    score += 12.0
                    reasons.append(f'id/alias:{a}(+12.0)')
                    break

            # 3. Description Semantic Overlap (weighted by IDF)
            matched_desc_terms = [f for f in q_features if f in data['desc_features']]
            desc_score = sum(self.idf.get(f, 1.0) for f in matched_desc_terms)
            if desc_score > 0:
                score += desc_score
                reasons.append(f'desc_terms({desc_score:.1f})')

            # 4. Anti-overtriggering / Boundary Check
            if data['neg_features']:
                neg_matches = [f for f in q_features if f in data['neg_features'] and self.idf.get(f, 0) > 1.2]
                if neg_matches:
                    score *= 0.25
                    reasons.append(f'boundary_penalty({neg_matches})')

            # 5. Text-Only Request Suppression for Physical Document Skills
            if is_text_only_request(lower_q):
                physical_skills = {"docx", "xlsx", "pdf", "guizang-ppt", "pptx", "html-ppt", "saas-landing", "frontend-design", "web-prototype"}
                if s_id in physical_skills:
                    score = 0.0
                    reasons = ['text_only_suppressed']

            # 6. Explicit User Negation for Skill (e.g. 不要生成PPT/HTML)
            is_skill_negated = any(
                is_term_negated(lower_q, t) for t in data['triggers'] + data['aliases'] + [s_id]
            )
            if is_skill_negated:
                score = 0.0
                reasons = ['skill_explicitly_negated']

            # 7. Document generation skills require at least one trigger or alias cue in query
            doc_skills = {"pdf", "xlsx", "docx", "guizang-ppt", "html-ppt"}
            if s_id in doc_skills:
                has_doc_cue = (
                    any(c in lower_q for c in data['triggers'] + data['aliases'] + [s_id])
                    or any(c in cleaned_q for c in data['triggers'] + data['aliases'] + [s_id])
                    or any(c in normalized_q_no_de for c in data['triggers'] + data['aliases'] + [s_id])
                )
                if not has_doc_cue:
                    score = 0.0
                    reasons = ['missing_explicit_doc_cue']

            results.append((s_id, score, reasons))

        results.sort(key=lambda x: x[1], reverse=True)
        return results


class SkillRouter:
    """Routes queries to skills using slash commands, semantic affinity, or LLM fallback."""

    AFFINITY_THRESHOLD = 7.5

    @classmethod
    def route(
        cls,
        prompt: str,
        existing_history: Optional[List[Dict[str, Any]]] = None,
        available_skills: Optional[List[Dict[str, Any]]] = None,
        allow_research: bool = False,
        files: Optional[List[str]] = None
    ) -> SkillRoutingResult:
        """
        Determines skill and intent for a given prompt via semantic affinity matching.
        """
        effective_query = prompt
        # 提取上传附件或有效附件信息，用于指代消歧与多模态文件亲和度解析
        attached_files: List[str] = list(dict.fromkeys(f.strip() for f in (files or []) if isinstance(f, str) and f.strip()))
        att_match = re.search(r'【(?:当前轮次用户上传附件|当前会话有效附件清单)】:\s*([^（\n]+)', prompt)
        if att_match:
            raw_files = att_match.group(1).split(",")
            for rf in raw_files:
                clean_f = rf.strip()
                if clean_f and "." in clean_f:
                    if clean_f not in attached_files:
                        attached_files.append(clean_f)

        if "用户指令：" in prompt:
            effective_query = prompt.split("用户指令：")[-1].strip()
        elif "用户指令:" in prompt:
            effective_query = prompt.split("用户指令:")[-1].strip()

        lower_query = effective_query.lower().strip()
        result = SkillRoutingResult()

        # 1. 探测知识库检索意图（精确词组）
        result.is_knowledge_intent = any(k in lower_query for k in KNOWLEDGE_PATTERNS)

        # 2. 探测文件外发意图（严格过滤否定外发指令，如“不要通过微信发送”）
        result.is_send_intent = is_send_intent_requested(lower_query, SEND_PATTERNS)

        # 3. 探测动作指令与知识/教程问答模态消歧
        result.is_guide_intent = any(k in lower_query for k in GUIDE_PATTERNS)

        # 4. 探测全网实时检索与最新动态意图（开放域外部资讯/大宗商品原料价格/开源生态/最新发布/会议展会时间，而非本地工作区）
        SEARCH_CUES = [
            "最新的", "最新", "最近", "近期", "当前最", "最热门", "热门", "新出", "最新发布",
            "流行", "最流行", "流行度", "主流", "火爆", "大家都在用", "推荐哪些", "推荐几个", "好用的",
            "实时", "热点", "热搜", "热榜", "榜单", "排行榜", "趋势榜", "今日榜", "实时榜",
            "安装方法", "安装教程", "如何安装", "怎么安装", "安装指南", "installation guide", "how to install",
            "外部生态", "开源社区", "社区生态", "网上", "全网", "市场动态",
            "插件", "扩展", "第三方库", "有哪些插件", "有哪些扩展", "有哪些库", "有哪些工具", "插件生态", "生态插件",
            "近年", "近几年", "历年", "历届", "举办时间", "什么时候举办", "什么时候开", "召开时间",
            "铜价", "金价", "油价", "钢价", "原料价格", "行情", "走势", "汇率", "股价", "今日价格", "最新价格", "今日行情",
            "联网查询", "联网搜索", "上网查", "网上查", "查一下网络"
        ]
        LOCAL_DISAMBIGUATION = [
            "工作区", "当前目录", "本地文件", "已上传", "生成的", "刚才生成", "历史", "附件"
        ]
        is_asking_local = any(loc in lower_query for loc in LOCAL_DISAMBIGUATION) or bool(attached_files)
        is_cues_match = any(cue in lower_query for cue in SEARCH_CUES)

        # 开放域技术/生态/开源项目组件问答探测（如 "xxx 有哪些插件", "xxx 支持哪些模型", "xxx 生态"）
        is_tech_ecosystem_inquiry = bool(
            re.search(r'(?:harness|deepseek|langchain|dsh|react|vue|nextjs|docker|k8s|ollama|vllm|unsloth)', lower_query)
            and re.search(r'(?:插件|扩展|生态|组件|工具|库|有哪些|支持哪些|怎么配|怎么用|是什么)', lower_query)
        )

        result.is_search_intent = (is_cues_match or is_tech_ecosystem_inquiry) and not is_asking_local

        if is_network_search_forbidden(lower_query):
            result.is_search_intent = False
            result.is_research_intent = False

        # 结构化文件动作与产物目标解析
        source_files, target_formats, target_files = extract_source_and_target_artifacts(effective_query, attached_files)
        is_gen, is_insp = resolve_file_action_intent(effective_query, existing_history, attached_files)
        if not (is_insp and not is_gen) and (target_formats or target_files):
            is_gen = True
        elif is_insp and not is_gen:
            target_formats = []
            target_files = []
        result.is_generate_intent = is_gen

        # 若涉及本地附件/文件查看或查阅总结，绝不能被误判为开放域检索或通用安装指南
        if is_asking_local and (is_insp or any(k in lower_query for k in CONTENT_QUERY_PATTERNS) or any(k in lower_query for k in READONLY_SUMMARY_PATTERNS)):
            result.is_guide_intent = False
            result.is_search_intent = False
            is_insp = True

        if result.is_guide_intent or result.is_search_intent:
            result.is_inspect_intent = False
        else:
            result.is_inspect_intent = is_insp

        # 5. 显式 Slash 命令优先匹配（确定性 100%）
        if lower_query.startswith("/"):
            parts = lower_query.split()
            cmd = parts[0][1:]
            slash_aliases = {
                "ppt": "guizang-ppt",
                "slides": "guizang-ppt",
                "image": "image-gen",
                "draw": "image-gen",
                "pdf": "pdf",
                "excel": "xlsx",
                "table": "xlsx",
                "word": "docx",
                "doc": "docx",
                "research": "research",
                "last30days": "research",
                "design": "frontend-design",
                "ui": "frontend-design",
            }
            if cmd in slash_aliases:
                result.skill_id = slash_aliases[cmd]
            else:
                all_skills = available_skills or get_available_skills()
                for s in all_skills:
                    if s["id"].lower() == cmd or cmd in [a.lower() for a in s.get("aliases", [])]:
                        result.skill_id = s["id"]
                        break

        # 5a. 目标格式显式指定优先于输入源文件格式推断（例如：“读取采购.xlsx，生成采购说明.docx” 应路由至 docx）
        if not result.skill_id and target_formats:
            if ".pdf" in target_formats and not is_term_negated(lower_query, "pdf"):
                result.skill_id = "pdf"
            elif ".docx" in target_formats and not is_term_negated(lower_query, "docx"):
                result.skill_id = "docx"
            elif ".xlsx" in target_formats and not is_term_negated(lower_query, "xlsx"):
                result.skill_id = "xlsx"
            elif ".pptx" in target_formats and not is_term_negated(lower_query, "pptx"):
                if re.search(r'(?:ppt\s*报告|html\s*报告|网页\s*报告|交互式\s*报告)', lower_query):
                    result.skill_id = "guizang-ppt"
                else:
                    result.skill_id = "pptx"

        # A single-page report defaults to a web document unless the user names
        # another physical format. This also makes short contextual follow-ups
        # such as "生成一页的报告" deterministic instead of asking a
        # small model to choose between PPT, HTML, Word, and PDF at execution time.
        is_single_page_report = bool(
            re.search(r'(?:一页|单页|single[- ]page)', lower_query, re.I)
            and re.search(r'(?:报告|报表|report)', lower_query, re.I)
        )
        names_non_web_format = bool(
            re.search(r'(?:pptx?|slides?|幻灯片|演示文稿|pdf|docx?|word|xlsx?|excel|markdown|\.md\b)', lower_query, re.I)
        )
        if (
            not result.skill_id
            and not names_non_web_format
            and (
                is_single_page_report
                or (
                    re.search(r'(?:html|网页|页面)', lower_query, re.I)
                    and re.search(r'(?:一页|单页|single[- ]page)', lower_query, re.I)
                )
            )
        ):
            result.skill_id = "frontend-design"

        # 4a. 上下文追问/确认/重试继承。基于上一条用户交付要求恢复对应技能与交付物契约
        continuation_cues = [
            "1", "1.", "一是", "第一个", "确认", "生成", "导出", "确认生成", "请生成",
            "重新生成", "重新制作", "重做", "再次生成", "再生成一次", "重新导出", "retry", "regenerate"
        ]
        if not result.skill_id and existing_history and lower_query in continuation_cues:
            for h in reversed(existing_history[-8:]):
                if not isinstance(h, dict) or h.get("role") != "user":
                    continue
                c = str(h.get("content", ""))
                c_lower = c.lower()
                if not has_positive_generate_action(c) or is_term_negated(c_lower, "生成") or is_text_only_request(c_lower):
                    continue
                h_src, h_tgt_fmts, h_tgt_files = extract_source_and_target_artifacts(c)
                # 优先根据上一轮解析出的明确目标格式确定技能，避免输入源文件格式污染输出目标
                if h_tgt_fmts:
                    if ".pdf" in h_tgt_fmts:
                        result.skill_id = "pdf"
                    elif ".docx" in h_tgt_fmts:
                        result.skill_id = "docx"
                    elif ".xlsx" in h_tgt_fmts:
                        result.skill_id = "xlsx"
                    elif ".pptx" in h_tgt_fmts:
                        if re.search(r'(?:ppt\s*报告|html\s*报告|网页\s*报告|交互式\s*报告)', c_lower) and not is_term_negated(c_lower, "html"):
                            result.skill_id = "guizang-ppt"
                        else:
                            result.skill_id = "pptx"
                    elif ".html" in h_tgt_fmts:
                        result.skill_id = "frontend-design"
                    elif ".md" in h_tgt_fmts:
                        result.skill_id = None
                elif (any(k in c_lower for k in ["word", "docx"])) and not is_term_negated(c_lower, "docx"):
                    result.skill_id = "docx"
                elif (any(k in c_lower for k in ["excel", "xlsx", "表格"])) and not is_term_negated(c_lower, "xlsx"):
                    result.skill_id = "xlsx"
                elif ("pdf" in c_lower) and not is_term_negated(c_lower, "pdf"):
                    result.skill_id = "pdf"
                elif (any(k in c_lower for k in ["ppt", "幻灯片", "演示文稿", "pptx"])) and not is_term_negated(c_lower, "pptx"):
                    if re.search(r'(?:ppt\s*报告|html\s*报告|网页\s*报告|交互式\s*报告)', c_lower) and not is_term_negated(c_lower, "html"):
                        result.skill_id = "guizang-ppt"
                    else:
                        result.skill_id = "pptx"
                elif (any(k in c_lower for k in ["html", "网页", "页面", "单页", "一页"])) and not is_term_negated(c_lower, "html"):
                    result.skill_id = "frontend-design"
                elif (any(k in c_lower for k in ["markdown", ".md", "md"])) and not is_term_negated(c_lower, "md"):
                    result.skill_id = None

                result.is_generate_intent = True
                result.deliverables = []
                if h_tgt_files:
                    for tf in h_tgt_files:
                        if tf not in result.deliverables:
                            result.deliverables.append(tf)
                elif h_tgt_fmts:
                    for fmt in h_tgt_fmts:
                        if fmt not in result.deliverables:
                            result.deliverables.append(fmt)
                break

        # 4b. 语义亲和度路由器（Semantic Router，彻底替代静态白名单）
        if not result.skill_id:
            all_skills = available_skills or get_available_skills()
            if all_skills:
                matcher = SemanticSkillMatcher(all_skills)
                semantic_query = effective_query
                EXPLICIT_FORMAT_CUES = [
                    ".pdf", ".docx", ".xlsx", ".pptx", ".html", ".md",
                    "pdf", "word", "excel", "ppt", "表格", "幻灯片", "演示文稿", "报表", "海报", "图片", "代码", "markdown", "md"
                ]
                has_explicit_format = any(fmt in lower_query for fmt in EXPLICIT_FORMAT_CUES)
                if attached_files and not has_explicit_format:
                    semantic_query = f"{effective_query} {' '.join(attached_files)}"
                matches = matcher.match(semantic_query)
                if matches:
                    top_id, top_score, top_reasons = matches[0]
                    # 门禁控制：深度调研 (research) 技能必须有明确指示才启用
                    # 1) 严禁在用户明确禁止联网时启用
                    # 2) allow_research 为 True（前端勾选了调研开关）且无禁止联网
                    # 3) 或者包含明确的强调研意图短语（如深度调研、技术调研、竞品调研、架构选型对比等）
                    if top_id == "research":
                        if is_network_search_forbidden(lower_query):
                            pass
                        else:
                            EXPLICIT_RESEARCH_PATTERNS = [
                                "深度调研", "技术调研", "竞品调研", "架构选型对比", "选型对比",
                                "技术选型", "最新动态调研", "背调", "社区口碑调研", "深度调查",
                                "调研", "调查", "真实评价与争议", "近30天真实评价"
                            ]
                            is_research_permitted = (
                                allow_research or any(p in lower_query for p in EXPLICIT_RESEARCH_PATTERNS)
                            )
                            CASUAL_INSPECT_PATTERNS = [
                                "查看当前", "查看文件", "查看目录", "查看代码", "查看配置", "查看版本", "看下", "看代码",
                                "检查代码", "检查一下", "检查报错", "查一下用法", "查下报错", "查下用法", "怎么写", "如何实现", "语法"
                            ]
                            is_casual = any(p in lower_query for p in CASUAL_INSPECT_PATTERNS)
                            if is_research_permitted and not is_casual and top_score >= cls.AFFINITY_THRESHOLD:
                                result.skill_id = top_id
                                result.affinity_score = top_score
                                result.matched_reasons = top_reasons
                    elif top_id == "html-ppt":
                        # consulting-deck 技能门禁：必须包含明确的咨询/Deck意图，防止普通会议纪要或行动清单误触
                        HTML_PPT_INTENT = [
                            "consulting", "deck", "html deck", "html slides", "咨询", "html ppt", "html-ppt", "consulting-final-deck"
                        ]
                        has_html_ppt_intent = any(p in lower_query for p in HTML_PPT_INTENT)
                        if has_html_ppt_intent and top_score >= cls.AFFINITY_THRESHOLD:
                            result.skill_id = top_id
                            result.affinity_score = top_score
                            result.matched_reasons = top_reasons
                    else:
                        from .deliverable_contract import requests_markdown_artifact
                        is_explicit_markdown = requests_markdown_artifact(effective_query)
                        is_slide_or_ui = top_id in ("frontend-design", "guizang-ppt")
                        has_slide_intent = any(k in lower_query for k in ["ppt", "slides", "deck", "幻灯片", "演示文稿", "html", "网页", "交互式", "ui"])
                        if is_explicit_markdown and is_slide_or_ui and not has_slide_intent:
                            pass
                        elif top_score >= cls.AFFINITY_THRESHOLD:
                            result.skill_id = top_id
                            result.affinity_score = top_score
                            result.matched_reasons = top_reasons

        # 6. 前端网页/交互原型/游戏迭代上下文探测（如前轮生成了 HTML/游戏，本轮用户反馈 "加个悔棋"、"改一下颜色"）
        if not result.skill_id and existing_history:
            has_recent_html = False
            for h in reversed(existing_history[-4:]):
                if not isinstance(h, dict):
                    continue
                c = str(h.get("content", "")).lower()
                if any(k in c for k in ["```html", "交互式页面", "index.html", "gomoku", "canvas", "游戏", "原型"]):
                    has_recent_html = True
                    break
            if has_recent_html:
                game_iteration_cues = ["音效", "声音", "音乐", "修改", "改一下", "调整", "重新", "优化", "加个", "没有", "样式", "速度", "颜色", "按钮", "重开", "悔棋", "对战", "规则", "再加", "继续", "完善"]
                if any(cue in lower_query for cue in game_iteration_cues):
                    result.skill_id = "web-prototype"
                    result.is_design_intent = True

        # 6. 调研开关显式优先提权（用户在前端主动勾选了调研开关：只要开启了调研开关，就是优先启用）
        if allow_research and not result.skill_id and not is_network_search_forbidden(lower_query):
            CONFLICT_INTENTS = [
                "做ppt", "生成ppt", "制作ppt", "做个ppt", "ppt", "slides",
                "做个表", "生成excel", "导出excel", "xlsx",
                "生成word", "做个合同", "生成合同", "docx",
                "生成pdf", "导出pdf",
                "查看当前工作区", "查看工作区", "查看当前目录", "检查代码报错", "代码报错"
            ]
            is_conflicting = any(c in lower_query for c in CONFLICT_INTENTS)
            if not is_conflicting:
                result.skill_id = "research"
                result.affinity_score = 18.0
                result.matched_reasons = ["toggle:allow_research_prioritized(+18.0)"]
                result.is_research_intent = True
                result.is_inspect_intent = False

        # 7. 标记意图分类与读取技能内容
        if result.skill_id:
            if result.skill_id in ["guizang-ppt", "pptx", "slides", "html-ppt"]:
                result.is_ppt_intent = True
            elif result.skill_id in ["frontend-design", "dashboard", "saas-landing", "web-prototype", "taste-skill"]:
                result.is_design_intent = True
            elif result.skill_id == "docx":
                result.is_docx_intent = True
                result.is_office_intent = True
            elif result.skill_id in ["xlsx", "pdf"]:
                result.is_office_intent = True
            elif result.skill_id == "research":
                result.is_research_intent = True
                result.is_inspect_intent = False

            # 填充技能契约元数据 (deliverables, requires_execution, default_rounds)
            all_skills = available_skills or get_available_skills()
            for s in all_skills:
                if s.get("id") == result.skill_id or s.get("name") == result.skill_id:
                    skill_delivs = list(s.get("deliverables") or [])
                    skill_req_exec = bool(s.get("requires_execution", False))
                    skill_rounds = int(s.get("default_rounds") or 0)

                    # 核心解耦规则：仅当用户意图属于产物生成/输出时，才绑定交付物契约与执行强制要求。
                    # 当用户为纯查阅、阅读、分析、检查已有文件时，保留技能参考上下文，但不强制产物物理交付闭环。
                    if is_text_only_request(lower_query):
                        result.deliverables = []
                        result.requires_execution = False
                        result.default_rounds = min(skill_rounds, 3) if skill_rounds > 0 else 2
                    elif result.is_generate_intent:
                        inherited_delivs = list(result.deliverables) if result.deliverables else []
                        result.deliverables = [
                            d for d in skill_delivs
                            if not is_term_negated(lower_query, d)
                            and not is_term_negated(lower_query, d.lstrip("."))
                        ]
                        for idf in inherited_delivs:
                            if idf not in result.deliverables:
                                result.deliverables.append(idf)
                        for tf in target_files:
                            if tf not in result.deliverables:
                                result.deliverables.append(tf)
                        for tfmt in target_formats:
                            if tfmt not in result.deliverables:
                                result.deliverables.append(tfmt)
                        result.requires_execution = skill_req_exec and bool(result.deliverables)
                        result.default_rounds = skill_rounds
                    elif result.is_inspect_intent:
                        result.deliverables = []
                        result.requires_execution = False
                        result.default_rounds = min(skill_rounds, 3) if skill_rounds > 0 else 2
                    else:
                        # 兜底安全原则（Opt-in）：若无显式物理文件生成意图，绝不强行断言物理交付物！
                        result.deliverables = []
                        result.requires_execution = False
                        result.default_rounds = min(skill_rounds, 3) if skill_rounds > 0 else 3
                    break

            reasons_info = f" (亲和度得分: {result.affinity_score:.1f})" if result.affinity_score > 0 else ""
            print(f"🎯 [Skill Router] 命中意图规范: {result.skill_id}{reasons_info}，正在注入专业规范...", flush=True)
            result.skill_context = read_skill(result.skill_id, prompt=effective_query)

        # 8. 探测技术脚本与配置交付物意图 (Dockerfile, docker-compose, *.sh, *.sql, *.py, *.md, *.csv, *.json)
        # 保护原则：若已判定为纯查阅/只读意图，绝不扫描并强行开启生成！
        if not is_text_only_request(lower_query) and not (result.is_inspect_intent and not result.is_generate_intent):
            for tf in target_files:
                if tf not in result.deliverables:
                    result.deliverables.append(tf)
            for tfmt in target_formats:
                if tfmt not in result.deliverables:
                    result.deliverables.append(tfmt)

            tech_delivs = []
            if not is_term_negated(lower_query, "dockerfile") and re.search(r'\bdockerfile\b', lower_query):
                tech_delivs.append("Dockerfile")
            if not is_term_negated(lower_query, "docker-compose") and re.search(r'\bdocker-compose(?:\.ya?ml)?\b', lower_query):
                tech_delivs.append("docker-compose.yml")
            if not is_term_negated(lower_query, "脚本") and not is_term_negated(lower_query, ".sh"):
                for sh_m in re.findall(r'[\"“\'‘`「]?([a-zA-Z0-9_\-]+\.sh)[\"”\'’`」]?', effective_query):
                    tech_delivs.append(sh_m)
            if not is_term_negated(lower_query, ".sql") and not is_term_negated(lower_query, "sql"):
                for sql_m in re.findall(r'[\"“\'‘`「]?([a-zA-Z0-9_\-]+\.sql)[\"”\'’`」]?', effective_query):
                    tech_delivs.append(sql_m)
            if not is_term_negated(lower_query, ".py") and not is_term_negated(lower_query, "python"):
                for py_m in re.findall(r'[\"“\'‘`「]?([a-zA-Z0-9_\-]+\.py)[\"”\'’`」]?', effective_query):
                    tech_delivs.append(py_m)
            if not is_term_negated(lower_query, ".md") and not is_term_negated(lower_query, "markdown"):
                for md_m in re.findall(r'[\"“\'‘`「]?([a-zA-Z0-9_\-\u4e00-\u9fa5]+\.md)[\"”\'’`」]?', effective_query, re.I):
                    clean_md = re.sub(
                        r'^(?:读取|基于|根据|来自|从|查看|输入|将|把|上传的|附件|生成|制作|创建|导出|另存为|保存为|写成|整理并保存为|整理|编成|输出为|转为|转成|只要|要)+',
                        '',
                        md_m,
                        flags=re.I
                    ).strip().lstrip('“"\'`')
                    if clean_md and clean_md not in source_files and clean_md.lower() not in [s.lower() for s in source_files]:
                        tech_delivs.append(clean_md)

            if tech_delivs and any(p in lower_query for p in ["下载", "物理文件", "可下载", "生成", "编写", "创建", "提供", "保存为", "导出为", "另存为", "写成", "整理"]):
                for td in tech_delivs:
                    if td not in result.deliverables and td not in source_files and td.lower() not in [s.lower() for s in source_files]:
                        result.deliverables.append(td)
                result.is_generate_intent = True

        if result.is_research_intent or result.skill_id == "research":
            result.is_inspect_intent = False

        return result

    @classmethod
    def extract_entity_from_history(cls, history: Optional[List[Dict[str, Any]]]) -> Optional[str]:
        return extract_entity_from_history(history)

    @classmethod
    def resolve_contextual_query(cls, q: str, history: Optional[List[Dict[str, Any]]]) -> str:
        return resolve_contextual_query(q, history)
