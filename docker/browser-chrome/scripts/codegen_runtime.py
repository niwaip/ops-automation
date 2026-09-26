#!/usr/bin/env python3
"""
Codegen API Server - HTTP server to control Playwright codegen
Runs on port 3011 inside browser-chrome container
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
codegen_storage_state = None
CODEGEN_DIR = "/tmp/codegen"

# Global state for AI control mode
ai_playwright = None
ai_browser = None
ai_context = None
ai_page = None
ai_mode_active = False

os.makedirs(CODEGEN_DIR, exist_ok=True)

def resolve_chrome_executable() -> str:
    """Resolve the Chrome executable inside the container."""
    candidates = [
        "/opt/chromium/chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
    ]
    for candidate in candidates:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate

    for root, _, files in os.walk("/opt/chromium"):
        if "chrome" not in files:
            continue
        candidate = os.path.join(root, "chrome")
        if os.access(candidate, os.X_OK):
            return candidate

    raise FileNotFoundError("Chrome executable not found")

def resolve_active_browser_state():
    """Inspect the live Chrome instance exposed by CDP and export storage state."""
    if not PLAYWRIGHT_AVAILABLE:
        return {
            "connected": False,
            "reason": "playwright_unavailable",
        }

    inspector_playwright = None
    inspector_browser = None
    storage_path = None
    try:
        inspector_playwright = sync_playwright().start()
        inspector_browser = inspector_playwright.chromium.connect_over_cdp("http://127.0.0.1:9222")
        contexts = inspector_browser.contexts
        context = contexts[0] if contexts else None
        pages = context.pages if context else []
        page = pages[-1] if pages else None
        url = page.url if page else None
        title = page.title() if page else None

        if context:
            storage_path = os.path.join(CODEGEN_DIR, f"storage-{int(time.time() * 1000)}.json")
            context.storage_state(path=storage_path)

        return {
            "connected": True,
            "url": url,
            "title": title,
            "page_count": len(pages),
            "storage_path": storage_path,
        }
    except Exception as e:
        if storage_path and os.path.exists(storage_path):
            try:
                os.remove(storage_path)
            except Exception:
                pass
        return {
            "connected": False,
            "reason": str(e),
        }
    finally:
        try:
            if inspector_browser:
                inspector_browser.close()
        except Exception:
            pass
        try:
            if inspector_playwright:
                inspector_playwright.stop()
        except Exception:
            pass

def start_codegen(session_id, url, reuse_browser=False):
    """Start playwright codegen process"""
    global codegen_process, codegen_output, current_session, codegen_storage_state

    if codegen_process and codegen_process.poll() is None:
        stop_codegen()

    current_session = session_id
    codegen_output = os.path.join(CODEGEN_DIR, f"{session_id}.js")
    codegen_storage_state = None

    browser_state = None
    if reuse_browser:
        browser_state = resolve_active_browser_state()
        live_url = browser_state.get("url") if browser_state else None
        if live_url:
            url = live_url
        codegen_storage_state = browser_state.get("storage_path") if browser_state else None

    print(f"[INFO] Starting codegen for session {session_id}, URL: {url}")
    if browser_state:
        print(f"[INFO] Browser state reuse: {json.dumps(browser_state)}")

    env = os.environ.copy()
    env["DISPLAY"] = ":99"
    env["PLAYWRIGHT_BROWSERS_PATH"] = "/root/.cache/ms-playwright"

    # Start codegen - browser window will be shown via noVNC
    cmd = [
        "npx", "playwright", "codegen",
        "--target", "javascript",
        "--output", codegen_output,
        "--viewport-size", "1920,1080",
    ]
    if codegen_storage_state and os.path.exists(codegen_storage_state):
        cmd.extend(["--load-storage", codegen_storage_state])
    cmd.append(url)

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
    global codegen_process, codegen_output, current_session, codegen_storage_state

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

    if codegen_storage_state and os.path.exists(codegen_storage_state):
        os.remove(codegen_storage_state)

    codegen_process = None
    codegen_output = None
    current_session = None
    codegen_storage_state = None

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
