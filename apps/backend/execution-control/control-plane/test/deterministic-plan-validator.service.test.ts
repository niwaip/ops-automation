import { DeterministicPlanValidatorService } from '../src/modules/execution/plan-runtime/deterministic-plan-validator.service';
import { DeterministicPlanDraftV1 } from '@ops/backend-deterministic-plan';
import { ERROR_CODES } from '@ops/backend-error-codes';

describe('DeterministicPlanValidatorService', () => {
  let validator: DeterministicPlanValidatorService;

  beforeEach(() => {
    validator = new DeterministicPlanValidatorService();
  });

  const valid3NodePlan: DeterministicPlanDraftV1 = {
    schemaVersion: 'deterministic-plan/v1',
    plannerVersion: 'v1',
    catalogVersion: 'v1',
    planType: 'sequential',
    objective: '搜索 AI 新闻并总结并输出 md 文件',
    originalRequest: '最新的人工智能新闻，并且对结果进行总结，最终输出 md 文件',
    status: 'draft',
    nodes: [
      {
        nodeId: 'search_ai_news',
        sequence: 1,
        title: '搜索 AI 新闻',
        kind: 'skill',
        skillId: 'tavily_search',
        skillVersion: '1.0.0',
        runtimeType: 'workflow',
        dependsOn: [],
        inputBindings: {
          query: { source: 'literal', value: '最新 人工智能 新闻' },
        },
        outputContract: {
          results: 'news_item_list',
        },
        failurePolicy: 'abort',
      },
      {
        nodeId: 'summarize_news',
        sequence: 2,
        title: '总结新闻内容',
        kind: 'llm_operation',
        operationId: 'summarize_list',
        operationVersion: '1',
        operationDigest: 'test-digest-123',
        contractDigest: 'test-contract-digest-456',
        promptTemplateId: 'news-summary',
        promptTemplateVersion: '1',
        modelPolicyId: 'task-default',
        temperature: 0,
        maxInputTokens: 4000,
        maxOutputTokens: 2000,
        dependsOn: ['search_ai_news'],
        inputBindings: {
          items: { source: 'node_output', nodeId: 'search_ai_news', outputPath: 'results' },
        },
        outputContract: {
          markdown_content: 'markdown_content',
        },
        failurePolicy: 'abort',
      },
      {
        nodeId: 'write_markdown_file',
        sequence: 3,
        title: '输出 Markdown 文件',
        kind: 'skill',
        skillId: 'markdown_artifact_writer',
        skillVersion: '1.0.0',
        runtimeType: 'artifact',
        dependsOn: ['summarize_news'],
        inputBindings: {
          content: {
            source: 'node_output',
            nodeId: 'summarize_news',
            outputPath: 'markdown_content',
          },
          fileName: { source: 'literal', value: 'ai_news_summary.md' },
        },
        outputContract: {
          artifact: 'artifact_ref',
        },
        failurePolicy: 'abort',
      },
    ],
    finalOutputs: [
      {
        targetField: 'artifact',
        fromNodeId: 'write_markdown_file',
        fromNodeOutput: 'artifact',
        expectedType: 'artifact_ref',
        mimeType: 'text/markdown',
        isArtifact: true,
      },
    ],
  };

  it('should validate a valid 3-node plan successfully', () => {
    const result = validator.validatePlan(valid3NodePlan);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates artifact production by output contract instead of Skill naming conventions', () => {
    const contractDrivenPlan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
    const producer = contractDrivenPlan.nodes[2] as any;
    producer.nodeId = 'n3_opaque';
    producer.skillId = 'custom.capability.42';
    producer.runtimeType = 'workflow';
    contractDrivenPlan.finalOutputs[0].fromNodeId = producer.nodeId;

    const result = validator.validatePlan(contractDrivenPlan);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects artifact_ref final output from an LLM operation even when the type tag is declared', () => {
    const invalidPlan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
    const producer = invalidPlan.nodes[2] as any;
    producer.kind = 'llm_operation';
    producer.operationId = 'rewrite_to_markdown';
    delete producer.skillId;
    delete producer.skillVersion;
    delete producer.runtimeType;

    const result = validator.validatePlan(invalidPlan);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: ERROR_CODES.FINAL_OUTPUT_UNSATISFIED,
          message: expect.stringContaining('artifact-producing Skill node'),
        }),
      ])
    );
  });

  it('should fail validation if schema version is unsupported', () => {
    const plan = { ...valid3NodePlan, schemaVersion: 'invalid-version' as any };
    const result = validator.validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe(ERROR_CODES.PLAN_SCHEMA_INVALID);
  });

  it('should fail validation if nodes exceed maximum count (6)', () => {
    const plan: DeterministicPlanDraftV1 = {
      ...valid3NodePlan,
      nodes: Array(7)
        .fill(null)
        .map((_, idx) => ({
          ...valid3NodePlan.nodes[0],
          nodeId: `node_${idx + 1}`,
          sequence: idx + 1,
          dependsOn: idx === 0 ? [] : [`node_${idx}`],
        })),
    };
    const result = validator.validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === ERROR_CODES.PLAN_LIMIT_EXCEEDED)).toBe(true);
  });

  it('should fail validation if dependsOn refers to a non-existent or subsequent node', () => {
    const invalidPlan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
    invalidPlan.nodes[0].dependsOn = ['summarize_news']; // Node 1 depending on Node 2
    const result = validator.validatePlan(invalidPlan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === ERROR_CODES.PLAN_DEPENDENCY_INVALID)).toBe(true);
  });

  it('should fail validation if input binding references missing node output field', () => {
    const invalidPlan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
    invalidPlan.nodes[1].inputBindings.items = {
      source: 'node_output',
      nodeId: 'search_ai_news',
      outputPath: 'non_existent_field',
    };
    const result = validator.validatePlan(invalidPlan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === ERROR_CODES.INPUT_TYPE_MISMATCH)).toBe(true);
  });

  it('should fail validation if finalOutputs refer to unproduced fields', () => {
    const invalidPlan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
    invalidPlan.finalOutputs[0].fromNodeOutput = 'missing_output';
    const result = validator.validatePlan(invalidPlan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === ERROR_CODES.FINAL_OUTPUT_UNSATISFIED)).toBe(true);
  });

  it('should detect sensitive tokens in literal bindings', () => {
    const invalidPlan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
    invalidPlan.nodes[0].inputBindings.query = {
      source: 'literal',
      value: 'sk-123456789012345678901234',
    };
    const result = validator.validatePlan(invalidPlan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === ERROR_CODES.PLAN_SENSITIVE_DATA_FOUND)).toBe(true);
  });

  it('should reject unresolved secret placeholders before execution', () => {
    const invalidPlan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
    invalidPlan.nodes[0].inputBindings.apiKey = {
      source: 'literal',
      value: '${TAVILY_API_KEY}',
    };
    const result = validator.validatePlan(invalidPlan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === ERROR_CODES.PLAN_SENSITIVE_DATA_FOUND)).toBe(true);
  });

  it('should reject markdown text when a file artifact is required', () => {
    const invalidPlan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
    invalidPlan.finalOutputs[0] = {
      targetField: 'markdown_content',
      fromNodeId: 'summarize_news',
      fromNodeOutput: 'markdown_content',
      expectedType: 'artifact_ref',
      mimeType: 'text/markdown',
      isArtifact: true,
    };
    const result = validator.validatePlan(invalidPlan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === ERROR_CODES.FINAL_OUTPUT_UNSATISFIED)).toBe(true);
  });

  it('accepts the reserved browser root continue policy with a terminal consumer', () => {
    const plan: DeterministicPlanDraftV1 = {
      ...valid3NodePlan,
      planType: 'sequential',
      requirements: { externalData: true },
      nodes: [
        {
          nodeId: 'browser_recording',
          sequence: 1,
          title: 'Browser recording',
          kind: 'skill',
          skillId: 'browser-template',
          skillVersion: '1.0.0',
          runtimeType: 'browser_template',
          dependsOn: [],
          inputBindings: {},
          outputContract: { browserRunOutput: 'json' },
          failurePolicy: 'continue',
        },
        {
          nodeId: 'terminal_report',
          sequence: 2,
          title: 'Terminal report',
          kind: 'llm_operation',
          operationId: 'summarize_text',
          operationVersion: '1',
          operationDigest: 'operation-digest',
          contractDigest: 'contract-digest',
          dependsOn: ['browser_recording'],
          inputBindings: {
            content: {
              source: 'node_output',
              nodeId: 'browser_recording',
              path: 'browserRunOutput',
              expectedType: 'json',
            },
          },
          outputContract: { summary: 'string' },
          failurePolicy: 'abort',
          runWhen: 'browser_terminal',
        },
      ],
      finalOutputs: [
        {
          targetField: 'result',
          fromNodeId: 'terminal_report',
          fromNodeOutput: 'summary',
          expectedType: 'string',
        },
      ],
    };

    expect(validator.validatePlan(plan)).toEqual({ valid: true, errors: [] });
  });

  it('rejects continue policy on a non-browser node', () => {
    const plan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
    plan.nodes[0].failurePolicy = 'continue';

    const result = validator.validatePlan(plan);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: ERROR_CODES.PLAN_SCHEMA_INVALID,
          nodeId: 'search_ai_news',
        }),
      ])
    );
  });

  it('rejects runWhen when the reserved browser root is not an ancestor', () => {
    const plan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
    plan.nodes[1].runWhen = 'browser_succeeded';

    const result = validator.validatePlan(plan);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: ERROR_CODES.PLAN_DEPENDENCY_INVALID,
          nodeId: 'summarize_news',
        }),
      ])
    );
  });

  it('uses explicit external-data requirements instead of objective keywords', () => {
    const localPlan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
    localPlan.objective = '现在总结这段已有文本';
    localPlan.nodes = [localPlan.nodes[1]];
    localPlan.nodes[0].nodeId = 'summarize_news';
    localPlan.nodes[0].sequence = 1;
    localPlan.nodes[0].dependsOn = [];
    localPlan.nodes[0].inputBindings = { text: { source: 'literal', value: '已有文本' } };
    localPlan.finalOutputs = [
      {
        targetField: 'result',
        fromNodeId: 'summarize_news',
        fromNodeOutput: 'markdown_content',
        expectedType: 'markdown_content',
      },
    ];

    expect(validator.validatePlan(localPlan).valid).toBe(true);

    localPlan.requirements = { externalData: true };
    const externalResult = validator.validatePlan(localPlan);
    expect(externalResult.valid).toBe(false);
    expect(
      externalResult.errors.some((error) => error.code === ERROR_CODES.PLAN_NODE_CAPABILITY_MISSING)
    ).toBe(true);
  });

  describe('edge type compatibility (§15.3 item 4)', () => {
    it('passes subtype-compatible edges (markdown_content upstream satisfies string expectation)', () => {
      const plan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
      plan.nodes[2].inputBindings.content = {
        source: 'node_output',
        nodeId: 'summarize_news',
        outputPath: 'markdown_content',
        expectedType: 'string',
      };
      const result = validator.validatePlan(plan);
      expect(result.valid).toBe(true);
      expect(result.errors.some((e) => e.code === ERROR_CODES.EDGE_TYPE_INCOMPATIBLE)).toBe(false);
    });

    it('passes json container escape hatch (json upstream satisfies news_item_list expectation)', () => {
      const plan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
      plan.nodes[0].outputContract = { results: 'json' };
      plan.nodes[1].inputBindings.items = {
        source: 'node_output',
        nodeId: 'search_ai_news',
        outputPath: 'results',
        expectedType: 'news_item_list',
      };
      const result = validator.validatePlan(plan);
      expect(result.valid).toBe(true);
    });

    it('rejects number→string edges', () => {
      const plan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
      plan.nodes[0].outputContract = { results: 'number' };
      plan.nodes[1].inputBindings.items = {
        source: 'node_output',
        nodeId: 'search_ai_news',
        outputPath: 'results',
        expectedType: 'string',
      };
      const result = validator.validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === ERROR_CODES.EDGE_TYPE_INCOMPATIBLE)).toBe(true);
    });

    it('rejects string→number edges', () => {
      const plan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
      plan.nodes[0].outputContract = { results: 'string' };
      plan.nodes[1].inputBindings.items = {
        source: 'node_output',
        nodeId: 'search_ai_news',
        outputPath: 'results',
        expectedType: 'number',
      };
      const result = validator.validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === ERROR_CODES.EDGE_TYPE_INCOMPATIBLE)).toBe(true);
    });

    it('rejects boolean→string edges', () => {
      const plan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
      plan.nodes[0].outputContract = { results: 'boolean' };
      plan.nodes[1].inputBindings.items = {
        source: 'node_output',
        nodeId: 'search_ai_news',
        outputPath: 'results',
        expectedType: 'string',
      };
      const result = validator.validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === ERROR_CODES.EDGE_TYPE_INCOMPATIBLE)).toBe(true);
    });

    it('emits a warning (not an error) when expectedType is omitted', () => {
      const result = validator.validatePlan(valid3NodePlan);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
      expect(result.warnings!.some((w) => w.includes('without expectedType'))).toBe(true);
    });

    it('does not warn when every node_output binding declares expectedType', () => {
      const plan: DeterministicPlanDraftV1 = JSON.parse(JSON.stringify(valid3NodePlan));
      plan.nodes[1].inputBindings.items = {
        source: 'node_output',
        nodeId: 'search_ai_news',
        outputPath: 'results',
        expectedType: 'news_item_list',
      };
      plan.nodes[2].inputBindings.content = {
        source: 'node_output',
        nodeId: 'summarize_news',
        outputPath: 'markdown_content',
        expectedType: 'markdown_content',
      };
      const result = validator.validatePlan(plan);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeUndefined();
    });
  });
});
