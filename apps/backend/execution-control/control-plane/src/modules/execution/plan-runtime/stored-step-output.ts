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

  // If this is a browser run / composite output container, surface step output fields (e.g. text, title, pageUrl, summary, screenshot)
  const stepResults = Array.isArray(base.stepResults)
    ? base.stepResults
    : Array.isArray(base.browserRunOutput?.stepResults)
      ? base.browserRunOutput.stepResults
      : [];

  for (let i = stepResults.length - 1; i >= 0; i--) {
    const stepOut = stepResults[i]?.output;
    if (stepOut && typeof stepOut === 'object' && !Array.isArray(stepOut)) {
      for (const [k, v] of Object.entries(stepOut)) {
        if (res[k] === undefined && v !== undefined) {
          res[k] = v;
        }
      }
    }
  }

  if (base.pageState && typeof base.pageState === 'object') {
    if (res.title === undefined && base.pageState.pageTitle) res.title = base.pageState.pageTitle;
    if (res.pageUrl === undefined && base.pageState.pageUrl) res.pageUrl = base.pageState.pageUrl;
  }

  return res;
}
