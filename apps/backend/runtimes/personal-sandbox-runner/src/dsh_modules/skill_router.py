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
    '意思', '逻辑', '业务', '语法', '英文', '不同', '解释'
}

GENERIC_VERBS = {'生成', '制作', '创建', '做', '写', '导出', '设计', '开发', '处理', '新建'}

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
    "命令说明", "参数说明", "写法说明", "语法说明", "是什么", "有什么用"
]

GENERATE_ACTION_PATTERNS = [
    "生成", "制作", "创建", "导出", "新建", "做个", "做一份", "做一张", "做个表", "做个ppt", "做个幻灯片",
    "写一份", "写个", "写出", "输出", "输出为", "保存为", "转为", "转成", "落盘", "另存为", "写成",
    "generate", "create", "export", "build", "make", "produce"
]

INSPECT_ACTION_PATTERNS = [
    "查看", "阅读", "查阅", "读取", "看下", "看一下", "看看", "检查", "分析", "审阅", "浏览",
    "排查", "检索", "探查", "诊断", "查下", "查一下", "搜索", "搜下", "搜一下", "提取内容", "问答",
    "帮我看", "看代码", "查代码", "read", "view", "inspect", "check", "examine", "analyze", "cat", "show"
]

CONTENT_QUERY_PATTERNS = [
    "内容是什么", "有什么内容", "写了什么", "讲了什么", "包含什么", "里面有", "里面写了", "里写了"
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
    ".pdf", ".docx", ".xlsx", ".pptx", ".html", ".csv", ".json", ".md",
    "pdf", "word", "excel", "ppt", "html", "markdown", "md文件", "md 文件", "表格", "幻灯片", "演示文稿", "报表",
    "代码文件", "脚本", "落地文件", "物理文件", "本地文件", "单页", "原型", "看板", "网页", "单页报告"
]


def check_generation_target_is_physical(lower_q: str) -> bool:
    """
    Distinguishes whether a generative action targets a physical file deliverable
    (.pdf, .docx, .xlsx, .pptx, etc.) or pure in-chat textual content (summary, outline, advice).
    """
    # 查找生成动词后紧随的目标词
    m = re.search(r'(?:生成|导出|制作|创建|做|写|输出为|保存为|转为|转成|输出)\s*(?:一份|一个|一张|一段|出|成|为)?\s*([a-zA-Z0-9_\-\u4e00-\u9fa5\.]+)', lower_q)
    if not m:
        return any(p in lower_q for p in [".pdf", ".docx", ".xlsx", ".pptx", ".html", ".md", "word", "excel", "ppt", "html", "markdown", "md 文件", "导出为", "保存为"])
    target = m.group(1).strip()
    has_physical = any(p in target for p in PHYSICAL_DELIVERABLE_TARGETS) or any(ext in lower_q for ext in [".pdf", ".docx", ".xlsx", ".pptx", ".html", ".md", "word", "excel", "ppt", "html", "markdown", "md 文件", "导出为", "保存为"])
    has_text_only = any(t in target for t in TEXT_ONLY_ACTION_TARGETS)
    if has_text_only and not any(p in target for p in PHYSICAL_DELIVERABLE_TARGETS):
        # 即使整句有通用词（如查看文档），若生成部分紧接纯文本目标且无显式物理介质词
        if not any(ext in lower_q for ext in [".pdf", ".docx", ".xlsx", ".pptx", ".html", ".md", "word", "excel", "ppt", "html", "markdown", "md 文件", "保存为", "导出为", "另存为", "写成文件", "生成文件"]):
            return False
    return has_physical


def resolve_file_action_intent(query: str, history: Optional[List[Dict[str, Any]]] = None) -> Tuple[bool, bool]:
    """
    Semantically resolves whether user intent is physical file generation (is_generate_intent)
    or read-only inspection/analysis (is_inspect_intent).
    Returns (is_generate_intent, is_inspect_intent).
    """
    if not query:
        return False, False

    lower_q = query.lower().strip()

    # 1. 显式生成类 Slash 命令（确定性 100% 具有产物生成交付意图）
    if lower_q.startswith(("/", "／")):
        cmd = lower_q.split()[0].lstrip("/／")
        if cmd in GENERATIVE_SLASH_COMMANDS:
            return True, False

    # 2. 基础谓词模式检测
    has_inspect = any(k in lower_q for k in INSPECT_ACTION_PATTERNS) or any(k in lower_q for k in CONTENT_QUERY_PATTERNS)
    has_generate = any(k in lower_q for k in GENERATE_ACTION_PATTERNS)

    # 3. 语法结构与消歧分析
    if has_inspect and not has_generate:
        # 纯查看/查阅/分析意图（如：“查看文件内容”、“查看 sample.pdf”、“分析销售数据”）
        return False, True

    if has_generate and not has_inspect:
        # 纯生成/导出/创建意图：进一步区分是物理文件交付还是纯文本创作（如“生成一份总结”）
        is_physical = check_generation_target_is_physical(lower_q)
        if is_physical:
            return True, False
        else:
            # 纯文本创作（如“生成一份总结”、“写个大纲”）
            return False, False

    if has_inspect and has_generate:
        # 同时包含查阅与生成动词时的结构分析：
        # 情况 A: 主语/谓词为查看，修饰语包含生成（如：“查看生成的文件”、“看看刚才导出的pdf”、“检查已生成的代码”）
        # 此时核心动作仍是“查看”，绝非要求重新生成文件！
        if re.search(r'(查看|看下|看一下|看看|检查|阅读|查阅|分析|浏览)\s*(?:刚才|之前|已|历史|沙箱)?\s*(生成|输出|制作|导出|新建)的?', lower_q):
            return False, True

        # 情况 B: 查阅并在其基础上进行后续产出
        is_physical = check_generation_target_is_physical(lower_q)
        if is_physical:
            # 查阅并在其基础上生成新物理文件（如：“分析数据并生成报告pdf”、“读取文件后输出为Word”）
            return True, True
        else:
            # 查阅并生成纯文本总结/分析（如：“查看文档的内容，然后生成一份总结”、“分析材料给出建议”）
            # 此时交付载体为聊天文本，绝不属于物理文件生成！
            return False, True

    # 4. 上下文追问/确认探测（例如上一轮提供了方案，本轮用户回复“确认生成”、“导出”、“1”）
    if history and lower_q in ["1", "1.", "一是", "第一个", "确认", "生成", "导出", "确认生成", "请生成"]:
        for h in reversed(history[-4:]):
            if not isinstance(h, dict):
                continue
            c = str(h.get("content", "")).lower()
            if any(k in c for k in ["pdf", "word", "excel", "ppt", "导出", "生成文档", "fpdf", "docx", "xlsx"]):
                return True, False

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
    if has_pronoun or len(clean_topic) <= 6:
        ent = extract_entity_from_history(history)
        if ent:
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
            desc_features = extract_query_features(desc_text)
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
                if trig in lower_q or trig in cleaned_q or trig in normalized_q_no_de:
                    t_score = 12.0 + len(trig) * 1.5
                    score += t_score
                    reasons.append(f'trigger:{trig}(+{t_score:.1f})')
                    break

            # 2. Skill ID or Alias Direct Mention
            if s_id in lower_q or any(a in lower_q for a in data['aliases']):
                score += 12.0
                reasons.append('id/alias(+12.0)')

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
        allow_research: bool = False
    ) -> SkillRoutingResult:
        """
        Determines skill and intent for a given prompt via semantic affinity matching.
        """
        effective_query = prompt
        # 提取上传附件或有效附件信息，用于指代消歧与多模态文件亲和度解析
        attached_files: List[str] = []
        att_match = re.search(r'【(?:当前轮次用户上传附件|当前会话有效附件清单)】:\s*([^（\n]+)', prompt)
        if att_match:
            raw_files = att_match.group(1).split(",")
            for rf in raw_files:
                clean_f = rf.strip()
                if clean_f and "." in clean_f:
                    attached_files.append(clean_f)

        if "用户指令：" in prompt:
            effective_query = prompt.split("用户指令：")[-1].strip()
        elif "用户指令:" in prompt:
            effective_query = prompt.split("用户指令:")[-1].strip()

        lower_query = effective_query.lower().strip()
        result = SkillRoutingResult()

        # 1. 探测知识库检索意图（精确词组）
        result.is_knowledge_intent = any(k in lower_query for k in KNOWLEDGE_PATTERNS)

        # 2. 探测文件外发意图
        result.is_send_intent = any(k in lower_query for k in SEND_PATTERNS)

        # 3. 探测动作指令与知识/教程问答模态消歧
        result.is_guide_intent = any(k in lower_query for k in GUIDE_PATTERNS)

        # 4. 探测全网实时检索与最新动态意图（开放域外部资讯/开源生态/最新发布/会议展会时间，而非本地工作区）
        SEARCH_CUES = [
            "最新的", "最新", "最近", "近期", "当前最", "最热门", "热门", "新出", "最新发布",
            "外部生态", "开源社区", "社区生态", "网上", "全网", "市场动态",
            "近年", "近几年", "历年", "历届", "举办时间", "什么时候举办", "什么时候开", "召开时间"
        ]
        LOCAL_DISAMBIGUATION = [
            "工作区", "当前目录", "本地文件", "已上传", "生成的", "刚才生成", "历史", "附件"
        ]
        is_asking_local = any(loc in lower_query for loc in LOCAL_DISAMBIGUATION)
        result.is_search_intent = any(cue in lower_query for cue in SEARCH_CUES) and not is_asking_local

        # 仅当不是知识/教程问答且不是开放域最新信息检索时，进行结构化文件动作意图解析
        is_gen, is_insp = resolve_file_action_intent(effective_query, existing_history)
        result.is_generate_intent = is_gen
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

        # 4. 语义亲和度路由器（Semantic Router，彻底替代静态白名单）
        if not result.skill_id:
            all_skills = available_skills or get_available_skills()
            if all_skills:
                matcher = SemanticSkillMatcher(all_skills)
                semantic_query = effective_query
                EXPLICIT_FORMAT_CUES = [".pdf", ".docx", ".xlsx", ".pptx", ".html", "pdf", "word", "excel", "ppt", "表格", "幻灯片", "演示文稿", "报表", "海报", "图片", "代码"]
                has_explicit_format = any(fmt in lower_query for fmt in EXPLICIT_FORMAT_CUES)
                if attached_files and not has_explicit_format:
                    semantic_query = f"{effective_query} {' '.join(attached_files)}"
                matches = matcher.match(semantic_query)
                if matches:
                    top_id, top_score, top_reasons = matches[0]
                    # 门禁控制：深度调研 (research) 技能必须有明确指示才启用
                    # 1) allow_research 为 True（前端勾选了调研开关）
                    # 2) 或者包含明确的强调研意图短语（如深度调研、技术调研、竞品调研、技术选型对比等）
                    # 简单的查看、日常问询、代码检查等严禁触发 research
                    if top_id == "research":
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
                    else:
                        if top_score >= cls.AFFINITY_THRESHOLD:
                            result.skill_id = top_id
                            result.affinity_score = top_score
                            result.matched_reasons = top_reasons

        # 5. 上下文追问/确认探测（如前轮涉及 PDF 制作，本轮用户仅回复 "1" 或 "确认生成"）
        if not result.skill_id and existing_history and lower_query in ["1", "1.", "一是", "第一个", "确认", "生成", "导出"]:
            for h in reversed(existing_history[-4:]):
                if not isinstance(h, dict):
                    continue
                c = str(h.get("content", "")).lower()
                if any(k in c for k in ["pdf", "导出", "生成文档", "fpdf", "notosans"]):
                    result.skill_id = "pdf"
                    break

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
        if allow_research and not result.skill_id:
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
                    if result.is_generate_intent:
                        result.deliverables = skill_delivs
                        result.requires_execution = skill_req_exec
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

        if result.is_research_intent or result.skill_id == "research" or allow_research:
            result.is_inspect_intent = False

        return result

    @classmethod
    def extract_entity_from_history(cls, history: Optional[List[Dict[str, Any]]]) -> Optional[str]:
        return extract_entity_from_history(history)

    @classmethod
    def resolve_contextual_query(cls, q: str, history: Optional[List[Dict[str, Any]]]) -> str:
        return resolve_contextual_query(q, history)
