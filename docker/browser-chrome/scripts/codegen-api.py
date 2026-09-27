#!/usr/bin/env python3
"""HTTP routing entry point for the browser Codegen API."""

import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import codegen_runtime as codegen_runtime
import codegen_ai_control as ai_control
from codegen_runtime import *
from codegen_ai_control import *

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
            reuse_browser = params.get('reuse_browser', ['false'])[0].lower() in ('1', 'true', 'yes')

            if not session or not url:
                self.send_json({'error': 'Missing session or url parameter'}, 400)
                return

            if start_codegen(session, url, reuse_browser=reuse_browser):
                self.send_json({'status': 'started', 'session': session, 'reuse_browser': reuse_browser})
            else:
                self.send_json({'error': 'Failed to start codegen'}, 500)

        elif path == '/stop':
            script = stop_codegen()
            self.send_json({'status': 'stopped', 'script': script})

        elif path == '/script':
            script = get_script()
            self.send_json({'script': script})

        elif path == '/status':
            if codegen_runtime.codegen_process and codegen_runtime.codegen_process.poll() is None:
                self.send_json({'status': 'recording', 'session': codegen_runtime.current_session})
            elif ai_control.ai_mode_active:
                self.send_json({'status': 'ai_control', 'mode': 'ai'})
            else:
                self.send_json({'status': 'idle'})

        elif path == '/health':
            self.send_json({'status': 'ok'})

        elif path == '/browser-state':
            self.send_json(resolve_active_browser_state())

        # AI Control mode endpoints
        elif path == '/ai/start':
            if not ai_control.PLAYWRIGHT_AVAILABLE:
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

        if not ai_control.ai_mode_active or ai_control.ai_page is None:
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

        elif action_type in ('search', 'smart_search'):
            query = action.get('query')
            if not query:
                return {'status': 'error', 'error': f'Missing query for {action_type} action'}
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
