/**
 * ResultRef is storage metadata, not part of a node's business output contract.
 * Keep callers compatible with both the original inline shape and the durable
 * `{ inline, resultRef }` envelope used when RESULT_REF_ENABLED is on.
 */
export function unwrapStoredStepOutput(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, any>;
  const base =
    record.inline && typeof record.inline === 'object' && !Array.isArray(record.inline) && record.resultRef
      ? (record.inline as Record<string, any>)
      : record;

  const res: Record<string, any> = { ...base };

  const resultObj =
    base.result && typeof base.result === 'object' && !Array.isArray(base.result)
      ? (base.result as Record<string, any>)
      : undefined;
  const presentationObj =
    base.presentation && typeof base.presentation === 'object' && !Array.isArray(base.presentation)
      ? (base.presentation as Record<string, any>)
      : undefined;

  // Surface top-level metadata from result and presentation if not already set
  if (resultObj) {
    if (res.title === undefined && resultObj.title) res.title = resultObj.title;
    if (res.summary === undefined && resultObj.summary) res.summary = resultObj.summary;
    if (res.businessData === undefined && resultObj.businessData) res.businessData = resultObj.businessData;
  }
  if (presentationObj) {
    if (res.detailText === undefined && presentationObj.detailText) res.detailText = presentationObj.detailText;
    if (res.chatSummary === undefined && presentationObj.chatSummary) res.chatSummary = presentationObj.chatSummary;
  }

  // If this is a browser run / composite output container, surface step output fields (e.g. text, title, pageUrl, summary, screenshot)
  const stepResults = Array.isArray(base.stepResults)
    ? base.stepResults
    : Array.isArray(base.browserRunOutput?.stepResults)
      ? base.browserRunOutput.stepResults
      : [];

  for (let i = stepResults.length - 1; i >= 0; i--) {
    const step = stepResults[i];
    const stepId = String(step?.stepId || '');
    if (
      stepId.startsWith('loop_stop') ||
      stepId.startsWith('loop_condition') ||
      stepId.startsWith('loop_target')
    ) {
      continue;
    }
    const stepOut = step?.output;
    if (stepOut && typeof stepOut === 'object' && !Array.isArray(stepOut)) {
      for (const [k, v] of Object.entries(stepOut)) {
        if (res[k] === undefined && v !== undefined) {
          res[k] = v;
        }
      }
    }
  }

  // Extract from phaseResults (Temporal browser workflow)
  const bData = res.businessData || base.businessData;
  const phaseResults = Array.isArray(base.phaseResults)
    ? base.phaseResults
    : Array.isArray(bData?.phaseResults)
      ? bData.phaseResults
      : [];

  for (const item of phaseResults) {
    const stepId = String(item?.stepId || '');
    if (stepId) {
      if (res[stepId] === undefined) res[stepId] = item.result;
      const dataText = item.result?.data?.text || item.result?.text || item.result?.content;
      if (dataText) {
        if (res[`${stepId}_clean_content`] === undefined) res[`${stepId}_clean_content`] = dataText;
        if (res[`${stepId}_text`] === undefined) res[`${stepId}_text`] = dataText;
      }
      if (item.result?.variables && typeof item.result.variables === 'object') {
        for (const [vk, vv] of Object.entries(item.result.variables)) {
          if (res[vk] === undefined) res[vk] = vv;
        }
      }
    }
  }

  const vars = bData?.result?.variables || bData?.variables || base.variables;
  if (vars && typeof vars === 'object') {
    for (const [vk, vv] of Object.entries(vars)) {
      if (res[vk] === undefined) res[vk] = vv;
    }
  }

  if (base.pageState && typeof base.pageState === 'object') {
    if (res.title === undefined && base.pageState.pageTitle) res.title = base.pageState.pageTitle;
    if (res.pageUrl === undefined && base.pageState.pageUrl) res.pageUrl = base.pageState.pageUrl;
  }

  return res;
}
