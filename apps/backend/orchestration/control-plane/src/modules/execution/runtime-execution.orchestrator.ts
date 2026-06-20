import { Injectable } from '@nestjs/common';
import { RuntimeAdapterRegistry } from './runtime-adapter.registry';
import {
  RuntimePhaseArtifact,
  RuntimePhaseInvokeRequest,
  RuntimePhaseInvokeResult,
  RuntimeStepInvokeRequest,
  RuntimeStepInvokeResult,
} from './runtime-adapter.interface';

@Injectable()
export class RuntimeExecutionOrchestrator {
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
    const phaseVariables: Record<string, unknown> = {};

    for (const step of request.steps) {
      if (step.action === 'branch') {
        const result = this.evaluateBrowserBranchStep(step, phaseVariables);
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
            output: result.output,
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
          output: result.output,
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
      output: lastResult?.output,
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
      const takeoverReason =
        typeof branch?.takeoverReason === 'string' ? branch.takeoverReason : undefined;

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
