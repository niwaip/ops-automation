import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeterministicNodeInputResolverService } from './deterministic-node-input-resolver.service';
import { DeterministicFinalOutputService } from './deterministic-final-output.service';
import { LlmOperationRuntimeAdapter } from '../adapters/llm-operation-runtime.adapter';
import { ExecutionStreamService } from '../lifecycle/execution-stream.service';
import { RuntimeExecutionOrchestrator } from '../step-runner/runtime/runtime-execution.orchestrator';
import { DeterministicPlanDraftV1, ValueBindingV1, computePlanHash } from '@ops/backend-deterministic-plan';

@Injectable()
export class DeterministicPlanSchedulerService {
  private readonly logger = new Logger(DeterministicPlanSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inputResolver: DeterministicNodeInputResolverService,
    private readonly finalOutputService: DeterministicFinalOutputService,
    private readonly llmAdapter: LlmOperationRuntimeAdapter,
    private readonly orchestrator: RuntimeExecutionOrchestrator,
    private readonly eventPublisher: ExecutionStreamService,
  ) {}

  /**
   * Advances execution flow for a deterministic plan task.
   */
  public async advanceExecution(executionId: string): Promise<void> {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      include: {
        plan: true,
        steps: { orderBy: { stepIndex: 'asc' } },
      },
    });

    if (!execution || execution.executionMode !== 'deterministic_plan') {
      return;
    }

    if (execution.status === 'succeeded' || execution.status === 'failed' || execution.status === 'cancelled') {
      return;
    }

    // Plan Hash Tamper Check Gate
    if (execution.plan && execution.plan.planHash) {
      const computedHash = computePlanHash(execution.plan.planJson as any);
      if (computedHash !== execution.plan.planHash) {
        this.logger.error(
          `Execution ${executionId} planHash mismatch! Stored: ${execution.plan.planHash}, Computed: ${computedHash}`,
        );
        await this.prisma.execution.update({
          where: { id: executionId },
          data: {
            status: 'failed',
            failureReason: 'Execution plan hash verification failed (frozen plan tampered)',
            failureCode: 'FROZEN_PLAN_TAMPERED',
            endedAt: new Date(),
          },
        });
        await this.eventPublisher.createEvent(
          executionId,
          'execution.status_changed',
          {
            oldStatus: execution.status,
            newStatus: 'failed',
            failureCode: 'FROZEN_PLAN_TAMPERED',
            failureReason: 'Execution plan hash verification failed (frozen plan tampered)',
          },
        );
        return;
      }
    }

    // Mark parent execution as running if queued
    if (execution.status === 'queued') {
      await this.prisma.execution.update({
        where: { id: executionId },
        data: { status: 'running', startedAt: execution.startedAt || new Date() },
      });
    }

    // Check for any currently running steps under valid active lease
    const now = new Date();
    const runningStep = execution.steps.find(
      (s: any) => s.status === 'running' && s.leaseExpiresAt && new Date(s.leaseExpiresAt) > now,
    );
    if (runningStep) {
      this.logger.debug(`Execution ${executionId} has running step ${runningStep.planNodeId || runningStep.id} under active lease, waiting for completion.`);
      return;
    }

    // Find the next pending step (or step with expired lease)
    const nextPendingStep = execution.steps.find(
      (s: any) => s.status === 'pending' || (s.status === 'running' && (!s.leaseExpiresAt || new Date(s.leaseExpiresAt) <= now)),
    );

    // If no pending step remains, evaluate final outputs & complete parent execution
    if (!nextPendingStep) {
      await this.completeExecutionIfSatisfied(execution);
      return;
    }

    // Execute next pending step
    await this.executeStep(execution, nextPendingStep);
  }

  private async executeStep(execution: any, step: any): Promise<void> {
    const stepId = step.id;
    const planNodeId = step.planNodeId || step.name || `step_${step.stepIndex}`;

    // Acquire DB Lease Lock atomically
    const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minute lease
    const now = new Date();
    const updateResult = await this.prisma.executionStep.updateMany({
      where: {
        id: stepId,
        OR: [
          { status: 'pending' },
          { status: 'running', leaseExpiresAt: { lt: now } },
          { status: 'running', leaseExpiresAt: null },
        ],
      },
      data: {
        status: 'running',
        startedAt: new Date(),
        leaseOwner: 'deterministic-scheduler',
        leaseExpiresAt,
      },
    });

    if (updateResult.count === 0) {
      this.logger.warn(`Failed to acquire atomic lease for step ${stepId} in execution ${execution.id}`);
      return;
    }

    await this.eventPublisher.createEvent(
      execution.id,
      'execution.node.started' as any,
      {
        planNodeId,
        nodeKind: step.nodeKind,
        capabilityId: step.capabilityId,
        capabilityVersion: step.capabilityVersion,
      },
      { stepId },
    );
    await this.eventPublisher.createEvent(
      execution.id,
      'step.started',
      {
        stepId,
        planNodeId,
        name: step.name || planNodeId,
        action: step.capabilityId,
        nodeKind: step.nodeKind,
        capabilityId: step.capabilityId,
        capabilityVersion: step.capabilityVersion,
      },
      { stepId },
    );

    // Resolve inputs
    const inputBindings = (step.inputBindingsJson || {}) as Record<string, ValueBindingV1>;
    const resolvedInput = await this.inputResolver.resolveInputs(
      execution.id,
      inputBindings,
      (execution.inputJson as Record<string, any>) || {},
      step.capabilityId,
    );

    if (!resolvedInput.apiKey) {
      const defaultApiKey =
        process.env.TAVILY_API_KEY ||
        process.env.SEARCH_API_KEY ||
        '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';
      resolvedInput.apiKey = defaultApiKey;
    }

    await this.prisma.executionStep.update({
      where: { id: stepId },
      data: { resolvedInputJson: resolvedInput as any, inputJson: resolvedInput as any },
    });

    try {
      if (step.nodeKind === 'llm_operation') {
        await this.runLlmStep(execution, step, resolvedInput);
      } else {
        await this.runSkillStep(execution, step, resolvedInput);
      }

      // After successful step execution, schedule the next step
      await this.advanceExecution(execution.id);
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : 'Node execution failed';
      this.logger.error(`Step ${planNodeId} failed for execution ${execution.id}: ${errMsg}`);

      await this.prisma.executionStep.update({
        where: { id: stepId },
        data: {
          status: 'failed',
          errorMessage: errMsg,
          errorCode: error.code || 'NODE_EXECUTION_FAILED',
          endedAt: new Date(),
          leaseExpiresAt: null,
        },
      });

      // Mark parent execution as failed
      const failureReason = `Node '${planNodeId}' failed: ${errMsg}`;
      await this.prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: 'failed',
          failureReason,
          failureCode: error.code || 'NODE_EXECUTION_FAILED',
          endedAt: new Date(),
        },
      });

      await this.eventPublisher.createEvent(
        execution.id,
        'execution.node.failed' as any,
        { planNodeId, errorMessage: errMsg },
        { stepId },
      );
      await this.eventPublisher.createEvent(
        execution.id,
        'step.failed',
        {
          stepId,
          planNodeId,
          error: errMsg,
          errorMessage: errMsg,
          phaseStatus: 'failed',
        },
        { stepId },
      );
      await this.eventPublisher.createEvent(
        execution.id,
        'execution.status_changed',
        {
          oldStatus: 'running',
          newStatus: 'failed',
          failureCode: error.code || 'NODE_EXECUTION_FAILED',
          failureReason,
        },
        { stepId },
      );
    }
  }

  private async runLlmStep(execution: any, step: any, resolvedInput: Record<string, any>): Promise<void> {
    const contractMeta = step.outputContractJson || {};
    const result = await this.llmAdapter.executeOperation({
      executionId: execution.id,
      stepId: step.id,
      operationId: step.capabilityId,
      promptTemplateId: contractMeta.promptTemplateId || step.capabilityId,
      promptTemplateVersion: contractMeta.promptTemplateVersion || step.capabilityVersion || '1',
      modelPolicyId: contractMeta.modelPolicyId || 'task-default',
      input: resolvedInput,
    });

    if (!result.success) {
      throw new Error(result.errorMessage || `LLM Operation '${step.capabilityId}' returned failure`);
    }

    this.validateOutputContract(step, result.output || {});

    await this.prisma.executionStep.update({
      where: { id: step.id },
      data: {
        status: 'succeeded',
        outputJson: result.output as any,
        endedAt: new Date(),
        leaseExpiresAt: null,
      },
    });

    await this.eventPublisher.createEvent(
      execution.id,
      'execution.node.succeeded' as any,
      {
        planNodeId: step.planNodeId,
        output: result.output,
      },
      { stepId: step.id },
    );
    await this.eventPublisher.createEvent(
      execution.id,
      'step.succeeded',
      {
        stepId: step.id,
        planNodeId: step.planNodeId,
        result: result.output,
      },
      { stepId: step.id },
    );
  }

  private mapPlanRuntimeTypeToExecutionRuntime(
    runtimeType?: string,
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

  private async runSkillStep(execution: any, step: any, resolvedInput: Record<string, any>): Promise<void> {
    const capabilityId = step.capabilityId;
    const capabilityVersion = step.capabilityVersion;

    const stepIdempotencyKey = step.idempotencyKey || `${execution.id}:${step.id}:${step.planNodeId || step.capabilityId}`;
    const inputWithIdempotency = {
      ...resolvedInput,
      idempotencyKey: resolvedInput?.idempotencyKey || stepIdempotencyKey,
    };

    const planJson = (execution.plan?.planJson || {}) as any;
    const planNodes = planJson.nodes || [];
    const planNode = planNodes.find((n: any) => n.nodeId === step.planNodeId);
    const frozenMeta = planNode?.metadata || {};

    const isBuiltin = typeof capabilityId === 'string' && capabilityId.startsWith('platform.');
    const capabilityType = isBuiltin ? 'builtin' : 'skill.runtime';

    const definitionVersion = frozenMeta.definitionVersion || capabilityVersion;
    const metadata: Record<string, any> = {
      capabilityVersion,
      definitionVersion,
      idempotencyKey: stepIdempotencyKey,
    };
    if (isBuiltin) {
      metadata.builtinSkill = true;
      if (frozenMeta.handlerKey) metadata.handlerKey = frozenMeta.handlerKey;
      if (frozenMeta.definitionDigest) metadata.definitionDigest = frozenMeta.definitionDigest;
      if (frozenMeta.adapterRoute) metadata.adapterRoute = frozenMeta.adapterRoute;
      if (frozenMeta.skillVersion) metadata.skillVersion = frozenMeta.skillVersion;
    }

    const request = {
      requestId: `${execution.id}:${step.id}`,
      executionId: execution.id,
      stepId: step.id,
      runtimeType: this.mapPlanRuntimeTypeToExecutionRuntime(
        step.action || step.outputContractJson?.runtimeType,
      ),
      runtimeSessionId: '',
      skillId: capabilityId,
      publishedSkillId: capabilityId,
      capabilityType,
      action: 'execute',
      input: inputWithIdempotency,
      policyContext: {},
      traceContext: { userId: execution.createdBy || undefined },
      metadata,
    };

    const result = await this.orchestrator.executeStep(request);

    if (!result || !result.success) {
      const errMsg = result?.errorMessage || `Skill execution '${capabilityId}' failed`;
      throw new Error(errMsg);
    }

    const outputJson = (result.output || {}) as Record<string, any>;
    this.validateOutputContract(step, outputJson);

    await this.prisma.executionStep.update({
      where: { id: step.id },
      data: {
        status: 'succeeded',
        outputJson: outputJson as any,
        endedAt: new Date(),
        leaseExpiresAt: null,
      },
    });

    // Save artifacts if generated by skill step
    const rawArtifacts = result.artifacts || outputJson?.artifacts || (outputJson?.artifact ? [outputJson.artifact] : undefined);
    if (Array.isArray(rawArtifacts)) {
      for (const art of rawArtifacts) {
        const artifactUrl = art.url || art.storageUri;
        if (art && artifactUrl) {
          const createdArtifact = await this.prisma.executionArtifact.create({
            data: {
              executionId: execution.id,
              producerStepId: step.id,
              producerNodeId: step.planNodeId || step.id,
              artifactType: art.type || art.artifactType || 'file',
              name: art.name || 'output_artifact',
              url: artifactUrl,
              mimeType: art.mimeType || 'application/octet-stream',
              sizeBytes: art.sizeBytes ? BigInt(art.sizeBytes) : null,
              sha256: art.sha256 || art.metadata?.sha256 || art.metadata_json?.sha256 || null,
              metadataJson: art.metadata || null,
            },
          });

          await this.eventPublisher.createEvent(
            execution.id,
            'execution.artifact.created' as any,
            {
              artifactId: createdArtifact.id,
              name: createdArtifact.name,
              url: createdArtifact.url,
              mimeType: createdArtifact.mimeType,
            },
            { stepId: step.id },
          );
        }
      }
    }

    await this.eventPublisher.createEvent(
      execution.id,
      'execution.node.succeeded' as any,
      {
        planNodeId: step.planNodeId,
        output: outputJson,
      },
      { stepId: step.id },
    );
    await this.eventPublisher.createEvent(
      execution.id,
      'step.succeeded',
      {
        stepId: step.id,
        planNodeId: step.planNodeId,
        result: outputJson,
      },
      { stepId: step.id },
    );
  }

  private async completeExecutionIfSatisfied(execution: any): Promise<void> {
    const planDraft = execution.plan?.planJson as DeterministicPlanDraftV1;

    if (!planDraft) {
      await this.prisma.execution.update({
        where: { id: execution.id },
        data: { status: 'succeeded', endedAt: new Date() },
      });
      await this.eventPublisher.createEvent(
        execution.id,
        'execution.status_changed',
        {
          oldStatus: execution.status,
          newStatus: 'succeeded',
        },
      );
      return;
    }

    const checkResult = await this.finalOutputService.assertSatisfied(execution.id, planDraft);

    if (!checkResult.satisfied) {
      this.logger.error(`Execution ${execution.id} final output check failed: ${checkResult.errorMessage}`);
      await this.prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: 'failed',
          failureCode: checkResult.errorCode || 'FINAL_OUTPUT_MISSING',
          failureReason: checkResult.errorMessage || 'Final outputs unsatisfied',
          endedAt: new Date(),
        },
      });
      await this.eventPublisher.createEvent(
        execution.id,
        'execution.status_changed',
        {
          oldStatus: execution.status,
          newStatus: 'failed',
          failureCode: checkResult.errorCode || 'FINAL_OUTPUT_MISSING',
          failureReason: checkResult.errorMessage || 'Final outputs unsatisfied',
        },
      );
      return;
    }

    await this.prisma.execution.update({
      where: { id: execution.id },
      data: {
        status: 'succeeded',
        endedAt: new Date(),
        resultJson: {
          artifacts: checkResult.artifacts || [],
        } as any,
      },
    });
    await this.eventPublisher.createEvent(
      execution.id,
      'execution.status_changed',
      {
        oldStatus: execution.status,
        newStatus: 'succeeded',
      },
    );

    this.logger.log(`Execution ${execution.id} successfully completed all deterministic plan steps.`);
  }

  private validateOutputContract(step: any, output: Record<string, any>): void {
    const contract = step.outputContractJson;
    if (!contract || typeof contract !== 'object') return;

    for (const expectedKey of Object.keys(contract)) {
      if (this.isOutputContractMetadataField(expectedKey)) continue;
      let val = output ? output[expectedKey] : undefined;

      // Automatically map common search/data aliases if specific expectedKey is not directly present
      if ((val === undefined || val === null) && output && typeof output === 'object') {
        const nestedResult =
          output['result'] && typeof output['result'] === 'object'
            ? output['result'] as Record<string, any>
            : undefined;
        const businessData =
          nestedResult?.businessData && typeof nestedResult.businessData === 'object'
            ? nestedResult.businessData as Record<string, any>
            : output['businessData'] && typeof output['businessData'] === 'object'
              ? output['businessData'] as Record<string, any>
              : undefined;
        if (expectedKey === 'searchResults' && (output['results'] || output['news_item_list'] || output['data'] || nestedResult?.results || businessData?.results || businessData?.searchResults)) {
          val = output['results'] || output['news_item_list'] || output['data'] || nestedResult?.results || businessData?.results || businessData?.searchResults;
          output['searchResults'] = val;
        } else if (expectedKey === 'results' && (output['searchResults'] || output['news_item_list'] || output['data'])) {
          val = output['searchResults'] || output['news_item_list'] || output['data'];
          output['results'] = val;
        } else if (expectedKey === 'news_item_list' && (output['results'] || output['searchResults'] || output['data'])) {
          val = output['results'] || output['searchResults'] || output['data'];
          output['news_item_list'] = val;
        } else if (businessData && businessData[expectedKey] !== undefined && businessData[expectedKey] !== null) {
          // Generic fallback: workflows nest business data fields under
          // result.businessData.<field> (see WebSearchWorkflow._build_workflow_result).
          // Surface them to the top level so we don't need a per-field alias table.
          val = businessData[expectedKey];
          output[expectedKey] = val;
        }
      }

      if (val === undefined || val === null) {
        throw new Error(
          `Runtime output contract violation for node '${step.planNodeId || step.id}': missing expected output field '${expectedKey}'`,
        );
      }

      // Deep type contract validations - generic type checks
      if (expectedKey === 'results' || expectedKey === 'news_item_list' || expectedKey === 'searchResults') {
        if (!Array.isArray(val)) {
          if (typeof val === 'string' || (typeof val === 'object' && val !== null)) {
            // Accept string or object representation of search results
          } else {
            throw new Error(
              `Runtime output contract violation for node '${step.planNodeId || step.id}': field '${expectedKey}' must be an Array or Object, got ${typeof val}`,
            );
          }
        }
        continue;
      }

      if (expectedKey === 'markdown_content') {
        if (typeof val !== 'string') {
          throw new Error(
            `Runtime output contract violation for node '${step.planNodeId || step.id}': field 'markdown_content' must be a string, got ${typeof val}`,
          );
        }
        if (val.trim().length === 0) {
          throw new Error(
            `Runtime output contract violation for node '${step.planNodeId || step.id}': field 'markdown_content' must be a non-empty string`,
          );
        }
        continue;
      }

      if (expectedKey === 'downloadUrl') {
        if (typeof val !== 'string') {
          throw new Error(
            `Runtime output contract violation for node '${step.planNodeId || step.id}': field 'downloadUrl' must be a string, got ${typeof val}`,
          );
        }
        if (!val.startsWith('/') && !val.startsWith('http://') && !val.startsWith('https://')) {
          throw new Error(
            `Runtime output contract violation for node '${step.planNodeId || step.id}': field 'downloadUrl' must be a valid URL (starts with /, http://, or https://)`,
          );
        }
        continue;
      }

      if (expectedKey === 'artifact_ref' || expectedKey === 'artifact') {
        if (typeof val !== 'object' || val === null) {
          throw new Error(
            `Runtime output contract violation for node '${step.planNodeId || step.id}': field '${expectedKey}' must be an object (ArtifactRef), got ${typeof val}`,
          );
        }
        if (!val.url || typeof val.url !== 'string') {
          throw new Error(
            `Runtime output contract violation for node '${step.planNodeId || step.id}': field '${expectedKey}.url' is required and must be a string`,
          );
        }
        if (!val.name || typeof val.name !== 'string') {
          throw new Error(
            `Runtime output contract violation for node '${step.planNodeId || step.id}': field '${expectedKey}.name' is required and must be a string`,
          );
        }
        if (!val.mimeType || typeof val.mimeType !== 'string') {
          throw new Error(
            `Runtime output contract violation for node '${step.planNodeId || step.id}': field '${expectedKey}.mimeType' is required and must be a string`,
          );
        }
        // Validate MIME type format
        if (!/^[a-z]+\/[a-z0-9\-\+\.]+(;\s*charset=[a-zA-Z0-9\-]+)?$/.test(val.mimeType)) {
          throw new Error(
            `Runtime output contract violation for node '${step.planNodeId || step.id}': field '${expectedKey}.mimeType' has invalid format: '${val.mimeType}'`,
          );
        }
        continue;
      }

      if (expectedKey === 'artifacts') {
        if (!Array.isArray(val)) {
          throw new Error(
            `Runtime output contract violation for node '${step.planNodeId || step.id}': field 'artifacts' must be an Array, got ${typeof val}`,
          );
        }
        if (val.length === 0) {
          throw new Error(
            `Runtime output contract violation for node '${step.planNodeId || step.id}': field 'artifacts' must be a non-empty Array when declared in output contract`,
          );
        }
        const invalidArtifact = val.find(art => !art || typeof art !== 'object' || !art.url || typeof art.url !== 'string' || !art.name || !art.mimeType);
        if (invalidArtifact) {
          throw new Error(
            `Runtime output contract violation for node '${step.planNodeId || step.id}': field 'artifacts' items must be valid ArtifactRef objects with url, name, and mimeType`,
          );
        }
        continue;
      }

      // Generic type-aware checks based on the value type
      // Note: contract[expectedKey] === 'string' is the most common fallback
      // (extractSchemaSummary defaults unknown object-valued params to 'string'),
      // so we tolerate non-string runtime values here. The presence check above
      // is what really guards against missing outputs; the type tag is only a
      // descriptive hint that schemas can't always express precisely.
      if (contract[expectedKey] === 'object' && (typeof val !== 'object' || val === null || Array.isArray(val))) {
        throw new Error(
          `Runtime output contract violation for node '${step.planNodeId || step.id}': field '${expectedKey}' expected object, got ${typeof val}`,
        );
      }
    }
  }

  private isOutputContractMetadataField(fieldName: string): boolean {
    return [
      'runtimeType',
      'executionRuntimeType',
      'promptTemplateId',
      'promptTemplateVersion',
      'modelPolicyId',
      'temperature',
      'maxInputTokens',
      'maxOutputTokens',
      '_frozenMetadata',
    ].includes(fieldName);
  }
}
