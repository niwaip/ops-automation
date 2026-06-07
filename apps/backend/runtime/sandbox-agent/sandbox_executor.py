"""
Sandbox Executor - Isolated Python code execution

This module handles the actual execution of Python code in an isolated environment.
It uses subprocess execution with proper mocking of temporalio modules.
"""

import asyncio
import json
import os
import re
import sys
import tempfile
import traceback
import ssl
import certifi
import inspect
from typing import Dict, Any, Optional, List, Callable, Awaitable


# ---------------------------------------------------------------------------
# Shared runner template
# ---------------------------------------------------------------------------
# Placeholders replaced at runtime:
#   CERT_FILE_PATH, INPUT_FILE, ACTIVITY_FILE, RESULT_FILE, FN_NAME, ATTEMPT_NUMBER

RUNNER_TEMPLATE = r'''
import json
import sys
import os
import traceback
import asyncio
import types
import ssl
import inspect

# Set SSL certificates
os.environ['SSL_CERT_FILE'] = 'CERT_FILE_PATH'
os.environ['REQUESTS_CA_BUNDLE'] = 'CERT_FILE_PATH'

# Create unverified SSL context for sandbox use
_ssl_context = ssl._create_unverified_context()

# Create mock temporalio module hierarchy
class MockActivityLogger:
    def _format(self, msg, args, kwargs):
        parts = [str(msg)]
        if args:
            parts.append(' '.join(str(arg) for arg in args))
        if kwargs:
            parts.append(str(kwargs))
        return ' '.join(part for part in parts if part)
    def info(self, msg, *args, **kwargs): print(f"[INFO] {self._format(msg, args, kwargs)}", flush=True)
    def warning(self, msg, *args, **kwargs): print(f"[WARN] {self._format(msg, args, kwargs)}", flush=True)
    def error(self, msg, *args, **kwargs): print(f"[ERROR] {self._format(msg, args, kwargs)}", flush=True)

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
        self.attempt = ATTEMPT_NUMBER

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
    def __init__(self, message, *details, non_retryable=False, **kwargs):
        super().__init__(message, *details)
        self.message = message
        self.details = details
        self.non_retryable = non_retryable
        self.kwargs = kwargs

# Build module hierarchy
mock_temporalio = types.ModuleType('temporalio')
mock_temporalio.activity = types.ModuleType('temporalio.activity')
mock_temporalio.exceptions = types.ModuleType('temporalio.exceptions')
mock_temporalio.common = types.ModuleType('temporalio.common')
mock_temporalio.workflow = types.ModuleType('temporalio.workflow')
mock_temporalio.client = types.ModuleType('temporalio.client')
mock_temporalio.worker = types.ModuleType('temporalio.worker')

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
                if isinstance(input_data, dict):
                    sig = inspect.signature(activity)
                    positional_params = [
                        p for p in sig.parameters.values()
                        if p.kind in (
                            inspect.Parameter.POSITIONAL_ONLY,
                            inspect.Parameter.POSITIONAL_OR_KEYWORD,
                        )
                    ]
                    has_var_kwargs = any(
                        p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()
                    )
                    accepts_single_dict = len(positional_params) == 1 and not has_var_kwargs
                    res = activity(input_data) if accepts_single_dict else activity(**input_data)
                else:
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
# Define RetryPolicy lambda once
_retry_policy_class = lambda **kw: type('RetryPolicy', (), {k: v for k, v in kw.items()})()
# Expose RetryPolicy on both workflow and common modules (user code may import from either)
mock_temporalio.workflow.RetryPolicy = _retry_policy_class
mock_temporalio.common.RetryPolicy = _retry_policy_class

class MockWorkflowHandle:
    async def result(self):
        return {"success": True, "mocked": True}
    async def query(self, *args, **kwargs):
        return None
    async def signal(self, *args, **kwargs):
        return None

class MockClient:
    @classmethod
    async def connect(cls, *args, **kwargs):
        return cls()
    async def execute_workflow(self, *args, **kwargs):
        return {"success": True, "mocked": True}
    async def start_workflow(self, *args, **kwargs):
        return MockWorkflowHandle()
    def get_workflow_handle(self, *args, **kwargs):
        return MockWorkflowHandle()

class MockWorkerClass:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
    async def run(self):
        return None

mock_temporalio.client.Client = MockClient
mock_temporalio.worker.Worker = MockWorkerClass

# Mock requests module
import urllib.request
import urllib.error
import urllib.parse
class MockResponse:
    def __init__(self, status, data, headers=None, url=None, reason=None, exceptions_source=None):
        self.status = status; self.status_code = status
        self.text = data.decode('utf-8') if isinstance(data, bytes) else data
        self.headers = headers or {}
        self.url = url or ''
        self.reason = reason or ''
        self.exceptions_source = exceptions_source
    def json(self): return json.loads(self.text)
    def raise_for_status(self):
        if self.status >= 400:
            body_preview = (self.text or '').strip().replace('\n', ' ')[:300]
            reason = self.reason or f"HTTP {self.status} for {self.url}. body={body_preview}"
            if self.exceptions_source:
                raise self.exceptions_source.HTTPError(reason)
            raise urllib.error.HTTPError(self.url, self.status, reason, self.headers, None)

class MockRequests:
    def __init__(self):
        # Define Exception classes
        class RequestException(Exception): pass
        class Timeout(RequestException): pass
        class HTTPError(RequestException): pass
        class ConnectionError(RequestException): pass
        
        # Attach to the module instance
        self.RequestException = RequestException
        self.Timeout = Timeout
        self.HTTPError = HTTPError
        self.ConnectionError = ConnectionError

        # Create exceptions submodule
        self.exceptions = types.ModuleType('requests.exceptions')
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

    def _append_params(self, url, params):
        if not params:
            return url
        parsed = urllib.parse.urlsplit(url)
        current_query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        extra_query = []
        if isinstance(params, dict):
            for key, value in params.items():
                extra_query.append((str(key), '' if value is None else str(value)))
        elif isinstance(params, (list, tuple)):
            for item in params:
                if isinstance(item, (list, tuple)) and len(item) >= 2:
                    extra_query.append((str(item[0]), '' if item[1] is None else str(item[1])))
        merged_query = urllib.parse.urlencode(current_query + extra_query, doseq=True)
        return urllib.parse.urlunsplit((
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            merged_query,
            parsed.fragment,
        ))

    def get(self, url, headers=None, timeout=None, **kwargs):
        try:
            url = self._append_params(url, kwargs.get('params'))
            parsed = urllib.parse.urlsplit(url)
            normalized_url = urllib.parse.urlunsplit((
                parsed.scheme,
                parsed.netloc.encode('idna').decode('ascii'),
                urllib.parse.quote(parsed.path, safe='/%'),
                urllib.parse.quote(parsed.query, safe='=&%/:,+-._~'),
                parsed.fragment,
            ))
            req = urllib.request.Request(normalized_url, headers=headers or {})
            with urllib.request.urlopen(req, timeout=timeout or 30, context=_ssl_context) as r:
                return MockResponse(r.status, r.read(), dict(r.headers), url=normalized_url, exceptions_source=self)
        except urllib.error.HTTPError as e:
            body = e.read() if e.fp else b''
            response_headers = dict(e.headers) if e.headers else {}
            return MockResponse(e.code, body, response_headers, url=normalized_url, reason=str(e), exceptions_source=self)
        except Exception as e:
            raise self.RequestException(str(e))

    def post(self, url, data=None, json_data=None, headers=None, timeout=None, **kwargs):
        try:
            request_json = json_data if json_data is not None else kwargs.get('json')
            request_headers = dict(headers or {})
            url = self._append_params(url, kwargs.get('params'))
            if request_json is not None:
                body = json.dumps(request_json).encode('utf-8')
                request_headers.setdefault('Content-Type', 'application/json')
            else:
                body = data.encode('utf-8') if isinstance(data, str) else data
            parsed = urllib.parse.urlsplit(url)
            normalized_url = urllib.parse.urlunsplit((
                parsed.scheme,
                parsed.netloc.encode('idna').decode('ascii'),
                urllib.parse.quote(parsed.path, safe='/%'),
                urllib.parse.quote(parsed.query, safe='=&%/:,+-._~'),
                parsed.fragment,
            ))
            req = urllib.request.Request(normalized_url, data=body, headers=request_headers, method='POST')
            with urllib.request.urlopen(req, timeout=timeout or 30, context=_ssl_context) as r:
                return MockResponse(r.status, r.read(), dict(r.headers), url=normalized_url, exceptions_source=self)
        except urllib.error.HTTPError as e:
            body = e.read() if e.fp else b''
            response_headers = dict(e.headers) if e.headers else {}
            return MockResponse(e.code, body, response_headers, url=normalized_url, reason=str(e), exceptions_source=self)
        except urllib.error.URLError as e:
            raise self.ConnectionError(str(e))
        except Exception as e:
            raise self.RequestException(str(e))

mock_requests = MockRequests()
sys.modules['temporalio'] = mock_temporalio
sys.modules['temporalio.activity'] = mock_temporalio.activity
sys.modules['temporalio.workflow'] = mock_temporalio.workflow
sys.modules['temporalio.exceptions'] = mock_temporalio.exceptions
sys.modules['temporalio.common'] = mock_temporalio.common
sys.modules['temporalio.client'] = mock_temporalio.client
sys.modules['temporalio.worker'] = mock_temporalio.worker
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
        json.dump({
            "error": str(e),
            "traceback": traceback.format_exc(),
            "success": False,
            "error_type": type(e).__name__,
            "non_retryable": getattr(e, "non_retryable", False),
        }, f)
    sys.exit(1)
'''


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _clean_code(code: str) -> str:
    """Strip markdown fences from code."""
    if '```' not in code:
        return code
    match = re.search(r'```(?:python)?\n?(.*?)```', code, re.DOTALL)
    if match:
        return match.group(1).strip()
    clean = re.sub(r'```[a-zA-Z]*\n?', '', code)
    return clean.replace('```', '').strip()


def _build_runner_script(
    cert_path: str,
    input_file: str,
    activity_file: str,
    result_file: str,
    fn_name: str,
    attempt: int,
) -> str:
    """Fill placeholders in the runner template."""
    return (
        RUNNER_TEMPLATE
        .replace('CERT_FILE_PATH', cert_path)
        .replace('INPUT_FILE', input_file)
        .replace('ACTIVITY_FILE', activity_file)
        .replace('RESULT_FILE', result_file)
        .replace('FN_NAME', fn_name)
        .replace('ATTEMPT_NUMBER', str(attempt))
    )


def _prepare_sandbox_files(
    code: str,
    fn_name: str,
    input_data: Dict[str, Any],
    attempt: int,
    temp_dir: str,
) -> str:
    """
    Create activity, input, and runner files inside *temp_dir*.

    Returns the path to the runner script.
    """
    # Set SSL certificates
    os.environ['SSL_CERT_FILE'] = certifi.where()
    os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

    clean_code = _clean_code(code)

    activity_file = os.path.join(temp_dir, "activity.py")
    input_file = os.path.join(temp_dir, "input.json")
    runner_file = os.path.join(temp_dir, "runner.py")
    result_file = os.path.join(temp_dir, "result.json")

    with open(activity_file, 'w') as f:
        f.write(clean_code)

    with open(input_file, 'w') as f:
        json.dump(input_data, f)

    runner_script = _build_runner_script(
        cert_path=certifi.where(),
        input_file=input_file,
        activity_file=activity_file,
        result_file=result_file,
        fn_name=fn_name,
        attempt=attempt,
    )

    with open(runner_file, 'w') as f:
        f.write(runner_script)

    return runner_file


def _parse_result(
    result_file: str,
    execution_logs: List[str],
    missing_traceback: str = "",
) -> Dict[str, Any]:
    """Read and parse the result JSON file."""
    try:
        if os.path.exists(result_file):
            with open(result_file, 'r') as f:
                result = json.load(f)
            return {
                "result": result.get('result'),
                "error": result.get('error'),
                "traceback": result.get('traceback'),
                "logs": execution_logs,
                "success": result.get('success', result.get('error') is None),
                "error_type": result.get('error_type'),
                "non_retryable": result.get('non_retryable', False),
            }
        return {
            "result": None,
            "error": "Sandbox failed to write result file",
            "traceback": missing_traceback,
            "logs": execution_logs,
            "success": False,
        }
    except Exception as e:
        return {
            "result": None,
            "error": f"Result parsing error: {str(e)}",
            "logs": execution_logs,
            "success": False,
        }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def execute_in_sandbox(
    code: str,
    fn_name: str,
    input_data: Dict[str, Any],
    attempt: int = 1,
) -> Dict[str, Any]:
    """
    Execute Python code in an isolated sandbox environment.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        runner_file = _prepare_sandbox_files(code, fn_name, input_data, attempt, temp_dir)
        result_file = os.path.join(temp_dir, "result.json")

        proc = await asyncio.create_subprocess_exec(
            'python3', runner_file,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await proc.communicate()
        stdout_str = stdout.decode('utf-8') if stdout else ''
        stderr_str = stderr.decode('utf-8') if stderr else ''

        execution_logs: List[str] = []
        if stderr_str:
            for line in stderr_str.strip().split('\n'):
                if line:
                    execution_logs.append(f"[Python stderr] {line}")
        if stdout_str.strip():
            for line in stdout_str.strip().split('\n'):
                if line:
                    execution_logs.append(f"[Activity stdout] {line}")

        return _parse_result(
            result_file,
            execution_logs,
            missing_traceback=f"Stdout: {stdout_str}\nStderr: {stderr_str}",
        )


async def execute_in_sandbox_streaming(
    code: str,
    fn_name: str,
    input_data: Dict[str, Any],
    on_log,
    attempt: int = 1,
) -> Dict[str, Any]:
    """
    Execute Python code in sandbox and stream stdout/stderr logs incrementally.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        runner_file = _prepare_sandbox_files(code, fn_name, input_data, attempt, temp_dir)
        result_file = os.path.join(temp_dir, "result.json")

        proc = await asyncio.create_subprocess_exec(
            'python3', runner_file,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        execution_logs: List[str] = []

        async def forward_stream(stream, prefix: str):
            while True:
                line = await stream.readline()
                if not line:
                    break
                decoded = line.decode('utf-8', errors='replace').rstrip('\n')
                if not decoded:
                    continue
                log_line = f"{prefix} {decoded}"
                execution_logs.append(log_line)
                await on_log(log_line)

        await asyncio.gather(
            forward_stream(proc.stdout, "[Activity stdout]"),
            forward_stream(proc.stderr, "[Python stderr]"),
        )
        await proc.wait()

        return _parse_result(
            result_file,
            execution_logs,
            missing_traceback="Result file not found",
        )
