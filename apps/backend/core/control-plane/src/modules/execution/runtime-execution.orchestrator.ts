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
  constructor(
    private readonly runtimeAdapterRegistry: RuntimeAdapterRegistry,
  ) {}

  async executeStep(
    request: RuntimeStepInvokeRequest,
  ): Promise<RuntimeStepInvokeResult> {
    const adapter = this.runtimeAdapterRegistry.resolve(request);
    if (request.runtimeSessionId && adapter.initializeSession) {
      await adapter.initializeSession(request.runtimeSessionId);
    }

    return adapter.invokeStep(request);
  }

  async executePhase(
    request: RuntimePhaseInvokeRequest,
  ): Promise<RuntimePhaseInvokeResult> {
    const stepResults: RuntimeStepInvokeResult[] = [];

    for (const step of request.steps) {
      const result = await this.executeStep(step);
      stepResults.push(result);

      if (!result.success) {
        const artifacts = this.collectPhaseArtifacts(request.steps.slice(0, stepResults.length), stepResults);
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
    stepResults: RuntimeStepInvokeResult[],
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

  private resolveArtifactSummary(
    artifacts: RuntimePhaseArtifact[],
  ): { snapshotId: string | null; pageUrl: string | null; pageFingerprint: string | null } {
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
    metadata?: Record<string, unknown>,
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
}
