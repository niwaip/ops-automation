"""
Telemetry tracking, performance metrics, and DSH protocol event emission.
"""

import json
from dataclasses import dataclass, field
from typing import Dict, Any, List


@dataclass
class TelemetryStats:
    """Tracks execution latency, tool calls, and token usage."""
    ttft_ms: float = 0.0
    total_ms: float = 0.0
    wall_clock_ms: float = 0.0
    tool_invocations: int = 0
    llm_invocations: int = 0
    tokens: Dict[str, Any] = field(default_factory=dict)
    finish_reason: str = "stop"

    def record_llm_response(self, llm_res: Any, is_first_round: bool = False) -> None:
        """Accumulates latency and usage from an LLM call response across rounds."""
        if not isinstance(llm_res, dict):
            return

        self.llm_invocations += 1
        self.total_ms += llm_res.get("total_ms", 0)
        if is_first_round:
            self.ttft_ms = llm_res.get("ttft_ms", 0)
        new_usage = llm_res.get("usage")
        if new_usage and isinstance(new_usage, dict):
            if not self.tokens:
                self.tokens = {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0
                }
            for k in ["prompt_tokens", "completion_tokens", "total_tokens"]:
                if k in new_usage and isinstance(new_usage[k], (int, float)):
                    self.tokens[k] = self.tokens.get(k, 0) + int(new_usage[k])
            for k, v in new_usage.items():
                if k not in ["prompt_tokens", "completion_tokens", "total_tokens"]:
                    self.tokens[k] = v
        self.finish_reason = llm_res.get("finish_reason", "stop")

    def record_tool_call(self) -> None:
        """Increments tool invocation counter."""
        self.tool_invocations += 1

    def set_wall_clock_duration(self, ms: float) -> None:
        """Sets overall end-to-end wall clock execution duration."""
        self.wall_clock_ms = max(0.0, float(ms))

    def to_metrics_json(self) -> str:
        """Serializes metrics dictionary to JSON string."""
        effective_duration = self.wall_clock_ms if self.wall_clock_ms > 0 else self.total_ms
        data = {
            "ttftMs": self.ttft_ms,
            "durationMs": round(effective_duration, 2),
            "llmDurationMs": round(self.total_ms, 2),
            "toolCallsCount": self.tool_invocations,
            "tokens": self.tokens,
            "finishReason": self.finish_reason
        }
        return json.dumps(data, ensure_ascii=False)

    def emit_metrics_event(self) -> None:
        """Prints DSH protocol metric event to stdout."""
        print(f"\n<<<DSH_METRICS:{self.to_metrics_json()}>>>", flush=True)

    @staticmethod
    def emit_outbound_files(files: List[str]) -> None:
        """Prints outbound file protocol markers."""
        for f in files:
            print(f"\n<<<DSH_OUTBOUND_FILE:{f}>>>", flush=True)

    @staticmethod
    def emit_final_output(text: str) -> None:
        """Prints final clean answer delimiter."""
        print("\n<<<DSH_FINAL_OUTPUT>>>\n" + text, flush=True)
