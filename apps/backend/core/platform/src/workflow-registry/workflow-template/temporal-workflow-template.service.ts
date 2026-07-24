import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl, getCarboneServiceUrl } from '../../config/service-endpoints';
import type { BuiltinActivityDefinition } from '../../modules/temporal-workflow/builtin-activity.registry';
import {
  buildTemplateWorkflowParamSeeds,
  normalizeWorkflowInputRenderPath,
  resolveTemplateAssetFieldCount,
  resolveTemplateAssetRenderPlanVersion,
  resolveTemplateAssetSource,
  resolveTemplateWorkflowTargetLanguages,
  slugFromTemplate,
  stripTemplateExtension,
} from '../../modules/temporal-workflow/temporal-workflow-template.helpers';
import {
  DEFAULT_TEMPLATE_WORKFLOW_DSL,
  type ActivityDsl,
  type CarboneSkillMeta,
  type CarboneTemplateMeta,
  type CompileTemplateWorkflowDraftDTO,
  type GenerateTemplateWorkflowDraftDTO,
  type TemplateWorkflowAiAnalysis,
  type TemplateWorkflowDraft,
  type WorkflowDsl,
  type WorkflowInputParamDefinition,
  type WorkflowInputPolicy,
  type WorkflowParamPolicy,
} from '../../modules/temporal-workflow/temporal-workflow.types';

export interface TemporalWorkflowTemplateSupport {
  getBuiltinDocumentRenderActivity(): BuiltinActivityDefinition;
  buildDefaultWorkflowInputPolicyParams(
    inputParams: Record<string, WorkflowInputParamDefinition> | undefined
  ): Record<string, WorkflowParamPolicy>;
  normalizeName(value?: string): string;
  normalizeDescription(value?: string | null): string | null;
  normalizeTaskQueue(value?: string): string;
  normalizeWorkflowDsl(
    workflowDsl: WorkflowDsl,
    workflowName?: string,
    taskQueue?: string,
    activityDsl?: ActivityDsl
  ): Promise<WorkflowDsl>;
  pickFirstNonEmptyString(...values: unknown[]): string | undefined;
  uniqueVariables(variables: string[]): string[];
  buildWorkflowSemanticHint(...values: unknown[]): string;
}

@Injectable()
export class TemporalWorkflowTemplateService {
  private readonly logger = new Logger(TemporalWorkflowTemplateService.name);

  async generateTemplateWorkflowDraftFromRequest(
    data: GenerateTemplateWorkflowDraftDTO,
    support: TemporalWorkflowTemplateSupport
  ): Promise<TemplateWorkflowDraft> {
    return this.generateTemplateWorkflowDraft(data.templateId, support);
  }

  async generateTemplateWorkflowDraft(
    templateId: string,
    support: TemporalWorkflowTemplateSupport
  ): Promise<TemplateWorkflowDraft> {
    const template = await this.fetchCarboneTemplate(templateId);
    const skill = template.skillId
      ? await this.fetchCarboneSkill(template.skillId).catch(() => null)
      : null;
    const analysis = await this.analyzeTemplateWorkflow(template, skill, support);
    const templateAssetManifest = template.templateAssetManifest;
    const templateAssetVersion = templateAssetManifest?.assetVersion;
    const renderPlanVersion = resolveTemplateAssetRenderPlanVersion(templateAssetManifest);
    const templateAssetSource = resolveTemplateAssetSource(templateAssetManifest);
    const generationWarnings: string[] = [];
    if (!templateAssetManifest) {
      generationWarnings.push(
        '当前模板缺少完整模板资产清单，已回退为基于 variables 的兼容草稿；建议先在 Addin 中保存模板资产。'
      );
    } else if (!templateAssetManifest.renderPlan?.bindings?.length) {
      generationWarnings.push(
        '当前模板资产缺少 renderPlan 绑定信息，已尽量基于字段定义生成草稿，请人工确认输入参数。'
      );
    }
    const short = slugFromTemplate(template.id);
    const fileBaseName = stripTemplateExtension(template.fileName || template.id);
    const documentType = analysis.documentType?.trim() || fileBaseName || `模板${short}`;
    const workflowName = analysis.workflowName?.trim() || `${documentType}模板-${short}-工作流`;
    const activityDescription =
      analysis.activityDescription?.trim() ||
      `共享文档渲染 Activity，绑定模板 ${template.id} 生成 ${documentType} 文档`;
    const workflowDescription =
      analysis.workflowDescription?.trim() ||
      `基于模板 ${template.id} 自动生成的 ${documentType} 工作流`;
    const outputName = analysis.outputName?.trim() || `${documentType}-输出`;
    const paramSeeds = buildTemplateWorkflowParamSeeds({
      template,
      skill,
      pickFirstNonEmptyString: (...values) => support.pickFirstNonEmptyString(...values),
      uniqueVariables: (variables) => support.uniqueVariables(variables),
      buildWorkflowSemanticHint: (...values) => support.buildWorkflowSemanticHint(...values),
    });
    const resolvedTargetLanguages = resolveTemplateWorkflowTargetLanguages(template, paramSeeds);
    const resolvedTemplateFieldCount = resolveTemplateAssetFieldCount(
      templateAssetManifest,
      paramSeeds.length
    );
    const inputParamsArray = paramSeeds.map((param) => ({
      key: param.key,
      value: '',
      required: param.required,
    }));
    const inputParams = paramSeeds.reduce<Record<string, WorkflowInputParamDefinition>>(
      (acc, item) => {
        const renderPath = normalizeWorkflowInputRenderPath(item.renderPath);
        acc[item.key] = {
          required: item.required,
          defaultValue: '',
          localizedDefaultValue: undefined,
          localizedVariants: item.localizedVariants,
          description: analysis.inputParamDescriptions?.[item.key]?.trim() || item.description,
          source: 'inferred_from_template',
          type: item.type,
          exampleValue: item.exampleValue,
          displayName: item.displayName,
          groupLabel: item.groupLabel,
          paramKind: item.paramKind,
          arrayPath: item.arrayPath,
          fieldName: item.fieldName,
          ...(renderPath ? { renderPath } : {}),
        };
        return acc;
      },
      {}
    );
    const inputPolicyParams = support.buildDefaultWorkflowInputPolicyParams(inputParams);

    const builtinDocumentRender = support.getBuiltinDocumentRenderActivity();
    const sharedActivityName = builtinDocumentRender.name;
    const sharedActivityTimeout = builtinDocumentRender.timeout;
    const sharedActivityRetryPolicy = builtinDocumentRender.retryPolicy || {
      maxRetries: 2,
      backoffMs: 1000,
    };
    const sharedActivityHandler = builtinDocumentRender.handler;

    return {
      name: workflowName,
      description: workflowDescription,
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        ...DEFAULT_TEMPLATE_WORKFLOW_DSL,
        name: workflowName,
        workflowClassName: `Template${short}Workflow`,
        workflowDefnName: workflowName,
        taskQueue: 'SKILL_TASK_QUEUE',
        sourceContext: {
          sourceType: 'template',
          generatedAt: new Date().toISOString(),
          warnings: generationWarnings,
          sourceTemplate: {
            templateId: template.id,
            skillId: template.skillId,
            fileName: template.fileName,
            format: template.format,
            variableCount: paramSeeds.length,
            templateAssetVersion,
            renderPlanVersion,
          },
          templateAssetSummary:
            templateAssetManifest && templateAssetVersion
              ? {
                  assetVersion: templateAssetVersion,
                  renderPlanVersion: renderPlanVersion ?? 1,
                  fieldCount: resolvedTemplateFieldCount,
                  source: templateAssetSource,
                }
              : undefined,
        },
        inputParams,
        ...(Object.keys(inputPolicyParams).length > 0
          ? {
              inputPolicy: {
                params: inputPolicyParams,
              },
            }
          : {}),
        outputParams: {
          result: {
            sourceStep: 'step_1',
            description: analysis.outputDescription?.trim() || `${documentType} 文档渲染结果`,
          },
        },
        extraPrompt:
          analysis.extraPrompt?.trim() ||
          [
            `该工作流用于生成 ${documentType} 文档。`,
            `模板ID: ${template.id}`,
            templateAssetVersion ? `模板资产版本: ${templateAssetVersion}` : '',
            renderPlanVersion ? `渲染计划版本: ${renderPlanVersion}` : '',
            template.skillId ? `模板内置 Skill ID: ${template.skillId}` : '',
            '工作流只负责编排与参数校验，真正的渲染由共享 documentRender Activity 执行。',
          ]
            .filter(Boolean)
            .join('\n'),
        steps: [
          {
            id: 'step_1',
            name: `渲染${documentType}`,
            type: 'activity',
            activityRef: builtinDocumentRender.ref,
            activityName: sharedActivityName,
            startToCloseTimeout: sharedActivityTimeout,
          },
        ],
      },
      activityDsl: {
        activities: [
          {
            name: sharedActivityName,
            fn: builtinDocumentRender.fn,
            timeout: sharedActivityTimeout,
            retryPolicy: { maxRetries: sharedActivityRetryPolicy.maxRetries || 2 },
            handler: sharedActivityHandler,
            config: {
              ...(builtinDocumentRender.config || {}),
              description: activityDescription,
              templateId: template.id,
              skillId: template.skillId || null,
              fileName: template.fileName || null,
              format: template.format || 'docx',
              variableCount: paramSeeds.length,
              templateAssetVersion: templateAssetVersion || null,
              renderPlanVersion: renderPlanVersion || null,
              sourceLanguage: templateAssetManifest?.languageProfile?.sourceLanguage || null,
              targetLanguages: resolvedTargetLanguages,
              templateFieldCount: templateAssetManifest ? resolvedTemplateFieldCount : null,
              templateAssetSource: templateAssetManifest ? templateAssetSource : null,
              steps: [
                {
                  name: `渲染${documentType}`,
                  type: 'carbone',
                  timeout: sharedActivityTimeout,
                  config: {
                    templateId: template.id,
                    format: template.format || 'docx',
                    outputName,
                    templateAssetVersion: templateAssetVersion || null,
                    renderPlanVersion: renderPlanVersion || null,
                  },
                  inputParams: inputParamsArray,
                },
              ],
            },
            generatedCode: builtinDocumentRender.generatedCode,
          },
        ],
      },
      sourceTemplate: {
        templateId: template.id,
        skillId: template.skillId,
        fileName: template.fileName,
        format: template.format,
        variableCount: paramSeeds.length,
        templateAssetVersion,
        renderPlanVersion,
      },
    };
  }

  async compileTemplateWorkflowDraft(
    data: CompileTemplateWorkflowDraftDTO,
    support: TemporalWorkflowTemplateSupport
  ): Promise<TemplateWorkflowDraft> {
    const baseDraft = await this.generateTemplateWorkflowDraft(data.templateId, support);
    const compiledDraft = await this.applyTemplateWorkflowDraftOverrides(
      baseDraft,
      {
        ...data,
        inputPolicy: this.stripTemplateBindingOverridesFromInputPolicy(data.inputPolicy),
      },
      support
    );
    return compiledDraft;
  }

  private async applyTemplateWorkflowDraftOverrides(
    baseDraft: TemplateWorkflowDraft,
    overrides: Omit<CompileTemplateWorkflowDraftDTO, 'templateId'>,
    support: TemporalWorkflowTemplateSupport
  ): Promise<TemplateWorkflowDraft> {
    const nextName = support.normalizeName(overrides.name || baseDraft.name);
    const nextTaskQueue = support.normalizeTaskQueue(
      overrides.taskQueue || baseDraft.taskQueue || baseDraft.workflowDsl.taskQueue
    );
    const nextDescription =
      support.normalizeDescription(
        overrides.description !== undefined ? overrides.description : baseDraft.description
      ) || baseDraft.description;
    const nextWorkflowDsl = await support.normalizeWorkflowDsl(
      {
        ...baseDraft.workflowDsl,
        name: nextName,
        workflowDefnName: nextName,
        taskQueue: nextTaskQueue,
        ...(overrides.inputPolicy ? { inputPolicy: overrides.inputPolicy } : {}),
      },
      nextName,
      nextTaskQueue,
      baseDraft.activityDsl
    );

    return {
      ...baseDraft,
      name: nextName,
      description: nextDescription,
      taskQueue: nextTaskQueue,
      workflowDsl: nextWorkflowDsl,
    };
  }

  private stripTemplateBindingOverridesFromInputPolicy(
    inputPolicy?: WorkflowInputPolicy
  ): WorkflowInputPolicy | undefined {
    if (!inputPolicy?.params || typeof inputPolicy.params !== 'object') {
      return inputPolicy;
    }

    const params = Object.entries(inputPolicy.params).reduce<Record<string, WorkflowParamPolicy>>(
      (acc, [key, value]) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return acc;
        }
        const nextPolicy = { ...value } as WorkflowParamPolicy;
        delete nextPolicy.templateBinding;
        acc[key] = nextPolicy;
        return acc;
      },
      {}
    );

    return { params };
  }

  private async analyzeTemplateWorkflow(
    template: CarboneTemplateMeta,
    skill: CarboneSkillMeta | null,
    support: TemporalWorkflowTemplateSupport
  ): Promise<TemplateWorkflowAiAnalysis> {
    const fallback: TemplateWorkflowAiAnalysis = {};
    try {
      const aiOrchestratorUrl = getAiOrchestratorUrl();
      const previewHtml = await this.fetchTemplatePreviewHtml(template.id).catch(() => '');
      const paramKeys = buildTemplateWorkflowParamSeeds({
        template,
        skill,
        pickFirstNonEmptyString: (...values) => support.pickFirstNonEmptyString(...values),
        uniqueVariables: (variables) => support.uniqueVariables(variables),
        buildWorkflowSemanticHint: (...values) => support.buildWorkflowSemanticHint(...values),
      }).map((item) => item.key);
      const prompt = [
        '你是一个企业文档自动化专家，需要根据 Carbone 文档模板信息生成一个“模板工作流草稿”。',
        '目标是生成一个共享 documentRender Activity 可复用的 Temporal Workflow 草稿。',
        '请根据模板名称、参数、HTML 预览和模板 Skill 信息，推断该文档的业务类型、输入参数说明、输出说明和工作流描述。',
        '',
        '输出要求：',
        '1. 只返回一个 JSON 对象，不要输出 Markdown 或解释。',
        '2. JSON 字段只允许包含：documentType, workflowName, workflowDescription, activityDescription, outputName, outputDescription, inputParamDescriptions, extraPrompt。',
        '3. inputParamDescriptions 必须是对象，key 为模板参数路径，value 为中文描述。',
        '4. workflowName 若无法确定，可以输出空字符串。',
        '5. 不要虚构不存在的模板参数。',
        '',
        `模板ID: ${template.id}`,
        `模板文件名: ${template.fileName}`,
        `模板格式: ${template.format || 'docx'}`,
        `模板参数: ${JSON.stringify(paramKeys, null, 2)}`,
        `模板 loops: ${JSON.stringify(template.loops || [], null, 2)}`,
        `模板内置 skillId: ${template.skillId || ''}`,
        `模板 Skill 元数据: ${JSON.stringify(skill || {}, null, 2)}`,
        `模板 HTML 预览（可能被截断）: ${previewHtml.slice(0, 12000)}`,
      ].join('\n');

      const response = await axios.post<{ result: string }>(
        `${aiOrchestratorUrl}/ai/model/call`,
        {
          modelId: 'default',
          prompt,
        },
        { timeout: 360000 }
      );

      return this.parseJsonFromAiContent(response.data?.result || '') as TemplateWorkflowAiAnalysis;
    } catch (error: any) {
      this.logger.warn(`Template workflow analysis fallback for ${template.id}: ${error.message}`);
      return fallback;
    }
  }

  private async fetchCarboneTemplate(templateId: string): Promise<CarboneTemplateMeta> {
    const carboneBaseUrl = this.getCarboneBaseUrl();
    const response = await axios.get<CarboneTemplateMeta>(
      `${carboneBaseUrl}/studio/templates/${templateId}`,
      {
        timeout: 30000,
      }
    );
    return response.data;
  }

  private async fetchCarboneSkill(skillId: string): Promise<CarboneSkillMeta> {
    const carboneBaseUrl = this.getCarboneBaseUrl();
    const response = await axios.get<CarboneSkillMeta>(
      `${carboneBaseUrl}/studio/skill/${skillId}`,
      {
        timeout: 30000,
      }
    );
    return response.data;
  }

  private async fetchTemplatePreviewHtml(templateId: string): Promise<string> {
    const carboneBaseUrl = this.getCarboneBaseUrl();
    const response = await axios.get<{ html: string }>(
      `${carboneBaseUrl}/studio/templates/${templateId}/preview-html`,
      {
        timeout: 60000,
      }
    );
    return response.data?.html || '';
  }

  private getCarboneBaseUrl(): string {
    return getCarboneServiceUrl();
  }

  private parseJsonFromAiContent(content: string): Record<string, any> {
    const sanitized = (content || '').replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(sanitized);
      return this.recursiveSanitizeTemplates(parsed);
    } catch {
      const start = sanitized.indexOf('{');
      const end = sanitized.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(sanitized.slice(start, end + 1));
        return this.recursiveSanitizeTemplates(parsed);
      }
      throw new Error('AI 返回内容不是有效 JSON');
    }
  }

  private recursiveSanitizeTemplates(value: any): any {
    if (typeof value === 'string') {
      return value.replace(/`/g, '').trim();
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.recursiveSanitizeTemplates(item));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.recursiveSanitizeTemplates(val);
      }
      return result;
    }
    return value;
  }
}
