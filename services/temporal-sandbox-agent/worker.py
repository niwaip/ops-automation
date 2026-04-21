"""
Temporal Sandbox Agent - Main Worker Entry Point

Connects to Temporal as a worker and runs the AgentSessionWorkflow.
"""

import asyncio
import logging
import os
from temporalio.client import Client
from temporalio.worker import Worker

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import workflow and activities
from workflows import AgentSessionWorkflow, execute_code_activity


async def main():
    """Main entry point for the sandbox agent worker."""

    # Get configuration from environment
    temporal_address = os.getenv("TEMPORAL_ADDRESS", "localhost:7233")
    temporal_namespace = os.getenv("TEMPORAL_NAMESPACE", "default")
    task_queue = os.getenv("SANDBOX_TASK_QUEUE", "sandbox-agent-task-queue")
    auth_service_url = os.getenv("AUTH_SERVICE_URL", "http://localhost:3001")

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

    # Run worker
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
