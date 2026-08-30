import { RecorderCompositePlanCompilerService } from '../src/modules/execution/plan-runtime/recorder-composite-plan-compiler.service';
import { DeterministicPlanValidatorService } from '../src/modules/execution/plan-runtime/deterministic-plan-validator.service';

describe('RecorderCompositePlanCompilerService', () => {
  const catalog = {
    resolveContract: jest.fn().mockResolvedValue({
      capabilityRef: { id: 'summarize_text', version: 'v1', digest: 'operation-digest' },
      inputSchema: { type: 'object' },
      outputSchema: {
        type: 'object',
        properties: { result: { type: 'string', 'x-primary-output': true } },
      },
    }),
  };

  beforeEach(() => catalog.resolveContract.mockClear());

  it('compiles an explicit browser-to-content-to-LLM plan with frozen operation identity', async () => {
    const service = new RecorderCompositePlanCompilerService({} as any, catalog as any);
    const plan = await service.compile({
      browser: { skillId: 'browser-skill', skillVersion: '7', outputNames: ['article_content'] },
      composition: {
        outputDeclarations: [{ name: 'article_content', kind: 'content' }],
        postProcessingSteps: [{
          id: 'summarize', type: 'llm_operation', operationId: 'summarize_text', operationVersion: 'v1',
          inputBindings: { text: { source: 'node_output', transform: 'resolve_text_content' } },
          runWhen: 'browser_succeeded',
        }],
      },
    });

    expect(plan.nodes.map((node) => node.nodeId)).toEqual(['browser_recording', 'summarize']);
    expect(plan.nodes[1]).toEqual(expect.objectContaining({ operationDigest: 'operation-digest' }));
    expect((plan.nodes[1] as any).inputBindings.text).toEqual(expect.objectContaining({
      nodeId: 'browser_recording', path: 'article_content', transform: 'resolve_text_content',
    }));
    expect(plan.finalOutputs).toEqual([expect.objectContaining({ fromNodeId: 'summarize', fromNodeOutput: 'result' })]);
  });

  it('preserves terminal semantics and enables the browser terminal continuation policy', async () => {
    const service = new RecorderCompositePlanCompilerService({} as any, catalog as any);
    const plan = await service.compile({
      browser: { skillId: 'browser-skill', skillVersion: '7' },
      composition: {
        outputDeclarations: [{ name: 'article_content', kind: 'content' }],
        postProcessingSteps: [{
          id: 'summarize', type: 'llm_operation', operationId: 'summarize_text', operationVersion: 'v1',
          inputBindings: { text: { source: 'node_output', path: 'article_content' } },
          runWhen: 'browser_terminal',
        }],
      },
    });
    expect(plan.nodes[0]).toEqual(expect.objectContaining({ failurePolicy: 'continue' }));
    expect(plan.nodes[1]).toEqual(expect.objectContaining({ runWhen: 'browser_terminal' }));
  });

  it('preserves a custom prompt as a literal transform_text instruction', async () => {
    catalog.resolveContract.mockResolvedValueOnce({
      capabilityRef: { id: 'transform_text', version: '1', digest: 'transform-digest' },
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object', properties: { content: { type: 'string', 'x-primary-output': true } } },
    });
    const service = new RecorderCompositePlanCompilerService({} as any, catalog as any);
    const plan = await service.compile({
      browser: { skillId: 'browser-skill', skillVersion: '7' },
      composition: {
        outputDeclarations: [{ name: 'step_2_clean_content', kind: 'content' }],
        postProcessingSteps: [{
          id: 'analyze', type: 'llm_operation', operationId: 'transform_text', operationVersion: '1',
          inputBindings: {
            content: { source: 'node_output', path: 'step_2_clean_content', transform: 'resolve_text_content' },
            instruction: { source: 'literal', value: '提取故障、影响和建议' },
          },
          runWhen: 'browser_succeeded',
        }],
      },
    });

    expect((plan.nodes[1] as any).inputBindings.instruction).toEqual({
      source: 'literal', value: '提取故障、影响和建议',
    });
  });

  it('compiles multi-step content bindings with combined output paths', async () => {
    catalog.resolveContract.mockResolvedValueOnce({
      capabilityRef: { id: 'transform_text', version: '1', digest: 'transform-digest' },
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object', properties: { content: { type: 'string', 'x-primary-output': true } } },
    });
    const service = new RecorderCompositePlanCompilerService({} as any, catalog as any);
    const plan = await service.compile({
      browser: { skillId: 'browser-skill', skillVersion: '7' },
      composition: {
        outputDeclarations: [
          { name: 'step_1_clean_content', kind: 'content' },
          { name: 'step_2_clean_content', kind: 'content' },
        ],
        postProcessingSteps: [{
          id: 'analyze_both', type: 'llm_operation', operationId: 'transform_text', operationVersion: '1',
          inputBindings: {
            content: {
              source: 'node_output',
              path: 'step_1_clean_content,step_2_clean_content',
              paths: ['step_1_clean_content', 'step_2_clean_content'],
              transform: 'resolve_text_content',
            },
            instruction: { source: 'literal', value: '汇总分析两页内容' },
          },
          runWhen: 'browser_succeeded',
        }],
      },
    });

    expect((plan.nodes[1] as any).inputBindings.content).toEqual(expect.objectContaining({
      source: 'node_output',
      path: 'step_1_clean_content,step_2_clean_content',
      paths: ['step_1_clean_content', 'step_2_clean_content'],
      transform: 'resolve_text_content',
    }));
  });

  it('compiles explicit post-processing dependencies as a DAG and preserves their binding source', async () => {
    const service = new RecorderCompositePlanCompilerService({} as any, catalog as any);
    const plan = await service.compile({
      browser: { skillId: 'browser-skill', skillVersion: '7', outputNames: ['article_content'] },
      composition: {
        outputDeclarations: [{ name: 'article_content', kind: 'content' }],
        finalNodeId: 'summarize',
        postProcessingSteps: [
          {
            id: 'extract', type: 'llm_operation', operationId: 'transform_text', operationVersion: '1',
            inputBindings: { content: { source: 'node_output', path: 'article_content', transform: 'resolve_text_content' } },
            runWhen: 'browser_succeeded',
          },
          {
            id: 'classify', type: 'llm_operation', operationId: 'transform_text', operationVersion: '1',
            inputBindings: { content: { source: 'node_output', path: 'article_content', transform: 'resolve_text_content' } },
            runWhen: 'browser_succeeded',
          },
          {
            id: 'summarize', type: 'llm_operation', operationId: 'summarize_text', operationVersion: '1',
            dependsOn: ['extract', 'classify'],
            inputBindings: {
              text: { source: 'node_output', nodeId: 'extract', path: 'result', expectedType: 'string' },
            },
            runWhen: 'browser_succeeded',
          },
        ],
      },
    });

    expect(plan.planType).toBe('dag');
    expect(plan.nodes[3]).toEqual(expect.objectContaining({
      nodeId: 'summarize',
      dependsOn: ['extract', 'classify'],
    }));
    expect((plan.nodes[3] as any).inputBindings.text).toEqual(expect.objectContaining({
      nodeId: 'extract', fromNodeId: 'extract', path: 'result',
    }));
    expect(plan.finalOutputs).toEqual([
      expect.objectContaining({ fromNodeId: 'summarize', fromNodeOutput: 'result' }),
    ]);
    expect(new DeterministicPlanValidatorService().validatePlan(plan)).toEqual(
      expect.objectContaining({ valid: true, errors: [] }),
    );
  });

  it('rejects multiple DAG sinks when finalNodeId is not explicit', async () => {
    const service = new RecorderCompositePlanCompilerService({} as any, catalog as any);
    await expect(service.compile({
      browser: { skillId: 'browser-skill', skillVersion: '7', outputNames: ['article_content'] },
      composition: {
        outputDeclarations: [{ name: 'article_content', kind: 'content' }],
        postProcessingSteps: ['left', 'right'].map((id) => ({
          id, type: 'llm_operation', operationId: 'summarize_text', operationVersion: '1',
          inputBindings: { text: { source: 'node_output', path: 'article_content', transform: 'resolve_text_content' } },
          runWhen: 'browser_succeeded',
        })),
      },
    })).rejects.toThrow('RECORDER_COMPOSITION_FINAL_NODE_AMBIGUOUS');
  });

  it('keeps browser_recording as the reserved browser root node', async () => {
    const service = new RecorderCompositePlanCompilerService({} as any, catalog as any);
    await expect(service.compile({
      browser: { skillId: 'browser-skill', skillVersion: '7' },
      composition: {
        outputDeclarations: [{ name: 'article_content', kind: 'content' }],
        postProcessingSteps: [{
          id: 'browser_recording', type: 'llm_operation', operationId: 'summarize_text', operationVersion: '1',
          inputBindings: { text: { source: 'node_output', path: 'article_content' } },
          runWhen: 'browser_succeeded',
        }],
      },
    })).rejects.toThrow("cannot use 'browser_recording'");
  });

  it('keeps the browser root as a direct dependency for the default workflow report binding', async () => {
    const service = new RecorderCompositePlanCompilerService({} as any, catalog as any);
    const plan = await service.compile({
      browser: { skillId: 'browser-skill', skillVersion: '7' },
      composition: {
        outputDeclarations: [{ name: 'article_content', kind: 'content' }],
        finalNodeId: 'report',
        postProcessingSteps: [
          {
            id: 'extract', type: 'llm_operation', operationId: 'transform_text', operationVersion: '1',
            inputBindings: { content: { source: 'node_output', path: 'article_content' } },
            runWhen: 'browser_succeeded',
          },
          {
            id: 'report', type: 'workflow_skill', skillId: 'report-skill', releaseId: '2',
            inputProjection: 'ops-report-projection/v1', dependsOn: ['extract'],
            runWhen: 'browser_terminal',
          },
        ],
      },
    });

    expect(plan.nodes[2]).toEqual(expect.objectContaining({
      dependsOn: ['extract', 'browser_recording'],
      inputBindings: expect.objectContaining({
        report: expect.objectContaining({ nodeId: 'browser_recording' }),
      }),
    }));
  });
});
