"""Shared PDF text extraction, PUA cleanup, chunked hashing, and cache coordination.

Eliminates duplicate PDF parsing between preflight visual profiling (`pdfplumber`)
and full-document text extraction (`extract_pdf_text`), removes PUA icon glyphs,
and stores versioned extraction caches under `.dsh/cache/pdf_text` instead of
polluting the user workspace root with duplicate `.txt` copies.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import os
import re
import tempfile
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_CACHE_VERSION = "pdfplumber-layout-v2"
_PUA_RE = re.compile(r"[\ue000-\uf8ff]+")
_MAX_MEMORY_ENTRIES = 24
_LOCK = threading.RLock()

# Keyed by (resolved_path, size, mtime_ns)
_SAMPLED_PAGES_CACHE: "OrderedDict[Tuple[str, int, int], Dict[int, Dict[str, Any]]]" = OrderedDict()
_FULL_DOC_CACHE: "OrderedDict[Tuple[str, int, int], Dict[str, Any]]" = OrderedDict()


@contextlib.contextmanager
def quiet_pdfminer_logging():
    """Temporarily raises pdfminer logger threshold to suppress noisy FontBBox descriptor spam."""
    loggers = [logging.getLogger(name) for name in ("pdfminer", "pdfminer.pdffont", "pdfminer.pdfinterp")]
    prev_levels = [lg.level for lg in loggers]
    try:
        for lg in loggers:
            lg.setLevel(logging.ERROR)
        yield
    finally:
        for lg, prev in zip(loggers, prev_levels):
            lg.setLevel(prev)


def clean_pdf_text(text: str, preserve_layout: bool = False) -> str:
    """Strips Unicode PUA icon glyphs and collapses empty glyph-only lines."""
    if not text:
        return ""
    out_lines: List[str] = []
    for raw_line in text.splitlines():
        had_content = bool(raw_line.strip())
        cleaned_line = _PUA_RE.sub("", raw_line)
        cleaned_line = cleaned_line.rstrip() if preserve_layout else re.sub(r"[ \t]{2,}", " ", cleaned_line).strip()
        if cleaned_line.strip():
            out_lines.append(cleaned_line)
        elif not had_content and out_lines and out_lines[-1] != "":
            out_lines.append("")
    return "\n".join(out_lines).strip()


def sha256_file_chunked(path: Path, chunk_size: int = 1048576) -> str:
    """Computes SHA-256 of a file using bounded chunked I/O instead of full read_bytes()."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _file_sig(path: Path) -> Optional[Tuple[str, int, int]]:
    try:
        st = path.stat()
        return (str(path.resolve()), int(st.st_size), int(st.st_mtime_ns))
    except OSError:
        return None


def _lru_set(cache: OrderedDict, key: Tuple[str, int, int], value: Any) -> None:
    cache[key] = value
    cache.move_to_end(key)
    while len(cache) > _MAX_MEMORY_ENTRIES:
        cache.popitem(last=False)


def remember_sampled_page(path: Path, page_idx: int, raw_text: str, evidence=None) -> str:
    """Cleans and stores a sampled page's extracted text for reuse by extract_pdf_text."""
    cleaned = clean_pdf_text(raw_text)
    sig = _file_sig(path)
    if sig is not None:
        with _LOCK:
            page_map = _SAMPLED_PAGES_CACHE.get(sig)
            if page_map is None:
                page_map = {}
            page_map[int(page_idx)] = evidence or {
                'page': page_idx + 1, 'text': cleaned, 'native_text': cleaned,
                'status': 'unknown', 'layout': 'unknown', 'blocks': []}
            _lru_set(_SAMPLED_PAGES_CACHE, sig, page_map)
    return cleaned


def get_cached_sampled_pages(path: Path) -> Dict[int, Dict[str, Any]]:
    """Returns any already-extracted page texts cached for the current file signature."""
    sig = _file_sig(path)
    if sig is None:
        return {}
    with _LOCK:
        page_map = _SAMPLED_PAGES_CACHE.get(sig)
        if page_map is None:
            return {}
        _SAMPLED_PAGES_CACHE.move_to_end(sig)
        return dict(page_map)


def _get_disk_cache_dir() -> Path:
    try:
        from . import config as cfg
        ws_dir = getattr(cfg, "WORKSPACE_DIR", None) or os.environ.get("WORKSPACE") or "/workspace"
    except Exception:
        ws_dir = os.environ.get("WORKSPACE") or "/workspace"
    candidate = Path(ws_dir) / ".dsh" / "cache" / "pdf_text"
    try:
        candidate.mkdir(parents=True, exist_ok=True)
        return candidate
    except Exception:
        fallback = Path(tempfile.gettempdir()) / "dsh_pdf_cache"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback


def _disk_cache_path(sig: Tuple[str, int, int]) -> Path:
    resolved, size, mtime_ns = sig
    digest = hashlib.sha256(f"{resolved}|{size}|{mtime_ns}|{_CACHE_VERSION}".encode("utf-8")).hexdigest()[:24]
    return _get_disk_cache_dir() / f"{digest}.json"


def _load_disk_cache(sig: Tuple[str, int, int]) -> Optional[Dict[str, Any]]:
    try:
        cache_file = _disk_cache_path(sig)
        if not cache_file.exists():
            return None
        data = json.loads(cache_file.read_text(encoding="utf-8"))
        if (
            data.get("version") == _CACHE_VERSION
            and data.get("size") == sig[1]
            and data.get("mtime_ns") == sig[2]
            and isinstance(data.get("combined_text"), str)
            and isinstance(data.get('pages'), list)
            and len(data['pages']) == data.get('num_pages')
            and all(key in data for key in ('page_coverage_complete', 'unread_pages',
                    'visual_pages', 'layout_status', 'layout_pages', 'source_sha256'))
        ):
            return data
    except Exception:
        return None
    return None


def _save_disk_cache(sig: Tuple[str, int, int], payload: Dict[str, Any]) -> None:
    temporary = None
    try:
        cache_file = _disk_cache_path(sig)
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=cache_file.parent,
                                         prefix=cache_file.stem, suffix='.tmp', delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(payload, stream, ensure_ascii=False)
        os.replace(temporary, cache_file)
    except Exception:
        pass
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def get_cached_pdf_document(path):
    """Read full-document evidence without triggering PDF parsing."""
    sig = _file_sig(Path(path))
    if sig is None:
        return None
    with _LOCK:
        hit = _FULL_DOC_CACHE.get(sig)
        if hit is not None:
            _FULL_DOC_CACHE.move_to_end(sig)
            return hit
    hit = _load_disk_cache(sig)
    if hit is not None:
        with _LOCK:
            _lru_set(_FULL_DOC_CACHE, sig, hit)
    return hit


def _format_pages_text(cleaned_pages: list) -> str:
    pages_text: List[str] = []
    for i, page in enumerate(cleaned_pages):
        txt = page.get('text', '')
        status = page.get('status')
        if status == 'blank':
            txt = '[空白页：未检测到文字或图形]'
        elif status not in ('text', 'blank'):
            txt = f"[PDF页面未完整读取：{status}]\n" + txt
        bounds = f"[页面 bbox={page['bbox']}]\n" if page.get('bbox') and page.get('layout') != 'single_column' else ''
        pages_text.append(f"--- 第 {page.get('page', i + 1)} 页 ---\n{bounds}{txt}")
    return "\n\n".join(pages_text).strip()


def extract_pdf_document(p: Path, deadline=None) -> Dict[str, Any]:
    """Retain every physical page and recover failures per page, never per document."""
    sig = _file_sig(p)
    hit = get_cached_pdf_document(p)
    if hit is not None:
        return hit

    sampled_map = get_cached_sampled_pages(p)
    num_pages = 0
    pages = []
    extractor_used = "pdfplumber"

    try:
        import pdfplumber

        with quiet_pdfminer_logging():
            with pdfplumber.open(p) as document:
                num_pages = len(document.pages)
                from .pdf_page_layout import extract_page_evidence
                for idx, page in enumerate(document.pages):
                    if deadline is not None and time.monotonic() >= deadline:
                        raise TimeoutError('Task total execution deadline exceeded during PDF extraction')
                    try:
                        record = sampled_map.get(idx) or extract_page_evidence(page, idx + 1)
                        record = {**record, 'text': clean_pdf_text(record['text'],
                                  preserve_layout=record['layout'] == 'uncertain')}
                        pages.append(record)
                    except TimeoutError:
                        raise
                    except Exception as error:
                        pages.append({'page': idx + 1, 'text': '', 'status': 'error',
                                      'layout': 'unknown', 'error': type(error).__name__})
                    finally:
                        with contextlib.suppress(Exception):
                            page.close()
    except TimeoutError:
        raise
    except Exception:
        pass

    # pypdf only fills failed pages; successful native pages and their layout survive.
    if not pages or len(pages) != num_pages or any(page['status'] == 'error' for page in pages):
        try:
            import pypdf
            reader = pypdf.PdfReader(str(p))
            num_pages = len(reader.pages)
            if not pages:
                pages = [{'page': i + 1, 'text': '', 'status': 'error', 'layout': 'unknown'}
                         for i in range(num_pages)]
                extractor_used = 'pypdf'
            while len(pages) < num_pages:
                pages.append({'page': len(pages) + 1, 'text': '',
                              'status': 'error', 'layout': 'unknown'})
            for i, record in enumerate(pages):
                if record['status'] != 'error':
                    continue
                if deadline is not None and time.monotonic() >= deadline:
                    raise TimeoutError('Task total execution deadline exceeded during PDF fallback')
                try:
                    txt = clean_pdf_text(reader.pages[i].extract_text() or '')
                    if txt:
                        pages[i] = {'page': i + 1, 'text': txt, 'status': 'text',
                                    'layout': 'unknown', 'fallback': 'pypdf'}
                except Exception:
                    pass
        except TimeoutError:
            raise
        except Exception as e:
            if not pages:
                return {"error": str(e), "num_pages": 0, "has_images": False, "combined_text": "", "total_lines": 0}

    while len(pages) < num_pages:
        pages.append({'page': len(pages) + 1, 'text': '', 'status': 'error', 'layout': 'unknown'})
    combined_text = _format_pages_text(pages)
    total_lines = len(combined_text.splitlines()) if combined_text else 0
    result: Dict[str, Any] = {
        "version": _CACHE_VERSION,
        "extractor": extractor_used,
        "size": sig[1] if sig else 0,
        "mtime_ns": sig[2] if sig else 0,
        "source_sha256": sha256_file_chunked(p) if sig else None,
        "num_pages": num_pages,
        "has_images": any(page.get('image_coverage', 0) > 0 for page in pages),
        "combined_text": combined_text,
        "total_lines": total_lines,
        "pages": pages,
        "page_coverage_complete": bool(pages) and len(pages) == num_pages and all(
            page['status'] in ('text', 'blank') for page in pages),
        "unread_pages": [page['page'] for page in pages if page['status'] not in ('text', 'blank')],
        "visual_pages": [page['page'] for page in pages if page['status'] == 'needs_visual'],
        "layout_status": ('simple' if pages and all(page['layout'] == 'single_column' for page in pages)
                          else 'review_required'),
        "layout_pages": [page['page'] for page in pages if page['layout'] != 'single_column'],
    }
    if sig is not None and combined_text and not any(page['status'] == 'error' for page in pages):
        with _LOCK:
            _lru_set(_FULL_DOC_CACHE, sig, result)
        _save_disk_cache(sig, result)
    return result
