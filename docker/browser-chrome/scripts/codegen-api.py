#!/usr/bin/env python3
"""
Codegen API Server - HTTP server to control Playwright codegen
Runs on port 3000 inside browser-chrome container
"""

import os
import sys
import json
import subprocess
import signal
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import time

# Global state
codegen_process = None
codegen_output = None
current_session = None
CODEGEN_DIR = "/tmp/codegen"
execution_browser = None
execution_page = None

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


def execute_actions(actions, session_id=None, start_url=None):
    """Execute browser actions using Node.js Playwright (already installed)"""
    global execution_browser, execution_page

    results = []

    try:
        # Use existing Xvfb display
        os.environ["DISPLAY"] = ":99"
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/root/.cache/ms-playwright"

        # Write actions to temp file
        input_data = {
            'actions': actions,
            'session': session_id or 'default'
        }
        input_path = f"/tmp/codegen/execute_input_{session_id}.json"
        with open(input_path, 'w') as f:
            json.dump(input_data, f)

        # Execute using Node.js Playwright (already has correct browsers)
        cmd = ['node', '/scripts/execute-actions.js', input_path]
        print(f"[EXECUTE] Running: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,  # 2 minute timeout
            env=os.environ
        )

        if result.stderr:
            print(f"[EXECUTE] stderr: {result.stderr}")

        # Parse result - stdout should only have JSON now
        if result.returncode == 0 and result.stdout:
            try:
                # Get the last line which should be JSON
                lines = result.stdout.strip().split('\n')
                json_line = lines[-1] if lines else ''
                output = json.loads(json_line)
                return output
            except json.JSONDecodeError as e:
                print(f"[ERROR] Failed to parse output: {e}")
                return {'error': f'Failed to parse output: {result.stdout}', 'results': results}

        return {'error': result.stderr or 'Execution failed', 'results': results}

    except subprocess.TimeoutExpired:
        print(f"[ERROR] Execution timeout")
        return {'error': 'Execution timeout (120s)', 'results': results}
    except Exception as e:
        print(f"[ERROR] Execution failed: {e}")
        return {'error': str(e), 'results': results}


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

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

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
            else:
                self.send_json({'status': 'idle'})

        elif path == '/health':
            self.send_json({'status': 'ok'})

        else:
            self.send_json({'error': 'Not found'}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        # Read POST body
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else ''

        if path == '/execute':
            try:
                if post_data:
                    data = json.loads(post_data.decode())
                else:
                    # Try query params for simple actions
                    data = {'actions': []}

                actions = data.get('actions', data.get('steps', []))
                session_id = data.get('session', params.get('session', [None])[0])
                start_url = data.get('url', data.get('start_url', None))

                if not actions:
                    self.send_json({'error': 'No actions provided'}, 400)
                    return

                print(f"[EXECUTE] Received {len(actions)} actions for session {session_id}")
                result = execute_actions(actions, session_id, start_url)
                self.send_json(result)

            except json.JSONDecodeError as e:
                self.send_json({'error': f'Invalid JSON: {str(e)}'}, 400)
            except Exception as e:
                self.send_json({'error': str(e)}, 500)

        else:
            # Handle other POST requests as GET
            self.do_GET()

def run_server(port=3000):
    server = HTTPServer(('0.0.0.0', port), CodegenHandler)
    print(f"[INFO] Codegen API Server running on port {port}")
    server.serve_forever()

if __name__ == '__main__':
    port = int(os.environ.get('CODEGEN_API_PORT', 3000))
    run_server(port)