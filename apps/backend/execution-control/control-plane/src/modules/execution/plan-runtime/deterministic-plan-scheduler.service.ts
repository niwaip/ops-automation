import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeterministicNodeInputResolverService } from './deterministic-node-input-resolver.service';
import { DeterministicFinalOutputService } from './deterministic-final-output.service';
import { LlmOperationRuntimeAdapter } from '../adapters/llm-operation-runtime.adapter';
import { ExecutionStreamService } from '../lifecycle/execution-stream.service';
import { RuntimeExecutionOrchestrator } from '../step-runner/runtime/runtime-execution.orchestrator';
import { DeterministicPlanDraftV1, ValueBindingV1, computePlanHash } from '@ops/backend-deterministic-plan';
import { jsonSchemaValidator } from '@ops/backend-runtime-capability-contract';
import { ContractViolationError } from './contract-violation.error';
import { LegacyOutputAdapterService } from './legacy-output-adapter.service';
import { CapabilityContractCatalogService } from './capability-contract-catalog.service';
import { OutputNormalizerService } from './output-normalizer.service';
import { GracePolicyService } from './grace-policy.service';
import { ERROR_CODES } from '@ops/backend-error-codes';

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
    private readonly legacyOutputAdapter: LegacyOutputAdapterService,
    private readonly contractCatalog: CapabilityContractCatalogService,
    private readonly outputNormalizer: OutputNormalizerService,
    private readonly gracePolicy: GracePolicyService,
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

    // Legacy grace period gate (§17.1): after the grace deadline, never-started
    // executions that would run on legacy contract semantics are rejected
    // before any further progress. Already-started executions are protected.
    // Fix ⑩: only LEGACY plans (nodes without authoritative contractRef)
    // are subject to the gate — V2 frozen plans are exempt, so a legacy
    // migration deadline can never reject an authoritative-contract execution.
    if (this.isLegacyPlan(execution) && this.gracePolicy.shouldReject(execution.status)) {
      this.logger.warn(
        `Execution ${executionId} rejected by legacy grace policy (status=${execution.status}, grace expired)`,
      );
      await this.prisma.execution.update({
        where: { id: executionId },
        data: {
          status: 'failed',
          failureReason: 'Legacy grace period expired — execution rejected before start',
          failureCode: 'LEGACY_GRACE_EXPIRED',
          endedAt: new Date(),
        },
      });
      await this.eventPublisher.createEvent(
        executionId,
        'execution.legacy_grace.rejected',
        {
          oldStatus: execution.status,
          newStatus: 'failed',
          failureCode: 'LEGACY_GRACE_EXPIRED',
          failureReason: 'Legacy grace period expired — execution rejected before start',
        },
      );
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
      // P2 digest re-check: if the frozen contract changed in the catalog since
      // freeze, refuse to start the step (design doc §15.3-5 acceptance).
      await this.verifyFrozenContractDigest(execution, step);

      if (step.nodeKind === 'llm_operation') {
        await this.runLlmStep(execution, step, resolvedInput);
      } else {
        await this.runSkillStep(execution, step, resolvedInput);
      }

      // After successful step execution, schedule the next step
      await this.advanceExecution(execution.id);
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : 'Node execution failed';
      // Structured contract-violation context (design doc §12.1) flows into events
      // so downstream consumers get stable codes + machine-readable context.
      const errContext = error instanceof ContractViolationError ? error.context : undefined;
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
        { planNodeId, errorMessage: errMsg, errorCode: error.code, errorContext: errContext },
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
          errorCode: error.code,
          errorContext: errContext,
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

  /**
   * Verifies the frozen contract digest still matches the catalog at step
   * start (design doc §15.3-5 / §9.3). Steps frozen before digest support
   * (legacy) are skipped. Transient catalog lookup failure only logs — the
   * frozen plan is still internally consistent — while a digest MISMATCH
   * rejects the start because the capability contract changed after freeze.
   */
  private async verifyFrozenContractDigest(execution: any, step: any): Promise<void> {
    const frozenMeta = (step.outputContractJson?._frozenMetadata) || {};
    const frozenDigest = frozenMeta.contractDigest;
    if (!frozenDigest) {
      return;
    }
    // Version-precise re-resolution (fix ③ + ④): a frozen step binds the
    // EXACT capability version pinned at freeze — the drift check re-resolves
    // that same version, never silently the active one (publishing a new
    // version must not reject steps bound to an immutable older version).
    const node: Record<string, unknown> = {
      kind: step.nodeKind,
      nodeId: step.planNodeId,
      skillId: step.capabilityId,
      capabilityKey: step.capabilityId,
      operationId: step.capabilityId,
    };
    if (step.capabilityVersion) {
      node.skillVersion = step.capabilityVersion;
      node.promptTemplateVersion = step.capabilityVersion;
    }
    const contract = await this.contractCatalog.tryResolveContract(this.prisma, node);
    if (!contract?.outputSchema) {
      // Fail-closed (§15.3-5 / §9.3): this step was frozen WITH a pinned
      // contract digest — the catalog must still resolve that exact version
      // at step start. An unresolvable contract here means the frozen plan
      // cannot bind its authority anymore, so the step must not run against
      // an unverifiable contract. (Steps frozen before digest support never
      // reach this point — they return above without a frozenDigest.)
      this.logger.error(
        `Contract re-resolution unavailable for node '${step.planNodeId}' despite frozen digest ${frozenDigest} — refusing to start the step`,
      );
      throw new ContractViolationError(
        ERROR_CODES.CAPABILITY_CONTRACT_NOT_FOUND,
        `CAPABILITY_CONTRACT_NOT_FOUND for node '${step.planNodeId}': the frozen contract (digest ${frozenDigest}) can no longer be resolved in the catalog; re-create the task to re-freeze with a resolvable contract`,
        {
          executionId: execution.id,
          nodeId: step.planNodeId,
          capabilityId: step.capabilityId,
          capabilityVersion: step.capabilityVersion,
          contractDigest: frozenDigest,
          contractCheckMode: 'schema',
        },
      );
    }
    // Same shared contract-envelope semantics as the freeze-time digest (fix
    // ④) — covers input + output contracts and metadata, not just the output
    // schema, so input-contract drift is detected too.
    const currentDigest = this.contractCatalog.computeContractDigest(node, contract);
    if (currentDigest !== frozenDigest) {
      this.logger.error(
        `Frozen contract digest mismatch for node '${step.planNodeId}': frozen ${frozenDigest} vs catalog ${currentDigest}`,
      );
      throw new ContractViolationError(
        ERROR_CODES.CAPABILITY_CONTRACT_DIGEST_MISMATCH,
        `CAPABILITY_CONTRACT_DIGEST_MISMATCH for node '${step.planNodeId}': the capability contract changed in the catalog after plan freeze; re-create the task to re-freeze with the current contract`,
        {
          executionId: execution.id,
          nodeId: step.planNodeId,
          capabilityId: step.capabilityId,
          capabilityVersion: step.capabilityVersion,
          contractDigest: frozenDigest,
          contractCheckMode: 'schema',
        },
      );
    }
  }

  /**
   * Runtime input validation (design doc §11.1): when an authoritative input
   * schema was frozen with the plan, the resolved input must satisfy it before
   * the capability call. Missing input schemas (custom skills) are skipped.
   */
  private validateInputContract(step: any, input: Record<string, any>, executionId: string): void {
    const inputSchema = step.inputSchemaJson;
    if (!inputSchema || typeof inputSchema !== 'object' || Object.keys(inputSchema).length === 0) {
      return;
    }
    // apiKey is scheduler-injected transport/credential metadata (not part of
    // the capability input contract) — exclude it from contract validation so
    // closed-object schemas (additionalProperties: false) don't reject it.
    const { apiKey: _apiKey, ...contractInput } = input;
    const validation = jsonSchemaValidator.validate(contractInput || {}, inputSchema);
    if (!validation.valid) {
      const firstError = validation.errors?.[0] as any;
      const errMsgs = validation.errors
        ?.map((e: any) => `${e.path}${e.keyword ? ` (${e.keyword})` : ''}: ${e.message}`)
        .join('; ');
      throw new ContractViolationError(
        ERROR_CODES.INPUT_SCHEMA_VIOLATION,
        `INPUT_SCHEMA_VIOLATION for node '${step.planNodeId || step.id}': ${errMsgs}`,
        {
          executionId,
          nodeId: step.planNodeId || step.id,
          capabilityId: step.capabilityId,
          capabilityVersion: step.capabilityVersion,
          contractCheckMode: 'schema',
          instancePath: firstError?.path,
          keyword: firstError?.keyword,
        },
      );
    }
  }

  private async runLlmStep(execution: any, step: any, resolvedInput: Record<string, any>): Promise<void> {
    this.validateInputContract(step, resolvedInput, execution.id);
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

    const normalizedOutput = this.validateOutputContract(step, result.output || {}, execution.id);

    await this.prisma.executionStep.update({
      where: { id: step.id },
      data: {
        status: 'succeeded',
        outputJson: normalizedOutput as any,
        endedAt: new Date(),
        leaseExpiresAt: null,
      },
    });

    await this.eventPublisher.createEvent(
      execution.id,
      'execution.node.succeeded' as any,
      {
        planNodeId: step.planNodeId,
        output: normalizedOutput,
      },
      { stepId: step.id },
    );
    await this.eventPublisher.createEvent(
      execution.id,
      'step.succeeded',
      {
        stepId: step.id,
        planNodeId: step.planNodeId,
        result: normalizedOutput,
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
    this.validateInputContract(step, resolvedInput, execution.id);
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

    const outputJson = this.validateOutputContract(
      step,
      (result.output || {}) as Record<string, any>,
      execution.id,
    );

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

    // Resolve each final output target from its producer step so downstream
    // consumers (chat layer, REST API) can surface the actual content instead
    // of only artifact metadata. Earlier code dropped this entirely and stored
    // only `{ artifacts: [] }`, which forced chat into re-running an LLM
    // "summary" against nothing and producing fabricated content.
    const finalOutputs = await this.resolveFinalOutputs(
      execution.id,
      planDraft,
      checkResult.artifacts || [],
    );

    // Surface the resolved body/summary at the top level so the chat result
    // normalizer can render it without triggering another LLM call.
    const topLevelBody = this.pickTopLevelBody(finalOutputs);
    const topLevelTitle = this.pickTopLevelTitle(finalOutputs, planDraft);

    await this.prisma.execution.update({
      where: { id: execution.id },
      data: {
        status: 'succeeded',
        endedAt: new Date(),
        resultJson: {
          artifacts: checkResult.artifacts || [],
          finalOutputs,
          ...(topLevelBody ? { body: topLevelBody, summary: topLevelBody } : {}),
          ...(topLevelTitle ? { title: topLevelTitle } : {}),
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

  private async resolveFinalOutputs(
    executionId: string,
    planDraft: DeterministicPlanDraftV1,
    artifacts: any[],
  ): Promise<Array<Record<string, any>>> {
    const outputs: Array<Record<string, any>> = [];
    if (!Array.isArray(planDraft.finalOutputs) || planDraft.finalOutputs.length === 0) {
      return outputs;
    }

    const steps = await this.prisma.executionStep.findMany({
      where: { executionId, status: 'succeeded' },
    });
    const stepByNode = new Map<string, any>();
    for (const step of steps) {
      if (step.planNodeId) stepByNode.set(step.planNodeId, step);
    }

    for (const req of planDraft.finalOutputs) {
      const step = stepByNode.get(req.fromNodeId);
      if (!step) continue;
      const outputData = (step.outputJson as Record<string, any>) || {};
      const value = outputData[req.fromNodeOutput];

      const matchedArtifact = artifacts.find(
        (art: any) => art.producerNodeId === req.fromNodeId || art.producerStepId === step.id,
      );

      outputs.push({
        targetField: req.targetField,
        fromNodeId: req.fromNodeId,
        fromNodeOutput: req.fromNodeOutput,
        expectedType: req.expectedType,
        mimeType: req.mimeType,
        isArtifact: Boolean(req.isArtifact),
        value,
        artifact: matchedArtifact,
      });
    }

    return outputs;
  }

  private pickTopLevelBody(finalOutputs: Array<Record<string, any>>): string | undefined {
    const priorityKeys = ['markdown_content', 'summary', 'body', 'content', 'text'];
    for (const key of priorityKeys) {
      const match = finalOutputs.find((o) => typeof o.value === 'string' && o.value.length > 0);
      if (!match) continue;
      if (typeof match.value !== 'string') continue;
      if (priorityKeys.includes(String(match.fromNodeOutput)) || priorityKeys.includes(String(match.targetField))) {
        return match.value;
      }
    }
    // Fallback: any non-artifact string value, longest first.
    const stringCandidates = finalOutputs
      .filter((o) => typeof o.value === 'string' && o.value.length > 0 && !o.isArtifact)
      .sort((a, b) => (b.value as string).length - (a.value as string).length);
    return stringCandidates[0]?.value;
  }

  private pickTopLevelTitle(
    finalOutputs: Array<Record<string, any>>,
    planDraft: DeterministicPlanDraftV1,
  ): string | undefined {
    const titled = finalOutputs.find((o) => typeof o.value === 'string' && o.value.length > 0 && o.isArtifact);
    if (titled?.artifact?.name) return titled.artifact.name;
    if (planDraft?.objective) return planDraft.objective;
    return undefined;
  }

  private validateOutputContract(step: any, output: Record<string, any>, executionId: string): Record<string, any> {
    const contract = step.outputContractJson;
    // Authoritative schema is frozen at plan freeze time only (design doc §6.3/§9.3).
    // Planner self-reported schemas are never trusted at runtime.
    const outputSchema = step.outputSchemaJson;
    const dataPath = step.dataPath || contract?.dataPath;
    const frozenMeta = (contract && typeof contract === 'object' ? contract._frozenMetadata : null) || {};
    const nodeId = step.planNodeId || step.id;

    // Unified output normalization (§15.3 item 6): searchResults synthesis +
    // businessData surfacing always; the legacy alias closure only for the
    // keys the contract declares (so strict V2 schemas never see newly
    // synthesized keys). The normalized output is what callers persist.
    const contractKeys =
      contract && typeof contract === 'object' && !Array.isArray(contract)
        ? Object.keys(contract)
        : [];

    // V2 contract mode (see docs/design/unified-capability-contract-and-validation-design.md
    // §3.5 / §17.3): when an authoritative output schema is frozen with the
    // plan (resolved from the capability catalog at freeze time), the JSON
    // Schema is the SOLE runtime arbiter. Legacy capabilities without an
    // authoritative schema are delegated to the Legacy Output Adapter (§7.2 /
    // §17.3). Field names the planner declared but the schema does not (LLM
    // hallucination) are intentionally not enforced here — the schema is the
    // contract, and closed-object semantics (`additionalProperties: false`)
    // still catch genuine producer drift with a precise instance path.
    if (outputSchema && typeof outputSchema === 'object' && Object.keys(outputSchema).length > 0) {
      // Validate EXACTLY what the workflow returned (extracted payload, else
      // the raw output) — never the normalized copy, whose synthesized keys
      // would trip `additionalProperties: false` on flat outputs.
      // falsy-safe：extractDataByPath 仅在路径缺失时返回 undefined，合法的
      // falsy 业务值（0 / false / '' / []）必须原样保留，不能整体回退到 raw output。
      const extractedData = jsonSchemaValidator.extractDataByPath(output, dataPath || '$.result.businessData');
      const schemaTarget = extractedData === undefined ? output : extractedData;
      const schemaValidation = jsonSchemaValidator.validate(schemaTarget, outputSchema);
      if (!schemaValidation.valid) {
        const errMsgs = schemaValidation.errors
          ?.map((e: any) => `${e.path}${e.keyword ? ` (${e.keyword})` : ''}: ${e.message}`)
          .join('; ');
        const firstError = schemaValidation.errors?.[0] as any;
        throw new ContractViolationError(
          ERROR_CODES.OUTPUT_SCHEMA_VIOLATION,
          `OUTPUT_SCHEMA_VIOLATION for node '${nodeId}': ${errMsgs}`,
          {
            executionId,
            nodeId,
            capabilityId: step.capabilityId,
            capabilityVersion: step.capabilityVersion,
            contractDigest: frozenMeta.contractDigest,
            contractCheckMode: 'schema',
            instancePath: firstError?.path,
            keyword: firstError?.keyword,
          },
        );
      }
      // Persist the normalized output for downstream node_output resolution.
      // The schema IS the contract: only its declared property names are
      // eligible for alias materialization (§15.3 item 6).
      const schemaProps = Object.keys((outputSchema as any).properties || {});
      return this.outputNormalizer.normalize(output, schemaProps) || {};
    }

    // V1 legacy: delegate all heuristic compatibility logic to the adapter.
    const normalizedOutput = this.outputNormalizer.normalize(output, contractKeys) || {};
    this.legacyOutputAdapter.validateV1Contract(step, normalizedOutput, {
      executionId,
      nodeId,
      capabilityId: step.capabilityId,
      capabilityVersion: step.capabilityVersion,
    });
    return normalizedOutput;
  }

  /**
   * Legacy vs V2 classification for the grace gate (fix ⑩).
   *
   * A frozen plan is V2 when EVERY node carries an authoritative `contractRef`
   * (attached at freeze time, §9.3). Plans with no frozen plan, no nodes, or
   * any node lacking a contractRef are treated as legacy — they are the only
   * executions the legacy grace deadline may reject.
   */
  private isLegacyPlan(execution: any): boolean {
    const nodes = (execution?.plan?.planJson as any)?.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0) return true;
    return nodes.some((node: any) => !node?.contractRef);
  }
}
