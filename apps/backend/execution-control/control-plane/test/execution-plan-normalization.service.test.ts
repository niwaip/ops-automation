import { ExecutionInputResolutionService } from '../src/modules/execution/human-control/execution-input-resolution.service';
import { ExecutionPlanNormalizationService } from '../src/modules/execution/step-runner/planning/execution-plan-normalization.service';

describe('ExecutionPlanNormalizationService', () => {
  const createService = () =>
    new ExecutionPlanNormalizationService(new ExecutionInputResolutionService());

  it('keeps confirmation-required defaults in a blocking state when they come from workflow defaults', () => {
    const service = createService();

    const result = service.applyRuntimeDefaultsToPlanDraft(
      {
        plan_id: 'plan-1',
        planner_mode: 'skill',
        objective: 'login',
        summary: 'need login credential',
        steps: [
          {
            id: 'step-human',
            title: 'Provide credential',
            description: '补充必填参数: loginCredential',
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
            needs_confirmation: true,
            source: 'unresolved',
          },
        ],
        risk_summary: {
          level: 'medium',
          requires_human_review: false,
          items: ['missing_required_inputs'],
        },
      } as any,
      {
        loginCredential: 'secret-from-policy',
      },
      {
        loginCredential: 'workflow_default',
      }
    );

    expect(result).toEqual(
      expect.objectContaining({
        required_inputs: [
          expect.objectContaining({
            name: 'loginCredential',
            value: 'secret-from-policy',
            source: 'workflow_default',
            missing: true,
            needs_confirmation: true,
          }),
        ],
        steps: [
          expect.objectContaining({
            kind: 'human_input',
            description: '补齐必填参数: loginCredential',
          }),
        ],
      })
    );
  });

  it('builds runtime default resolution from skill schema and template workflow policy', () => {
    const service = createService();

    expect(
      service.buildRuntimeDefaultResolution(
        {
          paramsSchema: {
            properties: {
              username: { type: 'string', default: 'skill-user' },
              retryCount: { type: 'number', default: 1 },
            },
          },
        },
        [
          {
            paramsSchema: {
              properties: {
                username: { type: 'string', default: 'template-user' },
                password: { type: 'string', default: 'schema-secret' },
              },
            },
            inputPolicy: {
              params: {
                password: { defaultValue: 'policy-secret' },
              },
            },
          },
        ]
      )
    ).toEqual({
      input: {
        username: 'template-user',
        retryCount: 1,
        password: 'policy-secret',
      },
      sources: {
        username: 'default',
        retryCount: 'default',
        password: 'workflow_default',
      },
    });
  });

  it('builds planner user input from prompt-like fields and falls back to structured payload', () => {
    const service = createService();

    expect(
      service.buildPlannerUserInput({
        skillId: 'skill-1',
        runtimeType: 'workflow',
        input: {
          goal: '  summarize the document  ',
        },
      } as any)
    ).toBe('summarize the document');

    expect(
      service.buildPlannerUserInput({
        skillId: 'skill-2',
        runtimeType: 'sandbox',
        input: {
          structured: true,
        },
      } as any)
    ).toBe(
      JSON.stringify({
        skillId: 'skill-2',
        runtimeType: 'custom',
        input: {
          structured: true,
        },
      })
    );
  });

  it('builds normalized input from planner values, runtime defaults, and passthrough fields', () => {
    const service = createService();

    const normalizedInput = service.buildNormalizedInput(
      {
        skillId: 'skill-1',
        input: {
          __promptDebug: {
            traceId: 'trace-1',
          },
          freeform: 'keep-me',
          username: 'user-supplied-but-tracked',
        },
      } as any,
      {
        plan_id: 'plan-2',
        planner_mode: 'skill',
        objective: 'sign in',
        summary: 'browser login plan',
        skill_match: {
          skill_id: 'skill-1',
          skill_name: 'Login Skill',
          confidence: 0.95,
          match_reason: 'exact',
        },
        steps: [
          {
            id: 'step-1',
            title: 'login',
            description: 'perform login',
            kind: 'skill',
            status: 'planned',
          },
        ],
        required_inputs: [
          {
            name: 'username',
            type: 'string',
            required: true,
            missing: false,
            source: 'planner',
            value: 'planner-user',
          },
          {
            name: 'url',
            type: 'string',
            required: true,
            missing: false,
            source: 'default',
            value: 'https://example.test/login',
          },
        ],
        risk_summary: {
          level: 'low',
          requires_human_review: false,
          items: ['no_material_risk_detected'],
        },
      } as any,
      {
        region: 'cn',
      },
      {
        region: 'default',
      },
      () => 'fallback objective'
    );

    expect(normalizedInput).toEqual(
      expect.objectContaining({
        objective: 'sign in',
        plannerMode: 'skill',
        plannerSummary: 'browser login plan',
        input: {
          region: 'cn',
          freeform: 'keep-me',
          username: 'planner-user',
          url: 'https://example.test/login',
        },
        runtimeDefaultSources: {
          region: 'default',
        },
        url: 'https://example.test/login',
        promptDebug: {
          traceId: 'trace-1',
        },
        capabilityMatch: {
          capabilityId: 'skill-1',
          capabilityName: 'Login Skill',
          confidence: 0.95,
          matchReason: 'exact',
        },
      })
    );
  });

  it('builds a browser loop workflow plan draft from loop draft and template steps', () => {
    const service = createService();

    const result = service.buildBrowserLoopWorkflowPlanDraftFromExisting({
      planDraft: {
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
      } as any,
      resolvedSkillId: 'skill-browser-loop-1',
      resolvedInput: {
        username: 'tester',
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
        {
          step_id: 'step_4',
          action: 'click',
          locator: {
            type: 'css',
            value: '[data-testid="done"]',
          },
          description: '完成收尾',
        },
      ],
      loopDraft: {
        mode: 'repeat_until',
        eachIteration: {
          stepIds: ['step_2', 'step_3'],
          stepCount: 2,
        },
        stopWhen: {
          read: {
            type: 'text',
            locator: {
              type: 'css',
              value: '[data-testid="status"]',
            },
          },
          conditionFn: 'value === "无待审批"',
          description: '没有待审批时结束',
        },
        maxIterations: 20,
      },
      runtimeSourceType: 'browser_recording',
    });

    expect(result).toEqual(
      expect.objectContaining({
        planner_mode: 'browser_loop_workflow',
        runtime_source_type: 'browser_recording',
        loop_workflow: expect.objectContaining({
          mode: 'repeat_until',
          preLoopStepIds: ['step_1'],
          iterationStepIds: ['step_2', 'step_3'],
          postLoopStepIds: ['step_4'],
          maxIterations: 20,
        }),
      })
    );
    expect(result.steps.map((step: any) => step.id)).toEqual([
      'pre_loop_step_1',
      'loop_init',
      'iteration_step_2',
      'iteration_step_3',
      'loop_eval_after_iteration',
      'post_loop_step_4',
    ]);
    expect(result.steps[0]).toEqual(
      expect.objectContaining({
        kind: 'tool',
        phase_type: 'workflow_activity',
        loop_segment: 'pre_loop',
      })
    );
    expect(result.steps[1]).toEqual(
      expect.objectContaining({
        kind: 'control',
        tool_name: 'loop_control',
        loop_control_action: 'loop_init',
      })
    );
  });

  it('rewrites legacy gross margin threshold text in browser loop step metadata', () => {
    const service = createService();

    const result = service.buildBrowserLoopWorkflowPlanDraftFromExisting({
      planDraft: {
        plan_id: 'plan-browser-loop-threshold-1',
        planner_mode: 'skill',
        objective: '审批案件',
        summary: '浏览器录制技能',
        skill_match: {
          skill_id: 'skill-browser-loop-threshold-1',
          skill_name: '案件粗利率条件审批',
          confidence: 1,
        },
        steps: [],
        required_inputs: [],
        risk_summary: {
          level: 'low',
          requires_human_review: false,
          items: ['no_material_risk_detected'],
        },
      } as any,
      resolvedSkillId: 'skill-browser-loop-threshold-1',
      resolvedInput: {
        grossMarginThreshold: '15',
      },
      templateSteps: [
        {
          step_id: 'step_1',
          action: 'branch',
          description: '读取页面中的案件粗利率，超过20%则继续执行承认操作',
          branch: {
            condition_fn: '(ctx) => Number(ctx.grossMargin || 0) >= Number(ctx.grossMarginThreshold)',
            on_match: 'continue',
            on_mismatch: 'takeover',
            takeover_reason: '案件粗利率未达到20%自动化承认标准，需要人工介入审查后再承认',
            description: '读取页面中的案件粗利率，超过20%则继续执行承认操作',
          },
        },
      ],
      loopDraft: {
        mode: 'repeat_until',
        eachIteration: {
          stepIds: ['step_1'],
          stepCount: 1,
        },
        stopWhen: {
          read: {
            type: 'text',
            locator: {
              type: 'css',
              value: '[data-testid="empty-state"]',
            },
          },
          conditionFn: 'value === "无待处理案件"',
          description: '没有待处理案件时结束',
        },
        maxIterations: 10,
      },
      runtimeSourceType: 'browser_recording',
    });

    const iterationStep = result.steps.find((step: any) => step.id === 'iteration_step_1');
    expect(iterationStep).toEqual(
      expect.objectContaining({
        title: '读取页面中的案件粗利率，超过15%则继续执行承认操作',
      })
    );
    expect(iterationStep?.commands).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          stepName: expect.stringContaining('读取页面中的案件粗利率，超过15%则继续执行承认操作'),
          branch: expect.objectContaining({
            description: '读取页面中的案件粗利率，超过15%则继续执行承认操作',
            takeoverReason: '案件粗利率未达到15%自动化承认标准，需要人工介入审查后再承认',
          }),
        }),
      }),
    ]);
  });

  it('reconciles semantic grouped missing fields and adds uncovered required fields', () => {
    const service = createService();

    const semantic = service.reconcilePlanSemantic(
      {
        enabled: true,
        mode: 'field_level',
        previewReady: false,
        finalReady: false,
        fallbackToFieldLevel: false,
        groupedMissing: [
          {
            key: 'company_name_zh',
            label: '公司名称（中文）',
            kind: 'field',
            blocking: true,
            required: true,
            fieldNames: ['company_name_zh'],
            missingFieldNames: ['company_name_zh'],
          },
          {
            key: 'lineItems',
            label: '费用明细',
            kind: 'array_group',
            blocking: false,
            required: true,
            fieldNames: [],
            missingFieldNames: [],
          },
        ],
        complexity: {
          category: 'simple',
          totalFields: 3,
          requiredFields: 0,
          missingFields: 0,
          arrayGroups: 1,
          reasonCodes: [],
        },
      },
      [
        {
          name: 'company_name_zh',
          type: 'string',
          required: true,
          missing: true,
          source: 'unresolved',
          description: '公司名称（中文）',
        },
        {
          name: 'lineItems[].amount',
          type: 'number',
          required: true,
          missing: true,
          source: 'unresolved',
          description: '金额',
        },
        {
          name: 'invoice_date',
          type: 'date',
          required: true,
          missing: true,
          source: 'unresolved',
          description: '开票日期',
        },
      ]
    );

    expect(semantic).toEqual(
      expect.objectContaining({
        previewReady: false,
        finalReady: false,
        summary: '仍缺少 2 个必填参数。',
        complexity: expect.objectContaining({
          requiredFields: 3,
          missingFields: 3,
        }),
        groupedMissing: expect.arrayContaining([
          expect.objectContaining({
            key: 'company_name',
            label: '公司名称',
            missingFieldNames: ['company_name_zh'],
          }),
          expect.objectContaining({
            key: 'lineItems',
            kind: 'array_group',
            missingFieldNames: ['lineItems[].amount'],
          }),
          expect.objectContaining({
            key: 'invoice_date',
            kind: 'field',
            missingFieldNames: ['invoice_date'],
            description: '请补充 开票日期',
          }),
        ]),
      })
    );
  });

  it('maps planner risk levels to execution risk levels', () => {
    const service = createService();

    expect(service.mapPlannerRiskLevel(undefined as any)).toBe('L0');
    expect(
      service.mapPlannerRiskLevel({
        risk_summary: {
          level: 'low',
        },
      } as any)
    ).toBe('L0');
    expect(
      service.mapPlannerRiskLevel({
        risk_summary: {
          level: 'medium',
        },
      } as any)
    ).toBe('L1');
    expect(
      service.mapPlannerRiskLevel({
        risk_summary: {
          level: 'high',
        },
      } as any)
    ).toBe('L2');
  });

  it('resolves browser runtime from planner commands or bootstrap url', () => {
    const service = createService();

    expect(service.normalizeExecutionRuntimeType('temporal_worker')).toBe('workflow');
    expect(
      service.resolveExecutionRuntimeType(
        'custom',
        {
          steps: [
            {
              id: 'step-1',
              title: 'phase',
              description: 'browser phase',
              kind: 'tool',
              status: 'planned',
              commands: [{ action: 'click' }],
            },
          ],
        } as any,
        {}
      )
    ).toBe('browser');
    expect(
      service.resolveExecutionRuntimeType('sandbox', undefined, { url: 'https://example.test' })
    ).toBe('browser');
    expect(service.resolveExecutionRuntimeType('document', undefined, {})).toBe('document');
  });

  it('builds direct execution plan draft for explicitly selected skills with structured input', () => {
    const service = createService();

    expect(
      service.shouldSkipPlannerForExplicitStructuredInput({
        skillId: 'skill-1',
        input: {
          'contract.partyA.name_cn': 'Party A',
        },
      } as any)
    ).toBe(true);
    expect(
      service.shouldSkipPlannerForExplicitStructuredInput({
        skillId: 'skill-1',
        input: {
          prompt: 'summarize this contract',
        },
      } as any)
    ).toBe(false);

    expect(
      service.buildDirectExecutionPlanDraft(
        {
          skillId: 'skill-1',
          runtimeType: 'workflow',
          input: {
            'contract.partyA.name_cn': 'Party A',
          },
        } as any,
        'skill-1'
      )
    ).toEqual(
      expect.objectContaining({
        plan_id: 'direct-skill-1',
        planner_mode: 'skill',
        objective: JSON.stringify({
          skillId: 'skill-1',
          runtimeType: 'workflow',
          input: {
            'contract.partyA.name_cn': 'Party A',
          },
        }),
        skill_match: expect.objectContaining({
          skill_id: 'skill-1',
          match_reason: 'explicit_skill_selection',
        }),
        steps: [
          expect.objectContaining({
            id: 'execute_selected_skill',
            kind: 'skill',
            status: 'planned',
          }),
        ],
        required_inputs: [],
        risk_summary: {
          level: 'low',
          requires_human_review: false,
          items: ['explicit_skill_selected'],
        },
      })
    );
  });
});
