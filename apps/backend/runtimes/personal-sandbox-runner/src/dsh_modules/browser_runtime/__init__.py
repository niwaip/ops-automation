"""
Browser Runtime Package for DeepSeek Harness (dsh).
Exposes protocol types, drivers, session abstractions, and authentication vault.
"""

from .types import (
    BrowserActionType,
    BrowserAction,
    BrowserObservation,
    BrowserConfig,
    RenderResult
)
from .driver_interface import IBrowserDriver, IBrowserSession
from .auth_vault import AuthVault, default_auth_vault
from .playwright_driver import PlaywrightDriver
from .factory import get_browser_driver, set_browser_driver
from .html_markdown import html_to_clean_markdown

__all__ = [
    "BrowserActionType",
    "BrowserAction",
    "BrowserObservation",
    "BrowserConfig",
    "RenderResult",
    "IBrowserDriver",
    "IBrowserSession",
    "AuthVault",
    "default_auth_vault",
    "PlaywrightDriver",
    "get_browser_driver",
    "set_browser_driver",
    "html_to_clean_markdown",
]
