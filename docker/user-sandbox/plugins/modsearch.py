#!/usr/bin/env python3
"""
ModSearch Plugin - Powered by @liustack/modsearch with multi-engine failover
Usage: python3 modsearch.py <query_or_json>
"""
import sys
import json
import subprocess
import shutil
import urllib.request
import urllib.parse
import re

def run_modsearch_cli(query: str) -> str:
    if not shutil.which("modsearch"):
        return ""
    try:
        proc = subprocess.run(
            ["modsearch", "search", "-q", query, "--max-results", "6"],
            text=True,
            capture_output=True,
            timeout=20
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return proc.stdout.strip()
    except Exception:
        pass
    return ""

def fallback_search(query: str) -> str:
    # 针对微博热搜
    if re.search(r'(微博|weibo).*?(热搜|热点|榜|热门)', query, re.I):
        try:
            url = "https://weibo.com/ajax/side/hotSearch"
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Referer": "https://weibo.com"}
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                realtime = data.get("data", {}).get("realtime", [])
                results = ["【微博实时热搜榜最新排行】:"]
                for i, item in enumerate(realtime[:15]):
                    word = item.get("word", "")
                    num = item.get("num", 0)
                    tag = item.get("label_name", "") or item.get("icon_desc", "")
                    tag_str = f"[{tag}] " if tag else ""
                    results.append(f"{i+1}. {tag_str}{word} (热度值: {num})")
                if len(results) > 1:
                    return "\n".join(results)
        except Exception:
            pass

    # 针对 B站 (Bilibili) 实时热搜与综合热门榜单
    if re.search(r'(bilibili|b站|哔哩哔哩).*?(热点|热搜|热门|榜|新闻|排行榜)', query, re.I) or re.search(r'(热点|热搜|热门|榜).*?(bilibili|b站|哔哩哔哩)', query, re.I):
        try:
            results = ["【B站 (Bilibili) 实时热点与热门榜单】:"]
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Referer": "https://www.bilibili.com/"}
            
            # 1. 实时热搜词排行
            sq_url = "https://api.bilibili.com/x/web-interface/search/square?limit=15"
            try:
                with urllib.request.urlopen(urllib.request.Request(sq_url, headers=headers), timeout=6) as resp:
                    sq_data = json.loads(resp.read().decode("utf-8"))
                    trending = sq_data.get("data", {}).get("trending", {}).get("list", [])
                    if trending:
                        results.append("一、B站实时热搜词排行:")
                        for i, item in enumerate(trending[:10], 1):
                            results.append(f"{i}. {item.get('show_name') or item.get('keyword')}")
            except Exception:
                pass

            # 2. 全站综合热门视频排行
            pop_url = "https://api.bilibili.com/x/web-interface/popular?ps=10&pn=1"
            try:
                with urllib.request.urlopen(urllib.request.Request(pop_url, headers=headers), timeout=6) as resp:
                    pop_data = json.loads(resp.read().decode("utf-8"))
                    vlist = pop_data.get("data", {}).get("list", [])
                    if vlist:
                        results.append("\n二、B站全站热门视频:")
                        for i, v in enumerate(vlist[:8], 1):
                            title = v.get("title")
                            up = v.get("owner", {}).get("name")
                            views = v.get("stat", {}).get("view", 0)
                            results.append(f"{i}. 《{title}》 (UP主: {up}, 播放量: {views:,})")
            except Exception:
                pass

            if len(results) > 1:
                return "\n".join(results)
        except Exception:
            pass

    # 必应过滤搜索
    results = []
    discard_patterns = [
        r'windows.*?(帮助|支持|客户端)',
        r'无法正常浏览.*?浏览器版本过低',
        r'人机身份验证',
        r'enable cookies',
        r'captcha',
        r'microsoft support',
    ]

    try:
        url = f"https://www.bing.com/search?q={urllib.parse.quote(query)}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            html = response.read().decode("utf-8", errors="ignore")
            snippets = re.findall(r'<div class="b_caption">.*?<p[^>]*>(.*?)</p>', html, re.DOTALL)
            for s in snippets:
                clean_text = re.sub(r'<[^>]+>', '', s).strip()
                clean_text = clean_text.replace("&nbsp;", " ").replace("&#0183;", "·")
                if any(re.search(pat, clean_text, re.I) for pat in discard_patterns):
                    continue
                if len(clean_text) > 15:
                    results.append(clean_text)
    except Exception as e:
        results.append(f"(搜索连接反馈: {e})")

    if results:
        return "\n".join([f"[{i+1}] {r}" for i, r in enumerate(results[:6])])
    return ""

def search(query: str) -> str:
    clean_q = re.sub(r'^(搜索|查询|查找|帮我搜索|请搜索|查看|获取|search|find|lookup)\s*', '', query, flags=re.I).strip() or query
    # 优先调用 modsearch CLI
    res = run_modsearch_cli(clean_q)
    if res and not res.startswith("Error:"):
        return res
    # 降级到网络搜索备用源
    return fallback_search(clean_q)

if __name__ == "__main__":
    q = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "今日新闻"
    try:
        parsed = json.loads(q)
        if isinstance(parsed, dict):
            q = parsed.get("query") or parsed.get("q") or parsed.get("__search_query") or q
    except Exception:
        pass
    print(search(q))
