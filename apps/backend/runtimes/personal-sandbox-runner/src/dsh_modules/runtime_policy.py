"""
Runtime policy configuration and execution budgets for DeepSeek Harness (dsh).
"""

import os
from dataclasses import dataclass


@dataclass
class RuntimePolicy:
    """
    Centralized execution budgets and runtime constraints.
    Supports environment variable overrides for custom sandboxes.
    """
    max_rounds: int = 3
    max_history_chars: int = 4000
    max_single_history_chars: int = 1000
    max_attachment_chars: int = 3500
    max_skill_chars: int = 1500
    max_tool_result_chars: int = 3000
    param_preview_chars: int = 80
    recent_history_save_count: int = 20
    single_request_timeout: int = 180
    total_task_timeout: int = 300
    timeout_seconds: int = 300
    timezone: str = "Asia/Shanghai"

    @classmethod
    def from_env(cls) -> "RuntimePolicy":
        """Factory method to load defaults with environment overrides."""
        single_to = int(os.getenv("DSH_SINGLE_TIMEOUT_SECONDS", "180"))
        total_to = int(os.getenv("DSH_TOTAL_TIMEOUT_SECONDS", os.getenv("DSH_TIMEOUT_SECONDS", "300")))
        return cls(
            max_rounds=int(os.getenv("DSH_MAX_ROUNDS", "3")),
            max_history_chars=int(os.getenv("DSH_MAX_HISTORY_CHARS", "4000")),
            max_single_history_chars=int(os.getenv("DSH_MAX_SINGLE_HISTORY_CHARS", "1000")),
            max_attachment_chars=int(os.getenv("DSH_MAX_ATTACHMENT_CHARS", "3500")),
            max_skill_chars=int(os.getenv("DSH_MAX_SKILL_CHARS", "1500")),
            max_tool_result_chars=int(os.getenv("DSH_MAX_TOOL_RESULT_CHARS", "3000")),
            param_preview_chars=int(os.getenv("DSH_PARAM_PREVIEW_CHARS", "80")),
            recent_history_save_count=int(os.getenv("DSH_RECENT_HISTORY_SAVE_COUNT", "20")),
            single_request_timeout=single_to,
            total_task_timeout=total_to,
            timeout_seconds=total_to,
            timezone=os.getenv("TZ", "Asia/Shanghai")
        )

    def determine_max_rounds(
        self,
        prompt: str,
        is_design_or_ppt: bool = False,
        is_search: bool = False,
        is_guide: bool = False
    ) -> int:
        """
        Dynamically adjusts maximum execution rounds based on task complexity.
        """
        if is_guide:
            return 2
        if is_design_or_ppt:
            return 4
        lower_prompt = prompt.lower()
        if any(w in lower_prompt for w in ["天气", "气温", "几度", "预报", "几点", "日期", "时间", "汇率"]):
            return 2
        if is_search:
            return 3
        return self.max_rounds
