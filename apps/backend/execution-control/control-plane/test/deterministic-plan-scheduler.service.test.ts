import { DeterministicPlanSchedulerService } from '../src/modules/execution/plan-runtime/deterministic-plan-scheduler.service';

describe('DeterministicPlanSchedulerService', () => {
  const createService = (contractCatalogOver: any = {}) =>
    new DeterministicPlanSchedulerService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        tryResolveContract: jest.fn().mockResolvedValue({
          inputSchema: {},
          outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
        }),
        computeContractDigest: jest.fn().mockReturnValue('sha256:frozen'),
        ...contractCatalogOver,
      } as any,
      {} as any,
      {} as any,
    ) as any;

  it.each([
    ['artifact', 'document'],
    ['document', 'document'],
    ['browser_template', 'browser'],
    ['browser', 'browser'],
    ['workflow', 'workflow'],
    ['api', 'api'],
  ])('maps plan runtimeType %s to execution runtimeType %s', (input, expected) => {
    expect(createService().mapPlanRuntimeTypeToExecutionRuntime(input)).toBe(expected);
  });

  describe('isLegacyPlan (fix ⑩ — grace gate only applies to legacy plans)', () => {
    const plan = (nodes: any[]) => ({ plan: { planJson: { nodes } } });

    it('classifies a plan where every node has contractRef as V2 (exempt from grace)', () => {
      const service = createService();
      expect(
        service.isLegacyPlan(
          plan([{ nodeId: 'a', contractRef: 'capability://skill/x/1/output' }, { nodeId: 'b', contractRef: 'capability://llm_operation/o/1/output' }])
        )
      ).toBe(false);
    });

    it('classifies a plan with any node lacking contractRef as legacy', () => {
      const service = createService();
      expect(service.isLegacyPlan(plan([{ nodeId: 'a', contractRef: 'capability://skill/x/1/output' }, { nodeId: 'b' }]))).toBe(true);
    });

    it('classifies missing plan / missing nodes / empty nodes as legacy', () => {
      const service = createService();
      expect(service.isLegacyPlan({})).toBe(true);
      expect(service.isLegacyPlan({ plan: null })).toBe(true);
      expect(service.isLegacyPlan(plan([]))).toBe(true);
    });
  });

  describe('verifyFrozenContractDigest (§15.3-5 — V2 plans fail closed)', () => {
    const execution = { id: 'exec-1' };
    const v2Step = (over: any = {}) => ({
      planNodeId: 'node-1',
      nodeKind: 'skill',
      capabilityId: 'tavily_search',
      outputContractJson: {
        _frozenMetadata: { contractDigest: 'sha256:frozen' },
      },
      ...over,
    });

    it('rejects the step start when re-resolution returns no contract (fail-closed)', async () => {
      const service = createService({
        tryResolveContract: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.verifyFrozenContractDigest(execution, v2Step())
      ).rejects.toMatchObject({
        code: 'CAPABILITY_CONTRACT_NOT_FOUND',
        message: expect.stringContaining('no longer be resolved'),
      });
    });

    it('rejects the step start when re-resolution returns a contract without an output schema (fail-closed)', async () => {
      const service = createService({
        tryResolveContract: jest.fn().mockResolvedValue({ inputSchema: {}, outputSchema: null }),
      });

      await expect(
        service.verifyFrozenContractDigest(execution, v2Step())
      ).rejects.toMatchObject({ code: 'CAPABILITY_CONTRACT_NOT_FOUND' });
    });

    it('allows the step when the re-resolved digest still matches the frozen one', async () => {
      const service = createService();

      await expect(
        service.verifyFrozenContractDigest(execution, v2Step())
      ).resolves.toBeUndefined();
    });

    it('rejects the step start when the re-resolved digest drifted from the frozen one', async () => {
      const service = createService({
        computeContractDigest: jest.fn().mockReturnValue('sha256:drifted'),
      });

      await expect(
        service.verifyFrozenContractDigest(execution, v2Step())
      ).rejects.toMatchObject({ code: 'CAPABILITY_CONTRACT_DIGEST_MISMATCH' });
    });

    it('leaves legacy steps (no frozen digest) untouched without any catalog lookup', async () => {
      const service = createService();
      const legacyStep = {
        planNodeId: 'node-legacy',
        nodeKind: 'skill',
        capabilityId: 'old_skill',
        outputContractJson: { result: { type: 'string' } }, // no _frozenMetadata
      };

      await expect(
        service.verifyFrozenContractDigest(execution, legacyStep)
      ).resolves.toBeUndefined();
      expect(service.contractCatalog.tryResolveContract).not.toHaveBeenCalled();
    });
  });

  describe('validateOutputContract (§15.3 — contract dataPath + falsy-safe extraction)', () => {
    const service = createService();
    const baseStep = (over: any = {}) => ({
      planNodeId: 'node-1',
      nodeKind: 'skill',
      capabilityId: 'tavily_search',
      outputContractJson: {},
      outputSchemaJson: { type: 'object', properties: {} },
      ...over,
    });

    beforeAll(() => {
      // outputNormalizer 是构造参数第 9 个（{} stub），成功路径需要 normalize 可调用
      (service as any).outputNormalizer = { normalize: (output: any) => output || {} };
    });

    it('keeps legitimate falsy businessData (0) instead of falling back to the whole envelope', () => {
      // 旧代码 `extracted || output`：0 触发整体回退 → 用 envelope(object) 校验
      // {type: integer} 误报违规；falsy-safe 后直接校验业务值 0 → 通过。
      const step = baseStep({ outputSchemaJson: { type: 'integer' } });
      const output = { result: { businessData: 0 }, execution: { status: 'success' } };
      expect(() => service.validateOutputContract(step, output, 'exec-1')).not.toThrow();
    });

    it('falls back to the raw output only when the dataPath is missing entirely', () => {
      // 非 envelope 扁平输出：路径缺失 → undefined → 回退整个 output（legacy 行为保留）
      const step = baseStep({
        outputSchemaJson: { type: 'object', properties: { direct: { type: 'string' } } },
      });
      const output = { direct: 'ok' };
      expect(() => service.validateOutputContract(step, output, 'exec-1')).not.toThrow();
    });

    it('extracts via the step/contract dataPath rather than the hardcoded envelope path', () => {
      // 若用硬编码 $.result.businessData → {topic:'news'} 通过；用 dataPath $.custom
      // → {topic:'ghost'} 违反 enum → 抛出，证明 dataPath 被真正使用。
      const step = baseStep({
        dataPath: '$.custom',
        outputSchemaJson: {
          type: 'object',
          properties: { topic: { type: 'string', enum: ['news'] } },
        },
      });
      const output = { result: { businessData: { topic: 'news' } }, custom: { topic: 'ghost' } };
      expect(() => service.validateOutputContract(step, output, 'exec-1')).toThrow(
        /OUTPUT_SCHEMA_VIOLATION/
      );
    });
  });

  it('keeps the standard browser session open through an appended LLM node and closes it only at plan completion', async () => {
    const prisma = {
      executionStep: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'llm-step',
            planNodeId: 'summarize',
            outputJson: { summaryText: 'summary' },
          },
        ]),
      },
      executionArtifact: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      execution: { update: jest.fn().mockResolvedValue({}) },
    };
    const orchestrator = {
      executeStep: jest.fn().mockResolvedValue({
        success: true,
        output: { pageText: 'loaded page content' },
      }),
    };
    const llmAdapter = {
      executeOperation: jest.fn().mockResolvedValue({
        success: true,
        output: { summaryText: 'summary' },
      }),
    };
    const events = { createEvent: jest.fn().mockResolvedValue(undefined) };
    const runtimeSessionCoordinator = {
      ensureBrowserSession: jest.fn().mockResolvedValue('session-standard'),
      closeForTerminalExecution: jest.fn().mockResolvedValue(undefined),
    };
    const finalOutput = {
      assertSatisfied: jest.fn().mockResolvedValue({ satisfied: true, artifacts: [] }),
    };
    const service = new DeterministicPlanSchedulerService(
      prisma as any,
      {} as any,
      finalOutput as any,
      llmAdapter as any,
      orchestrator as any,
      events as any,
      { validateV1Contract: jest.fn() } as any,
      {} as any,
      { normalize: (output: any) => output } as any,
      {} as any,
      undefined,
      undefined,
      runtimeSessionCoordinator as any
    ) as any;
    const plan = {
      planJson: {
        nodes: [
          { nodeId: 'browser_recording', runtimeType: 'browser_template' },
          { nodeId: 'summarize', kind: 'llm_operation', dependsOn: ['browser_recording'] },
        ],
        finalOutputs: [
          {
            targetField: 'summaryText',
            fromNodeId: 'summarize',
            fromNodeOutput: 'summaryText',
            expectedType: 'string',
          },
        ],
      },
    };
    const execution = {
      id: 'execution-1',
      createdBy: 'user-1',
      status: 'running',
      plan,
    };
    const browserStep = {
      id: 'browser-step',
      planNodeId: 'browser_recording',
      nodeKind: 'skill',
      action: 'browser_template',
      capabilityId: 'published-browser-template',
      capabilityVersion: '1',
      outputContractJson: {},
    };
    const llmStep = {
      id: 'llm-step',
      planNodeId: 'summarize',
      nodeKind: 'llm_operation',
      capabilityId: 'summarize_page',
      capabilityVersion: '1',
      outputContractJson: {},
    };

    await service.runSkillStep(execution, browserStep, {});
    expect(orchestrator.executeStep).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeType: 'browser',
        runtimeSessionId: 'session-standard',
      })
    );
    expect(runtimeSessionCoordinator.closeForTerminalExecution).not.toHaveBeenCalled();

    await service.runLlmStep(execution, llmStep, { pageText: 'loaded page content' });
    expect(llmAdapter.executeOperation).toHaveBeenCalled();
    expect(runtimeSessionCoordinator.closeForTerminalExecution).not.toHaveBeenCalled();

    await service.completeExecutionIfSatisfied(execution);
    expect(runtimeSessionCoordinator.closeForTerminalExecution).toHaveBeenCalledWith(
      'execution-1',
      'deterministic_execution_succeeded'
    );
  });
});
