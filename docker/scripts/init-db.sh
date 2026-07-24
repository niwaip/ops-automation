#!/bin/bash
set -e

# Database initialization script for PostgreSQL
# Creates databases for each microservice

POSTGRES_USER="${POSTGRES_USER:-ops}"
POSTGRES_DB="${POSTGRES_DB:-ops}"

# List of service databases to create
SERVICE_DATABASES=(
  "auth"
  "portal"
  "template"
  "ai_orchestrator"
  "browser_worker"
  "session_broker"
  "replay_engine"
  "control_plane"
  "temporal"
  "temporal_visibility"
)

echo "Initializing databases for services..."

for db in "${SERVICE_DATABASES[@]}"; do
  echo "Creating database: $db"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE $db;
    GRANT ALL PRIVILEGES ON DATABASE $db TO $POSTGRES_USER;
EOSQL
done

echo "Database initialization completed successfully!"