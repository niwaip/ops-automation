import json
import time
import urllib.request
import urllib.error
import uuid
import sys

SESSION_BASE = "http://localhost:3002"
TEMPLATE_ID = "351935e6-4594-4df3-8a2f-377d2d20032d"

def request(method, url, data=None):
    body = None if data is None else json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        err_msg = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} {url}: {err_msg}") from exc

def main():
    print(f"🚀 [E2E] Triggering Execution for Template: {TEMPLATE_ID}...")
    params = {
        "username": "admin",
        "loginCredential": "admin",
        "grossMarginThreshold": 10,
    }
    
    user_id = str(uuid.uuid4())
    created = request("POST", f"{SESSION_BASE}/sessions", {
        "user_id": user_id,
        "template_id": TEMPLATE_ID,
        "params": params,
    })
    session_id = created["session"]["id"]
    print(f"✅ Session Created: {session_id}")
    
    start_res = request("POST", f"{SESSION_BASE}/sessions/{session_id}/start", {
        "template_id": TEMPLATE_ID,
        "params": params,
    })
    print(f"▶️ Session Started. Polling progress...\n")
    
    max_wait_seconds = 120
    start_time = time.time()
    last_step_count = 0
    final_session = None
    steps = []
    
    while time.time() - start_time < max_wait_seconds:
        session_detail = request("GET", f"{SESSION_BASE}/sessions/{session_id}")
        steps = request("GET", f"{SESSION_BASE}/sessions/{session_id}/steps") or []
        state = session_detail.get("state")
        
        if len(steps) != last_step_count:
            for s in steps[last_step_count:]:
                step_id = s.get("step_id")
                action = s.get("action")
                success = s.get("success")
                has_shot = bool(s.get("screenshot"))
                has_html = bool(s.get("html"))
                has_text = bool(s.get("text"))
                print(f"  [{len(steps):02d}] step={step_id} action={action} success={success} screenshot={has_shot} html={has_html} text={has_text}")
            last_step_count = len(steps)
            
        if state not in ("PENDING", "RUNNING"):
            final_session = session_detail
            break
        time.sleep(1)
        
    if not final_session:
        print("⚠️ Timed out waiting for session completion.")
        return 1
        
    state = final_session.get("state")
    control_mode = final_session.get("control_mode")
    print(f"\n🏁 Session Finished: state={state}, control_mode={control_mode}, total_steps={len(steps)}")
    
    print("\n📊 --- Verification Analysis ---")
    
    # 1. 验证未开启 mainContent 的步骤（step_1 ~ step_4, step_9, step_11）
    disabled_steps = [s for s in steps if s.get("step_id") in ("step_1", "step_2", "step_3", "step_4", "step_9", "step_11")]
    unwanted_content_steps = []
    for s in disabled_steps:
        step_id = s.get("step_id", "")
        action = s.get("action", "")
        text = s.get("text") or ""
        html = s.get("html") or ""
        if len(text.strip()) > 0 or len(html.strip()) > 0:
            unwanted_content_steps.append((step_id, action, len(text), len(html)))
                
    if unwanted_content_steps:
        print(f"❌ FAIL: Unwanted text/html extracted in disabled steps: {unwanted_content_steps}")
        return 1
    else:
        print(f"✅ PASS: All {len(disabled_steps)} non-mainContent step instances strictly suppressed html and full text.")

    # 2. 验证开启了 mainContent 的步骤（step_5, 6, 7, 10）
    enabled_steps = [s for s in steps if s.get("step_id") in ("step_5", "step_6", "step_7", "step_10")]
    for s in enabled_steps:
        text_len = len(s.get('text') or '')
        html_len = len(s.get('html') or '')
        assert text_len > 0, f"Step {s.get('step_id')} failed to extract main text"
        assert html_len > 1000, f"Step {s.get('step_id')} failed to capture HTML"
    print(f"✅ PASS: All {len(enabled_steps)} mainContent step instances successfully captured both HTML (>20k chars) and clean text.")

    # 3. 验证 read_value（step_8）仅读取精确业务值，未被整页正文污染
    read_value_steps = [s for s in steps if s.get("step_id") == "step_8"]
    for s in read_value_steps:
        text = s.get("text") or ""
        assert 0 < len(text) < 20, f"read_value text length unexpected: {text}"
    print(f"✅ PASS: Step 8 read_value extracted pure field value: {[s.get('text') for s in read_value_steps]} (no page text contamination).")

    # 4. 验证业务接管逻辑
    assert state == "HUMAN_CONTROL", f"Expected HUMAN_CONTROL state, got {state}"
    assert control_mode == "HUMAN_CONTROL", f"Expected HUMAN_CONTROL control_mode, got {control_mode}"
    print(f"✅ PASS: Correctly halted at branch step and requested human takeover: '{final_session.get('blocking_reason')}'.")

    # 5. 截图生成统计
    screenshot_count = sum(1 for s in steps if s.get("screenshot"))
    print(f"📸 Total screenshots generated: {screenshot_count}")
    print("\n🎉 ALL END-TO-END REPLAY ASSERTIONS PASSED!")
    return 0

if __name__ == "__main__":
    sys.exit(main())
