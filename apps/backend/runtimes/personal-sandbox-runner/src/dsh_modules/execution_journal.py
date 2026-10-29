"""Append-only run events survive a killed runner; never label checkpoints as verified delivery."""

import json
import logging
import os
from pathlib import Path
import time
import uuid


class ExecutionJournal:
    def __init__(self, history_file):
        self.path = None
        if history_file:
            history = Path(history_file)
            self.path = history.with_suffix('.events') / (uuid.uuid4().hex + '.jsonl')
            self.append('started', {'session_id': history.stem})

    def append(self, event, data):
        # Runtime-owned checkpoints renew the broker lease; arbitrary logs do not.
        if (event == "model_completed" and data.get("call_id")) or (event == "tool_completed" and data.get("status") == "success"):
            print("<<<DSH_PROGRESS>>>", flush=True)
        if self.path is None:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            line = json.dumps({'timestamp_ns': time.time_ns(), 'event': event, 'data': data},
                              ensure_ascii=False, default=str) + '\n'
            fd = os.open(self.path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            with os.fdopen(fd, 'w', encoding='utf-8') as handle:
                handle.write(line)
                handle.flush()
        except (OSError, ValueError, TypeError):
            logging.getLogger(__name__).warning('Execution checkpoint could not be saved', exc_info=True)
