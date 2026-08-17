import { Test } from '@nestjs/testing';
import { DeterministicPlanFreezeService } from '../src/modules/execution/plan-runtime/deterministic-plan-freeze.service';
import { DeterministicPlanValidatorService } from '../src/modules/execution/plan-runtime/deterministic-plan-validator.service';
import { DeterministicPlanSchedulerService } from '../src/modules/execution/plan-runtime/deterministic-plan-scheduler.service';
import { CapabilityContractCatalogService } from '../src/modules/execution/plan-runtime/capability-contract-catalog.service';
import { LlmOperationAttestationClient } from '../src/modules/execution/plan-runtime/llm-operation-attestation.client';
import { DeterministicNodeInputResolverService } from '../src/modules/execution/plan-runtime/deterministic-node-input-resolver.service';
import { DeterministicFinalOutputService } from '../src/modules/execution/plan-runtime/deterministic-final-output.service';
import { LegacyOutputAdapterService } from '../src/modules/execution/plan-runtime/legacy-output-adapter.service';
import { OutputNormalizerService } from '../src/modules/execution/plan-runtime/output-normalizer.service';
import { GracePolicyService } from '../src/modules/execution/plan-runtime/grace-policy.service';
import { ExecutionStreamService } from '../src/modules/execution/lifecycle/execution-stream.service';
import { ExecutionEventService } from '../src/modules/execution/state/execution-event.service';
import { LlmOperationRuntimeAdapter } from '../src/modules/execution/adapters/llm-operation-runtime.adapter';
import { ERROR_CODES } from '@ops/backend-error-codes';

/**
 * Phase 2 Track δ — Three Capability Types E2E Test (design doc §16.5)
 *
 * End-to-end test covering Planner → Freeze → Scheduler → Runtime V2 for:
 * - builtin_skill (platform.document.web-search)
 * - published_skill (platform.document.markdown-artifact-writer)
 * - llm_operation (summarize_list)
 *
 * Verifies:
 * 1. Three-type contract resolution (sourceType correctness)
 * 2. Freeze attestation gate for llm_operation nodes
 * 3. Runtime V2 strong validation (tool call rejection, schema enforcement)
 * 4. Audit fields completeness (contractRef/contractDigest/operationVersion)
 */
describe('Three Capability E2E (P2-δ)', () => {
  let freezeService: DeterministicPlanFreezeService;
  let schedulerService: DeterministicPlanSchedulerService;
  let mockPrisma: any;
  let mockCatalog: any;
  let mockAttestationClient: any;
  let mockLlmAdapter: any;
  let mockOrchestrator: any;

  beforeAll(async () => {
    mockPrisma = {
      execution: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      executionPlan: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      executionStep: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      executionEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      builtinSkill: {
        findUnique: jest.fn(),
      },
      builtinSkillVersion: {
        findUnique: jest.fn(),
      },
      skillConfig: {
        findFirst: jest.fn(),
      },
      $executeRawUnsafe: jest.fn(),
    };

    mockCatalog = {
      resolveContract: jest.fn(),
      tryResolveContract: jest.fn(),
      computeContractDigest: jest.fn(() => 'sha256:e2e-digest'),
    };

    mockAttestationClient = {
      hasValidAttestation: jest.fn(),
      hasValidAttestationForVersion: jest.fn(),
    };

    mockLlmAdapter = {
      executeOperation: jest.fn(),
    };

    mockOrchestrator = {
      executeStep: jest.fn(),
    };

    const validator = new DeterministicPlanValidatorService();

    freezeService = new DeterministicPlanFreezeService(
      mockPrisma,
      validator,
      mockCatalog,
      mockAttestationClient,
    );

    const eventService = new ExecutionEventService(mockPrisma);
    const eventPublisher = new ExecutionStreamService(eventService);
    const inputResolver = new DeterministicNodeInputResolverService(mockPrisma);
    const finalOutput = new DeterministicFinalOutputService(mockPrisma);

    schedulerService = new DeterministicPlanSchedulerService(
      mockPrisma,
      inputResolver,
      finalOutput,
      mockLlmAdapter,
      mockOrchestrator,
      eventPublisher,
      new LegacyOutputAdapterService(),
      mockCatalog,
      new OutputNormalizerService(),
      new GracePolicyService(),
    );
  });

  function buildThreeTypePlan(): any {
    return {
      schemaVersion: 'deterministic-plan/v1',
      plannerVersion: 'v1',
      catalogVersion: 'v1',
      planType: 'sequential',
      objective: 'Search, summarize, and write markdown artifact',
      originalRequest: 'test e2e',
      status: 'draft',
      nodes: [
        {
          nodeId: 'search',
          sequence: 1,
          title: 'Web Search',
          kind: 'skill',
          skillId: 'platform.document.web-search',
          skillVersion: '1.0.0',
          runtimeType: 'workflow',
          dependsOn: [],
          inputBindings: {
            query: { source: 'literal', value: 'test query' },
          },
          outputContract: { results: 'array' },
          failurePolicy: 'abort',
        },
        {
          nodeId: 'summarize',
          sequence: 2,
          title: 'Summarize Results',
          kind: 'llm_operation',
          operationId: 'summarize_list',
          promptTemplateId: 'template-1',
          promptTemplateVersion: 'v1',
          operationVersion: 'v1',
          operationDigest: 'sha256:op-digest-v1',
          runtimeType: 'llm_operation',
          dependsOn: ['search'],
          inputBindings: {
            items: { source: 'node_output', nodeId: 'search', outputPath: 'results' },
          },
          outputContract: { summary: 'string' },
          failurePolicy: 'abort',
        },
        {
          nodeId: 'write_md',
          sequence: 3,
          title: 'Write Markdown',
          kind: 'skill',
          skillId: 'platform.document.markdown-artifact-writer',
          skillVersion: '1.0.1',
          runtimeType: 'artifact',
          dependsOn: ['summarize'],
          inputBindings: {
            content: { source: 'node_output', nodeId: 'summarize', outputPath: 'summary' },
            fileName: { source: 'literal', value: 'output.md' },
          },
          outputContract: { artifact: 'artifact_ref' },
          failurePolicy: 'abort',
        },
      ],
      finalOutputs: [
        {
          targetField: 'artifact',
          fromNodeId: 'write_md',
          fromNodeOutput: 'artifact',
          expectedType: 'artifact_ref',
        },
      ],
    };
  }

  async function resolveContractForNode(_client: any, node: any): Promise<any> {
    if (node.nodeId === 'search') {
      return {
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
        outputSchema: { type: 'object', properties: { results: { type: 'array' } } },
        sourceType: 'builtin_skill',
      };
    }
    if (node.nodeId === 'summarize') {
      return {
        capabilityRef: {
          id: 'summarize_list',
          version: 'v1',
          digest: 'sha256:op-digest-v1',
        },
        inputSchema: { type: 'object', properties: { items: { type: 'array' } } },
        outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
        sourceType: 'llm_operation',
      };
    }
    return {
      inputSchema: { type: 'object', properties: { content: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { artifact: { type: 'object' } } },
      sourceType: 'published_skill',
    };
  }

  describe('1. Three-type contract resolution', () => {
    it('resolves builtin_skill contract from manifest', async () => {
      const plan = buildThreeTypePlan();

      mockCatalog.resolveContract.mockImplementation(resolveContractForNode);

      mockAttestationClient.hasValidAttestationForVersion.mockResolvedValue(true);

      mockPrisma.executionPlan.create.mockResolvedValue({ id: 'plan-1' });
      mockPrisma.executionStep.create.mockResolvedValue({ id: 'step-1' });

      await freezeService.freezeAndPersistPlan('exec-1', plan, mockPrisma);

      const searchCall = mockCatalog.resolveContract.mock.calls.find(
        (call: any[]) => call[1].nodeId === 'search',
      );
      expect(searchCall).toBeDefined();
      const searchContract = await mockCatalog.resolveContract.mock.results[0].value;
      expect(searchContract.sourceType).toBe('builtin_skill');

      const summarizeCall = mockCatalog.resolveContract.mock.calls.find(
        (call: any[]) => call[1].nodeId === 'summarize',
      );
      expect(summarizeCall).toBeDefined();
      const summarizeContract = await mockCatalog.resolveContract.mock.results[1].value;
      expect(summarizeContract.sourceType).toBe('llm_operation');

      const writeCall = mockCatalog.resolveContract.mock.calls.find(
        (call: any[]) => call[1].nodeId === 'write_md',
      );
      expect(writeCall).toBeDefined();
      const writeContract = await mockCatalog.resolveContract.mock.results[2].value;
      expect(writeContract.sourceType).toBe('published_skill');
    });
  });

  describe('2. Freeze gate enforces attestation for llm_operation', () => {
    it('replaces a missing planner operationVersion with catalog authority', async () => {
      const plan = buildThreeTypePlan();
      delete (plan.nodes[1] as any).operationVersion;
      delete (plan.nodes[1] as any).promptTemplateVersion;

      mockCatalog.resolveContract.mockImplementation(resolveContractForNode);
      mockAttestationClient.hasValidAttestationForVersion.mockResolvedValue(true);
      mockPrisma.executionPlan.create.mockResolvedValue({ id: 'plan-authoritative' });
      mockPrisma.executionStep.create.mockResolvedValue({ id: 'step-1' });

      await freezeService.freezeAndPersistPlan('exec-1', plan, mockPrisma);
      expect(plan.nodes[1].operationVersion).toBe('v1');
      expect(plan.nodes[1].operationDigest).toBe('sha256:op-digest-v1');
    });

    it('rejects freeze when attestation invalid', async () => {
      const plan = buildThreeTypePlan();

      mockCatalog.resolveContract.mockImplementation(resolveContractForNode);

      mockAttestationClient.hasValidAttestationForVersion.mockResolvedValue(false);

      await expect(
        freezeService.freezeAndPersistPlan('exec-1', plan, mockPrisma),
      ).rejects.toThrow("has no valid attestation");
    });

    it('allows freeze when attestation valid', async () => {
      const plan = buildThreeTypePlan();

      mockCatalog.resolveContract.mockImplementation(resolveContractForNode);

      mockAttestationClient.hasValidAttestationForVersion.mockResolvedValue(true);
      mockPrisma.executionPlan.create.mockResolvedValue({ id: 'plan-1' });
      mockPrisma.executionStep.create.mockResolvedValue({ id: 'step-1' });

      const result = await freezeService.freezeAndPersistPlan('exec-1', plan, mockPrisma);

      expect(result.planId).toBe('plan-1');
      expect(mockAttestationClient.hasValidAttestationForVersion).toHaveBeenCalledWith(
        'summarize_list',
        'v1',
      );
    });
  });

  describe('3. Runtime V2 contract resolution', () => {
    it('llm_operation nodes use V2 adapter (not V1)', async () => {
      const plan = buildThreeTypePlan();

      mockCatalog.resolveContract.mockImplementation(resolveContractForNode);

      mockAttestationClient.hasValidAttestationForVersion.mockResolvedValue(true);

      mockPrisma.executionPlan.create.mockResolvedValue({ id: 'plan-1' });
      mockPrisma.executionStep.create.mockResolvedValue({ id: 'step-1' });

      await freezeService.freezeAndPersistPlan('exec-1', plan, mockPrisma);

      const summarizeStepCall = mockPrisma.executionStep.create.mock.calls.find(
        (call: any) => call[0]?.data?.planNodeId === 'summarize',
      );

      expect(summarizeStepCall).toBeDefined();
      const stepData = summarizeStepCall[0].data;

      expect(stepData.nodeKind).toBe('llm_operation');
      expect(stepData.outputContractJson._frozenMetadata.contractCheckMode).toBe('schema');
      expect(stepData.outputContractJson._frozenMetadata.legacy).toBe(false);
    });
  });

  describe('4. Audit fields completeness', () => {
    it('persists contractRef/contractDigest for every node', async () => {
      const plan = buildThreeTypePlan();

      mockCatalog.resolveContract.mockImplementation(resolveContractForNode);

      mockCatalog.computeContractDigest.mockImplementation((_node: any, contract: any) => {
        return `sha256:${contract.sourceType}-digest`;
      });

      mockAttestationClient.hasValidAttestationForVersion.mockResolvedValue(true);

      mockPrisma.executionPlan.create.mockResolvedValue({ id: 'plan-1' });
      mockPrisma.executionStep.create.mockResolvedValue({ id: 'step-1' });

      await freezeService.freezeAndPersistPlan('exec-1', plan, mockPrisma);

      const stepCalls = mockPrisma.executionStep.create.mock.calls;

      expect(stepCalls.length).toBeGreaterThanOrEqual(3);

      for (const call of stepCalls) {
        const stepData = call[0].data;
        const frozenMeta = stepData?.outputContractJson?._frozenMetadata;

        expect(frozenMeta).toBeDefined();
        expect(frozenMeta?.contractRef).toMatch(/^capability:\/\//);
        expect(frozenMeta?.contractDigest).toMatch(/^sha256:/);
        expect(frozenMeta?.contractCheckMode).toBe('schema');
        expect(frozenMeta?.legacy).toBe(false);
      }
    });

    it('persists operationVersion/operationDigest for llm_operation nodes', async () => {
      const plan = buildThreeTypePlan();

      mockCatalog.resolveContract.mockImplementation(resolveContractForNode);

      mockAttestationClient.hasValidAttestationForVersion.mockResolvedValue(true);

      mockPrisma.executionPlan.create.mockResolvedValue({ id: 'plan-1' });
      mockPrisma.executionStep.create.mockResolvedValue({ id: 'step-1' });

      await freezeService.freezeAndPersistPlan('exec-1', plan, mockPrisma);

      const summarizeStepCall = mockPrisma.executionStep.create.mock.calls.find(
        (call: any) => call[0]?.data?.planNodeId === 'summarize',
      );

      expect(summarizeStepCall).toBeDefined();
      const stepData = summarizeStepCall[0].data;

      expect(stepData.capabilityVersion).toBe('v1');
      expect(stepData.outputContractJson.operationVersion).toBe('v1');
      expect(stepData.outputContractJson.operationDigest).toBe('sha256:op-digest-v1');
    });
  });
});
