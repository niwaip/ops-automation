#!/bin/bash
# Browser Worker Entrypoint Script
# Manages Chrome startup with noVNC and CDP support

set -e

# Configuration
CHROME_PROFILE_PATH="${CHROME_PROFILE_PATH:-/home/chrome/.config/google-chrome}"
NOVNC_PORT="${NOVNC_PORT:-8080}"
CDP_PORT="${CDP_PORT:-9222}"
VNC_PORT="${VNC_PORT:-5900}"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Wait for Chrome to be ready
wait_for_chrome() {
    local max_attempts=30
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://localhost:${CDP_PORT}/json/version" > /dev/null 2>&1; then
            log "Chrome DevTools Protocol is ready on port ${CDP_PORT}"
            return 0
        fi
        log "Waiting for Chrome to start... (attempt ${attempt}/${max_attempts})"
        sleep 2
        attempt=$((attempt + 1))
    done
    log "ERROR: Chrome failed to start within timeout"
    return 1
}

# Start VNC server
start_vnc() {
    log "Starting VNC server on display :0"
    vncserver :0 -geometry 1920x1080 -depth 24 -securitytypes None 2>/dev/null || \
    vncserver :0 -geometry 1920x1080 -depth 24 2>/dev/null || true
    export DISPLAY=:0
}

# Start noVNC
start_novnc() {
    log "Starting noVNC on port ${NOVNC_PORT}"
    if command -v websockify &> /dev/null; then
        websockify --web=/usr/share/novnc/ ${NOVNC_PORT} localhost:${VNC_PORT} &
    elif [ -d /opt/noVNC ]; then
        /opt/noVNC/utils/launch.sh --vnc localhost:${VNC_PORT} --listen ${NOVNC_PORT} &
    else
        log "WARNING: noVNC not found, skipping noVNC startup"
    fi
}

# Start Chrome with CDP
start_chrome() {
    log "Starting Chrome with CDP on port ${CDP_PORT}"

    local chrome_cmd="google-chrome"
    if ! command -v google-chrome &> /dev/null; then
        chrome_cmd="google-chrome-stable"
    fi
    if ! command -v google-chrome-stable &> /dev/null; then
        chrome_cmd="chromium"
    fi
    if ! command -v chromium &> /dev/null; then
        chrome_cmd="chromium-browser"
    fi

    local args="$@"
    if [ -z "$args" ]; then
        args="${CHROME_ARGS:-}"
    fi

    for required_arg in \
        --ignore-certificate-errors \
        --allow-insecure-localhost \
        --disable-client-side-phishing-detection \
        --test-type \
        --safebrowsing-disable-download-protection; do
        if ! echo " $args " | grep -q -- " ${required_arg} "; then
            args="$args ${required_arg}"
        fi
    done

    if ! echo "$args" | grep -q "HttpsUpgrades"; then
        args="$args --disable-features=TranslateUI,VizDisplayCompositor,HttpsUpgrades,HTTPS-FirstBalancedModeAutoEnable,HTTPS-FirstModeV2ForEngagedSites"
    fi

    # Ensure remote debugging port is included
    if ! echo "$args" | grep -q "remote-debugging-port"; then
        args="--remote-debugging-port=${CDP_PORT} $args"
    fi

    # Create profile directory if mounting is used
    mkdir -p "${CHROME_PROFILE_PATH}" 2>/dev/null || true

    log "Running: $chrome_cmd $args"
    $chrome_cmd $args &
    CHROME_PID=$!

    log "Chrome started with PID: ${CHROME_PID}"

    # Save PID for health check
    echo ${CHROME_PID} > /tmp/chrome.pid
}

# Signal handlers
cleanup() {
    log "Received shutdown signal, cleaning up..."
    if [ -f /tmp/chrome.pid ]; then
        CHROME_PID=$(cat /tmp/chrome.pid)
        kill ${CHROME_PID} 2>/dev/null || true
    fi
    exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

# Main entrypoint
main() {
    log "Browser Worker starting..."
    log "Configuration:"
    log "  - Profile path: ${CHROME_PROFILE_PATH}"
    log "  - noVNC port: ${NOVNC_PORT}"
    log "  - CDP port: ${CDP_PORT}"
    log "  - VNC port: ${VNC_PORT}"

    # Start VNC first
    start_vnc

    # Start noVNC
    start_novnc

    # Start Chrome with provided arguments or defaults
    start_chrome "$@"

    # Wait for Chrome to be ready
    if wait_for_chrome; then
        log "Browser Worker is ready!"
        log "  - noVNC: http://localhost:${NOVNC_PORT}"
        log "  - CDP: http://localhost:${CDP_PORT}"
    else
        log "ERROR: Browser Worker failed to start properly"
        exit 1
    fi

    # Keep container running and monitor Chrome
    while true; do
        if [ -f /tmp/chrome.pid ]; then
            CHROME_PID=$(cat /tmp/chrome.pid)
            if ! kill -0 ${CHROME_PID} 2>/dev/null; then
                log "Chrome process died, restarting..."
                start_chrome "$@"
                wait_for_chrome || true
            fi
        fi
        sleep 5
    done
}

# Run main with all arguments
main "$@"
