import asyncio
from datetime import timedelta
from typing import Any, Dict, Optional

from temporalio import workflow
from temporalio.common import RetryPolicy

from .activities import execute_code_activity
from .shared import AgentSessionState, ExecutionSignalInput


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
        # Temporal's JSON payload converter cannot materialize nested JSON into
        # the concrete `object` type. Activity results are recursive JSON values,
        # so the durable query contract must explicitly allow Any at the leaves.
        self._result: Optional[Dict[str, Any]] = None

    @workflow.run
    async def run(self, session_id: str) -> Dict[str, Any]:
        self._state.session_id = session_id
        workflow.logger.info(f'AgentSessionWorkflow started: {session_id}')

        while True:
            await workflow.wait_condition(
                lambda: self._has_pending_execution,
                timeout=timedelta(days=365),
            )

            if self._pending_signal:
                signal = self._pending_signal
                self._pending_signal = None
                self._has_pending_execution = False

                workflow.logger.info(f'Executing code for activity: {signal.activity_id}')

                try:
                    result = await workflow.execute_activity(
                        execute_code_activity,
                        args=[
                            signal.code,
                            signal.fn_name,
                            signal.activity_id,
                            signal.input_data,
                        ],
                        start_to_close_timeout=timedelta(minutes=5),
                        retry_policy=RetryPolicy(maximum_attempts=2),
                    )
                    self._result = {'success': True, 'result': result}
                    workflow.logger.info(f'Execution successful for {signal.activity_id}')
                except Exception as exc:
                    self._result = {'success': False, 'error': str(exc)}
                    workflow.logger.error(f'Execution failed for {signal.activity_id}: {exc}')
                finally:
                    self._execution_complete.set()

    @workflow.signal
    async def execute_code(self, signal: ExecutionSignalInput) -> None:
        self._state.code = signal.code
        self._state.fn_name = signal.fn_name
        self._state.activity_id = signal.activity_id
        self._state.last_input = signal.input_data
        self._state.execution_count += 1
        self._pending_signal = signal
        self._has_pending_execution = True
        self._execution_complete.clear()
        self._result = None

        workflow.logger.info(f'Received execute_code signal for: {signal.activity_id}')

    @workflow.query
    def get_result(self) -> Optional[Dict[str, Any]]:
        return self._result

    @workflow.query
    def get_state(self) -> Dict[str, Any]:
        return {
            'session_id': self._state.session_id,
            'execution_count': self._state.execution_count,
            'last_activity_id': self._state.activity_id,
            'has_pending': self._has_pending_execution,
        }
