"""
Temporal Sandbox Agent - Long-lived Agent Workflow

This workflow implements the "先拉取最新的代码，然后再执行任务" pattern:
1. The workflow is long-lived and persists between executions
2. Each execution fetches the latest code from the auth service
3. Executes the code in an isolated sandbox
4. State is preserved durably in Temporal
"""

import asyncio
import logging
from dataclasses import dataclass
import math
from datetime import timedelta
from typing import Optional, Dict, Any, List

from temporalio import workflow, activity
from temporalio.common import RetryPolicy

logger = logging.getLogger(__name__)


class AgentSessionState:
    """Tracks the state of an agent session across executions."""

    def __init__(self):
        self.session_id: str = ""
        self.activity_id: str = ""
        self.code: str = ""
        self.fn_name: str = ""
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


def _parse_timeout_seconds(timeout_value: Any) -> int:
    if isinstance(timeout_value, int):
        return max(timeout_value, 1)
    if not isinstance(timeout_value, str) or not timeout_value:
        return 60

    unit = timeout_value[-1]
    raw_number = timeout_value[:-1]
    if not raw_number.isdigit():
        return 60

    value = int(raw_number)
    if unit == "s":
        return max(value, 1)
    if unit == "m":
        return max(value * 60, 1)
    if unit == "h":
        return max(value * 3600, 1)
    return 60


@workflow.defn
class AgentSessionWorkflow:
    """
    Long-lived workflow for code execution sessions.

    This workflow:
    1. Waits for execution signals (zero-cost idle via wait_condition)
    2. On signal, fetches latest code and executes
    3. Preserves state across executions
    4. Supports concurrent execution via activity_id
    """

    def __init__(self):
        self._state = AgentSessionState()
        self._has_pending_execution = False
        self._pending_signal: Optional[ExecutionSignalInput] = None
        self._execution_complete = asyncio.Event()
        self._result: Optional[Dict[str, Any]] = None

    @workflow.run
    async def run(self, session_id: str) -> Dict[str, Any]:
        """Main workflow entry point - runs indefinitely until cancelled."""
        self._state.session_id = session_id

        workflow.logger.info(f"AgentSessionWorkflow started: {session_id}")

        # Long-lived loop - waits for execution signals
        while True:
            # Zero-cost idle - workflow doesn't consume compute while waiting
            await workflow.wait_condition(
                lambda: self._has_pending_execution,
                timeout=timedelta(days=365)  # Long timeout for idle
            )

            if self._pending_signal:
                signal = self._pending_signal
                self._pending_signal = None
                self._has_pending_execution = False

                workflow.logger.info(f"Executing code for activity: {signal.activity_id}")

                # Execute the activity with retry policy
                try:
                    result = await workflow.execute_activity(
                        execute_code_activity,
                        args=[
                            signal.code,
                            signal.fn_name,
                            signal.activity_id,
                            signal.input_data
                        ],
                        start_to_close_timeout=timedelta(minutes=5),
                        retry_policy=RetryPolicy(maximum_attempts=2),
                    )
                    self._result = {"success": True, "result": result}
                    workflow.logger.info(f"Execution successful for {signal.activity_id}")

                except Exception as e:
                    self._result = {"success": False, "error": str(e)}
                    workflow.logger.error(f"Execution failed for {signal.activity_id}: {e}")

                finally:
                    self._execution_complete.set()

            # Loop back to wait for next execution

    @workflow.signal
    async def execute_code(self, signal: ExecutionSignalInput) -> None:
        """Signal to trigger code execution with latest code."""
        self._state.code = signal.code
        self._state.fn_name = signal.fn_name
        self._state.activity_id = signal.activity_id
        self._state.last_input = signal.input_data
        self._state.execution_count += 1
        self._pending_signal = signal
        self._has_pending_execution = True
        self._execution_complete.clear()
        self._result = None  # Reset result for new execution

        workflow.logger.info(f"Received execute_code signal for: {signal.activity_id}")

    @workflow.query
    def get_result(self) -> Optional[Dict[str, Any]]:
        """Query the last execution result."""
        return self._result

    @workflow.query
    def get_state(self) -> Dict[str, Any]:
        """Query the current workflow state."""
        return {
            "session_id": self._state.session_id,
            "execution_count": self._state.execution_count,
            "last_activity_id": self._state.activity_id,
            "has_pending": self._has_pending_execution,
        }


@workflow.defn
class ActivityValidationWorkflow:
    """Dedicated workflow for validating Activity code with retry semantics."""

    @workflow.run
    async def run(self, request: Dict[str, Any]) -> Dict[str, Any]:
        code = request.get("code", "")
        fn_name = request.get("fn_name", "")
        activity_id = request.get("activity_id", "activity-validation")
        input_data = request.get("input_data", {}) or {}
        retry_policy = request.get("retry_policy", {}) or {}
        timeout_seconds = _parse_timeout_seconds(request.get("timeout"))

        max_retries = max(int(retry_policy.get("maxRetries", 0) or 0), 0)
        max_attempts = max_retries + 1
        base_backoff_ms = max(int(retry_policy.get("backoffMs", 1000) or 1000), 0)
        all_logs: List[str] = [
            f"[ValidationWorker] 开始验证 Activity: {activity_id}",
            f"[ValidationWorker] 函数: {fn_name}",
            f"[ValidationWorker] 最大尝试次数: {max_attempts}",
            f"[ValidationWorker] 单次执行超时: {timeout_seconds}s",
        ]

        last_error: Optional[str] = None
        last_traceback: Optional[str] = None

        for attempt in range(1, max_attempts + 1):
            all_logs.append(f"[ValidationWorker] 第 {attempt}/{max_attempts} 次执行开始")

            try:
                execution_result = await workflow.execute_activity(
                    execute_code_activity,
                    args=[
                        code,
                        fn_name,
                        f"{activity_id}-attempt-{attempt}",
                        input_data,
                        attempt,
                    ],
                    start_to_close_timeout=timedelta(seconds=timeout_seconds),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
            except Exception as exc:
                last_error = str(exc)
                all_logs.append(
                    f"[ValidationWorker] 第 {attempt}/{max_attempts} 次执行异常: {last_error}"
                )
                if attempt >= max_attempts:
                    return {
                        "success": False,
                        "error": last_error,
                        "traceback": last_traceback,
                        "logs": all_logs,
                        "attempts": attempt,
                        "max_attempts": max_attempts,
                        "retry_policy": retry_policy,
                    }
            else:
                attempt_logs = execution_result.get("logs", []) or []
                all_logs.extend(
                    [f"[Attempt {attempt}] {log}" for log in attempt_logs]
                )

                if execution_result.get("success", execution_result.get("error") is None):
                    all_logs.append(
                        f"[ValidationWorker] 第 {attempt}/{max_attempts} 次执行成功"
                    )
                    return {
                        "success": True,
                        "result": execution_result.get("result"),
                        "logs": all_logs,
                        "attempts": attempt,
                        "max_attempts": max_attempts,
                        "retry_policy": retry_policy,
                    }

                last_error = execution_result.get("error") or "Unknown error"
                last_traceback = execution_result.get("traceback")
                non_retryable = bool(execution_result.get("non_retryable"))
                all_logs.append(
                    f"[ValidationWorker] 第 {attempt}/{max_attempts} 次执行失败: {last_error}"
                )

                if non_retryable:
                    all_logs.append(
                        "[ValidationWorker] 检测到 non_retryable=True，停止后续重试"
                    )
                    return {
                        "success": False,
                        "error": last_error,
                        "traceback": last_traceback,
                        "logs": all_logs,
                        "attempts": attempt,
                        "max_attempts": max_attempts,
                        "retry_policy": retry_policy,
                        "non_retryable": True,
                    }

                if attempt >= max_attempts:
                    return {
                        "success": False,
                        "error": last_error,
                        "traceback": last_traceback,
                        "logs": all_logs,
                        "attempts": attempt,
                        "max_attempts": max_attempts,
                        "retry_policy": retry_policy,
                    }

            wait_ms = min(base_backoff_ms * int(math.pow(2, attempt - 1)), 30000)
            if wait_ms > 0:
                all_logs.append(
                    f"[ValidationWorker] 等待 {wait_ms}ms 后进入下一次重试"
                )
                await workflow.sleep(timedelta(milliseconds=wait_ms))

        return {
            "success": False,
            "error": last_error or "Validation failed",
            "traceback": last_traceback,
            "logs": all_logs,
            "attempts": max_attempts,
            "max_attempts": max_attempts,
            "retry_policy": retry_policy,
        }


@workflow.defn
class WorkflowValidationWorkflow:
    """Dedicated workflow for validating Workflow code in the test worker."""

    @workflow.run
    async def run(self, request: Dict[str, Any]) -> Dict[str, Any]:
        code = request.get("code", "")
        fn_name = request.get("fn_name", "")
        workflow_id = request.get("workflow_id", "workflow-validation")
        input_data = request.get("input_data", {}) or {}
        timeout_seconds = _parse_timeout_seconds(request.get("timeout"))
        task_queue = request.get("task_queue") or "SKILL_TASK_QUEUE"
        all_logs: List[str] = [
            f"[ValidationWorker] 开始真实验证 Workflow: {workflow_id}",
            f"[ValidationWorker] Workflow 类: {fn_name}",
            f"[ValidationWorker] 目标 Task Queue: {task_queue}",
            f"[ValidationWorker] 单次执行超时: {timeout_seconds}s",
        ]

        try:
            execution_result = await workflow.execute_activity(
                execute_code_activity,
                args=[
                    code,
                    fn_name,
                    workflow_id,
                    input_data,
                    1,
                ],
                start_to_close_timeout=timedelta(seconds=timeout_seconds),
                retry_policy=RetryPolicy(maximum_attempts=1),
            )
        except Exception as exc:
            error_msg = str(exc)
            all_logs.append(f"[ValidationWorker] Workflow 执行异常: {error_msg}")
            return {
                "success": False,
                "error": error_msg,
                "logs": all_logs,
            }

        attempt_logs = execution_result.get("logs", []) or []
        all_logs.extend([f"[Workflow Attempt] {log}" for log in attempt_logs])

        if execution_result.get("success", execution_result.get("error") is None):
            all_logs.append("[ValidationWorker] Workflow 真实验证成功")
            return {
                "success": True,
                "result": execution_result.get("result"),
                "logs": all_logs,
            }

        error_msg = execution_result.get("error") or "Workflow validation failed"
        all_logs.append(f"[ValidationWorker] Workflow 真实验证失败: {error_msg}")
        return {
            "success": False,
            "error": error_msg,
            "traceback": execution_result.get("traceback"),
            "logs": all_logs,
            "non_retryable": bool(execution_result.get("non_retryable")),
        }


@activity.defn
async def execute_code_activity(
    code: str,
    fn_name: str,
    activity_id: str,
    input_data: Dict[str, Any],
    validation_attempt: int = 1,
) -> Dict[str, Any]:
    """
    Activity that executes Python code in an isolated sandbox.

    This is where the actual code execution happens. The code is fetched
    from the auth service before being passed here.
    """
    attempt = validation_attempt or activity.info().attempt
    activity.logger.info(f"Starting code execution for: {activity_id}, attempt={attempt}")
    activity.logger.info(f"Function: {fn_name}")
    activity.logger.info(f"Input: {input_data}")

    # Import sandbox execution here to avoid import at module load time
    from sandbox_executor import execute_in_sandbox
    import traceback

    try:
        result = await execute_in_sandbox(code, fn_name, input_data, attempt=attempt)
        if result.get("success", result.get("error") is None):
            activity.logger.info("Execution completed successfully")
        else:
            activity.logger.error(f"Execution returned error result: {result.get('error')}")
        result["attempt"] = attempt
        return result

    except Exception as e:
        error_traceback = traceback.format_exc()
        activity.logger.error(f"Execution failed: {e}\n{error_traceback}")
        return {
            "error": str(e),
            "error_type": type(e).__name__,
            "traceback": error_traceback,
            "result": None,
            "success": False,
            "attempt": attempt,
        }
