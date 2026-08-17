import { DeterministicPlanValidatorService } from './deterministic-plan-validator.service';
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
          content: { source: 'node_output', nodeId: 'summarize_news', outputPath: 'markdown_content' },
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
    producer.operationVersion = '1';
    producer.operationDigest = 'digest';
    producer.contractDigest = 'contract-digest';
    delete producer.skillId;
    delete producer.skillVersion;
    delete producer.runtimeType;

    const result = validator.validatePlan(invalidPlan);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: ERROR_CODES.FINAL_OUTPUT_UNSATISFIED,
        message: expect.stringContaining('artifact-producing Skill node'),
      }),
    ]));
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
});
