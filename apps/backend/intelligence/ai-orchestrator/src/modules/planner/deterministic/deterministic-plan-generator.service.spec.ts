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

    const llmOperationRegistry = {
      resolveActiveVersion: jest.fn().mockResolvedValue({
        source: 'database',
        version: {
          version: '1.0.0',
          operationDigest: 'sha256:operation',
          contractDigest: 'sha256:contract',
          manifestJson: {
            promptTemplateId: 'summarize-list',
            modelPolicyId: 'task-default',
            temperature: 0,
            maxInputTokens: 4000,
            maxOutputTokens: 2000,
            outputSchema: {
              type: 'object',
              properties: { markdown_content: { type: 'string' } },
              required: ['markdown_content'],
            },
          },
        },
      }),
    };

    return new DeterministicPlanGeneratorService(
      modelService as any,
      candidateSelector as any,
      llmOperationRegistry as any,
    );
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

  it('keeps the artifact requirement and user request in the compatibility repair prompt', async () => {
    const invalidPlan = JSON.stringify({
      schemaVersion: 'deterministic-plan/v1',
      nodes: [
        {
          nodeId: 'unknown',
          sequence: 1,
          title: '未知能力',
          kind: 'skill',
          skillId: 'hallucinated-skill',
          skillVersion: '1',
          runtimeType: 'workflow',
          dependsOn: [],
          inputBindings: {},
        },
      ],
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
      const targetNode = plan.nodes[0] as any;
      expect(targetNode.inputBindings.topic).toEqual({
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
      const targetNode = plan.nodes[0] as any;
      expect(targetNode.inputBindings.topic).toEqual({
        source: 'literal',
        value: 'news',
      });
    });

    it('rejects freezing when literal not in enum and no defaultValue available (INVALID_ENUM_LITERAL)', async () => {
      // 没有 default 时，拒绝冻结并抛出 INVALID_ENUM_LITERAL 异常
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

      await expect(
        service.generatePlan({
          userRequest: '搜索',
          availableSkills: [{ id: 'skill-search' }],
        })
      ).rejects.toThrow();
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
      const targetNode = plan.nodes[0] as any;
      expect(targetNode.inputBindings.topic).toEqual({
        source: 'node_output',
        nodeId: 'prev',
        outputKey: 'topic',
      });
    });
  });

  describe('outputContract reconciliation against trusted candidate card outputs', () => {
    const buildContractPlanContent = (llmContract: Record<string, string>) =>
      JSON.stringify({
        schemaVersion: 'deterministic-plan/v1',
        plannerVersion: 'v1',
        catalogVersion: 'v1',
        planType: 'single',
        objective: '检索股票情报并总结',
        originalRequest: '',
        status: 'draft',
        nodes: [
          {
            nodeId: 'search_stocks',
            sequence: 1,
            title: '检索股票情报',
            kind: 'skill',
            skillId: 'skill-search-stocks',
            skillVersion: '1',
            runtimeType: 'workflow',
            dependsOn: [],
            inputBindings: {
              query: { source: 'literal', value: '股票情报 最新资讯' },
              topic: { source: 'literal', value: 'finance' },
              max_results: { source: 'literal', value: 10 },
            },
            outputContract: llmContract,
            failurePolicy: 'abort',
          },
        ],
        finalOutputs: [
          {
            targetField: 'data',
            fromNodeId: 'search_stocks',
            fromNodeOutput: 'data',
            expectedType: 'string',
          },
        ],
      });

    const createContractService = (content: string) => {
      const modelService = {
        getPreferredDefaultModel: jest.fn().mockReturnValue({ id: 'model-1', name: 'test-model' }),
        callModel: jest.fn().mockResolvedValue({ content }),
      };
      const candidateSelector = {
        selectCandidates: jest.fn().mockReturnValue({
          skillCards: [
            {
              id: 'skill-search-stocks',
              kind: 'skill',
              summary: '网页信息检索',
              goals: ['workflow', '网页信息检索'],
              inputs: {
                query: 'string',
                topic: 'string[enum=general,news,finance][default=general]',
                max_results: 'number',
              },
              outputs: {
                searchResults: 'news_item_list',
                responseMetadata: 'string',
              },
              category: 'workflow',
              publishedSkillId: 'skill-search-stocks',
              executableVersion: '1',
            },
          ],
          llmOperationCards: [],
        }),
      };
      return new DeterministicPlanGeneratorService(modelService as any, candidateSelector as any);
    };

    it('drops hallucinated outputContract field names and uses card-declared fields', async () => {
      // Regression: LLM wrote outputContract: {"data":"string"} for a search
      // skill whose card declares {searchResults, responseMetadata}. Without
      // reconciliation the runtime validator threw
      // "missing expected output field 'data'" because the workflow produced
      // searchResults/responseMetadata, not "data".
      const service = createContractService(
        buildContractPlanContent({ data: 'string' })
      );
      const plan = await service.generatePlan({
        userRequest: '查询 最新的股票情报 然后进行总结',
        availableSkills: [{ id: 'skill-search-stocks' }],
      });

      const contract = (plan.nodes[0] as any).outputContract;
      expect(Object.keys(contract).sort()).toEqual(['responseMetadata', 'searchResults']);
      expect(contract.searchResults).toBe('news_item_list');
      expect(contract.responseMetadata).toBe('string');
      // The hallucinated field must be dropped — otherwise the runtime
      // validator still tries to satisfy it and throws.
      expect(contract.data).toBeUndefined();
    });

    it('discards LLM type tags and uses the card-declared types (fix ⑤)', async () => {
      const service = createContractService(
        buildContractPlanContent({
          searchResults: 'news_item_list',
          responseMetadata: 'object', // LLM type tag conflicts with the card's 'string'
        })
      );
      const plan = await service.generatePlan({
        userRequest: '查询股票情报',
        availableSkills: [{ id: 'skill-search-stocks' }],
      });

      const contract = (plan.nodes[0] as any).outputContract;
      // searchResults is always normalized to news_item_list (alias chain);
      // responseMetadata uses the CARD's 'string' tag — the LLM's 'object'
      // tag is untrusted (fix ⑤) and would otherwise claim a type the
      // workflow does not produce.
      expect(contract.searchResults).toBe('news_item_list');
      expect(contract.responseMetadata).toBe('string');
    });

    it('derives the whole contract from the card even when the LLM matches every field (fix ⑤)', async () => {
      const service = createContractService(
        buildContractPlanContent({
          searchResults: 'news_item_list',
          responseMetadata: 'string',
        })
      );
      const plan = await service.generatePlan({
        userRequest: '查询股票情报',
        availableSkills: [{ id: 'skill-search-stocks' }],
      });

      const contract = (plan.nodes[0] as any).outputContract;
      expect(contract).toEqual({
        searchResults: 'news_item_list',
        responseMetadata: 'string',
      });
    });

    it('populates outputContract from card outputs when LLM omits it entirely', async () => {
      const content = JSON.stringify({
        schemaVersion: 'deterministic-plan/v1',
        plannerVersion: 'v1',
        catalogVersion: 'v1',
        planType: 'single',
        objective: '检索股票情报',
        originalRequest: '',
        status: 'draft',
        nodes: [
          {
            nodeId: 'search_stocks',
            sequence: 1,
            title: '检索股票情报',
            kind: 'skill',
            skillId: 'skill-search-stocks',
            skillVersion: '1',
            runtimeType: 'workflow',
            dependsOn: [],
            inputBindings: {
              query: { source: 'literal', value: '股票情报' },
              topic: { source: 'literal', value: 'finance' },
            },
            failurePolicy: 'abort',
          },
        ],
        finalOutputs: [],
      });
      const service = createContractService(content);
      const plan = await service.generatePlan({
        userRequest: '查询股票情报',
        availableSkills: [{ id: 'skill-search-stocks' }],
      });

      const contract = (plan.nodes[0] as any).outputContract;
      expect(Object.keys(contract).sort()).toEqual(['responseMetadata', 'searchResults']);
    });
  });

  // ── Regression tests for bug reports ────────────────────────────────────────

  describe('Bug regression: FINAL_OUTPUT_UNSATISFIED — finalOutputs.expectedType mismatch', () => {
    /**
     * Reproduces the first failure:
     * LLM generates finalOutputs[0].expectedType = "text" but the
     * summarize_stocks node declares outputContract.markdown_content = "markdown_content".
     * alignFinalOutputsExpectedType() must auto-correct the mismatch so the static
     * validator no longer raises FINAL_OUTPUT_UNSATISFIED.
     */
    it('auto-aligns finalOutputs.expectedType="text" to "markdown_content" when node declares markdown_content', async () => {
      const content = JSON.stringify({
        schemaVersion: 'deterministic-plan/v1',
        plannerVersion: 'v1',
        catalogVersion: 'v1',
        planType: 'sequential',
        objective: '查询股票情报并汇总',
        originalRequest: '',
        status: 'draft',
        nodes: [
          {
            nodeId: 'search_stock_step',
            sequence: 1,
            title: '搜索股票情报',
            kind: 'skill',
            skillId: 'skill-internal-id',
            skillVersion: '3',
            runtimeType: 'workflow',
            dependsOn: [],
            inputBindings: { query: { source: 'literal', value: '最新股票情报' } },
            outputContract: { results: 'news_item_list' },
            failurePolicy: 'abort',
          },
          {
            nodeId: 'summarize_stocks',
            sequence: 2,
            title: '汇总股票情报',
            kind: 'llm_operation',
            operationId: 'summarize_list',
            dependsOn: ['search_stock_step'],
            inputBindings: {
              items: { source: 'node_output', nodeId: 'search_stock_step', path: 'results' },
            },
            // LLM hallucination: wrong field name in outputContract
            outputContract: { markdown_content: 'markdown_content' },
            failurePolicy: 'abort',
          },
        ],
        finalOutputs: [
          {
            targetField: 'markdown_content',
            fromNodeId: 'summarize_stocks',
            fromNodeOutput: 'markdown_content',
            // BUG: LLM wrote "text" instead of "markdown_content"
            expectedType: 'text',
          },
        ],
      });

      const service = createService(content);
      const plan = await service.generatePlan({
        userRequest: '查询 最新的股票情报 然后进行总结',
        availableSkills: [],
      });

      // After auto-alignment, expectedType must match the node's declared type.
      expect(plan.finalOutputs).toHaveLength(1);
      expect(plan.finalOutputs[0]!.expectedType).toBe('markdown_content');
    });
  });

  describe('Bug regression: missing expected output field "data" — llm_operation outputContract hallucination', () => {
    /**
     * Reproduces the second failure:
     * LLM generates an llm_operation node with outputContract = { data: "string" }.
     * normalizeLlmOperationOutputContract() must remap this to
     * { markdown_content: "markdown_content" } so the runtime scheduler
     * never looks for a "data" field that the workflow doesn't return.
     */
    it('remaps llm_operation outputContract hallucinated field to markdown_content', async () => {
      const content = JSON.stringify({
        schemaVersion: 'deterministic-plan/v1',
        plannerVersion: 'v1',
        catalogVersion: 'v1',
        planType: 'sequential',
        objective: '查询股票情报并汇总',
        originalRequest: '',
        status: 'draft',
        nodes: [
          {
            nodeId: 'search_stock_step',
            sequence: 1,
            title: '搜索股票情报',
            kind: 'skill',
            skillId: 'skill-internal-id',
            skillVersion: '3',
            runtimeType: 'workflow',
            dependsOn: [],
            inputBindings: { query: { source: 'literal', value: '最新股票情报' } },
            outputContract: { results: 'news_item_list' },
            failurePolicy: 'abort',
          },
          {
            nodeId: 'summarize_stocks',
            sequence: 2,
            title: '汇总股票情报',
            kind: 'llm_operation',
            operationId: 'summarize_list',
            dependsOn: ['search_stock_step'],
            inputBindings: {
              items: { source: 'node_output', nodeId: 'search_stock_step', path: 'results' },
            },
            // BUG: LLM hallucinated "data" instead of "markdown_content"
            outputContract: { data: 'string' },
            failurePolicy: 'abort',
          },
        ],
        finalOutputs: [
          {
            targetField: 'markdown_content',
            fromNodeId: 'summarize_stocks',
            fromNodeOutput: 'markdown_content',
            expectedType: 'markdown_content',
          },
        ],
      });

      const service = createService(content);
      const plan = await service.generatePlan({
        userRequest: '查询 最新的股票情报 然后进行总结',
        availableSkills: [],
      });

      const summarizeNode = plan.nodes.find((n: any) => n.nodeId === 'summarize_stocks') as any;
      expect(summarizeNode.outputContract).toEqual({ markdown_content: 'markdown_content' });
      // finalOutputs should also be aligned
      expect(plan.finalOutputs).toHaveLength(1);
      expect(plan.finalOutputs[0]!.expectedType).toBe('markdown_content');
    });
  });

  describe('Bug regression: INPUT_TYPE_MISMATCH — inputBinding path does not match upstream outputContract key', () => {
    /**
     * Reproduces the third failure:
     * LLM writes inputBindings.items.path = "results" (from the system-prompt example),
     * but the search Skill's card.outputs uses "searchResults" as the field key.
     * After normalizeSkillOutputContract() the upstream outputContract becomes
     * { searchResults: "news_item_list" }, so outputContract["results"] is undefined.
     * alignInputBindingPaths() must rewrite binding.path to "searchResults".
     */
    it('auto-corrects binding path "results" → "searchResults" when upstream outputContract uses searchResults', async () => {
      // Simulate a search skill whose outputParams declares "searchResults", not "results".
      const searchSkillCard = {
        id: 'skill-search-finance',
        kind: 'skill',
        summary: 'Search financial news',
        goals: ['api', 'search'],
        inputs: { query: 'string' },
        outputs: { searchResults: 'news_item_list', responseMetadata: 'object' },
        category: 'api',
        publishedSkillId: 'skill-search-finance',
        executableVersion: '2',
      };

      const content = JSON.stringify({
        schemaVersion: 'deterministic-plan/v1',
        plannerVersion: 'v1',
        catalogVersion: 'v1',
        planType: 'sequential',
        objective: '查询财经股票信息并总结',
        originalRequest: '',
        status: 'draft',
        nodes: [
          {
            nodeId: 'search_stock_info',
            sequence: 1,
            title: '搜索财经股票信息',
            kind: 'skill',
            skillId: 'skill-search-finance',
            skillVersion: '2',
            runtimeType: 'api',
            dependsOn: [],
            inputBindings: { query: { source: 'literal', value: '最新财经股票' } },
            // LLM wrote "results" but the real card declares "searchResults"
            outputContract: { results: 'news_item_list' },
            failurePolicy: 'abort',
          },
          {
            nodeId: 'summarize_stock_info',
            sequence: 2,
            title: '汇总股票情报',
            kind: 'llm_operation',
            operationId: 'summarize_list',
            dependsOn: ['search_stock_info'],
            inputBindings: {
              // LLM wrote path = "results" (from prompt example) — should be aligned to "searchResults"
              items: { source: 'node_output', nodeId: 'search_stock_info', path: 'results' },
            },
            outputContract: { markdown_content: 'markdown_content' },
            failurePolicy: 'abort',
          },
        ],
        finalOutputs: [
          {
            targetField: 'markdown_content',
            fromNodeId: 'summarize_stock_info',
            fromNodeOutput: 'markdown_content',
            expectedType: 'markdown_content',
          },
        ],
      });

      const modelService = {
        getPreferredDefaultModel: jest.fn().mockReturnValue({ id: 'model-1', name: 'test-model' }),
        callModel: jest.fn().mockResolvedValue({ content }),
      };
      const candidateSelector = {
        selectCandidates: jest.fn().mockReturnValue({
          skillCards: [searchSkillCard],
          llmOperationCards: [],
        }),
      };
      const service = new DeterministicPlanGeneratorService(
        modelService as any,
        candidateSelector as any,
        {
          resolveActiveVersion: jest.fn().mockResolvedValue({
            source: 'database',
            version: {
              version: '1.0.0',
              operationDigest: 'sha256:operation',
              contractDigest: 'sha256:contract',
              manifestJson: {
                promptTemplateId: 'summarize-list',
                outputSchema: {
                  type: 'object',
                  properties: { markdown_content: { type: 'string' } },
                  required: ['markdown_content'],
                },
              },
            },
          }),
        } as any,
      );


      const plan = await service.generatePlan({
        userRequest: '查询 最新的财经 股票信息 然后总结',
        availableSkills: [],
      });

      // The search node's outputContract should be canonical (from card.outputs).
      const searchNode = plan.nodes.find((n: any) => n.nodeId === 'search_stock_info') as any;
      expect(Object.keys(searchNode.outputContract)).toContain('searchResults');
      expect(Object.keys(searchNode.outputContract)).not.toContain('results');

      // The summarize node's binding.path must be aligned to 'searchResults'.
      const summarizeNode = plan.nodes.find((n: any) => n.nodeId === 'summarize_stock_info') as any;
      expect(summarizeNode.inputBindings.items.path).toBe('searchResults');
    });

    it('binds requested custom modelId to llm_operation nodes when provided', async () => {
      const customModelId = 'custom-model-abc';
      const planJson = JSON.stringify({
        schemaVersion: 'deterministic-plan/v1',
        plannerVersion: 'v1',
        catalogVersion: 'v1',
        planType: 'multi',
        objective: '查询新闻并总结',
        originalRequest: '',
        status: 'draft',
        nodes: [
          {
            nodeId: 'summarize_1',
            sequence: 1,
            title: '总结',
            kind: 'llm_operation',
            operationId: 'summarize_list',
            operationVersion: '1.0.0',
            dependsOn: [],
            inputBindings: {},
            outputContract: { markdown_content: 'markdown_content' },
            failurePolicy: 'abort',
          },
        ],
        finalOutputs: [
          {
            targetField: 'markdown_content',
            fromNodeId: 'summarize_1',
            fromNodeOutput: 'markdown_content',
            expectedType: 'markdown_content',
          },
        ],
      });

      const modelService = {
        getPreferredDefaultModel: jest.fn().mockReturnValue({ id: 'model-1', name: 'test-model' }),
        getModel: jest.fn().mockResolvedValue({ id: customModelId, name: 'Custom Model', status: 'active' }),
        getClient: jest.fn().mockReturnValue({}),
        callModel: jest.fn().mockResolvedValue({ content: planJson }),
      };
      const candidateSelector = {
        selectCandidates: jest.fn().mockReturnValue({
          skillCards: [],
          llmOperationCards: [
            {
              id: 'summarize_list',
              kind: 'llm_operation',
              displayName: '总结',
              summary: '总结列表',
              goals: ['summarize'],
              inputs: { items: 'array' },
              outputs: { markdown_content: 'markdown_content' },
            },
          ],
        }),
      };
      const llmOperationRegistry = {
        resolveActiveVersion: jest.fn().mockResolvedValue({
          source: 'database',
          version: {
            version: '1.0.0',
            operationDigest: 'sha256:operation',
            contractDigest: 'sha256:contract',
            manifestJson: {
              promptTemplateId: 'summarize-list',
              modelPolicyId: 'task-default',
              temperature: 0,
              maxInputTokens: 4000,
              maxOutputTokens: 2000,
              outputSchema: {
                type: 'object',
                properties: { markdown_content: { type: 'string' } },
                required: ['markdown_content'],
              },
            },
          },
        }),
      };

      const service = new DeterministicPlanGeneratorService(
        modelService as any,
        candidateSelector as any,
        llmOperationRegistry as any,
      );

      const plan = await service.generatePlan({
        userRequest: '查询 最新新闻 然后总结',
        availableSkills: [],
        modelId: customModelId,
      });

      const summarizeNode = plan.nodes.find((n: any) => n.kind === 'llm_operation') as any;
      expect(summarizeNode).toBeDefined();
      expect(summarizeNode.modelId).toBe(customModelId);
    });

    it('reuses learned user habit topology directly via habit fast-gate (0-token path)', async () => {
      const candidateSelector = {
        selectCandidates: jest.fn().mockResolvedValue({
          skillCards: [{ id: 'skill-web', displayName: '打开网页', kind: 'skill', outputs: { text: 'string' } }],
          llmOperationCards: [{ id: 'summarize_text', displayName: '文本摘要', kind: 'llm_operation', outputs: { summary: 'string' } }],
        }),
      };
      const modelService = {
        callModel: jest.fn(),
        getPreferredDefaultModel: jest.fn().mockReturnValue({ id: 'm1', name: 'model-1' }),
      };
      const userHabitRouter = {
        evaluateHabit: jest.fn().mockResolvedValue({
          type: 'exact_topology',
          confidence: 0.99,
          topology: {
            schemaVersion: 'deterministic-topology/v1',
            objective: '打开网页查正文总结',
            matchDecision: 'matched',
            matchConfidence: 0.99,
            matchReason: 'Matched learned user habit (0-Token Fast-Gate)',
            nodes: [
              { ref: 'n1', capabilityKey: 'skill-web', dependsOn: [] },
              { ref: 'n2', capabilityKey: 'summarize_text', dependsOn: ['n1'] },
            ],
            finalNodeRef: 'n2',
            finalOutputKind: 'value',
          },
        }),
      };
      const cardProjector = {
        projectCandidateCards: jest.fn().mockReturnValue({
          routingCards: [],
          aliasMap: new Map([
            ['skill-web', { id: 'skill-web', displayName: '打开网页', kind: 'skill', outputs: { text: 'string' } }],
            ['summarize_text', { id: 'summarize_text', displayName: '文本摘要', kind: 'llm_operation', outputs: { summary: 'string' } }],
          ]),
        }),
      };
      const topologyPlanner = {
        planTopology: jest.fn(),
      };
      const topologyValidator = {
        validateTopology: jest.fn().mockReturnValue({ valid: true }),
      };
      const parameterBinder = {
        bindParameters: jest.fn().mockResolvedValue([
          { nodeId: 'n1', skillId: 'skill-web', kind: 'skill', sequence: 1, dependsOn: [], inputBindings: {} },
          { nodeId: 'n2', operationId: 'summarize_text', kind: 'llm_operation', sequence: 2, dependsOn: ['n1'], inputBindings: {} },
        ]),
      };
      const contractAssembler = {
        assemblePlan: jest.fn().mockReturnValue({
          schemaVersion: 'deterministic-plan/v1',
          nodes: [{ nodeId: 'n1' }, { nodeId: 'n2' }],
          planningRoute: { routeSource: 'habit_fast_gate' },
        }),
      };

      const service = new DeterministicPlanGeneratorService(
        modelService as any,
        candidateSelector as any,
        undefined,
        parameterBinder as any,
        contractAssembler as any,
        cardProjector as any,
        topologyPlanner as any,
        topologyValidator as any,
        undefined,
        undefined,
        undefined,
        undefined,
        userHabitRouter as any
      );

      const plan = await service.generatePlan({
        userRequest: '打开网页查正文总结',
        availableSkills: [{ id: 'skill-web' }],
        telemetry: { user: { userId: 'user-1' } },
      });

      expect(userHabitRouter.evaluateHabit).toHaveBeenCalledWith('user-1', '打开网页查正文总结');
      // LLM planner was skipped (0 Token!)
      expect(topologyPlanner.planTopology).not.toHaveBeenCalled();
      expect((plan as any).planningRoute.routeSource).toBe('habit_fast_gate');
    });
  });
});
