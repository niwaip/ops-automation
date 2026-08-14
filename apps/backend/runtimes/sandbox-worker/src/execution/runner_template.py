RUNNER_TEMPLATE = r'''
import json
import sys
import os
import traceback
import asyncio
import types
import ssl
import inspect
import time

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
        self.task_queue = 'sandbox-worker-task-queue'
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
_retry_policy_class = lambda **kw: type('RetryPolicy', (), {k: v for k, v in kw.items()})()
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
        class RequestException(Exception): pass
        class Timeout(RequestException): pass
        class HTTPError(RequestException): pass
        class ConnectionError(RequestException): pass

        self.RequestException = RequestException
        self.Timeout = Timeout
        self.HTTPError = HTTPError
        self.ConnectionError = ConnectionError

        self.exceptions = types.ModuleType('requests.exceptions')
        self.exceptions.RequestException = RequestException
        self.exceptions.Timeout = Timeout
        self.exceptions.HTTPError = HTTPError
        self.exceptions.ConnectionError = ConnectionError
        self.RequestException = RequestException
        self.Timeout = Timeout
        self.HTTPError = HTTPError
        self.ConnectionError = ConnectionError
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
        url = self._append_params(url, kwargs.get('params'))
        parsed = urllib.parse.urlsplit(url)
        normalized_url = urllib.parse.urlunsplit((
            parsed.scheme,
            parsed.netloc.encode('idna').decode('ascii'),
            urllib.parse.quote(parsed.path, safe='/%'),
            urllib.parse.quote(parsed.query, safe='=&%/:,+-._~'),
            parsed.fragment,
        ))
        for attempt in range(3):
            try:
                req = urllib.request.Request(normalized_url, headers=headers or {})
                with urllib.request.urlopen(req, timeout=timeout or 30, context=_ssl_context) as r:
                    return MockResponse(r.status, r.read(), dict(r.headers), url=normalized_url, exceptions_source=self)
            except urllib.error.HTTPError as e:
                body = e.read() if e.fp else b''
                response_headers = dict(e.headers) if e.headers else {}
                return MockResponse(e.code, body, response_headers, url=normalized_url, reason=str(e), exceptions_source=self)
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                if attempt >= 2:
                    raise self.ConnectionError(str(e))
                time.sleep(0.25 * (2 ** attempt))

    def post(self, url, data=None, json_data=None, headers=None, timeout=None, **kwargs):
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
        for attempt in range(3):
            try:
                req = urllib.request.Request(normalized_url, data=body, headers=request_headers, method='POST')
                with urllib.request.urlopen(req, timeout=timeout or 30, context=_ssl_context) as r:
                    return MockResponse(r.status, r.read(), dict(r.headers), url=normalized_url, exceptions_source=self)
            except urllib.error.HTTPError as e:
                body_bytes = e.read() if e.fp else b''
                response_headers = dict(e.headers) if e.headers else {}
                return MockResponse(e.code, body_bytes, response_headers, url=normalized_url, reason=str(e), exceptions_source=self)
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                if attempt >= 2:
                    raise self.ConnectionError(str(e))
                time.sleep(0.25 * (2 ** attempt))

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
