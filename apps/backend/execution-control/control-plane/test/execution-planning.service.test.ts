import axios from 'axios';
import { ExecutionInputResolutionService } from '../src/modules/execution/human-control/execution-input-resolution.service';
import { ExecutionPlanNormalizationService } from '../src/modules/execution/step-runner/planning/execution-plan-normalization.service';
import { ExecutionPlanningService } from '../src/modules/execution/step-runner/planning/execution-planning.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ExecutionPlanningService', () => {
  const previousFlag = process.env.BROWSER_LOOP_WORKFLOW_ENABLED;
  const createService = (prisma?: Record<string, unknown>) =>
    new ExecutionPlanningService(
      (prisma || {}) as never,
      new ExecutionPlanNormalizationService(new ExecutionInputResolutionService())
    );

  afterEach(() => {
    mockedAxios.get.mockReset();
    if (previousFlag === undefined) {
      delete process.env.BROWSER_LOOP_WORKFLOW_ENABLED;
    } else {
      process.env.BROWSER_LOOP_WORKFLOW_ENABLED = previousFlag;
    }
  });

  it('merges defaults from skill schema and linked flow template schemas', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          paramsSchema: {
            properties: {
              prompt: { type: 'string' },
              username: { type: 'string', default: 'skill-user' },
            },
          },
          executionFlowTemplateIds: ['flow-1'],
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          paramsSchema: {
            properties: {
              username: { type: 'string', default: 'flow-user' },
              loginCredential: { type: 'string', default: 'secret' },
              retryCount: { type: 'number', default: 3 },
            },
          },
        },
      } as never);

    const service = createService();

    await expect(service.fetchSkillDefaultResolution('skill-1', 'Bearer token-1')).resolves.toEqual({
      input: {
        username: 'flow-user',
        loginCredential: 'secret',
        retryCount: 3,
      },
      sources: {
        username: 'default',
        loginCredential: 'default',
        retryCount: 'default',
      },
    });
    expect(mockedAxios.get).toHaveBeenNthCalledWith(1, expect.stringContaining('/skills/skill-1'), {
      headers: { Authorization: 'Bearer token-1' },
      timeout: 10000,
    });
    expect(mockedAxios.get).toHaveBeenNthCalledWith(2, expect.stringContaining('/flows/flow-1'), {
      headers: { Authorization: 'Bearer token-1' },
      timeout: 10000,
    });
  });

  it('uses internal auth headers when no bearer token is available', async () => {
    const originalInternalSecret = process.env.INTERNAL_API_SHARED_SECRET;
    process.env.INTERNAL_API_SHARED_SECRET = 'internal-secret';
    mockedAxios.get.mockResolvedValue({
      data: {
        paramsSchema: {
          properties: {
            startUrl: { type: 'string', default: 'http://example.test/login' },
          },
        },
        executionFlowTemplateIds: [],
      },
    } as never);

    try {
      const service = createService();

      await expect(
        service.fetchSkillDefaultResolution('skill-1', undefined, {
          id: 'user-1',
          role: 'admin',
        })
      ).resolves.toEqual({
        input: {
          startUrl: 'http://example.test/login',
        },
        sources: {
          startUrl: 'default',
        },
      });
      expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('/skills/skill-1'), {
        headers: {
          'X-Internal-Auth': 'internal-secret',
          'X-User-Id': 'user-1',
          'X-User-Role': 'admin',
        },
        timeout: 10000,
      });
    } finally {
      if (originalInternalSecret === undefined) {
        delete process.env.INTERNAL_API_SHARED_SECRET;
      } else {
        process.env.INTERNAL_API_SHARED_SECRET = originalInternalSecret;
      }
    }
  });

  it('distinguishes workflow policy defaults from schema defaults', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          paramsSchema: {
            properties: {
              username: { type: 'string', default: 'skill-user' },
            },
          },
          executionFlowTemplateIds: ['flow-1'],
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          paramsSchema: {
            properties: {
              username: { type: 'string', default: 'flow-user' },
              loginCredential: { type: 'string', default: 'schema-secret' },
            },
          },
          inputPolicy: {
            params: {
              loginCredential: {
                defaultValue: 'policy-secret',
              },
            },
          },
        },
      } as never);

    const service = createService();

    await expect(service.fetchSkillDefaultResolution('skill-1', 'Bearer token-1')).resolves.toEqual({
      input: {
        username: 'flow-user',
        loginCredential: 'policy-secret',
      },
      sources: {
        username: 'default',
        loginCredential: 'workflow_default',
      },
    });
  });

  it('rewrites browser recording skills with loop draft into browser_loop_workflow mode when enabled', async () => {
    process.env.BROWSER_LOOP_WORKFLOW_ENABLED = 'true';

    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          source_type: 'browser_recording',
          source_payload_json: {
            apiEndpoints: {
              runtimeMetadata: {
                executionPlan: {
                  loopDraft: {
                    mode: 'repeat_until',
                    eachIteration: {
                      stepIds: ['step_2', 'step_3'],
                      stepCount: 2,
                    },
                  },
                  templateSteps: [
                    {
                      step_id: 'step_1',
                      action: 'navigate',
                      params: {
                        url: 'https://example.test/approvals',
                      },
                      description: '打开审批页',
                    },
                    {
                      step_id: 'step_2',
                      action: 'click',
                      locator: {
                        type: 'css',
                        value: '[data-testid="approve"]',
                      },
                      description: '点击审批',
                    },
                    {
                      step_id: 'step_3',
                      action: 'read_page',
                      locator: {
                        type: 'css',
                        value: '[data-testid="status"]',
                      },
                      description: '读取状态',
                    },
                  ],
                },
              },
            },
          },
        },
      ]),
    };

    const service = createService(prisma);

    const result = await service.rewriteBrowserRecordingPlanDraftWithActivities(
      {
        plan_id: 'plan-browser-loop-1',
        planner_mode: 'skill',
        objective: '批量审批',
        summary: '浏览器录制技能',
        skill_match: {
          skill_id: 'skill-browser-loop-1',
          skill_name: '批量审批技能',
          confidence: 1,
        },
        steps: [],
        required_inputs: [],
        risk_summary: {
          level: 'low',
          requires_human_review: false,
          items: ['no_material_risk_detected'],
        },
      },
      'skill-browser-loop-1',
      {
        username: 'tester',
      },
      {}
    );

    expect(result).toEqual(
      expect.objectContaining({
        planner_mode: 'browser_loop_workflow',
        runtime_source_type: 'browser_recording',
        loop_workflow: expect.objectContaining({
          iterationStepIds: ['step_2', 'step_3'],
        }),
      })
    );
    expect(result?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'loop_init',
          kind: 'control',
        }),
        expect.objectContaining({
          id: 'iteration_step_2',
          kind: 'tool',
          loop_segment: 'iteration',
        }),
      ])
    );
    expect(String(prisma.$queryRawUnsafe.mock.calls[0]?.[0] || '')).toContain(
      'CASE WHEN cr.archived_at IS NULL THEN 0 ELSE 1 END'
    );
    expect(String(prisma.$queryRawUnsafe.mock.calls[0]?.[0] || '')).not.toContain(
      'AND cr.archived_at IS NULL'
    );
  });
});
