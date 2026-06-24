from dataclasses import dataclass
from typing import Any, Dict, List, Optional


class AgentSessionState:
    """Tracks the state of an agent session across executions."""

    def __init__(self):
        self.session_id: str = ''
        self.activity_id: str = ''
        self.code: str = ''
        self.fn_name: str = ''
        self.last_input: Dict[str, Any] = {}
        self.last_result: Optional[Dict[str, Any]] = None
        self.last_error: Optional[str] = None
        self.execution_count: int = 0
        self.logs: List[str] = []


@dataclass
class ExecutionSignalInput:
    """Input for the execute_code signal."""

    code: str
    fn_name: str
    activity_id: str
    input_data: Dict[str, Any]


def parse_timeout_seconds(timeout_value: Any) -> int:
    if isinstance(timeout_value, int):
        return max(timeout_value, 1)
    if not isinstance(timeout_value, str) or not timeout_value:
        return 60

    unit = timeout_value[-1]
    raw_number = timeout_value[:-1]
    if not raw_number.isdigit():
        return 60

    value = int(raw_number)
    if unit == 's':
        return max(value, 1)
    if unit == 'm':
        return max(value * 60, 1)
    if unit == 'h':
        return max(value * 3600, 1)
    return 60
