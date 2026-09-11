import asyncio
from temporalio.client import Client
from temporalio.worker import Worker

from workflows import (
    ActivityValidationWorkflow,
    AgentSessionWorkflow,
    WorkflowValidationWorkflow,
    execute_code_activity,
)
from src.config import configure_logging, load_config

logger = configure_logging()


async def main():
    config = load_config()

    logger.info('Starting temporal-worker runtime')
    logger.info(f'Temporal Address: {config.temporal_address}')
    logger.info(f'Namespace: {config.temporal_namespace}')
    logger.info(f'Task Queue: {config.task_queue}')
    logger.info(f'Validation Task Queue: {config.validation_task_queue}')

    logger.info('Connecting to Temporal...')
    client = None
    for attempt in range(1, 20):
        try:
            client = await Client.connect(
                config.temporal_address,
                namespace=config.temporal_namespace,
            )
            logger.info('Connected to Temporal successfully')
            break
        except Exception as e:
            logger.warning(
                f'Attempt {attempt}/20: Failed to connect to Temporal ({e}), retrying in 3s...'
            )
            await asyncio.sleep(3)

    if not client:
        raise RuntimeError('Could not connect to Temporal after 20 attempts')

    logger.info(f'Creating main worker on task queue: {config.task_queue}')
    main_worker = Worker(
        client,
        task_queue=config.task_queue,
        workflows=[AgentSessionWorkflow],
        activities=[execute_code_activity],
    )

    logger.info(f'Creating validation worker on task queue: {config.validation_task_queue}')
    validation_worker = Worker(
        client,
        task_queue=config.validation_task_queue,
        workflows=[ActivityValidationWorkflow, WorkflowValidationWorkflow],
        activities=[execute_code_activity],
    )

    logger.info('Workers created, starting to process tasks...')

    async def run_worker_with_retry(w: Worker, name: str):
        while True:
            try:
                await w.run()
            except Exception as e:
                logger.warning(f'Worker {name} encountered error: {e}. Retrying in 3s...')
                await asyncio.sleep(3)

    await asyncio.gather(
        run_worker_with_retry(main_worker, 'main_worker'),
        run_worker_with_retry(validation_worker, 'validation_worker'),
    )


if __name__ == '__main__':
    asyncio.run(main())
