#!/bin/bash
# Carbone startup helper

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== Carbone Startup ==="
echo ""

if [ ! -f "$SCRIPT_DIR/office-addin/certs/server.crt" ]; then
    echo "1. Generating SSL certificates..."
    cd "$SCRIPT_DIR/office-addin"
    chmod +x generate-certs.sh
    ./generate-certs.sh

    if [[ "$OSTYPE" == darwin* ]]; then
        echo "Adding certificate to system trust store..."
        sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain certs/server.crt
    fi
fi

echo ""
echo "2. Starting Docker services..."
cd "$SCRIPT_DIR/scripts"
./start-smart.sh docker-compose.addin.yml up -d --build

echo ""
echo "Waiting for services..."
sleep 5

echo ""
echo "=== Service Status ==="
./start-smart.sh docker-compose.addin.yml ps

echo ""
echo "=== Service URLs ==="
echo "Office Add-in: https://localhost:3000"
echo "Carbone API:   http://localhost:3100"
echo ""
echo "Health check:"
curl -s http://localhost:3100/health || echo "Carbone API not ready"

echo ""
echo "=== Next Steps ==="
echo "1. Open Word, Excel, or PowerPoint"
echo "2. Insert > Get Add-ins > My Add-ins > Upload My Add-in"
echo "3. Select manifest: apps/frontend/office-addin/manifest-word.xml"
echo ""
echo "Stop services: ./scripts/start-smart.sh docker-compose.addin.yml down"
