import axios from 'axios';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CapabilityReleaseService } from '../src/modules/capability-release/capability-release.service';
import { BridgeRecorderExportDTO } from '../src/modules/capability-release/interfaces';

jest.mock('axios');

describe('CapabilityReleaseService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CARBONE_SERVICE_URL;
    delete process.env.CARBONE_EXTERNAL_URL;
    delete process.env.DOCKER_ENV;
    delete process.env.NODE_ENV;
    delete process.env.HOST_IP;
    delete process.env.EXTERNAL_HOST;
  });

  const createService = () => {
    const prisma = {
      $executeRawUnsafe: jest.fn(),
      $queryRawUnsafe: jest.fn(),
    };
    const activityService = {
      executeCodeInTemporalSandbox: jest.fn(),
    };
    const skillService = {
      validateSkillToolsPayload: jest.fn(),
      createSkill: jest.fn(),
      getSkillToolBindings: jest.fn(),
    };
    const toolCatalogService = {
      getCatalogItemsByNames: jest.fn(),
    };

    const service = new CapabilityReleaseService(
      prisma as any,
      {} as any,
      activityService as any,
      {} as any,
      skillService as any,
      toolCatalogService as any,
    );

    return { service, prisma, skillService, toolCatalogService, activityService };
  };

  it('archives the release and deactivates its published skill', async () => {
    const { service, prisma } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-1',
      publishedSkillId: 'skill-1',
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);

    const result = await service.archiveCapability('release-1', 'user-1');

    expect(result).toEqual({ success: true, archivedId: 'release-1' });
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE capability_releases'),
      'release-1',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE skill_configs'),
      'skill-1',
    );
    expect((service as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'published_skill_deactivated',
      'user-1',
      true,
      '归档 Release 时停用已发布 Skill: skill-1',
      { publishedSkillId: 'skill-1' },
    );
    expect((service as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'release_archived',
      'user-1',
      true,
      '归档 Capability',
    );
  });

  it('blocks publishing when tool validation fails', async () => {
    const { service, skillService } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-1',
      approvalStatus: 'approved',
      status: 'approved',
      currentSkillDraftId: 'draft-1',
      publishedSkillId: null,
    });
    jest.spyOn(service as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-1',
      tools: ['api_call'],
      executionFlowTemplateIds: ['tpl-1'],
      draftPayload: {
        name: 'Test Draft',
        description: 'desc',
        tools: ['api_call'],
        executionFlowTemplateIds: ['tpl-1'],
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    skillService.validateSkillToolsPayload.mockResolvedValue({
      isValid: false,
      declaredTools: ['api_call'],
      inferredTools: [],
      effectiveTools: ['api_call'],
      missingTools: [],
      disabledTools: ['api_call'],
      forbiddenSkillTools: [],
      undeclaredFlowTools: [],
      messages: [
        {
          code: 'tool_disabled',
          toolName: 'api_call',
          severity: 'error',
          message: '工具 "api_call" 当前已被禁用',
        },
      ],
    });

    await expect(service.publishSkill('release-1', {}, 'user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'skill_publish_tool_validation_failed',
        message: '发布前工具校验失败',
      }),
    });
    expect((service as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'skill_publish_blocked_by_tool_validation',
      'user-1',
      false,
      '发布前工具校验失败',
      expect.objectContaining({
        toolValidation: expect.objectContaining({
          isValid: false,
        }),
      }),
    );
  });

  it('normalizes legacy browser_execute tool names when publishing browser recording skills', async () => {
    const { service, skillService, prisma } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-browser-1',
      approvalStatus: 'approved',
      status: 'approved',
      sourceType: 'browser_recording',
      sourceName: 'Browser Skill',
      currentSkillDraftId: 'draft-browser-1',
      publishedSkillId: null,
    });
    jest.spyOn(service as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-browser-1',
      tools: ['skill_match', 'browser_execute'],
      executionFlowTemplateIds: [],
      draftPayload: {
        name: 'Browser Skill',
        description: 'desc',
        tools: ['skill_match', 'browser_execute'],
        executionFlow: [
          {
            id: 'step-1',
            type: 'tool',
            tool: { name: 'browser_execute' },
            config: { executionPlan: { commands: [] } },
          },
        ],
        executionFlowTemplateIds: [],
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    prisma.$queryRawUnsafe.mockResolvedValue([]);
    skillService.validateSkillToolsPayload.mockResolvedValue({
      isValid: true,
      declaredTools: ['skill_match', 'browser_step'],
      inferredTools: ['browser_step'],
      effectiveTools: ['skill_match', 'browser_step'],
      missingTools: [],
      disabledTools: [],
      forbiddenSkillTools: [],
      undeclaredFlowTools: [],
      messages: [],
    });
    skillService.createSkill.mockResolvedValue({ id: 'skill-browser-1' });

    const result = await service.publishSkill('release-browser-1', {}, 'user-1');

    expect(skillService.validateSkillToolsPayload).toHaveBeenCalledWith({
      tools: ['skill_match', 'browser_step'],
      executionFlow: [
        expect.objectContaining({
          tool: expect.objectContaining({ name: 'browser_step' }),
        }),
      ],
      executionFlowTemplateIds: [],
    });
    expect(skillService.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: ['skill_match', 'browser_step'],
        executionFlow: [
          expect.objectContaining({
            tool: expect.objectContaining({ name: 'browser_step' }),
          }),
        ],
      }),
    );
    expect(result).toEqual({
      release: expect.objectContaining({ id: 'release-browser-1' }),
      publishedSkillId: 'skill-browser-1',
    });
  });

  it('rejects publishing when release approval is pending', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-pending',
      approvalStatus: 'pending',
      status: 'pending_approval',
      currentSkillDraftId: 'draft-1',
    });

    await expect(service.publishSkill('release-pending', {}, 'user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'release_approval_pending',
        message: '当前 Release 尚未审批通过',
      }),
    });
  });

  it('rejects publishing when release approval is rejected', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-rejected',
      approvalStatus: 'rejected',
      status: 'draft',
      currentSkillDraftId: 'draft-1',
    });

    await expect(service.publishSkill('release-rejected', {}, 'user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'release_approval_rejected',
        message: '当前 Release 审批未通过，请调整草案后重新提交',
      }),
    });
  });

  it('rejects deploy when non-temporal release has not published skill', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-no-skill',
      sourceType: 'browser_recording',
      publishedSkillId: null,
      status: 'approved',
    });

    await expect(service.deploy('release-no-skill', {}, 'user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'release_not_published_for_deploy',
        message: '当前 Release 尚未发布 Skill，不能部署',
      }),
    });
  });

  it('rejects deploy when release is already deploying', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-deploying',
      sourceType: 'browser_recording',
      publishedSkillId: 'skill-1',
      status: 'deploying',
    });

    await expect(service.deploy('release-deploying', {}, 'user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'release_deploying',
        message: '当前 Release 正在部署中',
      }),
    });
  });

  it('uses snapshot validation for browser recording sandbox validation', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow')
      .mockResolvedValueOnce({
        id: 'release-browser-validate-1',
        sourceType: 'browser_recording',
        status: 'draft',
      })
      .mockResolvedValueOnce({
        id: 'release-browser-validate-1',
        sourceType: 'browser_recording',
        status: 'draft_ready',
      });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        steps: [{ id: 'step_1', name: '打开页面' }],
        executionFlow: [{ id: 'flow-1', tool: { name: 'browser_step' } }],
      },
    });
    jest.spyOn(service as any, 'resolveBuildForValidation').mockResolvedValue({
      id: 'build-1',
    });
    jest.spyOn(service as any, 'shouldPreserveReleaseStatusDuringValidation').mockReturnValue(false);
    jest.spyOn(service as any, 'createValidationRecord').mockResolvedValue('validation-1');
    jest.spyOn(service as any, 'finishValidation').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'getValidationOrThrow').mockResolvedValue({
      id: 'validation-1',
      success: true,
      score: 100,
    });

    const result = await service.validateSandbox(
      'release-browser-validate-1',
      { testCases: ['通过 bing 查询mcp'] },
      'user-1',
    );

    expect((service as any).finishValidation).toHaveBeenCalledWith(
      'validation-1',
      'release-browser-validate-1',
      'draft_ready',
      true,
      100,
      expect.arrayContaining([
        '开始执行浏览器录制快照静态验证...',
        expect.stringContaining('通过 bing 查询mcp'),
      ]),
      expect.objectContaining({
        mode: 'static_snapshot_validation',
        testCases: ['通过 bing 查询mcp'],
      }),
      null,
      false,
    );
    expect(result).toEqual({
      release: expect.objectContaining({ id: 'release-browser-validate-1' }),
      validation: expect.objectContaining({ id: 'validation-1' }),
    });
  });

  it('returns runtime tool policies from tool catalog metadata', async () => {
    const { service, prisma, skillService, toolCatalogService } = createService();

    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'release-row-1' }])
      .mockResolvedValueOnce([{ id: 'deployment-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
      lastDeploymentId: null,
    });
    jest.spyOn(service as any, 'mapDeployment').mockReturnValue({
      id: 'deployment-1',
      runtimeType: 'flow_runtime',
      environment: 'dev',
    });
    skillService.getSkillToolBindings.mockResolvedValue({
      validation: {
        effectiveTools: ['api_call', 'user_ask'],
      },
    });
    toolCatalogService.getCatalogItemsByNames.mockResolvedValue(
      new Map([
        ['api_call', {
          promptExposure: 'prompt_and_runtime',
          defaultRequiresConfirmation: false,
          defaultRequiresApproval: true,
          status: 'active',
        }],
        ['user_ask', {
          promptExposure: 'runtime_only',
          defaultRequiresConfirmation: false,
          defaultRequiresApproval: false,
          status: 'active',
        }],
      ]),
    );

    const result = await service.getPublishedSkillRuntimeContext('skill-1');

    expect(result.allowedToolNames).toEqual(['api_call', 'user_ask']);
    expect(result.toolPolicies).toEqual([
      {
        name: 'api_call',
        promptExposure: 'prompt_and_runtime',
        defaultRequiresConfirmation: false,
        defaultRequiresApproval: true,
        status: 'active',
      },
      {
        name: 'user_ask',
        promptExposure: 'runtime_only',
        defaultRequiresConfirmation: false,
        defaultRequiresApproval: false,
        status: 'active',
      },
    ]);
  });

  it('extracts document source template metadata from execution flow payload', () => {
    const { service } = createService();

    const sourceTemplate = (service as any).extractExecutionFlowSourceTemplate({
      category: 'document',
      paramsSchema: {
        properties: {
          customerName: { type: 'string' },
          amount: { type: 'number' },
        },
      },
      steps: [
        {
          type: 'api',
          name: '渲染文档',
          api: {
            endpoint: '/api/carbone/render',
            body: {
              templateId: 'tpl-contract',
              outputFormat: 'pdf',
            },
          },
        },
      ],
    });

    expect(sourceTemplate).toEqual({
      templateId: 'tpl-contract',
      skillId: undefined,
      fileName: undefined,
      format: 'pdf',
      variableCount: 2,
    });
  });

  it('executes published document skill via template render when templateId is available', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        category: 'document',
        sourceTemplate: {
          templateId: 'tpl-001',
          format: 'docx',
        },
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    mockedAxios.post.mockResolvedValue({
      data: {
        downloadUrl: '/studio/download/doc-1',
        fileName: 'contract.docx',
        format: 'docx',
      },
    } as any);

    const result = await service.executePublishedSkill(
      'skill-1',
      {
        data: {
          customerName: 'Alice',
        },
      },
      'user-1',
      {
        executionId: 'exec-1',
        stepId: 'step-1',
      },
    );

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:3009/studio/render',
      {
        templateId: 'tpl-001',
        data: {
          customerName: 'Alice',
        },
        outputFormat: 'docx',
      },
      {
        timeout: 120000,
      },
    );
    expect(result.runtime).toBe('document');
    expect(result.success).toBe(true);
    expect(result.downloadUrl).toBe('http://localhost:3009/studio/download/doc-1');
    expect(result.output).toEqual(
      expect.objectContaining({
        templateId: 'tpl-001',
        fileName: 'contract.docx',
        downloadUrl: 'http://localhost:3009/studio/download/doc-1',
      }),
    );
  });

  it('executes published document skill via render-with-skill fallback when templateId is unavailable', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        category: 'document',
        steps: [
          {
            type: 'api',
            api: {
              endpoint: '/api/carbone/render',
            },
          },
        ],
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    mockedAxios.post.mockResolvedValue({
      data: {
        downloadUrl: '/studio/download/doc-2',
        fileName: 'fallback.docx',
        format: 'docx',
      },
    } as any);

    const result = await service.executePublishedSkill(
      'skill-2',
      {
        params: {
          customerName: 'Bob',
        },
        outputFormat: 'pdf',
      },
      'user-1',
    );

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:3009/studio/render-with-skill',
      {
        skillId: 'skill-2',
        params: {
          customerName: 'Bob',
        },
        outputFormat: 'pdf',
      },
      {
        timeout: 120000,
      },
    );
    expect(result.runtime).toBe('document');
    expect(result.success).toBe(true);
    expect(result.downloadUrl).toBe('http://localhost:3009/studio/download/doc-2');
  });

  it('executes document skill and wraps non-object response from carbone engine', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        sourceTemplate: JSON.stringify({ templateId: 'tpl-1' }),
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    
    // Carbone engine returns a plain string for some reason (hypothetical)
    mockedAxios.post.mockResolvedValue({
      data: 'SUCCESS_STRING',
    } as any);

    const result = await service.executePublishedSkill(
      'skill-doc-string',
      {},
      'user-1',
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ result: 'SUCCESS_STRING', templateId: 'tpl-1' });
  });

  it('executes temporal workflow and wraps string result into object', async () => {
    const { service, prisma, activityService } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'temporal_workflow',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        workflowDsl: {
          workflowClassName: 'WeatherWorkflow',
        },
      },
    });
    jest.spyOn(service as any, 'resolveTemporalExecutableBuildOrThrow').mockResolvedValue({
      id: 'build-1',
      generatedCode: 'PYTHON_CODE',
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    
    // Mock activity service to return a string
    jest.spyOn(activityService, 'executeCodeInTemporalSandbox').mockResolvedValue({
      success: true,
      result: '上海天气：晴，25度',
      logs: ['Log 1'],
    });

    const result = await service.executePublishedSkill(
      'skill-temporal',
      { city: 'shanghai' },
      'user-1',
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ result: '上海天气：晴，25度' });
    expect(result.result).toEqual({ result: '上海天气：晴，25度' });
  });

  it('executes published browser recording skill via browser worker with shared runtime session', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-browser-runtime-1',
      sourceType: 'browser_recording',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-browser-1',
      sourcePayload: {
        executionFlow: [
          {
            id: 'step_1',
            name: '1. navigate',
            tool: { name: 'browser_step' },
            input: {
              action: 'navigate',
              params: { url: '${url}' },
            },
          },
          {
            id: 'step_2',
            name: '2. smart_search',
            tool: { name: 'browser_step' },
            input: {
              action: 'smart_search',
              params: { query: '${query}' },
            },
          },
        ],
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { success: true, message: 'initialized' } } as any)
      .mockResolvedValueOnce({ data: { success: true, output: { status: 'navigated' } } } as any)
      .mockResolvedValueOnce({ data: { success: true, output: { status: 'searched' } } } as any);

    const result = await service.executePublishedSkill(
      'skill-browser-runtime',
      {
        url: 'https://www.bing.com',
        query: 'mcp',
      },
      'user-1',
      {
        executionId: 'exec-browser-1',
        stepId: 'step-system-1',
        runtimeSessionId: 'runtime-browser-1',
      },
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3004/browser/init',
      expect.objectContaining({
        backend: 'cli',
        runtimeSessionId: 'runtime-browser-1',
        initialUrl: 'https://www.bing.com',
      }),
      { timeout: 60000 },
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3004/browser/execute-step',
      expect.objectContaining({
        executionId: 'exec-browser-1',
        runtimeSessionId: 'runtime-browser-1',
        action: 'goto',
        target: 'https://www.bing.com',
        args: { url: 'https://www.bing.com' },
      }),
      { timeout: 120000 },
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3004/browser/execute-step',
      expect.objectContaining({
        executionId: 'exec-browser-1',
        runtimeSessionId: 'runtime-browser-1',
        action: 'smart_search',
        args: { query: 'mcp' },
      }),
      { timeout: 120000 },
    );
    expect(result).toEqual(
      expect.objectContaining({
        releaseId: 'release-browser-runtime-1',
        runtime: 'browser_recording',
        success: true,
      }),
    );
  });

  it('bridges recorder export into release and skill draft', async () => {
    const { service, prisma } = createService();

    jest.spyOn(service as any, 'createCapability').mockResolvedValue({
      release: { id: 'release-bridge-1' },
    });
    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-bridge-1',
      sourceType: 'browser_recording',
    });
    jest.spyOn(service as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-bridge-1',
      name: 'recorder-skill',
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);

    const result = await service.bridgeRecorderExport(
      {
        userGoal: '登录并查询报表',
        exportArtifacts: {
          guidance: 'g',
          commands: [{ tool: 'navigate', params: { url: 'https://example.com' } }],
          skillDraft: {
            publishPayload: {
              name: 'recorder-skill',
              description: 'desc',
              triggerKeywords: ['报表查询'],
              paramsSchema: { properties: {}, required: [] },
              executionFlowTemplateIds: [],
              executionFlow: [
                {
                  id: 'step-1',
                  type: 'tool',
                  tool: { name: 'browser_step' },
                  config: { executionPlan: { commands: [] } },
                },
              ],
              tools: ['browser_step'],
              apiEndpoints: { runtimeMetadata: { sourceType: 'browser_recording' } },
            },
          },
        },
      },
      'user-1',
    );

    expect((service as any).createCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'browser_recording',
        sourceName: 'recorder-skill',
      }),
      'user-1',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO skill_drafts'),
      expect.any(String),
      'release-bridge-1',
      'browser_recording',
      'recorder-skill',
      'desc',
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'user-1',
    );
    expect(result).toEqual({
      release: {
        id: 'release-bridge-1',
        sourceType: 'browser_recording',
      },
      skillDraft: {
        id: 'draft-bridge-1',
        name: 'recorder-skill',
      },
      bridgeMode: 'browser_recording_native',
    });
  });

  it('rejects bridge when target release type is not browser_recording', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-2',
      sourceType: 'temporal_workflow',
    });

    await expect(
      service.bridgeRecorderExport({
        releaseId: 'release-2',
        exportArtifacts: {
          skillDraft: {
            publishPayload: {
              name: 'bad-bridge',
            },
          },
        },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'invalid_release_type',
        message: 'bridge 仅支持 browser_recording 类型 release',
        expected: 'browser_recording',
        actual: 'temporal_workflow',
      }),
    });
  });

  it('rejects bridge when publishPayload is missing', async () => {
    const { service } = createService();

    await expect(
      service.bridgeRecorderExport({
        userGoal: '登录并查询报表',
        exportArtifacts: {
          guidance: 'g',
          skillDraft: {
            name: 'recorder-skill',
          },
        },
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'missing_publish_payload',
        message: '缺少 exportArtifacts.skillDraft.publishPayload',
      }),
    });
  });

  it('validates bridge DTO: releaseId must be uuid', () => {
    const dto = plainToInstance(BridgeRecorderExportDTO, {
      releaseId: 'not-a-uuid',
      exportArtifacts: {
        skillDraft: {
          publishPayload: {
            name: 'recorder-skill',
          },
        },
      },
    });

    const errors = validateSync(dto);
    const hasReleaseIdError = errors.some((error) => error.property === 'releaseId');
    expect(hasReleaseIdError).toBe(true);
  });

  it('validates bridge DTO: exportArtifacts is required', () => {
    const dto = plainToInstance(BridgeRecorderExportDTO, {
      userGoal: '登录并查询报表',
    });

    const errors = validateSync(dto);
    const hasExportArtifactsError = errors.some((error) => error.property === 'exportArtifacts');
    expect(hasExportArtifactsError).toBe(true);
  });

  it('rejects rollback target when target release equals current release', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({ id: 'release-1' });

    await expect(
      (service as any).getRollbackTargetOrThrow(
        { id: 'release-1', sourceId: 'src-1', sourceName: 's', sourceType: 'browser_recording' },
        'release-1',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'rollback_target_same_release',
        message: '不能回滚到当前 Release 自身',
      }),
    });
  });

  it('rejects rollback inference when current release has no source identifiers', async () => {
    const { service } = createService();

    await expect(
      (service as any).getRollbackTargetOrThrow(
        { id: 'release-1', sourceId: null, sourceName: null, sourceType: 'browser_recording' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'rollback_source_identifier_missing',
        message: '当前 Release 缺少可用于推断回滚目标的源标识',
      }),
    });
  });
});
