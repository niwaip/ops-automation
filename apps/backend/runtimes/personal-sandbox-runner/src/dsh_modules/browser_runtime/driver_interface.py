"""
Abstract Interface for Browser Runtime Drivers and Interactive Sessions.
Decouples upper-level tools and agents (fetch_page, browser-use)
from underlying browser engines (Playwright, CDP, headless shell).
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from .types import BrowserAction, BrowserObservation, BrowserConfig, RenderResult


class IBrowserSession(ABC):
    """
    Interactive Stateful Browser Session Contract.
    Used by interactive browser skills (such as future browser-use)
    to execute continuous action sequences within a single task scope.
    """

    @abstractmethod
    def step(self, action: BrowserAction) -> BrowserObservation:
        """Executes a single browser action (click, type, navigate, etc.)"""
        pass

    @abstractmethod
    def get_state(self) -> BrowserObservation:
        """Captures current page observation (DOM, URL, Title, Screenshot)"""
        pass

    @abstractmethod
    def close(self) -> None:
        """Terminates session and cleans up context/page resources"""
        pass


class IBrowserDriver(ABC):
    """
    Browser Runtime Driver Contract.
    Provides dual-mode lifecycle:
    - Mode 1: render_page_stateless (one-shot read-only rendering, immediate destruction)
    - Mode 2: create_session (task-scoped interactive session with lifecycle management)
    """

    @abstractmethod
    def is_available(self) -> bool:
        """Checks if browser binaries and runtime dependencies are available in the sandbox"""
        pass

    @abstractmethod
    def render_page_stateless(
        self,
        url: str,
        timeout_budget: float = 12.0,
        auth_state: Optional[Dict[str, Any]] = None,
        config: Optional[BrowserConfig] = None
    ) -> RenderResult:
        """
        One-shot read-only rendering.
        Launches temporary context -> handles SSRF routing -> waits for DOM -> extracts content -> closes.
        Zero residual background daemon.
        """
        pass

    @abstractmethod
    def create_session(
        self,
        session_id: str,
        config: Optional[BrowserConfig] = None
    ) -> IBrowserSession:
        """
        Creates a stateful browser session for continuous interaction.
        Lifecycle is bound to the calling task or explicit close.
        """
        pass
