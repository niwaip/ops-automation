import { Injectable } from '@nestjs/common';
import { RuntimeAdapterRegistry } from '../../adapters/runtime-adapter.registry';
import {
  RuntimePhaseArtifact,
  RuntimePhaseInvokeRequest,
  RuntimePhaseInvokeResult,
  RuntimeStepInvokeRequest,
  RuntimeStepInvokeResult,
} from '../../adapters/runtime-adapter.interface';

@Injectable()
export class RuntimeExecutionOrchestrator {
  // #region debug-point shared:workflow-branch-check
  private reportWorkflowBranchDebug(
    hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E',
    msg: string,
    data: Record<string, unknown>,
    runId = 'pre-fix'
  ): void {
    const fs = require('fs') as typeof import('fs');
    const envPaths = [
      '/app/.dbg/workflow-branch-check.env',
      '/Users/chain/Documents/MyProject/ops-automation/.dbg/workflow-branch-check.env',
    ];
    let url = 'http://host.docker.internal:7777/event';
    let sessionId = 'workflow-branch-check';
    for (const envPath of envPaths) {
      try {
        const env = fs.readFileSync(envPath, 'utf8');
        url = env.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || url;
        sessionId = env.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || sessionId;
        break;
      } catch {}
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        runId,
        hypothesisId,
        location: 'runtime-execution.orchestrator',
        msg: `[DEBUG] ${msg}`,
        data,
        ts: Date.now(),
      }),
    }).catch(() => undefined);
  }
  // #endregion

  constructor(private readonly runtimeAdapterRegistry: RuntimeAdapterRegistry) {}

  async executeStep(request: RuntimeStepInvokeRequest): Promise<RuntimeStepInvokeResult> {
    const adapter = this.runtimeAdapterRegistry.resolve(request);
    if (request.runtimeSessionId && adapter.initializeSession) {
      await adapter.initializeSession(request.runtimeSessionId);
    }

    return adapter.invokeStep(request);
  }

  async executePhase(request: RuntimePhaseInvokeRequest): Promise<RuntimePhaseInvokeResult> {
    const stepResults: RuntimeStepInvokeResult[] = [];
    const initializedSessions = new Set<string>();
    const metadataInput =
      request.metadata?.input &&
      typeof request.metadata.input === 'object' &&
      !Array.isArray(request.metadata.input)
        ? (request.metadata.input as Record<string, unknown>)
        : undefined;
    const persistedPhaseVariables =
      metadataInput?.browserPhaseVariables &&
      typeof metadataInput.browserPhaseVariables === 'object' &&
      !Array.isArray(metadataInput.browserPhaseVariables)
        ? (metadataInput.browserPhaseVariables as Record<string, unknown>)
        : undefined;
    const inputPhaseVariables = Object.fromEntries(
      Object.entries(metadataInput || {}).filter(([key]) => key !== 'browserPhaseVariables')
    );
    const phaseVariables: Record<string, unknown> = {
      ...(persistedPhaseVariables || {}),
      ...inputPhaseVariables,
    };
    // #region debug-point A:workflow-phase-input
    this.reportWorkflowBranchDebug('A', 'initialized workflow phase variables', {
      executionId: request.executionId,
      phaseKey: request.phaseKey,
      metadataInput: metadataInput || null,
      inputPhaseVariables,
      persistedPhaseVariables: persistedPhaseVariables || null,
      initialPhaseVariables: { ...phaseVariables },
    });
    // #endregion

    for (const step of request.steps) {
      if (step.action === 'branch') {
        // #region debug-point B:workflow-branch-before-eval
        this.reportWorkflowBranchDebug('B', 'evaluating workflow branch step', {
          executionId: request.executionId,
          phaseKey: request.phaseKey,
          stepId: step.stepId,
          branchMetadata: step.metadata?.branch || null,
          phaseVariables: { ...phaseVariables },
        });
        // #endregion
        const result = this.evaluateBrowserBranchStep(step, phaseVariables);
        // #region debug-point C:workflow-branch-result
        this.reportWorkflowBranchDebug('C', 'workflow branch evaluation finished', {
          executionId: request.executionId,
          phaseKey: request.phaseKey,
          stepId: step.stepId,
          success: result.success,
          status: result.status,
          errorCode: result.errorCode || null,
          errorMessage: result.errorMessage || null,
          output: result.output || null,
        });
        // #endregion
        stepResults.push(result);

        if (!result.success) {
          const artifacts = this.collectPhaseArtifacts(
            request.steps.slice(0, stepResults.length),
            stepResults
          );
          const summary = this.resolveArtifactSummary(artifacts);
          return {
            success: false,
            status: result.status,
            stepResults,
            failedStepId: step.stepId,
            failedAction: step.action,
            snapshotId: summary.snapshotId,
            pageUrl: summary.pageUrl,
            pageFingerprint: summary.pageFingerprint,
            artifacts,
            output: this.buildPhaseOutput(result.output, phaseVariables),
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            retryable: result.retryable,
            requiresTakeover: result.requiresTakeover,
            takeoverReason: result.takeoverReason,
          };
        }
        continue;
      }

      const adapter = this.runtimeAdapterRegistry.resolve(step);
      const runtimeSessionId = step.runtimeSessionId || undefined;
      const adapterRouteKey =
        adapter.routeKeys?.[0] || `${step.runtimeType}:${step.capabilityType}`;
      const sessionInitKey = runtimeSessionId ? `${adapterRouteKey}:${runtimeSessionId}` : null;

      if (
        runtimeSessionId &&
        adapter.initializeSession &&
        sessionInitKey &&
        !initializedSessions.has(sessionInitKey)
      ) {
        await adapter.initializeSession(runtimeSessionId);
        initializedSessions.add(sessionInitKey);
      }

      const result = await adapter.invokeStep(step);
      stepResults.push(result);
      this.capturePhaseVariable(step, result, phaseVariables);

      if (!result.success) {
        const artifacts = this.collectPhaseArtifacts(
          request.steps.slice(0, stepResults.length),
          stepResults
        );
        const summary = this.resolveArtifactSummary(artifacts);
        return {
          success: false,
          status: result.status,
          stepResults,
          failedStepId: step.stepId,
          failedAction: step.action,
          snapshotId: summary.snapshotId,
          pageUrl: summary.pageUrl,
          pageFingerprint: summary.pageFingerprint,
          artifacts,
          output: this.buildPhaseOutput(result.output, phaseVariables),
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          retryable: result.retryable,
          requiresTakeover: result.requiresTakeover,
          takeoverReason: result.takeoverReason,
        };
      }
    }

    const lastResult = stepResults[stepResults.length - 1];
    const artifacts = this.collectPhaseArtifacts(request.steps, stepResults);
    const summary = this.resolveArtifactSummary(artifacts);

    return {
      success: true,
      status: 'completed',
      stepResults,
      snapshotId: summary.snapshotId,
      pageUrl: summary.pageUrl,
      pageFingerprint: summary.pageFingerprint,
      artifacts,
      output: this.buildPhaseOutput(lastResult?.output, phaseVariables),
    };
  }

  private buildPhaseOutput(
    output: Record<string, unknown> | undefined,
    phaseVariables: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      ...(output || {}),
      phaseVariables: { ...phaseVariables },
    };
  }

  private collectPhaseArtifacts(
    steps: RuntimeStepInvokeRequest[],
    stepResults: RuntimeStepInvokeResult[]
  ): RuntimePhaseArtifact[] {
    const artifacts: RuntimePhaseArtifact[] = [];

    stepResults.forEach((result, index) => {
      const step = steps[index];
      const pageUrl = this.extractPageUrl(result);
      const pageFingerprint = this.extractPageFingerprint(result);

      if (result.snapshot?.id || pageUrl || pageFingerprint) {
        artifacts.push({
          artifactType: result.snapshot?.id ? 'snapshot' : 'page_state',
          snapshotId: result.snapshot?.id || null,
          pageUrl: pageUrl || null,
          pageFingerprint: pageFingerprint || null,
          payload: {
            stepId: step?.stepId || null,
            action: step?.action || null,
            output: result.output || null,
          },
        });
      }

      if (Array.isArray(result.artifacts)) {
        result.artifacts.forEach((artifact) => {
          artifacts.push({
            artifactType: artifact.type,
            snapshotId: artifact.id || null,
            pageUrl: artifact.url || null,
            pageFingerprint: this.extractPageFingerprintFromMetadata(artifact.metadata) || null,
            payload: artifact.metadata || null,
          });
        });
      }
    });

    return artifacts;
  }

  private resolveArtifactSummary(artifacts: RuntimePhaseArtifact[]): {
    snapshotId: string | null;
    pageUrl: string | null;
    pageFingerprint: string | null;
  } {
    let snapshotId: string | null = null;
    let pageUrl: string | null = null;
    let pageFingerprint: string | null = null;

    for (const artifact of artifacts) {
      if (artifact.snapshotId) {
        snapshotId = artifact.snapshotId;
      }
      if (artifact.pageUrl) {
        pageUrl = artifact.pageUrl;
      }
      if (artifact.pageFingerprint) {
        pageFingerprint = artifact.pageFingerprint;
      }
    }

    return {
      snapshotId,
      pageUrl,
      pageFingerprint,
    };
  }

  private extractPageUrl(result: RuntimeStepInvokeResult): string | undefined {
    return this.readStringCandidate([
      result.snapshot?.url,
      this.readStringCandidate([
        result.output?.pageUrl,
        result.output?.page_url,
        result.output?.url,
        (result.output?.page as Record<string, unknown> | undefined)?.url,
        (result.output?.pageState as Record<string, unknown> | undefined)?.pageUrl,
        (result.output?.pageState as Record<string, unknown> | undefined)?.page_url,
      ]),
      this.readStringCandidate([
        result.rawResult?.pageUrl,
        result.rawResult?.page_url,
        result.rawResult?.url,
        (result.rawResult?.page as Record<string, unknown> | undefined)?.url,
        (result.rawResult?.pageState as Record<string, unknown> | undefined)?.pageUrl,
        (result.rawResult?.pageState as Record<string, unknown> | undefined)?.page_url,
      ]),
    ]);
  }

  private extractPageFingerprint(result: RuntimeStepInvokeResult): string | undefined {
    return this.readStringCandidate([
      this.extractPageFingerprintFromMetadata(result.snapshot?.metadata),
      this.readStringCandidate([
        result.output?.pageFingerprint,
        result.output?.page_fingerprint,
        (result.output?.page as Record<string, unknown> | undefined)?.fingerprint,
        (result.output?.pageState as Record<string, unknown> | undefined)?.pageFingerprint,
        (result.output?.pageState as Record<string, unknown> | undefined)?.page_fingerprint,
      ]),
      this.readStringCandidate([
        result.rawResult?.pageFingerprint,
        result.rawResult?.page_fingerprint,
        (result.rawResult?.page as Record<string, unknown> | undefined)?.fingerprint,
        (result.rawResult?.pageState as Record<string, unknown> | undefined)?.pageFingerprint,
        (result.rawResult?.pageState as Record<string, unknown> | undefined)?.page_fingerprint,
      ]),
    ]);
  }

  private extractPageFingerprintFromMetadata(
    metadata?: Record<string, unknown>
  ): string | undefined {
    if (!metadata) {
      return undefined;
    }
    return this.readStringCandidate([
      metadata.pageFingerprint,
      metadata.page_fingerprint,
      (metadata.page as Record<string, unknown> | undefined)?.fingerprint,
    ]);
  }

  private readStringCandidate(values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private interpolateRuntimeTemplate(
    template: string | undefined,
    variables: Record<string, unknown>
  ): string | undefined {
    if (!template) {
      return template;
    }

    return template.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
      const value = variables[key];
      return value === null || value === undefined ? '' : String(value);
    });
  }

  private resolveBranchTakeoverReason(
    template: string | undefined,
    variables: Record<string, unknown>
  ): string | undefined {
    const interpolated = this.interpolateRuntimeTemplate(template, variables);
    if (!interpolated) {
      return interpolated;
    }

    const threshold = variables.grossMarginThreshold;
    if (threshold === null || threshold === undefined || String(threshold).trim() === '') {
      return interpolated;
    }

    if (template?.includes('${')) {
      return interpolated;
    }

    return interpolated.replace(/-?\d+(?:\.\d+)?(?=\s*%)/, String(threshold));
  }

  private capturePhaseVariable(
    step: RuntimeStepInvokeRequest,
    result: RuntimeStepInvokeResult,
    phaseVariables: Record<string, unknown>
  ): void {
    const outputVar =
      typeof step.metadata?.outputVar === 'string' && step.metadata.outputVar.trim().length > 0
        ? step.metadata.outputVar.trim()
        : undefined;
    if (!outputVar) {
      return;
    }

    const textValue = this.extractStepText(result);
    if (textValue !== undefined) {
      phaseVariables[outputVar] = textValue;
    }
  }

  private extractStepText(result: RuntimeStepInvokeResult): string | undefined {
    const rawValue = this.readStringCandidate([
      result.output?.text,
      result.output?.stdout,
      result.rawResult?.output && typeof result.rawResult.output === 'object'
        ? (result.rawResult.output as Record<string, unknown>).text
        : undefined,
      result.rawResult?.output && typeof result.rawResult.output === 'object'
        ? (result.rawResult.output as Record<string, unknown>).stdout
        : undefined,
    ]);
    if (!rawValue) {
      return undefined;
    }

    const resultBlockMatch = rawValue.match(/### Result\s*\n([\s\S]*?)\n### Ran Playwright code/);
    const candidate = resultBlockMatch?.[1]?.trim() || rawValue.trim();
    if (!candidate) {
      return undefined;
    }
    if (candidate.startsWith('"') && candidate.endsWith('"')) {
      try {
        const parsed = JSON.parse(candidate);
        if (typeof parsed === 'string') {
          return parsed.trim();
        }
      } catch {
        return candidate.slice(1, -1).trim();
      }
    }
    return candidate;
  }

  private evaluateBrowserBranchStep(
    step: RuntimeStepInvokeRequest,
    variables: Record<string, unknown>
  ): RuntimeStepInvokeResult {
    const branch = step.metadata?.branch as Record<string, unknown> | undefined;
    const conditionFn = typeof branch?.conditionFn === 'string' ? branch.conditionFn : undefined;
    if (!conditionFn) {
      return {
        success: false,
        status: 'blocked',
        errorCode: 'browser_branch_missing_condition',
        errorMessage: 'branch step missing conditionFn',
        output: {
          variables,
        },
      };
    }

    try {
      const evaluator = new Function('ctx', `const fn = ${conditionFn}; return fn(ctx);`) as (
        ctx: Record<string, unknown>
      ) => unknown;
      const matched = Boolean(evaluator(variables));
      const onMatch = branch?.onMatch === 'stop' ? 'stop' : 'continue';
      const onMismatch =
        branch?.onMismatch === 'takeover'
          ? 'takeover'
          : branch?.onMismatch === 'continue'
            ? 'continue'
            : 'stop';
      const outcome = matched ? onMatch : onMismatch;
      const description = typeof branch?.description === 'string' ? branch.description : undefined;
      const takeoverReason = this.resolveBranchTakeoverReason(
        typeof branch?.takeoverReason === 'string' ? branch.takeoverReason : undefined,
        variables
      );

      if (outcome === 'continue') {
        return {
          success: true,
          status: 'completed',
          output: {
            matched,
            variables,
            message: matched ? '条件成立，继续执行' : '条件不成立，但配置为继续执行',
            description: description || null,
          },
        };
      }
      if (outcome === 'takeover') {
        return {
          success: false,
          status: 'takeover_required',
          requiresTakeover: true,
          takeoverReason: takeoverReason || '条件不满足，需要人工接管',
          errorCode: 'browser_branch_takeover_required',
          errorMessage: takeoverReason || '条件不满足，需要人工接管',
          output: {
            matched,
            variables,
            message: description || '条件分歧触发人工接管',
          },
        };
      }
      return {
        success: false,
        status: 'blocked',
        errorCode: 'browser_branch_stopped',
        errorMessage: matched ? '条件成立，按配置停止执行' : '条件不满足，按配置停止执行',
        output: {
          matched,
          variables,
          message: description || '条件分歧停止执行',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        status: 'blocked',
        errorCode: 'browser_branch_eval_failed',
        errorMessage: `执行条件表达式失败: ${message}`,
        output: {
          variables,
        },
      };
    }
  }
}
