"""
Runtime policy configuration and execution budgets for DeepSeek Harness (dsh).
"""

import os
from dataclasses import dataclass
from typing import Optional, List, Any


@dataclass
class RuntimePolicy:
    """
    Centralized execution budgets and runtime constraints.
    Supports environment variable overrides for custom sandboxes.
    """
    max_rounds: int = 3
    max_history_chars: int = 16000
    max_single_history_chars: int = 4000
    max_attachment_chars: int = 24000
    max_skill_chars: int = 12000
    max_tool_result_chars: int = 10000
    param_preview_chars: int = 80
    recent_history_save_count: int = 20
    single_request_timeout: int = 180
    total_task_timeout: int = 300
    timeout_seconds: int = 300
    timezone: str = "Asia/Shanghai"
    temperature: float = 0.4
    max_tokens: int = 16384
    model_socket_timeout: int = 60
    # Upstream proxy may transiently return 500/502/reset. Allow 2 retries by default.
    model_max_retries: int = 2
    vision_timeout: int = 60
    thinking: bool = False
    reasoning_effort: Optional[str] = None
    allow_unverified_chart_fallback: bool = False

    @classmethod
    def from_env(cls) -> "RuntimePolicy":
        """Factory method to load defaults with environment overrides."""
        single_to = int(os.getenv("DSH_SINGLE_TIMEOUT_SECONDS", "180"))
        total_to = int(os.getenv("DSH_TOTAL_TIMEOUT_SECONDS", os.getenv("DSH_TIMEOUT_SECONDS", "300")))
        thinking_env = os.getenv("DSH_THINKING", "").lower() in ("true", "1", "yes")
        reasoning_effort_env = os.getenv("DSH_REASONING_EFFORT", None) or None
        allow_unverified_env = os.getenv("DSH_CHART_ALLOW_UNVERIFIED_FALLBACK", "").lower() in ("true", "1", "yes")
        return cls(
            max_rounds=int(os.getenv("DSH_MAX_ROUNDS", "3")),
            max_history_chars=int(os.getenv("DSH_MAX_HISTORY_CHARS", "16000")),
            max_single_history_chars=int(os.getenv("DSH_MAX_SINGLE_HISTORY_CHARS", "4000")),
            max_attachment_chars=int(os.getenv("DSH_MAX_ATTACHMENT_CHARS", "24000")),
            max_skill_chars=int(os.getenv("DSH_MAX_SKILL_CHARS", "12000")),
            max_tool_result_chars=int(os.getenv("DSH_MAX_TOOL_RESULT_CHARS", "10000")),
            param_preview_chars=int(os.getenv("DSH_PARAM_PREVIEW_CHARS", "80")),
            recent_history_save_count=int(os.getenv("DSH_RECENT_HISTORY_SAVE_COUNT", "20")),
            single_request_timeout=single_to,
            total_task_timeout=total_to,
            timeout_seconds=total_to,
            timezone=os.getenv("TZ", "Asia/Shanghai"),
            temperature=float(os.getenv("DSH_TEMPERATURE", "0.4")),
            max_tokens=int(os.getenv("DSH_MAX_TOKENS", "16384")),
            model_socket_timeout=int(os.getenv("DSH_MODEL_SOCKET_TIMEOUT", "60")),
            model_max_retries=int(os.getenv("DSH_MODEL_MAX_RETRIES", "2")),
            vision_timeout=int(os.getenv("DSH_VISION_TIMEOUT", "60")),
            thinking=thinking_env,
            reasoning_effort=reasoning_effort_env,
            allow_unverified_chart_fallback=allow_unverified_env
        )

    def determine_max_rounds(
        self,
        prompt: str,
        is_design_or_ppt: bool = False,
        is_search: bool = False,
        is_guide: bool = False,
        is_office: bool = False,
        skill_res: Optional[Any] = None,
        deliverables: Optional[List[str]] = None,
        requires_execution: bool = False,
        default_rounds: int = 0,
        is_generate_intent: bool = False,
        is_inspect_intent: bool = False
    ) -> int:
        """
        Dynamically adjusts maximum execution rounds based on task complexity.
        Uses contract-driven budgeting when a skill is active, with backward-compatible fallbacks.
        """
        if is_guide or (skill_res and getattr(skill_res, "is_guide_intent", False)):
            return 2

        # 0. 纯查阅/阅读/分析意图：严禁按复杂交付物预算，只需 2-3 轮（读取+回答）
        is_insp = is_inspect_intent or (skill_res and getattr(skill_res, "is_inspect_intent", False))
        is_gen = is_generate_intent or (skill_res and getattr(skill_res, "is_generate_intent", False))
        lower_prompt = prompt.lower()
        has_chart_or_visual = any(w in lower_prompt for w in [
            "柱状图", "折线图", "饼图", "散点图", "雷达图", "图表", "可视化", "html", "看板", "绘图", "画图", "生成图"
        ])
        if is_insp and not is_gen and not has_chart_or_visual:
            return 3

        # 1. 显式契约轮数优先
        if default_rounds > 0:
            return default_rounds
        if skill_res and getattr(skill_res, "default_rounds", 0) > 0:
            return skill_res.default_rounds

        # 2. 交付物或执行要求：契约驱动 (PDF/Word/Excel/HTML/图表等标准交付物)
        delivs = deliverables or (getattr(skill_res, "deliverables", None) if skill_res else None) or []
        req_exec = requires_execution or (getattr(skill_res, "requires_execution", False) if skill_res else False)
        is_prompt_deliverable = (
            has_chart_or_visual or
            any(w in lower_prompt for w in ["生成文件", "导出文件", "制作文件", "写入文件", "输出文件"]) or
            (any(v in lower_prompt for v in ["生成", "导出", "输出", "制作", "创建", "做个", "做一份", "写一份", "转为", "转成"]) and
             any(ext in lower_prompt for ext in [".pdf", ".docx", ".xlsx", ".csv", ".json", ".md", ".html", "pdf", "word", "excel", "ppt", "markdown", "md 文件", "表格", "文档", "报表", "图表", "柱状图", "折线图", "饼图"]))
        )

        # 检查是否为复合多阶段任务（包含全网调研/多轮搜索/热点探索 + 交付物落地，或表格统计 + 图表可视化）
        has_open_search_or_research = (
            is_search or
            getattr(skill_res, "is_research_intent", False) or
            any(k in lower_prompt for k in [
                "热点", "热搜", "bilibili", "b站", "微博", "知乎", "百度", "联网",
                "调研", "竞品", "最新动态", "实时动态", "全网", "检索", "搜索引擎"
            ])
        )

        is_complex_spreadsheet_mutation = (
            any(k in lower_prompt for k in [
                "更新预实", "复制最新", "复制sheet", "新sheet", "更新工数", "更新预测", "更新计划", "回填预测", "更新表格"
            ])
            or (req_exec and ("xlsx" in lower_prompt or "excel" in lower_prompt or is_office))
        )

        # 表格分析与图表可视化并存的复合任务，给予复合任务预算
        has_spreadsheet_chart_composite = has_chart_or_visual and (
            is_office or req_exec or any(k in lower_prompt for k in ["统计", "合计", "明细", "表格", "excel", "xlsx", "数据", "部门"])
        )

        if delivs or req_exec or is_office or is_prompt_deliverable or has_chart_or_visual:
            if has_open_search_or_research or is_complex_spreadsheet_mutation or has_spreadsheet_chart_composite:
                return int(os.getenv("DSH_COMPOSITE_MAX_ROUNDS", "8"))
            return int(os.getenv("DSH_MAX_DELIVERABLE_ROUNDS", "5"))

        if is_design_or_ppt or (skill_res and (getattr(skill_res, "is_ppt_intent", False) or getattr(skill_res, "is_design_intent", False))):
            return 4

        # 纯事实/即时信息查询（无文档生成要求）仅需检索 + 总结 2 轮
        if any(w in lower_prompt for w in ["天气", "气温", "几度", "预报", "几点", "日期", "时间", "汇率"]):
            return 2

        if is_search:
            return 3

        return self.max_rounds
