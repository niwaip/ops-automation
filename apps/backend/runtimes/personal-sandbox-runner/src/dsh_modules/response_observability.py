"""Content-free response fingerprints for diagnosing generation vs cleanup loss."""
from hashlib import sha256


def response_fingerprint(response):
    from .llm import clean_output

    raw = str(response.get("content") or "")
    cleaned = clean_output(raw)
    return {
        "rawChars": len(raw),
        "cleanChars": len(cleaned),
        "rawSha256": sha256(raw.encode("utf-8")).hexdigest(),
        "cleanSha256": sha256(cleaned.encode("utf-8")).hexdigest(),
        "finishReason": response.get("finish_reason") or "unknown",
        "finishReasonSource": response.get("finish_reason_source", "unknown"),
        "receivedDone": response.get("received_done"),
    }
