#!/bin/bash

# Move to the script's directory to ensure paths are resolved correctly
cd "$(dirname "$0")"

echo "========================================="
echo "  Starting Mock ERP Server on Port 80    "
echo "========================================="
echo "Note: Port 80 requires administrative privileges (sudo)."
echo ""

# Execute server using sudo
sudo node server.js
