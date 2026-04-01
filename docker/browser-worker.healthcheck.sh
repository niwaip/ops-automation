#!/bin/bash
# Browser Worker Health Check Script

set -e

CDP_PORT="${CDP_PORT:-9222}"
CHROME_PROFILE_PATH="${CHROME_PROFILE_PATH:-/home/chrome/.config/google-chrome}"

# Check if Chrome process is running
check_chrome_process() {
    if pgrep -f "chrome.*remote-debugging-port" > /dev/null 2>&1; then
        return 0
    fi
    if pgrep -f "chromium.*remote-debugging-port" > /dev/null 2>&1; then
        return 0
    fi
    # Also check for any chrome process
    if pgrep -x chrome > /dev/null 2>&1; then
        return 0
    fi
    if pgrep -x chromium > /dev/null 2>&1; then
        return 0
    fi
    if pgrep -x chromium-browser > /dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Check if CDP port is responding
check_cdp_port() {
    if curl -s --connect-timeout 5 "http://localhost:${CDP_PORT}/json/version" > /dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Main health check
main() {
    chrome_running=false
    cdp_healthy=false

    if check_chrome_process; then
        chrome_running=true
    fi

    if check_cdp_port; then
        cdp_healthy=true
    fi

    # Both must be true for healthy state
    if [ "$chrome_running" = true ] && [ "$cdp_healthy" = true ]; then
        echo "{\"healthy\": true, \"chrome_running\": true, \"cdp_port\": ${CDP_PORT}}"
        exit 0
    else
        echo "{\"healthy\": false, \"chrome_running\": ${chrome_running}, \"cdp_port\": ${CDP_PORT}}"
        exit 1
    fi
}

main