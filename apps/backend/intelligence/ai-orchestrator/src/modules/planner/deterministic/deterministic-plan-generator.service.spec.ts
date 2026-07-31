import { DeterministicPlanGeneratorService } from './deterministic-plan-generator.service';

describe('DeterministicPlanGeneratorService', () => {
  const createService = (content: string): DeterministicPlanGeneratorService => {
    const modelService = {
      getPreferredDefaultModel: jest.fn().mockReturnValue({ id: 'model-1', name: 'test-model' }),
      callModel: jest.fn().mockResolvedValue({ content }),
    };
    const candidateSelector = {
      selectCandidates: jest.fn().mockReturnValue({
        skillCards: [
          {
            id: 'skill-internal-id',
            kind: 'skill',
            summary: 'Search news',
            goals: ['api', 'Search news'],
            inputs: { query: 'string' },
            outputs: { results: 'news_item_list' },
            category: 'api',
            publishedSkillId: 'skill-published-id',
            executableVersion: '3',
          },
        ],
        llmOperationCards: [],
      }),
    };

    return new DeterministicPlanGeneratorService(modelService as any, candidateSelector as any);
  };

  it('normalizes Skill id, version, and runtimeType against trusted candidate cards', async () => {
    const service = createService(
      JSON.stringify({
        schemaVersion: 'deterministic-plan/v1',
        plannerVersion: 'v1',
        catalogVersion: 'v1',
        planType: 'single',
        objective: '搜索新闻',
        originalRequest: '',
        status: 'draft',
        nodes: [
          {
            nodeId: 'search',
            sequence: 1,
            title: '搜索',
            kind: 'skill',
            skillId: 'skill-internal-id',
            skillVersion: '999',
            runtimeType: 'workflow',
            dependsOn: [],
            inputBindings: { query: { source: 'literal', value: 'AI news' } },
            outputContract: { results: 'news_item_list' },
            failurePolicy: 'abort',
          },
        ],
        finalOutputs: [
          {
            targetField: 'results',
            fromNodeId: 'search',
            fromNodeOutput: 'results',
            expectedType: 'news_item_list',
          },
        ],
      }),
    );

    const plan = await service.generatePlan({
      userRequest: '搜索 AI 新闻',
      availableSkills: [{ id: 'skill-internal-id' }],
    });

    expect(plan.nodes[0]).toMatchObject({
      kind: 'skill',
      skillId: 'skill-published-id',
      skillVersion: '3',
      runtimeType: 'api',
    });
  });

  it('keeps the artifact requirement and user request in the repair prompt', async () => {
    const invalidPlan = JSON.stringify({
      schemaVersion: 'deterministic-plan/v1',
      nodes: [],
      finalOutputs: [],
    });
    const validPlan = JSON.stringify({
      schemaVersion: 'deterministic-plan/v1',
      plannerVersion: 'v1',
      catalogVersion: 'v1',
      planType: 'single',
      objective: '生成 Markdown 文件',
      originalRequest: '',
      status: 'draft',
      nodes: [
        {
          nodeId: 'write_artifact',
          sequence: 1,
          title: '生成 Markdown 文件',
          kind: 'skill',
          skillId: 'platform.document.markdown-artifact-writer',
          skillVersion: '1.0.0',
          runtimeType: 'artifact',
          dependsOn: [],
          inputBindings: {
            content: { source: 'literal', value: '# AI 新闻' },
            fileName: { source: 'literal', value: 'ai-news.md' },
          },
          outputContract: { artifact: 'artifact_ref' },
          failurePolicy: 'abort',
        },
      ],
      finalOutputs: [
        {
          targetField: 'artifact',
          fromNodeId: 'write_artifact',
          fromNodeOutput: 'artifact',
          expectedType: 'artifact_ref',
          mimeType: 'text/markdown',
          isArtifact: true,
        },
      ],
    });
    const modelService = {
      getPreferredDefaultModel: jest.fn().mockReturnValue({ id: 'model-1', name: 'test-model' }),
      callModel: jest.fn()
        .mockResolvedValueOnce({ content: invalidPlan })
        .mockResolvedValueOnce({ content: validPlan }),
    };
    const candidateSelector = {
      selectCandidates: jest.fn().mockReturnValue({
        skillCards: [
          {
            id: 'platform.document.markdown-artifact-writer',
            kind: 'skill',
            summary: 'Write Markdown artifact',
            goals: ['artifact'],
            inputs: { content: 'string', fileName: 'string' },
            outputs: { artifact: 'artifact_ref' },
            category: 'artifact',
            supportsArtifactOutput: true,
            publishedSkillId: 'platform.document.markdown-artifact-writer',
            executableVersion: '1.0.0',
          },
        ],
        llmOperationCards: [],
      }),
    };
    const service = new DeterministicPlanGeneratorService(modelService as any, candidateSelector as any);
    const userRequest = '检索最新的人工智能新闻并总结，最终输出 md 文件';

    const plan = await service.generatePlan({
      userRequest,
      availableSkills: [{ id: 'platform.document.markdown-artifact-writer' }],
    });

    expect(plan.finalOutputs[0]).toMatchObject({
      expectedType: 'artifact_ref',
      isArtifact: true,
    });
    expect(modelService.callModel).toHaveBeenCalledTimes(2);
    const repairPrompt = modelService.callModel.mock.calls[1][1];
    expect(repairPrompt).toContain(userRequest);
    expect(repairPrompt).toContain('supportsArtifactOutput=true');
    expect(repairPrompt).toContain('artifact_ref finalOutput');
  });

  describe('inputBindings enum literal validation', () => {
    const buildEnumPlanContent = (topicValue: string) =>
      JSON.stringify({
        schemaVersion: 'deterministic-plan/v1',
        plannerVersion: 'v1',
        catalogVersion: 'v1',
        planType: 'single',
        objective: '搜索 AI 新闻',
        originalRequest: '',
        status: 'draft',
        nodes: [
          {
            nodeId: 'search_ai_news',
            sequence: 1,
            title: '搜索 AI 新闻',
            kind: 'skill',
            skillId: 'skill-search',
            skillVersion: '3',
            runtimeType: 'api',
            dependsOn: [],
            inputBindings: {
              query: { source: 'literal', value: 'AI artificial intelligence news' },
              topic: { source: 'literal', value: topicValue },
            },
            outputContract: { results: 'news_item_list' },
            failurePolicy: 'abort',
          },
        ],
        finalOutputs: [
          {
            targetField: 'results',
            fromNodeId: 'search_ai_news',
            fromNodeOutput: 'results',
            expectedType: 'news_item_list',
          },
        ],
      });

    const createEnumService = (content: string): DeterministicPlanGeneratorService => {
      const modelService = {
        getPreferredDefaultModel: jest.fn().mockReturnValue({ id: 'model-1', name: 'test-model' }),
        callModel: jest.fn().mockResolvedValue({ content }),
      };
      const candidateSelector = {
        selectCandidates: jest.fn().mockReturnValue({
          skillCards: [
            {
              id: 'skill-search',
              kind: 'skill',
              summary: 'Search news',
              goals: ['api', 'Search news'],
              inputs: {
                query: 'string',
                topic: 'string[enum=general,news,finance][default=general]',
              },
              outputs: { results: 'news_item_list' },
              category: 'api',
              publishedSkillId: 'skill-search',
              executableVersion: '3',
            },
          ],
          llmOperationCards: [],
        }),
      };
      return new DeterministicPlanGeneratorService(modelService as any, candidateSelector as any);
    };

    it('replaces truncated enum literal (e.g. "gene") with defaultValue when value not in enum', async () => {
      // 关键回归用例：LLM 把 topic='general' 幻觉成 'gene'，
      // 后处理必须用 default 'general' 顶上，否则会一路传到 Tavily 触发 HTTP 400。
      const service = createEnumService(buildEnumPlanContent('gene'));
      const plan = await service.generatePlan({
        userRequest: '查询最新的AI新闻 并且进行总结',
        availableSkills: [{ id: 'skill-search' }],
      });
      expect(plan.nodes[0].inputBindings.topic).toEqual({
        source: 'literal',
        value: 'general',
      });
    });

    it('keeps valid enum literal unchanged', async () => {
      const service = createEnumService(buildEnumPlanContent('news'));
      const plan = await service.generatePlan({
        userRequest: '查询最新新闻',
        availableSkills: [{ id: 'skill-search' }],
      });
      expect(plan.nodes[0].inputBindings.topic).toEqual({
        source: 'literal',
        value: 'news',
      });
    });

    it('drops binding when literal not in enum and no defaultValue available', async () => {
      // 没有 default 时，丢弃 binding 比传非法值更安全
      const content = JSON.stringify({
        schemaVersion: 'deterministic-plan/v1',
        plannerVersion: 'v1',
        catalogVersion: 'v1',
        planType: 'single',
        objective: '搜索',
        originalRequest: '',
        status: 'draft',
        nodes: [
          {
            nodeId: 'search',
            sequence: 1,
            title: '搜索',
            kind: 'skill',
            skillId: 'skill-search',
            skillVersion: '3',
            runtimeType: 'api',
            dependsOn: [],
            inputBindings: {
              topic: { source: 'literal', value: 'tech' },
            },
            outputContract: { results: 'news_item_list' },
            failurePolicy: 'abort',
          },
        ],
        finalOutputs: [],
      });
      const modelService = {
        getPreferredDefaultModel: jest.fn().mockReturnValue({ id: 'model-1', name: 'test-model' }),
        callModel: jest.fn().mockResolvedValue({ content }),
      };
      const candidateSelector = {
        selectCandidates: jest.fn().mockReturnValue({
          skillCards: [
            {
              id: 'skill-search',
              kind: 'skill',
              summary: 'Search',
              goals: ['api'],
              inputs: { topic: 'string[enum=general,news,finance]' },
              outputs: { results: 'news_item_list' },
              category: 'api',
              publishedSkillId: 'skill-search',
              executableVersion: '3',
            },
          ],
          llmOperationCards: [],
        }),
      };
      const service = new DeterministicPlanGeneratorService(modelService as any, candidateSelector as any);

      const plan = await service.generatePlan({
        userRequest: '搜索',
        availableSkills: [{ id: 'skill-search' }],
      });
      expect(plan.nodes[0].inputBindings.topic).toBeUndefined();
    });

    it('leaves non-literal bindings (e.g. node_output) untouched', async () => {
      const content = JSON.stringify({
        schemaVersion: 'deterministic-plan/v1',
        plannerVersion: 'v1',
        catalogVersion: 'v1',
        planType: 'single',
        objective: '搜索',
        originalRequest: '',
        status: 'draft',
        nodes: [
          {
            nodeId: 'search',
            sequence: 1,
            title: '搜索',
            kind: 'skill',
            skillId: 'skill-search',
            skillVersion: '3',
            runtimeType: 'api',
            dependsOn: [],
            inputBindings: {
              topic: { source: 'node_output', nodeId: 'prev', outputKey: 'topic' },
            },
            outputContract: { results: 'news_item_list' },
            failurePolicy: 'abort',
          },
        ],
        finalOutputs: [],
      });
      const service = createEnumService(content);
      const plan = await service.generatePlan({
        userRequest: '搜索',
        availableSkills: [{ id: 'skill-search' }],
      });
      expect(plan.nodes[0].inputBindings.topic).toEqual({
        source: 'node_output',
        nodeId: 'prev',
        outputKey: 'topic',
      });
    });
  });
});
