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
    max_attachment_chars: int = 12000
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
    model_max_retries: int = 3
    vision_timeout: int = 60

    @classmethod
    def from_env(cls) -> "RuntimePolicy":
        """Factory method to load defaults with environment overrides."""
        single_to = int(os.getenv("DSH_SINGLE_TIMEOUT_SECONDS", "180"))
        total_to = int(os.getenv("DSH_TOTAL_TIMEOUT_SECONDS", os.getenv("DSH_TIMEOUT_SECONDS", "300")))
        return cls(
            max_rounds=int(os.getenv("DSH_MAX_ROUNDS", "3")),
            max_history_chars=int(os.getenv("DSH_MAX_HISTORY_CHARS", "16000")),
            max_single_history_chars=int(os.getenv("DSH_MAX_SINGLE_HISTORY_CHARS", "4000")),
            max_attachment_chars=int(os.getenv("DSH_MAX_ATTACHMENT_CHARS", "12000")),
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
            model_max_retries=int(os.getenv("DSH_MODEL_MAX_RETRIES", "3")),
            vision_timeout=int(os.getenv("DSH_VISION_TIMEOUT", "60"))
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
        if is_insp and not is_gen:
            return 3

        # 1. 显式契约轮数优先
        if default_rounds > 0:
            return default_rounds
        if skill_res and getattr(skill_res, "default_rounds", 0) > 0:
            return skill_res.default_rounds

        # 2. 交付物或执行要求：契约驱动 (PDF/Word/Excel/HTML等标准复杂交付物需要 4-5 轮)
        delivs = deliverables or (getattr(skill_res, "deliverables", None) if skill_res else None) or []
        req_exec = requires_execution or (getattr(skill_res, "requires_execution", False) if skill_res else False)
        if delivs or req_exec or is_office:
            return 5

        if is_design_or_ppt or (skill_res and (getattr(skill_res, "is_ppt_intent", False) or getattr(skill_res, "is_design_intent", False))):
            return 4

        lower_prompt = prompt.lower()
        # 兼容无技能上下文时的兜底探测（如用户输入文件生成指令但未匹配技能）
        is_prompt_deliverable = (
            any(w in lower_prompt for w in ["生成文件", "导出文件", "制作文件", "写入文件", "输出文件"]) or
            (any(v in lower_prompt for v in ["生成", "导出", "输出", "制作", "创建", "做个", "做一份", "写一份", "转为", "转成"]) and
             any(ext in lower_prompt for ext in [".pdf", ".docx", ".xlsx", ".csv", ".json", ".md", "pdf", "word", "excel", "ppt", "markdown", "md 文件", "表格", "文档", "报表"]))
        )
        if is_prompt_deliverable:
            return 5

        # 纯事实/即时信息查询（无文档生成要求）仅需检索 + 总结 2 轮
        if any(w in lower_prompt for w in ["天气", "气温", "几度", "预报", "几点", "日期", "时间", "汇率"]):
            return 2

        if is_search:
            return 3

        return self.max_rounds
