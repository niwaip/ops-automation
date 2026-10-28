"""Legacy import compatibility for the retired implicit summary executor.

The agent loop returns missing execution evidence to the model. Neither a natural
language request nor missing output is compiled into an executable fallback here.
"""


def recover_summary(prompt, workspace_dir, deadline=None):
    return None


def export_recovered_summary(receipt, prompt, workspace_dir):
    return None


class SummaryRecovery:
    def __init__(self, prompt, workspace, deadline=None, enabled=True):
        pass

    def apply(self, evidence, telemetry, outbound_files):
        return False
