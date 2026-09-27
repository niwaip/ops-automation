#!/bin/bash

# Move to the script's directory to ensure paths are resolved correctly
cd "$(dirname "$0")"

PORT="${PORT:-80}"

echo "========================================="
echo "  Starting Mock ERP Server on Port ${PORT}    "
echo "========================================="

if [ "$PORT" -lt 1024 ] && [ "$EUID" -ne 0 ]; then
  echo "Note: Port ${PORT} requires administrative privileges (sudo)."
  echo ""
  sudo PORT="${PORT}" node server.js
else
  PORT="${PORT}" node server.js
fi
