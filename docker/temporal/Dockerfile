# Temporal Sandbox Agent Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

ARG SANDBOX_WORKER_PROJECT_PATH=apps/backend/runtimes/sandbox-worker

# Copy requirements first for better caching
COPY ${SANDBOX_WORKER_PROJECT_PATH}/requirements.txt /app/requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy source code
COPY ${SANDBOX_WORKER_PROJECT_PATH}/ /app/

# Set Python path
ENV PYTHONPATH=/app

# Default command
CMD ["python", "-u", "worker.py"]
