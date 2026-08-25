import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';
import { DeterministicPlanGeneratorService } from './deterministic-plan-generator.service';
import { DeterministicTopologyValidatorService } from '../topology/deterministic-topology-validator.service';
import { DeterministicRecipeMatcherService } from '../topology/deterministic-recipe-matcher.service';
import { DeterministicRecipeTopologyBuilderService } from '../topology/deterministic-recipe-topology-builder.service';

describe('DeterministicPlanGeneratorService operation-only continuation', () => {
  it('creates a pure operation plan from a trusted previous execution result', async () => {
    const operationCard = {
      id: 'summarize_list',
      kind: 'llm_operation',
      displayName: '列表摘要',
      summary: '对列表结果进行总结',
      goals: ['summarize'],
      inputs: { items: 'array' },
      outputs: { markdown_content: 'markdown_content' },
      primaryOutput: 'markdown_content',
      executableVersion: '1.0.8',
      operationDigest: 'sha256:operation',
      contractDigest: 'sha256:contract',
    } as unknown as CompactCapabilityCardV1;
    const aliasMap = new Map<string, CompactCapabilityCardV1>([
      ['o0', operationCard],
      ['summarize_list', operationCard],
    ]);
    const candidateSelector = {
      selectCandidates: jest.fn().mockResolvedValue({
        skillCards: [],
        llmOperationCards: [operationCard],
      }),
    };
    const cardProjector = {
      projectCandidateCards: jest.fn().mockReturnValue({
        routingCards: [
          {
            key: 'o0',
            capabilityKind: 'llm_operation',
            displayName: '列表摘要',
            description: '对列表结果进行总结',
            goals: ['summarize'],
            accepts: ['items'],
            produces: ['markdown_content'],
            supportsArtifactOutput: false,
          },
        ],
        aliasMap,
      }),
    };
    const topologyPlanner = {
      planTopology: jest.fn().mockResolvedValue({
        schemaVersion: 'deterministic-topology/v1',
        objective: '总结上一次结果',
        matchDecision: 'matched',
        matchConfidence: 0.95,
        matchReason: '上一次列表结果可由列表摘要能力处理',
        nodes: [{ ref: 'n1', capabilityKey: 'o0', dependsOn: [] }],
        finalNodeRef: 'n1',
        finalOutputKind: 'value',
      }),
    };
    const parameterBinder = {
      bindParameters: jest.fn().mockResolvedValue({
        nodeBindings: {
          n1: { items: { source: 'literal', value: [{ title: 'A' }] } },
        },
        planInputs: { n1: { items: [{ title: 'A' }] } },
        requiredUserInputs: [],
      }),
    };
    const expectedPlan = {
      schemaVersion: 'deterministic-plan/v1',
      nodes: [{ kind: 'llm_operation', operationId: 'summarize_list' }],
    };
    const contractAssembler = {
      assemblePlan: jest.fn().mockReturnValue(expectedPlan),
    };
    const service = new DeterministicPlanGeneratorService(
      {
        getPreferredDefaultModel: jest.fn().mockReturnValue({
          id: 'task-model',
          name: 'task-model',
          status: 'active',
        }),
      } as any,
      candidateSelector as any,
      undefined,
      parameterBinder as any,
      contractAssembler as any,
      cardProjector as any,
      topologyPlanner as any,
      new DeterministicTopologyValidatorService()
    );

    const result = await service.generatePlan({
      userRequest: '进行总结',
      availableSkills: [],
      systemInputs: {
        previousResultRef: {
          executionId: 'execution-search-1',
          resultType: 'search_results',
        },
        previousResultData: { searchResults: [{ title: 'A' }] },
      },
    });

    expect(result).toEqual(expect.objectContaining(expectedPlan));
    expect(topologyPlanner.planTopology).toHaveBeenCalledWith('进行总结', expect.any(Array), {
      hasPreviousResult: true,
      previousResultType: 'search_results',
    });
    expect(parameterBinder.bindParameters).toHaveBeenCalledWith(
      '进行总结',
      expect.any(Array),
      aliasMap,
      undefined,
      expect.objectContaining({
        previousResultRef: expect.objectContaining({ executionId: 'execution-search-1' }),
      }),
      'task-model'
    );
  });

  it('keeps a pure operation plan without previous content so binding can request the required input', async () => {
    const operationCard = {
      id: 'summarize_text',
      kind: 'llm_operation',
      displayName: '文本摘要',
      summary: '对文本进行总结',
      goals: ['summarize'],
      inputs: { text: 'string' },
      outputs: { markdown_content: 'markdown_content' },
      primaryOutput: 'markdown_content',
    } as unknown as CompactCapabilityCardV1;
    const aliasMap = new Map<string, CompactCapabilityCardV1>([['o0', operationCard]]);
    const topology = {
      schemaVersion: 'deterministic-topology/v1',
      objective: '总结文本',
      matchDecision: 'matched',
      matchConfidence: 0.95,
      matchReason: '文本摘要能力覆盖目标',
      nodes: [{ ref: 'n1', capabilityKey: 'o0', dependsOn: [] }],
      finalNodeRef: 'n1',
      finalOutputKind: 'value',
    };
    const candidateSelector = {
      selectCandidates: jest.fn().mockResolvedValue({
        skillCards: [],
        llmOperationCards: [operationCard],
      }),
    };
    const topologyPlanner = { planTopology: jest.fn().mockResolvedValue(topology) };
    const parameterBinder = {
      bindParameters: jest.fn().mockResolvedValue({
        nodeBindings: { n1: { text: { source: 'user_input', path: 'planInputs.n1.text' } } },
        planInputs: { n1: {} },
        requiredUserInputs: [{ targetField: 'text', missing: true }],
      }),
    };
    const expectedPlan = {
      schemaVersion: 'deterministic-plan/v1',
      requiredUserInputs: [{ targetField: 'text', missing: true }],
    };
    const service = new DeterministicPlanGeneratorService(
      {
        getPreferredDefaultModel: jest.fn().mockReturnValue({
          id: 'task-model',
          name: 'task-model',
          status: 'active',
        }),
      } as any,
      candidateSelector as any,
      undefined,
      parameterBinder as any,
      { assemblePlan: jest.fn().mockReturnValue(expectedPlan) } as any,
      {
        projectCandidateCards: jest.fn().mockReturnValue({
          routingCards: [{ key: 'o0', capabilityKind: 'llm_operation' }],
          aliasMap,
        }),
      } as any,
      topologyPlanner as any,
      new DeterministicTopologyValidatorService()
    );

    const result = await service.generatePlan({
      userRequest: '进行总结',
      availableSkills: [],
    });

    expect(result).toEqual(expectedPlan);
    expect(topologyPlanner.planTopology).toHaveBeenCalledWith('进行总结', expect.any(Array), {
      hasPreviousResult: false,
      previousResultType: undefined,
    });
    expect(parameterBinder.bindParameters).toHaveBeenCalledWith(
      '进行总结',
      topology.nodes,
      aliasMap,
      undefined,
      undefined,
      'task-model'
    );
  });

  it('freezes grounded advice through transform_text without calling the topology model', async () => {
    const operationCard = {
      id: 'transform_text',
      kind: 'llm_operation',
      displayName: '标准 LLM 文本变换',
      summary: '基于已有内容生成建议或执行文本变换',
      goals: ['transform_text', 'grounded_advice'],
      inputs: { content: 'string', instruction: 'string' },
      outputs: { content: 'string' },
      primaryOutput: 'content',
      executableVersion: '1.0.17',
      operationDigest: 'sha256:transform-operation',
      contractDigest: 'sha256:transform-contract',
    } as unknown as CompactCapabilityCardV1;
    const aliasMap = new Map<string, CompactCapabilityCardV1>([
      ['o0', operationCard],
      ['transform_text', operationCard],
    ]);
    const topologyPlanner = { planTopology: jest.fn() };
    const parameterBinder = {
      bindParameters: jest.fn().mockResolvedValue({
        nodeBindings: {
          n1: {
            content: { source: 'literal', value: '上海 31°C，体感 36°C，局部阵雨' },
            instruction: { source: 'literal', value: '给出穿衣建议' },
          },
        },
        planInputs: {
          n1: {
            content: '上海 31°C，体感 36°C，局部阵雨',
            instruction: '给出穿衣建议',
          },
        },
        requiredUserInputs: [],
      }),
    };
    const expectedPlan = {
      schemaVersion: 'deterministic-plan/v1',
      nodes: [{ kind: 'llm_operation', operationId: 'transform_text' }],
    };
    const service = new DeterministicPlanGeneratorService(
      {
        getPreferredDefaultModel: jest.fn().mockReturnValue({
          id: 'task-model',
          name: 'task-model',
          status: 'active',
        }),
      } as any,
      {
        selectCandidates: jest.fn().mockResolvedValue({
          skillCards: [],
          llmOperationCards: [operationCard],
        }),
      } as any,
      undefined,
      parameterBinder as any,
      { assemblePlan: jest.fn().mockReturnValue(expectedPlan) } as any,
      {
        projectCandidateCards: jest.fn().mockReturnValue({
          routingCards: [
            {
              key: 'o0',
              capabilityKind: 'llm_operation',
              displayName: operationCard.displayName,
            },
          ],
          aliasMap,
        }),
      } as any,
      topologyPlanner as any,
      new DeterministicTopologyValidatorService(),
      new DeterministicRecipeMatcherService(),
      new DeterministicRecipeTopologyBuilderService()
    );

    const result = await service.generatePlan({
      userRequest: '给出穿衣建议',
      availableSkills: [],
      systemInputs: {
        previousResultRef: { executionId: 'weather-execution-1', resultType: 'weather' },
        previousResultData: { summary: '上海 31°C，体感 36°C，局部阵雨' },
      },
    });

    expect(result).toEqual(expect.objectContaining(expectedPlan));
    expect(topologyPlanner.planTopology).not.toHaveBeenCalled();
    expect(parameterBinder.bindParameters).toHaveBeenCalledWith(
      '给出穿衣建议',
      [{ ref: 'n1', capabilityKey: 'transform_text', dependsOn: [] }],
      aliasMap,
      undefined,
      expect.objectContaining({
        previousResultRef: expect.objectContaining({ executionId: 'weather-execution-1' }),
      }),
      'task-model'
    );
  });
});
