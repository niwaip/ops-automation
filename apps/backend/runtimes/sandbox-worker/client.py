"""
Temporal Sandbox Agent - Client Module

Provides an API for the auth service to interact with the sandbox agent
via Temporal workflows.
"""

import asyncio
import logging
import os
import uuid
from datetime import timedelta
from typing import Dict, Any, Optional

from temporalio.client import Client

logger = logging.getLogger(__name__)


class TemporalSandboxClient:
    """
    Client for interacting with the Temporal Sandbox Agent.

    Provides methods to:
    1. Start an execution session (creates workflow if not exists)
    2. Signal execution with code
    3. Query results
    """

    def __init__(self):
        self._client: Optional[Client] = None
        self._workflow_id: Optional[str] = None

    async def connect(self) -> None:
        """Connect to Temporal server."""
        if self._client:
            return

        temporal_address = os.getenv("TEMPORAL_ADDRESS")
        if not temporal_address:
            docker_env = os.getenv("DOCKER_ENV") == "true" or os.getenv("NODE_ENV") == "production"
            temporal_address = "temporal:7233" if docker_env else "localhost:7233"
        temporal_namespace = os.getenv("TEMPORAL_NAMESPACE", "default")

        logger.info(f"Connecting to Temporal at {temporal_address}...")
        self._client = await Client.connect(
            temporal_address,
            namespace=temporal_namespace,
        )
        logger.info("Connected to Temporal")

    async def start_session(self, session_id: str) -> str:
        """
        Start a new agent session workflow.

        Returns the workflow ID.
        """
        await self.connect()

        from workflows import AgentSessionWorkflow

        self._workflow_id = f"agent-session-{session_id}"

        logger.info(f"Starting workflow: {self._workflow_id}")

        # Start the workflow
        handle = await self._client.start_workflow(
            AgentSessionWorkflow.run,
            session_id,
            id=self._workflow_id,
            task_queue="sandbox-agent-task-queue",
        )

        logger.info(f"Workflow started: {handle.id}")

        return self._workflow_id

    async def execute_code(
        self,
        session_id: str,
        code: str,
        fn_name: str,
        activity_id: str,
        input_data: Dict[str, Any],
    ) -> str:
        """
        Signal a running workflow to execute code.

        Returns the workflow ID.
        """
        await self.connect()

        from workflows import AgentSessionWorkflow, ExecutionSignalInput

        self._workflow_id = f"agent-session-{session_id}"

        # Get the workflow handle
        handle = self._client.get_workflow_handle(self._workflow_id)

        # Create signal input
        signal = ExecutionSignalInput(
            code=code,
            fn_name=fn_name,
            activity_id=activity_id,
            input_data=input_data,
        )

        logger.info(f"Signaling workflow {self._workflow_id} to execute {activity_id}")

        # Send signal
        await handle.signal(AgentSessionWorkflow.execute_code, signal)

        return self._workflow_id

    async def get_result(
        self,
        session_id: str,
        timeout: timedelta = timedelta(minutes=5),
    ) -> Dict[str, Any]:
        """
        Get the result of the last execution.

        Blocks until result is available or timeout.
        """
        await self.connect()

        self._workflow_id = f"agent-session-{session_id}"

        handle = self._client.get_workflow_handle(self._workflow_id)

        logger.info(f"Querying workflow for result: {self._workflow_id}")

        # Poll for result using query
        from datetime import datetime, timezone
        start_time = datetime.now(timezone.utc)

        while True:
            result = await handle.query(AgentSessionWorkflow.get_result)

            if result:
                logger.info(f"Got result: {result}")
                return result

            # Check timeout
            elapsed = datetime.now(timezone.utc) - start_time
            if elapsed > timeout:
                raise TimeoutError(f"Timeout waiting for result after {elapsed}")

            await asyncio.sleep(0.5)

    async def get_state(self, session_id: str) -> Dict[str, Any]:
        """Get the current state of the workflow."""
        await self.connect()

        self._workflow_id = f"agent-session-{session_id}"

        handle = self._client.get_workflow_handle(self._workflow_id)

        return await handle.query(AgentSessionWorkflow.get_state)


# Singleton instance
_client: Optional[TemporalSandboxClient] = None


def get_sandbox_client() -> TemporalSandboxClient:
    """Get the singleton sandbox client instance."""
    global _client
    if _client is None:
        _client = TemporalSandboxClient()
    return _client


async def execute_code_in_sandbox(
    code: str,
    fn_name: str,
    activity_id: str,
    input_data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Convenience function to execute code in sandbox.

    Creates a session, signals execution, and waits for result.
    """
    client = get_sandbox_client()

    # Generate session ID
    session_id = str(uuid.uuid4())

    # Start session
    await client.start_session(session_id)

    # Signal execution
    await client.execute_code(session_id, code, fn_name, activity_id, input_data)

    # Wait for result
    result = await client.get_result(session_id)

    return result
