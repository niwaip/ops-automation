"""Meter the established non-streaming image transport without changing its routing."""
import os
import re
import time
from .file_tools import inspect_image
from .telemetry import TelemetryStats, get_active_telemetry, set_active_telemetry


def inspect_pdf_image(image, prompt, deadline=None, model_events=None, model_name=None):
    previous = get_active_telemetry()
    local = TelemetryStats()
    target_model = model_name or os.environ.get("DSH_VISION_MODEL") or 'vision'
    try:
        last_error = None
        for attempt in range(2):
            if deadline is not None and time.monotonic() >= deadline:
                break
            attempt_deadline = min(deadline if deadline is not None else float('inf'), time.monotonic() + 20)
            try:
                analysis = inspect_image(image, prompt, max_chars=3000, deadline=attempt_deadline,
                    model_name=target_model, max_tokens=1200, telemetry=local, purpose='pdf_page_review')
                require_review_response(analysis)
                return analysis
            except (PDFReviewUnavailable, TimeoutError) as error:
                last_error = error
                if attempt == 0:
                    print('🔎 [PDF 验收] 视觉服务响应异常，原页面有限重试；保留正文和分页', flush=True)
        raise PDFReviewUnavailable('视觉服务未完成有效审阅；停止正文重写。原因：' + str(last_error or '验收预算耗尽'))
    finally:
        set_active_telemetry(previous)
        if model_events is not None:
            model_events.extend(local.calls_ledger)


class PDFReviewUnavailable(RuntimeError):
    """Transport/protocol failure; editing document content cannot repair it."""


def require_review_response(analysis):
    if not isinstance(analysis, str) or not analysis.startswith('【文档/图片'):
        raise PDFReviewUnavailable(str(analysis)[:2000])
    if not re.search(r'(?m)^\s*(?:\*\*)?(PASS|FAIL|REPAIR)\b', analysis):
        raise PDFReviewUnavailable('页面审阅协议无效（缺少 PASS/REPAIR/FAIL）；不可据此重写正文。')
