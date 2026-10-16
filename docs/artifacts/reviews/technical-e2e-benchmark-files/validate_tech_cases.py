#!/usr/bin/env python3
"""
验证技术类基准测试集配置与合成附件的完整性
"""
import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CASES_FILE = os.path.join(BASE_DIR, "test-cases.json")

def validate():
    if not os.path.exists(CASES_FILE):
        print(f"[-] Missing cases file: {CASES_FILE}")
        sys.exit(1)

    with open(CASES_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    cases = data.get("cases", [])
    print(f"[+] Loaded {len(cases)} technical test cases from {CASES_FILE}")

    missing_inputs = []
    for c in cases:
        cid = c["id"]
        category = c.get("category", "")
        inputs = c.get("inputs", [])
        prompt = c.get("prompt", "")
        assertions = c.get("assertions", [])

        print(f"  - Case {cid} [{category}]: {len(inputs)} inputs, {len(assertions)} assertions")
        for inp in inputs:
            inp_path = os.path.join(BASE_DIR, inp)
            if not os.path.exists(inp_path) and not inp.endswith(".sh"): # .sh might be generated from prior turn
                missing_inputs.append((cid, inp, inp_path))

    if missing_inputs:
        print(f"[-] Missing input files: {missing_inputs}")
        sys.exit(1)

    print("[+] All static input files verified successfully.")

if __name__ == "__main__":
    validate()
