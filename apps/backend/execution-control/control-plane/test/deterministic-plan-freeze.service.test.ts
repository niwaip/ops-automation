import { DeterministicPlanFreezeService } from '../src/modules/execution/plan-runtime/deterministic-plan-freeze.service';
import { DeterministicPlanValidatorService } from '../src/modules/execution/plan-runtime/deterministic-plan-validator.service';
import { DeterministicPlanDraftV1, PlanValidationErrorV1 } from '@ops/backend-deterministic-plan';
import { ERROR_CODES } from '@ops/backend-error-codes';

/**
 * Gate 3 — producer→consumer composition validation (§10.4).
 *
 * Tests the freeze service's edge contract checks: primitive type compatibility
 * (existing), enum subset, nullability, array item types, required-field
 * coverage, `contractCompatibility: 'none'` opt-out, and `required_only`
 * marking for open producer schemas.
 */

type CompatMap = Map<string, 'backward' | 'none'>;

function buildPlan(): DeterministicPlanDraftV1 {
  return {
    schemaVersion: 'deterministic-plan/v1',
    plannerVersion: 'v1',
    catalogVersion: 'v1',
    planType: 'sequential',
    objective: 'test plan',
    originalRequest: 'test',
    status: 'draft',
    nodes: [
      {
        nodeId: 'producer',
        sequence: 1,
        title: 'Producer',
        kind: 'skill',
        skillId: 'test_skill',
        skillVersion: '1.0.0',
        runtimeType: 'workflow',
        dependsOn: [],
        inputBindings: {},
        outputContract: { data: 'json' },
        failurePolicy: 'abort',
      },
      {
        nodeId: 'consumer',
        sequence: 2,
        title: 'Consumer',
        kind: 'llm_operation',
        operationId: 'summarize_text',
        operationVersion: '1',
        operationDigest: 'sha256:planner-untrusted',
        contractDigest: 'sha256:planner-untrusted',
        promptTemplateId: 'p1',
        promptTemplateVersion: '1',
        modelPolicyId: 'm1',
        temperature: 0,
        maxInputTokens: 1000,
        maxOutputTokens: 500,
        dependsOn: ['producer'],
        inputBindings: {
          data: { source: 'node_output', nodeId: 'producer', outputPath: 'data' },
        },
        outputContract: {},
        failurePolicy: 'abort',
      },
    ],
    finalOutputs: [],
  };
}

function createService() {
  const validator = new DeterministicPlanValidatorService();
  const catalog = {
    resolveContract: jest.fn(),
    schemaDigest: jest.fn(() => 'dummy-digest'),
    computeContractDigest: jest.fn(() => 'dummy-digest'),
  };
  const attestationClient = {
    hasValidAttestation: jest.fn(),
    hasValidAttestationForVersion: jest.fn(),
  };
  const service = new DeterministicPlanFreezeService({} as any, validator, catalog as any, attestationClient as any);
  return { service, catalog, validator, attestationClient };
}

function validateEdges(
  service: DeterministicPlanFreezeService,
  plan: DeterministicPlanDraftV1,
  resolvedOutputSchemas: Record<string, Record<string, unknown>>,
  resolvedInputSchemas: Record<string, Record<string, unknown> | null>,
  contractCompatMap: CompatMap,
): { errors: PlanValidationErrorV1[]; requiredOnlyEdges: any[] } {
  return (service as any).validateEdgeContractCompatibility(
    plan,
    resolvedOutputSchemas,
    resolvedInputSchemas,
    contractCompatMap,
  );
}

function defaultCompatMap(): CompatMap {
  return new Map([
    ['producer', 'backward'],
    ['consumer', 'backward'],
  ]);
}

describe('DeterministicPlanFreezeService — composition validation (§10.4)', () => {
  it('overrides planner workflow routing with authoritative browser release runtime metadata', () => {
    const { service } = createService();
    const node = buildPlan().nodes[0] as any;
    node.outputContract = { text: 'string', summary: 'string' };

    (service as any).applyAuthoritativeContract(node, {
      inputSchema: null,
      outputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
      },
      sourceType: 'published_skill',
      runtimeType: 'browser_template',
    });

    expect(node.runtimeType).toBe('browser_template');
    expect(node.executionRuntimeType).toBe('browser');
    expect(node.outputContract).toEqual({ text: 'string' });
  });

  describe('authoritative output contract projection', () => {
    it('projects ArtifactRef semantics while preserving the physical field name', () => {
      const { service } = createService();

      const contract = (service as any).schemaToOutputContract({
        type: 'object',
        'x-primary-output': 'artifact',
        properties: {
          artifact: {
            type: 'object',
            'x-value-type': 'artifact_ref',
            properties: {
              name: { type: 'string' },
              url: { type: 'string' },
              mimeType: { type: 'string' },
            },
          },
          artifacts: { type: 'array' },
        },
      });

      expect(contract).toEqual({ artifact: 'artifact_ref', artifacts: 'json' });
      expect(contract).not.toHaveProperty('artifact_ref');
    });
  });

  describe('primitive type compatibility (existing check, §15.3 item 4)', () => {
    it('rejects a definite primitive type conflict', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: 'number' } } } },
        { consumer: { type: 'object', properties: { data: { type: 'string' } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ERROR_CODES.EDGE_TYPE_INCOMPATIBLE);
      expect(result.errors[0].field).toBe('data');
    });
  });

  describe('enum set compatibility', () => {
    it('accepts an upstream enum that is a subset of the downstream enum', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: 'string', enum: ['a', 'b'] } } } },
        { consumer: { type: 'object', properties: { data: { type: 'string', enum: ['a', 'b', 'c'] } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
    });

    it('rejects an upstream enum that overflows the downstream enum', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: 'string', enum: ['a', 'b'] } } } },
        { consumer: { type: 'object', properties: { data: { type: 'string', enum: ['a'] } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ERROR_CODES.EDGE_TYPE_INCOMPATIBLE);
      expect(result.errors[0].field).toBe('data');
    });

    it('skips the enum check when either side declares no enum (fail-open)', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: 'string', enum: ['a', 'b'] } } } },
        { consumer: { type: 'object', properties: { data: { type: 'string' } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('nullable compatibility', () => {
    it('rejects a nullable producer feeding a non-null consumer', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: ['string', 'null'] } } } },
        { consumer: { type: 'object', properties: { data: { type: 'string' } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ERROR_CODES.EDGE_TYPE_INCOMPATIBLE);
      expect(result.errors[0].field).toBe('data');
    });

    it('accepts a non-nullable producer feeding a nullable consumer', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: 'string' } } } },
        { consumer: { type: 'object', properties: { data: { type: ['string', 'null'] } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('array item type compatibility', () => {
    it('rejects mismatched array item types', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: 'array', items: { type: 'string' } } } } },
        { consumer: { type: 'object', properties: { data: { type: 'array', items: { type: 'number' } } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ERROR_CODES.EDGE_TYPE_INCOMPATIBLE);
      expect(result.errors[0].field).toBe('data');
    });

    it('accepts compatible array item types', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: 'array', items: { type: 'string' } } } } },
        { consumer: { type: 'object', properties: { data: { type: 'array', items: { type: 'string' } } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
    });

    it('skips the items check when a side omits items (fail-open)', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: 'array' } } } },
        { consumer: { type: 'object', properties: { data: { type: 'array', items: { type: 'number' } } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('object required-field coverage', () => {
    it('accepts upstream required covering downstream required', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        {
          producer: {
            type: 'object',
            required: ['x', 'y'],
            properties: { data: { type: 'object', required: ['x', 'y'], properties: { x: { type: 'string' }, y: { type: 'string' } } } },
          },
        },
        {
          consumer: {
            type: 'object',
            properties: { data: { type: 'object', required: ['x'], properties: { x: { type: 'string' } } } },
          },
        },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
    });

    it('rejects downstream required fields the producer does not guarantee', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        {
          producer: {
            type: 'object',
            properties: { data: { type: 'object', required: ['x'], properties: { x: { type: 'string' } } } },
          },
        },
        {
          consumer: {
            type: 'object',
            properties: {
              data: { type: 'object', required: ['x', 'y'], properties: { x: { type: 'string' }, y: { type: 'string' } } },
            },
          },
        },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ERROR_CODES.EDGE_TYPE_INCOMPATIBLE);
      expect(result.errors[0].message).toContain('y');
    });

    it('skips the required check when the producer declares none (fail-open)', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: 'object', properties: { x: { type: 'string' } } } } } },
        {
          consumer: {
            type: 'object',
            properties: { data: { type: 'object', required: ['x'], properties: { x: { type: 'string' } } } },
          },
        },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("contractCompatibility: 'none' opt-out", () => {
    it('skips ALL checks when the consumer opts out', () => {
      const { service } = createService();
      const plan = buildPlan();
      const compatMap: CompatMap = new Map([
        ['producer', 'backward'],
        ['consumer', 'none'],
      ]);
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: 'number', enum: ['a'] } } } },
        { consumer: { type: 'object', properties: { data: { type: 'string', enum: ['a', 'b'] } } } },
        compatMap,
      );
      expect(result.errors).toHaveLength(0);
      expect(result.requiredOnlyEdges).toHaveLength(0);
    });

    it('skips ALL checks when the producer opts out', () => {
      const { service } = createService();
      const plan = buildPlan();
      const compatMap: CompatMap = new Map([
        ['producer', 'none'],
        ['consumer', 'backward'],
      ]);
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: 'number' } } } },
        { consumer: { type: 'object', properties: { data: { type: 'string' } } } },
        compatMap,
      );
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('required_only marking for open producer schemas (§10.4)', () => {
    it('marks edges fed by an additionalProperties: true producer as required_only', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        {
          producer: {
            type: 'object',
            additionalProperties: true,
            properties: { data: { type: 'string' } },
          },
        },
        { consumer: { type: 'object', properties: { data: { type: 'string' } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
      expect(result.requiredOnlyEdges).toEqual([
        {
          nodeId: 'consumer',
          field: 'data',
          producerNodeId: 'producer',
          outputPath: 'data',
          severity: 'required_only',
        },
      ]);
    });

    it('does not mark edges fed by a closed producer schema', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        {
          producer: {
            type: 'object',
            additionalProperties: false,
            properties: { data: { type: 'string' } },
          },
        },
        { consumer: { type: 'object', properties: { data: { type: 'string' } } } },
        defaultCompatMap(),
      );
      expect(result.requiredOnlyEdges).toHaveLength(0);
    });
  });

  describe('artifact type/mimeType compatibility (§10.4 item 8)', () => {
    function planExpectingArtifact(): DeterministicPlanDraftV1 {
      const plan = buildPlan();
      (plan.nodes[1].inputBindings.data as any).expectedType = 'artifact_ref';
      return plan;
    }

    it('rejects an artifact_ref edge whose producer schema lacks url/mimeType', () => {
      const { service } = createService();
      const plan = planExpectingArtifact();
      const result = validateEdges(
        service,
        plan,
        {
          producer: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: { name: { type: 'string' }, sizeBytes: { type: 'number' } },
              },
            },
          },
        },
        { consumer: { type: 'object', properties: { data: { type: 'object' } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ERROR_CODES.EDGE_TYPE_INCOMPATIBLE);
      expect(result.errors[0].message).toContain('url');
      expect(result.errors[0].message).toContain('mimeType');
    });

    it('accepts an artifact_ref edge whose producer schema declares url + mimeType', () => {
      const { service } = createService();
      const plan = planExpectingArtifact();
      const result = validateEdges(
        service,
        plan,
        {
          producer: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  name: { type: 'string' },
                  mimeType: { type: 'string' },
                },
              },
            },
          },
        },
        { consumer: { type: 'object', properties: { data: { type: 'object' } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
    });

    it('fails open for a minimal producer schema with no declared properties', () => {
      const { service } = createService();
      const plan = planExpectingArtifact();
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: 'object' } } } },
        { consumer: { type: 'object', properties: { data: { type: 'object' } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
    });

    it('rejects a producer mimeType enum that overflows the consumer mimeType enum', () => {
      const { service } = createService();
      const plan = planExpectingArtifact();
      const result = validateEdges(
        service,
        plan,
        {
          producer: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  mimeType: { type: 'string', enum: ['text/markdown'] },
                },
              },
            },
          },
        },
        {
          consumer: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: { mimeType: { type: 'string', enum: ['application/pdf'] } },
              },
            },
          },
        },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ERROR_CODES.EDGE_TYPE_INCOMPATIBLE);
      expect(result.errors[0].message).toContain('mimeType');
    });

    it('accepts a producer mimeType subset of the consumer mimeType values', () => {
      const { service } = createService();
      const plan = planExpectingArtifact();
      const result = validateEdges(
        service,
        plan,
        {
          producer: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  mimeType: { type: 'string', const: 'text/markdown' },
                },
              },
            },
          },
        },
        {
          consumer: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: { mimeType: { type: 'string', enum: ['text/markdown', 'application/pdf'] } },
              },
            },
          },
        },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
    });

    it('skips artifact checks for non-artifact bindings', () => {
      const { service } = createService();
      const plan = buildPlan(); // binding without expectedType
      const result = validateEdges(
        service,
        plan,
        {
          producer: {
            type: 'object',
            properties: { data: { type: 'object', properties: { name: { type: 'string' } } } },
          },
        },
        { consumer: { type: 'object', properties: { data: { type: 'object' } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('binding outputPath must exist in the producer schema (fix ⑧)', () => {
    it('rejects a binding whose outputPath is absent from a declared property set', () => {
      const { service } = createService();
      const plan = buildPlan();
      (plan.nodes[1].inputBindings.data as any).outputPath = 'ghost';
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: 'string' }, other: { type: 'number' } } } },
        { consumer: { type: 'object', properties: { data: { type: 'string' } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ERROR_CODES.EDGE_TYPE_INCOMPATIBLE);
      expect(result.errors[0].nodeId).toBe('consumer');
      expect(result.errors[0].field).toBe('data');
      expect(result.errors[0].message).toContain("outputPath 'ghost'");
      expect(result.errors[0].message).toContain("'producer'");
      expect(result.errors[0].message).toContain('declares no such property');
    });

    it('accepts a binding whose outputPath is declared in the producer schema', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: { data: { type: 'string' } } } },
        { consumer: { type: 'object', properties: { data: { type: 'string' } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
    });

    it('fails open when the producer schema declares no properties at all', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object' } },
        { consumer: { type: 'object', properties: { data: { type: 'string' } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
    });

    it('fails open when the producer schema declares an empty properties object', () => {
      const { service } = createService();
      const plan = buildPlan();
      const result = validateEdges(
        service,
        plan,
        { producer: { type: 'object', properties: {} } },
        { consumer: { type: 'object', properties: { data: { type: 'string' } } } },
        defaultCompatMap(),
      );
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('freezeAndPersistPlan — composition details on validationJson', () => {
    it('persists requiredOnlyEdges in validationJson and keeps planJson canonical', async () => {
      const { service, catalog, attestationClient } = createService();
      catalog.resolveContract.mockImplementation(async (_client: any, node: any) => {
        if (node.nodeId === 'producer') {
          return {
            inputSchema: null,
            outputSchema: {
              type: 'object',
              additionalProperties: true,
              properties: { data: { type: 'string' } },
            },
            contractCompatibility: 'backward',
          };
        }
        return {
          capabilityRef: { id: 'summarize_text', version: '1', digest: 'sha256:op-v1' },
          inputSchema: { type: 'object', properties: { data: { type: 'string' } } },
          outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
          contractCompatibility: 'backward',
          sourceType: 'llm_operation',
        };
      });

      attestationClient.hasValidAttestationForVersion.mockResolvedValue(true);

      const client = {
        executionPlan: { create: jest.fn().mockResolvedValue({ id: 'plan-1' }) },
        executionStep: { create: jest.fn().mockResolvedValue({ id: 'step-1' }) },
      };

      const plan = buildPlan();
      const result = await service.freezeAndPersistPlan('exec-1', plan, client as any);

      expect(result.planId).toBe('plan-1');
      expect(result.planHash).toMatch(/^[0-9a-f]{64}$/);

      const planData = client.executionPlan.create.mock.calls[0][0].data;
      expect(planData.validationJson.composition.requiredOnlyEdges).toEqual([
        {
          nodeId: 'consumer',
          field: 'data',
          producerNodeId: 'producer',
          outputPath: 'data',
          severity: 'required_only',
        },
      ]);
      // planJson stays canonical for hashing — no composition metadata leaks in.
      expect(planData.planJson.composition).toBeUndefined();
      expect(client.executionStep.create).toHaveBeenCalledTimes(2);
    });

    it('stamps contractDigest via the shared contract-envelope digest (fix ④)', async () => {
      const { service, catalog, attestationClient } = createService();
      catalog.resolveContract.mockImplementation(async (_client: any, node: any) => {
        if (node.nodeId === 'producer') {
          return {
            inputSchema: null,
            outputSchema: { type: 'object', properties: { data: { type: 'string' } } },
            contractCompatibility: 'backward',
            sourceType: 'builtin_skill',
          };
        }
        return {
          capabilityRef: { id: 'summarize_text', version: '1', digest: 'sha256:op-v1' },
          inputSchema: { type: 'object', properties: { data: { type: 'string' } } },
          outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
          contractCompatibility: 'backward',
          sourceType: 'llm_operation',
        };
      });
      catalog.computeContractDigest.mockReturnValue('sha256:shared-envelope-digest');

      attestationClient.hasValidAttestationForVersion.mockResolvedValue(true);

      const client = {
        executionPlan: { create: jest.fn().mockResolvedValue({ id: 'plan-1' }) },
        executionStep: { create: jest.fn().mockResolvedValue({ id: 'step-1' }) },
      };

      const plan = buildPlan();
      await service.freezeAndPersistPlan('exec-1', plan, client as any);

      // The digest is delegated to the catalog's shared-envelope computation
      // (input + output contracts + metadata), never the raw schemaDigest.
      expect(catalog.computeContractDigest).toHaveBeenCalledWith(
        plan.nodes[1],
        expect.objectContaining({
          inputSchema: expect.objectContaining({ properties: expect.objectContaining({ data: expect.anything() }) }),
          outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
          sourceType: 'llm_operation',
        })
      );
      expect(plan.nodes[1].contractDigest).toBe('sha256:shared-envelope-digest');
      expect(catalog.schemaDigest).not.toHaveBeenCalled();
    });
  });

  describe('Phase 2-γ — freeze-time gates for llm_operation nodes', () => {
    it('replaces missing planner operationVersion with catalog authority', async () => {
      const { service, catalog, attestationClient } = createService();
      const plan = buildPlan();
      delete (plan.nodes[1] as any).operationVersion;
      delete (plan.nodes[1] as any).promptTemplateVersion;

      catalog.resolveContract.mockImplementation(async (_client: any, node: any) =>
        node.nodeId === 'producer'
          ? {
              inputSchema: null,
              outputSchema: { type: 'object', properties: { data: { type: 'string' } } },
              contractCompatibility: 'backward',
              sourceType: 'builtin_skill',
            }
          : {
              capabilityRef: { id: 'summarize_text', version: '1', digest: 'sha256:op-v1' },
              inputSchema: { type: 'object', properties: { data: { type: 'string' } } },
              outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
              contractCompatibility: 'backward',
              sourceType: 'llm_operation',
            },
      );

      attestationClient.hasValidAttestationForVersion.mockResolvedValue(true);
      const client = {
        executionPlan: { create: jest.fn().mockResolvedValue({ id: 'plan-1' }) },
        executionStep: { create: jest.fn().mockResolvedValue({ id: 'step-1' }) },
      };

      await service.freezeAndPersistPlan('exec-1', plan, client as any);
      expect((plan.nodes[1] as any).operationVersion).toBe('1');
      expect((plan.nodes[1] as any).operationDigest).toBe('sha256:op-v1');
    });

    it('rejects freeze when attestation is missing', async () => {
      const { service, catalog, attestationClient } = createService();
      const plan = buildPlan();

      catalog.resolveContract.mockResolvedValue({
        capabilityRef: { id: 'summarize_text', version: '1', digest: 'sha256:op-v1' },
        inputSchema: { type: 'object', properties: { data: { type: 'string' } } },
        outputSchema: { type: 'object', properties: {} },
        contractCompatibility: 'backward',
        sourceType: 'llm_operation',
      });

      attestationClient.hasValidAttestationForVersion.mockResolvedValue(false);

      const client = {
        executionPlan: { create: jest.fn() },
        executionStep: { create: jest.fn() },
      };

      await expect(
        service.freezeAndPersistPlan('exec-1', plan, client as any),
      ).rejects.toThrow("LLM operation 'summarize_text' version '1' has no valid attestation");
    });

    it('allows freeze when attestation passes', async () => {
      const { service, catalog, attestationClient } = createService();
      const plan = buildPlan();

      catalog.resolveContract.mockImplementation(async (_client: any, node: any) => {
        if (node.nodeId === 'producer') {
          return {
            inputSchema: null,
            outputSchema: { type: 'object', properties: { data: { type: 'string' } } },
            contractCompatibility: 'backward',
            sourceType: 'builtin_skill',
          };
        }
        return {
          capabilityRef: { id: 'summarize_text', version: '1', digest: 'sha256:op-v1' },
          inputSchema: { type: 'object', properties: { data: { type: 'string' } } },
          outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
          contractCompatibility: 'backward',
          sourceType: 'llm_operation',
        };
      });

      attestationClient.hasValidAttestationForVersion.mockResolvedValue(true);

      const client = {
        executionPlan: { create: jest.fn().mockResolvedValue({ id: 'plan-1' }) },
        executionStep: { create: jest.fn().mockResolvedValue({ id: 'step-1' }) },
      };

      const result = await service.freezeAndPersistPlan('exec-1', plan, client as any);

      expect(result.planId).toBe('plan-1');
      expect(attestationClient.hasValidAttestationForVersion).toHaveBeenCalledWith(
        'summarize_text',
        '1',
      );
    });

    it('rejects freeze on attestation client error (fail-closed)', async () => {
      const { service, catalog, attestationClient } = createService();
      const plan = buildPlan();

      catalog.resolveContract.mockResolvedValue({
        capabilityRef: { id: 'summarize_text', version: '1', digest: 'sha256:op-v1' },
        inputSchema: { type: 'object', properties: { data: { type: 'string' } } },
        outputSchema: { type: 'object', properties: {} },
        contractCompatibility: 'backward',
        sourceType: 'llm_operation',
      });

      attestationClient.hasValidAttestationForVersion.mockRejectedValue(
        new Error('Network timeout'),
      );

      const client = {
        executionPlan: { create: jest.fn() },
        executionStep: { create: jest.fn() },
      };

      await expect(
        service.freezeAndPersistPlan('exec-1', plan, client as any),
      ).rejects.toThrow("LLM operation 'summarize_text' version '1' attestation check failed");
    });

    it('does not call attestationClient for skill nodes', async () => {
      const { service, catalog, attestationClient } = createService();
      const plan = buildPlan();
      plan.nodes[1].kind = 'skill';
      (plan.nodes[1] as any).skillId = 'test_skill';
      (plan.nodes[1] as any).skillVersion = '1.0.0';
      delete (plan.nodes[1] as any).operationId;

      catalog.resolveContract.mockResolvedValue({
        inputSchema: { type: 'object', properties: { data: { type: 'string' } } },
        outputSchema: { type: 'object', properties: { data: { type: 'string' } } },
        contractCompatibility: 'backward',
        sourceType: 'builtin_skill',
      });

      const client = {
        executionPlan: { create: jest.fn().mockResolvedValue({ id: 'plan-1' }) },
        executionStep: { create: jest.fn().mockResolvedValue({ id: 'step-1' }) },
      };

      await service.freezeAndPersistPlan('exec-1', plan, client as any);

      expect(attestationClient.hasValidAttestationForVersion).not.toHaveBeenCalled();
    });
  });
});
