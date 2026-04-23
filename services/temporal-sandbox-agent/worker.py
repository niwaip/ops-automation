"""
Temporal Sandbox Agent - Main Worker Entry Point

Connects to Temporal as a worker and runs the AgentSessionWorkflow.
"""

import asyncio
import json
import logging
import os
import uuid
from aiohttp import web
from temporalio.client import Client
from temporalio.worker import Worker

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import workflow and activities
from workflows import AgentSessionWorkflow, execute_code_activity, ExecutionSignalInput


class TemporalSandboxServer:
    """HTTP server for triggering sandbox executions."""

    def __init__(self, client: Client):
        self.client = client
        self._app = web.Application()
        self._setup_routes()

    def _setup_routes(self):
        self._app.router.add_post('/execute', self.handle_execute)
        self._app.router.add_get('/health', self.handle_health)

    async def handle_health(self, request: web.Request) -> web.Response:
        return web.json_response({"status": "healthy"})

    async def handle_execute(self, request: web.Request) -> web.Response:
        """
        Execute code in sandbox via Temporal workflow.

        Request body:
        {
            "code": "def fn(data): return {'result': data['x'] + 1}",
            "fn_name": "fn",
            "activity_id": "unique-activity-id",
            "input_data": {"x": 10}
        }
        """
        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({"error": "Invalid JSON"}, status=400)

        code = data.get('code')
        fn_name = data.get('fn_name')
        activity_id = data.get('activity_id') or str(uuid.uuid4())
        input_data = data.get('input_data', {})

        if not code or not fn_name:
            return web.json_response({"error": "code and fn_name are required"}, status=400)

        # Use activity_id as session_id for single execution
        session_id = activity_id
        workflow_id = f"agent-session-{session_id}"

        try:
            # Check if workflow already exists
            try:
                handle = self.client.get_workflow_handle(workflow_id)
                await handle.query(AgentSessionWorkflow.get_state)
                logger.info(f"Using existing workflow: {workflow_id}")
            except Exception:
                # Start new workflow
                logger.info(f"Starting new workflow: {workflow_id}")
                handle = await self.client.start_workflow(
                    AgentSessionWorkflow.run,
                    session_id,
                    id=workflow_id,
                    task_queue="sandbox-agent-task-queue",
                )

            # Create signal input
            signal = ExecutionSignalInput(
                code=code,
                fn_name=fn_name,
                activity_id=activity_id,
                input_data=input_data,
            )

            # Send signal
            logger.info(f"Signaling workflow {workflow_id} to execute {activity_id}")
            await handle.signal(AgentSessionWorkflow.execute_code, signal)

            # Wait for result with timeout
            result = None
            from datetime import datetime, timedelta, timezone
            start_time = datetime.now(timezone.utc)
            timeout = timedelta(minutes=5)

            while True:
                query_result = await handle.query(AgentSessionWorkflow.get_result)
                logger.info(f"Query result type: {type(query_result)}, value: {query_result}")
                if query_result:
                    result = query_result
                    break

                elapsed = datetime.now(timezone.utc) - start_time
                if elapsed > timeout:
                    return web.json_response({
                        "error": f"Timeout waiting for result after {elapsed}",
                        "workflow_id": workflow_id,
                        "activity_id": activity_id
                    }, status=504)

                await asyncio.sleep(0.5)

            # Ensure result is JSON serializable
            try:
                json.dumps(result)  # Test serialization
            except (TypeError, ValueError) as e:
                logger.error(f"Result is not JSON serializable: {e}, result={result}")
                result = {"error": "Result contains non-serializable data", "raw": str(result)}

            return web.json_response({
                "success": True,
                "result": result,
                "workflow_id": workflow_id,
                "activity_id": activity_id
            })

        except Exception as e:
            import traceback
            logger.error(f"Execution failed: {e}\n{traceback.format_exc()}")
            return web.json_response({"error": str(e)}, status=500)


async def run_http_server(client: Client, port: int = 8090):
    """Run the HTTP server."""
    server = TemporalSandboxServer(client)
    runner = web.AppRunner(server._app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', port)
    await site.start()
    logger.info(f"HTTP server started on port {port}")
    return runner


async def main():
    """Main entry point for the sandbox agent worker."""

    # Get configuration from environment
    temporal_address = os.getenv("TEMPORAL_ADDRESS", "localhost:7233")
    temporal_namespace = os.getenv("TEMPORAL_NAMESPACE", "default")
    task_queue = os.getenv("SANDBOX_TASK_QUEUE", "sandbox-agent-task-queue")
    http_port = int(os.getenv("SANDBOX_HTTP_PORT", "8090"))

    logger.info(f"Starting Temporal Sandbox Agent")
    logger.info(f"Temporal Address: {temporal_address}")
    logger.info(f"Namespace: {temporal_namespace}")
    logger.info(f"Task Queue: {task_queue}")

    # Connect to Temporal
    logger.info("Connecting to Temporal...")
    client = await Client.connect(
        temporal_address,
        namespace=temporal_namespace,
    )
    logger.info("Connected to Temporal")

    # Create worker
    logger.info(f"Creating worker on task queue: {task_queue}")
    worker = Worker(
        client,
        task_queue=task_queue,
        workflows=[AgentSessionWorkflow],
        activities=[execute_code_activity],
    )

    logger.info("Worker created, starting to process tasks...")

    # Start HTTP server and worker concurrently
    http_runner = await run_http_server(client, http_port)

    # Run worker (this blocks)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
