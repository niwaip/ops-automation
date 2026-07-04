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

echo "========================================"
echo "Chrome + Xvfb + noVNC Docker Container"
echo "========================================"
echo ""
echo "Configuration:"
echo "  Screen: ${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH}"
echo "  Display: :${DISPLAY_NUM}"
echo "  VNC Port: ${VNC_PORT}"
echo "  noVNC Port: ${NOVNC_PORT}"
echo "  Chrome Debug Port: ${CHROME_DEBUG_PORT}"
echo ""

# Function to cleanup processes on exit
cleanup() {
    echo "Shutting down services..."
    pkill -f "Xvfb" || true
    pkill -f "x11vnc" || true
    pkill -f "chrome" || true
    exit 0
}
trap cleanup SIGTERM SIGINT

# 1. Start Xvfb (Virtual Framebuffer)
echo "[1/5] Starting Xvfb on display :${DISPLAY_NUM}..."
Xvfb :${DISPLAY_NUM} -screen 0 ${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH} \
    -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 2

# Verify Xvfb started
if ! kill -0 $XVFB_PID 2>/dev/null; then
    echo "ERROR: Xvfb failed to start"
    exit 1
fi
echo "✓ Xvfb started (PID: $XVFB_PID)"

# 2. Start window manager (fluxbox)
echo "[2/5] Starting Fluxbox window manager..."
DISPLAY=:${DISPLAY_NUM} fluxbox &
sleep 1
echo "✓ Fluxbox started"

# 3. Start Chrome
echo "[3/5] Starting Google Chrome..."
# Find Chrome binary
CHROME_BIN="/opt/chromium/chrome"
if [ ! -x "$CHROME_BIN" ] && [ -d /opt/chromium ]; then
    CHROME_BIN=$(find /opt/chromium -type f -name chrome 2>/dev/null | head -1)
fi
if [ ! -x "$CHROME_BIN" ]; then
    CHROME_BIN="/usr/bin/google-chrome"
fi
if [ ! -x "$CHROME_BIN" ]; then
    echo "ERROR: Chrome binary not found"
    exit 1
fi
echo "Using Chrome binary: $CHROME_BIN"
# Chrome binds CDP to localhost only, we use socat to expose it
# Chrome uses internal port 9223, socat forwards 9222 to it
INTERNAL_CDP_PORT=$((CHROME_DEBUG_PORT + 1))
DISPLAY=:${DISPLAY_NUM} "$CHROME_BIN" \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-gpu \
    --disable-gpu-compositing \
    --use-gl=swiftshader \
    --disable-background-timer-throttling \
    --disable-backgrounding-occluded-windows \
    --disable-renderer-backgrounding \
    --ignore-certificate-errors \
    --allow-insecure-localhost \
    --disable-client-side-phishing-detection \
    --test-type \
    --safebrowsing-disable-download-protection \
    --disable-features=TranslateUI,VizDisplayCompositor,HttpsUpgrades,HTTPS-FirstBalancedModeAutoEnable,HTTPS-FirstModeV2ForEngagedSites \
    --disable-ipc-flooding-protection \
    --remote-debugging-port=${INTERNAL_CDP_PORT} \
    --remote-allow-origins=* \
    --window-size=${SCREEN_WIDTH},${SCREEN_HEIGHT} \
    --window-position=0,0 \
    --start-maximized \
    --no-first-run \
    --no-default-browser-check \
    --homepage "about:blank" \
    --user-data-dir=/home/chrome/.config/google-chrome &

CHROME_PID=$!
sleep 3

# Start socat to forward CDP port to all interfaces
echo "  Starting socat to forward 0.0.0.0:${CHROME_DEBUG_PORT} -> 127.0.0.1:${INTERNAL_CDP_PORT}..."
socat TCP-LISTEN:${CHROME_DEBUG_PORT},fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:${INTERNAL_CDP_PORT} &
SOCAT_PID=$!
sleep 1

# Verify Chrome started
if ! kill -0 $CHROME_PID 2>/dev/null; then
    echo "ERROR: Chrome failed to start"
    exit 1
fi
echo "✓ Chrome started (PID: $CHROME_PID)"
echo "  DevTools: http://localhost:${CHROME_DEBUG_PORT}"

# 4. Start VNC server
echo "[4/5] Starting VNC server on port ${VNC_PORT}..."
if [ -n "$VNC_PASSWORD" ]; then
    # Set password if provided
    mkdir -p ~/.vnc
    x11vnc -storepasswd "$VNC_PASSWORD" ~/.vnc/passwd
    x11vnc -display :${DISPLAY_NUM} -rfbport ${VNC_PORT} -forever -shared \
        -rfbauth ~/.vnc/passwd -noxdamage -noxkb &
    echo "✓ VNC server started with password protection"
else
    # No password (development only!)
    x11vnc -display :${DISPLAY_NUM} -rfbport ${VNC_PORT} -forever -shared \
        -nopw -noxdamage -noxkb &
    echo "✓ VNC server started (no password - INSECURE!)"
fi

VNC_PID=$!
sleep 1
echo "  VNC Address: localhost:${VNC_PORT}"

# 5. Start noVNC (Web VNC client)
echo "[5/5] Starting noVNC on port ${NOVNC_PORT}..."
# Use websockify directly (novnc_proxy doesn't exist in this package)
websockify --web=/usr/share/novnc ${NOVNC_PORT} localhost:${VNC_PORT} &

NOVNC_PID=$!
sleep 2
echo "✓ noVNC started"
echo "  Web VNC: http://localhost:${NOVNC_PORT}/vnc.html"

echo ""
echo "========================================"
echo "All services started successfully!"
echo "========================================"
echo ""
echo "Access Points:"
echo "  🌐 noVNC (Web):  http://localhost:${NOVNC_PORT}/vnc.html"
echo "  🔌 VNC (Native): localhost:${VNC_PORT}"
echo "  🛠️  DevTools:     http://localhost:${CHROME_DEBUG_PORT}"
echo ""
echo "Click 'Connect' in noVNC to access Chrome"
echo ""

# Keep container running
wait
