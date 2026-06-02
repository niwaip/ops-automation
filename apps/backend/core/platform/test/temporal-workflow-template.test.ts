import axios from 'axios';
import { TemporalWorkflowActivityResolutionService } from '../src/modules/temporal-workflow/temporal-workflow-activity-resolution.service';
import { TemporalWorkflowBrowserDraftService } from '../src/modules/temporal-workflow/temporal-workflow-browser-draft.service';
import { TemporalWorkflowCodegenService } from '../src/modules/temporal-workflow/temporal-workflow-codegen.service';
import { TemporalWorkflowConfigService } from '../src/modules/temporal-workflow/temporal-workflow-config.service';
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
import { pickFirstNonEmptyString } from '../src/modules/temporal-workflow/temporal-workflow-service.utils';
import { TemporalWorkflowSessionService } from '../src/modules/temporal-workflow/temporal-workflow-session.service';
import { TemporalWorkflowSupportService } from '../src/modules/temporal-workflow/temporal-workflow-support.service';
import { TemporalWorkflowService } from '../src/modules/temporal-workflow/temporal-workflow.service';
import {
  buildTemplateWorkflowParamSeeds,
  normalizeWorkflowInputParamType,
  normalizeWorkflowInputRenderPath,
} from '../src/modules/temporal-workflow/temporal-workflow-template.helpers';
import { TemporalWorkflowTemplateService } from '../src/modules/temporal-workflow/temporal-workflow-template.service';
import { TemporalWorkflowValidationService } from '../src/modules/temporal-workflow/temporal-workflow-validation.service';
import { BuiltinActivityRegistry } from '../src/modules/temporal-workflow/builtin-activity.registry';

jest.mock('axios');

describe('TemporalWorkflowTemplateService', () => {
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
      builtinRegistry,
    );
    const aiDraftService = new TemporalWorkflowAiDraftService(prisma as any, builtinRegistry);
    const browserDraftService = new TemporalWorkflowBrowserDraftService();
    const codegenService = new TemporalWorkflowCodegenService();
    const sessionService = new TemporalWorkflowSessionService(
      prisma as any,
      workflowNormalizationService,
    );
    const validationService = new TemporalWorkflowValidationService();
    const activityResolutionService = new TemporalWorkflowActivityResolutionService(
      prisma as any,
      builtinRegistry,
    );
    const workflowConfigService = new TemporalWorkflowConfigService();
    const workflowTemplateService = new TemporalWorkflowTemplateService();
    const workflowSupportService = new TemporalWorkflowSupportService(
      builtinRegistry,
      aiDraftService,
      activityResolutionService,
      workflowConfigService,
      workflowNormalizationService,
    );
    const service = new TemporalWorkflowService(
      prisma as any,
      aiDraftService,
      browserDraftService,
      codegenService,
      sessionService,
      validationService,
      workflowConfigService,
      workflowNormalizationService,
      workflowTemplateService,
      workflowSupportService,
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
      workflowSupportService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('materializes renderPath and default templateBinding in generated template workflow drafts', async () => {
    const { service, workflowTemplateService } = createService();

    jest.spyOn(workflowTemplateService as any, 'fetchCarboneTemplate').mockResolvedValue({
      id: 'tpl-tech-service',
      fileName: 'technical-service-contract.docx',
      format: 'docx',
      skillId: 'skill-tech-service',
      variables: ['{d.contract.partyA_cn}'],
      templateAssetManifest: {
        assetVersion: '1.0',
        renderPlanVersion: 2,
        metadata: {
          source: 'office-addin',
        },
        languageProfile: {
          sourceLanguage: 'zh',
          targetLanguages: [],
        },
        templateFieldSpecs: [
          {
            fieldId: 'contract.partyA',
            description: '甲方名称',
            required: true,
            type: 'string',
          },
        ],
        renderPlan: {
          bindings: [
            {
              fieldId: 'contract.partyA',
              variablePath: 'd.contract.partyA_cn',
              required: true,
            },
          ],
        },
      },
    });
    jest.spyOn(workflowTemplateService as any, 'fetchCarboneSkill').mockResolvedValue({
      id: 'skill-tech-service',
      parameters: [
        {
          name: 'contract.partyA',
          required: true,
          dataType: 'string',
          displayName: '甲方名称',
          usage: '合同甲方名称',
        },
      ],
    });
    jest.spyOn(workflowTemplateService as any, 'analyzeTemplateWorkflow').mockResolvedValue({
      workflowName: '技术服务合同渲染工作流',
      workflowDescription: '生成技术服务合同',
      activityDescription: '渲染技术服务合同',
      outputName: '技术服务合同-输出',
      inputParamDescriptions: {
        'contract.partyA': '合同甲方名称',
      },
    });

    const draft = await service.generateTemplateWorkflowDraft('tpl-tech-service');

    expect(draft.workflowDsl.inputParams).toEqual(expect.objectContaining({
      'contract.partyA': expect.objectContaining({
      renderPath: 'contract.partyA_cn',
      }),
    }));
    expect(draft.workflowDsl.inputPolicy).toEqual({
      params: {
        'contract.partyA': expect.objectContaining({
          enabled: true,
          requiredMode: 'always',
          templateBinding: 'contract.partyA_cn',
        }),
      },
    });
  });

  it('derives renderPath from template variables when template asset manifest is missing', async () => {
    const { service, workflowTemplateService } = createService();

    jest.spyOn(workflowTemplateService as any, 'fetchCarboneTemplate').mockResolvedValue({
      id: 'tpl-tech-service-legacy',
      fileName: 'technical-service-contract.docx',
      format: 'docx',
      skillId: 'skill-tech-service-legacy',
      variables: [
        '{d.contract.partyA.name_cn}',
        '{d.contract.partyA.name_jp}',
        '{d.otherTerms.title_jp}',
      ],
    });
    jest.spyOn(workflowTemplateService as any, 'fetchCarboneSkill').mockResolvedValue({
      id: 'skill-tech-service-legacy',
      parameters: [
        {
          name: 'contract.partyA.name',
          required: true,
          dataType: 'string',
          displayName: '甲方名称',
          usage: '合同甲方名称',
        },
        {
          name: 'otherTerms.title',
          required: true,
          dataType: 'string',
          displayName: '其他条款标题',
          usage: '其他条款标题',
        },
      ],
    });
    jest.spyOn(workflowTemplateService as any, 'analyzeTemplateWorkflow').mockResolvedValue({
      workflowName: '技术服务合同渲染工作流',
      workflowDescription: '生成技术服务合同',
      activityDescription: '渲染技术服务合同',
      outputName: '技术服务合同-输出',
      inputParamDescriptions: {
        'contract.partyA.name': '合同甲方名称',
        'otherTerms.title': '其他条款标题',
      },
    });

    const draft = await service.generateTemplateWorkflowDraft('tpl-tech-service-legacy');

    expect(draft.workflowDsl.inputParams).toEqual(expect.objectContaining({
      'contract.partyA.name': expect.objectContaining({
        renderPath: ['contract.partyA.name_cn', 'contract.partyA.name_jp'],
      }),
      'otherTerms.title': expect.objectContaining({
        renderPath: 'otherTerms.title_jp',
      }),
    }));
    expect(draft.workflowDsl.inputPolicy).toEqual({
      params: {
        'contract.partyA.name': expect.objectContaining({
          enabled: true,
          requiredMode: 'always',
        }),
        'otherTerms.title': expect.objectContaining({
          enabled: true,
          requiredMode: 'always',
          templateBinding: 'otherTerms.title_jp',
        }),
      },
    });
  });

  it('compiles template workflow draft on backend and ignores frontend templateBinding overrides', async () => {
    const { service, prisma, workflowTemplateService } = createService();

    jest.spyOn(workflowTemplateService as any, 'fetchCarboneTemplate').mockResolvedValue({
      id: 'tpl-tech-service',
      fileName: 'technical-service-contract.docx',
      format: 'docx',
      skillId: 'skill-tech-service',
      templateAssetManifest: {
        assetVersion: '1.0',
        fieldCount: 1,
        renderPlanVersion: 3,
        renderPlan: {
          version: 3,
          bindings: [
            {
              fieldId: 'contract.partyA',
              variablePath: 'd.contract.partyA_cn',
              required: true,
            },
          ],
        },
      },
    });
    jest.spyOn(workflowTemplateService as any, 'fetchCarboneSkill').mockResolvedValue({
      id: 'skill-tech-service',
      parameters: [
        {
          name: 'contract.partyA',
          required: true,
          dataType: 'string',
          displayName: '甲方名称',
          usage: '合同甲方名称',
        },
      ],
    });
    jest.spyOn(workflowTemplateService as any, 'analyzeTemplateWorkflow').mockResolvedValue({
      workflowName: '技术服务合同渲染工作流',
      workflowDescription: '生成技术服务合同',
      activityDescription: '渲染技术服务合同',
      outputName: '技术服务合同-输出',
      inputParamDescriptions: {
        'contract.partyA': '合同甲方名称',
      },
    });
    prisma.skillConfig.findUnique.mockResolvedValue({
      paramsSchema: {
        properties: {
          'contract.partyA': {
            type: 'string',
            description: '合同甲方名称',
          },
        },
      },
    });

    const draft = await service.compileTemplateWorkflowDraft({
      templateId: 'tpl-tech-service',
      name: '合同编译结果',
      inputPolicy: {
        params: {
          'contract.partyA': {
            requiredMode: 'optional',
            templateBinding: 'frontend.override.binding',
          },
        },
      },
    });

    expect(draft.name).toBe('合同编译结果');
    expect(draft.workflowDsl.inputPolicy).toEqual({
      params: {
        'contract.partyA': expect.objectContaining({
          enabled: true,
          requiredMode: 'optional',
          templateBinding: 'contract.partyA_cn',
        }),
      },
    });
  });

  it('maps fixed document workflow inputs with templateBinding and renderPath when generating code', async () => {
    const {
      builtinRegistry,
      workflowConfigService,
      workflowNormalizationService,
    } = createService();
    const workflowDsl = {
      name: '技术服务合同工作流',
      workflowClassName: 'TechnicalServiceContractWorkflow',
      workflowDefnName: '技术服务合同工作流',
      taskQueue: 'SKILL_TASK_QUEUE',
      inputParams: {
        'contract.partyA': {
          required: true,
          description: '甲方名称',
          renderPath: ['contract.partyA_cn', 'contract.partyA_jp'],
        },
        'contract.partyB': {
          required: true,
          description: '乙方名称',
          renderPath: 'contract.partyB_cn',
        },
        contractNumber: {
          required: true,
          description: '合同编号',
        },
        'contract.signingDate': {
          required: true,
          description: '签署日期',
          renderPath: ['contract.signingDate_cn', 'contract.signingDate_jp'],
        },
        customerName: {
          required: false,
          description: '客户名称',
          renderPath: 'legacy.customerName',
        },
      },
      inputPolicy: {
        params: {
          'contract.signingDate': {
            requiredMode: 'optional',
          },
          customerName: {
            templateBinding: 'contract.customer.fullName',
          },
        },
      },
      steps: [
        {
          id: 'step_1',
          name: '渲染技术服务合同',
          type: 'activity' as const,
          activityRef: 'builtin:documentRender',
          activityName: 'documentRender',
          startToCloseTimeout: '60s',
        },
      ],
    };
    const builtinActivity = builtinRegistry.getByKey('documentRender');
    expect(builtinActivity).toBeTruthy();
    if (!builtinActivity) {
      throw new Error('builtin documentRender activity not found');
    }
    const documentActivityDef = {
      name: builtinActivity.name,
      fn: builtinActivity.fn,
      timeout: builtinActivity.timeout,
      retryPolicy: builtinActivity.retryPolicy,
      handler: builtinActivity.handler,
      generatedCode: builtinActivity.generatedCode,
      config: {
        templateId: 'tpl-tech-service',
        format: 'docx',
        outputName: '技术服务合同',
        steps: [
          {
            type: 'carbone',
            config: {
              templateId: 'tpl-tech-service',
              format: 'docx',
              outputName: '技术服务合同',
            },
          },
        ],
      },
    };

    const code = buildDeterministicWorkflowCodeForWorkflow(
      workflowDsl as any,
      { activities: [documentActivityDef] } as any,
      {
        builtinActivityRegistry: builtinRegistry,
        workflowConfigService,
        workflowNormalizationService,
      },
    );

    expect(code).toBeTruthy();
    expect(code).toContain('"contract.partyA": [');
    expect(code).toContain('"contract.partyA_cn"');
    expect(code).toContain('"contract.partyA_jp"');
    expect(code).toContain('"customerName": [');
    expect(code).toContain('"contract.customer.fullName"');
    expect(code).toContain('normalized_params = self._normalize_params(params or {})');
    expect(code).toContain('self._validate_required_params(normalized_params)');
    expect(code).not.toContain('render_data = self._build_render_data(normalized_params)');
    expect(code).toContain('def _extract_binding_locale(path: str) -> str | None:');
    expect(code).toContain('resolved_value = cls._resolve_localized_binding_value(path, value)');
    expect(code).toContain('locale_candidates = ["cn", "zh"] if locale == "cn" else ["jp", "ja"]');
    expect(code).toContain('array_match = re.match(r"^(.*)\\[\\]\\.(.+)$", str(path or "").strip())');
    expect(code).toContain('missing_params = [key for key in required_params if TechnicalServiceContractWorkflow._is_missing(params.get(key))]');
    expect(code).toContain('"data": normalized_params');
    expect(code).toContain('"prepareLocalizedRenderData": True');
    expect(code).toContain('"contract.signingDate": [');
    expect(code).toContain('"contract.signingDate_cn"');
    expect(code).toContain('"contract.signingDate_jp"');
    const requiredParamsMatch = (code || '').match(/required_params = \[(.*?)\]/s);
    expect(requiredParamsMatch?.[1]).toContain('"contract.partyA"');
    expect(requiredParamsMatch?.[1]).toContain('"contract.partyB"');
    expect(requiredParamsMatch?.[1]).toContain('"contractNumber"');
    expect(requiredParamsMatch?.[1]).not.toContain('"contract.signingDate"');
    expect(requiredParamsMatch?.[1]).not.toContain('"customerName"');
  });

});
