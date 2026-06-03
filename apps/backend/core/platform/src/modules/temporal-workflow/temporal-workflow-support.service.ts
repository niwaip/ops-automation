import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BuiltinActivityDefinition,
  BuiltinActivityRegistry,
  DOCUMENT_RENDER_ACTIVITY_KEY,
} from './builtin-activity.registry';
import { collectEnrichedActivities } from './temporal-workflow-activity.helpers';
import {
  TemporalWorkflowActivityResolutionService,
  type TemporalWorkflowActivityResolutionSupport,
} from './temporal-workflow-activity-resolution.service';
import type {
  TemporalWorkflowBrowserDraftSupport,
} from './temporal-workflow-browser-draft.service';
import type {
  TemporalWorkflowCodegenSupport,
} from './temporal-workflow-codegen.service';
import type {
  AiDraftActivityResource,
  AiWorkflowDraftPlan,
  TemporalWorkflowAiDraftSupport,
} from './temporal-workflow-draft.service';
import { TemporalWorkflowAiDraftService } from './temporal-workflow-draft.service';
import { buildDeterministicActivityCodeForWorkflow, buildDeterministicWorkflowCodeForWorkflow } from './temporal-workflow-deterministic-builder';
import { TemporalWorkflowConfigService } from './temporal-workflow-config.service';
import { TemporalWorkflowNormalizationService } from './temporal-workflow-normalization.service';
import {
  fetchReferenceUrlExcerpt,
  parseJsonFromAiContent,
  pickFirstNonEmptyString,
} from './temporal-workflow-service.utils';
import {
  createTemporalWorkflowActivityResolutionSupport,
  createTemporalWorkflowAiDraftSupport,
  createTemporalWorkflowBrowserDraftSupport,
  createTemporalWorkflowCodegenSupport,
  createTemporalWorkflowSessionSupport,
  createTemporalWorkflowTemplateSupport,
} from './temporal-workflow-support.factory';
import type {
  ActivityDsl,
  TemporalValidationResult,
  WorkflowDsl,
} from './temporal-workflow.types';
import type {
  TemporalWorkflowSessionSupport,
} from './temporal-workflow-session.service';
import type {
  TemporalWorkflowTemplateSupport,
} from './temporal-workflow-template.service';

@Injectable()
export class TemporalWorkflowSupportService {
  constructor(
    private readonly builtinActivityRegistry: BuiltinActivityRegistry,
    private readonly aiDraftService: TemporalWorkflowAiDraftService,
    private readonly activityResolutionService: TemporalWorkflowActivityResolutionService,
    private readonly workflowConfigService: TemporalWorkflowConfigService,
    private readonly workflowNormalizationService: TemporalWorkflowNormalizationService,
  ) {}

  createAiDraftSupport(): TemporalWorkflowAiDraftSupport {
    return createTemporalWorkflowAiDraftSupport({
      fetchReferenceUrlExcerpt,
      sanitizeJsonValue: <T>(value: T) => this.workflowNormalizationService.sanitizeJsonValue(value),
      parseJsonFromAiContent,
      pickFirstNonEmptyString,
      normalizeHttpRequestConfig: (config, declaredInputKeys) => (
        this.workflowConfigService.normalizeHttpRequestConfig(config, declaredInputKeys)
      ),
      optimizeHttpRequestConfig: (stepConfig, inputParams, userRequest) => (
        this.workflowConfigService.optimizeHttpRequestConfig(stepConfig, inputParams, userRequest)
      ),
      previewHttpRequestConfig: (stepConfig, inputParams) => (
        this.workflowConfigService.previewHttpRequestConfig(stepConfig, inputParams)
      ),
      generateStructuredTransformConfig: (sourceSample, userRequest, existingConfig) => (
        this.workflowConfigService.generateStructuredTransformConfig(sourceSample, userRequest, existingConfig)
      ),
      generateAiStructuredTransformDraftConfig: (sourceSample, userRequest, existingConfig) => (
        this.workflowConfigService.generateAiStructuredTransformDraftConfig(sourceSample, userRequest, existingConfig)
      ),
      normalizeStructuredTransformConfig: (config, placeholderKeys) => (
        this.workflowConfigService.normalizeStructuredTransformConfig(config, placeholderKeys)
      ),
      collectTemplateVariables: (value, target) => this.workflowConfigService.collectTemplateVariables(value, target),
      renderHttpTemplateValue: (value, params) => this.workflowConfigService.renderHttpTemplateValue(value, params),
      normalizeName: (value) => this.workflowNormalizationService.normalizeName(value ?? undefined),
      normalizeDescription: (value) => this.workflowNormalizationService.normalizeDescription(value ?? undefined),
      normalizeTaskQueue: (value) => this.workflowNormalizationService.normalizeTaskQueue(value ?? undefined),
      normalizeWorkflowClassName: (candidate, workflowName) => (
        this.workflowNormalizationService.normalizeWorkflowClassName(candidate, workflowName)
      ),
      normalizeWorkflowDsl: (workflowDsl, workflowName, taskQueue, activityDsl) => (
        this.workflowNormalizationService.normalizeWorkflowDsl(workflowDsl, workflowName, taskQueue, activityDsl)
      ),
      buildWorkflowSemanticHint: (...values) => this.workflowNormalizationService.buildWorkflowSemanticHint(...values),
    });
  }

  createTemplateSupport(): TemporalWorkflowTemplateSupport {
    return createTemporalWorkflowTemplateSupport({
      getBuiltinDocumentRenderActivity: () => this.getBuiltinDocumentRenderActivity(),
      buildDefaultWorkflowInputPolicyParams: (inputParams) => (
        this.workflowNormalizationService.buildDefaultWorkflowInputPolicyParams(inputParams)
      ),
      normalizeName: (value) => this.workflowNormalizationService.normalizeName(value ?? undefined),
      normalizeDescription: (value) => this.workflowNormalizationService.normalizeDescription(value ?? undefined),
      normalizeTaskQueue: (value) => this.workflowNormalizationService.normalizeTaskQueue(value ?? undefined),
      normalizeWorkflowDsl: (workflowDsl, workflowName, taskQueue, activityDsl) => (
        this.workflowNormalizationService.normalizeWorkflowDsl(workflowDsl, workflowName, taskQueue, activityDsl)
      ),
      pickFirstNonEmptyString,
      uniqueVariables: (variables) => this.workflowNormalizationService.uniqueVariables(variables),
      buildWorkflowSemanticHint: (...values) => this.workflowNormalizationService.buildWorkflowSemanticHint(...values),
    });
  }

  createBrowserDraftSupport(): TemporalWorkflowBrowserDraftSupport {
    return createTemporalWorkflowBrowserDraftSupport({
      normalizeName: (value) => this.workflowNormalizationService.normalizeName(value ?? undefined),
      normalizeDescription: (value) => this.workflowNormalizationService.normalizeDescription(value ?? undefined),
      pickFirstNonEmptyString,
      collectTemplateVariables: (value, target) => this.workflowConfigService.collectTemplateVariables(value, target),
      buildWorkflowSemanticHint: (...values) => this.workflowNormalizationService.buildWorkflowSemanticHint(...values),
    });
  }

  createCodegenSupport(): TemporalWorkflowCodegenSupport {
    return createTemporalWorkflowCodegenSupport((workflowDsl, activityDsl) => (
      this.buildDeterministicWorkflowCode(workflowDsl, activityDsl)
    ));
  }

  createSessionSupport(
    generateAiWorkflowDraft: TemporalWorkflowSessionSupport['generateAiWorkflowDraft'],
    refineAiWorkflowDraft: TemporalWorkflowSessionSupport['refineAiWorkflowDraft'],
  ): TemporalWorkflowSessionSupport {
    return createTemporalWorkflowSessionSupport(generateAiWorkflowDraft, refineAiWorkflowDraft);
  }

  createActivityResolutionSupport(): TemporalWorkflowActivityResolutionSupport {
    return createTemporalWorkflowActivityResolutionSupport((activityDef) => (
      this.buildDeterministicActivityCode(activityDef)
    ));
  }

  async validateDsl(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
  ): Promise<TemporalValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!workflowDsl.name) {
      errors.push('Workflow name is required');
    }

    if (!workflowDsl.steps || workflowDsl.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    }

    for (let i = 0; i < workflowDsl.steps.length; i++) {
      const step = workflowDsl.steps[i];

      if (!step.name) {
        errors.push(`Step ${i + 1} must have a name`);
      }

      if (step.type !== 'activity') {
        continue;
      }

      if (!step.activityRef && !step.activityName) {
        errors.push(`Step "${step.name}" must specify an activity reference`);
        continue;
      }

      const resolvedActivity = await this.activityResolutionService.resolveActivityDefinition(
        step,
        activityDsl,
        this.createActivityResolutionSupport(),
      );
      if (!resolvedActivity) {
        const activityIdentifier = step.activityRef || step.activityName || '<unknown>';
        errors.push(`Step "${step.name}" references activity "${activityIdentifier}" which cannot be resolved`);
      }
    }

    errors.push(...this.aiDraftService.validatePlan(
      { steps: workflowDsl.steps as AiWorkflowDraftPlan['steps'] },
      this.buildAiDraftActivityResources(activityDsl),
    ));

    if (!activityDsl.activities || activityDsl.activities.length === 0) {
      warnings.push('No activities defined');
    }

    for (const activity of activityDsl.activities) {
      if (!activity.name) {
        errors.push('All activities must have a name');
      }
      if (!activity.fn) {
        errors.push(`Activity "${activity.name}" must have a function name`);
      }
    }

    const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);

    return {
      isValid: errors.length === 0,
      score,
      errors,
      warnings,
    };
  }

  async createEnrichedActivityDsl(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
  ): Promise<ActivityDsl> {
    const activities = await collectEnrichedActivities({
      workflowDsl,
      activityDsl,
      activityResolutionService: this.activityResolutionService,
      createActivityResolutionSupport: () => this.createActivityResolutionSupport(),
      buildDeterministicActivityCode: (activityDef) => this.buildDeterministicActivityCode(activityDef),
    });

    return { activities };
  }

  buildDeterministicActivityCode(
    activityDef: ActivityDsl['activities'][number],
  ): string | null {
    return buildDeterministicActivityCodeForWorkflow(activityDef);
  }

  buildDeterministicWorkflowCode(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
  ): string | null {
    return buildDeterministicWorkflowCodeForWorkflow(
      workflowDsl,
      activityDsl,
      {
        builtinActivityRegistry: this.builtinActivityRegistry,
        workflowConfigService: this.workflowConfigService,
        workflowNormalizationService: this.workflowNormalizationService,
      },
    );
  }

  private getBuiltinDocumentRenderActivity(): BuiltinActivityDefinition {
    const builtin = this.builtinActivityRegistry.getByKey(DOCUMENT_RENDER_ACTIVITY_KEY);
    if (!builtin) {
      throw new NotFoundException(`Missing builtin activity: ${DOCUMENT_RENDER_ACTIVITY_KEY}`);
    }
    return builtin;
  }

  private buildAiDraftActivityResources(activityDsl: ActivityDsl): AiDraftActivityResource[] {
    const builtinActivityResources = this.builtinActivityRegistry.list().map((item) => ({
      ref: item.ref,
      name: item.name,
      fn: item.fn,
      timeout: item.timeout,
      retryPolicy: item.retryPolicy,
      handler: item.handler,
      config: item.config || {},
      generatedCode: item.generatedCode,
      description: item.description,
    }));

    const customActivityResources = (activityDsl.activities || []).map((activity, index) => ({
      ref: `custom:${String(activity.fn || activity.name || `activity_${index + 1}`).trim()}`,
      name: activity.name,
      fn: activity.fn,
      timeout: activity.timeout,
      retryPolicy: activity.retryPolicy,
      handler: activity.handler,
      config: activity.config || {},
      generatedCode: activity.generatedCode,
      description: undefined,
    }));

    return [...builtinActivityResources, ...customActivityResources];
  }
}
