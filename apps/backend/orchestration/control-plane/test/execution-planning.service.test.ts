import { ExecutionInputResolutionService } from '../src/modules/execution/execution-input-resolution.service';
import { ExecutionPlanNormalizationService } from '../src/modules/execution/execution-plan-normalization.service';
import { ExecutionPlanningService } from '../src/modules/execution/execution-planning.service';

describe('ExecutionPlanningService', () => {
  const previousFlag = process.env.BROWSER_LOOP_WORKFLOW_ENABLED;

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.BROWSER_LOOP_WORKFLOW_ENABLED;
    } else {
      process.env.BROWSER_LOOP_WORKFLOW_ENABLED = previousFlag;
    }
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

    const normalizationService = new ExecutionPlanNormalizationService(
      new ExecutionInputResolutionService()
    );
    const service = new ExecutionPlanningService(prisma as never, normalizationService);

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
