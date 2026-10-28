"""Legacy import compatibility; implicit metric execution has been retired.

Missing metrics are reported by AnalysisTurn.feedback and repaired through an
explicit model tool call. This module must never invoke a calculation engine.
"""


class RegisteredMetricCompletion:
    def complete(self, evidence, prompt, telemetry, allowed_names, deadline=None):
        return []
