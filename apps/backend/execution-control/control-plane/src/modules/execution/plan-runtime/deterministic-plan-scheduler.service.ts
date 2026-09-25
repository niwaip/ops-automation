import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeterministicNodeInputResolverService } from './deterministic-node-input-resolver.service';
import { DeterministicFinalOutputService } from './deterministic-final-output.service';
import { LlmOperationRuntimeAdapter } from '../adapters/llm-operation-runtime.adapter';
import { ExecutionStreamService } from '../lifecycle/execution-stream.service';
import { RuntimeExecutionOrchestrator } from '../step-runner/runtime/runtime-execution.orchestrator';
import {
  BROWSER_RECORDING_ROOT_NODE_ID,
  DeterministicPlanDraftV1,
  ValueBindingV1,
  computePlanHash,
} from '@ops/backend-deterministic-plan';
import { ContractViolationError } from './contract-violation.error';
import { LegacyOutputAdapterService } from './legacy-output-adapter.service';
import { CapabilityContractCatalogService } from './capability-contract-catalog.service';
import { OutputNormalizerService } from './output-normalizer.service';
import { GracePolicyService } from './grace-policy.service';
import { ERROR_CODES } from '@ops/backend-error-codes';
import { buildDeterministicExecutionResult } from './deterministic-execution-result.builder';
import { DeterministicReadySetService } from './deterministic-ready-set.service';
import { ResultRefService } from '../result-ref/result-ref.service';
import { unwrapStoredStepOutput } from './stored-step-output';
import { DeterministicRuntimeSessionCoordinatorService } from './deterministic-runtime-session-coordinator.service';
import { ExecutionPhaseSyncService } from '../state/execution-phase-sync.service';
import { CompletionClaimSynthesizerService } from './completion-claim-synthesizer.service';
import {
  projectLlmOperationInput,
  validateInputContract,
  validateOutputContract as validateOutputContractValue,
} from './deterministic-contract-validation';
import {
  extractArtifacts,
  extractFinalOutputsFromSteps,
  handlePreparedOutboundEffectStep,
  isLegacyPlan,
  mapPlanRuntimeTypeToExecutionRuntime,
  materializeContentRefs,
  resolveBrowserRunOutputSchemaDigest,
  resolveOutboundEffectMetadata,
} from './deterministic-plan-scheduler.helpers';

@Injectable()
export class DeterministicPlanSchedulerService {
  private readonly logger = new Logger(DeterministicPlanSchedulerService.name);

  validateOutputContract(step: any, output: Record<string, any>, executionId: string) {
    return validateOutputContractValue(
      step,
      output,
      executionId,
      this.outputNormalizer,
      this.legacyOutputAdapter
    );
  }

  mapPlanRuntimeTypeToExecutionRuntime(runtimeType?: string) {
    return mapPlanRuntimeTypeToExecutionRuntime(runtimeType);
  }

  isLegacyPlan(execution: any) {
    return isLegacyPlan(execution);
  }

  async materializeContentRefs(
    executionId: string,
    producerStepId: string,
    output: Record<string, any>
  ): Promise<Record<string, any>> {
    return materializeContentRefs(executionId, producerStepId, output, this.resultRefs);
  }

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
    private readonly readySet: DeterministicReadySetService = new DeterministicReadySetService(),
    @Optional() private readonly resultRefs?: ResultRefService,
    @Optional()
    private readonly runtimeSessionCoordinator?: DeterministicRuntimeSessionCoordinatorService,
    @Optional()
    private readonly executionPhaseSyncService?: ExecutionPhaseSyncService,
    @Optional()
    private readonly completionClaims?: CompletionClaimSynthesizerService
  ) {}

  /**
   * Advances execution flow for a deterministic plan task.
   */
  public async advanceExecution(
    executionId: string,
    options?: { traceContext?: any }
  ): Promise<void> {
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

    if (
      execution.status === 'succeeded' ||
      execution.status === 'failed' ||
      execution.status === 'cancelled' ||
      execution.status === 'pending_approval'
    ) {
      return;
    }

    // Legacy grace period gate (§17.1): after the grace deadline, never-started
    // executions that would run on legacy contract semantics are rejected
    // before any further progress. Already-started executions are protected.
    // Fix ⑩: only LEGACY plans (nodes without authoritative contractRef)
    // are subject to the gate — V2 frozen plans are exempt, so a legacy
    // migration deadline can never reject an authoritative-contract execution.
    if (isLegacyPlan(execution) && this.gracePolicy.shouldReject(execution.status)) {
      this.logger.warn(
        `Execution ${executionId} rejected by legacy grace policy (status=${execution.status}, grace expired)`
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
      await this.eventPublisher.createEvent(executionId, 'execution.legacy_grace.rejected', {
        oldStatus: execution.status,
        newStatus: 'failed',
        failureCode: 'LEGACY_GRACE_EXPIRED',
        failureReason: 'Legacy grace period expired — execution rejected before start',
      });
      await this.closeRuntimeSessions(executionId, 'deterministic_legacy_grace_rejected');
      return;
    }

    // Plan Hash Tamper Check Gate
    if (execution.plan && execution.plan.planHash) {
      const computedHash = computePlanHash(execution.plan.planJson as any);
      if (computedHash !== execution.plan.planHash) {
        this.logger.error(
          `Execution ${executionId} planHash mismatch! Stored: ${execution.plan.planHash}, Computed: ${computedHash}`
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
        await this.eventPublisher.createEvent(executionId, 'execution.status_changed', {
          oldStatus: execution.status,
          newStatus: 'failed',
          failureCode: 'FROZEN_PLAN_TAMPERED',
          failureReason: 'Execution plan hash verification failed (frozen plan tampered)',
        });
        await this.closeRuntimeSessions(executionId, 'deterministic_plan_tampered');
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
      (s: any) => s.status === 'running' && s.leaseExpiresAt && new Date(s.leaseExpiresAt) > now
    );
    if (runningStep) {
      this.logger.debug(
        `Execution ${executionId} has running step ${runningStep.planNodeId || runningStep.id} under active lease, waiting for completion.`
      );
      return;
    }

    const ready = this.readySet.compute(execution.steps, execution.plan?.planJson, now);
    const hasClaimableStep = execution.steps.some(
      (step: any) =>
        step.status === 'pending' ||
        (step.status === 'running' &&
          (!step.leaseExpiresAt || new Date(step.leaseExpiresAt) <= now))
    );

    if (ready.length === 0 && !hasClaimableStep) {
      await this.completeExecutionIfSatisfied(execution);
      return;
    }
    if (ready.length === 0) {
      this.logger.debug(
        `Execution ${executionId} has pending nodes whose dependencies are not ready`
      );
      return;
    }

    if (process.env.SAFE_READY_SET_PARALLEL_ENABLED === 'true') {
      const batch = this.readySet.selectSafeParallelBatch(
        ready,
        execution.plan?.planJson,
        Number(process.env.SAFE_READY_SET_MAX_CONCURRENCY || 4)
      );
      await Promise.all(batch.map((step) => this.executeStep(execution, step, false, options)));
      await this.advanceExecution(execution.id, options);
      return;
    }
    await this.executeStep(execution, ready[0], true, options);
  }

  private async executeStep(
    execution: any,
    step: any,
    autoAdvance = true,
    options?: { traceContext?: any }
  ): Promise<void> {
    const stepId = step.id;
    const planNodeId = step.planNodeId || step.name || `step_${step.stepIndex}`;
    const planNodes = Array.isArray((execution.plan?.planJson as any)?.nodes)
      ? (execution.plan?.planJson as any).nodes
      : [];
    const planNode = planNodes.find((node: any) => node.nodeId === planNodeId);

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
      this.logger.warn(
        `Failed to acquire atomic lease for step ${stepId} in execution ${execution.id}`
      );
      return;
    }

    if (this.shouldSkipForRunWhen(execution, planNode)) {
      const skipReason =
        planNode?.runWhen === 'browser_terminal'
          ? 'browser_terminal_unavailable'
          : 'browser_not_succeeded';
      await this.prisma.executionStep.update({
        where: { id: stepId },
        data: { status: 'skipped', endedAt: new Date(), leaseExpiresAt: null },
      });
      await this.eventPublisher.createEvent(
        execution.id,
        'execution.node.skipped' as any,
        { planNodeId, reason: skipReason, runWhen: planNode?.runWhen },
        { stepId }
      );
      await this.eventPublisher.createEvent(
        execution.id,
        'step.skipped',
        { stepId, planNodeId, reason: skipReason },
        { stepId }
      );
      if (autoAdvance) await this.advanceExecution(execution.id, options);
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
      { stepId }
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
      { stepId }
    );

    // Resolve inputs
    const inputBindings = (step.inputBindingsJson || {}) as Record<string, ValueBindingV1>;
    const resolvedInput = await this.inputResolver.resolveInputs(
      execution.id,
      inputBindings,
      (execution.inputJson as Record<string, any>) || {},
      step.capabilityId,
      step.nodeKind
    );

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
        await this.runSkillStep(execution, step, resolvedInput, options);
      }

      // After successful step execution, schedule the next step
      if (autoAdvance) await this.advanceExecution(execution.id, options);
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : 'Node execution failed';
      const isUnknown = Boolean(
        error?.isUnknown ||
        error?.code === 'OUTBOUND_EFFECT_UNKNOWN' ||
        error?.status === 'unknown'
      );
      // Structured contract-violation context (design doc §12.1) flows into events
      // so downstream consumers get stable codes + machine-readable context.
      const errContext = error instanceof ContractViolationError ? error.context : undefined;
      this.logger.error(`Step ${planNodeId} failed for execution ${execution.id}: ${errMsg} (isUnknown=${isUnknown})`);

      if (isUnknown) {
        await this.prisma.executionStep.update({
          where: { id: stepId },
          data: {
            status: 'failed',
            errorMessage: errMsg,
            errorCode: error.code || 'OUTBOUND_EFFECT_UNKNOWN',
            endedAt: new Date(),
            leaseExpiresAt: null,
            takeoverTriggered: true,
          },
        });

        await this.prisma.execution.update({
          where: { id: execution.id },
          data: {
            status: 'human_control',
            takeoverRequired: true,
            takeoverReason: `Node '${planNodeId}' encountered uncertain outbound effect (UNKNOWN): ${errMsg}. Requires manual reconciliation.`,
            failureCode: error.code || 'OUTBOUND_EFFECT_UNKNOWN',
            failureReason: errMsg,
          },
        });

        await this.eventPublisher.createEvent(
          execution.id,
          'execution.node.failed' as any,
          { planNodeId, errorMessage: errMsg, errorCode: error.code || 'OUTBOUND_EFFECT_UNKNOWN', errorContext: errContext, isUnknown: true },
          { stepId }
        );
        await this.eventPublisher.createEvent(
          execution.id,
          'step.failed',
          {
            stepId,
            planNodeId,
            error: errMsg,
            errorMessage: errMsg,
            errorCode: error.code || 'OUTBOUND_EFFECT_UNKNOWN',
            isUnknown: true,
            takeoverRequired: true,
          },
          { stepId }
        );
        return;
      }

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

      const continueAfterFailure = planNode?.failurePolicy === 'continue';

      // Most failures abort the execution.  A recorder browser node can
      // explicitly opt into terminal handling: dependent report nodes are
      // then allowed to consume whatever terminal BrowserRunOutput exists.
      const failureReason = `Node '${planNodeId}' failed: ${errMsg}`;
      if (!continueAfterFailure) {
        await this.prisma.execution.update({
          where: { id: execution.id },
          data: {
            status: 'failed',
            failureReason,
            failureCode: error.code || 'NODE_EXECUTION_FAILED',
            endedAt: new Date(),
          },
        });
      }

      await this.eventPublisher.createEvent(
        execution.id,
        'execution.node.failed' as any,
        { planNodeId, errorMessage: errMsg, errorCode: error.code, errorContext: errContext },
        { stepId }
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
        { stepId }
      );
      if (!continueAfterFailure) {
        await this.eventPublisher.createEvent(
          execution.id,
          'execution.status_changed',
          {
            oldStatus: 'running',
            newStatus: 'failed',
            failureCode: error.code || 'NODE_EXECUTION_FAILED',
            failureReason,
          },
          { stepId }
        );
        await this.closeRuntimeSessions(execution.id, 'deterministic_step_failed');
      } else {
        await this.eventPublisher.createEvent(
          execution.id,
          'execution.browser_terminal.continued' as any,
          { planNodeId, errorMessage: errMsg, errorCode: error.code || 'NODE_EXECUTION_FAILED' },
          { stepId }
        );
        if (autoAdvance) await this.advanceExecution(execution.id, options);
      }
    }
  }

  private shouldSkipForRunWhen(execution: any, planNode: any): boolean {
    if (!planNode?.runWhen) return false;
    const browserStep = (execution.steps || []).find(
      (candidate: any) => candidate.planNodeId === BROWSER_RECORDING_ROOT_NODE_ID
    );
    if (!browserStep) return true;
    if (planNode.runWhen === 'browser_terminal') return false;
    if (planNode.runWhen !== 'browser_succeeded') return true;
    if (['failed', 'cancelled', 'skipped'].includes(browserStep.status)) return true;
    const output = unwrapStoredStepOutput(browserStep.outputJson);
    const browser =
      output && typeof output === 'object' ? (output as any).browserRunOutput : undefined;
    const status = browser?.run?.status || browser?.status || output?.status;
    if (status) {
      return !['completed', 'completed_with_warnings', 'success', 'succeeded'].includes(status);
    }
    return !['completed', 'succeeded'].includes(browserStep.status);
  }

  /**
   * Verifies the frozen contract digest still matches the catalog at step
   * start (design doc §15.3-5 / §9.3). Steps frozen before digest support
   * (legacy) are skipped. Transient catalog lookup failure only logs — the
   * frozen plan is still internally consistent — while a digest MISMATCH
   * rejects the start because the capability contract changed after freeze.
   */
  private async verifyFrozenContractDigest(execution: any, step: any): Promise<void> {
    const frozenMeta = step.outputContractJson?._frozenMetadata || {};
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
      node.operationVersion = step.capabilityVersion;
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
        `Contract re-resolution unavailable for node '${step.planNodeId}' despite frozen digest ${frozenDigest} — refusing to start the step`
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
        }
      );
    }
    // Same shared contract-envelope semantics as the freeze-time digest (fix
    // ④) — covers input + output contracts and metadata, not just the output
    // schema, so input-contract drift is detected too.
    const currentDigest = this.contractCatalog.computeContractDigest(node, contract);
    if (currentDigest !== frozenDigest) {
      this.logger.error(
        `Frozen contract digest mismatch for node '${step.planNodeId}': frozen ${frozenDigest} vs catalog ${currentDigest}`
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
        }
      );
    }
  }

  /**
   * Runtime input validation (design doc §11.1): when an authoritative input
   * schema was frozen with the plan, the resolved input must satisfy it before
   * the capability call. Missing input schemas (custom skills) are skipped.
   */
  private async runLlmStep(
    execution: any,
    step: any,
    resolvedInput: Record<string, any>
  ): Promise<void> {
    const operationInput = projectLlmOperationInput(step, resolvedInput);
    validateInputContract(step, operationInput, execution.id);
    const contractMeta = step.outputContractJson || {};
    const planJson = (execution.plan?.planJson || {}) as any;
    const planNodes = planJson.nodes || [];
    const planNode = planNodes.find((n: any) => n.nodeId === step.planNodeId);

    const phaseKey =
      (typeof planNode?.phaseKey === 'string' && planNode.phaseKey) ||
      `phase_${String(step.stepIndex || 1).padStart(2, '0')}_${step.planNodeId || step.id}`;
    const phaseName =
      (typeof planNode?.name === 'string' && planNode.name) ||
      step.planNodeId ||
      `Step ${step.stepIndex || 1}`;
    const phaseMetadata = { phaseKey, phaseName, phaseType: 'llm_operation' };

    await this.executionPhaseSyncService?.markPhaseRunningForStep(
      execution.id,
      '',
      phaseMetadata,
      step
    );

    const result = await this.llmAdapter.executeOperation({
      executionId: execution.id,
      stepId: step.id,
      planHash: execution.plan?.planHash,
      operationId: step.capabilityId,
      operationVersion:
        contractMeta.operationVersion ||
        planNode?.operationVersion ||
        step.capabilityVersion ||
        '1',
      operationDigest: contractMeta.operationDigest || planNode?.operationDigest || '',
      contractDigest: contractMeta.contractDigest || planNode?.contractDigest || '',
      modelId: contractMeta.modelId || planNode?.modelId,
      environment: 'production',
      input: operationInput,
      idempotencyKey: step.idempotencyKey || `${execution.id}:${step.id}`,
    });

    await this.executionPhaseSyncService?.syncPhaseAfterStepResult(
      execution.id,
      '',
      {
        success: result.success,
        status: result.success ? 'completed' : 'failed',
        output: result.output || null,
        errorMessage: result.errorMessage || undefined,
        errorCode: result.success ? undefined : 'LLM_OPERATION_FAILED',
      },
      phaseMetadata,
      step
    );

    if (!result.success) {
      // Persist the prompt snapshot (when the orchestrator emitted one) so the
      // debug console can inspect failed LLM steps too.
      if (result.promptDebug) {
        await this.prisma.executionStep.update({
          where: { id: step.id },
          data: {
            outputJson: { __promptDebug: result.promptDebug } as any,
          },
        });
      }
      throw new Error(
        result.errorMessage || `LLM Operation '${step.capabilityId}' returned failure`
      );
    }

    const normalizedOutput = this.validateOutputContract(step, result.output || {}, execution.id);

    // The frozen output schema (additionalProperties: false) is the sole arbiter
    // for business output; the prompt snapshot is merged AFTER validation so it
    // never participates in contract checks. Downstream consumers read
    // outputJson by declared keys only, so the extra key is inert.
    const persistedOutput = result.promptDebug
      ? { ...normalizedOutput, __promptDebug: result.promptDebug }
      : normalizedOutput;

    await this.prisma.executionStep.update({
      where: { id: step.id },
      data: {
        status: 'succeeded',
        outputJson: persistedOutput as any,
        endedAt: new Date(),
        leaseExpiresAt: null,
      },
    });

    const satisfiedClaims = await this.completionClaims?.synthesizeForStep({
      executionId: execution.id,
      step,
      output: normalizedOutput,
      plan: execution.plan?.planJson,
    });

    await this.eventPublisher.createEvent(
      execution.id,
      'execution.node.succeeded' as any,
      {
        planNodeId: step.planNodeId,
        output: normalizedOutput,
      },
      { stepId: step.id }
    );
    await this.eventPublisher.createEvent(
      execution.id,
      'step.succeeded',
      {
        stepId: step.id,
        planNodeId: step.planNodeId,
        result: normalizedOutput,
        completionClaims: satisfiedClaims || [],
      },
      { stepId: step.id }
    );
  }


  private async runSkillStep(
    execution: any,
    step: any,
    resolvedInput: Record<string, any>,
    options?: { traceContext?: any }
  ): Promise<void> {
    validateInputContract(step, resolvedInput, execution.id);
    const capabilityId = step.capabilityId;
    const capabilityVersion = step.capabilityVersion;

    const stepIdempotencyKey =
      step.idempotencyKey || `${execution.id}:${step.id}:${step.planNodeId || step.capabilityId}`;
    const sanitizedInput: Record<string, any> = {};
    const inputSchema = step.inputSchemaJson;
    for (const [k, v] of Object.entries(resolvedInput || {})) {
      if (
        inputSchema?.additionalProperties === false &&
        inputSchema?.properties &&
        typeof inputSchema.properties === 'object' &&
        !Object.prototype.hasOwnProperty.call(inputSchema.properties, k) &&
        k !== 'idempotencyKey' &&
        k !== 'taskContext' &&
        k !== 'phase' &&
        k !== 'payloadHash' &&
        ![
          'downloadUrl',
          'fileUrl',
          'url',
          'downloadUrlA',
          'fileUrlA',
          'downloadUrlB',
          'fileUrlB',
          'files',
        ].includes(k)
      ) {
        continue;
      }
      sanitizedInput[k] = v;
    }
    const inputWithIdempotency = {
      ...sanitizedInput,
      idempotencyKey: resolvedInput?.idempotencyKey || stepIdempotencyKey,
    };

    const planJson = (execution.plan?.planJson || {}) as any;
    const planNodes = planJson.nodes || [];
    const planNode = planNodes.find((n: any) => n.nodeId === step.planNodeId);
    const frozenMeta = planNode?.metadata || {};

    const isBuiltin = typeof capabilityId === 'string' && capabilityId.startsWith('platform.');
    const capabilityType = isBuiltin ? 'builtin' : 'skill.runtime';

    const definitionVersion = frozenMeta.definitionVersion || capabilityVersion || '1.0.0';
    const metadata: Record<string, any> = resolveOutboundEffectMetadata(
      planNode,
      frozenMeta,
      resolvedInput,
      execution,
      step.id,
      stepIdempotencyKey,
      definitionVersion,
      capabilityVersion,
      step
    );
    const captureProfile =
      frozenMeta.captureProfile ||
      frozenMeta.capture_profile ||
      planNode?.captureProfile ||
      planNode?.capture_profile ||
      step.captureProfile;
    if (captureProfile) {
      metadata.captureProfile = captureProfile;
    }
    if (isBuiltin) {
      metadata.builtinSkill = true;
      if (frozenMeta.handlerKey) metadata.handlerKey = frozenMeta.handlerKey;
      if (frozenMeta.definitionDigest) metadata.definitionDigest = frozenMeta.definitionDigest;
      if (frozenMeta.adapterRoute) metadata.adapterRoute = frozenMeta.adapterRoute;
      if (frozenMeta.skillVersion) metadata.skillVersion = frozenMeta.skillVersion;
    }

    const runtimeType = mapPlanRuntimeTypeToExecutionRuntime(
      step.action || step.outputContractJson?.runtimeType
    );
    const runtimeSessionId =
      runtimeType === 'browser' ? await this.ensureStandardBrowserSession(execution, step) : '';

    const request = {
      requestId: `${execution.id}:${step.id}`,
      executionId: execution.id,
      stepId: step.id,
      runtimeType,
      runtimeSessionId,
      skillId: capabilityId,
      publishedSkillId: capabilityId,
      capabilityType,
      action: 'execute',
      input: inputWithIdempotency,
      policyContext: {},
      traceContext: {
        userId: execution.createdBy || undefined,
        ...(options?.traceContext || (execution.metadata as any)?.traceContext || {}),
      },
      metadata,
    };

    const phaseKey =
      (typeof frozenMeta.phaseKey === 'string' && frozenMeta.phaseKey) ||
      (typeof planNode?.phaseKey === 'string' && planNode.phaseKey) ||
      `phase_${String(step.stepIndex || 1).padStart(2, '0')}_${step.planNodeId || step.id}`;
    const phaseName =
      (typeof frozenMeta.phaseName === 'string' && frozenMeta.phaseName) ||
      (typeof planNode?.name === 'string' && planNode.name) ||
      step.planNodeId ||
      `Step ${step.stepIndex || 1}`;
    const phaseType =
      runtimeType === 'browser' ? 'browser_recording' : isBuiltin ? 'builtin' : 'workflow_activity';
    const phaseMetadata = { phaseKey, phaseName, phaseType };

    await this.executionPhaseSyncService?.markPhaseRunningForStep(
      execution.id,
      runtimeSessionId,
      phaseMetadata,
      step
    );

    const result = await this.orchestrator.executeStep(request);

    await this.executionPhaseSyncService?.syncPhaseAfterStepResult(
      execution.id,
      runtimeSessionId,
      result,
      phaseMetadata,
      step
    );

    const isUnknownEffect =
      result?.status === 'unknown' || result?.errorCode === 'OUTBOUND_EFFECT_UNKNOWN';
    if (isUnknownEffect) {
      const errMsg = result?.errorMessage || `Outbound effect status unknown for '${capabilityId}'`;
      const error = new Error(errMsg) as Error & { code?: string; isUnknown?: boolean; status?: string };
      error.code = result?.errorCode || 'OUTBOUND_EFFECT_UNKNOWN';
      error.status = 'unknown';
      error.isUnknown = true;
      throw error;
    }

    if (result?.status === 'prepared') {
      const runtimeOutput = await materializeContentRefs(
        execution.id,
        step.id,
        (result.output || {}) as Record<string, any>,
        this.resultRefs
      );
      // Intermediate protocol state for prepared outbound effect does not enforce final step output schema contract
      await handlePreparedOutboundEffectStep(this.prisma, execution, step, runtimeOutput);
      this.logger.log(
        `Execution ${execution.id} step ${step.id} prepared outbound effect; suspended in pending_approval.`
      );
      return;
    }

    const terminalOutputAllowed =
      planNode?.failurePolicy === 'continue' &&
      result?.output &&
      typeof result.output === 'object' &&
      !Array.isArray(result.output);
    if (!result || !result.success) {
      if (!terminalOutputAllowed) {
        const errMsg = result?.errorMessage || `Skill execution '${capabilityId}' failed`;
        const error = new Error(errMsg) as Error & { code?: string; isUnknown?: boolean; status?: string };
        error.code = result?.errorCode || 'NODE_EXECUTION_FAILED';
        error.status = result?.status;
        throw error;
      }
    }

    const runtimeOutput = await materializeContentRefs(
      execution.id,
      step.id,
      (result.output || {}) as Record<string, any>,
      this.resultRefs
    );
    const outputJson = this.validateOutputContract(step, runtimeOutput, execution.id);

    await this.prisma.executionStep.update({
      where: { id: step.id },
      data: {
        status: 'succeeded',
        outputJson: outputJson as any,
        endedAt: new Date(),
        leaseExpiresAt: null,
      },
    });

    if (this.resultRefs?.enabled) {
      const resultRef = await this.resultRefs.create({
        executionId: execution.id,
        producerStepId: step.id,
        payload: outputJson,
        outputSchema: step.outputSchemaJson,
        schemaDigest: resolveBrowserRunOutputSchemaDigest(outputJson),
      });
      await this.prisma.executionStep.update({
        where: { id: step.id },
        data: { outputJson: { inline: outputJson, resultRef } as any },
      });
    }

    // Save artifacts if generated by skill step
    const rawArtifacts = extractArtifacts(result.artifacts, outputJson);
    if (Array.isArray(rawArtifacts)) {
      for (const art of rawArtifacts) {
        if (!art || typeof art !== 'object') continue;
        const artifactUrl = art.url || art.storageUri;
        if (art && artifactUrl) {
          const externalArtifactId = art.id || art.externalArtifactId || null;
          if (
            externalArtifactId &&
            (await this.prisma.executionArtifact.findFirst({
              where: { executionId: execution.id, producerStepId: step.id, externalArtifactId },
              select: { id: true },
            }))
          ) {
            continue;
          }
          const createdArtifact = await this.prisma.executionArtifact.create({
            data: {
              executionId: execution.id,
              producerStepId: step.id,
              producerNodeId: step.planNodeId || step.id,
              artifactType: art.type || art.artifactType || 'file',
              externalArtifactId,
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
            { stepId: step.id }
          );
        }
      }
    }

    const satisfiedClaims = await this.completionClaims?.synthesizeForStep({
      executionId: execution.id,
      step,
      output: outputJson,
      plan: execution.plan?.planJson,
    });

    await this.eventPublisher.createEvent(
      execution.id,
      'execution.node.succeeded' as any,
      {
        planNodeId: step.planNodeId,
        output: outputJson,
      },
      { stepId: step.id }
    );
    await this.eventPublisher.createEvent(
      execution.id,
      'step.succeeded',
      {
        stepId: step.id,
        planNodeId: step.planNodeId,
        result: outputJson,
        completionClaims: satisfiedClaims || [],
      },
      { stepId: step.id }
    );
  }

  private async completeExecutionIfSatisfied(execution: any): Promise<void> {
    const planDraft = execution.plan?.planJson as DeterministicPlanDraftV1;

    if (!planDraft) {
      await this.prisma.execution.update({
        where: { id: execution.id },
        data: { status: 'succeeded', endedAt: new Date() },
      });
      await this.eventPublisher.createEvent(execution.id, 'execution.status_changed', {
        oldStatus: execution.status,
        newStatus: 'succeeded',
      });
      await this.closeRuntimeSessions(execution.id, 'deterministic_execution_succeeded');
      return;
    }

    const checkResult = await this.finalOutputService.assertSatisfied(execution.id, planDraft);

    if (!checkResult.satisfied) {
      this.logger.error(
        `Execution ${execution.id} final output check failed: ${checkResult.errorMessage}`
      );
      await this.prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: 'failed',
          failureCode: checkResult.errorCode || 'FINAL_OUTPUT_MISSING',
          failureReason: checkResult.errorMessage || 'Final outputs unsatisfied',
          endedAt: new Date(),
        },
      });
      await this.eventPublisher.createEvent(execution.id, 'execution.status_changed', {
        oldStatus: execution.status,
        newStatus: 'failed',
        failureCode: checkResult.errorCode || 'FINAL_OUTPUT_MISSING',
        failureReason: checkResult.errorMessage || 'Final outputs unsatisfied',
      });
      await this.closeRuntimeSessions(execution.id, 'deterministic_final_output_failed');
      return;
    }

    const claimCheck = await this.completionClaims?.assertRequiredClaims(execution.id, planDraft);
    if (claimCheck && !claimCheck.satisfied) {
      const failureReason = `Required completion claims are unsatisfied: ${claimCheck.missing.join(', ')}`;
      await this.prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: 'failed',
          failureCode: 'COMPLETION_CLAIMS_UNSATISFIED',
          failureReason,
          endedAt: new Date(),
        },
      });
      await this.eventPublisher.createEvent(execution.id, 'execution.status_changed', {
        oldStatus: execution.status,
        newStatus: 'failed',
        failureCode: 'COMPLETION_CLAIMS_UNSATISFIED',
        failureReason,
      });
      await this.closeRuntimeSessions(execution.id, 'deterministic_completion_claims_failed');
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
      checkResult.artifacts || []
    );

    const endedAt = new Date();
    const resultJson = buildDeterministicExecutionResult({
      executionId: execution.id,
      plan: planDraft,
      finalOutputs,
      artifacts: checkResult.artifacts || [],
      finishedAt: endedAt,
    });

    await this.prisma.execution.update({
      where: { id: execution.id },
      data: {
        status: 'succeeded',
        endedAt,
        resultJson: resultJson as any,
      },
    });
    await this.eventPublisher.createEvent(execution.id, 'execution.status_changed', {
      oldStatus: execution.status,
      newStatus: 'succeeded',
    });

    await this.executionPhaseSyncService?.completeActivePhasesOnExecutionSuccess(execution.id, '');

    await this.closeRuntimeSessions(execution.id, 'deterministic_execution_succeeded');

    this.logger.log(
      `Execution ${execution.id} successfully completed all deterministic plan steps.`
    );
  }

  private async ensureStandardBrowserSession(execution: any, step: any): Promise<string> {
    if (!this.runtimeSessionCoordinator) {
      const error = new Error(
        'Deterministic browser execution requires the session-broker runtime session coordinator'
      ) as Error & { code?: string };
      error.code = 'RUNTIME_SESSION_COORDINATOR_UNAVAILABLE';
      throw error;
    }
    return this.runtimeSessionCoordinator.ensureBrowserSession({
      executionId: execution.id,
      userId: execution.createdBy,
      stepId: step.id,
    });
  }

  private async closeRuntimeSessions(executionId: string, reason: string): Promise<void> {
    await this.runtimeSessionCoordinator?.closeForTerminalExecution(executionId, reason);
  }

  private async resolveFinalOutputs(
    executionId: string,
    planDraft: DeterministicPlanDraftV1,
    artifacts: any[]
  ): Promise<Array<Record<string, any>>> {
    if (!Array.isArray(planDraft.finalOutputs) || planDraft.finalOutputs.length === 0) {
      return [];
    }

    const steps = await this.prisma.executionStep.findMany({
      where: { executionId, status: 'succeeded' },
    });
    return extractFinalOutputsFromSteps(planDraft, steps, artifacts, unwrapStoredStepOutput);
  }
}

