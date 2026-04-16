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

echo "========================================"
echo "Browser Recorder Container"
echo "Playwright codegen + Xvfb + noVNC"
echo "========================================"
echo ""
echo "Configuration:"
echo "  Screen: ${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH}"
echo "  Display: :${DISPLAY_NUM}"
echo "  VNC Port: ${VNC_PORT}"
echo "  noVNC Port: ${NOVNC_PORT}"
echo "  Codegen API Port: ${CODEGEN_API_PORT}"
echo ""

# Function to cleanup processes on exit
cleanup() {
    echo "Shutting down services..."
    pkill -f "Xvfb" || true
    pkill -f "x11vnc" || true
    pkill -f "websockify" || true
    pkill -f "codegen" || true
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

# 3. Start VNC server
echo "[3/5] Starting VNC server on port ${VNC_PORT}..."
x11vnc -display :${DISPLAY_NUM} -rfbport ${VNC_PORT} -forever -shared \
    -nopw -noxdamage -noxkb &
VNC_PID=$!
sleep 1
echo "✓ VNC server started"
echo "  VNC Address: localhost:${VNC_PORT}"

# 4. Start noVNC (Web VNC client)
echo "[4/5] Starting noVNC on port ${NOVNC_PORT}..."
websockify --web=/usr/share/novnc ${NOVNC_PORT} localhost:${VNC_PORT} &
NOVNC_PID=$!
sleep 2
echo "✓ noVNC started"
echo "  Web VNC: http://localhost:${NOVNC_PORT}/vnc.html"

# 5. Start Codegen API Server
echo "[5/5] Starting Codegen API Server on port ${CODEGEN_API_PORT}..."
python3 /scripts/codegen-api.py &
CODEGEN_PID=$!
sleep 1
echo "✓ Codegen API Server started"

echo ""
echo "========================================"
echo "All services started successfully!"
echo "========================================"
echo ""
echo "Access Points:"
echo "  🌐 noVNC (Web):     http://localhost:${NOVNC_PORT}/vnc.html"
echo "  🔌 Codegen API:     http://localhost:${CODEGEN_API_PORT}"
echo ""
echo "API Endpoints:"
echo "  GET /start?session=<id>&url=<url>  - Start recording"
echo "  GET /stop                          - Stop recording, get script"
echo "  GET /script                        - Get current script"
echo "  GET /status                        - Get recording status"
echo ""
echo "Browser will appear when recording starts via Playwright codegen"
echo ""

# Keep container running
wait