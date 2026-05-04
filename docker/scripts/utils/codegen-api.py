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
        ai_page.set_default_timeout(30000)  # 30 second timeout for all operations
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
        return {
            "status": "success",
            "url": url,
            "template_info": {
                "tool": "navigate",
                "params": {"url": url},
                "description": f"Navigate to {url}"
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_click(selector=None, text=None):
    """Click element by selector or text"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        used_selector = None
        if text:
            # Click by text content
            used_selector = f"text={text}"
            ai_page.click(used_selector)
        elif selector:
            used_selector = selector
            ai_page.click(selector)
        else:
            return {"status": "error", "message": "No selector or text provided"}
        return {
            "status": "success",
            "template_info": {
                "tool": "click",
                "params": {"selector": used_selector},
                "description": f"Click {used_selector}"
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_fill(selector, value):
    """Fill input field"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        ai_page.fill(selector, value)
        return {
            "status": "success",
            "template_info": {
                "tool": "fill",
                "params": {"selector": selector, "value": value},
                "description": f"Fill '{value}' into {selector}"
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_screenshot():
    """Take screenshot - fast and direct"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        # Direct screenshot without waiting - much faster
        screenshot_bytes = ai_page.screenshot(timeout=5000)
        screenshot_base64 = base64.b64encode(screenshot_bytes).decode('utf-8')
        return {
            "status": "success",
            "screenshot": screenshot_base64,
            "template_info": {
                "tool": "screenshot",
                "params": {},
                "description": "Take screenshot"
            }
        }
    except Exception as e:
        print(f"[ERROR] Screenshot failed: {e}")
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
        return {
            "status": "success",
            "template_info": {
                "tool": "wait",
                "params": {"selector": selector, "duration": duration},
                "description": f"Wait for {selector or f'{duration}ms'}"
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_hover(selector):
    """Hover over element"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        ai_page.hover(selector)
        return {
            "status": "success",
            "template_info": {
                "tool": "hover",
                "params": {"selector": selector},
                "description": f"Hover over {selector}"
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_press(key):
    """Press key"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        ai_page.keyboard.press(key)
        return {
            "status": "success",
            "template_info": {
                "tool": "press_key",
                "params": {"key": key},
                "description": f"Press {key}"
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_evaluate(script):
    """Execute JavaScript"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        result = ai_page.evaluate(script)
        return {
            "status": "success",
            "result": result,
            "template_info": {
                "tool": "evaluate",
                "params": {"script": script},
                "description": "Execute JavaScript"
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_reset():
    """Reset browser to blank page"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        ai_page.goto("about:blank")
        return {
            "status": "success",
            "template_info": {
                "tool": "navigate",
                "params": {"url": "about:blank"},
                "description": "Reset to blank page"
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_snapshot():
    """Take accessibility snapshot of the page - similar to chrome-devtools-mcp take_snapshot"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        # Wait for page to be stable
        ai_page.wait_for_load_state("domcontentloaded", timeout=5000)

        # Get accessibility tree snapshot
        snapshot = ai_page.evaluate("""
            () => {
                function buildAccessibilityTree(element, depth = 0, uid_prefix = '1') {
                    if (depth > 10) return null;  // Limit depth

                    const style = window.getComputedStyle(element);
                    if (style.display === 'none' || style.visibility === 'hidden') return null;

                    const result = {
                        uid: uid_prefix,
                        role: element.getAttribute('role') || getImplicitRole(element),
                        name: element.getAttribute('aria-label') ||
                              element.getAttribute('title') ||
                              element.alt ||
                              element.textContent?.trim().substring(0, 100) ||
                              '',
                        depth: depth
                    };

                    // Add extra info for interactive elements
                    if (element.tagName === 'A') {
                        result.role = 'link';
                        result.href = element.href;
                    } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                        result.role = element.type === 'button' ? 'button' : 'textbox';
                        result.value = element.value;
                        result.placeholder = element.placeholder;
                    } else if (element.tagName === 'BUTTON') {
                        result.role = 'button';
                    } else if (element.tagName === 'IMG') {
                        result.role = 'img';
                        result.alt = element.alt;
                    } else if (element.tagName === 'H1' || element.tagName === 'H2' || element.tagName === 'H3') {
                        result.role = 'heading';
                        result.level = parseInt(element.tagName.substring(1));
                    }

                    // Filter out empty/irrelevant elements
                    if (!result.name && !['link', 'button', 'textbox', 'img', 'heading'].includes(result.role)) {
                        return null;
                    }

                    // Process children
                    const children = [];
                    let childIndex = 0;
                    for (const child of element.children) {
                        const childTree = buildAccessibilityTree(child, depth + 1, `${uid_prefix}_${childIndex}`);
                        if (childTree) {
                            children.push(childTree);
                            childIndex++;
                        }
                    }

                    if (children.length > 0) {
                        result.children = children;
                    }

                    return result;
                }

                function getImplicitRole(element) {
                    const tag = element.tagName.toLowerCase();
                    const roleMap = {
                        'a': 'link',
                        'button': 'button',
                        'input': 'textbox',
                        'textarea': 'textbox',
                        'img': 'img',
                        'h1': 'heading',
                        'h2': 'heading',
                        'h3': 'heading',
                        'h4': 'heading',
                        'nav': 'navigation',
                        'main': 'main',
                        'header': 'banner',
                        'footer': 'contentinfo',
                        'ul': 'list',
                        'ol': 'list',
                        'li': 'listitem',
                        'table': 'table',
                        'form': 'form',
                        'article': 'article',
                        'section': 'section'
                    };
                    return roleMap[tag] || 'generic';
                }

                // Build tree from body
                const tree = buildAccessibilityTree(document.body, 0, '1');

                // Also get interactive elements list for easier access
                const interactiveElements = [];
                document.querySelectorAll('a, button, input, textarea, select, [role="button"], [onclick]').forEach((el, i) => {
                    const style = window.getComputedStyle(el);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                        interactiveElements.push({
                            uid: `int_${i}`,
                            type: el.tagName.toLowerCase(),
                            text: el.textContent?.trim().substring(0, 50) || el.value || el.placeholder || '',
                            href: el.href || null,
                            role: el.getAttribute('role') || el.tagName.toLowerCase()
                        });
                    }
                });

                return {
                    tree: tree,
                    interactiveElements: interactiveElements.slice(0, 20),  // Limit to 20
                    url: window.location.href,
                    title: document.title
                };
            }
        """)

        print(f"[INFO] Snapshot taken: {snapshot['title']}")
        print(f"[INFO] Found {len(snapshot['interactiveElements'])} interactive elements")

        return {
            "status": "success",
            "snapshot": snapshot,
            "template_info": {
                "tool": "snapshot",
                "params": {},
                "description": "Take accessibility snapshot"
            }
        }

    except Exception as e:
        print(f"[ERROR] Snapshot failed: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

def ai_click_result(index=1):
    """Click on the Nth search result - fast and reliable"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        # Wait for DOM to be ready (faster than networkidle)
        ai_page.wait_for_load_state("domcontentloaded", timeout=3000)

        # Get page structure snapshot (similar to chrome-devtools-mcp take_snapshot)
        # Find all visible links that look like search results
        result_links = ai_page.evaluate("""
            () => {
                const results = [];
                // Helper to check if element is visible
                function isVisible(el) {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' &&
                           style.visibility !== 'hidden' &&
                           el.offsetWidth > 0 &&
                           el.offsetHeight > 0;
                }

                // Helper to get element's bounding rect
                function getRect(el) {
                    const rect = el.getBoundingClientRect();
                    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                }

                // Baidu search results
                const baiduResults = document.querySelectorAll('#content_left .result, .result.c-container');
                if (baiduResults.length > 0) {
                    baiduResults.forEach((result, i) => {
                        const link = result.querySelector('a.t, .t a, h3 a, a:first-child');
                        if (link && isVisible(link)) {
                            results.push({
                                type: 'baidu_result',
                                index: i + 1,
                                text: link.textContent.trim(),
                                href: link.href,
                                rect: getRect(link),
                                selector: link.id ? '#' + link.id : null
                            });
                        }
                    });
                }

                // Google search results
                if (results.length === 0) {
                    const googleResults = document.querySelectorAll('#search .g, .g');
                    googleResults.forEach((result, i) => {
                        const link = result.querySelector('a[href]', 'h3 a');
                        if (link && isVisible(link) && !link.href.includes('google.com/search')) {
                            results.push({
                                type: 'google_result',
                                index: i + 1,
                                text: link.textContent.trim(),
                                href: link.href,
                                rect: getRect(link)
                            });
                        }
                    });
                }

                // Bing search results
                if (results.length === 0) {
                    const bingResults = document.querySelectorAll('.b_algo');
                    bingResults.forEach((result, i) => {
                        const link = result.querySelector('h2 a, .b_title a, a');
                        if (link && isVisible(link)) {
                            results.push({
                                type: 'bing_result',
                                index: i + 1,
                                text: link.textContent.trim(),
                                href: link.href,
                                rect: getRect(link),
                                target: link.target || '_self'
                            });
                        }
                    });
                }

                // Generic: find all visible links that look like results (in main content area)
                if (results.length === 0) {
                    const mainContent = document.querySelector('main, #content, #main, .content, article');
                    if (mainContent) {
                        const links = mainContent.querySelectorAll('a[href]');
                        links.forEach((link, i) => {
                            if (isVisible(link) && link.textContent.trim().length > 10) {
                                results.push({
                                    type: 'generic_result',
                                    index: i + 1,
                                    text: link.textContent.trim().substring(0, 50),
                                    href: link.href,
                                    rect: getRect(link)
                                });
                            }
                        });
                    }
                }

                // Fallback: all visible links in page
                if (results.length === 0) {
                    const allLinks = document.querySelectorAll('a[href]');
                    allLinks.forEach((link, i) => {
                        if (isVisible(link) &&
                            !link.href.includes('javascript:') &&
                            !link.href.startsWith('#') &&
                            link.textContent.trim().length > 5) {
                            results.push({
                                type: 'fallback_link',
                                index: i + 1,
                                text: link.textContent.trim().substring(0, 50),
                                href: link.href,
                                rect: getRect(link)
                            });
                        }
                    });
                }

                return results;
            }
        """)

        print(f"[INFO] Found {len(result_links)} potential result links")
        for i, link in enumerate(result_links[:5]):
            print(f"[DEBUG] Link {i+1}: {link['text'][:30]}... ({link['type']})")

        if len(result_links) >= index:
            target = result_links[index - 1]
            print(f"[INFO] Clicking result {index}: {target['text'][:50]}")

            # Check if link opens in new tab (target="_blank") or is Baidu redirect link
            link_target = target.get('target', '_self')
            is_baidu_redirect = target.get('type') == 'baidu_result' and 'baidu.com/link' in target.get('href', '')

            if link_target == '_blank' or is_baidu_redirect:
                # Navigate directly to the URL instead of clicking
                # Baidu redirect links and target=_blank links open in new tabs
                print(f"[INFO] Link requires navigation (target={link_target}, is_baidu_redirect={is_baidu_redirect}), navigating to: {target['href']}")
                ai_page.goto(target['href'], timeout=30000)
                return {
                    "status": "success",
                    "message": f"Navigated to result {index}: {target['text'][:30]}",
                    "link_info": target,
                    "template_info": {
                        "tool": "navigate",
                        "params": {"url": target['href']},
                        "description": f"Navigate to result #{index}"
                    }
                }

            # Click by coordinates (most reliable method like chrome-devtools-mcp)
            rect = target['rect']
            x = rect['x'] + rect['width'] / 2
            y = rect['y'] + rect['height'] / 2

            ai_page.mouse.click(x, y)
            print(f"[INFO] Clicked at coordinates ({x}, {y})")

            return {
                "status": "success",
                "message": f"Clicked result {index}: {target['text'][:30]}",
                "link_info": target,
                "template_info": {
                    "tool": "click_result",
                    "params": {"index": index},
                    "description": f"Click result #{index}"
                }
            }

        return {"status": "error", "message": f"Only found {len(result_links)} results, cannot click result {index}"}

    except Exception as e:
        print(f"[ERROR] Click result failed: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

def ai_read_page(selector=None, max_length=5000):
    """Read page content - similar to chrome-devtools-mcp evaluate_script"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        if selector:
            # Read specific element
            content = ai_page.evaluate(f"""
                () => {{
                    const el = document.querySelector("{selector}");
                    if (!el) return null;
                    return {{
                        text: el.innerText || el.textContent || "",
                        html: el.innerHTML || "",
                        tagName: el.tagName,
                        className: el.className
                    }};
                }}
            """)
            if content:
                return {
                    "status": "success",
                    "content": content["text"][:max_length],
                    "html": content["html"][:max_length * 2],
                    "element": {
                        "tagName": content["tagName"],
                        "className": content["className"]
                    }
                }
            return {"status": "error", "message": f"Element not found: {selector}"}
        else:
            # Read main page content
            content = ai_page.evaluate(f"""
                () => {{
                    // Try to get main content area first
                    const mainSelectors = [
                        'main', 'article', '#content', '#main', '.content',
                        '#content_left', '.main-content', 'body'
                    ];

                    let mainContent = null;
                    for (const sel of mainSelectors) {{
                        mainContent = document.querySelector(sel);
                        if (mainContent) break;
                    }}

                    const text = mainContent ? mainContent.innerText : document.body.innerText;
                    const title = document.title;
                    const url = window.location.href;
                    const description = document.querySelector('meta[name="description"]')?.content || "";

                    // Get all headings for structure
                    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
                        .map(h => ({{ level: h.tagName, text: h.innerText.trim() }}))
                        .slice(0, 20);

                    // Get all links
                    const links = Array.from(document.querySelectorAll('a[href]'))
                        .filter(a => a.innerText.trim().length > 0)
                        .map(a => ({{ text: a.innerText.trim().substring(0, 50), href: a.href }}))
                        .slice(0, 30);

                    return {{
                        title,
                        url,
                        description,
                        text: text.substring(0, {max_length}),
                        headings,
                        links
                    }};
                }}
            """)

            return {
                "status": "success",
                "content": content,
                "template_info": {
                    "tool": "read_page",
                    "params": {"selector": selector, "max_length": max_length},
                    "description": f"Read page content"
                }
            }

    except Exception as e:
        print(f"[ERROR] Read page failed: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

def ai_drag(src_selector, dst_selector):
    """Drag element from source to destination"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        src = ai_page.query_selector(src_selector)
        dst = ai_page.query_selector(dst_selector)
        if not src or not dst:
            return {"status": "error", "message": f"Element not found: {src_selector if not src else dst_selector}"}

        src_box = src.bounding_box()
        dst_box = dst.bounding_box()

        ai_page.mouse.move(src_box['x'] + src_box['width'] / 2, src_box['y'] + src_box['height'] / 2)
        ai_page.mouse.down()
        ai_page.mouse.move(dst_box['x'] + dst_box['width'] / 2, dst_box['y'] + dst_box['height'] / 2)
        ai_page.mouse.up()

        return {
            "status": "success",
            "message": f"Dragged from {src_selector} to {dst_selector}",
            "template_info": {
                "tool": "drag",
                "params": {"src": src_selector, "dst": dst_selector},
                "description": f"Drag from {src_selector} to {dst_selector}"
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_type_text(text, submit_key=None):
    """Type text using keyboard"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        ai_page.keyboard.type(text)
        if submit_key:
            ai_page.keyboard.press(submit_key)
        return {
            "status": "success",
            "message": f"Typed: {text}",
            "template_info": {
                "tool": "type_text",
                "params": {"text": text, "submit_key": submit_key},
                "description": f"Type '{text}'"
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_handle_dialog(action, prompt_text=None):
    """Handle browser dialog (accept/dismiss)"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        # Note: Playwright handles dialogs via event listeners
        # This is a simplified version
        if action == 'accept':
            ai_page.evaluate("window.confirm = () => true; window.alert = () => {}; window.prompt = () => arguments[0] || '';")
        elif action == 'dismiss':
            ai_page.evaluate("window.confirm = () => false; window.prompt = () => null;")
        return {
            "status": "success",
            "message": f"Dialog handler set to {action}",
            "template_info": {
                "tool": "handle_dialog",
                "params": {"action": action, "prompt_text": prompt_text},
                "description": f"Handle dialog: {action}"
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_resize_page(width, height):
    """Resize page viewport"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        ai_page.set_viewport_size({"width": width, "height": height})
        return {
            "status": "success",
            "message": f"Resized to {width}x{height}",
            "template_info": {
                "tool": "resize_page",
                "params": {"width": width, "height": height},
                "description": f"Resize page to {width}x{height}"
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_scroll(direction='down', amount=300):
    """Scroll page"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        if direction == 'down':
            ai_page.evaluate(f"window.scrollBy(0, {amount})")
        elif direction == 'up':
            ai_page.evaluate(f"window.scrollBy(0, -{amount})")
        elif direction == 'top':
            ai_page.evaluate("window.scrollTo(0, 0)")
        elif direction == 'bottom':
            ai_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        return {
            "status": "success",
            "message": f"Scrolled {direction}",
            "template_info": {
                "tool": "scroll",
                "params": {"direction": direction, "amount": amount},
                "description": f"Scroll {direction}"
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_get_text():
    """Get all text content from page"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        text = ai_page.evaluate("""
            () => {
                // Get visible text from body
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );
                let text = '';
                let node;
                while (node = walker.nextNode()) {
                    const style = window.getComputedStyle(node.parentElement);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                        text += node.textContent + ' ';
                    }
                }
                return text.trim().substring(0, 10000);
            }
        """)
        return {
            "status": "success",
            "text": text,
            "template_info": {
                "tool": "get_text",
                "params": {},
                "description": "Get page text"
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_upload_file(selector, file_path):
    """Upload file to input element"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        input_el = ai_page.query_selector(selector)
        if not input_el:
            return {"status": "error", "message": f"Input element not found: {selector}"}
        input_el.set_input_files(file_path)
        return {"status": "success", "message": f"File uploaded: {file_path}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def ai_smart_search(query):
    """Smart search - analyze page and perform search operation"""
    global ai_page, ai_mode_active

    if not ai_mode_active or not ai_page:
        return {"status": "error", "message": "AI browser not initialized"}

    try:
        # Wait for page to be ready before searching
        print(f"[SmartSearch] Waiting for page to be ready...")
        time.sleep(0.5)  # Brief wait for dynamic content
        ai_page.wait_for_load_state('domcontentloaded', timeout=5000)

        # Special handling for Baidu: force show search form if hidden
        # Baidu may hide the search form due to anti-automation detection
        current_url = ai_page.url
        if 'baidu.com' in current_url:
            print("[SmartSearch] Baidu detected, checking search form visibility...")
            try:
                form_visible = ai_page.evaluate('document.querySelector("#form") ? window.getComputedStyle(document.querySelector("#form")).display !== "none" : false')
                if not form_visible:
                    print("[SmartSearch] Baidu search form is hidden, forcing visibility...")
                    ai_page.evaluate('''
                        var form = document.querySelector("#form");
                        if (form) {
                            form.style.display = "block";
                            form.style.visibility = "visible";
                        }
                        var kw = document.querySelector("#kw");
                        if (kw) {
                            kw.style.display = "inline-block";
                            kw.style.visibility = "visible";
                        }
                    ''')
                    time.sleep(0.3)  # Wait for style to apply
            except Exception as e:
                print(f"[SmartSearch] Warning: Failed to force show Baidu form: {e}")

        # Step 1: Get accessibility snapshot to analyze page structure
        print(f"[SmartSearch] Step 1: Analyzing page structure...")
        snapshot_result = ai_snapshot()
        # snapshot is a dict, convert to string for display
        snapshot_data = snapshot_result.get("snapshot")
        snapshot_text = json.dumps(snapshot_data, ensure_ascii=False) if snapshot_data else ""

        # Step 2: Find search input using multiple strategies
        search_selectors = [
            # Baidu specific (highest priority)
            '#kw',  # Baidu search input ID
            '.s_ipt',  # Baidu search input class
            'input[name="wd"]',  # Baidu search input name
            # Bing specific
            '#sb_form_q',  # Bing search input ID
            'input[name="q"]',  # Common for Bing, Google, etc.
            # Common search input selectors
            'input[type="search"]',
            'input[name="query"]',
            'input[name="keyword"]',
            'input[name="search"]',
            # Placeholder-based
            'input[placeholder*="搜索"]',
            'input[placeholder*="查找"]',
            'input[placeholder*="search"]',
            'input[placeholder*="Search"]',
            'input[placeholder*="web"]',  # Bing uses "Search the web"
            # ID-based
            '#search-input',
            '#search',
            '#query',
            # Class-based
            '.search-input',
            '.search-box',
            '.searchbox-input',
            # ARIA-based
            'input[aria-label*="搜索"]',
            'input[aria-label*="search"]',
            # Role-based
            '[role="searchbox"]',
            '[role="search"] input',
        ]

        # Try to find search input
        search_input = None
        used_selector = None

        for selector in search_selectors:
            try:
                elements = ai_page.query_selector_all(selector)
                for el in elements:
                    if el.is_visible():
                        search_input = el
                        used_selector = selector
                        break
                if search_input:
                    break
            except Exception as e:
                continue

        # If no search input found with selectors, try heuristic approach
        if not search_input:
            print("[SmartSearch] Trying heuristic approach...")
            inputs = ai_page.query_selector_all('input[type="text"], input:not([type])')
            for inp in inputs:
                try:
                    if not inp.is_visible():
                        continue
                    placeholder = (inp.get_attribute('placeholder') or '').lower()
                    name = (inp.get_attribute('name') or '').lower()
                    aria_label = (inp.get_attribute('aria-label') or '').lower()
                    cls = (inp.get_attribute('class') or '').lower()

                    # Check if it looks like a search input
                    search_keywords = ['search', '搜索', '查找', 'query', 'keyword', 'wd', 'q']
                    if any(kw in placeholder or kw in name or kw in aria_label or kw in cls for kw in search_keywords):
                        search_input = inp
                        used_selector = f"heuristic: {placeholder or name or aria_label}"
                        break
                except Exception as e:
                    continue

        if not search_input:
            return {
                "status": "error",
                "message": "No search input found on page. Try using '快照' to see page elements.",
                "snapshot": snapshot_text[:500] if snapshot_text else None,
                # Template info even on error - for debugging and potential retry
                "template_info": {
                    "attempted_selectors": search_selectors[:10],  # First 10 selectors tried
                    "query": query,
                    "error_type": "no_search_input"
                }
            }

        print(f"[SmartSearch] Found search input: {used_selector}")

        # Step 3: Clear and fill search input
        search_input.click()
        search_input.fill('')
        search_input.fill(query)
        print(f"[SmartSearch] Filled query: {query}")

        # Step 4: Find and click search button or press Enter
        search_button_selectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("搜索")',
            'button:has-text("搜一下")',
            'button:has-text("Search")',
            '.search-btn',
            '#search-btn',
            '.search-button',
            '[aria-label*="搜索"]',
            '[aria-label*="search"]',
        ]

        search_button = None
        button_selector = None
        for selector in search_button_selectors:
            try:
                elements = ai_page.query_selector_all(selector)
                for el in elements:
                    if el.is_visible():
                        search_button = el
                        button_selector = selector
                        break
                if search_button:
                    break
            except:
                continue

        submit_method = "enter"
        if search_button:
            search_button.click()
            submit_method = "click"
            print("[SmartSearch] Clicked search button")
        else:
            # Press Enter to submit
            search_input.press('Enter')
            print("[SmartSearch] Pressed Enter to search")

        # Wait for navigation or results
        time.sleep(1.5)

        # Take a snapshot of results
        result_snapshot = ai_snapshot()
        result_snapshot_data = result_snapshot.get("snapshot")
        result_snapshot_str = json.dumps(result_snapshot_data, ensure_ascii=False)[:1000] if result_snapshot_data else ""

        return {
            "status": "success",
            "message": f"Searched for: {query}",
            "snapshot": result_snapshot_str,
            # Template info - for deterministic replay
            "template_info": {
                "tool": "smart_search",
                "params": {
                    "input_selector": used_selector,
                    "submit_method": submit_method,
                    "button_selector": button_selector if submit_method == "click" else None,
                    "query": query
                },
                "description": f"Search for '{query}' using {submit_method} method"
            }
        }

    except Exception as e:
        print(f"[SmartSearch] Error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "status": "error",
            "message": str(e),
            "template_info": {
                "query": query,
                "error_type": "exception",
                "error_message": str(e)
            }
        }

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
        self.do_GET_with_params(path, params)

    def do_GET_with_params(self, path, params):

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

        elif path == '/click_result':
            index = params.get('index', ['1'])[0]
            index_int = int(index) if index else 1
            result = ai_click_result(index_int)
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

        elif path == '/snapshot':
            result = ai_snapshot()
            self.send_json(result)

        elif path == '/read_page':
            selector = params.get('selector', [None])[0]
            max_length = int(params.get('max_length', [5000])[0] or 5000)
            result = ai_read_page(selector, max_length)
            self.send_json(result)

        elif path == '/drag':
            src = params.get('src', [None])[0]
            dst = params.get('dst', [None])[0]
            if not src or not dst:
                self.send_json({'error': 'Missing src or dst parameter'}, 400)
                return
            result = ai_drag(src, dst)
            self.send_json(result)

        elif path == '/type_text':
            text = params.get('text', [None])[0]
            submit_key = params.get('submit_key', [None])[0]
            if not text:
                self.send_json({'error': 'Missing text parameter'}, 400)
                return
            result = ai_type_text(text, submit_key)
            self.send_json(result)

        elif path == '/handle_dialog':
            action = params.get('action', ['accept'])[0]
            prompt_text = params.get('prompt_text', [None])[0]
            result = ai_handle_dialog(action, prompt_text)
            self.send_json(result)

        elif path == '/resize_page':
            width = int(params.get('width', [1920])[0] or 1920)
            height = int(params.get('height', [1080])[0] or 1080)
            result = ai_resize_page(width, height)
            self.send_json(result)

        elif path == '/scroll':
            direction = params.get('direction', ['down'])[0]
            amount = int(params.get('amount', [300])[0] or 300)
            result = ai_scroll(direction, amount)
            self.send_json(result)

        elif path == '/get_text':
            result = ai_get_text()
            self.send_json(result)

        elif path == '/upload_file':
            selector = params.get('selector', [None])[0]
            file_path = params.get('file_path', [None])[0]
            if not selector or not file_path:
                self.send_json({'error': 'Missing selector or file_path parameter'}, 400)
                return
            result = ai_upload_file(selector, file_path)
            self.send_json(result)

        elif path == '/smart_search':
            query = params.get('query', [None])[0]
            if not query:
                self.send_json({'error': 'Missing query parameter'}, 400)
                return
            result = ai_smart_search(query)
            self.send_json(result)

        else:
            self.send_json({'error': 'Not found'}, 404)

    def do_POST(self):
        # Read POST body
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else ''

        try:
            body = json.loads(post_data) if post_data else {}
        except json.JSONDecodeError:
            self.send_json({'error': 'Invalid JSON body'}, 400)
            return

        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        # Handle /execute endpoint for batch action execution
        if path == '/execute':
            result = self.handle_execute(body)
            self.send_json(result)
            return

        # For other POST endpoints, merge body params with query params and call do_GET_with_params
        if body:
            for key, value in body.items():
                if key not in ['session', 'actions']:  # Skip special keys
                    params[key] = [value]

        self.do_GET_with_params(path, params)

    def handle_execute(self, body):
        """Handle batch execution of actions from session-broker"""
        session = body.get('session')
        actions = body.get('actions', [])

        if not actions:
            return {'status': 'completed', 'results': [], 'message': 'No actions to execute'}

        # Ensure AI browser is started
        global ai_mode_active, ai_page
        if not ai_mode_active or ai_page is None:
            # Start AI browser with a blank page
            ai_start('about:blank')

        results = []
        for action in actions:
            action_type = action.get('action')
            step_number = action.get('step_number', 1)

            try:
                action_result = self.execute_single_action(action)
                result_item = {
                    'success': action_result.get('status') == 'success' or action_result.get('success', False),
                    'step': step_number,
                    'action': action_type,
                    'message': action_result.get('message', action_result.get('error', 'Action completed')),
                }
                # Extract screenshot, text, html from action_result to top level
                if action_result.get('screenshot'):
                    result_item['screenshot'] = action_result.get('screenshot')
                if action_result.get('text'):
                    result_item['text'] = action_result.get('text')
                if action_result.get('html'):
                    result_item['html'] = action_result.get('html')
                results.append(result_item)
            except Exception as e:
                results.append({
                    'success': False,
                    'step': step_number,
                    'action': action_type,
                    'message': str(e),
                    'error': str(e)
                })

        return {
            'status': 'completed',
            'session': session,
            'results': results
        }

    def execute_single_action(self, action):
        """Execute a single action based on action type"""
        action_type = action.get('action')

        if action_type == 'navigate':
            url = action.get('url')
            if not url:
                return {'status': 'error', 'error': 'Missing url for navigate action'}
            return ai_navigate(url)

        elif action_type == 'click':
            selector = action.get('selector')
            text = action.get('text')
            return ai_click(selector, text)

        elif action_type == 'fill':
            selector = action.get('selector')
            value = action.get('value')
            if not selector or not value:
                return {'status': 'error', 'error': 'Missing selector or value for fill action'}
            return ai_fill(selector, value)

        elif action_type == 'screenshot':
            return ai_screenshot()

        elif action_type == 'wait':
            selector = action.get('selector')
            duration = action.get('duration')
            duration_ms = int(duration) if duration else None
            return ai_wait(selector, duration_ms)

        elif action_type == 'hover':
            selector = action.get('selector')
            if not selector:
                return {'status': 'error', 'error': 'Missing selector for hover action'}
            return ai_hover(selector)

        elif action_type == 'press':
            key = action.get('key')
            if not key:
                return {'status': 'error', 'error': 'Missing key for press action'}
            return ai_press(key)

        elif action_type == 'scroll':
            direction = action.get('direction', 'down')
            amount = action.get('amount', 300)
            return ai_scroll(direction, amount)

        elif action_type == 'evaluate':
            script = action.get('script')
            if not script:
                return {'status': 'error', 'error': 'Missing script for evaluate action'}
            return ai_evaluate(script)

        elif action_type == 'type_text':
            text = action.get('text')
            if not text:
                return {'status': 'error', 'error': 'Missing text for type_text action'}
            return ai_type_text(text)

        elif action_type == 'get_text':
            selector = action.get('selector')
            return ai_get_text(selector)

        elif action_type == 'smart_search':
            query = action.get('query')
            if not query:
                return {'status': 'error', 'error': 'Missing query for smart_search action'}
            return ai_smart_search(query)

        else:
            return {'status': 'error', 'error': f'Unknown action type: {action_type}'}

def run_server(port=3011):
    server = HTTPServer(('0.0.0.0', port), CodegenHandler)
    print(f"[INFO] Codegen API Server running on port {port}")
    server.serve_forever()

if __name__ == '__main__':
    port = int(os.environ.get('CODEGEN_API_PORT', 3011))
    run_server(port)