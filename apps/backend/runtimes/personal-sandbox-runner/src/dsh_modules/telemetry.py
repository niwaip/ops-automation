"""
Telemetry tracking, performance metrics, and DSH protocol event emission.
"""

import json
import re
from dataclasses import dataclass, field
from typing import Dict, Any, List, Tuple


def format_dsh_marker(tag: str, payload: str) -> str:
    """Formats a length-prefixed DSH protocol marker to prevent >>> truncation."""
    p_str = str(payload) if payload is not None else ""
    utf16_len = len(p_str.encode("utf-16-le")) // 2
    return f"<<<DSH_{tag}:len={utf16_len}:{p_str}>>>"


def extract_dsh_markers(text: str, tag: str) -> List[Tuple[str, int, int]]:
    """
    Extracts markers of the form <<<DSH_{tag}:len={len}:{payload}>>> or legacy <<<DSH_{tag}:{payload}>>>.
    Robust against >>> inside payload strings.
    Returns list of (payload, start_pos, end_pos).
    """
    if not text:
        return []

    results = []
    prefix = f"<<<DSH_{tag}:"
    curr_pos = 0

    while True:
        idx = text.find(prefix, curr_pos)
        if idx == -1:
            break

        after_prefix = idx + len(prefix)
        len_match = re.match(r'^len=(\d+):', text[after_prefix:])
        matched_len = False
        if len_match:
            try:
                payload_len = int(len_match.group(1))
                payload_start = after_prefix + len(len_match.group(0))

                # 1. 尝试直接以 Python 字符/代码点长度匹配
                payload_end = payload_start + payload_len
                if text[payload_end:payload_end + 3] == ">>>":
                    payload = text[payload_start:payload_end]
                    marker_end = payload_end + 3
                    results.append((payload, idx, marker_end))
                    curr_pos = marker_end
                    matched_len = True
                else:
                    # 2. 尝试以 UTF-16 代码单元长度进行映射匹配（消除 emoji 等代理对字符长度偏移）
                    prefix_utf16 = len(text[:payload_start].encode("utf-16-le")) // 2
                    target_utf16 = prefix_utf16 + payload_len
                    encoded = text.encode("utf-16-le")
                    target_bytes = target_utf16 * 2
                    if target_bytes <= len(encoded):
                        cand_text = encoded[:target_bytes].decode("utf-16-le", errors="ignore")
                        cand_end = len(cand_text)
                        if text[cand_end:cand_end + 3] == ">>>":
                            payload = text[payload_start:cand_end]
                            marker_end = cand_end + 3
                            results.append((payload, idx, marker_end))
                            curr_pos = marker_end
                            matched_len = True

                # 3. 容错降级：在已识别 len= 前缀的情况下，从 payload_start（严禁从 after_prefix）寻找闭合 >>>
                if not matched_len:
                    arrow_idx = text.find(">>>", payload_start)
                    if arrow_idx != -1:
                        raw_payload = text[payload_start:arrow_idx]
                        payload = re.sub(r'^len=\d+:\s*', '', raw_payload).strip()
                        marker_end = arrow_idx + 3
                        results.append((payload, idx, marker_end))
                        curr_pos = marker_end
                        matched_len = True
            except (ValueError, IndexError):
                pass

        if matched_len:
            continue

        # Legacy JSON decoder fallback
        try:
            decoder = json.JSONDecoder()
            _, json_end = decoder.raw_decode(text, after_prefix)
            rest = text[json_end:]
            m_arrow = re.match(r'^\s*>>>', rest)
            if m_arrow:
                marker_end = json_end + len(m_arrow.group(0))
                raw_payload = text[after_prefix:json_end].strip()
                payload = re.sub(r'^len=\d+:\s*', '', raw_payload).strip()
                results.append((payload, idx, marker_end))
                curr_pos = marker_end
                continue
        except Exception:
            pass

        # Raw string legacy fallback (严防残留 len=\d+: 污染正文)
        arrow_idx = text.find(">>>", after_prefix)
        if arrow_idx != -1:
            marker_end = arrow_idx + 3
            raw_payload = text[after_prefix:arrow_idx].strip()
            payload = re.sub(r'^len=\d+:\s*', '', raw_payload).strip()
            results.append((payload, idx, marker_end))
            curr_pos = marker_end
        else:
            curr_pos = after_prefix

    return results


def strip_dsh_markers(text: str, tags: List[str]) -> str:
    """Removes all markers of given tags from text cleanly, without leaving truncated artifacts."""
    if not text:
        return ""

    ranges: List[Tuple[int, int]] = []
    for tag in tags:
        for _, s, e in extract_dsh_markers(text, tag):
            ranges.append((s, e))

    # Also handle parameterless markers like <<<DSH_DELTA_RESET>>>
    for tag in tags:
        empty_marker = f"<<<DSH_{tag}>>>"
        pos = 0
        while True:
            pos = text.find(empty_marker, pos)
            if pos == -1:
                break
            ranges.append((pos, pos + len(empty_marker)))
            pos += len(empty_marker)

    if not ranges:
        res = text
    else:
        ranges.sort(key=lambda r: r[0])
        parts = []
        last_end = 0
        for s, e in ranges:
            if s > last_end:
                parts.append(text[last_end:s])
            last_end = max(last_end, e)
        if last_end < len(text):
            parts.append(text[last_end:])
        res = "".join(parts)

    # 兜底防御：清除任何残余的指定标签未闭合或畸变片段
    for tag in tags:
        res = re.sub(rf"<<<DSH_{re.escape(tag)}:[^>]*>>>", "", res)
        res = re.sub(rf"<<<DSH_{re.escape(tag)}>>>", "", res)

    return res


@dataclass
class TelemetryStats:
    """Tracks execution latency, tool calls, and token usage."""
    ttft_ms: float = 0.0
    total_ms: float = 0.0
    wall_clock_ms: float = 0.0
    tool_invocations: int = 0
    llm_invocations: int = 0
    tokens: Dict[str, Any] = field(default_factory=dict)
    finish_reason: str = "unknown"
    round_finish_reasons: List[str] = field(default_factory=list)
    tool_calls_detail: List[Dict[str, Any]] = field(default_factory=list)
    guard_decisions: List[Dict[str, Any]] = field(default_factory=list)

    def record_guard(self, guard: str, action: str, reason: Any = None) -> None:
        self.guard_decisions.append({"guard":guard,"action":action,"reason":reason})

    def record_execution_result(self, result: Any) -> None:
        if not self.tool_calls_detail:
            return
        detail = self.tool_calls_detail[-1]
        detail["result_status"] = result.status
        if result.error:
            detail["error_code"] = result.error_code
        if isinstance(result.data,dict):
            for key in ("evidence_id","plan_hash","kind"):
                if key in result.data:detail[key] = result.data[key]
        if result.provenance:
            detail["workbook_id"] = result.provenance.get("workbook_id")

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
        fr = llm_res.get("finish_reason") or "unknown"
        self.finish_reason = fr
        self.round_finish_reasons.append(fr)

    def record_tool_call(
        self,
        tool_name: str = "",
        params: Any = None,
        status: str = "success"
    ) -> None:
        """Increments tool invocation counter and records sanitized execution detail."""
        self.tool_invocations += 1
        if tool_name:
            param_summary = {}
            if isinstance(params, dict):
                for k, v in params.items():
                    val_str = str(v)
                    if len(val_str) > 120:
                        val_str = val_str[:120] + "..."
                    param_summary[k] = val_str
            self.tool_calls_detail.append({
                "name": tool_name,
                "params": param_summary,
                "status": status
            })

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
            "toolCalls": self.tool_calls_detail,
            "llmInvocations": self.llm_invocations,
            "tokens": self.tokens,
            "finishReason": self.finish_reason,
            "roundFinishReasons": self.round_finish_reasons,
            "guardDecisions": self.guard_decisions,
        }
        return json.dumps(data, ensure_ascii=False)

    def emit_metrics_event(self) -> None:
        """Prints DSH protocol metric event to stdout."""
        data_str = self.to_metrics_json()
        print(f"\n{format_dsh_marker('METRICS', data_str)}", flush=True)

    @staticmethod
    def emit_outbound_files(files: List[str]) -> None:
        """Prints outbound file protocol markers."""
        for f in files:
            content = f
            if content.startswith("<<<DSH_OUTBOUND_FILE:") and content.endswith(">>>"):
                content = content[len("<<<DSH_OUTBOUND_FILE:"):-3]
                if content.startswith("len="):
                    parts = content.split(":", 1)
                    if len(parts) == 2:
                        content = parts[1]
            print(f"\n{format_dsh_marker('OUTBOUND_FILE', content)}", flush=True)

    @staticmethod
    def emit_outbound_reminders(reminders: List[str]) -> None:
        """Prints outbound reminder protocol markers."""
        for r in reminders:
            content = r
            matched_tag = "REMINDER_CREATE"
            for tag in ("REMINDER_CREATE", "REMINDER_UPDATE", "REMINDER_DELETE"):
                prefix = f"<<<DSH_{tag}:"
                if content.startswith(prefix) and content.endswith(">>>"):
                    matched_tag = tag
                    content = content[len(prefix):-3]
                    if content.startswith("len="):
                        parts = content.split(":", 1)
                        if len(parts) == 2:
                            content = parts[1]
                    break
            print(f"\n{format_dsh_marker(matched_tag, content)}", flush=True)

    @staticmethod
    def emit_final_output(text: str) -> None:
        """Prints final clean answer delimiter with length prefix and legacy compatibility."""
        out_str = str(text) if text is not None else ""
        print(f"\n{format_dsh_marker('FINAL_OUTPUT', out_str)}\n<<<DSH_FINAL_OUTPUT>>>\n" + out_str, flush=True)
