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


class MockActivityLogger:
    """Mock activity logger for standalone execution."""

    def info(self, msg: str) -> None:
        print(f"[INFO] {msg}", flush=True)

    def warning(self, msg: str) -> None:
        print(f"[WARN] {msg}", flush=True)

    def error(self, msg: str) -> None:
        print(f"[ERROR] {msg}", flush=True)


class MockActivityInfo:
    """Mock activity info for standalone execution."""

    def __init__(self):
        self.activity_type = "SandboxActivity"
        self.workflow_type = "AgentSessionWorkflow"
        self.workflow_namespace = "default"
        self.task_queue = "sandbox-agent-task-queue"
        self.is_cancelled = False
        self.is_replaying = False
        self.run_id = "mock-run-id"
        self.workflow_run_id = "mock-workflow-run-id"
        self.workflow_id = "mock-workflow-id"
        self.activity_id = "mock-activity-id"
        self.attempt = 1


class MockRetryPolicy:
    """Mock retry policy."""

    def __init__(self, maximum_attempts: int = 3, **kwargs):
        self.maximum_attempts = maximum_attempts


class MockApplicationError(Exception):
    """Mock application error."""

    def __init__(self, message: str, non_retryable: bool = False, **kwargs):
        super().__init__(message)
        self.message = message
        self.non_retryable = non_retryable


class MockActivity:
    """Mock activity module for standalone execution."""

    def defn(self, name: str = None, **kwargs):
        def decorator(func):
            func._activity_name = name or func.__name__
            return func
        return decorator

    @property
    def logger(self) -> MockActivityLogger:
        return MockActivityLogger()

    def heartbeat(self, *args, **kwargs) -> None:
        print(f"[HEARTBEAT] {args if args else 'tick'}", flush=True)
        return None

    def info(self) -> MockActivityInfo:
        return MockActivityInfo()


class MockTemporalioExceptions:
    """Mock temporalio.exceptions module."""

    ApplicationError = MockApplicationError


def create_mock_temporalio():
    """Create mock temporalio module hierarchy."""
    mock_activity = MockActivity()
    mock_exceptions = MockTemporalioExceptions()

    return mock_activity, mock_exceptions


async def execute_in_sandbox(
    code: str,
    fn_name: str,
    input_data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Execute Python code in an isolated sandbox environment.

    This function:
    1. Cleans markdown code markers
    2. Creates mock temporalio environment
    3. Executes the code with proper isolation
    4. Returns the result or error
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

        # Create runner script
        runner_script = f'''
import json
import sys
import os
import traceback
import asyncio
import types

# Set SSL certificates
os.environ['SSL_CERT_FILE'] = '{certifi.where()}'
os.environ['REQUESTS_CA_BUNDLE'] = '{certifi.where()}'

# Create mock temporalio module hierarchy
class MockActivityLogger:
    def info(self, msg): print(f"[INFO] {{msg}}", flush=True)
    def warning(self, msg): print(f"[WARN] {{msg}}", flush=True)
    def error(self, msg): print(f"[ERROR] {{msg}}", flush=True)

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
        def decorator(func):
            func._activity_name = name or func.__name__
            return func
        return decorator

    @property
    def logger(self):
        return MockActivityLogger()

    def heartbeat(self, *args, **kwargs):
        print(f"[HEARTBEAT] {{args if args else 'tick'}}", flush=True)
        return None

    def info(self):
        return MockActivityInfo()

class MockApplicationError(Exception):
    def __init__(self, message, non_retryable=False, *args, **kwargs):
        super().__init__(message, *args, **kwargs)
        self.message = message
        self.non_retryable = non_retryable

class MockTemporalioExceptions:
    ApplicationError = MockApplicationError

# Build module hierarchy
mock_temporalio = types.ModuleType('temporalio')
mock_temporalio.activity = types.ModuleType('temporalio.activity')
mock_temporalio.exceptions = types.ModuleType('temporalio.exceptions')
mock_temporalio.common = types.ModuleType('temporalio.common')

mock_activity = MockActivity()
mock_temporalio.activity.defn = mock_activity.defn
mock_temporalio.activity.logger = mock_activity.logger
mock_temporalio.activity.heartbeat = mock_activity.heartbeat
mock_temporalio.activity.info = mock_activity.info
mock_temporalio.exceptions.ApplicationError = MockApplicationError

# Mock workflow module
mock_temporalio.workflow = types.ModuleType('temporalio.workflow')

class MockWorkflow:
    def defn(self, *args, **kwargs):
        return lambda cls: cls

    def run(self, *args, **kwargs):
        return lambda func: func

    def signal(self, *args, **kwargs):
        return lambda func: func

    def query(self, *args, **kwargs):
        return lambda func: func

    @property
    def logger(self):
        return MockActivityLogger()

    async def execute_activity(self, activity, *args, **kwargs):
        act_name = getattr(activity, '_activity_name', str(activity))
        print(f"[Sandbox] Executing activity: {{act_name}}", flush=True)
        return {{"status": "success", "mocked": True}}

    async def wait_condition(self, *args, **kwargs):
        return True

mock_workflow = MockWorkflow()
mock_temporalio.workflow.defn = mock_workflow.defn
mock_temporalio.workflow.run = mock_workflow.run
mock_temporalio.workflow.signal = mock_workflow.signal
mock_temporalio.workflow.query = mock_workflow.query
mock_temporalio.workflow.logger = mock_workflow.logger
mock_temporalio.workflow.execute_activity = mock_workflow.execute_activity
mock_temporalio.workflow.wait_condition = mock_workflow.wait_condition

mock_retry_policy = type('MockRetryPolicy', (), {{
    'maximum_attempts': 3,
    'initial_interval_ms': 1000,
    'backoff_coefficient': 2.0,
    'maximum_interval_ms': 10000
}})()

mock_temporalio.common.RetryPolicy = lambda **kw: type('RetryPolicy', (), {{**{{k: v for k, v in kw.items()}}}})()

# Mock requests module using urllib
import urllib.request
import urllib.error

class MockResponse:
    def __init__(self, status, data, headers=None):
        self.status = status
        self.status_code = status  # Alias for requests compatibility
        self.data = data
        self.headers = headers or {{}}
        self.text = data.decode('utf-8') if isinstance(data, bytes) else data
        self.content = data

    def json(self):
        return json.loads(self.text)

    def raise_for_status(self):
        if self.status >= 400:
            raise urllib.error.HTTPError(None, self.status, None, None, None)

class MockRequests:
    def __getattr__(self, name):
        # Forward attribute access to submodules (e.g., requests.exceptions)
        if name.startswith('_'):
            raise AttributeError(name)
        import sys
        submodule_name = 'requests.' + name
        if submodule_name in sys.modules:
            return sys.modules[submodule_name]
        raise AttributeError("'MockRequests' object has no attribute '" + name + "'")

    def get(self, url, headers=None, timeout=None, **kwargs):
        try:
            req = urllib.request.Request(url, headers=headers or {{}})
            with urllib.request.urlopen(req, timeout=timeout or 30) as response:
                data = response.read()
                return MockResponse(response.status, data, dict(response.headers))
        except urllib.error.HTTPError as e:
            return MockResponse(e.code, e.read() if e.fp else b'', dict(e.headers) if hasattr(e, 'headers') else {{}})
        except Exception as e:
            return MockResponse(500, str(e).encode(), {{}})

    def post(self, url, data=None, json=None, headers=None, timeout=None, **kwargs):
        try:
            encoded_data = None
            if json is not None:
                encoded_data = json.dumps(json).encode('utf-8')
                headers = headers or {{}}
                headers['Content-Type'] = 'application/json'
            elif data is not None:
                encoded_data = data.encode('utf-8') if isinstance(data, str) else data

            req = urllib.request.Request(url, data=encoded_data, headers=headers or {{}})
            with urllib.request.urlopen(req, timeout=timeout or 30) as response:
                data = response.read()
                return MockResponse(response.status, data, dict(response.headers))
        except urllib.error.HTTPError as e:
            return MockResponse(e.code, e.read() if e.fp else b'', dict(e.headers) if hasattr(e, 'headers') else {{}})
        except Exception as e:
            return MockResponse(500, str(e).encode(), {{}})

    def put(self, url, data=None, json=None, headers=None, timeout=None, **kwargs):
        return self.post(url, data, json, headers, timeout, **kwargs)

    def delete(self, url, headers=None, timeout=None, **kwargs):
        try:
            req = urllib.request.Request(url, method='DELETE', headers=headers or {{}})
            with urllib.request.urlopen(req, timeout=timeout or 30) as response:
                data = response.read()
                return MockResponse(response.status, data, dict(response.headers))
        except urllib.error.HTTPError as e:
            return MockResponse(e.code, e.read() if e.fp else b'', dict(e.headers) if hasattr(e, 'headers') else {{}})
        except Exception as e:
            return MockResponse(500, str(e).encode(), {{}})

# Mock requests.exceptions module
class MockRequestsException(Exception):
    pass

class MockHTTPError(MockRequestsException):
    pass

class MockConnectionError(MockRequestsException):
    pass

class MockTimeout(MockRequestsException):
    pass

mock_requests_exceptions = types.ModuleType('requests.exceptions')
mock_requests_exceptions.RequestException = MockRequestsException
mock_requests_exceptions.HTTPError = MockHTTPError
mock_requests_exceptions.ConnectionError = MockConnectionError
mock_requests_exceptions.Timeout = MockTimeout

# Create mock requests module
mock_requests = MockRequests()

# Inject into sys.modules
sys.modules['temporalio'] = mock_temporalio
sys.modules['temporalio.activity'] = mock_temporalio.activity
sys.modules['temporalio.workflow'] = mock_temporalio.workflow
sys.modules['temporalio.exceptions'] = mock_temporalio.exceptions
sys.modules['temporalio.common'] = mock_temporalio.common
sys.modules['activity'] = mock_temporalio.activity
sys.modules['workflow'] = mock_temporalio.workflow
sys.modules['requests'] = mock_requests
sys.modules['requests.exceptions'] = mock_requests_exceptions

# Namespace for exec
namespace = {{
    'temporalio': mock_temporalio,
    'activity': mock_temporalio.activity,
    'requests': mock_requests,
}}

# Read input
with open('{input_file}', 'r') as f:
    input_data = json.load(f)

# Read and execute activity code
try:
    with open('{activity_file}', 'r') as f:
        activity_code = f.read()

    # Execute in namespace
    exec(compile(activity_code, '{activity_file}', 'exec'), namespace)

    # Find activity function
    activity_fn = namespace.get('{fn_name}')
    if activity_fn is None:
        # Fallback 1: Search all items for the exact name
        for name, obj in namespace.items():
            if callable(obj) and name == '{fn_name}':
                activity_fn = obj
                break

    if activity_fn is None:
        # Fallback 2: If only one user-defined function exists, use it
        callables = [obj for name, obj in namespace.items() 
                     if callable(obj) and not name.startswith('__') 
                     and name not in ['temporalio', 'activity', 'requests', 'asyncio', 'types', 'json', 'sys', 'os', 'traceback']]
        if len(callables) == 1:
            activity_fn = callables[0]
            print(f"[Sandbox] Function '{fn_name}' not found, using the only available function instead.")

    if activity_fn is None:
        with open('{result_file}', 'w') as f:
            json.dump({{"error": "Function '{fn_name}' not found in activity code", "result": None}}, f)
        sys.exit(1)

    # Execute with different calling conventions
    result = None
    try:
        result = activity_fn(input_data)
    except TypeError as e:
        if "takes 0 positional arguments" in str(e) or "takes 1 positional argument" in str(e):
            # Try calling with no args
            try:
                result = activity_fn()
            except TypeError:
                try:
                    if '{fn_name}'.endswith('Workflow'):
                        instance = activity_fn()
                        if hasattr(instance, 'run'):
                            run_method = instance.run
                            if asyncio.iscoroutine(run_method):
                                result = await run_method(input_data)
                            elif asyncio.iscoroutine(run_method(input_data)):
                                result = await run_method(input_data)
                            else:
                                result = run_method(input_data)
                        else:
                            raise e
                    else:
                        raise e
                except:
                    raise e
        else:
            raise e

    # Handle async
    if asyncio.iscoroutine(result):
        result = asyncio.get_event_loop().run_until_complete(result)

    with open('{result_file}', 'w') as f:
        json.dump({{"result": result, "error": None}}, f)

except Exception as e:
    error_msg = traceback.format_exc()
    with open('{result_file}', 'w') as f:
        json.dump({{"error": str(e), "result": None, "traceback": error_msg}}, f)
    sys.exit(1)
'''

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
                if line:
                    execution_logs.append(f"[Python stderr] {line}")
        if stdout_str.strip():
            for line in stdout_str.strip().split('\n'):
                if line:
                    execution_logs.append(f"[Activity stdout] {line}")

        # Read result from file
        try:
            with open(result_file, 'r') as f:
                result = json.load(f)
            
            # Combine result with logs
            return {
                "result": result.get('result'),
                "error": result.get('error'),
                "traceback": result.get('traceback'),
                "logs": execution_logs,
                "success": result.get('error') is None
            }
        except json.JSONDecodeError:
            raise Exception(f"Failed to parse result: {stdout_str}\nLogs: {execution_logs}")
