#!/usr/bin/env python3
"""
Codegen API Server - HTTP server to control Playwright codegen
Runs on port 3000 inside browser-chrome container
"""

from __future__ import annotations

import os
import sys
import json
import subprocess
import signal
import threading
import base64
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import time

# Try to import playwright for AI control mode
try:
    from playwright.sync_api import sync_playwright, Page, Browser, BrowserContext
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    Page = None  # type: ignore
    Browser = None  # type: ignore
    BrowserContext = None  # type: ignore
    print("[WARN] Playwright sync_api not available, AI control mode disabled")

# Global state for codegen mode
codegen_process = None
codegen_output = None
current_session = None
CODEGEN_DIR = "/tmp/codegen"

# Global state for AI control mode
ai_playwright = None
ai_browser = None
ai_context = None
ai_page = None
ai_mode_active = False

os.makedirs(CODEGEN_DIR, exist_ok=True)

def start_codegen(session_id, url):
    """Start playwright codegen process"""
    global codegen_process, codegen_output, current_session

    if codegen_process and codegen_process.poll() is None:
        stop_codegen()

    current_session = session_id
    codegen_output = os.path.join(CODEGEN_DIR, f"{session_id}.js")

    print(f"[INFO] Starting codegen for session {session_id}, URL: {url}")

    env = os.environ.copy()
    env["DISPLAY"] = ":99"
    env["PLAYWRIGHT_BROWSERS_PATH"] = "/root/.cache/ms-playwright"

    # Start codegen - browser window will be shown via noVNC
    cmd = [
        "npx", "playwright", "codegen",
        "--target", "javascript",
        "--output", codegen_output,
        "--viewport-size", "1920,1080",
        url
    ]

    print(f"[INFO] Command: {' '.join(cmd)}")
    codegen_process = subprocess.Popen(
        cmd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        preexec_fn=os.setsid
    )

    # Give it a moment to start and windows to appear
    time.sleep(4)

    if codegen_process.poll() is None:
        print(f"[INFO] Codegen started with PID: {codegen_process.pid}")

        # Give browser window time to fully appear
        time.sleep(2)

        # Minimize the Playwright Inspector window
        try:
            result = subprocess.run(
                ["xdotool", "search", "--name", "Playwright", "windowminimize"],
                capture_output=True,
                text=True
            )
            print(f"[INFO] xdotool minimize inspector result: {result.returncode}, stdout: {result.stdout}, stderr: {result.stderr}")
        except Exception as e:
            print(f"[WARN] Failed to minimize inspector: {e}")

        # Move and resize the Chrome/Chromium browser window to fill the screen
        # Try multiple ways to find the browser window
        time.sleep(1)

        # List all windows for debugging
        try:
            result = subprocess.run(
                ["xdotool", "search", "--onlyvisible", ".*"],
                capture_output=True, text=True
            )
            all_windows = result.stdout.strip().split('\n') if result.stdout.strip() else []
            print(f"[DEBUG] Found {len(all_windows)} visible windows")

            for win_id in all_windows[:10]:  # Check first 10 windows
                # Get window info
                name_result = subprocess.run(
                    ["xdotool", "getwindowname", win_id],
                    capture_output=True, text=True
                )
                class_result = subprocess.run(
                    ["xdotool", "getwindowclassname", win_id],
                    capture_output=True, text=True
                )
                print(f"[DEBUG] Window {win_id}: name='{name_result.stdout.strip()}' class='{class_result.stdout.strip()}'")
        except Exception as e:
            print(f"[WARN] Failed to list windows: {e}")

        # Find browser window (chromium or chrome class)
        browser_win_id = None
        for search_class in ["chromium", "chrome", "Chromium", "Chrome"]:
            try:
                result = subprocess.run(
                    ["xdotool", "search", "--onlyvisible", "--class", search_class],
                    capture_output=True, text=True
                )
                if result.returncode == 0 and result.stdout.strip():
                    windows = result.stdout.strip().split('\n')
                    for win_id in windows:
                        # Skip if it's the Playwright Inspector
                        name_result = subprocess.run(
                            ["xdotool", "getwindowname", win_id],
                            capture_output=True, text=True
                        )
                        if "Playwright" not in name_result.stdout:
                            browser_win_id = win_id
                            print(f"[INFO] Found browser window {win_id} with class '{search_class}'")
                            break
                if browser_win_id:
                    break
            except Exception as e:
                print(f"[WARN] Search for class '{search_class}' failed: {e}")

        if browser_win_id:
            try:
                # Move window to 0,0 and resize to 1920x1080
                subprocess.run(
                    ["xdotool", "windowmove", browser_win_id, "0", "0"],
                    capture_output=True, text=True
                )
                subprocess.run(
                    ["xdotool", "windowsize", browser_win_id, "1920", "1080"],
                    capture_output=True, text=True
                )
                # Activate the window
                subprocess.run(
                    ["xdotool", "windowactivate", browser_win_id],
                    capture_output=True, text=True
                )
                print(f"[INFO] Successfully moved and resized browser window {browser_win_id}")
            except Exception as e:
                print(f"[WARN] Failed to move/resize browser window: {e}")
        else:
            print(f"[WARN] Could not find browser window to resize")

        return True
    else:
        print(f"[ERROR] Codegen failed to start")
        stdout, stderr = codegen_process.communicate()
        if stdout:
            print(f"[ERROR] stdout: {stdout.decode()}")
        if stderr:
            print(f"[ERROR] stderr: {stderr.decode()}")
        return False

def stop_codegen():
    """Stop codegen process and return generated script"""
    global codegen_process, codegen_output, current_session

    script = ""

    if codegen_process and codegen_process.poll() is None:
        print(f"[INFO] Stopping codegen (PID: {codegen_process.pid})...")
        try:
            os.killpg(os.getpgid(codegen_process.pid), signal.SIGTERM)
            codegen_process.wait(timeout=5)
        except Exception as e:
            print(f"[WARN] Failed to terminate gracefully: {e}")
            try:
                os.killpg(os.getpgid(codegen_process.pid), signal.SIGKILL)
            except:
                pass

    if codegen_output and os.path.exists(codegen_output):
        with open(codegen_output, 'r') as f:
            script = f.read()
        os.remove(codegen_output)
        print(f"[INFO] Script length: {len(script)} chars")

    codegen_process = None
    codegen_output = None
    current_session = None

    return script

def get_script():
    """Get current generated script"""
    global codegen_output

    if codegen_output and os.path.exists(codegen_output):
        with open(codegen_output, 'r') as f:
            return f.read()
    return "// No script generated yet"

# ============================================
# AI Control Mode Functions
# ============================================

def ai_start(url="about:blank"):
    """Start browser for AI control mode"""
    global ai_playwright, ai_browser, ai_context, ai_page, ai_mode_active

    if not PLAYWRIGHT_AVAILABLE:
        print("[ERROR] Playwright not available for AI control")
        return False

    # Stop codegen if running
    if codegen_process and codegen_process.poll() is None:
        stop_codegen()

    # Stop existing AI session
    if ai_mode_active:
        ai_stop()

    try:
        print(f"[INFO] Starting AI control browser, URL: {url}")
        os.environ["DISPLAY"] = ":99"

        ai_playwright = sync_playwright().start()
        # Use the chromium installed via npm playwright
        ai_browser = ai_playwright.chromium.launch(
            headless=False,
            executable_path="/opt/chromium/chrome-linux/chrome",
            args=[
                "--window-size=1920,1080",
                "--no-sandbox",
                "--disable-setuid-sandbox",
            ]
        )
        ai_context = ai_browser.new_context(
            viewport={"width": 1920, "height": 1080}
        )
        ai_page = ai_context.new_page()
        ai_page.goto(url)
        ai_mode_active = True

        print("[INFO] AI control browser started successfully")

        # Position browser window using xdotool
        time.sleep(2)
        try:
            result = subprocess.run(
                ["xdotool", "search", "--onlyvisible", "--class", "chromium"],
                capture_output=True, text=True
            )
            if result.returncode == 0 and result.stdout.strip():
                win_id = result.stdout.strip().split('\n')[0]
                subprocess.run(["xdotool", "windowmove", win_id, "0", "0"], capture_output=True)
                subprocess.run(["xdotool", "windowsize", win_id, "1920", "1080"], capture_output=True)
                subprocess.run(["xdotool", "windowactivate", win_id], capture_output=True)
                print(f"[INFO] Positioned AI browser window {win_id}")
        except Exception as e:
            print(f"[WARN] Failed to position AI browser window: {e}")

        return True
    except Exception as e:
        print(f"[ERROR] Failed to start AI browser: {e}")
        import traceback
        traceback.print_exc()
        ai_stop()
        return False

def ai_stop():
    """Stop AI control browser"""
    global ai_playwright, ai_browser, ai_context, ai_page, ai_mode_active

    print("[INFO] Stopping AI control browser")

    try:
        if ai_page:
            ai_page.close()
        if ai_context:
            ai_context.close()
        if ai_browser:
            ai_browser.close()
        if ai_playwright:
            ai_playwright.stop()
    except Exception as e:
        print(f"[WARN] Error stopping AI browser: {e}")

    ai_playwright = None
    ai_browser = None
    ai_context = None
    ai_page = None
    ai_mode_active = False
    print("[INFO] AI control browser stopped")
    return True

def ai_navigate(url):
    """Navigate to URL"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        ai_page.goto(url, timeout=30000)
        return {"status": "success", "url": url}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_click(selector=None, text=None):
    """Click element by selector or text"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        if text:
            # Click by text content
            ai_page.click(f"text={text}")
        elif selector:
            ai_page.click(selector)
        else:
            return {"status": "error", "message": "No selector or text provided"}
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_fill(selector, value):
    """Fill input field"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        ai_page.fill(selector, value)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_screenshot():
    """Take screenshot"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        screenshot_bytes = ai_page.screenshot()
        screenshot_base64 = base64.b64encode(screenshot_bytes).decode('utf-8')
        return {"status": "success", "screenshot": screenshot_base64}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_wait(selector=None, duration=None):
    """Wait for element or duration"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        if selector:
            ai_page.wait_for_selector(selector, timeout=30000)
        elif duration:
            ai_page.wait_for_timeout(duration)
        else:
            ai_page.wait_for_timeout(1000)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_hover(selector):
    """Hover over element"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        ai_page.hover(selector)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_press(key):
    """Press key"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        ai_page.keyboard.press(key)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_evaluate(script):
    """Execute JavaScript"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        result = ai_page.evaluate(script)
        return {"status": "success", "result": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_reset():
    """Reset browser to blank page"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        ai_page.goto("about:blank")
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

class CodegenHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[HTTP] {args[0]}")

    def send_json(self, data, status=200):
        response = json.dumps(data)
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', len(response))
        self.end_headers()
        self.wfile.write(response.encode())

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        # Codegen mode endpoints
        if path == '/start':
            session = params.get('session', [None])[0]
            url = params.get('url', [None])[0]

            if not session or not url:
                self.send_json({'error': 'Missing session or url parameter'}, 400)
                return

            if start_codegen(session, url):
                self.send_json({'status': 'started', 'session': session})
            else:
                self.send_json({'error': 'Failed to start codegen'}, 500)

        elif path == '/stop':
            script = stop_codegen()
            self.send_json({'status': 'stopped', 'script': script})

        elif path == '/script':
            script = get_script()
            self.send_json({'script': script})

        elif path == '/status':
            if codegen_process and codegen_process.poll() is None:
                self.send_json({'status': 'recording', 'session': current_session})
            elif ai_mode_active:
                self.send_json({'status': 'ai_control', 'mode': 'ai'})
            else:
                self.send_json({'status': 'idle'})

        elif path == '/health':
            self.send_json({'status': 'ok'})

        # AI Control mode endpoints
        elif path == '/ai/start':
            if not PLAYWRIGHT_AVAILABLE:
                self.send_json({'error': 'Playwright not available'}, 500)
                return
            url = params.get('url', ['about:blank'])[0]
            if ai_start(url):
                self.send_json({'status': 'started', 'mode': 'ai'})
            else:
                self.send_json({'error': 'Failed to start AI browser'}, 500)

        elif path == '/ai/stop':
            ai_stop()
            self.send_json({'status': 'stopped'})

        elif path == '/navigate':
            url = params.get('url', [None])[0]
            if not url:
                self.send_json({'error': 'Missing url parameter'}, 400)
                return
            result = ai_navigate(url)
            self.send_json(result)

        elif path == '/click':
            selector = params.get('selector', [None])[0]
            text = params.get('text', [None])[0]
            result = ai_click(selector, text)
            self.send_json(result)

        elif path == '/fill':
            selector = params.get('selector', [None])[0]
            value = params.get('value', [None])[0]
            if not selector or not value:
                self.send_json({'error': 'Missing selector or value parameter'}, 400)
                return
            result = ai_fill(selector, value)
            self.send_json(result)

        elif path == '/screenshot':
            result = ai_screenshot()
            self.send_json(result)

        elif path == '/wait':
            selector = params.get('selector', [None])[0]
            duration = params.get('duration', [None])[0]
            duration_ms = int(duration) if duration else None
            result = ai_wait(selector, duration_ms)
            self.send_json(result)

        elif path == '/hover':
            selector = params.get('selector', [None])[0]
            if not selector:
                self.send_json({'error': 'Missing selector parameter'}, 400)
                return
            result = ai_hover(selector)
            self.send_json(result)

        elif path == '/press':
            key = params.get('key', [None])[0]
            if not key:
                self.send_json({'error': 'Missing key parameter'}, 400)
                return
            result = ai_press(key)
            self.send_json(result)

        elif path == '/evaluate':
            script = params.get('script', [None])[0]
            if not script:
                self.send_json({'error': 'Missing script parameter'}, 400)
                return
            result = ai_evaluate(script)
            self.send_json(result)

        elif path == '/reset':
            result = ai_reset()
            self.send_json(result)

        else:
            self.send_json({'error': 'Not found'}, 404)

    def do_POST(self):
        self.do_GET()

def run_server(port=3000):
    server = HTTPServer(('0.0.0.0', port), CodegenHandler)
    print(f"[INFO] Codegen API Server running on port {port}")
    server.serve_forever()

if __name__ == '__main__':
    port = int(os.environ.get('CODEGEN_API_PORT', 3000))
    run_server(port)