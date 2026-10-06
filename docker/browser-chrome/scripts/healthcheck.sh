#!/usr/bin/env bash
# Mode-aware browser container healthcheck

normalize_bool() {
    local raw="${1:-false}"
    raw=$(echo "$raw" | tr '[:upper:]' '[:lower:]')
    if [ "$raw" = "1" ] || [ "$raw" = "true" ] || [ "$raw" = "yes" ]; then
        echo "true"
        return
    fi
    echo "false"
}

cdp_port="${CHROME_DEBUG_PORT:-9222}"
novnc_port="${NOVNC_PORT:-8080}"
codegen_port="${CODEGEN_API_PORT:-3011}"

session_mode="${SESSION_MODE:-interactive}"
headless="$(normalize_bool "${HEADLESS:-false}")"

# Align with start-recorder.sh: agent mode forces headless=true
if [ "$session_mode" = "agent" ] && [ "$headless" != "true" ]; then
    headless="true"
fi

# Align with start-recorder.sh: default ENABLE_CODEGEN is true unless headless
enable_codegen="$(normalize_bool "${ENABLE_CODEGEN:-${CODEGEN_REQUIRED:-true}}")"
if [ "$headless" = "true" ] && [ "$enable_codegen" = "true" ]; then
    enable_codegen="false"
fi

# 1. Chrome CDP endpoint must be responsive in all modes
if ! curl -fsS "http://localhost:${cdp_port}/json/version" >/dev/null 2>&1; then
    exit 1
fi

# 2. If not running in headless mode, noVNC web interface should be accessible
if [ "$headless" != "true" ]; then
    if ! curl -fsS "http://localhost:${novnc_port}/vnc.html" >/dev/null 2>&1; then
        exit 1
    fi
fi

# 3. If Codegen API is required/enabled, verify status
if [ "$enable_codegen" = "true" ]; then
    if ! curl -fsS "http://localhost:${codegen_port}/status" >/dev/null 2>&1; then
        exit 1
    fi
fi

exit 0
