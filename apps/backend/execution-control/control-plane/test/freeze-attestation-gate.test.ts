import { DeterministicPlanFreezeService } from '../src/modules/execution/plan-runtime/deterministic-plan-freeze.service';
import { DeterministicPlanValidatorService } from '../src/modules/execution/plan-runtime/deterministic-plan-validator.service';
import { CapabilityContractCatalogService } from '../src/modules/execution/plan-runtime/capability-contract-catalog.service';
import { LlmOperationAttestationClient } from '../src/modules/execution/plan-runtime/llm-operation-attestation.client';
import { ERROR_CODES } from '@ops/backend-error-codes';

/**
 * Phase 2-γ — freeze-time attestation gate (design doc §16.5)
 *
 * Tests the Control Plane freeze gate that enforces valid LLM operation
 * attestations before allowing a plan to be frozen.
 */
describe('Freeze Attestation Gate (P2-γ)', () => {
  function createService() {
    const validator = new DeterministicPlanValidatorService();
    const catalog = {
      resolveContract: jest.fn(),
      computeContractDigest: jest.fn(() => 'sha256:test-digest'),
    };
    const attestationClient = {
      hasValidAttestation: jest.fn(),
      hasValidAttestationForVersion: jest.fn(),
    };
    const service = new DeterministicPlanFreezeService(
      {} as any,
      validator,
      catalog as any,
      attestationClient as any,
    );
    return { service, catalog, attestationClient };
  }

  function buildPlanWithLlmOperation(): any {
    return {
      schemaVersion: 'deterministic-plan/v1',
      plannerVersion: 'v1',
      catalogVersion: 'v1',
      planType: 'sequential',
      objective: 'test attestation gate',
      originalRequest: 'test',
      status: 'draft',
      nodes: [
        {
          nodeId: 'summarize',
          sequence: 1,
          title: 'Summarize',
          kind: 'llm_operation',
          operationId: 'summarize_list',
          promptTemplateId: 'template-1',
          promptTemplateVersion: 'v1',
          operationVersion: 'v1',
          runtimeType: 'llm_operation',
          dependsOn: [],
          inputBindings: { items: { source: 'literal', value: ['a', 'b'] } },
          outputContract: { summary: 'string' },
          failurePolicy: 'abort',
        },
      ],
      finalOutputs: [],
    };
  }

  describe('hasValidAttestationForVersion returns true → freeze succeeds', () => {
    it('allows freeze when attestation passes', async () => {
      const { service, catalog, attestationClient } = createService();

      catalog.resolveContract.mockResolvedValue({
        capabilityRef: { id: 'summarize_list', version: 'v1', digest: 'sha256:op-v1' },
        inputSchema: { type: 'object', properties: { items: { type: 'array' } } },
        outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
        sourceType: 'llm_operation',
      });

      attestationClient.hasValidAttestationForVersion.mockResolvedValue(true);

      const client = {
        executionPlan: { create: jest.fn().mockResolvedValue({ id: 'plan-1' }) },
        executionStep: { create: jest.fn().mockResolvedValue({ id: 'step-1' }) },
      };

      const plan = buildPlanWithLlmOperation();
      const result = await service.freezeAndPersistPlan('exec-1', plan, client as any);

      expect(result.planId).toBe('plan-1');
      expect(attestationClient.hasValidAttestationForVersion).toHaveBeenCalledWith(
        'summarize_list',
        'v1',
      );
      expect(client.executionPlan.create).toHaveBeenCalled();
      expect(client.executionStep.create).toHaveBeenCalled();
    });
  });

  describe('hasValidAttestationForVersion returns false → freeze rejected', () => {
    it('rejects freeze when attestation is missing', async () => {
      const { service, catalog, attestationClient } = createService();

      catalog.resolveContract.mockResolvedValue({
        capabilityRef: { id: 'summarize_list', version: 'v1', digest: 'sha256:op-v1' },
        inputSchema: { type: 'object', properties: { items: { type: 'array' } } },
        outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
        sourceType: 'llm_operation',
      });

      attestationClient.hasValidAttestationForVersion.mockResolvedValue(false);

      const client = {
        executionPlan: { create: jest.fn() },
        executionStep: { create: jest.fn() },
      };

      const plan = buildPlanWithLlmOperation();

      await expect(
        service.freezeAndPersistPlan('exec-1', plan, client as any),
      ).rejects.toThrow("LLM operation 'summarize_list' version 'v1' has no valid attestation");

      expect(attestationClient.hasValidAttestationForVersion).toHaveBeenCalledWith(
        'summarize_list',
        'v1',
      );
      expect(client.executionPlan.create).not.toHaveBeenCalled();
      expect(client.executionStep.create).not.toHaveBeenCalled();
    });
  });

  describe('attestation client error (fail-closed)', () => {
    it('rejects freeze on network timeout', async () => {
      const { service, catalog, attestationClient } = createService();

      catalog.resolveContract.mockResolvedValue({
        capabilityRef: { id: 'summarize_list', version: 'v1', digest: 'sha256:op-v1' },
        inputSchema: { type: 'object', properties: { items: { type: 'array' } } },
        outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
        sourceType: 'llm_operation',
      });

      attestationClient.hasValidAttestationForVersion.mockRejectedValue(
        new Error('Network timeout'),
      );

      const client = {
        executionPlan: { create: jest.fn() },
        executionStep: { create: jest.fn() },
      };

      const plan = buildPlanWithLlmOperation();

      await expect(
        service.freezeAndPersistPlan('exec-1', plan, client as any),
      ).rejects.toThrow("LLM operation 'summarize_list' version 'v1' attestation check failed");

      expect(attestationClient.hasValidAttestationForVersion).toHaveBeenCalledWith(
        'summarize_list',
        'v1',
      );
      expect(client.executionPlan.create).not.toHaveBeenCalled();
      expect(client.executionStep.create).not.toHaveBeenCalled();
    });

    it('rejects freeze on attestation service unavailable', async () => {
      const { service, catalog, attestationClient } = createService();

      catalog.resolveContract.mockResolvedValue({
        capabilityRef: { id: 'summarize_list', version: 'v1', digest: 'sha256:op-v1' },
        inputSchema: { type: 'object', properties: { items: { type: 'array' } } },
        outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
        sourceType: 'llm_operation',
      });

      attestationClient.hasValidAttestationForVersion.mockRejectedValue(
        new Error('Service unavailable'),
      );

      const client = {
        executionPlan: { create: jest.fn() },
        executionStep: { create: jest.fn() },
      };

      const plan = buildPlanWithLlmOperation();

      await expect(
        service.freezeAndPersistPlan('exec-1', plan, client as any),
      ).rejects.toThrow("LLM operation 'summarize_list' version 'v1' attestation check failed");

      expect(client.executionPlan.create).not.toHaveBeenCalled();
    });
  });

  describe('skill nodes bypass attestation gate', () => {
    it('does not call attestationClient for builtin_skill nodes', async () => {
      const { service, catalog, attestationClient } = createService();

      const plan: any = {
        schemaVersion: 'deterministic-plan/v1',
        plannerVersion: 'v1',
        catalogVersion: 'v1',
        planType: 'sequential',
        objective: 'test skill bypass',
        originalRequest: 'test',
        status: 'draft',
        nodes: [
          {
            nodeId: 'search',
            sequence: 1,
            title: 'Search',
            kind: 'skill',
            skillId: 'platform.document.web-search',
            skillVersion: '1.0.0',
            runtimeType: 'workflow',
            dependsOn: [],
            inputBindings: { query: { source: 'literal', value: 'test' } },
            outputContract: { results: 'array' },
            failurePolicy: 'abort',
          },
        ],
        finalOutputs: [],
      };

      catalog.resolveContract.mockResolvedValue({
        inputSchema: null,
        outputSchema: { type: 'object', properties: { results: { type: 'array' } } },
        sourceType: 'builtin_skill',
      });

      const client = {
        executionPlan: { create: jest.fn().mockResolvedValue({ id: 'plan-1' }) },
        executionStep: { create: jest.fn().mockResolvedValue({ id: 'step-1' }) },
      };

      const result = await service.freezeAndPersistPlan('exec-1', plan, client as any);

      expect(result.planId).toBe('plan-1');
      expect(attestationClient.hasValidAttestationForVersion).not.toHaveBeenCalled();
    });

    it('does not call attestationClient for published_skill nodes', async () => {
      const { service, catalog, attestationClient } = createService();

      const plan: any = {
        schemaVersion: 'deterministic-plan/v1',
        plannerVersion: 'v1',
        catalogVersion: 'v1',
        planType: 'sequential',
        objective: 'test published skill bypass',
        originalRequest: 'test',
        status: 'draft',
        nodes: [
          {
            nodeId: 'custom',
            sequence: 1,
            title: 'Custom Skill',
            kind: 'skill',
            skillId: 'custom-skill-id',
            skillVersion: '1',
            runtimeType: 'workflow',
            dependsOn: [],
            inputBindings: {},
            outputContract: {},
            failurePolicy: 'abort',
          },
        ],
        finalOutputs: [],
      };

      catalog.resolveContract.mockResolvedValue({
        inputSchema: null,
        outputSchema: { type: 'object', properties: {} },
        sourceType: 'published_skill',
      });

      const client = {
        executionPlan: { create: jest.fn().mockResolvedValue({ id: 'plan-1' }) },
        executionStep: { create: jest.fn().mockResolvedValue({ id: 'step-1' }) },
      };

      const result = await service.freezeAndPersistPlan('exec-1', plan, client as any);

      expect(result.planId).toBe('plan-1');
      expect(attestationClient.hasValidAttestationForVersion).not.toHaveBeenCalled();
    });
  });
});
