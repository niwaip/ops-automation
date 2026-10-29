"""Local template-based PDF production. No network service or MCP dependency."""

from .renderer import render_report

__all__ = ['render_report']
