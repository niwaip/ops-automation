"""
ToolResult: Standard structured result contract for DSH tools.
Separates execution status, structured payload, provenance, and rendered text.
Decouples LLM chat content from deterministic execution state and telemetry.
"""

import json
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, Optional, Union


@dataclass
class ToolResult:
    schema_version: int = 1
    status: str = "success"  # "success" | "error" | "partial"
    data: Optional[Any] = None
    error: Optional[Dict[str, Any]] = None
    provenance: Optional[Dict[str, Any]] = None
    text_representation: Optional[str] = None

    @property
    def is_error(self) -> bool:
        return self.status == "error"

    @property
    def is_success(self) -> bool:
        return self.status == "success"

    @property
    def is_partial(self) -> bool:
        return self.status == "partial"

    @property
    def error_code(self) -> Optional[str]:
        return self.error.get("code") if self.error else None

    @property
    def error_message(self) -> Optional[str]:
        return self.error.get("message") if self.error else None

    def to_dict(self) -> Dict[str, Any]:
        res = {
            "schema_version": self.schema_version,
            "status": self.status,
            "data": self.data,
            "error": self.error,
            "provenance": self.provenance,
        }
        if self.text_representation is not None:
            res["text_representation"] = self.text_representation
        return res

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)

    def render_text(self) -> str:
        if self.text_representation:
            return self.text_representation
        if self.is_error:
            err_code = self.error.get("code", "unknown_error") if self.error else "unknown_error"
            err_msg = self.error.get("message", "Tool execution failed") if self.error else "Tool execution failed"
            return f"【错误: {err_code}】{err_msg}"
        if isinstance(self.data, str):
            return self.data
        if self.data is not None:
            return json.dumps(self.data, ensure_ascii=False, indent=2)
        return ""

    @classmethod
    def success(
        cls,
        data: Any = None,
        text: Optional[str] = None,
        provenance: Optional[Dict[str, Any]] = None,
    ) -> "ToolResult":
        return cls(
            status="success",
            data=data,
            text_representation=text if text is not None else (str(data) if data is not None else ""),
            provenance=provenance,
        )

    @classmethod
    def _error_result(
        cls,
        code: str,
        message: str,
        data: Any = None,
        error_details: Optional[Dict[str, Any]] = None,
        provenance: Optional[Dict[str, Any]] = None,
        text: Optional[str] = None,
    ) -> "ToolResult":
        err_dict = {"code": code, "message": message}
        if error_details:
            err_dict.update(error_details)
        return cls(
            status="error",
            data=data,
            error=err_dict,
            provenance=provenance,
            text_representation=text,
        )

    @classmethod
    def partial(
        cls,
        data: Any = None,
        error_details: Optional[Dict[str, Any]] = None,
        provenance: Optional[Dict[str, Any]] = None,
        text: Optional[str] = None,
    ) -> "ToolResult":
        return cls(
            status="partial",
            data=data,
            error=error_details,
            provenance=provenance,
            text_representation=text,
        )


# Install the compatibility factory after dataclass generated __init__. Defining
# a method named `error` in the class body makes it the field's default value,
# which leaks a bound method into otherwise successful results and JSON output.
ToolResult.error = classmethod(ToolResult._error_result.__func__)


class TextToolOutput(str):
    """
    Subclass of str that attaches a structured ToolResult.
    Provides complete backward compatibility for components expecting plain strings,
    while carrying the first-class ToolResult metadata for telemetry and task verification.
    """
    tool_result: ToolResult

    def __new__(cls, text: str, tool_result: ToolResult):
        obj = super().__new__(cls, text)
        obj.tool_result = tool_result
        return obj


def adapt_tool_output(output: Union[ToolResult, str, dict, Any]) -> ToolResult:
    """
    Adapter that normalizes any tool output (TextToolOutput, ToolResult, legacy string, JSON string, or dict)
    into a standardized ToolResult instance.
    """
    if isinstance(output, ToolResult):
        return output

    if hasattr(output, "tool_result") and isinstance(getattr(output, "tool_result"), ToolResult):
        return getattr(output, "tool_result")

    if isinstance(output, dict):
        if "schema_version" in output and "status" in output:
            return ToolResult(
                schema_version=output.get("schema_version", 1),
                status=output.get("status", "success"),
                data=output.get("data"),
                error=output.get("error"),
                provenance=output.get("provenance"),
                text_representation=output.get("text_representation"),
            )
        # Check standard error/status keys in raw dicts
        st = str(output.get("status", "")).lower()
        is_err = output.get("error") is not None or output.get("success") is False or st in ("error", "failed", "failure", "unavailable")
        if is_err:
            err_code = str(output.get("code") or (output.get("error") if isinstance(output.get("error"), str) else "error"))
            err_msg = str(output.get("message") or output.get("error") or "Execution failed")
            return ToolResult.error(
                code=err_code,
                message=err_msg,
                data=output.get("data"),
                error_details=output,
                text=json.dumps(output, ensure_ascii=False)
            )
        return ToolResult.success(data=output, text=json.dumps(output, ensure_ascii=False))

    if isinstance(output, str):
        trimmed = output.strip()
        # Attempt JSON parse
        if (trimmed.startswith("{") and trimmed.endswith("}")) or (trimmed.startswith("[") and trimmed.endswith("]")):
            try:
                parsed = json.loads(trimmed)
                if isinstance(parsed, dict) and "schema_version" in parsed and "status" in parsed:
                    return ToolResult(
                        schema_version=parsed.get("schema_version", 1),
                        status=parsed.get("status", "success"),
                        data=parsed.get("data"),
                        error=parsed.get("error"),
                        provenance=parsed.get("provenance"),
                        text_representation=parsed.get("text_representation") or trimmed,
                    )
                if isinstance(parsed, dict):
                    st = str(parsed.get("status", "")).lower()
                    if parsed.get("error") is not None or parsed.get("success") is False or st in ("error", "failed", "failure", "unavailable"):
                        return ToolResult.error(
                            code=str(parsed.get("code") or "error"),
                            message=str(parsed.get("message") or parsed.get("error") or "Execution failed"),
                            data=parsed.get("data"),
                            error_details=parsed,
                            text=trimmed,
                        )
                    if st == "partial":
                        return ToolResult.partial(
                            data=parsed.get("data"),
                            error_details=parsed,
                            text=trimmed,
                        )
            except Exception:
                pass

        # Legacy string pattern matching (only for plain string tools without structured envelope)
        lower = trimmed.lower()
        if (
            trimmed.startswith("【错误")
            or trimmed.startswith("[错误]")
            or trimmed.startswith("【安全拦截】")
            or trimmed.startswith("[安全拦截]")
            or "[命令执行失败" in trimmed
            or "命令执行异常" in trimmed
            or "执行超时" in trimmed
            or "traceback (most recent call last):" in lower
        ):
            # Extract error code if present like 【错误: sheet_not_found】
            err_code = "legacy_error"
            if trimmed.startswith("【错误:") or trimmed.startswith("【错误："):
                end_idx = trimmed.find("】")
                if end_idx != -1:
                    err_code = trimmed[4:end_idx].strip()
            return ToolResult.error(code=err_code, message=trimmed, text=trimmed)

        return ToolResult.success(data=output, text=output)

    # Fallback for unknown object
    return ToolResult.success(data=output, text=str(output))


def is_tool_error(res: Union[ToolResult, str, dict, Any]) -> bool:
    """
    Standardized check: returns True iff the tool execution failed.
    First checks structured ToolResult.status, avoiding false positives
    from regular content text that happens to mention error keywords.
    """
    adapted = adapt_tool_output(res)
    return adapted.status in ("error", "failed", "failure", "partial", "unavailable")
