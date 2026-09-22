import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import {
  APPROVAL_STATUS,
  EXECUTION_EVENT_TYPE,
  EXECUTION_STATUS,
  EXECUTION_STEP_STATUS,
} from '../src/modules/execution';
import { ExecutionService } from '../src/modules/execution/execution.service';
import {
  ApprovalDecisionDto,
  SubmitInputDto,
  TakeoverExecutionDto,
} from '../src/modules/execution/state/execution.dto';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ExecutionService.create planner draft reuse', () => {
  const createService = () => {
    const prisma = {
      execution: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      executionStep: {
        createMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      executionEvent: {
        create: jest.fn(),
      },
      runtimeSession: {
        findFirst: jest.fn(),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const service = new ExecutionService(prisma as never, {} as never, {} as never, {} as never);
    const serviceInternals = service as any;
    const planningService = serviceInternals.executionPlanningService;
    const executionCreateService = serviceInternals.executionCreateService;
    jest.spyOn(planningService, 'assertSkillAccessibleByUser').mockResolvedValue(undefined);
    jest
      .spyOn(planningService, 'fetchSkillDefaultResolution')
      .mockResolvedValue({ input: {}, sources: {} });
    jest.spyOn(planningService, 'generatePlanDraft').mockResolvedValue(undefined);
    jest.spyOn(executionCreateService, 'createPlannedSteps').mockResolvedValue(undefined);
    jest
      .spyOn(serviceInternals.executionStartService, 'startExecution')
      .mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, 'getById').mockResolvedValue({ id: 'execution-create-1' });

    return { service, prisma, planningService, executionCreateService };
  };

  it('reuses provided planDraft and skips planner callback during create', async () => {
    const { service, prisma, planningService } = createService();

    const providedPlanDraft = {
      plan_id: 'plan-1',
      planner_mode: 'skill',
      objective: 'query weather',
      summary: 'query weather via weather skill',
      skill_match: {
        skill_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        skill_name: '天气查询',
        confidence: 0.99,
      },
      steps: [],
      required_inputs: [
        {
          name: 'city',
          type: 'string',
          required: false,
          value: '上海',
          missing: false,
          source: 'user_input',
        },
      ],
      risk_summary: {
        level: 'low',
        requires_human_review: false,
        items: ['no_material_risk_detected'],
      },
    };

    prisma.execution.create.mockResolvedValue({
      id: 'execution-create-1',
      requiresApproval: false,
      createdBy: 'user-1',
    });
    prisma.executionEvent.create.mockResolvedValue(undefined);

    await service.create(
      'user-1',
      {
        skillId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        runtimeType: 'workflow',
        input: { prompt: '上海的天气' },
        planDraft: providedPlanDraft,
      },
      {
        authToken: 'Bearer token-1',
      }
    );

    expect(planningService.generatePlanDraft).not.toHaveBeenCalled();
    expect(prisma.execution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        skillId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        runtimeType: 'workflow',
        status: 'queued',
      }),
    });
  });

  it('skips planner rematch when caller explicitly selects a skill and submits structured input', async () => {
    const { service, prisma, planningService, executionCreateService } = createService();

    prisma.execution.create.mockResolvedValue({
      id: 'execution-create-structured-1',
      requiresApproval: false,
      createdBy: 'user-1',
    });
    prisma.executionEvent.create.mockResolvedValue(undefined);

    await service.create(
      'user-1',
      {
        skillId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        runtimeType: 'workflow',
        input: {
          'contract.partyA.name_cn': 'Party A CN Ltd',
          'contract.contractNo_cn': 'TSC-2026-0528-001',
        },
      },
      {
        authToken: 'Bearer token-1',
      }
    );

    expect(planningService.generatePlanDraft).not.toHaveBeenCalled();
    expect(executionCreateService.createPlannedSteps).toHaveBeenCalledWith(
      'execution-create-structured-1',
      expect.objectContaining({
        plannerMode: 'skill',
      }),
      expect.objectContaining({
        planner_mode: 'skill',
        required_inputs: [],
        steps: [
          expect.objectContaining({
            id: 'execute_selected_skill',
            kind: 'skill',
            status: 'planned',
          }),
        ],
      }),
      expect.objectContaining({
        emitEvent: expect.any(Function),
        enterWaitingInput: expect.any(Function),
        getExecutionDto: expect.any(Function),
        startExecution: expect.any(Function),
      })
    );
    expect(prisma.execution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        skillId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        runtimeType: 'workflow',
        status: 'queued',
      }),
    });
  });

  it('refreshes semantic snapshot when provided input already resolves grouped missing fields', async () => {
    const { service, prisma } = createService();

    const providedPlanDraft = {
      plan_id: 'plan-1',
      planner_mode: 'skill',
      objective: 'generate contract',
      summary: '仍缺少付款计划',
      skill_match: {
        skill_id: 'skill-1',
        skill_name: '采购合同',
        confidence: 0.99,
      },
      steps: [
        {
          id: 'collect-required-inputs',
          title: 'Collect required inputs',
          description: '补齐必填参数: paymentSchedule[].amount',
          kind: 'human_input',
          status: 'planned',
        },
      ],
      required_inputs: [
        {
          name: 'paymentSchedule[].amount',
          type: 'number',
          required: true,
          missing: true,
          source: 'unresolved',
          description: '付款金额',
        },
      ],
      semantic: {
        enabled: true,
        mode: 'complex_document',
        previewReady: false,
        finalReady: false,
        fallbackToFieldLevel: false,
        summary: '文档仍缺少 1 个关键业务组。',
        groupedMissing: [
          {
            key: 'paymentSchedule',
            label: '付款计划',
            kind: 'array_group',
            blocking: true,
            required: true,
            fieldNames: ['paymentSchedule[].amount'],
            missingFieldNames: ['paymentSchedule[].amount'],
            description: '请按业务组补充 付款计划',
          },
        ],
        complexity: {
          category: 'complex_document',
          totalFields: 1,
          requiredFields: 1,
          missingFields: 1,
          arrayGroups: 1,
          reasonCodes: ['array_group_threshold'],
        },
      },
      risk_summary: {
        level: 'medium',
        requires_human_review: false,
        items: ['missing_required_inputs'],
      },
    };

    prisma.execution.create.mockResolvedValue({
      id: 'execution-create-1',
      requiresApproval: false,
      createdBy: 'user-1',
    });
    prisma.executionEvent.create.mockResolvedValue(undefined);

    await service.create(
      'user-1',
      {
        skillId: 'skill-1',
        runtimeType: 'workflow',
        input: { 'paymentSchedule[].amount': [1000] },
        planDraft: providedPlanDraft as any,
      },
      {
        authToken: 'Bearer token-1',
      }
    );

    expect(prisma.execution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        normalizedInputJson: expect.objectContaining({
          semantic: expect.objectContaining({
            previewReady: true,
            finalReady: true,
            groupedMissing: [],
            summary: '文档参数已满足最终渲染要求。',
            complexity: expect.objectContaining({
              missingFields: 0,
            }),
          }),
        }),
      }),
    });
  });

  it('rewrites browser recording planDraft into workflow activity phases during create', async () => {
    const { service, prisma } = createService();

    const providedPlanDraft = {
      plan_id: 'plan-browser-1',
      planner_mode: 'skill',
      objective: '登录并进入执行管理',
      summary: '已识别浏览器技能',
      skill_match: {
        skill_id: 'skill-browser-1',
        skill_name: '登录并进入登录',
        confidence: 1,
      },
      steps: [
        {
          id: 'raw-step-1',
          title: '1. navigate',
          description: '执行 1. navigate 步骤。',
          kind: 'tool',
          status: 'planned',
          tool_name: '1. navigate',
        },
      ],
      required_inputs: [
        {
          name: 'startUrl',
          type: 'string',
          required: true,
          value: 'http://example.test/login',
          missing: false,
          source: 'user_input',
        },
        {
          name: 'username',
          type: 'string',
          required: true,
          value: 'tester',
          missing: false,
          source: 'user_input',
        },
      ],
      risk_summary: {
        level: 'low',
        requires_human_review: false,
        items: ['no_material_risk_detected'],
      },
    };

    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        source_type: 'browser_recording',
        source_payload_json: {},
        workflow_dsl: {
          steps: [
            {
              id: 'activity_open',
              name: '1. 页面打开',
              type: 'activity',
              activityRef: 'custom:browser_open',
              activityName: '1. 页面打开',
            },
            {
              id: 'activity_submit',
              name: '2. 页面迁移',
              type: 'activity',
              activityRef: 'custom:browser_submit',
              activityName: '2. 页面迁移',
            },
            {
              id: 'activity_nav',
              name: '3. 页面迁移',
              type: 'activity',
              activityRef: 'custom:browser_nav',
              activityName: '3. 页面迁移',
            },
          ],
        },
        activity_dsl: {
          activities: [
            {
              fn: 'browser_open',
              name: '1. 页面打开',
              handler: 'browser',
              config: {
                steps: [
                  {
                    name: '1. navigate',
                    type: 'browser',
                    config: {
                      action: 'navigate',
                      url: '${startUrl}',
                      target: '${startUrl}',
                    },
                  },
                  {
                    name: '2. fill',
                    type: 'browser',
                    config: {
                      action: 'fill',
                      selector: 'textbox[name="Enter username"]',
                      value: '${username}',
                    },
                  },
                ],
              },
            },
            {
              fn: 'browser_submit',
              name: '2. 页面迁移',
              handler: 'browser',
              config: {
                steps: [
                  {
                    name: '3. click',
                    type: 'browser',
                    config: {
                      action: 'click',
                      selector: 'button[type="submit"]',
                    },
                  },
                ],
              },
            },
            {
              fn: 'browser_nav',
              name: '3. 页面迁移',
              handler: 'browser',
              config: {
                steps: [
                  {
                    name: '4. wait for executions',
                    type: 'browser',
                    config: {
                      action: 'waitForSelector',
                      selector: 'menuitem[name="Executions"]',
                      timeoutMs: 15000,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ]);
    prisma.execution.create.mockResolvedValue({
      id: 'execution-create-1',
      requiresApproval: false,
      createdBy: 'user-1',
    });
    prisma.executionEvent.create.mockResolvedValue(undefined);

    await service.create(
      'user-1',
      {
        skillId: 'skill-browser-1',
        runtimeType: 'browser',
        input: {
          startUrl: 'http://example.test/login',
          username: 'tester',
        },
        planDraft: providedPlanDraft as any,
      },
      {
        authToken: 'Bearer token-1',
      }
    );

    const normalizedInput = prisma.execution.create.mock.calls[0][0].data
      .normalizedInputJson as Record<string, unknown>;
    const rewrittenSteps = normalizedInput.planSteps as Array<Record<string, unknown>>;
    expect(rewrittenSteps).toHaveLength(3);
    expect(rewrittenSteps[0]).toEqual(
      expect.objectContaining({
        title: '1. 页面打开',
        phase_type: 'workflow_activity',
      })
    );
    expect(rewrittenSteps[0].commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'goto',
          input: expect.objectContaining({
            target: 'http://example.test/login',
            args: expect.objectContaining({
              url: 'http://example.test/login',
            }),
          }),
        }),
        expect.objectContaining({
          action: 'fill',
          input: expect.objectContaining({
            target: 'textbox[name="Enter username"]',
            args: expect.objectContaining({
              selector: 'textbox[name="Enter username"]',
              value: 'tester',
            }),
          }),
        }),
      ])
    );
    expect(rewrittenSteps[2]).toEqual(
      expect.objectContaining({
        title: '3. 页面迁移',
        commands: [
          expect.objectContaining({
            action: 'wait',
            input: expect.objectContaining({
              target: 'menuitem[name="Executions"]',
              args: expect.objectContaining({
                selector: 'menuitem[name="Executions"]',
                duration: 15000,
              }),
            }),
          }),
        ],
      })
    );
  });

  it('keeps browser recording skills with loop draft as a direct skill execution during create', async () => {
    const { service, prisma } = createService();

    const providedPlanDraft = {
      plan_id: 'plan-browser-loop-1',
      planner_mode: 'skill',
      objective: '登录并进入审批页面',
      summary: '已识别浏览器技能',
      skill_match: {
        skill_id: 'skill-browser-loop-1',
        skill_name: '登录并进入承认页面',
        confidence: 1,
      },
      steps: [
        {
          id: 'raw-step-1',
          title: '1. navigate',
          description: '执行 1. navigate 步骤。',
          kind: 'tool',
          status: 'planned',
          tool_name: '1. navigate',
        },
      ],
      required_inputs: [
        {
          name: 'username',
          type: 'string',
          required: true,
          value: 'tester',
          missing: false,
          source: 'user_input',
        },
      ],
      risk_summary: {
        level: 'low',
        requires_human_review: false,
        items: ['no_material_risk_detected'],
      },
    };

    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        source_type: 'browser_recording',
        source_payload_json: {
          apiEndpoints: {
            runtimeMetadata: {
              executionPlan: {
                loopDraft: {
                  mode: 'repeat_until',
                },
              },
            },
          },
        },
      },
    ]);
    prisma.execution.create.mockResolvedValue({
      id: 'execution-create-loop-1',
      requiresApproval: false,
      createdBy: 'user-1',
    });
    prisma.executionEvent.create.mockResolvedValue(undefined);

    await service.create(
      'user-1',
      {
        skillId: 'skill-browser-loop-1',
        runtimeType: 'browser',
        input: {
          username: 'tester',
        },
        planDraft: providedPlanDraft as any,
      },
      {
        authToken: 'Bearer token-1',
      }
    );

    const normalizedInput = prisma.execution.create.mock.calls[0][0].data
      .normalizedInputJson as Record<string, unknown>;
    const rewrittenSteps = normalizedInput.planSteps as Array<Record<string, unknown>>;
    expect(rewrittenSteps).toHaveLength(1);
    expect(rewrittenSteps[0]).toEqual(
      expect.objectContaining({
        id: 'execute_selected_skill',
        kind: 'skill',
        status: 'planned',
      })
    );
    expect(rewrittenSteps[0].phase_type).toBeUndefined();
    expect((normalizedInput.capabilityMatch as Record<string, unknown>).capabilityId).toBe(
      'skill-browser-loop-1'
    );
    expect(normalizedInput.runtimeSourceType).toBe('browser_recording');
  });

  it('applies runtime defaults after planning so browser steps can execute without treating defaults as user input', async () => {
    const { service, prisma, planningService } = createService();

    const providedPlanDraft = {
      plan_id: 'plan-browser-defaults-1',
      planner_mode: 'skill',
      objective: '登录主页',
      summary: '仍缺少 3 个关键输入。',
      skill_match: {
        skill_id: 'skill-browser-1',
        skill_name: '登录并进入登录',
        confidence: 1,
      },
      steps: [
        {
          id: 'collect-required-inputs',
          title: 'Collect required inputs',
          description: '补齐必填参数: startUrl, username, loginCredential',
          kind: 'human_input',
          status: 'planned',
        },
      ],
      required_inputs: [
        {
          name: 'startUrl',
          type: 'string',
          required: true,
          missing: true,
          source: 'unresolved',
          description: '起始页面地址',
          render_path: 'document.startUrl',
        },
        {
          name: 'username',
          type: 'string',
          required: true,
          missing: true,
          source: 'unresolved',
          description: '登录用户名',
          template_binding: 'account.username',
        },
        {
          name: 'loginCredential',
          type: 'string',
          required: true,
          missing: true,
          source: 'unresolved',
          description: '登录密码',
        },
      ],
      risk_summary: {
        level: 'medium',
        requires_human_review: false,
        items: ['missing_required_inputs'],
      },
    };

    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        source_type: 'browser_recording',
        source_payload_json: {},
        workflow_dsl: {
          steps: [
            {
              id: 'activity_open',
              name: '1. 页面打开',
              type: 'activity',
              activityRef: 'custom:browser_open',
              activityName: '1. 页面打开',
            },
          ],
        },
        activity_dsl: {
          activities: [
            {
              fn: 'browser_open',
              name: '1. 页面打开',
              handler: 'browser',
              config: {
                steps: [
                  {
                    name: '1. navigate',
                    type: 'browser',
                    config: {
                      action: 'navigate',
                      url: '${startUrl}',
                    },
                  },
                  {
                    name: '2. fill username',
                    type: 'browser',
                    config: {
                      action: 'fill',
                      selector: 'textbox[name="Enter username"]',
                      value: '${username}',
                    },
                  },
                  {
                    name: '3. fill password',
                    type: 'browser',
                    config: {
                      action: 'fill',
                      selector: 'textbox[name="Enter password"]',
                      value: '${loginCredential}',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ]);
    planningService.fetchSkillDefaultResolution.mockResolvedValue({
      input: {
        startUrl: 'http://example.test/login',
        username: 'tester',
        loginCredential: 'secret',
      },
      sources: {
        startUrl: 'default',
        username: 'default',
        loginCredential: 'workflow_default',
      },
    });
    prisma.execution.create.mockResolvedValue({
      id: 'execution-create-1',
      requiresApproval: false,
      createdBy: 'user-1',
    });
    prisma.executionEvent.create.mockResolvedValue(undefined);

    await service.create(
      'user-1',
      {
        skillId: 'skill-browser-1',
        runtimeType: 'browser',
        input: {
          prompt: '登录主页',
        },
        planDraft: providedPlanDraft as any,
      },
      {
        authToken: 'Bearer token-1',
      }
    );

    const normalizedInput = prisma.execution.create.mock.calls[0][0].data
      .normalizedInputJson as Record<string, unknown>;
    expect(normalizedInput.input).toEqual({
      prompt: '登录主页',
      startUrl: 'http://example.test/login',
      username: 'tester',
      loginCredential: 'secret',
    });
    expect(normalizedInput.paramResolution).toEqual({
      startUrl: expect.objectContaining({
        value: 'http://example.test/login',
        source: 'default',
        missing: false,
        final: true,
        render_path: 'document.startUrl',
      }),
      username: expect.objectContaining({
        value: 'tester',
        source: 'default',
        missing: false,
        final: true,
        template_binding: 'account.username',
      }),
      loginCredential: expect.objectContaining({
        value: 'secret',
        source: 'workflow_default',
        missing: false,
        final: true,
      }),
    });
    expect(normalizedInput.requiredInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'startUrl',
          value: 'http://example.test/login',
          missing: false,
          source: 'default',
        }),
        expect.objectContaining({
          name: 'username',
          value: 'tester',
          missing: false,
          source: 'default',
        }),
        expect.objectContaining({
          name: 'loginCredential',
          value: 'secret',
          missing: false,
          source: 'workflow_default',
        }),
      ])
    );
    expect(normalizedInput.planSteps).toEqual([
      expect.objectContaining({
        commands: expect.arrayContaining([
          expect.objectContaining({
            action: 'goto',
            input: expect.objectContaining({
              target: 'http://example.test/login',
              args: expect.objectContaining({
                url: 'http://example.test/login',
              }),
            }),
          }),
          expect.objectContaining({
            action: 'fill',
            input: expect.objectContaining({
              args: expect.objectContaining({
                value: 'tester',
              }),
            }),
          }),
          expect.objectContaining({
            action: 'fill',
            input: expect.objectContaining({
              args: expect.objectContaining({
                value: 'secret',
              }),
            }),
          }),
        ]),
      }),
    ]);
    expect((service as any).executionStartService.startExecution).toHaveBeenCalledWith(
      'execution-create-1',
      expect.any(Object)
    );
  });

  it('keeps confirmation-required defaults in waiting_input instead of auto-starting execution', async () => {
    const { service, prisma, planningService } = createService();

    const providedPlanDraft = {
      plan_id: 'plan-browser-confirmation-1',
      planner_mode: 'skill',
      objective: '登录主页',
      summary: '仍缺少 1 个关键输入。',
      skill_match: {
        skill_id: 'skill-browser-1',
        skill_name: '登录并进入登录',
        confidence: 1,
      },
      steps: [
        {
          id: 'collect-required-inputs',
          title: 'Collect required inputs',
          description: '补齐必填参数: loginCredential',
          kind: 'human_input',
          status: 'planned',
        },
      ],
      required_inputs: [
        {
          name: 'loginCredential',
          type: 'string',
          required: true,
          missing: true,
          source: 'unresolved',
          value: 'test123',
          needs_confirmation: true,
          missing_reason: 'overall_low_confidence',
          description: '登录密码',
        },
      ],
      risk_summary: {
        level: 'medium',
        requires_human_review: false,
        items: ['missing_required_inputs'],
      },
    };

    planningService.fetchSkillDefaultResolution.mockResolvedValue({
      input: {
        loginCredential: 'test123',
      },
      sources: {
        loginCredential: 'workflow_default',
      },
    });
    prisma.execution.create.mockResolvedValue({
      id: 'execution-create-confirmation',
      requiresApproval: false,
      createdBy: 'user-1',
    });
    prisma.executionEvent.create.mockResolvedValue(undefined);
    prisma.executionStep.findFirst.mockResolvedValue({
      id: 'step-waiting-input',
      executionId: 'execution-create-confirmation',
      type: 'input_collection',
      status: 'pending',
    });
    const serviceInternals = service as any;
    jest
      .spyOn(serviceInternals.executionFailureService, 'enterWaitingInput')
      .mockResolvedValue(undefined);

    await service.create(
      'user-1',
      {
        skillId: 'skill-browser-1',
        runtimeType: 'browser',
        input: {
          prompt: '登录主页',
        },
        planDraft: providedPlanDraft as any,
      },
      {
        authToken: 'Bearer token-1',
      }
    );

    const normalizedInput = prisma.execution.create.mock.calls[0][0].data
      .normalizedInputJson as Record<string, unknown>;
    expect(normalizedInput.input).toEqual({
      prompt: '登录主页',
    });
    expect(normalizedInput.paramResolution).toEqual({
      loginCredential: expect.objectContaining({
        value: 'test123',
        source: 'workflow_default',
        missing: true,
        needsConfirmation: true,
        final: false,
      }),
    });
    expect(normalizedInput.requiredInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'loginCredential',
          value: 'test123',
          source: 'workflow_default',
          missing: true,
          needs_confirmation: true,
          missing_reason: 'overall_low_confidence',
        }),
      ])
    );
    expect((service as any).executionFailureService.enterWaitingInput).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'execution-create-confirmation' }),
      'step-waiting-input',
      expect.objectContaining({
        emitEvent: expect.any(Function),
        updateStatus: expect.any(Function),
        closeRuntimeSessionQuietly: expect.any(Function),
      })
    );
    expect((service as any).executionStartService.startExecution).not.toHaveBeenCalled();
  });

  it('treats explicit user input as confirmation and clears confirmation gating during create', async () => {
    const { service, prisma, planningService } = createService();

    const providedPlanDraft = {
      plan_id: 'plan-browser-confirmation-2',
      planner_mode: 'skill',
      objective: '登录主页',
      summary: '仍缺少 1 个关键输入。',
      skill_match: {
        skill_id: 'skill-browser-1',
        skill_name: '登录并进入登录',
        confidence: 1,
      },
      steps: [
        {
          id: 'collect-required-inputs',
          title: 'Collect required inputs',
          description: '补齐必填参数: loginCredential',
          kind: 'human_input',
          status: 'planned',
        },
      ],
      required_inputs: [
        {
          name: 'loginCredential',
          type: 'string',
          required: true,
          missing: true,
          source: 'unresolved',
          value: 'test123',
          needs_confirmation: true,
          missing_reason: 'overall_low_confidence',
          description: '登录密码',
        },
      ],
      risk_summary: {
        level: 'medium',
        requires_human_review: false,
        items: ['missing_required_inputs'],
      },
    };

    planningService.fetchSkillDefaultResolution.mockResolvedValue({
      input: {
        loginCredential: 'test123',
      },
      sources: {
        loginCredential: 'workflow_default',
      },
    });
    prisma.execution.create.mockResolvedValue({
      id: 'execution-create-confirmed',
      requiresApproval: false,
      createdBy: 'user-1',
    });
    prisma.executionEvent.create.mockResolvedValue(undefined);

    await service.create(
      'user-1',
      {
        skillId: 'skill-browser-1',
        runtimeType: 'browser',
        input: {
          loginCredential: 'test1234',
        },
        planDraft: providedPlanDraft as any,
      },
      {
        authToken: 'Bearer token-1',
      }
    );

    const normalizedInput = prisma.execution.create.mock.calls[0][0].data
      .normalizedInputJson as Record<string, unknown>;
    expect(normalizedInput.paramResolution).toEqual({
      loginCredential: expect.objectContaining({
        value: 'test1234',
        source: 'user_input',
        missing: false,
        needsConfirmation: false,
        final: true,
      }),
    });
    expect(normalizedInput.requiredInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'loginCredential',
          value: 'test1234',
          source: 'user_input',
          missing: false,
          needs_confirmation: false,
        }),
      ])
    );
    expect((service as any).executionStartService.startExecution).toHaveBeenCalledWith(
      'execution-create-confirmed',
      expect.any(Object)
    );
  });

  it('resolves browser template placeholders written as brace variants', async () => {
    const { service, prisma, planningService } = createService();

    const providedPlanDraft = {
      plan_id: 'plan-browser-placeholder-variants-1',
      planner_mode: 'skill',
      objective: '登录主页',
      summary: '仍缺少 3 个关键输入。',
      skill_match: {
        skill_id: 'skill-browser-1',
        skill_name: '登录并进入登录',
        confidence: 1,
      },
      steps: [
        {
          id: 'collect-required-inputs',
          title: 'Collect required inputs',
          description: '补齐必填参数: startUrl, username, loginCredential',
          kind: 'human_input',
          status: 'planned',
        },
      ],
      required_inputs: [
        {
          name: 'startUrl',
          type: 'string',
          required: true,
          missing: true,
          source: 'unresolved',
          description: '起始页面地址',
        },
        {
          name: 'username',
          type: 'string',
          required: true,
          missing: true,
          source: 'unresolved',
          description: '登录用户名',
        },
        {
          name: 'loginCredential',
          type: 'string',
          required: true,
          missing: true,
          source: 'unresolved',
          description: '登录密码',
        },
      ],
      risk_summary: {
        level: 'medium',
        requires_human_review: false,
        items: ['missing_required_inputs'],
      },
    };

    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        source_type: 'browser_recording',
        source_payload_json: {},
        workflow_dsl: {
          steps: [
            {
              id: 'activity_open',
              name: '1. 页面打开',
              type: 'activity',
              activityRef: 'custom:browser_open',
              activityName: '1. 页面打开',
            },
          ],
        },
        activity_dsl: {
          activities: [
            {
              fn: 'browser_open',
              name: '1. 页面打开',
              handler: 'browser',
              config: {
                steps: [
                  {
                    name: '1. navigate',
                    type: 'browser',
                    config: {
                      action: 'navigate',
                      url: '{startUrl}',
                    },
                  },
                  {
                    name: '2. fill username',
                    type: 'browser',
                    config: {
                      action: 'fill',
                      selector: 'textbox[name="Enter username"]',
                      value: '{username}',
                    },
                  },
                  {
                    name: '3. fill password',
                    type: 'browser',
                    config: {
                      action: 'fill',
                      selector: 'textbox[name="Enter password"]',
                      value: '{{loginCredential}}',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ]);
    planningService.fetchSkillDefaultResolution.mockResolvedValue({
      input: {
        startUrl: 'http://example.test/login',
        username: 'tester',
        loginCredential: 'secret',
      },
      sources: {
        startUrl: 'default',
        username: 'default',
        loginCredential: 'workflow_default',
      },
    });
    prisma.execution.create.mockResolvedValue({
      id: 'execution-create-2',
      requiresApproval: false,
      createdBy: 'user-1',
    });
    prisma.executionEvent.create.mockResolvedValue(undefined);

    await service.create(
      'user-1',
      {
        skillId: 'skill-browser-1',
        runtimeType: 'browser',
        input: {
          prompt: '登录主页',
        },
        planDraft: providedPlanDraft as any,
      },
      {
        authToken: 'Bearer token-1',
      }
    );

    const normalizedInput = prisma.execution.create.mock.calls[0][0].data
      .normalizedInputJson as Record<string, unknown>;
    expect(normalizedInput.planSteps).toEqual([
      expect.objectContaining({
        commands: expect.arrayContaining([
          expect.objectContaining({
            action: 'goto',
            input: expect.objectContaining({
              target: 'http://example.test/login',
              args: expect.objectContaining({
                url: 'http://example.test/login',
              }),
            }),
          }),
          expect.objectContaining({
            action: 'fill',
            input: expect.objectContaining({
              args: expect.objectContaining({
                value: 'tester',
              }),
            }),
          }),
          expect.objectContaining({
            action: 'fill',
            input: expect.objectContaining({
              args: expect.objectContaining({
                value: 'secret',
              }),
            }),
          }),
        ]),
      }),
    ]);
  });

  it('reuses existing execution when the same idempotencyKey is provided', async () => {
    const { service, prisma, planningService } = createService();

    const existingExecution = {
      id: 'execution-existing-1',
      createdBy: 'user-1',
      skillId: 'skill-1',
      status: 'succeeded',
    };

    prisma.$queryRawUnsafe.mockResolvedValue([{ execution_id: 'execution-existing-1' }]);
    jest.spyOn(service, 'getById').mockResolvedValue(existingExecution as never);

    const response = await service.create(
      'user-1',
      {
        skillId: 'skill-1',
        runtimeType: 'workflow',
        input: { prompt: '上海的天气' },
        idempotencyKey: 'full-smoke-fixed-key',
      },
      {
        authToken: 'Bearer token-1',
      }
    );

    expect(prisma.execution.create).not.toHaveBeenCalled();
    expect(planningService.generatePlanDraft).not.toHaveBeenCalled();
    expect(response).toBe(existingExecution);
  });
});
