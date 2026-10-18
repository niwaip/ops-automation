#!/usr/bin/env python3
"""
E2E Benchmark Runner with 35B Model (qwen36-35b-a3b)
"""
import os
import sys
import json
import time
import uuid
import requests

PLATFORM_URL = "http://127.0.0.1:3001"
ORCHESTRATOR_URL = "http://127.0.0.1:3007"
MODEL_ID_35B = "d13e0d30-87b9-4e87-b96a-d8b1b3cf78af" # qwen36-35b-a3b

def login(username="admin", password="admin123"):
    res = requests.post(
        f"{PLATFORM_URL}/auth/login",
        json={"username": username, "password": password},
        timeout=10
    )
    res.raise_for_status()
    data = res.json()
    return data["accessToken"]

def upload_file(token, file_path):
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    filename = os.path.basename(file_path)
    with open(file_path, "rb") as f:
        files = {"file": (filename, f, "application/octet-stream")}
        res = requests.post(
            f"{ORCHESTRATOR_URL}/ai/chat/upload",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            timeout=30
        )
    res.raise_for_status()
    return res.json()

def run_chat_case(token, prompt, files=None, session_id=None, timeout=300):
    if not session_id:
        session_id = str(uuid.uuid4())
    
    payload = {
        "message": prompt,
        "sessionId": session_id,
        "modelId": MODEL_ID_35B,
        "conversationType": "general"
    }
    if files:
        payload["files"] = files

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    start_time = time.time()
    events = []
    full_text = ""
    exit_code = 0
    tools_called = []
    done_received = False
    usage = {}

    print(f"\n[>>>] Starting session {session_id} with prompt: {prompt[:60]}...")
    with requests.post(
        f"{ORCHESTRATOR_URL}/ai/chat",
        headers=headers,
        json=payload,
        stream=True,
        timeout=timeout
    ) as response:
        response.raise_for_status()
        buffer = ""
        for chunk in response.iter_content(chunk_size=1024, decode_unicode=True):
            if not chunk:
                continue
            buffer += chunk
            lines = buffer.split("\n")
            buffer = lines.pop() # keep uncompleted line
            for line in lines:
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                data_str = line[5:].strip()
                if not data_str:
                    continue
                try:
                    event = json.loads(data_str)
                    events.append(event)
                    event_type = event.get("type")
                    if event_type == "observation":
                        content = event.get("content", "")
                        print(f"  [OBS] {content[:100].replace(chr(10), ' ')}")
                    elif event_type == "thought":
                        content = event.get("content", "")
                        print(f"  [THOUGHT] {content[:80].replace(chr(10), ' ')}")
                    elif event_type == "result":
                        content = event.get("content", "")
                        data = event.get("data", {})
                        usage = data.get("usage", {})
                        sandbox_info = data.get("sandbox", {})
                        exit_code = sandbox_info.get("exitCode", 0)
                        metrics = sandbox_info.get("metrics", {})
                        tools_called = metrics.get("toolCalls", [])
                        full_text = content
                        print(f"  [RESULT] tokens={usage}, exitCode={exit_code}, toolsCount={len(tools_called)}")
                    elif event_type == "done":
                        done_received = True
                        print("  [DONE] Stream completed.")
                except Exception as e:
                    pass

    duration_ms = int((time.time() - start_time) * 1000)
    return {
        "sessionId": session_id,
        "durationMs": duration_ms,
        "exitCode": exit_code,
        "done": done_received,
        "usage": usage,
        "tools": tools_called,
        "text": full_text,
        "events": events
    }

if __name__ == "__main__":
    t = login()
    print("Logged in successfully. Token length:", len(t))
