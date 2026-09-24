import {
  buildV2OutputResultBuilderLines,
  buildV2StepResultsArgument,
  hasV2OutputFields,
} from './temporal-workflow-result-builder.helpers';
import type { WorkflowDsl } from './temporal-workflow.types';


export function resolveWorkflowClassName(workflowDsl: WorkflowDsl): string {
  return (
    workflowDsl.workflowClassName?.trim() ||
    `${(workflowDsl.name || 'Custom').replace(/\s+/g, '') || 'Custom'}Workflow`
  );
}

export function resolveWorkflowDisplayName(
  workflowDsl: WorkflowDsl,
  workflowClassName: string
): string {
  return workflowDsl.workflowDefnName?.trim() || workflowDsl.name || workflowClassName;
}

export function resolveWorkflowResultType(activityFn: string): string {
  switch (String(activityFn || '').trim()) {
    case 'documentRender':
      return 'document';
    case 'emailSend':
    case 'webhookNotify':
    case 'imNotify':
      return 'notification';
    case 'fileRead':
      return 'import';
    case 'fileWrite':
    case 'templateRender':
    case 'csvParse':
      return 'export';
    case 'databaseQuery':
      return 'report';
    default:
      return 'generic';
  }
}

function buildSharedResultSupportLines(): string[] {
  return [
    '    @staticmethod',
    '    def _extract_summary(value: Any):',
    '        if isinstance(value, str):',
    '            return value.strip() or None',
    '        if isinstance(value, dict):',
    '            for key in ("chatSummary", "finalAnswer", "formatted_output", "summary", "message", "result", "text", "content"):',
    '                current = value.get(key)',
    '                if isinstance(current, str) and current.strip():',
    '                    return current.strip()',
    '        return None',
    '',
    '    @staticmethod',
    '    def _extract_detail_text(value: Any):',
    '        if isinstance(value, str):',
    '            return value.strip() or None',
    '        if isinstance(value, dict):',
    '            for key in ("detailText", "formatted_output", "result", "text", "content", "summary", "message", "chatSummary", "finalAnswer"):',
    '                current = value.get(key)',
    '                if isinstance(current, str) and current.strip():',
    '                    return current.strip()',
    '        return None',
    '',
    '    @staticmethod',
    '    def _extract_task_context(params: Any) -> Dict[str, Any]:',
    '        if not isinstance(params, dict):',
    '            return {}',
    '        task_id = params.get("todoId") or params.get("taskId")',
    '        if not task_id:',
    '            return {}',
    '        context = {',
    '            "taskId": str(task_id),',
    '            "userId": str(params.get("userId")) if params.get("userId") else None,',
    '            "sourceType": str(params.get("sourceType")) if params.get("sourceType") else "manual",',
    '        }',
    '        return {k: v for k, v in context.items() if v is not None}',
    '',
    '    @classmethod',
    '    def _collect_artifacts(cls, value: Any) -> List[Dict[str, Any]]:',
    '        artifacts: List[Dict[str, Any]] = []',
    '        queue: List[Any] = [value]',
    '        visited_ids = set()',
    '        inspected = 0',
    '        while queue and inspected < 50:',
    '            current = queue.pop(0)',
    '            inspected += 1',
    '            if isinstance(current, (dict, list)):',
    '                current_id = id(current)',
    '                if current_id in visited_ids:',
    '                    continue',
    '                visited_ids.add(current_id)',
    '            if isinstance(current, list):',
    '                queue.extend(current)',
    '                continue',
    '            if not isinstance(current, dict):',
    '                continue',
    '            download_url = current.get("downloadUrl") or current.get("download_url")',
    '            url = current.get("url")',
    '            if isinstance(download_url, str) and download_url.strip():',
    '                artifacts.append({',
    '                    "type": "file",',
    '                    "name": current.get("name") or current.get("fileName") or current.get("label") or "result",',
    '                    "label": current.get("label") or current.get("name") or current.get("fileName") or "下载结果",',
    '                    "downloadUrl": download_url.strip(),',
    '                    "mimeType": current.get("mimeType") or current.get("mime_type"),',
    '                    "path": current.get("path"),',
    '                })',
    '            elif isinstance(url, str) and url.strip():',
    '                artifacts.append({',
    '                    "type": "url",',
    '                    "name": current.get("name") or current.get("label") or "result",',
    '                    "label": current.get("label") or current.get("name") or "查看结果",',
    '                    "url": url.strip(),',
    '                })',
    '            for item in current.values():',
    '                if isinstance(item, (dict, list)):',
    '                    queue.append(item)',
    '        return artifacts',
    '',
  ];
}

function buildLegacyWorkflowResultBuilderLines(args: {
  resultType: string;
  title: string;
  preferAiSummary: boolean;
}): string[] {
  const { resultType, title, preferAiSummary } = args;
  return [
    '    @classmethod',
    '    def _build_workflow_result(cls, raw_result: Any) -> Dict[str, Any]:',
    '        business_data = raw_result',
    '        if isinstance(raw_result, dict) and "result" in raw_result and raw_result.get("result") is not None:',
    '            business_data = raw_result.get("result")',
    '        summary = cls._extract_summary(raw_result)',
    '        if summary is None:',
    '            summary = cls._extract_summary(business_data)',
    '        detail_text = cls._extract_detail_text(raw_result)',
    '        if detail_text is None:',
    '            detail_text = cls._extract_detail_text(business_data)',
    '        return {',
    '            "execution": {',
    '                "status": "success",',
    '            },',
    '            "trigger": {',
    '                "type": "manual",',
    '            },',
    '            "result": {',
    `                "resultType": ${JSON.stringify(resultType)},`,
    `                "title": ${JSON.stringify(title)},`,
    '                "summary": summary,',
    '                "businessData": business_data,',
    '            },',
    '            "artifacts": cls._collect_artifacts(raw_result),',
    '            "presentation": {',
    `                "preferAiSummary": ${preferAiSummary ? 'True' : 'False'},`,
    '                "preferStructuredView": False,',
    '                "chatSummary": summary,',
    '                "notificationSummary": summary,',
    '                "summaryFormat": "plain_text",',
    '                "detailText": detail_text,',
    '                "detailFormat": "plain_text",',
    '            },',
    '        }',
    '',
  ];
}

export function buildWorkflowResultSupportLines(args: {
  resultType: string;
  title: string;
  preferAiSummary?: boolean;
  v2Output?: WorkflowDsl['v2Output'];
  validV2StepIds?: string[];
}): string[] {
  const { resultType, title, preferAiSummary = true, v2Output, validV2StepIds } = args;
  const sharedLines = buildSharedResultSupportLines();
  if (!hasV2OutputFields(v2Output)) {
    return [
      ...sharedLines,
      ...buildLegacyWorkflowResultBuilderLines({ resultType, title, preferAiSummary }),
    ];
  }
  return [
    ...sharedLines,
    ...buildV2OutputResultBuilderLines({
      v2Output: v2Output as NonNullable<WorkflowDsl['v2Output']>,
      validStepIds: validV2StepIds || [],
      resultType,
      title,
      preferAiSummary,
    }),
  ];
}

/**
 * Builds the call-site return line passing each source step's result variable
 * into `_build_workflow_result(...)`; without v2Output the legacy single-value
 * passthrough is kept byte-for-byte.
 */
export function buildV2WorkflowResultReturnLine(
  v2Output: WorkflowDsl['v2Output'] | undefined,
  stepToVar: Record<string, string>,
  legacyArg: string
): string {
  if (!hasV2OutputFields(v2Output)) {
    return `        return self._build_workflow_result(${legacyArg})`;
  }
  return `        return self._build_workflow_result(${buildV2StepResultsArgument(stepToVar)})`;
}
