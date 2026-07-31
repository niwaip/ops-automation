import { ToolExecutor } from './tool-executor';
import { ExecutionContext } from './interfaces';

describe('ToolExecutor', () => {
  const baseContext: ExecutionContext = {
    sessionId: 'session-1',
    userId: 'user-1',
    history: [],
    userRoles: ['admin'],
    allowedToolNames: ['flow_execute', 'api_call'],
    selectedSkillToolNames: ['flow_execute'],
    capabilitySnapshot: {
      userId: 'user-1',
      sessionId: 'session-1',
      roles: ['admin'],
      mode: 'task',
      selectedSkillId: 'skill-1',
      skillScopedToolNames: ['flow_execute'],
      deniedToolNames: ['api_call'],
      visibleTools: [
        {
          name: 'flow_execute',
          description: '执行流程',
          category: 'flow',
          requiresApproval: false,
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          exposure: 'prompt_and_runtime',
        },
        {
          name: 'api_call',
          description: '调用外部 API',
          category: 'execution',
          requiresApproval: true,
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          exposure: 'prompt_and_runtime',
        },
      ],
      visibleSkills: [],
      constraints: {
        disallowToolNames: [],
        disallowSkillIds: [],
        forceSkillBoundExecution: true,
        forbidExternalApiInTaskMode: true,
        maxVisibleSkills: 20,
      },
      policies: {
        requireConfirmToolNames: [],
        requireApprovalToolNames: [],
        requireHumanReviewOnWrite: true,
        documentTemplateClarificationEnabled: true,
      },
      generatedAt: new Date().toISOString(),
      version: 'test',
    },
    skill: {
      skillId: 'skill-1',
      skillName: '测试技能',
      matchedKeywords: [],
      confidence: 1,
      collectedParams: {},
      missingParams: [],
      paramsSchema: {
        properties: {},
        required: [],
      },
    },
  };

  it('rejects tools outside selected skill scope', async () => {
    const executor = new ToolExecutor();

    const result = await executor.executeTool('api_call', {}, baseContext);

    expect(result.success).toBe(false);
    expect(result.code).toBe('tool_not_bound_to_skill');
    expect(result.data?.selectedSkillId).toBe('skill-1');
  });

  it('rejects prompt-only tools at runtime', async () => {
    const executor = new ToolExecutor();
    const flowVisibleTool = baseContext.capabilitySnapshot!.visibleTools[0]!;
    const context: ExecutionContext = {
      ...baseContext,
      selectedSkillToolNames: ['flow_execute'],
      capabilitySnapshot: {
        ...baseContext.capabilitySnapshot!,
        visibleTools: [
          {
            ...flowVisibleTool,
            exposure: 'prompt_only',
          },
        ],
      },
    };

    const result = await executor.executeTool('flow_execute', {}, context);

    expect(result.success).toBe(false);
    expect(result.code).toBe('tool_prompt_only');
  });

  it('rejects approval-required tools before execution', async () => {
    const executor = new ToolExecutor();
    const apiVisibleTool = baseContext.capabilitySnapshot!.visibleTools[1]!;
    const context: ExecutionContext = {
      ...baseContext,
      selectedSkillToolNames: ['api_call'],
      capabilitySnapshot: {
        ...baseContext.capabilitySnapshot!,
        skillScopedToolNames: ['api_call'],
        visibleTools: [
          {
            ...apiVisibleTool,
            requiresApproval: true,
          },
        ],
        policies: {
          ...baseContext.capabilitySnapshot!.policies,
          requireApprovalToolNames: ['api_call'],
        },
      },
      skill: {
        ...baseContext.skill!,
      },
    };

    const result = await executor.executeTool('api_call', {}, context);

    expect(result.success).toBe(false);
    expect(result.code).toBe('tool_requires_approval');
  });

  it('allows approval-required tools when approval is present in context', async () => {
    const executor = new ToolExecutor();
    executor.registerTool({
      name: 'api_call',
      description: '调用外部 API',
      category: 'execution',
      parameters: {
        type: 'object',
        properties: {
          endpoint: { type: 'string', description: 'API endpoint' },
        },
        required: ['endpoint'],
      },
      validateParams: () => ({ valid: false, missing: ['endpoint'] }),
      execute: async () => ({
        success: true,
        output: 'should not reach execute',
      }),
    });
    const apiVisibleTool = baseContext.capabilitySnapshot!.visibleTools[1]!;
    const context: ExecutionContext = {
      ...baseContext,
      selectedSkillToolNames: ['api_call'],
      approvedToolNames: ['api_call'],
      capabilitySnapshot: {
        ...baseContext.capabilitySnapshot!,
        skillScopedToolNames: ['api_call'],
        visibleTools: [
          {
            ...apiVisibleTool,
            requiresApproval: true,
          },
        ],
        policies: {
          ...baseContext.capabilitySnapshot!.policies,
          requireApprovalToolNames: ['api_call'],
        },
      },
      skill: {
        ...baseContext.skill!,
      },
    };

    const result = await executor.executeTool('api_call', {}, context);

    expect(result.code).toBe('missing_params');
    expect(result.code).not.toBe('tool_requires_approval');
  });

  it('finishes normally with system capabilities when no external skill is matched', async () => {
    const executor = new ToolExecutor();
    executor.registerTool({
      name: 'flow_execute',
      description: '执行流程',
      category: 'flow',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      validateParams: () => ({ valid: true, missing: [] }),
      execute: async () => ({
        success: false,
        output: 'should not execute without a matched skill',
      }),
    });
    const flowVisibleTool = baseContext.capabilitySnapshot!.visibleTools[0]!;
    const context: ExecutionContext = {
      ...baseContext,
      originalUserInput: '搜索最新的 AI 新闻',
      allowedToolNames: ['flow_execute'],
      selectedSkillToolNames: undefined,
      skill: undefined,
      availableSkills: [
        {
          skillId: 'platform.document.markdown-artifact-writer',
          skillName: 'Markdown 文件生成',
          description: '将内容保存为 Markdown 文件',
          triggerKeywords: ['markdown'],
          paramsSchema: {
            properties: {},
            required: [],
          },
        },
      ],
      capabilitySnapshot: {
        ...baseContext.capabilitySnapshot!,
        selectedSkillId: undefined,
        skillScopedToolNames: [],
        visibleTools: [flowVisibleTool],
        visibleSkills: [],
      },
    };

    const result = await executor.executeTool('flow_execute', {}, context);

    expect(result.success).toBe(true);
    expect(result.code).toBe('capability_not_matched');
    expect(result.severity).toBe('info');
    expect(result.data?.taskComplete).toBe(true);
    expect(result.data?.capabilityMatched).toBe(false);
    expect(result.output).toContain('实时搜索能力');
    expect(result.output).toContain('Markdown 文件生成');
  });
});
