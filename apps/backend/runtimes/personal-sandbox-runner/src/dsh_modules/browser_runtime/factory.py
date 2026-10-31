"""
Factory and Singleton registry for sandbox browser runtime.
"""

from typing import Optional
from .driver_interface import IBrowserDriver
from .playwright_driver import PlaywrightDriver

_driver_instance: Optional[IBrowserDriver] = None


def get_browser_driver() -> IBrowserDriver:
    """Returns singleton browser driver implementation"""
    global _driver_instance
    if _driver_instance is None:
        _driver_instance = PlaywrightDriver()
    return _driver_instance


def set_browser_driver(driver: IBrowserDriver) -> None:
    """Allows injecting custom/mock browser driver for testing or alternate implementations"""
    global _driver_instance
    _driver_instance = driver
