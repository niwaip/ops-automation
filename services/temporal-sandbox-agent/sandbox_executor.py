"""
Sandbox Executor - Isolated Python code execution

This module handles the actual execution of Python code in an isolated environment.
It uses subprocess execution with proper mocking of temporalio modules.
"""

import asyncio
import json
import os
import sys
import tempfile
import traceback
import ssl
import certifi
from typing import Dict, Any


async def execute_in_sandbox(
    code: str,
    fn_name: str,
    input_data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Execute Python code in an isolated sandbox environment.
    """
    # Set SSL certificates
    os.environ['SSL_CERT_FILE'] = certifi.where()
    os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

    # Clean markdown markers
    clean_code = code
    if '```' in code:
        import re
        # Try to find content between triple backticks
        match = re.search(r'```(?:python)?\n?(.*?)```', code, re.DOTALL)
        if match:
            clean_code = match.group(1).strip()
        else:
            # Fallback: remove all backtick markers
            clean_code = re.sub(r'```[a-zA-Z]*\n?', '', code)
            clean_code = clean_code.replace('```', '').strip()

    # Create temporary files for execution
    with tempfile.TemporaryDirectory() as temp_dir:
        activity_file = os.path.join(temp_dir, "activity.py")
        input_file = os.path.join(temp_dir, "input.json")
        runner_file = os.path.join(temp_dir, "runner.py")
        result_file = os.path.join(temp_dir, "result.json")

        # Write files
        with open(activity_file, 'w') as f:
            f.write(clean_code)

        with open(input_file, 'w') as f:
            json.dump(input_data, f)

        # Create runner script using replacement instead of f-string to avoid brace escaping issues
        runner_template = r'''
import json
import sys
import os
import traceback
import asyncio
import types

# Set SSL certificates
os.environ['SSL_CERT_FILE'] = 'CERT_FILE_PATH'
os.environ['REQUESTS_CA_BUNDLE'] = 'CERT_FILE_PATH'

# Create mock temporalio module hierarchy
class MockActivityLogger:
    def info(self, msg): print(f"[INFO] {msg}", flush=True)
    def warning(self, msg): print(f"[WARN] {msg}", flush=True)
    def error(self, msg): print(f"[ERROR] {msg}", flush=True)

class MockActivityInfo:
    def __init__(self):
        self.activity_type = 'SandboxActivity'
        self.workflow_type = 'AgentSessionWorkflow'
        self.workflow_namespace = 'default'
        self.task_queue = 'sandbox-agent-task-queue'
        self.is_cancelled = False
        self.is_replaying = False
        self.run_id = 'sandbox-run-id'
        self.workflow_run_id = 'sandbox-workflow-run-id'
        self.workflow_id = 'sandbox-workflow-id'
        self.activity_id = 'sandbox-activity-id'
        self.attempt = 1

class MockActivity:
    def defn(self, name=None, **kwargs):
        if len(kwargs) > 0 and name is None: return lambda x: x
        if callable(name): return name
        return lambda x: x
    @property
    def logger(self): return MockActivityLogger()
    def heartbeat(self, *args, **kwargs):
        print(f"[HEARTBEAT] {args if args else 'tick'}", flush=True)
        return None
    def info(self): return MockActivityInfo()

class MockApplicationError(Exception):
    def __init__(self, message, non_retryable=False, *args, **kwargs):
        super().__init__(message, *args, **kwargs)
        self.message = message
        self.non_retryable = non_retryable

# Build module hierarchy
mock_temporalio = types.ModuleType('temporalio')
mock_temporalio.activity = types.ModuleType('temporalio.activity')
mock_temporalio.exceptions = types.ModuleType('temporalio.exceptions')
mock_temporalio.common = types.ModuleType('temporalio.common')
mock_temporalio.workflow = types.ModuleType('temporalio.workflow')

mock_activity = MockActivity()
mock_temporalio.activity.defn = mock_activity.defn
mock_temporalio.activity.logger = mock_activity.logger
mock_temporalio.activity.heartbeat = mock_activity.heartbeat
mock_temporalio.activity.info = mock_activity.info
mock_temporalio.exceptions.ApplicationError = MockApplicationError

class MockWorkflow:
    def defn(self, *args, **kwargs):
        if len(args) == 1 and (callable(args[0]) or isinstance(args[0], type)): return args[0]
        return lambda x: x
    def run(self, *args, **kwargs):
        if len(args) == 1 and callable(args[0]): return args[0]
        return lambda x: x
    def signal(self, *args, **kwargs): return lambda x: x
    def query(self, *args, **kwargs): return lambda x: x
    @property
    def logger(self): return MockActivityLogger()
    async def execute_activity(self, activity, *args, **kwargs):
        act_name = getattr(activity, '_activity_name', getattr(activity, '__name__', str(activity)))
        input_data = args[0] if args else kwargs.get('args', [{}])[0]
        if callable(activity):
            print(f"[Sandbox] Executing local activity: {act_name}", flush=True)
            try:
                res = activity(input_data)
                return await res if asyncio.iscoroutine(res) else res
            except Exception as e:
                print(f"[Sandbox] Activity {act_name} failed: {str(e)}", flush=True)
                raise e
        return {"status": "success", "mocked": True}
    async def wait_condition(self, *args, **kwargs): return True

mock_workflow = MockWorkflow()
mock_temporalio.workflow.defn = mock_workflow.defn
mock_temporalio.workflow.run = mock_workflow.run
mock_temporalio.workflow.signal = mock_workflow.signal
mock_temporalio.workflow.query = mock_workflow.query
mock_temporalio.workflow.logger = mock_workflow.logger
mock_temporalio.workflow.execute_activity = mock_workflow.execute_activity
mock_temporalio.workflow.wait_condition = mock_workflow.wait_condition
# Expose RetryPolicy on workflow module (user code may import from workflow.RetryPolicy)
mock_temporalio.workflow.RetryPolicy = mock_temporalio.common.RetryPolicy

mock_temporalio.common.RetryPolicy = lambda **kw: type('RetryPolicy', (), {k: v for k, v in kw.items()})()

# Mock requests module
import urllib.request
import urllib.error
class MockResponse:
    def __init__(self, status, data, headers=None, url=None, reason=None):
        self.status = status; self.status_code = status
        self.text = data.decode('utf-8') if isinstance(data, bytes) else data
        self.headers = headers or {}
        self.url = url or ''
        self.reason = reason or ''
    def json(self): return json.loads(self.text)
    def raise_for_status(self):
        if self.status >= 400:
            body_preview = (self.text or '').strip().replace('\n', ' ')[:300]
            reason = self.reason or f"HTTP {self.status} for {self.url}. body={body_preview}"
            raise urllib.error.HTTPError(self.url, self.status, reason, self.headers, None)

class MockRequests:
    def __init__(self):
        # Create exceptions submodule
        self.exceptions = types.ModuleType('requests.exceptions')
        class RequestException(Exception): pass
        class Timeout(RequestException): pass
        class HTTPError(RequestException): pass
        class ConnectionError(RequestException): pass
        self.exceptions.RequestException = RequestException
        self.exceptions.Timeout = Timeout
        self.exceptions.HTTPError = HTTPError
        self.exceptions.ConnectionError = ConnectionError
        # Make exceptions directly accessible on the instance (e.g., requests.RequestException)
        self.RequestException = RequestException
        self.Timeout = Timeout
        self.HTTPError = HTTPError
        self.ConnectionError = ConnectionError
        # Inject into sys.modules to allow 'from requests.exceptions import ...'
        sys.modules['requests.exceptions'] = self.exceptions

    def get(self, url, headers=None, timeout=None, **kwargs):
        try:
            req = urllib.request.Request(url, headers=headers or {})
            with urllib.request.urlopen(req, timeout=timeout or 30) as r:
                return MockResponse(r.status, r.read(), dict(r.headers), url=url)
        except urllib.error.HTTPError as e:
            body = e.read() if e.fp else b''
            response_headers = dict(e.headers) if e.headers else {}
            return MockResponse(e.code, body, response_headers, url=url, reason=str(e))
        except Exception as e:
            return MockResponse(500, f"{type(e).__name__}: {str(e)}".encode(), {}, url=url, reason=str(e))
    def post(self, url, data=None, json_data=None, headers=None, **kwargs):
        try:
            body = json.dumps(json_data).encode('utf-8') if json_data else (data.encode('utf-8') if isinstance(data, str) else data)
            req = urllib.request.Request(url, data=body, headers=headers or {})
            with urllib.request.urlopen(req, timeout=30) as r:
                return MockResponse(r.status, r.read(), dict(r.headers), url=url)
        except urllib.error.HTTPError as e:
            body = e.read() if e.fp else b''
            response_headers = dict(e.headers) if e.headers else {}
            return MockResponse(e.code, body, response_headers, url=url, reason=str(e))
        except Exception as e:
            return MockResponse(500, f"{type(e).__name__}: {str(e)}".encode(), {}, url=url, reason=str(e))

mock_requests = MockRequests()
sys.modules['temporalio'] = mock_temporalio
sys.modules['temporalio.activity'] = mock_temporalio.activity
sys.modules['temporalio.workflow'] = mock_temporalio.workflow
sys.modules['temporalio.exceptions'] = mock_temporalio.exceptions
sys.modules['temporalio.common'] = mock_temporalio.common
sys.modules['activity'] = mock_temporalio.activity
sys.modules['workflow'] = mock_temporalio.workflow
sys.modules['requests'] = mock_requests

namespace = {
    'temporalio': mock_temporalio,
    'activity': mock_temporalio.activity,
    'workflow': mock_temporalio.workflow,
    'requests': mock_requests,
}

# Execution
try:
    with open('INPUT_FILE', 'r') as f: input_data = json.load(f)
    with open('ACTIVITY_FILE', 'r') as f: activity_code = f.read()
    
    try:
        exec(compile(activity_code, 'ACTIVITY_FILE', 'exec'), namespace)
    except Exception as e:
        with open('RESULT_FILE', 'w') as f:
            json.dump({"error": f"Compilation Error: {str(e)}", "traceback": traceback.format_exc(), "success": False}, f)
        sys.exit(1)

    target = namespace.get('FN_NAME')
    if target is None:
        for name, obj in namespace.items():
            if name.lower() == 'FN_NAME'.lower() and (callable(obj) or isinstance(obj, type)):
                target = obj; break
    if target is None:
        valid_items = [obj for name, obj in namespace.items() if (callable(obj) or isinstance(obj, type)) and not name.startswith('__') and name not in ['temporalio', 'activity', 'workflow', 'requests', 'asyncio', 'types', 'json', 'sys', 'os', 'traceback']]
        if len(valid_items) == 1: target = valid_items[0]

    if target is None:
        with open('RESULT_FILE', 'w') as f: json.dump({"error": "Target 'FN_NAME' not found", "success": False}, f)
        sys.exit(1)

    result = None
    if isinstance(target, type):
        instance = target()
        result = instance.run(input_data) if hasattr(instance, 'run') else None
    else:
        try: result = target(input_data)
        except TypeError:
            try: result = target()
            except TypeError: result = target(None)

    if asyncio.iscoroutine(result):
        result = asyncio.get_event_loop().run_until_complete(result)

    with open('RESULT_FILE', 'w') as f:
        json.dump({"result": result, "error": None, "success": True}, f)

except Exception as e:
    with open('RESULT_FILE', 'w') as f:
        json.dump({"error": str(e), "traceback": traceback.format_exc(), "success": False}, f)
    sys.exit(1)
'''

        # Fill template
        runner_script = runner_template.replace('CERT_FILE_PATH', certifi.where()) \
                                      .replace('INPUT_FILE', input_file) \
                                      .replace('ACTIVITY_FILE', activity_file) \
                                      .replace('RESULT_FILE', result_file) \
                                      .replace('FN_NAME', fn_name)

        with open(runner_file, 'w') as f:
            f.write(runner_script)

        # Execute
        proc = await asyncio.create_subprocess_exec(
            'python3', runner_file,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await proc.communicate()
        stdout_str = stdout.decode('utf-8') if stdout else ''
        stderr_str = stderr.decode('utf-8') if stderr else ''

        # Capture logs
        execution_logs = []
        if stderr_str:
            for line in stderr_str.strip().split('\n'):
                if line: execution_logs.append(f"[Python stderr] {line}")
        if stdout_str.strip():
            for line in stdout_str.strip().split('\n'):
                if line: execution_logs.append(f"[Activity stdout] {line}")

        # Read result from file
        try:
            if os.path.exists(result_file):
                with open(result_file, 'r') as f:
                    result = json.load(f)
                return {
                    "result": result.get('result'),
                    "error": result.get('error'),
                    "traceback": result.get('traceback'),
                    "logs": execution_logs,
                    "success": result.get('success', result.get('error') is None)
                }
            else:
                return {
                    "result": None,
                    "error": "Sandbox failed to write result file",
                    "traceback": f"Stdout: {stdout_str}\nStderr: {stderr_str}",
                    "logs": execution_logs,
                    "success": False
                }
        except Exception as e:
            return {
                "result": None,
                "error": f"Result parsing error: {str(e)}",
                "logs": execution_logs,
                "success": False
            }
