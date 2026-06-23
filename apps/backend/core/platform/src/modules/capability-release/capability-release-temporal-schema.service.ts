import { Injectable } from '@nestjs/common';
import { resolveFriendlyInputDisplayName } from '../../common/input-label';
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

@Injectable()
export class CapabilityReleaseTemporalSchemaService {
  extractTemporalGoal(
    workflowDsl: Record<string, unknown>,
    fallbackDescription?: string | null
  ): string | null {
    const extraPrompt = workflowDsl.extraPrompt;
    if (typeof extraPrompt === 'string' && extraPrompt.trim()) {
      return extraPrompt.trim();
    }
    return typeof fallbackDescription === 'string' && fallbackDescription.trim()
      ? fallbackDescription.trim()
      : null;
  }

  extractTemporalExpectedResult(workflowDsl: Record<string, unknown>): string | null {
    const outputParams = this.parseJson<Record<string, unknown>>(workflowDsl.outputParams) || {};
    const entries = Object.entries(outputParams)
      .map(([key, value]) => {
        const definition =
          value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
        const description =
          typeof definition.description === 'string' ? definition.description.trim() : '';
        return description ? `${key}: ${description}` : key;
      })
      .filter(Boolean);

    return entries.length > 0 ? entries.join('; ') : null;
  }

  buildTemporalOutputParamsFromValidation(
    validation: CapabilityValidationDTO
  ): Record<string, unknown> {
    const snapshot =
      validation.resultSnapshot && typeof validation.resultSnapshot === 'object'
        ? validation.resultSnapshot
        : {};
    const resultContainer =
      this.parseJson<Record<string, unknown>>((snapshot as Record<string, unknown>).result) || {};
    const rawResult = this.parseJson<Record<string, unknown>>(resultContainer.result) || {};
    const properties = Object.entries(rawResult).reduce<Record<string, unknown>>(
      (acc, [key, value]) => {
        acc[key] = {
          type: this.inferTemporalParamType(value, key),
          description: `Workflow 输出字段 ${key}`,
        };
        return acc;
      },
      {}
    );
    return properties;
  }

  resolveEffectiveTemporalParamsSchema(payload: Record<string, unknown>): Record<string, unknown> {
    const workflowDsl = (this.parseJson(payload.workflowDsl) as Record<string, unknown>) || {};
    const activityDsl = (this.parseJson(payload.activityDsl) as Record<string, unknown>) || {};
    const rawSchema = this.parseJson(payload.paramsSchema) as Record<string, unknown> | null;
    const inferredSchema = this.buildTemporalParamsSchema(workflowDsl, activityDsl);

    if (!rawSchema || typeof rawSchema !== 'object') {
      return inferredSchema;
    }

    const rawProperties =
      rawSchema.properties && typeof rawSchema.properties === 'object'
        ? (rawSchema.properties as Record<string, unknown>)
        : {};
    const inferredProperties =
      inferredSchema.properties && typeof inferredSchema.properties === 'object'
        ? (inferredSchema.properties as Record<string, unknown>)
        : {};
    const rawRequired = Array.isArray(rawSchema.required)
      ? rawSchema.required.filter((item): item is string => typeof item === 'string')
      : [];
    const inferredRequired = Array.isArray(inferredSchema.required)
      ? inferredSchema.required.filter((item): item is string => typeof item === 'string')
      : [];
    const inferredPropertyKeys = new Set(Object.keys(inferredProperties));
    const finalRequired = Array.from(
      new Set([...rawRequired.filter((key) => !inferredPropertyKeys.has(key)), ...inferredRequired])
    );

    const mergedProperties = Object.entries(inferredProperties).reduce<Record<string, unknown>>(
      (acc, [key, inferredValue]) => {
        const rawValue = rawProperties[key];
        const isRequired = finalRequired.includes(key);
        acc[key] =
          rawValue && typeof rawValue === 'object'
            ? {
                ...(inferredValue as Record<string, unknown>),
                ...(rawValue as Record<string, unknown>),
                ...((rawValue as Record<string, unknown>).default === undefined &&
                (inferredValue as Record<string, unknown>).default !== undefined
                  ? { default: (inferredValue as Record<string, unknown>).default }
                  : {}),
                required: isRequired,
              }
            : inferredValue;
        return acc;
      },
      { ...rawProperties }
    );

    return {
      ...rawSchema,
      ...inferredSchema,
      properties: mergedProperties,
      required: finalRequired,
    };
  }

  buildTemporalParamsSchema(
    workflowDsl: Record<string, unknown>,
    activityDsl?: Record<string, unknown>
  ): Record<string, unknown> {
    const inputParams = this.parseJson<Record<string, unknown>>(workflowDsl.inputParams) || {};
    const workflowInputPolicy = this.extractTemporalWorkflowInputPolicy(workflowDsl);
    const workflowInputPolicies = asRecord(workflowInputPolicy?.params) || {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    Object.entries(inputParams).forEach(([key, value]) => {
      const definition =
        value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
      const workflowPolicy = asRecord(workflowInputPolicies[key]) || {};
      const requiredMode =
        typeof workflowPolicy.requiredMode === 'string'
          ? workflowPolicy.requiredMode.trim()
          : undefined;
      const isRequired = requiredMode ? requiredMode === 'always' : Boolean(definition.required);
      const description =
        typeof definition.description === 'string'
          ? definition.description.trim()
          : `Workflow 输入参数 ${key}`;
      const localizedDefaultValue = asRecord(definition.localizedDefaultValue);
      const policyDefaultValue = this.normalizeCapabilityDefaultValue(workflowPolicy.defaultValue);
      const definitionDefaultValue =
        definition.defaultValue !== undefined && definition.defaultValue !== ''
          ? definition.defaultValue
          : localizedDefaultValue && Object.keys(localizedDefaultValue).length > 0
            ? localizedDefaultValue
            : undefined;
      const defaultValue =
        policyDefaultValue !== undefined ? policyDefaultValue : definitionDefaultValue;
      const normalizedDefaultValue = this.normalizeCapabilityDefaultValue(defaultValue);
      const inferredType =
        this.normalizeDeclaredTemporalParamType(definition.type, key) ||
        this.inferTemporalParamType(
          normalizedDefaultValue !== undefined ? normalizedDefaultValue : definition.exampleValue,
          description,
          key
        );
      const displayName = this.resolveTemporalParamDisplayName(key, definition, description);
      const renderPath = this.resolveTemporalWorkflowRenderPath(definition, workflowPolicy);

      properties[key] = {
        type: inferredType,
        description,
        ...(displayName ? { displayName } : {}),
        ...(typeof definition.groupLabel === 'string' && definition.groupLabel.trim()
          ? { groupLabel: definition.groupLabel.trim() }
          : {}),
        ...(typeof definition.semanticRole === 'string' && definition.semanticRole.trim()
          ? { semanticRole: definition.semanticRole.trim() }
          : {}),
        ...(Array.isArray(definition.extractionHints)
          ? {
              extractionHints: definition.extractionHints
                .filter(
                  (item): item is string => typeof item === 'string' && item.trim().length > 0
                )
                .map((item) => item.trim()),
            }
          : {}),
        ...(renderPath ? { renderPath } : {}),
        required: isRequired,
        ...(!isRequired && normalizedDefaultValue !== undefined
          ? { default: normalizedDefaultValue }
          : {}),
        extractionPrompt: description,
      };

      if (isRequired) {
        required.push(key);
      }
    });

    if (Object.keys(properties).length === 0) {
      const inferredFromActivities = this.inferTemporalParamsFromActivityDsl(activityDsl);
      const steps = Array.isArray(workflowDsl.steps) ? workflowDsl.steps : [];
      steps.forEach((step) => {
        if (!step || typeof step !== 'object') {
          return;
        }
        const stepRecord = step as Record<string, unknown>;
        const input = this.parseJson<Record<string, unknown>>(stepRecord.input) || {};
        Object.entries(input).forEach(([key, value]) => {
          if (properties[key]) {
            return;
          }

          let description = `Workflow 输入参数 ${key}`;
          if (key === 'city') {
            description = '城市名称';
          } else if (key === 'format') {
            description = '返回格式';
          } else if (key === 'timeout') {
            description = '超时时间';
          }

          properties[key] = {
            type:
              this.normalizeDeclaredTemporalParamType(undefined, key) ||
              this.inferTemporalParamType(value, description, key),
            description,
            ...(this.normalizeCapabilityDefaultValue(inferredFromActivities[key]?.default) !==
            undefined
              ? {
                  default: this.normalizeCapabilityDefaultValue(
                    inferredFromActivities[key]?.default
                  ),
                }
              : this.normalizeCapabilityDefaultValue(key === 'timeout' ? value : undefined) !==
                  undefined
                ? { default: this.normalizeCapabilityDefaultValue(value) }
                : {}),
            ...(inferredFromActivities[key]?.required ? { required: true } : {}),
            extractionPrompt: description,
          };

          if (inferredFromActivities[key]?.required) {
            required.push(key);
          }
        });
      });
    }

    return { properties, required };
  }

  assessTemporalDocumentMappingReadiness(payload: Record<string, unknown>): {
    applicable: boolean;
    mappedInputCount: number;
    renderPathParamCount: number;
    templateBindingParamCount: number;
  } {
    const workflowDsl = (this.parseJson(payload.workflowDsl) as Record<string, unknown>) || {};
    const activityDsl = (this.parseJson(payload.activityDsl) as Record<string, unknown>) || {};
    const declaredPayloadSourceTemplate =
      this.parseJson<Record<string, unknown>>(payload.sourceTemplate) || {};
    const sourceContext = this.parseJson<Record<string, unknown>>(workflowDsl.sourceContext) || {};
    const sourceContextTemplate =
      this.parseJson<Record<string, unknown>>(sourceContext.sourceTemplate) || {};
    const extractedSourceTemplate =
      this.extractTemporalSourceTemplate(workflowDsl, activityDsl) || {};
    const sourceTemplate = {
      ...extractedSourceTemplate,
      ...sourceContextTemplate,
      ...declaredPayloadSourceTemplate,
    };
    const applicable = [
      sourceTemplate.templateId,
      sourceTemplate.fileName,
      sourceTemplate.skillId,
    ].some((value) => typeof value === 'string' && value.trim().length > 0);

    if (!applicable) {
      return {
        applicable: false,
        mappedInputCount: 0,
        renderPathParamCount: 0,
        templateBindingParamCount: 0,
      };
    }

    const inputParams = this.parseJson<Record<string, unknown>>(workflowDsl.inputParams) || {};
    const workflowInputPolicy = this.extractTemporalWorkflowInputPolicy(workflowDsl);
    const workflowInputPolicies = asRecord(workflowInputPolicy?.params) || {};
    let renderPathParamCount = 0;
    let templateBindingParamCount = 0;
    let mappedInputCount = 0;

    Object.entries(inputParams).forEach(([key, value]) => {
      const definition = asRecord(value) || {};
      const policy = asRecord(workflowInputPolicies[key]) || {};
      const renderPath = this.normalizeTemporalWorkflowRenderPath(definition.renderPath);
      const templateBinding =
        typeof policy.templateBinding === 'string' && policy.templateBinding.trim()
          ? policy.templateBinding.trim()
          : undefined;
      if (renderPath) {
        renderPathParamCount += 1;
      }
      if (templateBinding) {
        templateBindingParamCount += 1;
      }
      if (renderPath || templateBinding) {
        mappedInputCount += 1;
      }
    });

    return {
      applicable,
      mappedInputCount,
      renderPathParamCount,
      templateBindingParamCount,
    };
  }

  buildSuggestedInputFromSchema(paramsSchema: Record<string, unknown>): Record<string, unknown> {
    const properties =
      paramsSchema && typeof paramsSchema === 'object'
        ? ((paramsSchema as Record<string, unknown>).properties as
            | Record<string, unknown>
            | undefined)
        : undefined;
    if (!properties) {
      return {};
    }

    return Object.entries(properties).reduce<Record<string, unknown>>((acc, [key, rawValue]) => {
      const definition =
        rawValue && typeof rawValue === 'object' ? (rawValue as Record<string, unknown>) : {};
      const type = typeof definition.type === 'string' ? definition.type : 'string';
      if (definition.default !== undefined) {
        acc[key] = this.normalizeSmokeInputValue(key, definition.default, type);
        return acc;
      }

      if (type === 'number') {
        acc[key] = 1;
      } else if (type === 'boolean') {
        acc[key] = true;
      } else if (type === 'array') {
        acc[key] = [];
      } else if (type === 'object') {
        acc[key] = {};
      } else if (type === 'date') {
        acc[key] = new Date().toISOString().split('T')[0];
      } else {
        acc[key] = this.normalizeSmokeInputValue(key, `test_${key}`, type);
      }

      return acc;
    }, {});
  }

  buildSmokeTestInput(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    environment: string
  ): Record<string, unknown> {
    const schema =
      release.sourceType === 'temporal_workflow'
        ? this.resolveEffectiveTemporalParamsSchema(snapshot.sourcePayload)
        : (this.parseJson(snapshot.sourcePayload.paramsSchema) as Record<string, unknown> | null) ||
          {};

    const suggestedInput = this.buildSuggestedInputFromSchema(schema);
    if (release.sourceType === 'temporal_workflow') {
      const workflowDsl =
        (this.parseJson(snapshot.sourcePayload.workflowDsl) as Record<string, unknown>) || {};
      const inputParams = this.parseJson<Record<string, unknown>>(workflowDsl.inputParams) || {};
      Object.entries(inputParams).forEach(([key, rawValue]) => {
        const definition =
          rawValue && typeof rawValue === 'object' ? (rawValue as Record<string, unknown>) : {};
        if (definition.defaultValue === undefined) {
          return;
        }
        const normalizedDefaultValue = this.normalizeCapabilityDefaultValue(
          definition.defaultValue
        );
        if (normalizedDefaultValue !== undefined) {
          const typeHint = typeof definition.type === 'string' ? definition.type : undefined;
          suggestedInput[key] = this.normalizeSmokeInputValue(
            key,
            normalizedDefaultValue,
            typeHint
          );
        }
      });
    }

    const fixedTestInput = this.resolveFixedTestInput(snapshot.sourcePayload, environment);

    return {
      ...suggestedInput,
      ...(fixedTestInput || {}),
      smokeTest: true,
      environment,
    };
  }

  private resolveFixedTestInput(
    sourcePayload: Record<string, unknown>,
    environment: string
  ): Record<string, unknown> | undefined {
    const deploymentProfiles = asRecord(sourcePayload.deploymentProfiles) || {};
    const environmentProfile = asRecord(deploymentProfiles[environment]) || {};
    const candidateInputs = [
      environmentProfile.smokeTestInput,
      environmentProfile.testInput,
      environmentProfile.validationInput,
      sourcePayload.smokeTestInput,
      sourcePayload.testInput,
      sourcePayload.validationInput,
    ];

    for (const candidate of candidateInputs) {
      const record = asRecord(candidate);
      if (record && Object.keys(record).length > 0) {
        return record;
      }
    }

    return undefined;
  }

  extractTemporalWorkflowInputPolicy(
    workflowDsl: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    const inputPolicy = this.parseJson<Record<string, unknown>>(workflowDsl.inputPolicy) || {};
    const rawParams =
      inputPolicy.params &&
      typeof inputPolicy.params === 'object' &&
      !Array.isArray(inputPolicy.params)
        ? (inputPolicy.params as Record<string, unknown>)
        : inputPolicy;
    const inputParams = this.parseJson<Record<string, unknown>>(workflowDsl.inputParams) || {};

    const params = Object.entries(rawParams || {}).reduce<Record<string, unknown>>(
      (acc, [key, value]) => {
        const policy = asRecord(value) || {};
        const inferredTemplateBinding = this.resolveSingleTemporalWorkflowBindingPath(
          this.normalizeTemporalWorkflowRenderPath(asRecord(inputParams[key])?.renderPath)
        );

        acc[key] = {
          ...policy,
          ...(typeof policy.templateBinding === 'string' && policy.templateBinding.trim()
            ? { templateBinding: policy.templateBinding.trim() }
            : inferredTemplateBinding
              ? { templateBinding: inferredTemplateBinding }
              : {}),
        };
        return acc;
      },
      {}
    );

    if (Object.keys(params).length === 0) {
      return undefined;
    }

    return { params };
  }

  resolveTemporalWorkflowRenderPath(
    definition: Record<string, unknown>,
    workflowPolicy: Record<string, unknown>
  ): string | string[] | undefined {
    const declaredRenderPath = this.normalizeTemporalWorkflowRenderPath(definition.renderPath);
    if (declaredRenderPath) {
      return declaredRenderPath;
    }

    return this.normalizeTemporalWorkflowRenderPath(workflowPolicy.templateBinding);
  }

  private normalizeTemporalWorkflowRenderPath(renderPath: unknown): string | string[] | undefined {
    if (typeof renderPath === 'string' && renderPath.trim()) {
      return renderPath.trim();
    }

    if (!Array.isArray(renderPath)) {
      return undefined;
    }

    const normalized = renderPath
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());

    if (normalized.length === 0) {
      return undefined;
    }

    return normalized.length === 1 ? normalized[0] : normalized;
  }

  private resolveSingleTemporalWorkflowBindingPath(
    renderPath: string | string[] | undefined
  ): string | undefined {
    return typeof renderPath === 'string' ? renderPath : undefined;
  }

  private resolveTemporalParamDisplayName(
    key: string,
    definition: Record<string, unknown>,
    description?: string
  ): string | undefined {
    const declaredDisplayName =
      typeof definition.displayName === 'string' ? definition.displayName.trim() : undefined;
    return resolveFriendlyInputDisplayName({
      name: key,
      display_name: declaredDisplayName,
      description,
    });
  }

  private normalizeCapabilityDefaultValue(value: unknown): unknown {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0 ? value : undefined;
    }
    if (Array.isArray(value)) {
      return value.length > 0 ? value : undefined;
    }
    if (typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>).length > 0 ? value : undefined;
    }
    return value;
  }

  private inferTemporalParamsFromActivityDsl(
    activityDsl?: Record<string, unknown>
  ): Record<string, { required: boolean; default?: unknown }> {
    const result: Record<string, { required: boolean; default?: unknown }> = {};
    const activities = Array.isArray(activityDsl?.activities) ? activityDsl.activities : [];

    activities.forEach((activity) => {
      if (!activity || typeof activity !== 'object') {
        return;
      }
      const record = activity as Record<string, unknown>;
      const config = this.parseJson<Record<string, unknown>>(record.config) || {};
      const configSteps = Array.isArray(config.steps) ? config.steps : [];

      configSteps.forEach((step) => {
        if (!step || typeof step !== 'object') {
          return;
        }
        const stepRecord = step as Record<string, unknown>;
        const inputParams = this.parseJson<Record<string, unknown>>(stepRecord.inputParams) || {};
        Object.entries(inputParams).forEach(([key, value]) => {
          if (result[key]?.required) {
            return;
          }
          result[key] = {
            required: result[key]?.required || false,
            default: value,
          };
        });
      });

      const generatedCode =
        typeof config.generatedCode === 'string'
          ? config.generatedCode
          : typeof record.generatedCode === 'string'
            ? record.generatedCode
            : '';

      if (!generatedCode.trim()) {
        return;
      }

      const getPattern = /input_data\.get\(\s*["']([A-Za-z0-9_]+)["'](?:\s*,\s*([^)]+))?\s*\)/g;
      let match: RegExpExecArray | null;
      while ((match = getPattern.exec(generatedCode))) {
        const [, key, defaultLiteral] = match;
        if (!key) {
          continue;
        }

        if (defaultLiteral === undefined) {
          result[key] = { required: true };
          continue;
        }

        if (result[key]?.required) {
          continue;
        }

        const normalizedDefault = defaultLiteral.trim();
        result[key] = {
          required: false,
          default: this.parsePythonLiteral(normalizedDefault),
        };
      }
    });

    return result;
  }

  private parsePythonLiteral(value: string): unknown {
    const normalized = value.trim();
    if (
      (normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'"))
    ) {
      return normalized.slice(1, -1);
    }
    if (normalized === 'True') {
      return true;
    }
    if (normalized === 'False') {
      return false;
    }
    if (normalized === 'None') {
      return null;
    }
    if (/^-?\d+(\.\d+)?$/.test(normalized)) {
      return Number(normalized);
    }
    return normalized;
  }

  private inferTemporalParamType(
    defaultValue: unknown,
    description: string,
    fieldName = ''
  ): 'string' | 'number' | 'date' | 'boolean' {
    if (typeof defaultValue === 'boolean') {
      return 'boolean';
    }
    if (typeof defaultValue === 'number') {
      return 'number';
    }
    if (typeof defaultValue === 'string') {
      const normalized = defaultValue.trim().toLowerCase();
      if (/^\d+[smh]$/.test(normalized)) {
        return 'string';
      }
      if (normalized === 'true' || normalized === 'false') {
        return 'boolean';
      }
      if (/^-?\d+(\.\d+)?$/.test(normalized)) {
        return 'number';
      }
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
        return 'date';
      }
    }

    const semanticHint = this.buildSemanticHint(fieldName, description);
    if (/\b(currency|curr)\b|币种|货币/.test(semanticHint)) {
      return 'string';
    }
    if (/\b(period|month|months|duration)\b|月数|期数|时长/.test(semanticHint)) {
      return 'number';
    }
    if (/日期|时间|\b(date|time)\b/.test(semanticHint)) {
      return 'date';
    }
    if (/数量|金额|\b(number|count|price|age)\b/.test(semanticHint)) {
      return 'number';
    }
    if (/是否|开关|启用|\b(true|false)\b/.test(semanticHint)) {
      return 'boolean';
    }
    return 'string';
  }

  private normalizeDeclaredTemporalParamType(
    declaredType: unknown,
    fieldName = ''
  ): 'string' | 'number' | 'date' | 'boolean' | undefined {
    const normalized = String(declaredType || '')
      .trim()
      .toLowerCase();
    if (!normalized) {
      return undefined;
    }

    const hint = this.buildSemanticHint(normalized, fieldName);
    if (/\b(date|time|datetime|timestamp)\b/.test(hint)) {
      return 'date';
    }
    if (/\b(bool|boolean)\b/.test(hint)) {
      return 'boolean';
    }
    if (
      /\b(number|int|integer|float|double|decimal|amount|price|count|qty|quantity|ratio|percent)\b/.test(
        hint
      )
    ) {
      return 'number';
    }
    return 'string';
  }

  private buildSemanticHint(...values: unknown[]): string {
    return values
      .filter((value) => value !== undefined && value !== null)
      .map((value) =>
        String(value)
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
          .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, ' ')
          .trim()
          .toLowerCase()
      )
      .filter((value) => value.length > 0)
      .join(' ');
  }

  private normalizeSmokeInputValue(key: string, value: unknown, typeHint?: string): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    const unquoted =
      trimmed.startsWith('`') && trimmed.endsWith('`') ? trimmed.slice(1, -1).trim() : trimmed;

    const type = String(typeHint || '').toLowerCase();
    const normalizedKey = String(key || '').trim();
    const isUrlLikeKey =
      /(^|[_-])(url|uri|link|endpoint|site|website)$/i.test(normalizedKey) ||
      /(?:url|uri|link|endpoint|site|website)$/i.test(normalizedKey);
    if (type === 'string' && isUrlLikeKey) {
      return this.normalizeUrlLikeSmokeValue(unquoted);
    }

    return unquoted;
  }

  private normalizeUrlLikeSmokeValue(value: string): string {
    const normalized = String(value || '').trim();
    if (!normalized || /^test[_-]?url$/i.test(normalized) || /^test_/i.test(normalized)) {
      return 'https://www.bing.com';
    }
    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }
    if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(normalized)) {
      return `https://${normalized}`;
    }
    return 'https://www.bing.com';
  }

  extractTemporalSourceTemplate(
    workflowDsl: Record<string, unknown>,
    activityDsl: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    const workflowSource =
      this.parseJson<Record<string, unknown>>(workflowDsl.sourceTemplate) || {};
    const activities = Array.isArray(activityDsl.activities)
      ? (activityDsl.activities as Array<Record<string, unknown>>)
      : [];
    const carboneActivity = activities.find((activity) => {
      if (activity?.handler === 'carbone') {
        return true;
      }
      const config =
        activity?.config && typeof activity.config === 'object'
          ? (activity.config as Record<string, unknown>)
          : {};
      const steps = Array.isArray(config.steps)
        ? (config.steps as Array<Record<string, unknown>>)
        : [];
      return steps.some((step) => step?.type === 'carbone');
    });
    const carboneConfig =
      carboneActivity?.config && typeof carboneActivity.config === 'object'
        ? (carboneActivity.config as Record<string, unknown>)
        : {};
    const carboneSteps = Array.isArray(carboneConfig.steps)
      ? (carboneConfig.steps as Array<Record<string, unknown>>)
      : [];
    const carboneStep = carboneSteps.find((step) => step?.type === 'carbone');
    const carboneStepConfig =
      carboneStep?.config && typeof carboneStep.config === 'object'
        ? (carboneStep.config as Record<string, unknown>)
        : {};
    const inputParams = this.parseJson<Record<string, unknown>>(workflowDsl.inputParams) || {};

    const sourceTemplate = {
      templateId: this.pickFirstNonEmptyString(
        workflowSource.templateId,
        carboneStepConfig.templateId,
        carboneConfig.templateId
      ),
      skillId: this.pickFirstNonEmptyString(workflowSource.skillId, carboneConfig.skillId),
      fileName: this.pickFirstNonEmptyString(workflowSource.fileName, carboneConfig.fileName),
      format: this.pickFirstNonEmptyString(
        workflowSource.format,
        carboneStepConfig.format,
        carboneConfig.format
      ),
      variableCount: this.pickFirstPositiveNumber(
        workflowSource.variableCount,
        carboneConfig.variableCount,
        Object.keys(inputParams).length
      ),
    };

    if (!sourceTemplate.templateId && !sourceTemplate.skillId && !sourceTemplate.fileName) {
      return undefined;
    }

    return sourceTemplate;
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
