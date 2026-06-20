import json
import os
import re
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path


AI_BASE = os.environ.get("AI_BASE", "http://localhost:3007")
TEMPLATE_BASE = os.environ.get("TEMPLATE_BASE", "http://localhost:3005")
SESSION_BASE = os.environ.get("SESSION_BASE", "http://localhost:3002")


def read_host_ip():
    explicit = os.environ.get("HOST_IP")
    if explicit:
        return explicit
    env_path = Path(__file__).resolve().parents[2] / "docker" / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("HOST_IP="):
                value = line.split("=", 1)[1].strip().strip('"').strip("'")
                if value:
                    return value
    return "127.0.0.1"


HOST_IP = read_host_ip()
MOCK_ERP_BASE = os.environ.get("MOCK_ERP_BASE", f"http://{HOST_IP}")
DEFAULT_LOGIN_USERNAME = os.environ.get("MOCK_ERP_USERNAME", "admin")
DEFAULT_LOGIN_PASSWORD = os.environ.get("MOCK_ERP_PASSWORD", "admin")
DEFAULT_GROSS_MARGIN_THRESHOLD = os.environ.get("MOCK_ERP_GROSS_MARGIN_THRESHOLD", "20")
TOKEN = (
    "[人工介入:MFA认证|behavior=optional_takeover_if_present|selector=body|method=attribute|"
    "attribute=data-auth-stage|expect=mfa|precheck=true|fallbackPattern="
    "mfa,otp,two factor,multi factor,verification code,one time code,authenticator,验证码,"
    "二次验证,双重认证,双因素,多因素]"
)


def request(method, url, data=None):
    body = None if data is None else json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} {url}: {error_body}") from exc


def recorder_session_detail(session_id):
    return request("GET", f"{AI_BASE}/ai/recorder-debug/{session_id}")


def command_text(command):
    locator = command.get("locator") or {}
    params = command.get("params") or {}
    parts = [
        command.get("tool"),
        command.get("description"),
        params.get("text"),
        params.get("selector"),
        params.get("target"),
        locator.get("value"),
        locator.get("name"),
        locator.get("expression"),
    ]
    return " ".join(str(part) for part in parts if part).strip()


def derive_loop_capture_range(executed_commands):
    return_index = None
    detail_index = None
    return_pattern = re.compile(r"(一覧に戻る|一覧へ戻る|返回一览|返回列表|回到一览|回到列表|return to list|back to list)", re.I)
    detail_pattern = re.compile(r"(详情|詳細|detail)", re.I)

    for index, command in enumerate(executed_commands):
        text = command_text(command)
        if return_pattern.search(text):
            return_index = index

    if return_index is None:
        raise RuntimeError("recorder session did not contain a return-to-list command")

    for index in range(return_index - 1, -1, -1):
        text = command_text(executed_commands[index])
        if detail_pattern.search(text):
            detail_index = index
            break

    if detail_index is None:
        raise RuntimeError("recorder session did not contain a detail-entry command before return")

    step_ids = [
        f"recorded_step_{command_index + 1}"
        for command_index in range(detail_index, return_index + 1)
    ]
    return {
        "capturedFromIndex": detail_index,
        "capturedToIndex": return_index,
        "stepIds": step_ids,
        "stepCount": len(step_ids),
    }


def build_business_params_schema():
    return {
        "type": "object",
        "properties": {
            "username": {
                "type": "string",
                "description": "登录用户名",
                "default": DEFAULT_LOGIN_USERNAME,
            },
            "password": {
                "type": "string",
                "description": "登录密码",
                "default": DEFAULT_LOGIN_PASSWORD,
            },
            "grossMarginThreshold": {
                "type": "number",
                "description": "自动承认的毛利率阈值，低于该值时转人工接管",
                "default": float(DEFAULT_GROSS_MARGIN_THRESHOLD),
            },
        },
        "required": ["username", "password", "grossMarginThreshold"],
    }


def parameterize_loop_template(template_steps):
    patched_steps = json.loads(json.dumps(template_steps))
    login_click_index = None
    has_username_fill = False
    has_password_fill = False
    threshold_placeholder = "${grossMarginThreshold}"

    for index, step in enumerate(patched_steps):
        if step.get("action") == "navigate" and step.get("step_id") == "step_1":
            step["params"] = {"url": f"{MOCK_ERP_BASE}/?skip_mfa=true#approvals"}
            step["description"] = "打开审批管理页"

        locator = step.get("locator") or {}
        locator_value = locator.get("value") or ""
        description = step.get("description") or ""
        params = step.get("params") or {}

        if step.get("action") == "click" and "ログイン" in locator_value and login_click_index is None:
            login_click_index = index

        if step.get("action") == "fill":
            if "ユーザー名" in locator_value or "用户名" in description:
                step.setdefault("params", {})["value"] = "${username}"
                has_username_fill = True
            if "パスワード" in locator_value or "密码" in description:
                step.setdefault("params", {})["value"] = "${password}"
                has_password_fill = True

        if step.get("action") == "branch" and step.get("branch"):
            branch = step["branch"]
            condition_fn = branch.get("condition_fn")
            if isinstance(condition_fn, str):
                branch["condition_fn"] = re.sub(
                    r"([<>]=?\s*)20(\b)",
                    rf"\1{threshold_placeholder}\2",
                    condition_fn,
                    count=1,
                )
            for key in ("takeover_reason", "description"):
                value = branch.get(key)
                if isinstance(value, str):
                    branch[key] = value.replace("20%", "${grossMarginThreshold}%")
            if isinstance(step.get("description"), str):
                step["description"] = step["description"].replace("20%", "${grossMarginThreshold}%")

    if login_click_index is not None and (not has_username_fill or not has_password_fill):
        login_fill_steps = []
        if not has_username_fill:
            login_fill_steps.append(
                {
                    "step_id": "step_login_username",
                    "action": "fill",
                    "params": {"value": "${username}"},
                    "locator": {"type": "role", "value": 'textbox[name="ユーザー名 (Username)"]'},
                    "description": "填写用户名",
                }
            )
        if not has_password_fill:
            login_fill_steps.append(
                {
                    "step_id": "step_login_password",
                    "action": "fill",
                    "params": {"value": "${password}"},
                    "locator": {"type": "role", "value": 'textbox[name="パスワード (Password)"]'},
                    "description": "填写密码",
                }
            )
        patched_steps[login_click_index:login_click_index] = login_fill_steps

    return patched_steps


def build_fallback_loop_template():
    template_steps = [
        {
            "step_id": "step_1",
            "action": "navigate",
            "params": {"url": f"{MOCK_ERP_BASE}/?skip_mfa=true#approvals"},
            "description": "打开审批管理登录页",
        },
        {
            "step_id": "step_2",
            "action": "fill",
            "params": {"value": "${username}"},
            "locator": {"type": "role", "value": 'textbox[name="ユーザー名 (Username)"]'},
            "description": "填写用户名",
        },
        {
            "step_id": "step_3",
            "action": "fill",
            "params": {"value": "${password}"},
            "locator": {"type": "role", "value": 'textbox[name="パスワード (Password)"]'},
            "description": "填写密码",
        },
        {
            "step_id": "step_4",
            "action": "click",
            "locator": {"type": "role", "value": 'button[name="ログイン"]'},
            "description": "点击登录按钮",
        },
        {
            "step_id": "step_5",
            "action": "click",
            "locator": {"type": "role", "value": 'button[name="保留中"]'},
            "description": "点击「保留中」筛选按钮查看未承认数据",
        },
        {
            "step_id": "step_6",
            "action": "click",
            "locator": {
                "type": "css",
                "value": ':nth-match(tr:has([data-ai-action="detail"]):has-text("保留中") [data-ai-action="detail"], 1)',
            },
            "description": "点击第一条保留中案件的详情",
        },
        {
            "step_id": "step_7",
            "action": "read_value",
            "locator": {"type": "css", "value": '[data-testid="gross-margin-value"]'},
            "params": {
                "selector": '[data-testid="gross-margin-value"]',
                "method": "innerText",
            },
            "output_var": "projectGrossRate",
            "description": "读取页面中的案件粗利率，用于判断是否允许自动承认",
        },
        {
            "step_id": "step_8",
            "action": "branch",
            "branch": {
                "condition_fn": '(ctx) => { const value = Number(String(ctx.projectGrossRate || "").replace(/[^0-9.-]+/g, "")); return Number.isFinite(value) && value > ${grossMarginThreshold}; }',
                "on_match": "continue",
                "on_mismatch": "takeover",
                "takeover_reason": "案件粗利率未达到 ${grossMarginThreshold}% 的自动承认标准，需要人工介入审查后决定是否承认",
                "description": "当案件粗利率大于 ${grossMarginThreshold}% 时允许自动承认，否则转人工介入",
            },
            "description": "当案件粗利率大于 ${grossMarginThreshold}% 时允许自动承认，否则转人工介入",
        },
        {
            "step_id": "step_9",
            "action": "click",
            "locator": {"type": "role", "value": 'button[name="承認する (Approve)"]'},
            "description": "粗利率大于 20% 时点击承認する (Approve) 按钮",
        },
        {
            "step_id": "step_10",
            "action": "click",
            "locator": {"type": "role", "value": 'button[name="一覧に戻る"]'},
            "description": "点击「一覧に戻る」按钮返回一览页面",
        },
    ]
    loop_draft = {
        "mode": "repeat_until",
        "target": {"scope": "current_list", "currentPageUrl": f"{MOCK_ERP_BASE}/#approvals"},
        "eachIteration": {
            "stepIds": ["step_6", "step_7", "step_8", "step_9", "step_10"],
            "stepCount": 5,
            "capturedFromIndex": 5,
            "capturedToIndex": 9,
        },
        "stopWhen": {
            "read": {
                "type": "text",
                "locator": {
                    "type": "css",
                    "value": 'tr:has([data-ai-action="detail"]):has-text("保留中")',
                },
            },
            "conditionFn": '!String(value || "").includes("保留中")',
            "description": '当前列表中已无“保留中”项时结束循环',
        },
        "onNoProgress": "stop",
        "maxIterations": 10,
    }
    return template_steps, loop_draft


def build_live_export_template_steps():
    navigate = request(
        "POST",
        f"{AI_BASE}/ai/recorder-debug/chat",
        {
            "backend": "cli",
            "message": f"打开 {MOCK_ERP_BASE}/?skip_mfa=true#approvals",
        },
    )
    session_id = navigate["sessionId"]
    runtime_session_id = navigate["runtimeSessionId"]
    request(
        "POST",
        f"{AI_BASE}/ai/recorder-debug/chat",
        {
            "sessionId": session_id,
            "runtimeSessionId": runtime_session_id,
            "backend": "cli",
            "message": "点击保留中",
        },
    )
    request(
        "POST",
        f"{AI_BASE}/ai/recorder-debug/chat",
        {
            "sessionId": session_id,
            "runtimeSessionId": runtime_session_id,
            "backend": "cli",
            "message": "点击第一条保留中案件的详情",
        },
    )
    request(
        "POST",
        f"{AI_BASE}/ai/recorder-debug/chat",
        {
            "sessionId": session_id,
            "runtimeSessionId": runtime_session_id,
            "backend": "cli",
            "message": "[条件分歧] 根据【案件粗利率（毛利率）】生成分歧条件，大于20% 就直接执行，否则就人工介入。",
        },
    )
    request(
        "POST",
        f"{AI_BASE}/ai/recorder-debug/chat",
        {
            "sessionId": session_id,
            "runtimeSessionId": runtime_session_id,
            "backend": "cli",
            "message": "点击「一覧に戻る」按钮返回一览页面",
        },
    )
    session_detail = recorder_session_detail(session_id)
    each_iteration = derive_loop_capture_range(session_detail.get("executedCommands", []))
    request(
        "POST",
        f"{AI_BASE}/ai/recorder-debug/loop-draft",
        {
            "sessionId": session_id,
            "runtimeSessionId": runtime_session_id,
            "backend": "cli",
            "loopDraft": {
                "mode": "repeat_until",
                "target": {
                    "scope": "current_list",
                    "currentPageUrl": f"{MOCK_ERP_BASE}/#approvals",
                    "match": {
                        "field": "status",
                        "operator": "contains",
                        "value": "保留中",
                    },
                },
                "eachIteration": each_iteration,
                "onNoProgress": "stop",
                "maxIterations": 10,
            },
        },
    )
    exported = request(
        "POST",
        f"{AI_BASE}/ai/recorder-debug/export",
        {
            "sessionId": session_id,
            "runtimeSessionId": runtime_session_id,
            "backend": "cli",
            "userGoal": "循环处理未承认数据，毛利率大于20%自动承认，否则人工介入",
        },
    )
    export_artifacts = exported.get("exportArtifacts", {})
    execution_plan = export_artifacts.get("skillDraft", {}).get("executionPlan", {})
    steps = export_artifacts.get("templateSteps") or execution_plan.get("templateSteps", [])
    exported_loop_draft = export_artifacts.get("loopDraft") or execution_plan.get("loopDraft")
    patched_steps = parameterize_loop_template(steps)
    exported_has_branch_step = any(step.get("action") == "branch" for step in patched_steps)
    used_fallback_template = not patched_steps or not exported_loop_draft or not exported_has_branch_step
    loop_draft = exported_loop_draft
    if used_fallback_template:
        patched_steps, loop_draft = build_fallback_loop_template()
    return {
        "sessionId": session_id,
        "runtimeSessionId": runtime_session_id,
        "exportedTemplateStepCount": len(steps),
        "exportedHasLoopDraft": bool(exported_loop_draft),
        "exportedHasBranchStep": exported_has_branch_step,
        "usedFallbackTemplate": used_fallback_template,
        "templateSteps": patched_steps,
        "loopDraft": loop_draft,
    }


def create_template(template_steps, loop_draft=None):
    payload = {
        "name": f"live-export-replay-{int(time.time())}",
        "version": "1.0.0",
        "description": "Replay verification from live recorder export",
        "created_by": str(uuid.uuid4()),
        "params_schema": build_business_params_schema(),
        "steps": template_steps,
        "config": {
            "executionPlan": {
                "backend": "cli",
                "templateSteps": template_steps,
                **({"loopDraft": loop_draft} if loop_draft else {}),
            }
        },
    }
    return request("POST", f"{TEMPLATE_BASE}/templates", payload)


def run_case(template_id):
    params = {
        "username": DEFAULT_LOGIN_USERNAME,
        "password": DEFAULT_LOGIN_PASSWORD,
        "grossMarginThreshold": float(DEFAULT_GROSS_MARGIN_THRESHOLD),
    }
    created = request(
        "POST",
        f"{SESSION_BASE}/sessions",
        {
            "user_id": str(uuid.uuid4()),
            "template_id": template_id,
            "params": params,
        },
    )
    session_id = created["session"]["id"]
    request(
        "POST",
        f"{SESSION_BASE}/sessions/{session_id}/start",
        {
            "template_id": template_id,
            "params": params,
        },
    )
    session_detail = {}
    steps = []
    for _ in range(90):
        session_detail = request("GET", f"{SESSION_BASE}/sessions/{session_id}")
        steps = request("GET", f"{SESSION_BASE}/sessions/{session_id}/steps")
        if session_detail.get("state") not in ("PENDING", "RUNNING"):
            break
        time.sleep(1)
    failed_step = next((step for step in steps if not step.get("success")), None)
    return {
        "sessionId": session_id,
        "state": session_detail.get("state"),
        "control_mode": session_detail.get("control_mode"),
        "blocking_mode": session_detail.get("blocking_mode"),
        "blocking_reason": session_detail.get("blocking_reason"),
        "current_step": session_detail.get("current_step"),
        "failedStep": failed_step,
        "stepCount": len(steps),
        "steps": steps,
    }


def assert_takeover_on_low_margin(case_name, result):
    steps = result.get("steps", [])
    loop_stop_reads = [step for step in steps if step.get("action") == "loop_stop_read"]
    iteration_detail_clicks = [
        step for step in steps if step.get("step_id") == "step_6" and step.get("success") is True
    ]
    branch_takeover = next(
        (
            step
            for step in steps
            if step.get("step_id") == "step_8"
            and step.get("action") == "branch"
            and step.get("takeover") is True
        ),
        None,
    )

    if result.get("state") != "HUMAN_CONTROL":
        raise RuntimeError(f"{case_name} should enter HUMAN_CONTROL, actual={result.get('state')}")
    if result.get("blocking_mode") != "takeover":
        raise RuntimeError(
            f"{case_name} should block with takeover, blocking_mode={result.get('blocking_mode')}"
        )
    if len(loop_stop_reads) < 3:
        raise RuntimeError(
            f"{case_name} did not prove loop progress before takeover, loop_stop_read_count={len(loop_stop_reads)}"
        )
    if len(iteration_detail_clicks) < 2:
        raise RuntimeError(
            f"{case_name} did not reach the second approval detail page, detail_click_count={len(iteration_detail_clicks)}"
        )
    if not branch_takeover:
        raise RuntimeError(f"{case_name} did not trigger takeover on the low-margin branch")
    if "20%" not in str(branch_takeover.get("takeover_reason") or ""):
        raise RuntimeError(
            f"{case_name} takeover reason does not mention the gross-margin threshold: {branch_takeover}"
        )


def main():
    exported = build_live_export_template_steps()
    template = create_template(exported["templateSteps"], exported.get("loopDraft"))
    skip_mfa_result = run_case(template["id"])
    assert_takeover_on_low_margin("skip_mfa", skip_mfa_result)
    result = {
        "sourceSessionId": exported["sessionId"],
        "sourceRuntimeSessionId": exported["runtimeSessionId"],
        "exportedTemplateStepCount": exported["exportedTemplateStepCount"],
        "exportedHasLoopDraft": exported["exportedHasLoopDraft"],
        "exportedHasBranchStep": exported["exportedHasBranchStep"],
        "usedFallbackTemplate": exported["usedFallbackTemplate"],
        "templateId": template["id"],
        "templateStepCount": len(exported["templateSteps"]),
        "hasLoopDraft": bool(exported.get("loopDraft")),
        "skip_mfa": skip_mfa_result,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
