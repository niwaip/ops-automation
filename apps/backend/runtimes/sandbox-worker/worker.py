"""Compatibility entrypoint for sandbox-worker."""


import asyncio

from src.worker.runtime import main


if __name__ == '__main__':
    asyncio.run(main())
