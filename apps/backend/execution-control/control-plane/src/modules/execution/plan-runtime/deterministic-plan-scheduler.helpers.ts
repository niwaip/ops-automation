/**
 * Pure helper functions extracted from DeterministicPlanSchedulerService
 * to enforce single-responsibility and control file complexity under 1200 lines.
 */

export function resolveBrowserRunOutputSchemaDigest(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const browserRunOutput = (value as Record<string, unknown>).browserRunOutput;
  if (
    !browserRunOutput ||
    typeof browserRunOutput !== 'object' ||
    Array.isArray(browserRunOutput)
  ) {
    return undefined;
  }
  const run = (browserRunOutput as Record<string, unknown>).run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return undefined;
  const digest = (run as Record<string, unknown>).contractDigest;
  return typeof digest === 'string' && /^[a-f0-9]{64}$/iu.test(digest) ? digest : undefined;
}

export function extractArtifacts(
  runtimeArtifacts: unknown,
  output: Record<string, any>
): Array<Record<string, any>> | undefined {
  const browserRunOutput = output.browserRunOutput;
  const candidates = [
    runtimeArtifacts,
    output.artifacts,
    browserRunOutput && typeof browserRunOutput === 'object'
      ? (browserRunOutput as Record<string, unknown>).artifacts
      : undefined,
    output.artifact ? [output.artifact] : undefined,
  ];
  const artifacts = candidates.find(Array.isArray);
  return Array.isArray(artifacts)
    ? artifacts.filter(
        (artifact): artifact is Record<string, any> =>
          Boolean(artifact) && typeof artifact === 'object' && !Array.isArray(artifact)
      )
    : undefined;
}

/**
 * Legacy vs V2 classification for the grace gate (fix ⑩).
 *
 * A frozen plan is V2 when EVERY node carries an authoritative `contractRef`
 * (attached at freeze time, §9.3). Plans with no frozen plan, no nodes, or
 * any node lacking a contractRef are treated as legacy — they are the only
 * executions the legacy grace deadline may reject.
 */
export function isLegacyPlan(execution: any): boolean {
  const nodes = (execution?.plan?.planJson as any)?.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return true;
  return nodes.some((node: any) => !node?.contractRef);
}

export function mapPlanRuntimeTypeToExecutionRuntime(
  runtimeType?: string
): 'api' | 'workflow' | 'browser' | 'document' | 'custom' {
  const normalized = typeof runtimeType === 'string' ? runtimeType.trim().toLowerCase() : '';

  switch (normalized) {
    case 'api':
      return 'api';
    case 'workflow':
      return 'workflow';
    case 'browser_template':
    case 'browser':
      return 'browser';
    case 'artifact':
    case 'document':
      return 'document';
    default:
      return 'workflow';
  }
}
