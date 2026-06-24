import asyncio
from temporalio.client import Client
from temporalio.worker import Worker

from workflows import (
    ActivityValidationWorkflow,
    AgentSessionWorkflow,
    WorkflowValidationWorkflow,
    execute_code_activity,
)

from src.api import run_http_server
from src.worker.config import configure_logging, load_config

logger = configure_logging()


async def main():
    config = load_config()

    logger.info('Starting Temporal Sandbox Agent')
    logger.info(f'Temporal Address: {config.temporal_address}')
    logger.info(f'Namespace: {config.temporal_namespace}')
    logger.info(f'Task Queue: {config.task_queue}')
    logger.info(f'Validation Task Queue: {config.validation_task_queue}')

    logger.info('Connecting to Temporal...')
    client = await Client.connect(
        config.temporal_address,
        namespace=config.temporal_namespace,
    )
    logger.info('Connected to Temporal')

    logger.info(f'Creating worker on task queue: {config.task_queue}')
    worker = Worker(
        client,
        task_queue=config.task_queue,
        workflows=[AgentSessionWorkflow],
        activities=[execute_code_activity],
    )

    validation_worker = Worker(
        client,
        task_queue=config.validation_task_queue,
        workflows=[ActivityValidationWorkflow, WorkflowValidationWorkflow],
        activities=[execute_code_activity],
    )

    logger.info('Worker created, starting to process tasks...')
    await run_http_server(client, config.validation_task_queue, config.http_port)

    await asyncio.gather(
        worker.run(),
        validation_worker.run(),
    )
