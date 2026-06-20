import { ExecutionInputResolutionService } from '../src/modules/execution/execution-input-resolution.service';
import { ExecutionPlanNormalizationService } from '../src/modules/execution/execution-plan-normalization.service';

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
