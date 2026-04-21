"""
Temporal Sandbox Agent - Long-lived Agent Workflow

This workflow implements the "先拉取最新的代码，然后再执行任务" pattern:
1. The workflow is long-lived and persists between executions
2. Each execution fetches the latest code from the auth service
3. Executes the code in an isolated sandbox
4. State is preserved durably in Temporal
"""

import asyncio
import json
import logging
from datetime import timedelta
from typing import Optional, Dict, Any, List

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError

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


class ExecutionSignalInput:
    """Input for the execute_code signal."""

    def __init__(self, code: str, fn_name: str, activity_id: str, input_data: Dict[str, Any]):
        self.code = code
        self.fn_name = fn_name
        self.activity_id = activity_id
        self.input_data = input_data


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


async def execute_code_activity(
    code: str,
    fn_name: str,
    activity_id: str,
    input_data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Activity that executes Python code in an isolated sandbox.

    This is where the actual code execution happens. The code is fetched
    from the auth service before being passed here.
    """
    from temporalio import activity

    activity.logger.info(f"Starting code execution for: {activity_id}")
    activity.logger.info(f"Function: {fn_name}")
    activity.logger.info(f"Input: {input_data}")

    # Import sandbox execution here to avoid import at module load time
    from sandbox_executor import execute_in_sandbox

    try:
        result = await execute_in_sandbox(code, fn_name, input_data)
        activity.logger.info(f"Execution completed successfully")
        return result

    except Exception as e:
        activity.logger.error(f"Execution failed: {e}")
        raise ApplicationError(f"Code execution failed: {e}", non_retryable=True)
