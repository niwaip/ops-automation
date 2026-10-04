import { buildBrowserOperationReportLines } from './temporal-workflow-browser-operation-report-code.helpers';

/** Sandbox invocations are separate processes: preserve browser state across takeover runs. */
export function buildBrowserCheckpointResultLines(): string[] {
  return [
    '    async def run(self, params: dict) -> Dict[str, Any]:',
    '        envelope = await self._run_browser(params)',
    '        context = self._checkpoint_context',
    '        variables = {k: v for k, v in context.items() if k not in ("username", "userId", "executionId", "runtimeSessionId", "backend") and not any(secret in k.lower() for secret in ("password", "credential", "secret", "token"))}',
    '        envelope["variables"] = variables',
    '        envelope["phaseResults"] = self._checkpoint_phases',
    '        envelope.update({k: v for k, v in variables.items() if k.endswith("_clean_content")})',
    '        envelope["artifacts"] = [artifact for phase in self._checkpoint_phases for artifact in ((phase.get("result") or {}).get("artifacts") or [])]',
    '        envelope["operationReportContext"] = self._build_operation_report_context(envelope, params)',
    '        return {',
    '            **envelope,',
    '            "execution": envelope["execution"],',
    '            "trigger": envelope["trigger"],',
    '            "result": envelope["result"],',
    '            "artifacts": envelope["artifacts"],',
    '            "presentation": envelope["presentation"],',
    '        }',
    '',
    ...buildBrowserOperationReportLines(),
  ];
}

export function buildBrowserCheckpointRestoreLines(stepIds: string[]): string[] {
  return [
    '        checkpoint = normalized_params.get("__browserCheckpoint") or {}',
    '        if not isinstance(checkpoint, dict):',
    '            raise ApplicationError("浏览器恢复检查点格式错误", non_retryable=True)',
    '        resume_step_id = str(checkpoint.get("resumeFromStepId") or "").strip()',
    `        valid_step_ids = ${JSON.stringify(stepIds)}`,
    '        if resume_step_id and resume_step_id not in valid_step_ids:',
    '            raise ApplicationError(f"未知浏览器恢复步骤: {resume_step_id}", non_retryable=True)',
    '        resume_pending = bool(resume_step_id)',
    '        if resume_pending:',
    '            workflow_context.update(checkpoint.get("variables") or {})',
    '            phase_results.extend(checkpoint.get("previousPhaseResults") or [])',
    '            for historical_phase in reversed(phase_results):',
    '                historical_result = historical_phase.get("result") or {}',
    '                if historical_result.get("requiresTakeover") or historical_result.get("status") in ("waiting", "takeover_required"):',
    '                    historical_result["humanResolution"] = {',
    '                        "type": checkpoint.get("recoveryType"),',
    '                        "reason": historical_result.get("takeoverReason") or historical_result.get("errorMessage"),',
    '                        "note": checkpoint.get("resolutionNote"),',
    '                        "resolvedBy": checkpoint.get("resolvedBy"),',
    '                        "resolvedAt": checkpoint.get("resolvedAt"),',
    '                        "takeoverId": checkpoint.get("takeoverId"),',
    '                        "resumeFromStepId": resume_step_id,',
    '                    }',
    '                    if checkpoint.get("recoveryType") == "resolve_by_human":',
    '                        historical_result.update({"status": "completed", "requiresTakeover": False, "takeoverReason": None, "errorCode": None, "errorMessage": None, "resolvedByHuman": True})',
    '                    break',
    '        self._checkpoint_context = workflow_context',
    '        self._checkpoint_phases = phase_results',
  ];
}
