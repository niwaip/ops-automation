/**
 * Gate 1 (§10.2) inline Python AST analyzer — the authoritative static-analysis
 * arbiter for generated workflow code. Executed via `python3 -c` with the
 * generated code path as argv[1] and the DSL-declared required v2Output field
 * names as argv[2] (JSON array). Prints a single JSON line to stdout:
 * `{"success": bool, "errors": [{"line", "code", "message"}]}`.
 *
 * Stages: 1) ast.parse + compile; 2) import whitelist (three tiers per §10.2);
 * 3) locate the @workflow.defn class; 4) Workflow determinism bans (network,
 * file, DB, time, random, concurrency, workflow.unsafe, eval/exec, SDK API
 * misuse) — external I/O inside Activity code is allowed and untouched;
 * 5) Result Builder return check + envelope keys + required v2Output fields.
 */
export const PYTHON_AST_GATE_SCRIPT = `
import ast
import json
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")

required_v2_fields = []
if len(sys.argv) > 2:
    try:
        parsed = json.loads(sys.argv[2])
        if isinstance(parsed, list):
            required_v2_fields = [str(f) for f in parsed]
    except Exception:
        pass

errors = []
seen = set()


def add_error(line, code, message):
    key = (line, code)
    if key in seen:
        return
    seen.add(key)
    errors.append({"line": line, "code": code, "message": message})


def finish():
    print(json.dumps({"success": len(errors) == 0, "errors": errors}, ensure_ascii=False))
    sys.exit(0)


# ---------- Stage 1: syntax ----------
try:
    tree = ast.parse(source, filename=sys.argv[1])
except SyntaxError as exc:
    add_error(exc.lineno or 1, "SYNTAX_ERROR", "Python 语法错误: %s" % (exc.msg or str(exc)))
    finish()

try:
    compile(source, sys.argv[1], "exec")
except Exception as exc:
    add_error(1, "SYNTAX_ERROR", "Python 编译失败: %s" % str(exc))
    finish()

# ---------- Stage 2: import whitelist ----------
TIER_A_STDLIB = {
    "__future__", "typing", "dataclasses", "datetime", "json", "math", "re", "enum",
    "collections", "functools", "itertools", "copy", "textwrap", "hashlib",
    "base64", "uuid", "string",
}
TIER_A_TEMPORAL = {"temporalio"}
TIER_A_PLATFORM = {
    "workflow_result_builder", "schema_assertions", "platform_errors", "platform_dtos",
}
# Activity-side dependencies are allowed at import level (their sandbox
# restriction is a runtime concern); usage inside Workflow code is banned
# in Stage 4.
TIER_B_ACTIVITY = {
    "os", "requests", "urllib", "subprocess", "socket", "http", "httpx",
    "aiohttp", "sqlite3", "psycopg2", "mysql", "redis", "pymongo", "time",
    "random", "secrets", "threading", "multiprocessing", "asyncio", "pathlib",
    "shutil", "tempfile", "csv", "ssl", "signal", "glob", "sys", "boto3",
    "smtplib", "email",
}
ALLOWED_IMPORTS = TIER_A_STDLIB | TIER_A_TEMPORAL | TIER_A_PLATFORM | TIER_B_ACTIVITY
SDK_FROM_IMPORTS_BANNED = {("temporalio.activity", "RetryPolicy")}

for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        for alias in node.names:
            root = alias.name.split(".")[0]
            if root not in ALLOWED_IMPORTS:
                add_error(node.lineno, "IMPORT_BANNED",
                          "导入模块 '%s' 不在白名单内（允许: 标准库确定性子集、temporalio.*、平台 SDK）。" % alias.name)
    elif isinstance(node, ast.ImportFrom):
        module = node.module or ""
        root = module.split(".")[0]
        if root not in ALLOWED_IMPORTS:
            add_error(node.lineno, "IMPORT_BANNED",
                      "导入模块 '%s' 不在白名单内（允许: 标准库确定性子集、temporalio.*、平台 SDK）。" % module)
        for alias in node.names:
            if (module, alias.name) in SDK_FROM_IMPORTS_BANNED:
                add_error(node.lineno, "WORKFLOW_SDK_API",
                          "temporalio.activity 不存在 RetryPolicy；RetryPolicy 属于 temporalio.common。")

# ---------- Stage 3: locate the workflow class ----------
def is_workflow_defn_class(node):
    if not isinstance(node, ast.ClassDef):
        return False
    for dec in node.decorator_list:
        target = dec.func if isinstance(dec, ast.Call) else dec
        if isinstance(target, ast.Attribute) and target.attr == "defn":
            base = target.value
            if isinstance(base, ast.Name) and base.id == "workflow":
                return True
            if isinstance(base, ast.Attribute) and base.attr == "workflow":
                return True
    return False


workflow_class = None
for node in tree.body:
    if is_workflow_defn_class(node):
        workflow_class = node
        break

if workflow_class is None:
    add_error(1, "WORKFLOW_CLASS_MISSING", "未检测到 @workflow.defn 装饰的 Workflow 类。")
    finish()

# ---------- Stage 4: Workflow determinism bans ----------
BANNED_EXACT = {
    "time.sleep": "WORKFLOW_NON_DETERMINISTIC",
    "time.time": "WORKFLOW_NON_DETERMINISTIC",
    "time.time_ns": "WORKFLOW_NON_DETERMINISTIC",
    "time.monotonic": "WORKFLOW_NON_DETERMINISTIC",
    "time.monotonic_ns": "WORKFLOW_NON_DETERMINISTIC",
    "time.perf_counter": "WORKFLOW_NON_DETERMINISTIC",
    "time.perf_counter_ns": "WORKFLOW_NON_DETERMINISTIC",
    "time.gmtime": "WORKFLOW_NON_DETERMINISTIC",
    "time.localtime": "WORKFLOW_NON_DETERMINISTIC",
    "time.strftime": "WORKFLOW_NON_DETERMINISTIC",
    "time.strptime": "WORKFLOW_NON_DETERMINISTIC",
    "datetime.now": "WORKFLOW_NON_DETERMINISTIC",
    "datetime.utcnow": "WORKFLOW_NON_DETERMINISTIC",
    "datetime.today": "WORKFLOW_NON_DETERMINISTIC",
    "datetime.datetime.now": "WORKFLOW_NON_DETERMINISTIC",
    "datetime.datetime.utcnow": "WORKFLOW_NON_DETERMINISTIC",
    "datetime.datetime.today": "WORKFLOW_NON_DETERMINISTIC",
    "datetime.date.today": "WORKFLOW_NON_DETERMINISTIC",
    "uuid.uuid4": "WORKFLOW_NON_DETERMINISTIC",
    "uuid.uuid1": "WORKFLOW_NON_DETERMINISTIC",
    "workflow.unsafe": "WORKFLOW_UNSAFE",
    "workflow.unsafe.is_replaying": "WORKFLOW_UNSAFE",
    "activity.RetryPolicy": "WORKFLOW_SDK_API",
    "workflow.RetryPolicy": "WORKFLOW_SDK_API",
    "temporalio.activity.RetryPolicy": "WORKFLOW_SDK_API",
}
BANNED_PREFIX = {
    "os.": "WORKFLOW_SYSTEM_IO",
    "subprocess.": "WORKFLOW_PROCESS",
    "socket.": "WORKFLOW_NETWORK",
    "requests.": "WORKFLOW_NETWORK",
    "urllib.request.": "WORKFLOW_NETWORK",
    "http.client.": "WORKFLOW_NETWORK",
    "httpx.": "WORKFLOW_NETWORK",
    "aiohttp.": "WORKFLOW_NETWORK",
    "sqlite3.": "WORKFLOW_DATABASE",
    "psycopg2.": "WORKFLOW_DATABASE",
    "mysql.": "WORKFLOW_DATABASE",
    "redis.": "WORKFLOW_DATABASE",
    "pymongo.": "WORKFLOW_DATABASE",
    "threading.": "WORKFLOW_CONCURRENCY",
    "multiprocessing.": "WORKFLOW_CONCURRENCY",
    "asyncio.": "WORKFLOW_CONCURRENCY",
    "random.": "WORKFLOW_NON_DETERMINISTIC",
    "secrets.": "WORKFLOW_NON_DETERMINISTIC",
    "shutil.": "WORKFLOW_FILE_IO",
    "tempfile.": "WORKFLOW_FILE_IO",
    "csv.": "WORKFLOW_FILE_IO",
    "pathlib.": "WORKFLOW_FILE_IO",
    "signal.": "WORKFLOW_SYSTEM_IO",
    "glob.": "WORKFLOW_FILE_IO",
}


def dotted(node):
    parts = []
    cur = node
    while isinstance(cur, ast.Attribute):
        parts.append(cur.attr)
        cur = cur.value
    if isinstance(cur, ast.Name):
        parts.append(cur.id)
    return ".".join(reversed(parts))


for node in ast.walk(workflow_class):
    if isinstance(node, ast.Attribute):
        name = dotted(node)
        code = BANNED_EXACT.get(name)
        if code is None:
            for prefix, pcode in BANNED_PREFIX.items():
                if name.startswith(prefix):
                    code = pcode
                    break
        if code is not None:
            add_error(node.lineno, code,
                      "Workflow 代码禁止使用 '%s'（外部副作用/非确定性操作必须封装在 @activity.defn Activity 中）。" % name)
    if isinstance(node, ast.Call):
        func = node.func
        if isinstance(func, ast.Name) and func.id == "open":
            add_error(node.lineno, "WORKFLOW_FILE_IO",
                      "Workflow 代码禁止直接访问文件系统（open()）。文件操作必须放在 @activity.defn 中。")
        if isinstance(func, ast.Name) and func.id in ("eval", "exec"):
            add_error(node.lineno, "WORKFLOW_DYNAMIC_EVAL", "Workflow 代码禁止动态执行 eval()/exec()。")

# ---------- Stage 5: Result Builder return + envelope ----------
ENVELOPE_KEYS = {"execution", "trigger", "result", "artifacts", "presentation"}


def is_envelope_dict(node):
    if not isinstance(node, ast.Dict):
        return False
    keys = set()
    for k in node.keys:
        if isinstance(k, ast.Constant) and isinstance(k.value, str):
            keys.add(k.value)
    return ENVELOPE_KEYS.issubset(keys)


def is_build_result_call(node):
    if not isinstance(node, ast.Call):
        return False
    func = node.func
    if isinstance(func, ast.Attribute) and func.attr == "_build_workflow_result":
        base = func.value
        if isinstance(base, ast.Name) and base.id in ("self", "cls"):
            return True
    return False


def find_method(cls_node, name):
    for node in cls_node.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    return None


run_method = find_method(workflow_class, "run")
if run_method is None:
    add_error(workflow_class.lineno, "MISSING_RESULT_BUILDER", "Workflow 类缺少 run() 方法。")
else:
    class ReturnProbe(ast.NodeVisitor):
        def __init__(self):
            self.bad = []

        def visit_FunctionDef(self, node):
            if node is not run_method:
                return
            self.generic_visit(node)

        def visit_AsyncFunctionDef(self, node):
            if node is not run_method:
                return
            self.generic_visit(node)

        def visit_Return(self, node):
            if node.value is None:
                return
            if not (is_build_result_call(node.value) or is_envelope_dict(node.value)):
                self.bad.append(node.lineno)

    probe = ReturnProbe()
    probe.visit(run_method)
    if probe.bad:
        add_error(probe.bad[0], "RETURN_NOT_ENVELOPE",
                  "run() 的返回值必须是 _build_workflow_result(...) 或包含 execution/trigger/result/artifacts/presentation 五个顶层字段的信封字典。")

builder_method = find_method(workflow_class, "_build_workflow_result")
envelope_found = False
if builder_method is not None:
    for node in ast.walk(builder_method):
        if is_envelope_dict(node):
            envelope_found = True
            break
    if not envelope_found:
        add_error(builder_method.lineno, "ENVELOPE_INCOMPLETE",
                  "_build_workflow_result() 的信封缺少 execution/trigger/result/artifacts/presentation 之一。")

if required_v2_fields:
    if builder_method is None:
        add_error(workflow_class.lineno, "MISSING_V2_OUTPUT_FIELD",
                  "v2Output 声明了必填输出字段，但缺少 _build_workflow_result()。")
    else:
        present = set()
        for node in ast.walk(builder_method):
            if isinstance(node, ast.Dict):
                for k in node.keys:
                    if isinstance(k, ast.Constant) and isinstance(k.value, str):
                        present.add(k.value)
        missing = [f for f in required_v2_fields if f not in present]
        if missing:
            add_error(builder_method.lineno, "MISSING_V2_OUTPUT_FIELD",
                      "v2Output 必填输出字段未在 Result Builder 中映射: %s" % ", ".join(missing))

finish()
`;

export const AST_GATE_REPAIR_GUIDANCE: Record<string, string> = {
  IMPORT_BANNED: '删除该导入，或改用白名单内模块（标准库确定性子集、temporalio.*、平台 SDK）。',
  WORKFLOW_NETWORK:
    '将网络调用封装进 @activity.defn Activity，Workflow 内只能 await workflow.execute_activity(...)。',
  WORKFLOW_FILE_IO: '将文件操作封装进 @activity.defn Activity。',
  WORKFLOW_DATABASE: '将数据库访问封装进 @activity.defn Activity。',
  WORKFLOW_SYSTEM_IO: 'Workflow 内禁止访问系统环境与 IO；环境变量读取放在 Activity 中。',
  WORKFLOW_PROCESS: '禁止在 Workflow 内启动子进程；进程调用放入 Activity。',
  WORKFLOW_NON_DETERMINISTIC:
    '删除系统时间/随机数调用；时间延迟必须使用 workflow.sleep(timedelta(...))，时间戳使用 workflow 提供的确定性 API。',
  WORKFLOW_CONCURRENCY: 'Workflow 内禁止线程/进程/事件循环；并发由 Temporal 引擎管理。',
  WORKFLOW_UNSAFE:
    '删除 workflow.unsafe 及其相关分支；不要手动判断 is_replaying，保持 Workflow 逻辑确定性即可。',
  WORKFLOW_SDK_API: '使用正确的 Temporal SDK API；RetryPolicy 属于 temporalio.common。',
  WORKFLOW_DYNAMIC_EVAL: '禁止 eval/exec 动态执行代码。',
  WORKFLOW_CLASS_MISSING: '模块必须包含 @workflow.defn 装饰的 Workflow 类。',
  MISSING_RESULT_BUILDER: '实现 _build_workflow_result() 并在 run() 末尾统一调用。',
  RETURN_NOT_ENVELOPE:
    'run() 最终返回值必须是 _build_workflow_result(...) 或包含 execution/trigger/result/artifacts/presentation 的信封字典。',
  ENVELOPE_INCOMPLETE:
    '_build_workflow_result() 必须返回包含 execution/trigger/result/artifacts/presentation 五个顶层字段的信封。',
  MISSING_V2_OUTPUT_FIELD: 'v2Output 声明的必填输出字段必须在 Result Builder 中逐字段映射产出。',
  SYNTAX_ERROR: '修正 Python 语法/编译错误后重新生成完整代码。',
};
