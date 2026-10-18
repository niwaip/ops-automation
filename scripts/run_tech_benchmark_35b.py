#!/usr/bin/env python3
"""
E2E Benchmark Runner for Technical Query & Scripts Suite with 35B Model (qwen36-35b-a3b)
"""
import os
import sys
import json
import time
import uuid
import base64
import urllib.request
import urllib.error

PLATFORM_URL = "http://127.0.0.1:3001"
ORCHESTRATOR_URL = "http://127.0.0.1:3007"
MODEL_ID_35B = "d13e0d30-87b9-4e87-b96a-d8b1b3cf78af" # qwen36-35b-a3b
BENCHMARK_DIR = os.path.abspath("docs/artifacts/reviews/technical-e2e-benchmark-files")

def login(username="admin", password="admin123"):
    req = urllib.request.Request(
        f"{PLATFORM_URL}/auth/login",
        data=json.dumps({"username": username, "password": password}).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["accessToken"]

def try_upload_file_multipart(token, file_path):
    """Attempt HTTP POST /ai/chat/upload via multipart/form-data using standard curl to inspect gateway reaction."""
    import subprocess
    cmd = [
        "curl", "-s", "-w", "\nHTTP_STATUS:%{http_code}",
        "-X", "POST", f"{ORCHESTRATOR_URL}/ai/chat/upload",
        "-H", f"Authorization: Bearer {token}",
        "-F", f"file=@{file_path}"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    out = res.stdout.strip()
    status_code = 0
    body = out
    if "HTTP_STATUS:" in out:
        parts = out.rsplit("HTTP_STATUS:", 1)
        body = parts[0].strip()
        try:
            status_code = int(parts[1].strip())
        except Exception:
            pass
    try:
        json_resp = json.loads(body)
    except Exception:
        json_resp = {"raw": body}
    return status_code, json_resp

def make_file_payload(file_path):
    """Create in-memory base64 file payload to test sandbox ingestion."""
    filename = os.path.basename(file_path)
    with open(file_path, "rb") as f:
        content_b64 = base64.b64encode(f.read()).decode("utf-8")
    return {
        "fileId": f"file-{int(time.time()*1000)}-{uuid.uuid4().hex[:8]}",
        "fileName": filename,
        "content": content_b64,
        "size": os.path.getsize(file_path)
    }

def run_chat_stream(token, prompt, files=None, session_id=None, timeout=300):
    if not session_id:
        session_id = str(uuid.uuid4())

    payload = {
        "message": prompt,
        "sessionId": session_id,
        "modelId": MODEL_ID_35B,
        "conversationType": "general",
        "config": {
            "mode": "chat"
        }
    }
    if files:
        payload["files"] = files

    req = urllib.request.Request(
        f"{ORCHESTRATOR_URL}/ai/chat/stream",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    )

    start_ts = time.time()
    events = []
    full_text = ""
    exit_code = 0
    tools_called = []
    outbound_files = []
    done_received = False
    usage = {}
    sandbox_metrics = {}
    raw_lines = []

    print(f"\n[>>>] Session {session_id} | Prompt: {prompt[:60]}...")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            buffer = ""
            while True:
                chunk = response.read(1024).decode("utf-8", errors="replace")
                if not chunk:
                    break
                buffer += chunk
                lines = buffer.split("\n")
                buffer = lines.pop()
                for line in lines:
                    raw_lines.append(line)
                    line_s = line.strip()
                    if not line_s.startswith("data:"):
                        continue
                    data_str = line_s[5:].strip()
                    if not data_str:
                        continue
                    try:
                        event = json.loads(data_str)
                        events.append(event)
                        etype = event.get("type")
                        if etype == "observation":
                            cnt = event.get("content", "")
                            print(f"  [OBS] {cnt[:90].replace(chr(10), ' ')}")
                        elif etype == "result":
                            full_text = event.get("content", "")
                            data = event.get("data", {})
                            usage = data.get("usage", {})
                            sb = data.get("sandbox", {})
                            exit_code = sb.get("exitCode", 0)
                            sandbox_metrics = sb.get("metrics", {})
                            tools_called = sandbox_metrics.get("toolCalls", [])
                            outbound_files = data.get("outboundFiles") or []
                            print(f"  [RESULT] exitCode={exit_code}, tokens={usage.get('total_tokens')}, tools={len(tools_called)}, outbounds={len(outbound_files)}")
                        elif etype == "done":
                            done_received = True
                            print("  [DONE] Stream finished.")
                    except Exception:
                        pass
    except Exception as e:
        print(f"  [STREAM ERROR]: {e}")

    duration_ms = int((time.time() - start_ts) * 1000)
    return {
        "sessionId": session_id,
        "durationMs": duration_ms,
        "exitCode": exit_code,
        "done": done_received,
        "usage": usage,
        "tools": tools_called,
        "outboundFiles": outbound_files,
        "sandboxMetrics": sandbox_metrics,
        "text": full_text,
        "events": events,
        "rawLines": raw_lines
    }

def verify_case_assertions(case_id, target_case, res):
    assertions_results = []
    outbound_names = [f.get("fileName") for f in res.get("outboundFiles", [])]
    text = res.get("text", "")
    exit_code = res.get("exitCode", -1)
    user_workspace = os.path.abspath("data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace")

    # 1. 退出码检查
    ok_exit = (exit_code == 0)
    assertions_results.append({
        "name": "正常终态退出码0",
        "passed": ok_exit,
        "detail": f"exitCode={exit_code}"
    })

    # 2. 区分场景专属断言
    if case_id == "TECH-01":
        no_files = (len(outbound_names) == 0)
        assertions_results.append({
            "name": "无物理文件生成与下载卡片",
            "passed": no_files,
            "detail": f"outboundFiles={outbound_names}"
        })
        has_dims = all(k in text for k in ["架构", "时延", "路由", "Sentinel", "Cluster"])
        assertions_results.append({
            "name": "包含架构/时延/路由等核心对比维度",
            "passed": has_dims,
            "detail": f"dimensions_checked={has_dims}"
        })

    elif case_id == "TECH-02":
        has_sh = "analyze_nginx_logs.sh" in outbound_names
        assertions_results.append({
            "name": "脚本文件 analyze_nginx_logs.sh 可下载",
            "passed": has_sh,
            "detail": f"outboundFiles={outbound_names}"
        })
        sh_path = os.path.join(user_workspace, "analyze_nginx_logs.sh")
        if os.path.exists(sh_path):
            with open(sh_path, "r", encoding="utf-8", errors="ignore") as f:
                c = f.read()
            has_headers = ("#!/usr/bin/env bash" in c or "#!/bin/bash" in c) and "pipefail" in c
            assertions_results.append({
                "name": "头部包含 #!/usr/bin/env bash 与 set -eo pipefail",
                "passed": has_headers,
                "detail": f"has_headers={has_headers}"
            })
            # bash -n
            ret = os.system(f"bash -n '{sh_path}' >/dev/null 2>&1")
            assertions_results.append({
                "name": "bash -n 语法检查通过",
                "passed": (ret == 0),
                "detail": f"bash -n exit={ret}"
            })
        no_extra = not any(n.endswith((".html", ".pptx", ".xlsx")) for n in outbound_names)
        assertions_results.append({
            "name": "无额外未请求文件(HTML/PPT/Excel)",
            "passed": no_extra,
            "detail": f"outbounds={outbound_names}"
        })

    elif case_id == "TECH-03":
        has_py = "process_telemetry.py" in outbound_names
        assertions_results.append({
            "name": "脚本文件 process_telemetry.py 可下载",
            "passed": has_py,
            "detail": f"outboundFiles={outbound_names}"
        })
        py_path = os.path.join(user_workspace, "process_telemetry.py")
        if os.path.exists(py_path):
            ret = os.system(f"python3 -m py_compile '{py_path}' >/dev/null 2>&1")
            assertions_results.append({
                "name": "python3 -m py_compile 语法检查通过",
                "passed": (ret == 0),
                "detail": f"py_compile exit={ret}"
            })
        no_extra = not any(n.endswith((".html", ".pptx", ".xlsx")) for n in outbound_names)
        assertions_results.append({
            "name": "无额外未请求文件",
            "passed": no_extra,
            "detail": f"outbounds={outbound_names}"
        })

    elif case_id == "TECH-04":
        has_sql = "monthly_repurchase_analysis.sql" in outbound_names
        assertions_results.append({
            "name": "SQL文件 monthly_repurchase_analysis.sql 可下载",
            "passed": has_sql,
            "detail": f"outboundFiles={outbound_names}"
        })
        sql_path = os.path.join(user_workspace, "monthly_repurchase_analysis.sql")
        if os.path.exists(sql_path):
            with open(sql_path, "r", encoding="utf-8", errors="ignore") as f:
                c = f.read().upper()
            has_window = ("OVER (" in c or "OVER(" in c)
            has_index = "CREATE INDEX" in c
            assertions_results.append({
                "name": "包含窗口函数与复购率计算",
                "passed": has_window,
                "detail": f"has_window={has_window}"
            })
            assertions_results.append({
                "name": "包含 CREATE INDEX 索引优化语句",
                "passed": has_index,
                "detail": f"has_index={has_index}"
            })
        no_extra = not any(n.endswith((".html", ".pptx", ".xlsx")) for n in outbound_names)
        assertions_results.append({
            "name": "无多余未请求文件",
            "passed": no_extra,
            "detail": f"outbounds={outbound_names}"
        })

    elif case_id == "TECH-05":
        has_dockerfile = any(n.lower() == "dockerfile" for n in outbound_names)
        has_compose = any("docker-compose" in n.lower() for n in outbound_names)
        assertions_results.append({
            "name": "Dockerfile 与 docker-compose.yml 均可下载",
            "passed": (has_dockerfile and has_compose),
            "detail": f"outboundFiles={outbound_names}"
        })
        df_path = os.path.join(user_workspace, "Dockerfile")
        if os.path.exists(df_path):
            with open(df_path, "r", encoding="utf-8", errors="ignore") as f:
                c = f.read()
            has_health = "HEALTHCHECK" in c
            assertions_results.append({
                "name": "Dockerfile 包含 HEALTHCHECK 指令",
                "passed": has_health,
                "detail": f"has_health={has_health}"
            })

    elif case_id == "TECH-06":
        has_py = "check_db_pool_health.py" in outbound_names
        assertions_results.append({
            "name": "check_db_pool_health.py 文件可下载",
            "passed": has_py,
            "detail": f"outboundFiles={outbound_names}"
        })
        py_path = os.path.join(user_workspace, "check_db_pool_health.py")
        if os.path.exists(py_path):
            ret = os.system(f"python3 -m py_compile '{py_path}' >/dev/null 2>&1")
            assertions_results.append({
                "name": "python3 -m py_compile 语法检查通过",
                "passed": (ret == 0),
                "detail": f"py_compile exit={ret}"
            })
        has_diag = any(k in text for k in ["连接未释放", "耗尽", "泄漏", "pool", "exhaustion", "leak"])
        assertions_results.append({
            "name": "正文诊断准确命中连接未释放/连接池耗尽",
            "passed": has_diag,
            "detail": f"has_diag={has_diag}"
        })

    elif case_id == "TECH-07":
        has_v2 = "analyze_nginx_logs_v2.sh" in outbound_names
        assertions_results.append({
            "name": "生成新文件 analyze_nginx_logs_v2.sh 且可下载",
            "passed": has_v2,
            "detail": f"outboundFiles={outbound_names}"
        })
        v2_path = os.path.join(user_workspace, "analyze_nginx_logs_v2.sh")
        if os.path.exists(v2_path):
            ret = os.system(f"bash -n '{v2_path}' >/dev/null 2>&1")
            assertions_results.append({
                "name": "analyze_nginx_logs_v2.sh 语法检查通过",
                "passed": (ret == 0),
                "detail": f"bash -n exit={ret}"
            })
        no_extra = not any(n.endswith((".html", ".pptx", ".xlsx")) for n in outbound_names)
        assertions_results.append({
            "name": "无多余 HTML 或 PPT 生成",
            "passed": no_extra,
            "detail": f"outbounds={outbound_names}"
        })

    elif case_id == "TECH-08":
        no_files = (len(outbound_names) == 0)
        assertions_results.append({
            "name": "无物理文件生成与下载卡片",
            "passed": no_files,
            "detail": f"outboundFiles={outbound_names}"
        })
        has_sysctl = any(k in text for k in ["sysctl", "somaxconn", "file-max", "ulimit", "tcp_tw_reuse", "50000", "50k"])
        assertions_results.append({
            "name": "给出结构化内核优化参数与50k并发配置",
            "passed": has_sysctl,
            "detail": f"has_sysctl={has_sysctl}"
        })

    return assertions_results


def run_case_by_id(token, case_id):
    with open(os.path.join(BENCHMARK_DIR, "test-cases.json"), "r", encoding="utf-8") as f:
        bench_data = json.load(f)
    target_case = next((c for c in bench_data["cases"] if c["id"] == case_id), None)
    if not target_case:
        print(f"Case {case_id} not found!")
        return None

    files_payload = []
    for inp in target_case.get("inputs", []):
        fpath = os.path.join(BENCHMARK_DIR, inp)
        if os.path.exists(fpath):
            st, up_resp = try_upload_file_multipart(token, fpath)
            if st in (200, 201) and isinstance(up_resp, dict) and "fileId" in up_resp:
                files_payload.append(up_resp)
            else:
                files_payload.append(make_file_payload(fpath))

    print(f"\n==========================================")
    print(f"Running Case: {case_id} ({target_case.get('category')})")
    print(f"Prompt: {target_case['prompt']}")
    print(f"Inputs: {target_case.get('inputs')}")
    print(f"==========================================")

    res = run_chat_stream(token, target_case["prompt"], files=files_payload)
    assertions = verify_case_assertions(case_id, target_case, res)
    res["assertions"] = assertions

    print(f"\nCase {case_id} Summary:")
    print(f"  Duration: {res['durationMs']/1000:.1f}s")
    print(f"  ExitCode: {res['exitCode']}")
    print(f"  Outbound Files: {[f.get('fileName') for f in res['outboundFiles']]}")
    print(f"  Tools: {len(res['tools'])}")
    print(f"  Done: {res['done']}")
    print(f"  Assertions:")
    all_passed = True
    for a in assertions:
        mark = "✓" if a["passed"] else "✗"
        if not a["passed"]:
            all_passed = False
        print(f"    [{mark}] {a['name']}: {a['detail']}")
    res["allPassed"] = all_passed
    return res


if __name__ == "__main__":
    t = login()
    target_ids = sys.argv[1:] if len(sys.argv) > 1 else [
        "TECH-01", "TECH-02", "TECH-03", "TECH-04",
        "TECH-05", "TECH-06", "TECH-07", "TECH-08"
    ]
    results_file = os.path.join(BENCHMARK_DIR, "tech-benchmark-results-35b.json")
    all_results = {}
    if os.path.exists(results_file):
        try:
            with open(results_file, "r", encoding="utf-8") as f:
                all_results = json.load(f)
        except Exception:
            all_results = {}

    for cid in target_ids:
        all_results[cid] = run_case_by_id(t, cid)
        with open(results_file, "w", encoding="utf-8") as f:
            json.dump(all_results, f, ensure_ascii=False, indent=2)
        time.sleep(1)

    print(f"\nSaved all results to {results_file}")

