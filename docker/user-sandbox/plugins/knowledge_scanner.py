#!/usr/bin/env python3
"""
DeepSeek Harness Plugin: Knowledge Space Scanner
Certified Administrator Plugin for Personal Sandbox
"""
import os
import sys
import json
from pathlib import Path

def scan_knowledge(knowledge_dir="/knowledge"):
    p = Path(knowledge_dir)
    if not p.exists():
        return {"total": 0, "files": []}
    files = []
    for item in p.glob("**/*"):
        if item.is_file() and not item.name.startswith("."):
            files.append({
                "name": item.name,
                "path": str(item.relative_to(p)),
                "size_bytes": item.stat().st_size
            })
    return {"total": len(files), "files": files}

if __name__ == "__main__":
    k_dir = sys.argv[1] if len(sys.argv) > 1 else "/knowledge"
    print(json.dumps(scan_knowledge(k_dir), ensure_ascii=False, indent=2))
