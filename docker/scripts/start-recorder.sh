#!/bin/bash
set -e

# Default configuration
SCREEN_WIDTH=${SCREEN_WIDTH:-1920}
SCREEN_HEIGHT=${SCREEN_HEIGHT:-1080}
SCREEN_DEPTH=${SCREEN_DEPTH:-24}
DISPLAY_NUM=${DISPLAY_NUM:-99}
VNC_PORT=${VNC_PORT:-5900}
NOVNC_PORT=${NOVNC_PORT:-8080}
CHROME_DEBUG_PORT=${CHROME_DEBUG_PORT:-9222}
CODEGEN_API_PORT=${CODEGEN_API_PORT:-3011}
CHROME_PROFILE_PATH=${CHROME_PROFILE_PATH:-/home/chrome/.config/google-chrome}
SESSION_MODE=${SESSION_MODE:-interactive}
HEADLESS=${HEADLESS:-false}
ENABLE_CODEGEN=${ENABLE_CODEGEN:-true}

normalize_bool() {
    local raw="${1:-false}"
    raw=$(echo "$raw" | tr '[:upper:]' '[:lower:]')
    if [ "$raw" = "1" ] || [ "$raw" = "true" ] || [ "$raw" = "yes" ]; then
        echo "true"
        return
    fi
    echo "false"
}

HEADLESS=$(normalize_bool "$HEADLESS")
ENABLE_CODEGEN=$(normalize_bool "$ENABLE_CODEGEN")

if [ "$SESSION_MODE" = "agent" ] && [ "$HEADLESS" != "true" ]; then
    HEADLESS="true"
fi

if [ "$HEADLESS" = "true" ] && [ "$ENABLE_CODEGEN" = "true" ]; then
    echo "[WARN] HEADLESS=true is not compatible with codegen UI workflow, forcing ENABLE_CODEGEN=false"
    ENABLE_CODEGEN="false"
fi

wait_for_http() {
    local url="$1"
    local timeout_s="${2:-30}"
    local deadline=$((SECONDS + timeout_s))
    while [ $SECONDS -lt $deadline ]; do
        if curl -fsS "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 0.2
    done
    return 1
}

echo "========================================"
echo "Browser Recorder Container"
echo "Session mode + optional codegen"
echo "========================================"
echo ""
echo "Configuration:"
echo "  Session mode: ${SESSION_MODE}"
echo "  Headless: ${HEADLESS}"
echo "  Enable codegen: ${ENABLE_CODEGEN}"
echo "  Screen: ${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH}"
echo "  Display: :${DISPLAY_NUM}"
echo "  VNC Port: ${VNC_PORT}"
echo "  noVNC Port: ${NOVNC_PORT}"
echo "  CDP Port: ${CHROME_DEBUG_PORT}"
echo "  Codegen API Port: ${CODEGEN_API_PORT}"
echo ""

cleanup() {
    echo "Shutting down services..."
    pkill -f "Xvfb" || true
    pkill -f "fluxbox" || true
    pkill -f "x11vnc" || true
    pkill -f "websockify" || true
    pkill -f "codegen-api.py" || true
    pkill -f "socat" || true
    pkill -f "chrome" || true
    exit 0
}
trap cleanup SIGTERM SIGINT

if [ "$HEADLESS" != "true" ]; then
    echo "[1/5] Starting Xvfb on display :${DISPLAY_NUM}..."
    Xvfb :${DISPLAY_NUM} -screen 0 ${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH} \
        -ac +extension GLX +render -noreset &
    XVFB_PID=$!
    sleep 0.2
    if ! kill -0 $XVFB_PID 2>/dev/null; then
        echo "ERROR: Xvfb failed to start"
        exit 1
    fi
    echo "OK: Xvfb started (PID: $XVFB_PID)"

    echo "[2/5] Starting Fluxbox window manager..."
    DISPLAY=:${DISPLAY_NUM} fluxbox &
    sleep 0.2
    echo "OK: Fluxbox started"
fi

echo "[3/5] Starting Chrome with CDP on port ${CHROME_DEBUG_PORT}..."
CHROME_BIN="/opt/chromium/chrome-linux/chrome"
if [ ! -x "$CHROME_BIN" ]; then
    CHROME_BIN="/usr/bin/google-chrome"
fi
if [ ! -x "$CHROME_BIN" ]; then
    CHROME_BIN="/usr/bin/google-chrome-stable"
fi
if [ ! -x "$CHROME_BIN" ]; then
    CHROME_BIN="/usr/bin/chromium"
fi
if [ ! -x "$CHROME_BIN" ]; then
    CHROME_BIN="/usr/bin/chromium-browser"
fi

if [ ! -x "$CHROME_BIN" ]; then
    echo "ERROR: Chrome binary not found"
    exit 1
fi

INTERNAL_CDP_PORT=$((CHROME_DEBUG_PORT + 1))
mkdir -p "${CHROME_PROFILE_PATH}"

CHROME_COMMON_ARGS=(
    --no-sandbox
    --disable-dev-shm-usage
    --disable-gpu
    --disable-gpu-compositing
    --use-gl=swiftshader
    --disable-background-timer-throttling
    --disable-backgrounding-occluded-windows
    --disable-renderer-backgrounding
    --disable-features=TranslateUI,VizDisplayCompositor
    --disable-ipc-flooding-protection
    --remote-debugging-port=${INTERNAL_CDP_PORT}
    --remote-allow-origins=*
    --no-first-run
    --no-default-browser-check
    --homepage
    about:blank
    --user-data-dir=${CHROME_PROFILE_PATH}
)

if [ "$HEADLESS" = "true" ]; then
    "$CHROME_BIN" "${CHROME_COMMON_ARGS[@]}" --headless=new --window-size=${SCREEN_WIDTH},${SCREEN_HEIGHT} &
else
    DISPLAY=:${DISPLAY_NUM} "$CHROME_BIN" "${CHROME_COMMON_ARGS[@]}" \
        --window-size=${SCREEN_WIDTH},${SCREEN_HEIGHT} \
        --window-position=0,0 \
        --start-maximized &
fi
CHROME_PID=$!
sleep 0.2
if ! kill -0 $CHROME_PID 2>/dev/null; then
    echo "ERROR: Chrome failed to start"
    exit 1
fi

echo "  Forwarding 0.0.0.0:${CHROME_DEBUG_PORT} -> 127.0.0.1:${INTERNAL_CDP_PORT}"
socat TCP-LISTEN:${CHROME_DEBUG_PORT},fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:${INTERNAL_CDP_PORT} &
SOCAT_PID=$!
sleep 0.2
if ! kill -0 $SOCAT_PID 2>/dev/null; then
    echo "ERROR: socat failed to start"
    exit 1
fi
if ! wait_for_http "http://127.0.0.1:${CHROME_DEBUG_PORT}/json/version" 20; then
    echo "ERROR: CDP endpoint was not ready in time"
    exit 1
fi
echo "OK: Chrome CDP is ready"
echo "  DevTools: http://localhost:${CHROME_DEBUG_PORT}"

if [ "$HEADLESS" != "true" ]; then
    echo "[4/5] Starting VNC server on port ${VNC_PORT}..."
    x11vnc -display :${DISPLAY_NUM} -rfbport ${VNC_PORT} -forever -shared \
        -nopw -noxdamage -noxkb &
    VNC_PID=$!
    sleep 0.2
    if ! kill -0 $VNC_PID 2>/dev/null; then
        echo "ERROR: VNC server failed to start"
        exit 1
    fi
    echo "OK: VNC server started"
    echo "  VNC Address: localhost:${VNC_PORT}"

    echo "[5/5] Starting noVNC on port ${NOVNC_PORT}..."
    websockify --web=/usr/share/novnc ${NOVNC_PORT} localhost:${VNC_PORT} &
    NOVNC_PID=$!
    sleep 0.2
    if ! kill -0 $NOVNC_PID 2>/dev/null; then
        echo "ERROR: noVNC failed to start"
        exit 1
    fi
    if ! wait_for_http "http://127.0.0.1:${NOVNC_PORT}/vnc.html" 20; then
        echo "ERROR: noVNC endpoint was not ready in time"
        exit 1
    fi
    echo "OK: noVNC is ready"
    echo "  Web VNC: http://localhost:${NOVNC_PORT}/vnc.html"
fi

if [ "$ENABLE_CODEGEN" = "true" ]; then
    echo "[extra] Starting Codegen API Server on port ${CODEGEN_API_PORT}..."
    python3 /scripts/codegen-api.py &
    CODEGEN_PID=$!
    sleep 0.2
    if ! kill -0 $CODEGEN_PID 2>/dev/null; then
        echo "ERROR: Codegen API failed to start"
        exit 1
    fi
    if ! wait_for_http "http://127.0.0.1:${CODEGEN_API_PORT}/status" 20; then
        echo "ERROR: Codegen API endpoint was not ready in time"
        exit 1
    fi
    echo "OK: Codegen API is ready"
fi

echo ""
echo "========================================"
echo "All services started successfully!"
echo "========================================"
echo ""
echo "Access Points:"
if [ "$HEADLESS" != "true" ]; then
    echo "  noVNC (Web):     http://localhost:${NOVNC_PORT}/vnc.html"
fi
echo "  DevTools:        http://localhost:${CHROME_DEBUG_PORT}"
if [ "$ENABLE_CODEGEN" = "true" ]; then
    echo "  Codegen API:     http://localhost:${CODEGEN_API_PORT}"
fi
echo ""

wait
