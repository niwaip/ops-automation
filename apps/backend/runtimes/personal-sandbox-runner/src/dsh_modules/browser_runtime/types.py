"""
Browser Runtime Protocol and Data Contracts for DeepSeek Harness (dsh).
Aligns with future interactive browser automation (e.g. browser-use)
while providing lightweight stateless rendering for read-only web retrieval.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, Any, List


class BrowserActionType(str, Enum):
    GOTO = "goto"
    CLICK = "click"
    TYPE = "type"
    SCROLL = "scroll"
    WAIT = "wait"
    SCREENSHOT = "screenshot"
    EXTRACT_CONTENT = "extract_content"


@dataclass
class BrowserAction:
    action_type: BrowserActionType
    params: Dict[str, Any] = field(default_factory=dict)
    description: Optional[str] = None


@dataclass
class BrowserObservation:
    url: str
    title: str = ""
    dom_content: Optional[str] = None
    text_content: Optional[str] = None
    screenshot_path: Optional[str] = None
    cookies: Optional[List[Dict[str, Any]]] = None
    is_interactive: bool = True
    error: Optional[str] = None


@dataclass
class BrowserConfig:
    headless: bool = True
    timeout_ms: int = 15000
    user_agent: Optional[str] = None
    viewport_width: int = 1280
    viewport_height: int = 800
    storage_state_path: Optional[str] = None
    auth_domain: Optional[str] = None


@dataclass
class RenderResult:
    success: bool
    outcome: str = "unknown"
    url: str = ""
    title: str = ""
    content_md: str = ""
    raw_html: str = ""
    error_message: Optional[str] = None
    latency_ms: float = 0.0
    backend: str = "playwright"
    is_authenticated: bool = False
