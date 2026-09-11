import logging
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class TemporalWorkerConfig:
    temporal_address: str
    temporal_namespace: str
    task_queue: str
    validation_task_queue: str


def configure_logging() -> logging.Logger:
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    )
    return logging.getLogger('temporal-worker')


def load_config() -> TemporalWorkerConfig:
    temporal_address = os.getenv('TEMPORAL_ADDRESS')
    if not temporal_address:
        docker_env = os.getenv('DOCKER_ENV') == 'true' or os.getenv('NODE_ENV') == 'production'
        temporal_address = 'temporal:7233' if docker_env else 'localhost:7233'

    return TemporalWorkerConfig(
        temporal_address=temporal_address,
        temporal_namespace=os.getenv('TEMPORAL_NAMESPACE', 'default'),
        task_queue=os.getenv(
            'SANDBOX_WORKER_TASK_QUEUE',
            os.getenv('SANDBOX_TASK_QUEUE', 'sandbox-worker-task-queue'),
        ),
        validation_task_queue=os.getenv(
            'ACTIVITY_VALIDATION_TASK_QUEUE',
            'activity-validation-task-queue',
        ),
    )
