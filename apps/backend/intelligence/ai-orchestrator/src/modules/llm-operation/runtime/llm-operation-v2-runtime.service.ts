import { Injectable, Logger } from '@nestjs/common';
import { LlmOperationRegistryService } from '../registry/llm-operation-registry.service';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from '../registry/errors';
import { ModelService } from '../../model/model.service';
import { PromptRendererService } from './prompt-renderer.service';
import { InputValidatorService } from './input-validator.service';
import { ToolCallGuardService } from './tool-call-guard.service';
import { OutputValidatorService } from './output-validator.service';
import { BudgetEnforcerService } from './budget-enforcer.service';
import { LlmOperationAuditService } from '../audit/llm-operation-audit.service';
import type { ExecuteLlmOperationV2Request, LlmOperationV2Result } from './v2-runtime-types';
import type {
  LlmOperationVersionRecord,
  LegacyLlmOperationVersion,
  LlmOperationRecord,
} from '../registry/types';
import { LLM_OPERATION_TEMPLATES } from '../llm-operation.registry';
import { PromptDebugSettingsService } from '../../debug-settings/prompt-debug-settings.service';
import { LlmOperationModelCallerService } from './llm-operation-model-caller.service';
import { createHash } from 'crypto';
import type { LLMResponse } from '../../../interfaces';

@Injectable()
export class LlmOperationV2RuntimeService {
  constructor(
    private readonly registry: LlmOperationRegistryService,
    private readonly modelService: ModelService,
    private readonly modelCaller: LlmOperationModelCallerService,
    private readonly promptRenderer: PromptRendererService,
    private readonly inputValidator: InputValidatorService,
    private readonly toolCallGuard: ToolCallGuardService,
    private readonly outputValidator: OutputValidatorService,
    private readonly budgetEnforcer: BudgetEnforcerService,
    private readonly auditService: LlmOperationAuditService,
    private readonly logger: Logger,
    private readonly promptDebugSettingsService: PromptDebugSettingsService
  ) {}

  private computeDigest(data: unknown): string {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return createHash('sha256').update(str).digest('hex').slice(0, 32);
  }

  public async execute(request: ExecuteLlmOperationV2Request): Promise<LlmOperationV2Result> {
    const startTime = Date.now();

    try {
      return await this.executeInternal(request, startTime, false);
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;

      if (err instanceof LlmOperationError) {
        const details = err.details as Record<string, any> | undefined;
        return {
          success: false,
          operationRef: {
            id: request.operationId,
            version: details?.version || 'unknown',
            digest: details?.digest || 'unknown',
          },
          source: details?.source || 'legacy_registry',
          usage: {},
          metadata: {
            provider: details?.provider || 'unknown',
            requestedModel: details?.requestedModel || 'unknown',
            repairAttempts: details?.repairAttempts || 0,
            latencyMs,
            schemaValidated: false,
            toolCallDetected: false,
          },
          errorCode: err.code,
          errorMessage: err.message,
        };
      }

      throw err;
    }
  }

  /** Executes an exact, non-active candidate version for the eval sandbox only. */
  public async executeForEvaluation(
    request: ExecuteLlmOperationV2Request
  ): Promise<LlmOperationV2Result> {
    const startTime = Date.now();
    return this.executeInternal(request, startTime, true);
  }

  private async executeInternal(
    request: ExecuteLlmOperationV2Request,
    startTime: number,
    allowUnapprovedExactVersion: boolean
  ): Promise<LlmOperationV2Result> {
    const environment = request.environment ?? 'production';

    let resolved: {
      source: 'database' | 'legacy_registry';
      version: LlmOperationVersionRecord | LegacyLlmOperationVersion;
      operation: LlmOperationRecord | null;
    };

    if (request.operationVersion) {
      const exactVersion = await this.registry.resolveExactVersion(
        request.operationId,
        request.operationVersion
      );
      if (!exactVersion) {
        throw new LlmOperationError(
          LLM_OPERATION_ERROR_CODES.VERSION_NOT_FOUND,
          `Operation '${request.operationId}' version '${request.operationVersion}' not found`,
          { operationId: request.operationId, version: request.operationVersion }
        );
      }
      if (
        !allowUnapprovedExactVersion &&
        !['approved', 'deprecated'].includes(exactVersion.state)
      ) {
        throw new LlmOperationError(
          LLM_OPERATION_ERROR_CODES.INVALID_STATE_TRANSITION,
          `Operation '${request.operationId}' version '${request.operationVersion}' is not executable in state '${exactVersion.state}'`,
          {
            operationId: request.operationId,
            version: request.operationVersion,
            state: exactVersion.state,
          }
        );
      }
      resolved = { source: 'database' as const, version: exactVersion, operation: null };
    } else {
      if (environment === 'production') {
        throw new LlmOperationError(
          LLM_OPERATION_ERROR_CODES.VERSION_NOT_FOUND,
          `Operation '${request.operationId}' must pin operationVersion in production — runtime dynamic resolution is forbidden`
        );
      }
      resolved = await this.registry.resolveActiveVersion(request.operationId, environment);
    }

    const version = resolved.version;

    if (resolved.source === 'legacy_registry') {
      this.logger.warn(
        `LLM_OPERATION_LEGACY_REGISTRY_FALLBACK: ${request.operationId} not found in DB, falling back to legacy registry`
      );
    }

    if (request.operationDigest && request.operationDigest !== version.operationDigest) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.DIGEST_MISMATCH,
        `Operation digest mismatch: expected ${request.operationDigest}, got ${version.operationDigest}`,
        {
          version: version.version,
          digest: version.operationDigest,
          source: resolved.source,
        }
      );
    }

    if (request.contractDigest && request.contractDigest !== version.contractDigest) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.DIGEST_MISMATCH,
        `Contract digest mismatch: expected ${request.contractDigest}, got ${version.contractDigest}`,
        {
          version: version.version,
          digest: version.contractDigest,
          source: resolved.source,
        }
      );
    }

    const completedInvocation = await this.auditService.findCompletedByIdempotencyKey(
      version.id,
      request.idempotencyKey
    );
    if (completedInvocation?.resultJson) {
      const replayed = completedInvocation.resultJson as unknown as LlmOperationV2Result;
      return {
        ...replayed,
        metadata: { ...replayed.metadata, idempotentReplay: true },
      };
    }

    const manifest = version.manifestJson;
    const executionPolicy = (manifest.executionPolicy as Record<string, unknown>) ?? {};
    const tools = executionPolicy.tools as string | undefined;

    if (tools !== 'disabled') {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.INVALID_OPERATION_CONFIG,
        `executionPolicy.tools must be 'disabled' for V2 runtime (got: ${tools || 'undefined'})`,
        {
          version: version.version,
          digest: version.operationDigest,
          source: resolved.source,
        }
      );
    }

    const inputSchema = (manifest.inputSchema as Record<string, unknown>) ?? null;
    const outputSchema = (manifest.outputSchema as Record<string, unknown>) ?? null;
    const modelOutputMode = manifest.modelOutputMode === 'text' ? 'text' : 'json';
    const templateTokens =
      LLM_OPERATION_TEMPLATES[request.operationId as keyof typeof LLM_OPERATION_TEMPLATES]?.maxInputTokens;
    const maxInputTokens = Math.max((manifest.maxInputTokens as number) ?? 4000, templateTokens ?? 4000);
    const maxOutputTokens = (manifest.maxOutputTokens as number) ?? 2000;
    const timeoutMs = (manifest.timeoutMs as number) ?? 30000;
    const repair = (manifest.repair as Record<string, unknown>) ?? {};
    const maxRepairAttempts = (repair.maxAttempts as number) ?? 1;

    try {
      this.inputValidator.validate(request.input, inputSchema);
    } catch (err: any) {
      throw new LlmOperationError(err.code || 'INPUT_SCHEMA_VIOLATION', err.message, {
        version: version.version,
        digest: version.operationDigest,
        source: resolved.source,
      });
    }

    // Oversize policy: 'truncate' operations keep a budget-sized prefix (with
    // a notice) instead of failing; 'reject' stays fail-closed via preflight.
    const inputPolicy = (manifest.inputPolicy as Record<string, unknown>) ?? {};
    const templateOversize =
      LLM_OPERATION_TEMPLATES[request.operationId as keyof typeof LLM_OPERATION_TEMPLATES]?.oversizeInput;
    const oversize =
      templateOversize === 'truncate' || String(inputPolicy.oversize ?? '') === 'truncate'
        ? 'truncate'
        : 'reject';
    // Enterprise Token Optimization: Slim list items before feeding to summarize_list
    // Strips out non-essential raw data (e.g. raw HTML, complex headers, network refs)
    // and preserves only what the LLM glue requires (title, sender, time, clean snippet).
    if (request.operationId === 'summarize_list' && Array.isArray(request.input?.items)) {
      request.input.items = (request.input.items as any[]).map((item) => {
        if (!item || typeof item !== 'object') return item;
        const title = item.title || item.subject || item.name || item.heading || '';
        const from = item.from || item.sender || item.author || undefined;
        const date = item.receivedAt || item.date || item.publishedAt || item.time || undefined;
        const rawSummary =
          item.summary || item.snippet || item.content || item.description || item.text || '';
        const cleanSummary = String(rawSummary).slice(0, 400);

        return {
          title: String(title).trim(),
          ...(from ? { from: String(from).trim() } : {}),
          ...(date ? { date: String(date).trim() } : {}),
          summary: cleanSummary.trim(),
        };
      });
    }

    request.input = this.budgetEnforcer.prepareInput(request.input, maxInputTokens, oversize);

    try {
      this.budgetEnforcer.preflightInput(request.input, maxInputTokens);
    } catch (err: any) {
      throw new LlmOperationError(err.code || 'BUDGET_EXCEEDED', err.message, {
        version: version.version,
        digest: version.operationDigest,
        source: resolved.source,
      });
    }

    let systemPrompt: string;
    let userPrompt: string;

    if (resolved.source === 'database') {
      const rendered = this.promptRenderer.renderManifestPrompt(manifest, request.input);
      systemPrompt = rendered.systemPrompt;
      userPrompt = rendered.userPrompt;
    } else {
      const template =
        LLM_OPERATION_TEMPLATES[request.operationId as keyof typeof LLM_OPERATION_TEMPLATES];
      if (!template) {
        throw new LlmOperationError(
          LLM_OPERATION_ERROR_CODES.NOT_FOUND,
          `Operation not found: ${request.operationId}`
        );
      }
      const built = template.buildPrompt(request.input);
      systemPrompt = built.systemPrompt;
      userPrompt = built.userPrompt;
    }

    const activeModel = request.modelId
      ? await this.modelService.getModel(request.modelId)
      : this.modelService.getPreferredDefaultModel({ mode: 'task' });
    if (!activeModel) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.MODEL_NOT_AVAILABLE,
        request.modelId
          ? `Frozen task model '${request.modelId}' is not available`
          : 'No active AI model configured for task operations',
        { requestedModel: request.modelId || 'default' },
      );
    }
    if (request.modelId && activeModel.status !== 'active') {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.MODEL_NOT_AVAILABLE,
        `Frozen task model '${activeModel.id}' is not active or configured`,
        { requestedModel: activeModel.id, provider: activeModel.provider },
      );
    }

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    this.logger.log(
      `Executing V2 LLM operation '${request.operationId}' with model '${activeModel.name}'`
    );

    let repairAttempts = 0;
    let lastRawContent = '';
    let lastResponse: any;

    try {
      lastResponse =
        modelOutputMode === 'text'
          ? await this.modelCaller.call(activeModel.id, fullPrompt, maxOutputTokens, 'text')
          : await this.modelCaller.call(activeModel.id, fullPrompt, maxOutputTokens);
      lastRawContent = lastResponse.content;
    } catch (callErr: any) {
      const latencyMs = Date.now() - startTime;
      return this.buildErrorResult(
        request,
        resolved.source,
        version,
        'MODEL_CALL_FAILED',
        callErr.message,
        repairAttempts,
        latencyMs,
        activeModel,
        { systemPrompt, userPrompt, llmResponseText: '' }
      );
    }

    try {
      this.toolCallGuard.assertNoToolCall(lastResponse);
    } catch (toolError: any) {
      const latencyMs = Date.now() - startTime;
      return this.buildErrorResult(
        request,
        resolved.source,
        version,
        toolError.code || LLM_OPERATION_ERROR_CODES.TOOL_CALL_FORBIDDEN,
        toolError.message,
        repairAttempts,
        latencyMs,
        activeModel,
        { systemPrompt, userPrompt, llmResponseText: lastRawContent },
        lastResponse
      );
    }

    if (!lastRawContent.trim()) {
      const truncated = lastResponse?.finishReason === 'length';
      const latencyMs = Date.now() - startTime;
      return this.buildErrorResult(
        request,
        resolved.source,
        version,
        truncated ? 'OUTPUT_TRUNCATED' : 'EMPTY_MODEL_RESPONSE',
        truncated
          ? 'Model exhausted its output budget before producing business content'
          : 'Model returned an empty business-content channel',
        repairAttempts,
        latencyMs,
        activeModel,
        { systemPrompt, userPrompt, llmResponseText: lastRawContent },
        lastResponse
      );
    }

    if (lastResponse?.finishReason === 'length') {
      const latencyMs = Date.now() - startTime;
      return this.buildErrorResult(
        request,
        resolved.source,
        version,
        'OUTPUT_TRUNCATED',
        'Model exhausted its output budget before completing business content',
        repairAttempts,
        latencyMs,
        activeModel,
        { systemPrompt, userPrompt, llmResponseText: lastRawContent },
        lastResponse
      );
    }

    let parsed: { data: Record<string, unknown>; schemaValidated: boolean } | undefined;

    try {
      parsed = this.outputValidator.parseAndValidate(lastRawContent, outputSchema, request.input);
    } catch (firstErr: any) {
      if (maxRepairAttempts <= 0) {
        const latencyMs = Date.now() - startTime;
        return this.buildErrorResult(
          request,
          resolved.source,
          version,
          firstErr.code || 'OUTPUT_VALIDATION_FAILED',
          firstErr.message,
          repairAttempts,
          latencyMs,
          activeModel,
          { systemPrompt, userPrompt, llmResponseText: lastRawContent },
          lastResponse
        );
      }

      const repairPrompt = this.outputValidator.buildRepairPrompt(
        systemPrompt,
        lastRawContent,
        modelOutputMode
      );

      for (let attempt = 0; attempt < maxRepairAttempts; attempt++) {
        repairAttempts++;
        this.logger.warn(`Repair attempt ${repairAttempts} for operation '${request.operationId}'`);

        try {
          lastResponse =
            modelOutputMode === 'text'
              ? await this.modelCaller.call(activeModel.id, repairPrompt, maxOutputTokens, 'text')
              : await this.modelCaller.call(activeModel.id, repairPrompt, maxOutputTokens);
          lastRawContent = lastResponse.content;
          this.toolCallGuard.assertNoToolCall(lastResponse);

          if (!lastRawContent.trim()) {
            const truncated = lastResponse?.finishReason === 'length';
            const latencyMs = Date.now() - startTime;
            return this.buildErrorResult(
              request,
              resolved.source,
              version,
              truncated ? 'OUTPUT_TRUNCATED' : 'EMPTY_MODEL_RESPONSE',
              truncated
                ? 'Model exhausted its output budget during schema repair'
                : 'Model returned an empty business-content channel during schema repair',
              repairAttempts,
              latencyMs,
              activeModel,
              { systemPrompt, userPrompt, llmResponseText: lastRawContent },
              lastResponse
            );
          }

          if (lastResponse?.finishReason === 'length') {
            const latencyMs = Date.now() - startTime;
            return this.buildErrorResult(
              request,
              resolved.source,
              version,
              'OUTPUT_TRUNCATED',
              'Model exhausted its output budget during schema repair',
              repairAttempts,
              latencyMs,
              activeModel,
              { systemPrompt, userPrompt, llmResponseText: lastRawContent },
              lastResponse
            );
          }

          parsed = this.outputValidator.parseAndValidate(
            lastRawContent,
            outputSchema,
            request.input
          );
          break;
        } catch (repairErr: any) {
          if (attempt === maxRepairAttempts - 1) {
            const latencyMs = Date.now() - startTime;
            return this.buildErrorResult(
              request,
              resolved.source,
              version,
              'REPAIR_EXHAUSTED',
              `Repair exhausted after ${repairAttempts} attempts: ${repairErr.message}`,
              repairAttempts,
              latencyMs,
              activeModel,
              { systemPrompt, userPrompt, llmResponseText: lastRawContent },
              lastResponse
            );
          }
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    const usage = lastResponse?.usage || {};

    try {
      this.budgetEnforcer.assertOutputWithinBudget(
        { outputTokens: usage.output_tokens || usage.completion_tokens },
        maxOutputTokens
      );
      this.budgetEnforcer.assertLatencyWithinBudget(latencyMs, timeoutMs);
    } catch (budgetError: any) {
      return this.buildErrorResult(
        request,
        resolved.source,
        version,
        budgetError.code || 'BUDGET_EXCEEDED',
        budgetError.message,
        repairAttempts,
        latencyMs,
        activeModel,
        { systemPrompt, userPrompt, llmResponseText: lastRawContent },
        lastResponse
      );
    }

    if (!parsed) {
      throw new Error('Parsed output is undefined - this should never happen');
    }

    const result: LlmOperationV2Result = {
      success: true,
      operationRef: {
        id: request.operationId,
        version: version.version,
        digest: version.operationDigest,
      },
      source: resolved.source,
      data: parsed.data,
      usage: {
        inputTokens: usage.input_tokens || usage.prompt_tokens,
        outputTokens: usage.output_tokens || usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
      metadata: {
        provider: activeModel.provider,
        requestedModel: activeModel.name,
        resolvedModel: activeModel.name,
        finishReason: lastResponse?.finishReason,
        repairAttempts,
        latencyMs,
        schemaValidated: parsed.schemaValidated,
        toolCallDetected: false,
      },
      ...(this.promptDebugSettingsService.isPromptDebugEnabled()
        ? {
            promptDebug: {
              systemPrompt,
              userPrompt,
              modelId: activeModel.id,
              llmResponseText: lastRawContent,
              repairAttempts,
            },
          }
        : {}),
    };

    await this.auditService
      .recordInvocation({
        versionId: version.id,
        executionId: request.executionId,
        stepId: request.stepId,
        provider: activeModel.provider,
        requestedModel: activeModel.name,
        resolvedModel: activeModel.name,
        inputDigest: this.computeDigest(request.input),
        outputDigest: this.computeDigest(parsed.data),
        idempotencyKey: request.idempotencyKey,
        resultJson: result as unknown as Record<string, unknown>,
        tokenUsage: result.usage,
        latencyMs,
        repairAttempts,
        parseAttempts: 1,
        validationResult: 'passed',
        finishReason: lastResponse?.finishReason,
        actor: request.actor ?? 'system',
        environment: request.environment ?? 'production',
        startedAt: new Date(startTime),
        completedAt: new Date(),
      })
      .catch(() => undefined);

    return result;
  }

  private buildErrorResult(
    request: ExecuteLlmOperationV2Request,
    source: 'database' | 'legacy_registry',
    version: LlmOperationVersionRecord | LegacyLlmOperationVersion,
    errorCode: string,
    errorMessage: string,
    repairAttempts: number,
    latencyMs: number,
    model: any,
    promptSnapshot?: { systemPrompt: string; userPrompt: string; llmResponseText: string },
    modelResponse?: LLMResponse
  ): LlmOperationV2Result {
    const usage = modelResponse?.usage;
    const normalizedUsage = {
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
      totalTokens: usage?.total_tokens,
    };
    const result: LlmOperationV2Result = {
      success: false,
      operationRef: {
        id: request.operationId,
        version: version.version,
        digest: version.operationDigest,
      },
      source,
      usage: normalizedUsage,
      metadata: {
        provider: model?.provider || 'unknown',
        requestedModel: model?.name || 'unknown',
        resolvedModel: model?.name || 'unknown',
        finishReason: modelResponse?.finishReason,
        repairAttempts,
        latencyMs,
        schemaValidated: false,
        toolCallDetected: false,
      },
      errorCode,
      errorMessage,
      ...(promptSnapshot && this.promptDebugSettingsService.isPromptDebugEnabled()
        ? {
            promptDebug: {
              systemPrompt: promptSnapshot.systemPrompt,
              userPrompt: promptSnapshot.userPrompt,
              modelId: model?.id || model?.name || 'unknown',
              llmResponseText: promptSnapshot.llmResponseText,
              repairAttempts,
            },
          }
        : {}),
    };

    this.auditService
      .recordInvocation({
        versionId: version.id,
        executionId: request.executionId,
        stepId: request.stepId,
        provider: model?.provider || 'unknown',
        requestedModel: model?.name || 'unknown',
        resolvedModel: model?.name || 'unknown',
        tokenUsage: normalizedUsage,
        latencyMs,
        repairAttempts,
        parseAttempts: 1,
        validationResult: 'failed',
        finishReason: modelResponse?.finishReason,
        errorCode,
        actor: request.actor ?? 'system',
        environment: request.environment ?? 'production',
        startedAt: new Date(Date.now() - latencyMs),
        completedAt: new Date(),
      })
      .catch(() => undefined);

    return result;
  }
}
