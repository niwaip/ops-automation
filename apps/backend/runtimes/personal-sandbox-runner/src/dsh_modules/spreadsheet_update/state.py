"""
State machine, transaction isolation, and idempotency management for spreadsheet updates.
Manages isolated run directories in .dsh/spreadsheet-runs/<run_id>/ and enforces
the canonical state progression:
discovered -> planned -> prechecked -> applied -> recalculated -> validated -> published.
"""

from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Dict, Any, List, Optional
import os
import json
import time
import uuid
import hashlib
import shutil

from .schema import EXECUTION_STATUSES
from .contract import SpreadsheetUpdateReceipt

STATE_PROGRESSION: List[str] = [
    "discovered",
    "planned",
    "prechecked",
    "applied",
    "recalculated",
    "validated",
    "published",
]


def compute_idempotency_key(
    user_id: str,
    target_hash: str,
    contract_hash: str,
    plan_hash: str,
    as_of: str
) -> str:
    """Computes SHA-256 idempotency key across deterministic inputs."""
    raw = f"{user_id}:{target_hash}:{contract_hash}:{plan_hash}:{as_of}"
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


@dataclass
class UpdateRunState:
    run_id: str
    status: str  # One of EXECUTION_STATUSES
    user_id: str
    target_path: str
    target_hash: str
    plan_id: Optional[str] = None
    plan_hash: Optional[str] = None
    candidate_path: Optional[str] = None
    candidate_hash: Optional[str] = None
    published_path: Optional[str] = None
    published_hash: Optional[str] = None
    idempotency_key: Optional[str] = None
    phase_history: List[Dict[str, Any]] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class UpdateRunManager:
    """Manages transactional file isolation and state transitions for a single update run."""

    def __init__(self, run_id: Optional[str] = None, base_dir: Optional[Path] = None):
        self.run_id = run_id or f"run_{uuid.uuid4().hex[:12]}"
        if base_dir:
            self.runs_root = Path(base_dir).resolve()
        else:
            from ..config import WORKSPACE_DIR
            self.runs_root = Path(os.environ.get('WORKSPACE_DIR') or WORKSPACE_DIR).resolve() / '.dsh' / 'spreadsheet-runs'

        self.run_dir = self.runs_root / self.run_id
        self.run_dir.mkdir(parents=True, exist_ok=True)
        self.state_file = self.run_dir / "state.json"
        self.lock_file = self.run_dir / "run.lock"

    def acquire_lock(self, timeout: float = 5.0) -> bool:
        """Acquires a simple file lock for run atomicity."""
        start = time.time()
        while time.time() - start < timeout:
            try:
                # O_CREAT | O_EXCL provides atomic creation
                fd = os.open(str(self.lock_file), os.O_CREAT | os.O_EXCL | os.O_RDWR)
                os.write(fd, f"{os.getpid()}:{time.time()}".encode("utf-8"))
                os.close(fd)
                return True
            except FileExistsError:
                time.sleep(0.1)
        return False

    def release_lock(self):
        """Releases run lock."""
        self.lock_file.unlink(missing_ok=True)

    def initialize_run(
        self,
        user_id: str,
        target_file: Path,
        idempotency_key: Optional[str] = None
    ) -> UpdateRunState:
        """Takes an immutable snapshot of target file and initializes state."""
        target_p = Path(target_file).resolve()
        if not target_p.exists():
            raise FileNotFoundError(f"Target file {target_p} does not exist.")

        target_bytes = target_p.read_bytes()
        target_hash = hashlib.sha256(target_bytes).hexdigest()

        # Copy original to snapshot inside run_dir
        snapshot_file = self.run_dir / f"snapshot_{target_p.name}"
        shutil.copy2(str(target_p), str(snapshot_file))

        state = UpdateRunState(
            run_id=self.run_id,
            status="discovered",
            user_id=user_id,
            target_path=str(snapshot_file),
            target_hash=target_hash,
            idempotency_key=idempotency_key,
            phase_history=[{"status": "discovered", "timestamp": time.time()}]
        )
        self.save_state(state)
        return state

    def save_state(self, state: UpdateRunState):
        """Persists state to state.json atomically."""
        state.updated_at = time.time()
        tmp_file = self.run_dir / "state.json.tmp"
        tmp_file.write_text(json.dumps(state.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8")
        tmp_file.replace(self.state_file)

    def load_state(self) -> Optional[UpdateRunState]:
        """Loads state from state.json if present."""
        if not self.state_file.exists():
            return None
        data = json.loads(self.state_file.read_text(encoding="utf-8"))
        return UpdateRunState(**data)

    def transition_to(self, new_status: str, details: Optional[Dict[str, Any]] = None) -> UpdateRunState:
        """Transitions to next status with validation against allowed statuses."""
        if new_status not in EXECUTION_STATUSES:
            raise ValueError(f"Unknown execution status: {new_status}")

        state = self.load_state()
        if not state:
            raise RuntimeError(f"Cannot transition uninitialized run {self.run_id}")

        history_item = {"status": new_status, "timestamp": time.time()}
        if details:
            history_item["details"] = details
            if "plan_id" in details and details["plan_id"]:
                state.plan_id = details["plan_id"]
            if "plan_hash" in details and details["plan_hash"]:
                state.plan_hash = details["plan_hash"]
            if "candidate_path" in details and details["candidate_path"]:
                state.candidate_path = details["candidate_path"]
            if "candidate_hash" in details and details["candidate_hash"]:
                state.candidate_hash = details["candidate_hash"]
            if "published_path" in details and details["published_path"]:
                state.published_path = details["published_path"]
            if "published_hash" in details and details["published_hash"]:
                state.published_hash = details["published_hash"]
            if "error" in details and details["error"]:
                state.errors.append(str(details["error"]))
            if "errors" in details and isinstance(details["errors"], list):
                state.errors.extend([str(e) for e in details["errors"]])

        state.status = new_status
        state.phase_history.append(history_item)
        self.save_state(state)
        return state
