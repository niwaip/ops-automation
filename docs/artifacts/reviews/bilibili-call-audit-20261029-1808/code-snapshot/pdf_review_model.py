"""Meter the established non-streaming image transport without changing its routing."""
import os
from .file_tools import inspect_image
from .telemetry import TelemetryStats, get_active_telemetry, set_active_telemetry


def inspect_pdf_image(image, prompt, deadline=None, model_events=None, model_name=None):
    previous = get_active_telemetry()
    local = TelemetryStats()
    target_model = model_name or os.environ.get("DSH_VISION_MODEL") or None
    try:
        return inspect_image(image, prompt, max_chars=2000, deadline=deadline,
                             model_name=target_model, max_tokens=350, telemetry=local,
                             purpose='pdf_page_review')
    finally:
        set_active_telemetry(previous)
        if model_events is not None:
            model_events.extend(local.calls_ledger)
