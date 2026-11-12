"""Carry the tool reply budget into native extraction before coverage metadata is built."""
from contextlib import contextmanager
from contextvars import ContextVar
import math

_READ_BUDGET = ContextVar('native_read_budget', default=30000)


@contextmanager
def native_read_budget(max_chars):
    token = _READ_BUDGET.set(max(512, int(max_chars)))
    try:
        yield
    finally:
        _READ_BUDGET.reset(token)


def read_budget():
    return _READ_BUDGET.get()


def document_read_rounds(profiles, max_result_chars):
    estimated_chars = 0
    for profile in profiles:
        rows = profile.get('sampled_pages') or []
        if profile.get('reading_mode') == 'native_text' and rows:
            estimated_chars += sum(r['text_chars'] for r in rows) / len(rows) * profile['page_count']
    # Reserve space for pagination metadata and the final answer; cap long tasks.
    return min(12, max(3, math.ceil(estimated_chars / max(512, max_result_chars - 1000)) + 1))
