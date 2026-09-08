import asyncio
from temporalio.client import Client

from src.api import run_http_server
from src.worker.config import configure_logging, load_config

logger = configure_logging()


async def main():
    config = load_config()

    logger.info('Starting sandbox-worker HTTP API gateway')
    logger.info(f'Temporal Address: {config.temporal_address}')
    logger.info(f'Namespace: {config.temporal_namespace}')
    logger.info(f'Validation Task Queue: {config.validation_task_queue}')
    logger.info(f'HTTP Port: {config.http_port}')

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
            logger.warning(f'Attempt {attempt}/20: Failed to connect to Temporal ({e}), retrying in 3s...')
            await asyncio.sleep(3)

    if not client:
        raise RuntimeError('Could not connect to Temporal after 20 attempts')

    runner = await run_http_server(client, config.validation_task_queue, config.http_port)
    logger.info('Sandbox HTTP server is ready to accept requests...')

    try:
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        logger.info('Stopping sandbox HTTP server...')
    finally:
        await runner.cleanup()
