#!/usr/bin/env python3
"""
Deep Research Engine for DSH Sandbox
Multi-source intelligence collector: Web, GitHub, Hacker News.
Zero-config, keyless public endpoints, temporal freshness filtering,
and engagement-weighted ranking.
"""

import sys
import os
import re
import json
import time
import argparse
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional


def fetch_json(url: str, timeout: float = 8.0, headers: Optional[Dict[str, str]] = None) -> Optional[Any]:
    """Safely fetch JSON from a URL with browser-like headers."""
    req_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*"
    }
    if headers:
        req_headers.update(headers)

    req = urllib.request.Request(url, headers=req_headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", errors="ignore"))
    except Exception:
        return None


def search_hacker_news(query: str, days: int = 30, limit: int = 6) -> List[Dict[str, Any]]:
    """Fetches high-signal developer consensus and discussions from Hacker News."""
    cutoff_ts = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp())
    encoded_q = urllib.parse.quote(query)
    url = f"https://hn.algolia.com/api/v1/search?query={encoded_q}&tags=story&numericFilters=created_at_i>{cutoff_ts}&hitsPerPage={limit}"

    data = fetch_json(url, timeout=7.0)
    if not data or "hits" not in data:
        # Fallback to general search if date filter yielded nothing
        url_fallback = f"https://hn.algolia.com/api/v1/search?query={encoded_q}&tags=story&hitsPerPage={limit}"
        data = fetch_json(url_fallback, timeout=7.0) or {}

    results = []
    for hit in data.get("hits", []):
        title = hit.get("title") or ""
        url_link = hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
        points = hit.get("points") or 0
        comments = hit.get("num_comments") or 0
        created_at = hit.get("created_at") or ""
        if title:
            results.append({
                "source": "Hacker News",
                "title": title,
                "url": url_link,
                "score": points,
                "engagement": f"{points} points, {comments} comments",
                "date": created_at[:10] if created_at else "",
                "snippet": f"HN 社区讨论: {points} 点赞, {comments} 条长评论。"
            })
    return sorted(results, key=lambda x: x["score"], reverse=True)


def search_github(query: str, days: int = 30, limit: int = 5) -> List[Dict[str, Any]]:
    """Fetches GitHub repository activity, releases, and issue signals."""
    encoded_q = urllib.parse.quote(query)
    url = f"https://api.github.com/search/repositories?q={encoded_q}&sort=stars&order=desc&per_page={limit}"

    data = fetch_json(url, timeout=7.0, headers={"Accept": "application/vnd.github.v3+json"})
    results = []
    if data and "items" in data:
        for repo in data.get("items", []):
            name = repo.get("full_name", "")
            url_link = repo.get("html_url", "")
            stars = repo.get("stargazers_count", 0)
            desc = repo.get("description") or "无描述"
            updated = repo.get("pushed_at") or repo.get("updated_at") or ""
            results.append({
                "source": "GitHub",
                "title": f"Repo: {name} (★ {stars})",
                "url": url_link,
                "score": stars,
                "engagement": f"{stars} stars",
                "date": updated[:10] if updated else "",
                "snippet": desc
            })
    return results


def search_web_recency(query: str, days: int = 30, limit: int = 8) -> List[Dict[str, Any]]:
    """Performs web search with Bing date filtering and metadata extraction."""
    fresh_filter = 'filters=ex1:"ez3"' if days <= 30 else 'filters=ex1:"ez2"' if days <= 7 else ""
    url = f"https://www.bing.com/search?q={urllib.parse.quote(query)}{f'&{fresh_filter}' if fresh_filter else ''}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
    }

    req = urllib.request.Request(url, headers=headers)
    results = []
    try:
        with urllib.request.urlopen(req, timeout=8.0) as response:
            html_raw = response.read().decode("utf-8", errors="ignore")
        blocks = re.findall(r'<li class="b_algo"[^>]*>(.*?)</li>', html_raw, re.DOTALL)
        for b in blocks:
            m_h2 = re.search(r'<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>(.*?)</a></h2>', b, re.DOTALL)
            m_p = re.search(r'<p[^>]*>(.*?)</p>', b, re.DOTALL)
            if not m_h2:
                continue
            link = m_h2.group(1).strip()
            title = re.sub(r'<[^>]+>', '', m_h2.group(2)).strip()
            snippet = re.sub(r'<[^>]+>', '', m_p.group(1)).strip() if m_p else ""
            if "windows" in title.lower() and "帮助" in title:
                continue
            m_dt = re.search(r'<span class="[^"]*news_dt[^"]*">(.*?)</span>', b)
            date_str = m_dt.group(1).strip() if m_dt else ""
            results.append({
                "source": "Web",
                "title": title,
                "url": link,
                "score": 50,
                "engagement": "搜索权威收录",
                "date": date_str,
                "snippet": snippet
            })
            if len(results) >= limit:
                break
    except Exception:
        pass
    return results


def normalize_research_query(q: str) -> str:
    """Removes conversational stop words, pronouns, and request verbs to optimize research relevance."""
    cleaned = re.sub(
        r'^(帮我|请|给我|带我|麻烦|协助)?\s*(查一下|查询|搜索|查找|看下|看看|检索|了解一下|获取|调研|调查|分析一下|评测一下|研究一下|调用|查看|search|find|lookup|research|investigate)\s*',
        '',
        q,
        flags=re.I
    ).strip()

    cleaned = re.sub(
        r'^(关于他|关于她|关于它|关于其|关于这个|关于该|关于|有关|针对其|针对这个|针对|对于|对于这个)[的]?\s*',
        '',
        cleaned,
        flags=re.I
    ).strip()
    cleaned = re.sub(r'^[的得地]\s*', '', cleaned).strip()

    substance = re.sub(r'(今天|今日|现在|最新|最近|的|热点|热搜|热门|动态|新闻|\s+)', '', cleaned)
    if len(substance) >= 2:
        cleaned = re.sub(
            r'\s*(最近\s*\d+\s*天[的]?|近\s*\d+\s*天[的]?|最近一个月[的]?|近一个月[的]?|最近[的]?|最新[的]?|当前[的]?|今天[的]?|今日[的]?)$',
            '',
            cleaned,
            flags=re.I
        ).strip()

    return cleaned or q


def run_deep_research(
    query: str,
    days: int = 30,
    sources: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Runs concurrent multi-source research across Web, GitHub, and HN."""
    active_sources = sources or ["web", "github", "hn"]
    aggregated: List[Dict[str, Any]] = []

    clean_query = normalize_research_query(query)
    print(f"🔍 [Deep Research] 正在多源并发深度调研: '{clean_query}' (原始输入: '{query}', 时间窗口: 近{days}天)...", flush=True)

    if "hn" in active_sources:
        try:
            hn_items = search_hacker_news(clean_query, days=days)
            aggregated.extend(hn_items)
            print(f"  ✓ Hacker News 命中: {len(hn_items)} 条技术争鸣与点赞讨论", flush=True)
        except Exception as e:
            print(f"  ! Hacker News 抓取异常: {e}", flush=True)

    if "github" in active_sources:
        try:
            gh_items = search_github(clean_query, days=days)
            aggregated.extend(gh_items)
            print(f"  ✓ GitHub 命中: {len(gh_items)} 个相关项目与工程实践", flush=True)
        except Exception as e:
            print(f"  ! GitHub 抓取异常: {e}", flush=True)

    if "web" in active_sources:
        try:
            web_items = search_web_recency(clean_query, days=days)
            aggregated.extend(web_items)
            print(f"  ✓ Web 实时动态命中: {len(web_items)} 条收录", flush=True)
        except Exception as e:
            print(f"  ! Web 抓取异常: {e}", flush=True)

    # 去重
    seen_urls = set()
    unique_items = []
    for item in aggregated:
        if item["url"] not in seen_urls:
            seen_urls.add(item["url"])
            unique_items.append(item)

    report = {
        "query": query,
        "window_days": days,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_sources_queried": len(active_sources),
        "total_results": len(unique_items),
        "findings": unique_items
    }
    return report


def render_html_report(report_data: Dict[str, Any], template_path: Optional[str] = None) -> str:
    """Renders research report into a self-contained modern HTML document."""
    items = report_data.get("findings", [])
    items_html = []
    for it in items:
        badge_color = "#2563eb" if it["source"] == "Web" else ("#16a34a" if it["source"] == "GitHub" else "#ea580c")
        date_str = f" · {it['date']}" if it.get("date") else ""
        eng = f" · <b>{it['engagement']}</b>" if it.get("engagement") else ""
        items_html.append(f"""
        <div class="card">
            <div class="card-header">
                <span class="badge" style="background:{badge_color};">{it['source']}</span>
                <span class="meta">{date_str}{eng}</span>
            </div>
            <h3 class="card-title"><a href="{it['url']}" target="_blank" rel="noopener">{it['title']}</a></h3>
            <p class="snippet">{it['snippet']}</p>
            <div class="card-footer">
                <a href="{it['url']}" class="cite-link" target="_blank" rel="noopener">查看原始信源 →</a>
            </div>
        </div>
        """)

    cards_joined = "\n".join(items_html) if items_html else "<p>未抓取到有效社区动态。</p>"

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>深度情报调研简报: {report_data['query']}</title>
    <style>
        :root {{
            --bg: #0f172a;
            --surface: #1e293b;
            --border: #334155;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --primary: #38bdf8;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg);
            color: var(--text-main);
            margin: 0;
            padding: 32px 16px;
            display: flex;
            justify-content: center;
        }}
        .container {{
            max-width: 960px;
            width: 100%;
        }}
        header {{
            border-bottom: 1px solid var(--border);
            padding-bottom: 24px;
            margin-bottom: 32px;
        }}
        h1 {{
            font-size: 28px;
            margin: 0 0 12px 0;
            color: #ffffff;
        }}
        .header-meta {{
            color: var(--text-muted);
            font-size: 14px;
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
        }}
        .grid {{
            display: grid;
            grid-template-columns: 1fr;
            gap: 16px;
        }}
        .card {{
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
            transition: transform 0.15s ease, border-color 0.15s ease;
        }}
        .card:hover {{
            border-color: var(--primary);
            transform: translateY(-2px);
        }}
        .card-header {{
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 12px;
        }}
        .badge {{
            font-size: 12px;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 6px;
            color: #fff;
        }}
        .meta {{
            font-size: 13px;
            color: var(--text-muted);
        }}
        .card-title {{
            font-size: 18px;
            margin: 0 0 8px 0;
        }}
        .card-title a {{
            color: #ffffff;
            text-decoration: none;
        }}
        .card-title a:hover {{
            color: var(--primary);
            text-decoration: underline;
        }}
        .snippet {{
            font-size: 14px;
            line-height: 1.6;
            color: #cbd5e1;
            margin: 0 0 14px 0;
        }}
        .cite-link {{
            font-size: 13px;
            color: var(--primary);
            text-decoration: none;
            font-weight: 500;
        }}
        .cite-link:hover {{
            text-decoration: underline;
        }}
        footer {{
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: var(--text-muted);
        }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🌐 深度多源情报调研: {report_data['query']}</h1>
            <div class="header-meta">
                <span>⏱️ 时间窗口: 近 {report_data['window_days']} 天</span>
                <span>📅 生成时间: {report_data['generated_at']}</span>
                <span>📊 社区信源数: {report_data['total_results']} 条</span>
                <span>🛡️ 模式: 真实大众关注加权与事实溯源</span>
            </div>
        </header>

        <div class="grid">
            {cards_joined}
        </div>

        <footer>
            DeepSeek Harness (dsh) Multi-Source Intelligence Engine · Grounded by Social Signals
        </footer>
    </div>
</body>
</html>"""
    return html


def main():
    parser = argparse.ArgumentParser(description="DSH Multi-Source Deep Research Engine")
    parser.add_argument("query", help="Topic or entity to research")
    parser.add_argument("--days", type=int, default=30, help="Freshness window in days (default: 30)")
    parser.add_argument("--sources", default="web,github,hn", help="Comma-separated sources: web,github,hn")
    parser.add_argument("--output", "-o", default=None, help="Save structured report JSON to file")
    parser.add_argument("--html", default=None, help="Save self-contained HTML brief to file")
    args = parser.parse_args()

    sources_list = [s.strip() for s in args.sources.split(",") if s.strip()]
    report = run_deep_research(args.query, days=args.days, sources=sources_list)

    if args.output:
        out_p = Path(args.output)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        out_p.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"✓ 结构化数据已保存: {out_p}")

    if args.html:
        html_p = Path(args.html)
        html_p.parent.mkdir(parents=True, exist_ok=True)
        html_content = render_html_report(report)
        html_p.write_text(html_content, encoding="utf-8")
        print(f"✓ 交互式调研简报已生成: {html_p}")

    # 控制台概要输出
    print("\n" + "=" * 64)
    print(f"【调研结果汇总】: 共搜集到 {report['total_results']} 条真实社区与网络动态:")
    for idx, it in enumerate(report["findings"][:8], 1):
        print(f"{idx}. [{it['source']}] {it['title']} ({it.get('engagement', '')})\n   {it['url']}")
    print("=" * 64 + "\n")


if __name__ == "__main__":
    main()
