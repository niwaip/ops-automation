#!/usr/bin/env python3
"""
DeepSeek Harness Plugin: Web Search & Information Retrieval
Certified Administrator Plugin for Personal Sandbox
"""
import sys
import urllib.request
import urllib.parse
import json
import re

def search(query: str, max_results: int = 5):
    url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
    headers = {"User-Agent": "Mozilla/5.0 (compatible; DeepSeekHarnessPlugin/1.0)"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', html, re.DOTALL)
            results = [re.sub(r'<[^>]+>', '', s).strip() for s in snippets[:max_results]]
            return results
    except Exception as e:
        return [f"Search error: {e}"]

if __name__ == "__main__":
    q = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "deepseek news"
    res = search(q)
    print(json.dumps({"query": q, "results": res}, ensure_ascii=False, indent=2))
