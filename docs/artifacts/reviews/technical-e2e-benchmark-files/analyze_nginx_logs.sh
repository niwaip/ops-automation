#!/usr/bin/env bash
set -eo pipefail

LOG_FILE="${1:-nginx_access_sample.log}"

if [[ ! -f "$LOG_FILE" ]]; then
    echo "Error: Log file '$LOG_FILE' not found." >&2
    exit 1
fi

echo "=== Top 5 Independent Client IPs ==="
awk '{print $1}' "$LOG_FILE" | sort | uniq -c | sort -nr | head -n 5

echo ""
echo "=== HTTP Status Code Distribution ==="
awk '{print $9}' "$LOG_FILE" | sort | uniq -c | sort -nr

echo ""
echo "=== Requests with 5xx Server Errors ==="
awk '$9 ~ /^5/ {print $1, $4, $7, $9}' "$LOG_FILE"
