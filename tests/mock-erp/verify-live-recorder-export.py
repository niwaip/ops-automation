import json
import os
import urllib.error
import urllib.request


AI_BASE = os.environ.get("AI_BASE", "http://localhost:3007")
HOST_IP = os.environ.get("HOST_IP", "127.0.0.1")
MOCK_ERP_URL = os.environ.get("MOCK_ERP_URL", f"http://{HOST_IP}/?force_mfa=true")
TOKEN = (
    "[人工介入:MFA认证|behavior=optional_takeover_if_present|selector=body|method=attribute|"
    "attribute=data-auth-stage|expect=mfa|precheck=true|fallbackPattern="
    "mfa,otp,two factor,multi factor,verification code,one time code,authenticator,验证码,"
    "二次验证,双重认证,双因素,多因素]"
)


def request(method, path, data=None):
    body = None if data is None else json.dumps(data).encode("utf-8")
    req = urllib.request.Request(f"{AI_BASE}{path}", data=body, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} {path}: {error_body}") from exc


def main():
    navigate = request(
        "POST",
        "/ai/recorder-debug/chat",
        {
            "backend": "cli",
            "message": f"打开 {MOCK_ERP_URL}",
        },
    )
    session_id = navigate["sessionId"]
    runtime_session_id = navigate["runtimeSessionId"]

    token_reply = request(
        "POST",
        "/ai/recorder-debug/chat",
        {
            "sessionId": session_id,
            "runtimeSessionId": runtime_session_id,
            "backend": "cli",
            "message": TOKEN,
        },
    )
    session_detail = request("GET", f"/ai/recorder-debug/{session_id}")
    exported = request(
        "POST",
        "/ai/recorder-debug/export",
        {
            "sessionId": session_id,
            "runtimeSessionId": runtime_session_id,
            "backend": "cli",
            "userGoal": "登录系统并进入首页",
        },
    )

    skill_draft = exported.get("skillDraft", {})
    execution_plan = skill_draft.get("executionPlan", {})
    manual_interventions = execution_plan.get("manualInterventions", [])
    runtime_hints = execution_plan.get("runtimeHints", {})
    template_steps = exported.get("templateSteps") or execution_plan.get("templateSteps", [])

    result = {
        "sessionId": session_id,
        "runtimeSessionId": runtime_session_id,
        "navigateStatus": navigate.get("status"),
        "tokenStatus": token_reply.get("status"),
        "tokenReply": token_reply.get("reply"),
        "sessionManualInterventions": session_detail.get("manualInterventions"),
        "templateSignalSteps": [
            step
            for step in template_steps
            if step.get("description") in ("读取MFA认证页面信号", "检查是否出现MFA认证提示")
            or str(step.get("output_var", "")).startswith("manual_")
        ],
        "templateBranchSteps": [
            step
            for step in template_steps
            if step.get("action") == "branch"
            and step.get("branch", {}).get("takeover_reason") == "检测到MFA认证提示，请人工介入后继续执行"
        ],
        "executionPlanManualInterventions": manual_interventions,
        "runtimeHints": runtime_hints,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
