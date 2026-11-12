"""Bounded page-body retrieval from ranked search evidence."""
import concurrent.futures
import re
from typing import Optional


def enrich_search_context_with_pages(
    search_context: str,
    max_pages: int = 3,
    max_chars_per_page: int = 3_500,
    deadline: Optional[float] = None,
    *, fetch_page, check_deadline, is_enrichable_content_url,
) -> str:
    """Fetch a small, ranked set of result pages for grounded synthesis."""
    urls = []
    seen = set()
    for url in re.findall(r'https?://[^\s)\]>"`]+', search_context or ''):
        clean_url = url.rstrip('.,;')
        key = clean_url.rstrip('/').casefold()
        if key not in seen:
            seen.add(key)
            if is_enrichable_content_url(clean_url):
                urls.append(clean_url)

    is_harness = bool(re.search(r'(?:harness|deepseek|dsh)', (search_context or '').casefold()))

    def page_priority(url: str):
        normalized = url.rstrip('/').casefold()
        if is_harness:
            if normalized == 'https://github.com/deepseek-ai/deepseek-harness':
                return (0, normalized)
            if normalized.startswith('https://github.com/deepseek-ai/deepseek-harness/releases'):
                return (1, normalized)
            if 'awesome-' in normalized or 'plugin-registry' in normalized:
                return (2, normalized)
            if '/discussions/' in normalized or 'github.com/topics/' in normalized:
                return (5, normalized)
            return (3, normalized)
        # General query: prioritize official documentation, releases, and guides
        if re.search(r'quick.?start|install|deploy|getting.?started|setup', normalized):
            return (-1, normalized)
        if any(doc in normalized for doc in ('/docs', 'docs.', 'developer.', '/wiki', '/releases')):
            return (0, normalized)
        if '/discussions/' in normalized or 'github.com/topics/' in normalized or '/issues/' in normalized:
            return (5, normalized)
        if 'github.com' in normalized:
            return (1, normalized)
        return (2, normalized)

    selected = sorted(urls, key=page_priority)[:max(1, min(3, max_pages))]
    if not selected:
        return search_context

    executor = concurrent.futures.ThreadPoolExecutor(max_workers=len(selected))
    futures = {
        executor.submit(fetch_page, url, max_chars_per_page, deadline): url
        for url in selected
    }
    fetched = {}
    try:
        remaining = check_deadline(deadline, default_timeout=5.0)
        for future in concurrent.futures.as_completed(futures, timeout=remaining):
            url = futures[future]
            try:
                content = future.result()
                if content and not content.startswith(('未能获取', '【安全拦截】', '获取网页内容失败')):
                    fetched[url] = content[:max_chars_per_page]
            except Exception:
                continue
    except concurrent.futures.TimeoutError:
        pass
    finally:
        for future in futures:
            future.cancel()
        executor.shutdown(wait=False, cancel_futures=True)

    if not fetched:
        return search_context
    sections = [search_context.rstrip(), '', '【高价值页面正文抓取】']
    for index, url in enumerate(selected, 1):
        content = fetched.get(url)
        if content:
            sections.extend([f'\n--- 页面 {index}: {url} ---', content])
    return '\n'.join(sections).strip()
