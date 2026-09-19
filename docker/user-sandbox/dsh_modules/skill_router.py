"""
Intent routing and skill matching registry for DeepSeek Harness (dsh).
Provides high-precision intent sniffing and explicit slash-command routing,
preventing broad keyword false-positives while allowing autonomous read_skill fallback.
"""

import re
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
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


# 精确意图规则集：采用特定词组或命令，杜绝 "页面"、"画"、"换成"、"以前的" 等宽泛单字造成的灾难性误判
HIGH_CONFIDENCE_RULES = {
    "guizang-ppt": [
        "做ppt", "生成ppt", "制作ppt", "ppt演示", "做幻灯片", "制作幻灯片",
        "生成幻灯片", "演示文稿", "做个deck", "做个汇报ppt", "设计ppt",
        "ppt报告", "生成ppt报告", "做ppt报告", "制作ppt报告",
        "html报告", "生成html报告", "html的报告", "生成html的报告", "制作html报告",
        "网页报告", "生成网页报告", "交互式报告", "生成交互式报告", "web报告",
        "做演示文稿", "生成演示文稿", "制作演示文稿", "汇报演示文稿",
        "html演示文稿", "生成html演示文稿"
    ],
    "image-gen": [
        "画一张图", "生成图片", "ai绘图", "ai生图", "设计logo", "做个海报",
        "以图生图", "重绘图片", "文生图", "图生图", "画个插画", "画一幅画"
    ],
    "pdf": [
        "导出pdf", "生成pdf", "转成pdf", "转pdf", "doc转pdf", "docx转pdf", "制作pdf"
    ],
    "xlsx": [
        "生成excel", "导出excel", "做个表格", "生成表格", "csv转excel", "整理成表格", "导出xlsx"
    ],
    "docx": [
        "生成word", "导出word", "起草合同", "编写word", "生成docx", "word文档"
    ],
    "internal-comms": [
        "故障通报", "复盘报告", "系统维护通报", "发布公告", "内部通告", "写周报", "写月报"
    ],
    "doc-coauthoring": [
        "技术方案设计", "起草prd", "需求文档编制", "设计方案起草", "架构方案起草"
    ]
}

SEND_PATTERNS = [
    "通过微信发送", "发送到微信", "发到微信", "发我微信", "微信发我",
    "微信推送", "发送给用户微信", "推送给我微信", "发送文件给用户"
]

KNOWLEDGE_PATTERNS = [
    "个人空间", "知识库", "知识空间", "我的个人文档", "personal knowledge"
]


class SkillRouter:
    """Routes queries to skills using slash commands, precise manifests, or LLM fallback."""

    @classmethod
    def route(cls, prompt: str, existing_history: Optional[List[Dict[str, Any]]] = None) -> SkillRoutingResult:
        """
        Determines skill and intent for a given prompt.
        """
        # 如果 prompt 包含前置上下文（如 【当前会话有效附件清单】... 用户指令：...），
        # 路由核心意图应当提取真正的用户指令，避免附件后缀名（如 .pdf, .xlsx）劫持用户意图
        effective_query = prompt
        if "用户指令：" in prompt:
            effective_query = prompt.split("用户指令：")[-1].strip()
        elif "用户指令:" in prompt:
            effective_query = prompt.split("用户指令:")[-1].strip()

        lower_query = effective_query.lower().strip()
        lower_prompt = prompt.lower().strip()
        result = SkillRoutingResult()

        # 1. 探测知识库检索意图（精确词组，避免单字误判）
        result.is_knowledge_intent = any(k in lower_query for k in KNOWLEDGE_PATTERNS)

        # 2. 探测文件外发意图
        result.is_send_intent = any(k in lower_query for k in SEND_PATTERNS)

        # 3. 显式 Slash 命令优先匹配（确定性 100%）
        if lower_query.startswith("/ppt") or lower_query.startswith("/slides"):
            result.skill_id = "guizang-ppt"
        elif lower_query.startswith("/image") or lower_query.startswith("/draw"):
            result.skill_id = "image-gen"
        elif lower_query.startswith("/pdf"):
            result.skill_id = "pdf"
        elif lower_query.startswith("/excel") or lower_query.startswith("/table"):
            result.skill_id = "xlsx"
        elif lower_query.startswith("/word") or lower_query.startswith("/doc"):
            result.skill_id = "docx"
        elif lower_query.startswith("/design") or lower_query.startswith("/ui"):
            result.skill_id = "frontend-design"

        # 4. 高置信度精确动宾关键词规则优先匹配（如 "生成ppt", "导出excel" 优先级高于单一名词 trigger 如 "pdf"）
        if not result.skill_id:
            for skill_id, keywords in HIGH_CONFIDENCE_RULES.items():
                if any(kw in lower_query for kw in keywords):
                    result.skill_id = skill_id
                    break

        # 5. 特殊场景：UI / 前端原型变种检测
        if not result.skill_id:
            if "dashboard设计" in lower_query or "做个看板" in lower_query or "看板设计" in lower_query:
                result.skill_id = "dashboard"
            elif "landing设计" in lower_query or "saas landing" in lower_query or "官网设计" in lower_query:
                result.skill_id = "saas-landing"
            elif "web原型" in lower_query or "前端原型" in lower_query:
                result.skill_id = "web-prototype"
            elif "ui原型" in lower_query or "页面原型" in lower_query:
                result.skill_id = "frontend-design"

        # 6. 动态发现技能（从 manifest.json 或 SKILL.md 解析出的 triggers）匹配
        available_skills = get_available_skills()
        if not result.skill_id:
            for s in available_skills:
                for trig in s.get("triggers", []):
                    # 避免极短字符或在附件名列表中的误触，作用于用户真实指令
                    if trig and len(trig) >= 2 and trig in lower_query:
                        result.skill_id = s["id"]
                        break
                if result.skill_id:
                    break

        # 7. 上下文确认探测（如前轮涉及 PDF 制作，本轮用户仅回复 "1" 或 "确认生成"）
        if not result.skill_id and existing_history and lower_query in ["1", "1.", "一是", "第一个", "确认", "生成", "导出"]:
            for h in reversed(existing_history[-4:]):
                if not isinstance(h, dict):
                    continue
                c = str(h.get("content", "")).lower()
                if any(k in c for k in ["pdf", "导出", "生成文档", "fpdf", "notosans"]):
                    result.skill_id = "pdf"
                    break

        # 7.2 前端网页/交互原型/游戏迭代上下文探测（如前轮生成了 HTML/游戏，本轮用户反馈 "没有音效"、"加个悔棋"、"改一下颜色"）
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

        # 8. 用户自定义技能探测 (/knowledge/skills)
        if not result.skill_id:
            for cs in available_skills:
                if cs.get("type") == "custom":
                    c_id = cs.get("id", "").lower()
                    c_name = cs.get("name", "").lower() if cs.get("name") else ""
                    if (c_id and c_id in lower_query) or (c_name and c_name in lower_query):
                        result.skill_id = cs["id"]
                        break

        # 9. 标记意图分类与读取技能内容
        if result.skill_id:
            if result.skill_id == "guizang-ppt":
                result.is_ppt_intent = True
            elif result.skill_id in ["frontend-design", "dashboard", "saas-landing", "web-prototype"]:
                result.is_design_intent = True

            print(f"🎯 [Skill Router] 命中意图规范: {result.skill_id}，正在注入专业规范...", flush=True)
            result.skill_context = read_skill(result.skill_id)

        return result
