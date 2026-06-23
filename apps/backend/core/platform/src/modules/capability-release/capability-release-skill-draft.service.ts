import { Injectable } from '@nestjs/common';
import { CapabilityReleaseBrowserRecordingService } from './capability-release-browser-recording.service';
import { CapabilityReleaseTemporalSchemaService } from './capability-release-temporal-schema.service';
import {
  CapabilityReleaseDTO,
  CapabilitySourceSnapshotDTO,
  CapabilityValidationDTO,
} from './interfaces';

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const isExecutionFlowDocumentRenderEndpoint = (value: unknown): boolean => {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  const normalized = value.trim();
  return normalized.includes('/api/carbone/render-resolved');
};

@Injectable()
export class CapabilityReleaseSkillDraftService {
  constructor(
    private readonly capabilityReleaseBrowserRecordingService: CapabilityReleaseBrowserRecordingService,
    private readonly capabilityReleaseTemporalSchemaService: CapabilityReleaseTemporalSchemaService
  ) {}

  buildSkillDraftPayload(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    validation: CapabilityValidationDTO
  ) {
    const payload = snapshot.sourcePayload;
    const baseName = this.extractSourceName(payload) || `Release-${release.releaseVersion}`;
    const rawParamsSchema = this.parseJson(payload.paramsSchema) as Record<string, unknown> | null;
    const paramsSchema =
      release.sourceType === 'temporal_workflow'
        ? this.capabilityReleaseTemporalSchemaService.resolveEffectiveTemporalParamsSchema(payload)
        : rawParamsSchema && typeof rawParamsSchema === 'object'
          ? rawParamsSchema
          : {};
    const workflowDsl = (this.parseJson(payload.workflowDsl) as Record<string, unknown>) || {};
    const outputParams = this.parseJson(payload.outputParams) as Record<string, unknown> | null;
    const resolvedOutputParams =
      outputParams && Object.keys(outputParams).length > 0
        ? outputParams
        : this.capabilityReleaseTemporalSchemaService.buildTemporalOutputParamsFromValidation(
            validation
          );
    const expectedResult =
      typeof payload.expectedResult === 'string' && payload.expectedResult.trim()
        ? payload.expectedResult.trim()
        : this.capabilityReleaseTemporalSchemaService.extractTemporalExpectedResult({
            ...workflowDsl,
            outputParams: resolvedOutputParams,
          }) || undefined;
    const workflowSteps = Array.isArray(payload.workflowSteps)
      ? payload.workflowSteps
      : this.buildTemporalWorkflowSteps(workflowDsl);
    const executionFlowKeys = Array.isArray(payload.executionFlowKeys)
      ? payload.executionFlowKeys.filter((item): item is string => typeof item === 'string')
      : [];
    const description =
      release.sourceType === 'temporal_workflow'
        ? this.buildTemporalSkillDescription(payload, baseName)
        : this.sanitizeSkillNarrative(
            String(payload.description || payload.goal || `${baseName} 自动生成技能`)
          );
    const matchSummary = this.buildSkillMatchSummary(payload, baseName, expectedResult);
    const paramCollectionGuidance = this.buildParamCollectionGuidance(paramsSchema || {});
    const validationRules = this.buildValidationRules(payload);
    const preservedRuntimeMetadata = this.extractRuntimeMetadataFromDraftPayload(payload);
    const temporalRuntimeMetadata =
      release.sourceType === 'temporal_workflow'
        ? this.hydrateTemporalRuntimeMetadata(preservedRuntimeMetadata, workflowDsl)
        : preservedRuntimeMetadata;

    const finalDescription =
      description.length > 500 ? description.slice(0, 497) + '...' : description;

    if (release.sourceType === 'browser_recording') {
      const browserExecutionFlow =
        this.capabilityReleaseBrowserRecordingService.normalizeExecutionFlow(payload.executionFlow);
      const tools = this.capabilityReleaseBrowserRecordingService.mergeToolsWithExecutionFlow(
        payload.tools,
        browserExecutionFlow
      );
      const apiEndpoints =
        payload.apiEndpoints &&
        typeof payload.apiEndpoints === 'object' &&
        !Array.isArray(payload.apiEndpoints)
          ? (payload.apiEndpoints as Record<string, unknown>)
          : {
              runtimeMetadata: {
                sourceType: 'browser_recording',
                matchSummary,
                paramCollectionGuidance,
                validationRules,
                goal: typeof payload.goal === 'string' ? payload.goal : undefined,
                expectedResult,
              },
            };

      return {
        name: baseName,
        description: finalDescription,
        triggerKeywords: executionFlowKeys.length > 0 ? executionFlowKeys : [baseName],
        paramsSchema: paramsSchema || { properties: {}, required: [] },
        executionFlowTemplateIds: [],
        executionFlow: browserExecutionFlow,
        tools,
        apiEndpoints,
        validationId: validation.id,
      };
    }

    if (release.sourceType === 'execution_flow_template') {
      const preservedOutputParams = asRecord(preservedRuntimeMetadata.outputParams);
      return {
        name: baseName.replace(/流程$/, ''),
        description: finalDescription,
        triggerKeywords: executionFlowKeys.length > 0 ? executionFlowKeys : [baseName],
        paramsSchema: paramsSchema || { properties: {}, required: [] },
        executionFlowTemplateIds: release.sourceId ? [release.sourceId] : [],
        tools: ['skill_match', 'flow_execute'],
        apiEndpoints: {
          runtimeMetadata: {
            ...preservedRuntimeMetadata,
            sourceType: 'execution_flow_template',
            sourceTemplate:
              asRecord(preservedRuntimeMetadata.sourceTemplate) ||
              this.extractExecutionFlowSourceTemplate(payload),
            goal: this.pickFirstNonEmptyString(payload.goal, preservedRuntimeMetadata.goal),
            expectedResult: this.pickFirstNonEmptyString(
              expectedResult,
              preservedRuntimeMetadata.expectedResult
            ),
            outputParams: resolvedOutputParams || preservedOutputParams || {},
            matchSummary: this.pickFirstNonEmptyString(
              preservedRuntimeMetadata.matchSummary,
              matchSummary
            ),
            paramCollectionGuidance: this.pickFirstNonEmptyString(
              preservedRuntimeMetadata.paramCollectionGuidance,
              paramCollectionGuidance
            ),
            validationRules: this.pickFirstNonEmptyString(
              preservedRuntimeMetadata.validationRules,
              validationRules
            ),
          },
        },
        validationId: validation.id,
      };
    }

    const preservedOutputParams = asRecord(preservedRuntimeMetadata.outputParams);
    return {
      name: baseName.replace(/工作流$/, ''),
      description: finalDescription,
      triggerKeywords: executionFlowKeys.length > 0 ? executionFlowKeys : [baseName],
      paramsSchema: paramsSchema || { properties: {}, required: [] },
      executionFlowTemplateIds: release.sourceId ? [release.sourceId] : [],
      tools: ['skill_match', 'flow_execute'],
      apiEndpoints: {
        runtimeMetadata: {
          ...temporalRuntimeMetadata,
          matchSummary: this.pickFirstNonEmptyString(
            temporalRuntimeMetadata.matchSummary,
            matchSummary
          ),
          paramCollectionGuidance: this.pickFirstNonEmptyString(
            temporalRuntimeMetadata.paramCollectionGuidance,
            paramCollectionGuidance
          ),
          validationRules: this.pickFirstNonEmptyString(
            temporalRuntimeMetadata.validationRules,
            validationRules
          ),
          sourceType: 'temporal_workflow',
          sourceTemplate:
            asRecord(temporalRuntimeMetadata.sourceTemplate) ||
            this.capabilityReleaseTemporalSchemaService.extractTemporalSourceTemplate(
              (this.parseJson(payload.workflowDsl) as Record<string, unknown>) || {},
              (this.parseJson(payload.activityDsl) as Record<string, unknown>) || {}
            ),
          goal: this.pickFirstNonEmptyString(payload.goal, temporalRuntimeMetadata.goal),
          expectedResult: this.pickFirstNonEmptyString(
            expectedResult,
            temporalRuntimeMetadata.expectedResult
          ),
          outputParams: resolvedOutputParams || preservedOutputParams || {},
          taskQueue: this.pickFirstNonEmptyString(
            payload.taskQueue,
            temporalRuntimeMetadata.taskQueue
          ),
          workflowSteps,
        },
      },
      validationId: validation.id,
    };
  }

  buildTemporalExecutionFlowKeys(
    workflowName: string,
    workflowDsl: Record<string, unknown>,
    activityDsl: Record<string, unknown>
  ): string[] {
    const candidates = new Set<string>();
    [workflowName, workflowDsl.name]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .forEach((item) => candidates.add(item.trim()));

    const activities = Array.isArray(activityDsl.activities) ? activityDsl.activities : [];
    activities.forEach((activity) => {
      if (activity && typeof activity === 'object') {
        const record = activity as Record<string, unknown>;
        if (typeof record.name === 'string' && record.name.trim()) {
          candidates.add(record.name.trim());
        }
      }
    });

    return Array.from(candidates).slice(0, 10);
  }

  buildTemporalWorkflowSteps(
    workflowDsl: Record<string, unknown>
  ): Array<{ id?: string; name?: string; type?: string; activityName?: string }> {
    const steps = Array.isArray(workflowDsl.steps) ? workflowDsl.steps : [];
    return steps
      .filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === 'object')
      .map((step) => ({
        id: typeof step.id === 'string' ? step.id : undefined,
        name: typeof step.name === 'string' ? step.name : undefined,
        type: typeof step.type === 'string' ? step.type : undefined,
        activityName: typeof step.activityName === 'string' ? step.activityName : undefined,
      }));
  }

  extractExecutionFlowSourceTemplate(
    payload: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    const declaredSourceTemplate =
      this.parseJson<Record<string, unknown>>(payload.sourceTemplate) || {};
    const steps = this.parseJson<Array<Record<string, unknown>>>(payload.steps) || [];
    const paramsSchema = this.parseJson<Record<string, unknown>>(payload.paramsSchema) || {};
    const paramsProperties =
      paramsSchema.properties && typeof paramsSchema.properties === 'object'
        ? (paramsSchema.properties as Record<string, unknown>)
        : paramsSchema;
    const renderStep = steps.find((step) => {
      const api =
        step?.api && typeof step.api === 'object' ? (step.api as Record<string, unknown>) : {};
      return isExecutionFlowDocumentRenderEndpoint(api.endpoint);
    });
    const renderApi =
      renderStep?.api && typeof renderStep.api === 'object'
        ? (renderStep.api as Record<string, unknown>)
        : {};
    const renderBody =
      renderApi.body && typeof renderApi.body === 'object'
        ? (renderApi.body as Record<string, unknown>)
        : {};

    const sourceTemplate = {
      templateId: this.pickFirstNonEmptyString(
        declaredSourceTemplate.templateId,
        payload.templateId,
        payload.template_id,
        renderBody.templateId,
        renderBody.template_id
      ),
      skillId: this.pickFirstNonEmptyString(
        declaredSourceTemplate.skillId,
        payload.skillId,
        payload.skill_id,
        renderBody.skillId,
        renderBody.skill_id
      ),
      fileName: this.pickFirstNonEmptyString(
        declaredSourceTemplate.fileName,
        payload.fileName,
        payload.file_name,
        renderBody.fileName,
        renderBody.file_name
      ),
      format: this.pickFirstNonEmptyString(
        declaredSourceTemplate.format,
        payload.outputFormat,
        payload.output_format,
        payload.format,
        renderBody.outputFormat,
        renderBody.output_format,
        renderBody.format
      ),
      variableCount: this.pickFirstPositiveNumber(
        declaredSourceTemplate.variableCount,
        Object.keys(paramsProperties).length
      ),
    };

    const isDocumentCategory =
      typeof payload.category === 'string' && payload.category === 'document';
    if (
      !sourceTemplate.templateId &&
      !sourceTemplate.skillId &&
      !sourceTemplate.fileName &&
      !isDocumentCategory
    ) {
      return undefined;
    }

    return sourceTemplate;
  }

  private buildTemporalSkillDescription(
    payload: Record<string, unknown>,
    baseName: string
  ): string {
    const baseDescription =
      typeof payload.description === 'string' &&
      this.sanitizeSkillNarrative(payload.description).trim()
        ? this.sanitizeSkillNarrative(payload.description).trim()
        : `${baseName} 自动生成技能`;
    return baseDescription;
  }

  private sanitizeSkillNarrative(value: string): string {
    const text = String(value || '').trim();
    if (!text) {
      return '';
    }

    const markers = [
      /\n\s*输入参数\s*[：:]/,
      /\n\s*参数定义\s*[：:]/,
      /\n\s*请求参数\s*[：:]/,
      /\n\s*必填参数\s*[：:]/,
      /\n\s*参数列表\s*[：:]/,
    ];

    let sliced = text;
    for (const marker of markers) {
      const match = sliced.match(marker);
      if (match?.index !== undefined) {
        sliced = sliced.slice(0, match.index).trim();
        break;
      }
    }

    return sliced
      .replace(/\s*\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private buildSkillMatchSummary(
    payload: Record<string, unknown>,
    baseName: string,
    expectedResult?: string
  ): string {
    const parts: string[] = [];
    const description =
      typeof payload.description === 'string'
        ? this.sanitizeSkillNarrative(payload.description).trim()
        : '';
    const goal =
      typeof payload.goal === 'string' ? this.sanitizeSkillNarrative(payload.goal).trim() : '';
    const normalizedExpectedResult =
      typeof expectedResult === 'string' ? this.sanitizeSkillNarrative(expectedResult).trim() : '';

    if (description) {
      parts.push(description);
    } else {
      parts.push(`${baseName} 自动生成技能`);
    }

    if (
      normalizedExpectedResult &&
      normalizedExpectedResult !== description &&
      normalizedExpectedResult !== goal &&
      normalizedExpectedResult.length <= 80
    ) {
      parts.push(`输出：${normalizedExpectedResult}`);
    }

    return parts.join('；').slice(0, 240);
  }

  private buildParamCollectionGuidance(paramsSchema: Record<string, unknown>): string | undefined {
    const schema =
      paramsSchema && typeof paramsSchema === 'object'
        ? (paramsSchema as Record<string, unknown>)
        : undefined;
    const properties =
      schema?.properties && typeof schema.properties === 'object'
        ? (schema.properties as Record<string, unknown>)
        : undefined;
    const required = Array.isArray(schema?.required)
      ? schema.required.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : [];

    if (!properties || Object.keys(properties).length === 0) {
      return undefined;
    }

    const orderedKeys = [
      ...required,
      ...Object.keys(properties).filter((key) => !required.includes(key)),
    ];

    const lines = orderedKeys.map((key) => {
      const definition =
        properties[key] && typeof properties[key] === 'object'
          ? (properties[key] as Record<string, unknown>)
          : {};
      const label =
        typeof definition.description === 'string' && definition.description.trim()
          ? definition.description.trim()
          : key;
      return `${key}: ${label}${required.includes(key) ? '（必填）' : '（可选）'}`;
    });

    return `收集参数时，请优先补齐以下信息：${lines.join('；')}`.slice(0, 600);
  }

  private buildValidationRules(payload: Record<string, unknown>): string | undefined {
    const goal =
      typeof payload.goal === 'string' ? this.sanitizeSkillNarrative(payload.goal).trim() : '';
    return goal || undefined;
  }

  private hydrateTemporalRuntimeMetadata(
    runtimeMetadata: Record<string, unknown>,
    workflowDsl: Record<string, unknown>
  ): Record<string, unknown> {
    const workflowInputPolicy =
      this.capabilityReleaseTemporalSchemaService.extractTemporalWorkflowInputPolicy(workflowDsl);
    const mappingHints = this.buildTemporalWorkflowMappingHints(workflowDsl, workflowInputPolicy);

    return {
      ...runtimeMetadata,
      ...(asRecord(runtimeMetadata.workflowInputPolicy)
        ? {}
        : workflowInputPolicy
          ? { workflowInputPolicy }
          : {}),
      ...(Array.isArray(runtimeMetadata.mappingHints) && runtimeMetadata.mappingHints.length > 0
        ? {}
        : mappingHints.length > 0
          ? { mappingHints }
          : {}),
    };
  }

  private buildTemporalWorkflowMappingHints(
    workflowDsl: Record<string, unknown>,
    workflowInputPolicy?: Record<string, unknown>
  ): Array<Record<string, string>> {
    const inputParams = this.parseJson<Record<string, unknown>>(workflowDsl.inputParams) || {};
    const workflowInputPolicies = asRecord(workflowInputPolicy?.params) || {};

    return Object.entries(inputParams).flatMap(([key, value]) => {
      const definition = asRecord(value) || {};
      const workflowPolicy = asRecord(workflowInputPolicies[key]) || {};
      const renderPath =
        this.capabilityReleaseTemporalSchemaService.resolveTemporalWorkflowRenderPath(
          definition,
          workflowPolicy
        );
      const renderPaths =
        typeof renderPath === 'string' ? [renderPath] : Array.isArray(renderPath) ? renderPath : [];

      return renderPaths.map((path) => ({
        parameter: key,
        path,
      }));
    });
  }

  private extractRuntimeMetadataFromDraftPayload(
    payload: Record<string, unknown>
  ): Record<string, unknown> {
    return asRecord(asRecord(payload.apiEndpoints)?.runtimeMetadata) || {};
  }

  private extractSourceName(payload: Record<string, unknown>): string | null {
    const name = payload.name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  }

  private pickFirstNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private pickFirstPositiveNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    return undefined;
  }

  private parseJson<T = unknown>(value: unknown): T {
    if (value === null || value === undefined) {
      return value as T;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    }
    return value as T;
  }
}
