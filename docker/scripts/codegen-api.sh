#!/bin/bash
# Codegen API Server - Simple HTTP server to control Playwright codegen
# Runs on port 3000 inside browser-chrome container

set -e

CODEGEN_DIR="/tmp/codegen"
mkdir -p "$CODEGEN_DIR"

# Global variable to track codegen process
CODEGEN_PID=""
CODEGEN_OUTPUT=""
CURRENT_SESSION=""

# Function to start codegen
start_codegen() {
    local session_id=$1
    local url=$2
    local output_file="$CODEGEN_DIR/${session_id}.js"

    if [ -n "$CODEGEN_PID" ] && kill -0 "$CODEGEN_PID" 2>/dev/null; then
        echo "Codegen already running, stopping it first..."
        stop_codegen
    fi

    CURRENT_SESSION="$session_id"
    CODEGEN_OUTPUT="$output_file"

    echo "Starting codegen for session $session_id, URL: $url"

    # Start playwright codegen with browser visible on display :99
    DISPLAY=:99 npx playwright codegen \
        --target javascript \
        --output "$output_file" \
        --viewport-size 1920,1080 \
        "$url" &

    CODEGEN_PID=$!
    echo "Codegen started with PID: $CODEGEN_PID"
}

# Function to stop codegen
stop_codegen() {
    if [ -n "$CODEGEN_PID" ] && kill -0 "$CODEGEN_PID" 2>/dev/null; then
        echo "Stopping codegen (PID: $CODEGEN_PID)..."
        kill "$CODEGEN_PID" 2>/dev/null || true
        wait "$CODEGEN_PID" 2>/dev/null || true
        CODEGEN_PID=""
    fi

    # Return the generated script
    if [ -n "$CODEGEN_OUTPUT" ] && [ -f "$CODEGEN_OUTPUT" ]; then
        cat "$CODEGEN_OUTPUT"
        rm -f "$CODEGEN_OUTPUT"
    fi

    CURRENT_SESSION=""
    CODEGEN_OUTPUT=""
}

# Function to get current script
get_script() {
    if [ -n "$CODEGEN_OUTPUT" ] && [ -f "$CODEGEN_OUTPUT" ]; then
        cat "$CODEGEN_OUTPUT"
    else
        echo "// No script generated yet"
    fi
}

# Simple HTTP server using netcat
handle_request() {
    local request="$1"
    local method=$(echo "$request" | head -1 | cut -d' ' -f1)
    local path=$(echo "$request" | head -1 | cut -d' ' -f2)

    # Parse query parameters
    local query=""
    if [[ "$path" == *"?"* ]]; then
        query="${path#*\?}"
        path="${path%%\?*}"
    fi

    # Parse query params
    local session_id=""
    local url=""
    while IFS='=' read -r key value; do
        case "$key" in
            session) session_id=$(echo "$value" | sed 's/%3A/:/g;s/%2F/\//g') ;;
            url) url=$(echo "$value" | sed 's/%3A/:/g;s/%2F/\//g;s/%3F/?/g') ;;
        esac
    done <<< "$(echo "$query" | tr '&' '\n')"

    local response=""
    local content_type="application/json"

    case "$path" in
        /start)
            if [ -z "$session_id" ] || [ -z "$url" ]; then
                response='{"error": "Missing session or url parameter"}'
            else
                start_codegen "$session_id" "$url" >/dev/null 2>&1 &
                sleep 2
                if [ -n "$CODEGEN_PID" ] && kill -0 "$CODEGEN_PID" 2>/dev/null; then
                    response='{"status": "started", "session": "'"$session_id"'"}'
                else
                    response='{"error": "Failed to start codegen"}'
                fi
            fi
            ;;
        /stop)
            local script=$(stop_codegen)
            response='{"status": "stopped", "script": '"$(echo "$script" | jq -Rs .)"'}'
            ;;
        /script)
            local script=$(get_script)
            response='{"script": '"$(echo "$script" | jq -Rs .)"'}'
            ;;
        /status)
            if [ -n "$CODEGEN_PID" ] && kill -0 "$CODEGEN_PID" 2>/dev/null; then
                response='{"status": "recording", "session": "'"$CURRENT_SESSION"'"}'
            else
                response='{"status": "idle"}'
            fi
            ;;
        /health)
            response='{"status": "ok"}'
            ;;
        *)
            response='{"error": "Not found"}'
            ;;
    esac

    echo -e "HTTP/1.1 200 OK\r\nContent-Type: $content_type\r\nContent-Length: ${#response}\r\n\r\n$response"
}

echo "Codegen API Server starting on port 3000..."

# Use a simple while loop with nc
while true; do
    {
        request=$(cat)
        handle_request "$request"
    } | nc -l -p 3000 -q 1 2>/dev/null || {
        # Fallback if nc doesn't support -q
        nc -l -p 3000 <<< "$(handle_request "$(cat)")" 2>/dev/null
    }
done