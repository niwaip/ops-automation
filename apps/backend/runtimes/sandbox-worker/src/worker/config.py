import logging
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class SandboxWorkerConfig:
    temporal_address: str
    temporal_namespace: str
    task_queue: str
    validation_task_queue: str
    http_port: int


def configure_logging() -> logging.Logger:
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    )
    return logging.getLogger(__name__)


def load_config() -> SandboxWorkerConfig:
    temporal_address = os.getenv('TEMPORAL_ADDRESS')
    if not temporal_address:
        docker_env = os.getenv('DOCKER_ENV') == 'true' or os.getenv('NODE_ENV') == 'production'
        temporal_address = 'temporal:7233' if docker_env else 'localhost:7233'

    return SandboxWorkerConfig(
        temporal_address=temporal_address,
        temporal_namespace=os.getenv('TEMPORAL_NAMESPACE', 'default'),
        task_queue=os.getenv('SANDBOX_TASK_QUEUE', 'sandbox-agent-task-queue'),
        validation_task_queue=os.getenv(
            'ACTIVITY_VALIDATION_TASK_QUEUE',
            'activity-validation-task-queue',
        ),
        http_port=int(os.getenv('SANDBOX_HTTP_PORT', '8090')),
    )
