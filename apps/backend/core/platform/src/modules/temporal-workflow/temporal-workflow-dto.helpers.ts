import { TemporalWorkflow } from '../../prisma/client';
import {
  DEFAULT_TEMPLATE_WORKFLOW_DSL,
  type ActivityDsl,
  type TemporalWorkflowArtifactDTO,
  type TemporalWorkflowDTO,
  type TemporalWorkflowSourceContext,
  type TemporalWorkflowSourceTemplate,
  type WorkflowDsl,
} from './temporal-workflow.types';
import {
  parseJson,
  pickFirstNonEmptyString,
  pickFirstPositiveNumber,
} from './temporal-workflow-json.utils';

export function toTemporalWorkflowDto(workflow: TemporalWorkflow): TemporalWorkflowDTO {
  const workflowDsl = parseJson<WorkflowDsl>(workflow.workflowDsl) || DEFAULT_TEMPLATE_WORKFLOW_DSL;
  const activityDsl = parseJson<ActivityDsl>(workflow.activityDsl) || { activities: [] };
  const extractedSourceTemplate = extractSourceTemplate(workflowDsl, activityDsl);
  const extractedSourceContext = extractSourceContext(workflowDsl, activityDsl);
  const validationResult =
    parseJson<Record<string, unknown>>(workflow.validationResultJson) || null;
  return {
    ...workflow,
    workflowDsl: workflowDsl as any,
    activityDsl: activityDsl as any,
    sourceTemplate: extractedSourceTemplate,
    sourceContext: extractedSourceContext,
    validationResult,
  };
}

export function toTemporalWorkflowArtifactDto(
  workflow: TemporalWorkflow
): TemporalWorkflowArtifactDTO {
  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    taskQueue: workflow.taskQueue,
    artifactVersion: Number((workflow as any).artifactVersion || 0),
    artifactHash: (workflow as any).artifactHash || null,
    generatedCode: workflow.generatedCode || null,
    validationStatus: ((workflow as any).validationStatus || 'draft') as string,
    validationScore: Number((workflow as any).validationScore || 0),
    validatedAt: (workflow as any).validatedAt || null,
    validationResult:
      parseJson<Record<string, unknown>>((workflow as any).validationResultJson) || null,
  };
}

export function extractSourceContext(
  workflowDsl: WorkflowDsl | Record<string, unknown> | null | undefined,
  activityDsl: ActivityDsl | Record<string, unknown> | null | undefined
): TemporalWorkflowSourceContext | null {
  const workflowRecord =
    workflowDsl && typeof workflowDsl === 'object' ? (workflowDsl as Record<string, unknown>) : {};
  const declaredSourceContext =
    parseJson<Record<string, unknown>>(workflowRecord.sourceContext) || {};
  const sourceTemplate = extractSourceTemplate(workflowDsl, activityDsl);
  const sourceType = pickFirstNonEmptyString(
    declaredSourceContext.sourceType,
    sourceTemplate ? 'template' : undefined
  ) as TemporalWorkflowSourceContext['sourceType'];
  const warnings = Array.isArray(declaredSourceContext.warnings)
    ? declaredSourceContext.warnings.filter(
        (item): item is string => typeof item === 'string' && !!item.trim()
      )
    : [];

  if (
    !sourceType &&
    !sourceTemplate &&
    !declaredSourceContext.referenceUrl &&
    !declaredSourceContext.userDescription &&
    warnings.length === 0
  ) {
    return null;
  }

  return {
    sourceType: sourceType || (sourceTemplate ? 'template' : undefined),
    referenceUrl: pickFirstNonEmptyString(declaredSourceContext.referenceUrl),
    userDescription: pickFirstNonEmptyString(declaredSourceContext.userDescription),
    generatedAt: pickFirstNonEmptyString(declaredSourceContext.generatedAt),
    warnings,
    sourceTemplate,
  };
}

export function extractSourceTemplate(
  workflowDsl: WorkflowDsl | Record<string, unknown> | null | undefined,
  activityDsl: ActivityDsl | Record<string, unknown> | null | undefined
): TemporalWorkflowSourceTemplate | null {
  const workflowRecord =
    workflowDsl && typeof workflowDsl === 'object' ? (workflowDsl as Record<string, unknown>) : {};
  const workflowLevelSource = parseJson<Record<string, unknown>>(workflowRecord.sourceTemplate);
  const workflowLevelSourceContext =
    parseJson<Record<string, unknown>>(workflowRecord.sourceContext) || {};
  const workflowLevelSourceTemplate =
    parseJson<Record<string, unknown>>(workflowLevelSourceContext.sourceTemplate) || {};

  const activities = Array.isArray((activityDsl as ActivityDsl | undefined)?.activities)
    ? (activityDsl as ActivityDsl).activities
    : [];
  const carboneActivity = activities.find((activity) => {
    if (activity?.handler === 'carbone') {
      return true;
    }
    const steps = Array.isArray(activity?.config?.steps) ? activity.config.steps : [];
    return steps.some((step: Record<string, any>) => step?.type === 'carbone');
  });
  const carboneStep = Array.isArray(carboneActivity?.config?.steps)
    ? carboneActivity?.config?.steps.find((step: Record<string, any>) => step?.type === 'carbone')
    : null;

  const sourceTemplate: TemporalWorkflowSourceTemplate = {
    templateId: pickFirstNonEmptyString(
      workflowLevelSource?.templateId,
      workflowLevelSourceTemplate?.templateId,
      carboneStep?.config?.templateId,
      carboneActivity?.config?.templateId
    ),
    skillId: pickFirstNonEmptyString(
      workflowLevelSource?.skillId,
      workflowLevelSourceTemplate?.skillId,
      carboneActivity?.config?.skillId
    ),
    fileName: pickFirstNonEmptyString(
      workflowLevelSource?.fileName,
      workflowLevelSourceTemplate?.fileName,
      carboneActivity?.config?.fileName
    ),
    format: pickFirstNonEmptyString(
      workflowLevelSource?.format,
      workflowLevelSourceTemplate?.format,
      carboneStep?.config?.format,
      carboneActivity?.config?.format
    ),
    variableCount: pickFirstPositiveNumber(
      workflowLevelSource?.variableCount,
      workflowLevelSourceTemplate?.variableCount,
      carboneActivity?.config?.variableCount,
      Object.keys(parseJson<Record<string, unknown>>(workflowRecord.inputParams) || {}).length
    ),
  };

  if (!sourceTemplate.templateId && !sourceTemplate.skillId && !sourceTemplate.fileName) {
    return null;
  }

  return sourceTemplate;
}
