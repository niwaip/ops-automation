import axios from 'axios';
import { TemporalWorkflowActivityResolutionService } from '../src/modules/temporal-workflow/temporal-workflow-activity-resolution.service';
import { TemporalWorkflowBrowserDraftService } from '../src/modules/temporal-workflow/browser-bridge/temporal-workflow-browser-draft.service';
import { TemporalWorkflowCodegenService } from '../src/modules/temporal-workflow/temporal-workflow-codegen.service';
import { ActivityCodegenService } from '../src/modules/temporal-workflow/temporal-activity-codegen.service';
import { TemporalWorkflowService } from '../src/modules/temporal-workflow/temporal-workflow.service';
import { TemporalWorkflowArtifactService } from '../src/workflow-registry/workflow-template/temporal-workflow-artifact.service';
import { TemporalWorkflowConfigOrchestrationService } from '../src/workflow-registry/workflow-template/temporal-workflow-config-orchestration.service';
import { TemporalWorkflowConfigService } from '../src/workflow-registry/workflow-template/temporal-workflow-config.service';
import { TemporalWorkflowDraftOrchestrationService } from '../src/workflow-registry/workflow-template/temporal-workflow-draft-orchestration.service';
import { TemporalWorkflowManagementService } from '../src/workflow-registry/workflow-template/temporal-workflow-management.service';
import { TemporalWorkflowSessionOrchestrationService } from '../src/workflow-registry/workflow-template/temporal-workflow-session-orchestration.service';
import { TemporalWorkflowSessionSupportFactoryService } from '../src/workflow-registry/workflow-template/temporal-workflow-session-support-factory.service';
import { TemporalWorkflowTemplateService } from '../src/workflow-registry/workflow-template/temporal-workflow-template.service';
import { buildDeterministicWorkflowCodeForWorkflow } from '../src/modules/temporal-workflow/temporal-workflow-deterministic-builder';
import { TemporalWorkflowAiDraftService } from '../src/modules/temporal-workflow/temporal-workflow-draft.service';
import {
  buildGenericAiDraftSampleValue,
  inferWorkflowInputParamType,
  normalizeAiDraftStepInput,
  normalizeDraftInputParams,
} from '../src/modules/temporal-workflow/temporal-workflow-draft.normalizers';
import { repairCommonDraftPlanIssues } from '../src/modules/temporal-workflow/temporal-workflow-draft-plan.helpers';
import { TemporalWorkflowNormalizationService } from '../src/modules/temporal-workflow/temporal-workflow-normalization.service';
import { pickFirstNonEmptyString } from '../src/modules/temporal-workflow/temporal-workflow-json.utils';
import { TemporalWorkflowSessionService } from '../src/modules/temporal-workflow/temporal-workflow-session.service';
import { TemporalWorkflowSupportService } from '../src/modules/temporal-workflow/temporal-workflow-support.service';
import {
  buildTemplateWorkflowParamSeeds,
  normalizeWorkflowInputParamType,
  normalizeWorkflowInputRenderPath,
} from '../src/modules/temporal-workflow/temporal-workflow-template.helpers';
import { TemporalWorkflowValidationFacadeService } from '../src/modules/temporal-workflow/temporal-workflow-validation-facade.service';
import { TemporalWorkflowValidationService } from '../src/modules/temporal-workflow/temporal-workflow-validation.service';
import { TemporalWorkflowArtifactValidationService } from '../src/workflow-registry/validation/temporal-workflow-artifact-validation.service';
import { TemporalWorkflowValidationContractService } from '../src/workflow-registry/validation/temporal-workflow-validation-contract.service';
import { TemporalWorkflowDslValidationService } from '../src/workflow-registry/validation/temporal-workflow-dsl-validation.service';
import { TemporalWorkflowCodegenOrchestrationService } from '../src/workflow-registry/codegen/temporal-workflow-codegen-orchestration.service';
import { BuiltinActivityRegistry } from '../src/modules/temporal-workflow/builtin-activity.registry';
import { extractSourceContext } from '../src/modules/temporal-workflow/temporal-workflow-dto.helpers';

jest.mock('axios');

describe('TemporalWorkflowBrowserDraftService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  const createService = () => {
    const prisma = {
      temporalWorkflow: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      chatSession: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      activity: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      skillConfig: {
        findUnique: jest.fn(),
      },
    };

    const builtinRegistry = new BuiltinActivityRegistry();
    const workflowNormalizationService = new TemporalWorkflowNormalizationService(
      prisma as any,
      builtinRegistry
    );
    const aiDraftService = new TemporalWorkflowAiDraftService(prisma as any, builtinRegistry);
    const browserDraftService = new TemporalWorkflowBrowserDraftService();
    const codegenService = new TemporalWorkflowCodegenService();
    const sessionService = new TemporalWorkflowSessionService(
      prisma as any,
      workflowNormalizationService
    );
    const validationService = new TemporalWorkflowValidationService();
    const activityResolutionService = new TemporalWorkflowActivityResolutionService(
      prisma as any,
      builtinRegistry
    );
    const workflowConfigService = new TemporalWorkflowConfigService();
    const workflowTemplateService = new TemporalWorkflowTemplateService();
    const workflowArtifactService = new TemporalWorkflowArtifactService(prisma as any);
    const workflowConfigOrchestrationService = new TemporalWorkflowConfigOrchestrationService(
      workflowConfigService
    );
    const workflowManagementService = new TemporalWorkflowManagementService(
      prisma as any,
      workflowNormalizationService,
      workflowArtifactService
    );
    const activityCodegenService = new ActivityCodegenService();
    const workflowSupportService = new TemporalWorkflowSupportService(
      builtinRegistry,
      aiDraftService,
      activityResolutionService,
      workflowConfigService,
      workflowNormalizationService,
      activityCodegenService
    );
    const workflowDraftOrchestrationService = new TemporalWorkflowDraftOrchestrationService(
      aiDraftService,
      browserDraftService,
      workflowSupportService,
      workflowTemplateService
    );
    const workflowSessionSupportFactoryService = new TemporalWorkflowSessionSupportFactoryService(
      workflowSupportService
    );
    const workflowSessionOrchestrationService = new TemporalWorkflowSessionOrchestrationService(
      sessionService,
      workflowSessionSupportFactoryService
    );
    const validationFacade = new TemporalWorkflowValidationFacadeService(validationService);
    const workflowArtifactValidationService = new TemporalWorkflowArtifactValidationService(
      prisma as any,
      validationFacade,
      workflowArtifactService,
      new TemporalWorkflowValidationContractService()
    );
    const workflowDslValidationService = new TemporalWorkflowDslValidationService(
      workflowSupportService
    );
    const workflowCodegenOrchestrationService = new TemporalWorkflowCodegenOrchestrationService(
      prisma as any,
      codegenService,
      workflowArtifactService,
      workflowSupportService,
      workflowNormalizationService
    );
    const service = new TemporalWorkflowService(
      workflowCodegenOrchestrationService,
      workflowArtifactService,
      workflowConfigOrchestrationService,
      workflowDraftOrchestrationService,
      workflowManagementService,
      workflowSessionOrchestrationService,
      workflowArtifactValidationService,
      workflowDslValidationService
    );

    return {
      service,
      prisma,
      builtinRegistry,
      aiDraftService,
      browserDraftService,
      codegenService,
      sessionService,
      validationService,
      activityResolutionService,
      workflowConfigService,
      workflowNormalizationService,
      workflowTemplateService,
      workflowArtifactService,
      workflowSupportService,
    };
  };

  it('keeps workflow and activity identities stable when regenerating the same template', async () => {
    const { service } = createService();
    const input = {
      templateId: 'template-stable-identity',
      name: '打开网页',
      templateSteps: [
        {
          step_id: 'step_1',
          action: 'navigate',
          params: { url: 'https://example.dev/article' },
        },
      ],
    };

    const first = await service.generateBrowserWorkflowDraft(input);
    const second = await service.generateBrowserWorkflowDraft(input);

    expect(first.workflowDsl.workflowClassName).toBe(second.workflowDsl.workflowClassName);
    expect(first.workflowDsl.steps.map((step) => step.activityRef)).toEqual(
      second.workflowDsl.steps.map((step) => step.activityRef)
    );
    expect(first.activityDsl.activities.map((activity) => activity.activityRef)).toEqual(
      second.activityDsl.activities.map((activity) => activity.activityRef)
    );
  });

  it('uses different workflow identities for different browser templates', async () => {
    const { service } = createService();
    const source = {
      name: '打开网页',
      templateSteps: [
        {
          step_id: 'step_1',
          action: 'navigate',
          params: { url: 'https://example.dev/article' },
        },
      ],
    };

    const first = await service.generateBrowserWorkflowDraft({
      ...source,
      templateId: 'template-a',
    });
    const second = await service.generateBrowserWorkflowDraft({
      ...source,
      templateId: 'template-b',
    });

    expect(first.workflowDsl.workflowClassName).not.toBe(second.workflowDsl.workflowClassName);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates browser template draft from playwright-like script', async () => {
    const { service } = createService();

    const draft = await service.generateBrowserWorkflowDraft({
      script: [
        'await page.goto("https://example.com/login");',
        'await page.fill("#username", "{username}");',
        'await page.fill("#password", "{password}");',
        'await page.click("button[type=submit]");',
      ].join('\n'),
      name: '登录自动化',
    });

    expect(draft.name).toBe('登录自动化');
    expect(draft.workflowDsl.sourceContext).toEqual(
      expect.objectContaining({
        sourceType: 'browser_template',
      })
    );
    expect(draft.workflowDsl.steps[0]).toEqual(
      expect.objectContaining({
        activityRef: expect.stringMatching(/^custom:/),
      })
    );
    expect(draft.workflowDsl.steps).toHaveLength(2);
    expect(draft.workflowDsl.steps).toEqual([
      expect.objectContaining({ name: '1. 页面打开' }),
      expect.objectContaining({ name: '2. 页面迁移' }),
    ]);
    expect(draft.browserTemplate.commandCount).toBe(4);
    expect(draft.browserTemplate.placeholders).toEqual(
      expect.arrayContaining(['username', 'password'])
    );
    expect(draft.activityDsl.activities).toHaveLength(2);
    expect(draft.activityDsl.activities[0]).toEqual(
      expect.objectContaining({
        handler: 'browser',
        name: '1. 页面打开',
      })
    );
    expect((draft.activityDsl.activities[0].config as any).steps).toHaveLength(4);
    expect((draft.activityDsl.activities[0].config as any).steps[1]).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          action: 'waitForSelector',
          selector: '#username',
        }),
      })
    );
    expect((draft.activityDsl.activities[0].config as any).sessionLifecycle).toEqual({
      initializeSession: true,
      cleanupSession: false,
    });
    expect((draft.activityDsl.activities[1].config as any).steps).toHaveLength(1);
    expect((draft.activityDsl.activities[1].config as any).steps[0]).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          action: 'click',
          selector: 'button[type=submit]',
        }),
      })
    );
    expect((draft.activityDsl.activities[1].config as any).sessionLifecycle).toEqual({
      initializeSession: false,
      cleanupSession: true,
    });
  });

  it('validates browser recording draft for baidu search mcp scenario', async () => {
    const { service } = createService();
    const draft = await service.generateBrowserWorkflowDraft({
      script: [
        'await page.goto("https://www.baidu.com");',
        'await page.fill("#kw", "mcp");',
        'await page.press("#kw", "Enter");',
      ].join('\n'),
      name: 'browser_recording_打开百度_搜索mcp',
      description: '打开百度并搜索 mcp',
    });

    const validation = await service.validate(draft.workflowDsl, draft.activityDsl);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('generates browser template draft from structured execution commands', async () => {
    const { service } = createService();

    const draft = await service.generateBrowserWorkflowDraft({
      name: '录制登录工作流',
      description: '直接复用 executionPlan.commands',
      commands: [
        {
          tool: 'navigate',
          params: { url: 'https://example.com/login' },
          description: '打开登录页',
        },
        {
          tool: 'fill',
          params: { target: 'e12', value: '${username}' },
          description: '输入用户名',
          locator: { strategy: 'ref', value: 'e12' },
        },
        {
          tool: 'click',
          params: { target: 'e20' },
          description: '点击登录',
          locator: { strategy: 'ref', value: 'e20' },
        },
      ],
    });

    expect(draft.name).toBe('录制登录工作流');
    expect(draft.browserTemplate.commandCount).toBe(3);
    expect(draft.browserTemplate.placeholders).toEqual(expect.arrayContaining(['username']));
    expect(draft.workflowDsl.steps).toHaveLength(2);
    expect(draft.activityDsl.activities).toHaveLength(2);
    expect(draft.workflowDsl.sourceContext).toEqual(
      expect.objectContaining({
        sourceType: 'browser_template',
        warnings: expect.arrayContaining([expect.stringContaining('executionPlan.commands')]),
      })
    );
    expect((draft.activityDsl.activities[0].config as any).steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          config: expect.objectContaining({
            action: 'fill',
            target: 'e12',
            locator: expect.objectContaining({ type: 'ref', value: 'e12' }),
            value: '${username}',
          }),
        }),
      ])
    );
    expect((draft.activityDsl.activities[1].config as any).steps).toEqual([
      expect.objectContaining({
        config: expect.objectContaining({
          action: 'click',
          target: 'e20',
          locator: expect.objectContaining({ type: 'ref', value: 'e20' }),
        }),
      }),
    ]);
  });

  it('prefers original template steps over structured commands when splitting browser activity', async () => {
    const { service } = createService();

    const draft = await service.generateBrowserWorkflowDraft({
      templateId: 'tpl-browser-001',
      name: '模板步骤优先工作流',
      description: '直接复用模板原始步骤拆分 activity',
      templateSteps: [
        {
          step_id: 'step_goto',
          action: 'goto',
          params: { url: 'http://192.168.100.143:5173/api/sessions/demo/start' },
        },
        {
          step_id: 'step_fill',
          action: 'fill',
          locator: { type: 'ref', value: 'e12' },
          params: { value: '${username}' },
        },
      ],
      paramsSchema: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            description: '登录用户名',
            default: 'test',
          },
        },
        required: ['username'],
      },
      commands: [
        {
          tool: 'click',
          params: { target: 'e99' },
          description: '这条 command 不应覆盖模板步骤',
        },
      ],
    });

    expect(draft.browserTemplate.commandCount).toBe(2);
    expect(draft.workflowDsl.steps).toHaveLength(1);
    expect(draft.workflowDsl.steps).toEqual([expect.objectContaining({ name: '1. 页面打开' })]);
    expect(draft.workflowDsl.sourceContext).toEqual(
      expect.objectContaining({
        sourceType: 'browser_template',
        sourceTemplate: expect.objectContaining({
          templateId: 'tpl-browser-001',
        }),
        warnings: expect.arrayContaining([expect.stringContaining('模板原始步骤')]),
      })
    );
    expect(draft.workflowDsl.inputParams).toEqual(
      expect.objectContaining({
        username: expect.objectContaining({
          required: true,
          defaultValue: 'test',
          description: '登录用户名',
        }),
      })
    );
    expect(draft.activityDsl.activities).toHaveLength(1);
    expect((draft.activityDsl.activities[0].config as any).steps).toEqual([
      expect.objectContaining({
        config: expect.objectContaining({
          action: 'goto',
          url: 'http://192.168.100.143:5173/api/sessions/demo/start',
        }),
      }),
      expect.objectContaining({
        config: expect.objectContaining({
          action: 'fill',
          target: 'e12',
          selector: 'e12',
          value: '${username}',
        }),
      }),
    ]);
  });

  it('preserves template post-processing as control-plane logical steps', async () => {
    const { service } = createService();

    const draft = await service.generateBrowserWorkflowDraft({
      templateId: 'tpl-browser-composite-001',
      name: '浏览器加总结工作流',
      templateSteps: [
        {
          step_id: 'step_1',
          action: 'goto',
          params: { url: 'https://example.com/article' },
        },
      ],
      workflowComposition: {
        schemaVersion: 'browser-template-workflow-composition/v1',
        outputDeclarations: [
          {
            name: 'step_1_clean_content',
            sourceStepId: 'step_1',
            kind: 'content',
          },
        ],
        postProcessingSteps: [
          {
            id: 'post_process_1',
            type: 'llm_operation',
            sourceStepId: 'step_1',
            operationId: 'summarize_text',
            operationVersion: '1',
            processingMode: 'summary',
            runWhen: 'browser_succeeded',
            inputBindings: {
              text: {
                source: 'node_output',
                path: 'step_1_clean_content',
              },
            },
          },
        ],
      },
    });

    // The LLM node is intentionally not emitted as an invalid Temporal Activity.
    expect(draft.workflowDsl.steps).toHaveLength(1);
    expect(draft.activityDsl.activities).toHaveLength(1);
    expect(draft.browserTemplate).toEqual(
      expect.objectContaining({
        browserStepCount: 1,
        postProcessingStepCount: 1,
        totalStepCount: 2,
      })
    );
    expect(draft.workflowDsl.sourceContext).toEqual(
      expect.objectContaining({
        browserWorkflowComposition: expect.objectContaining({
          postProcessingSteps: [expect.objectContaining({ id: 'post_process_1' })],
        }),
        browserLogicalPlan: expect.objectContaining({
          totalStepCount: 2,
          steps: [
            expect.objectContaining({ id: 'step_1', type: 'browser_activity' }),
            expect.objectContaining({
              id: 'post_process_1',
              type: 'llm_operation',
              dependsOn: ['step_1'],
            }),
          ],
        }),
      })
    );
    expect(extractSourceContext(draft.workflowDsl, draft.activityDsl)).toEqual(
      expect.objectContaining({
        browserLogicalPlan: expect.objectContaining({ totalStepCount: 2 }),
        browserWorkflowComposition: expect.objectContaining({
          postProcessingSteps: [expect.objectContaining({ id: 'post_process_1' })],
        }),
      })
    );
  });

  it('preserves loop draft metadata and marks browser phases with loop segments', async () => {
    const { service } = createService();

    const draft = await service.generateBrowserWorkflowDraft({
      templateId: 'tpl-browser-loop-001',
      name: '循环审批工作流',
      templateSteps: [
        {
          step_id: 'step_1',
          action: 'goto',
          params: { url: '${startUrl}' },
        },
        {
          step_id: 'step_2',
          action: 'click',
          locator: { type: 'ref', value: 'e_open_row' },
          params: {},
        },
        {
          step_id: 'step_3',
          action: 'read_value',
          locator: { type: 'test-id', value: 'status-value' },
          output_var: 'rowStatus',
          params: {},
        },
        {
          step_id: 'step_4',
          action: 'branch',
          branch: {
            condition_fn: '!String(value || "").includes("保留中")',
            on_match: 'stop',
            on_mismatch: 'continue',
          },
        },
        {
          step_id: 'step_5',
          action: 'click',
          locator: { type: 'ref', value: 'e_approve' },
          params: {},
        },
        {
          step_id: 'step_6',
          action: 'click',
          locator: { type: 'ref', value: 'e_back' },
          params: {},
        },
      ],
      loopDraft: {
        mode: 'repeat_until',
        maxIterations: 20,
        eachIteration: {
          stepIds: ['step_2', 'step_3', 'step_4', 'step_5', 'step_6'],
        },
        stopWhen: {
          conditionFn: '!String(value || "").includes("保留中")',
        },
      },
    });

    expect(draft.workflowDsl.sourceContext).toEqual(
      expect.objectContaining({
        sourceType: 'browser_template',
        browserLoopDraft: expect.objectContaining({
          mode: 'repeat_until',
          maxIterations: 20,
        }),
      })
    );
    expect(
      draft.activityDsl.activities.map((activity) => (activity.config as any).loopSegment)
    ).toEqual(expect.arrayContaining(['pre_loop', 'iteration']));
    const activitySteps = draft.activityDsl.activities.flatMap(
      (activity) => ((activity.config as any).steps || []) as Array<Record<string, any>>
    );
    expect(activitySteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          config: expect.objectContaining({
            templateStepId: 'step_3',
            action: 'get_text',
            originalAction: 'read_value',
            outputVar: 'rowStatus',
          }),
        }),
        expect.objectContaining({
          config: expect.objectContaining({
            templateStepId: 'step_4',
            action: 'branch',
            branch: expect.objectContaining({
              condition_fn: '!String(value || "").includes("保留中")',
            }),
          }),
        }),
      ])
    );
  });

  it('does not treat branch condition function bodies as browser template placeholders', async () => {
    const { service } = createService();

    const draft = await service.generateBrowserWorkflowDraft({
      templateId: 'tpl-browser-branch-threshold',
      name: '审批阈值工作流',
      templateSteps: [
        {
          step_id: 'step_1',
          action: 'read_value',
          locator: { type: 'test-id', value: 'gross-margin-value' },
          output_var: 'grossProfitRate',
          params: {},
        },
        {
          step_id: 'step_2',
          action: 'branch',
          branch: {
            on_match: 'continue',
            on_mismatch: 'takeover',
            condition_fn:
              "(ctx) => { const value = Number(String(ctx.grossProfitRate || '').replace(/[^0-9.-]+/g, '')); return Number.isFinite(value) && value > 20; }",
          },
        },
      ],
      paramsSchema: {
        type: 'object',
        properties: {
          grossMarginThreshold: {
            type: 'number',
            description: '自动执行所需的毛利率阈值，低于该值时转人工接管',
            default: 20,
          },
        },
        required: ['grossMarginThreshold'],
      },
    });

    expect(draft.workflowDsl.inputParams).toEqual({
      grossMarginThreshold: expect.objectContaining({
        required: true,
        defaultValue: '20',
        description: '自动执行所需的毛利率阈值，低于该值时转人工接管',
      }),
    });
  });

  it('keeps navigate and fill in the same activity and splits when click changes page structure', async () => {
    const { service } = createService();

    const draft = await service.generateBrowserWorkflowDraft({
      templateId: 'tpl-browser-activity-boundary',
      name: '页面结构变化切分',
      templateSteps: [
        {
          step_id: 'step_1',
          action: 'navigate',
          params: { url: '${startUrl}' },
        },
        {
          step_id: 'step_2',
          action: 'wait',
          params: { duration: 1000 },
        },
        {
          step_id: 'step_3',
          action: 'screenshot',
          params: {},
        },
        {
          step_id: 'step_4',
          action: 'waitForSelector',
          params: { selector: 'textbox[name="Enter username"]', timeoutMs: 15000 },
        },
        {
          step_id: 'step_5',
          action: 'fill',
          locator: { type: 'ref', value: 'e_user' },
          params: { value: '${username}' },
        },
        {
          step_id: 'step_6',
          action: 'wait',
          params: { duration: 1000 },
        },
        {
          step_id: 'step_7',
          action: 'screenshot',
          params: {},
        },
        {
          step_id: 'step_8',
          action: 'fill',
          locator: { type: 'ref', value: 'e_password' },
          params: { value: '${password}' },
        },
        {
          step_id: 'step_9',
          action: 'wait',
          params: { duration: 1000 },
        },
        {
          step_id: 'step_10',
          action: 'screenshot',
          params: {},
        },
        {
          step_id: 'step_11',
          action: 'click',
          locator: { type: 'ref', value: 'e_submit' },
          params: {},
        },
        {
          step_id: 'step_12',
          action: 'wait',
          params: { duration: 1000 },
        },
        {
          step_id: 'step_13',
          action: 'screenshot',
          params: {},
        },
      ],
      paramsSchema: {
        type: 'object',
        properties: {
          startUrl: { type: 'string' },
          username: { type: 'string' },
          password: { type: 'string' },
        },
        required: ['startUrl', 'username', 'password'],
      },
    });

    expect(draft.workflowDsl.steps).toHaveLength(2);
    expect(draft.workflowDsl.steps).toEqual([
      expect.objectContaining({ name: '1. 页面打开' }),
      expect.objectContaining({ name: '2. 页面迁移' }),
    ]);
    expect(draft.activityDsl.activities).toHaveLength(2);
    expect(
      (draft.activityDsl.activities[0].config as any).steps.map((step: any) => step.config.action)
    ).toEqual([
      'navigate',
      'wait',
      'screenshot',
      'waitForSelector',
      'fill',
      'wait',
      'screenshot',
      'fill',
      'wait',
      'screenshot',
    ]);
    expect(
      (draft.activityDsl.activities[1].config as any).steps.map((step: any) => step.config.action)
    ).toEqual(['click', 'wait', 'screenshot']);
  });

  it('preserves declared browser template input params when commands do not expose placeholders', async () => {
    const { service } = createService();

    const draft = await service.generateBrowserWorkflowDraft({
      name: '录制登录工作流',
      description: 'executionPlan.commands 使用运行时字面值，但模板已声明参数',
      commands: [
        {
          tool: 'navigate',
          params: { url: 'http://192.168.100.143:5173/' },
          description: '打开登录页',
        },
        {
          tool: 'fill',
          params: { target: 'e12', value: 'test' },
          description: '输入用户名',
          locator: { strategy: 'ref', value: 'e12' },
        },
      ],
      inputParams: {
        startUrl: {
          description: '起始页面地址',
          required: false,
          defaultValue: 'http://192.168.100.143:5173/',
          source: 'declared',
          type: 'string',
          exampleValue: 'http://192.168.100.143:5173/',
        },
        username: {
          description: '登录用户名',
          required: true,
          defaultValue: 'test',
          source: 'declared',
          type: 'string',
          exampleValue: 'test',
        },
      },
    });

    expect(draft.workflowDsl.inputParams).toEqual(
      expect.objectContaining({
        startUrl: expect.objectContaining({
          required: false,
          defaultValue: 'http://192.168.100.143:5173/',
          description: '起始页面地址',
        }),
        username: expect.objectContaining({
          required: true,
          defaultValue: 'test',
          description: '登录用户名',
        }),
      })
    );
    expect(draft.browserTemplate.placeholders).toEqual([]);
  });

  it('does not crash validate when browser draft custom ref is not a database uuid', async () => {
    const { service, prisma } = createService();
    prisma.activity.findUnique.mockRejectedValue(new Error('invalid input syntax for type uuid'));

    const draft = await service.generateBrowserWorkflowDraft({
      script: 'await page.goto("${url}");',
      name: 'browser_recording_uuid_guard',
      description: '验证 custom activityRef 非 uuid 时不触发 500',
    });

    const validation = await service.validate(draft.workflowDsl, draft.activityDsl);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('validates custom activityRef against activityDsl id-based refs', async () => {
    const { service } = createService();

    const validation = await service.validate(
      {
        name: '文档类型工作流',
        workflowClassName: 'DocumentTypeWorkflow',
        workflowDefnName: '文档类型工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '执行文档渲染',
            type: 'activity',
            activityRef: 'custom:activity-doc-render-1',
            startToCloseTimeout: '60s',
          },
        ],
      },
      {
        activities: [
          {
            id: 'activity-doc-render-1',
            activityRef: 'custom:activity-doc-render-1',
            name: '执行文档渲染',
            fn: 'documentRenderDraft',
            timeout: '60s',
            handler: 'carbone',
            config: {},
          },
        ],
      }
    );

    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);
  });
});
