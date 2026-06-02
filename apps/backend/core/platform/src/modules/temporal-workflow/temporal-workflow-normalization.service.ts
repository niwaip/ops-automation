import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BuiltinActivityRegistry } from './builtin-activity.registry';
import { resolveSingleWorkflowInputRenderPath } from './temporal-workflow-template.helpers';
import type {
  ActivityDsl,
  TemporalWorkflowSourceContext,
  WorkflowDsl,
  WorkflowInputParamDefinition,
  WorkflowInputParamType,
  WorkflowInputPolicy,
  WorkflowLocalizedValueMap,
  WorkflowParamPolicy,
  WorkflowParamRequiredMode,
  WorkflowStep,
} from './temporal-workflow.types';

@Injectable()
export class TemporalWorkflowNormalizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builtinActivityRegistry: BuiltinActivityRegistry,
  ) {}

  sanitizeJsonValue<T>(value: T): T {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.sanitizeJsonValue(item))
        .filter((item) => item !== undefined) as T;
    }
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
        if (item === undefined) {
          return acc;
        }
        acc[key] = this.sanitizeJsonValue(item);
        return acc;
      }, {}) as T;
    }
    return value;
  }

  normalizeActivityDsl(activityDsl: ActivityDsl): ActivityDsl {
    return this.sanitizeJsonValue(activityDsl) as ActivityDsl;
  }

  async normalizeWorkflowDsl(
    workflowDsl: WorkflowDsl,
    workflowName?: string,
    taskQueue?: string,
    activityDsl?: ActivityDsl,
  ): Promise<WorkflowDsl> {
    const normalized = this.sanitizeJsonValue(workflowDsl) as WorkflowDsl;
    const normalizedSteps = await Promise.all(
      (normalized.steps || []).map((step) => this.normalizeWorkflowStep(step, activityDsl)),
    );
    const normalizedInputParams = normalized.inputParams
      && typeof normalized.inputParams === 'object'
      && !Array.isArray(normalized.inputParams)
        ? normalized.inputParams
        : undefined;
    const normalizedInputPolicy = await this.normalizeWorkflowInputPolicy(
      normalized.inputPolicy,
      normalizedInputParams,
      normalized.sourceContext,
    );
    const finalName = this.normalizeName(workflowName || normalized.name || '未命名工作流');
    return {
      ...normalized,
      name: finalName,
      workflowClassName: this.normalizeWorkflowClassName(normalized.workflowClassName, finalName),
      taskQueue: this.normalizeTaskQueue(taskQueue || normalized.taskQueue),
      ...(normalizedInputParams ? { inputParams: normalizedInputParams } : {}),
      ...(normalizedInputPolicy ? { inputPolicy: normalizedInputPolicy } : {}),
      steps: normalizedSteps,
    };
  }

  buildDefaultWorkflowInputPolicyParams(
    inputParams: Record<string, WorkflowInputParamDefinition> | undefined,
  ): Record<string, WorkflowParamPolicy> {
    return Object.entries(inputParams || {}).reduce<Record<string, WorkflowParamPolicy>>((acc, [key, definition]) => {
      const trimmedKey = String(key || '').trim();
      if (!trimmedKey) {
        return acc;
      }

      const policy: WorkflowParamPolicy = {
        enabled: true,
        requiredMode: definition?.required ? 'always' : 'optional',
      };
      const defaultTemplateBinding = resolveSingleWorkflowInputRenderPath(definition?.renderPath);
      if (defaultTemplateBinding) {
        policy.templateBinding = defaultTemplateBinding;
      }

      if (definition?.defaultValue !== undefined && definition.defaultValue !== '') {
        policy.defaultValue = definition.defaultValue;
      }

      acc[trimmedKey] = policy;
      return acc;
    }, {});
  }

  normalizeName(value?: string): string {
    const normalized = String(value || '').trim();
    return normalized.slice(0, 255) || '未命名工作流';
  }

  normalizeDescription(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const normalized = String(value).trim();
    if (!normalized) {
      return null;
    }
    return normalized.slice(0, 500);
  }

  normalizeTaskQueue(value?: string): string {
    const normalized = String(value || '').trim();
    return normalized.slice(0, 255) || 'SKILL_TASK_QUEUE';
  }

  normalizeWorkflowClassName(candidate: string | undefined, workflowName: string): string {
    const normalized = String(candidate || '').trim();
    if (normalized && /^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
      return normalized.endsWith('Workflow') ? normalized : `${normalized}Workflow`;
    }
    const fallback = String(workflowName || 'GeneratedWorkflow')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    return (fallback || 'Generated') + 'Workflow';
  }

  uniqueVariables(variables: string[]): string[] {
    return [...new Set((variables || []).filter((item) => typeof item === 'string' && item.trim()))];
  }

  buildWorkflowSemanticHint(...values: unknown[]): string {
    return values
      .filter((value) => value !== undefined && value !== null)
      .map((value) => String(value)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, ' ')
        .trim()
        .toLowerCase())
      .filter((value) => value.length > 0)
      .join(' ');
  }

  private async normalizeWorkflowInputPolicy(
    inputPolicy: WorkflowInputPolicy | Record<string, unknown> | undefined,
    inputParams: Record<string, WorkflowInputParamDefinition> | undefined,
    sourceContext?: TemporalWorkflowSourceContext,
  ): Promise<WorkflowInputPolicy | undefined> {
    const defaultPolicies = this.buildDefaultWorkflowInputPolicyParams(inputParams);
    const explicitPolicies = this.extractWorkflowInputPolicyParams(inputPolicy, inputParams);
    const allowedKeys = await this.resolveWorkflowInputPolicyAllowedKeys(inputParams, sourceContext);

    if (allowedKeys.size > 0) {
      const invalidKeys = Object.keys(explicitPolicies).filter((key) => !allowedKeys.has(key));
      if (invalidKeys.length > 0) {
        throw new BadRequestException(
          `workflowDsl.inputPolicy.params 包含未注册参数: ${invalidKeys.join(', ')}`,
        );
      }
    }

    const mergedPolicies = Object.keys({
      ...defaultPolicies,
      ...explicitPolicies,
    }).reduce<Record<string, WorkflowParamPolicy>>((acc, key) => {
      const mergedPolicy: WorkflowParamPolicy = {
        ...(defaultPolicies[key] || {}),
        ...(explicitPolicies[key] || {}),
      };
      this.applyInputParamDefinitionToWorkflowPolicy(mergedPolicy, inputParams?.[key]);
      acc[key] = mergedPolicy;
      return acc;
    }, {});

    if (Object.keys(mergedPolicies).length === 0) {
      return undefined;
    }

    return {
      params: mergedPolicies,
    };
  }

  private applyInputParamDefinitionToWorkflowPolicy(
    policy: WorkflowParamPolicy,
    definition?: WorkflowInputParamDefinition,
  ): void {
    if (!definition) {
      return;
    }

    policy.enabled = true;
    policy.requiredMode = this.normalizeWorkflowPolicyRequiredMode(policy.requiredMode, definition.required);

    const defaultTemplateBinding = resolveSingleWorkflowInputRenderPath(definition.renderPath);
    if (!policy.templateBinding && defaultTemplateBinding) {
      policy.templateBinding = defaultTemplateBinding;
    } else if (!policy.templateBinding) {
      delete policy.templateBinding;
    }

    if (policy.defaultValue !== undefined) {
      return;
    }

    if (definition.defaultValue !== undefined && definition.defaultValue !== '') {
      policy.defaultValue = definition.defaultValue;
      return;
    }

    if (definition.localizedDefaultValue && Object.keys(definition.localizedDefaultValue).length > 0) {
      policy.defaultValue = definition.localizedDefaultValue;
      return;
    }

    delete policy.defaultValue;
  }

  normalizeWorkflowPolicyRequiredMode(
    currentMode: WorkflowParamRequiredMode | undefined,
    required: boolean | undefined,
  ): WorkflowParamRequiredMode {
    if (required === false && currentMode === 'always') {
      return 'optional';
    }
    if (currentMode === 'always' || currentMode === 'conditional' || currentMode === 'optional' || currentMode === 'system_required') {
      return currentMode;
    }
    return required ? 'always' : 'optional';
  }

  private extractWorkflowInputPolicyParams(
    inputPolicy: WorkflowInputPolicy | Record<string, unknown> | undefined,
    inputParams?: Record<string, WorkflowInputParamDefinition>,
  ): Record<string, WorkflowParamPolicy> {
    if (!inputPolicy || typeof inputPolicy !== 'object' || Array.isArray(inputPolicy)) {
      return {};
    }

    const rawParams =
      'params' in inputPolicy
      && inputPolicy.params
      && typeof inputPolicy.params === 'object'
      && !Array.isArray(inputPolicy.params)
        ? inputPolicy.params
        : inputPolicy;

    return Object.entries(rawParams).reduce<Record<string, WorkflowParamPolicy>>((acc, [key, value]) => {
      const trimmedKey = String(key || '').trim();
      if (!trimmedKey) {
        return acc;
      }

      const normalizedPolicy = this.normalizeWorkflowParamPolicy(value, trimmedKey, inputParams?.[trimmedKey]);
      if (normalizedPolicy) {
        acc[trimmedKey] = normalizedPolicy;
      }
      return acc;
    }, {});
  }

  private normalizeWorkflowParamPolicy(
    value: unknown,
    paramName?: string,
    inputParamDefinition?: WorkflowInputParamDefinition,
  ): WorkflowParamPolicy | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const rawPolicy = value as Record<string, unknown>;
    const allowedPolicyKeys = new Set([
      'enabled',
      'requiredMode',
      'defaultValue',
      'defaultValueResolver',
      'valueSourcePriority',
      'confirmationThreshold',
      'previewBlocking',
      'validationRules',
      'transformRule',
      'templateBinding',
    ]);
    const invalidPolicyKeys = Object.keys(rawPolicy).filter((key) => !allowedPolicyKeys.has(key));
    if (invalidPolicyKeys.length > 0) {
      throw new BadRequestException(
        `workflowDsl.inputPolicy.params.${paramName || '*'} 包含非法字段: ${invalidPolicyKeys.join(', ')}`,
      );
    }
    const normalizedPolicy: WorkflowParamPolicy = {};
    const allowedRequiredModes = new Set<WorkflowParamRequiredMode>([
      'always',
      'conditional',
      'optional',
      'system_required',
    ]);

    if (typeof rawPolicy.enabled === 'boolean') {
      normalizedPolicy.enabled = rawPolicy.enabled;
    } else if (rawPolicy.enabled !== undefined) {
      throw new BadRequestException(`workflowDsl.inputPolicy.params.${paramName || '*'}.enabled 必须是 boolean`);
    }
    if (
      typeof rawPolicy.requiredMode === 'string'
      && allowedRequiredModes.has(rawPolicy.requiredMode as WorkflowParamRequiredMode)
    ) {
      normalizedPolicy.requiredMode = rawPolicy.requiredMode as WorkflowParamRequiredMode;
    } else if (rawPolicy.requiredMode !== undefined) {
      throw new BadRequestException(
        `workflowDsl.inputPolicy.params.${paramName || '*'}.requiredMode 非法: ${String(rawPolicy.requiredMode)}`,
      );
    }
    if (rawPolicy.defaultValue !== undefined) {
      this.assertWorkflowPolicyDefaultValueCompatible(paramName, rawPolicy.defaultValue, inputParamDefinition?.type);
      normalizedPolicy.defaultValue = rawPolicy.defaultValue;
    }
    if (typeof rawPolicy.defaultValueResolver === 'string' && rawPolicy.defaultValueResolver.trim()) {
      normalizedPolicy.defaultValueResolver = rawPolicy.defaultValueResolver.trim();
    } else if (rawPolicy.defaultValueResolver !== undefined) {
      throw new BadRequestException(`workflowDsl.inputPolicy.params.${paramName || '*'}.defaultValueResolver 必须是非空字符串`);
    }
    if (Array.isArray(rawPolicy.valueSourcePriority)) {
      const valueSourcePriority = Array.from(new Set(rawPolicy.valueSourcePriority
        .map((item) => String(item || '').trim())
        .filter((item) => item.length > 0)));
      if (valueSourcePriority.length > 0) {
        normalizedPolicy.valueSourcePriority = valueSourcePriority;
      }
    } else if (rawPolicy.valueSourcePriority !== undefined) {
      throw new BadRequestException(`workflowDsl.inputPolicy.params.${paramName || '*'}.valueSourcePriority 必须是字符串数组`);
    }
    if (typeof rawPolicy.confirmationThreshold === 'number' && Number.isFinite(rawPolicy.confirmationThreshold)) {
      normalizedPolicy.confirmationThreshold = Math.max(0, Math.min(1, rawPolicy.confirmationThreshold));
    } else if (rawPolicy.confirmationThreshold !== undefined) {
      throw new BadRequestException(`workflowDsl.inputPolicy.params.${paramName || '*'}.confirmationThreshold 必须是数字`);
    }
    if (typeof rawPolicy.previewBlocking === 'boolean') {
      normalizedPolicy.previewBlocking = rawPolicy.previewBlocking;
    } else if (rawPolicy.previewBlocking !== undefined) {
      throw new BadRequestException(`workflowDsl.inputPolicy.params.${paramName || '*'}.previewBlocking 必须是 boolean`);
    }
    if (Array.isArray(rawPolicy.validationRules)) {
      const validationRules = rawPolicy.validationRules.filter((item): item is Record<string, unknown> => (
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      ));
      if (validationRules.length > 0) {
        normalizedPolicy.validationRules = validationRules;
      }
    } else if (rawPolicy.validationRules !== undefined) {
      throw new BadRequestException(`workflowDsl.inputPolicy.params.${paramName || '*'}.validationRules 必须是对象数组`);
    }
    if (typeof rawPolicy.transformRule === 'string' && rawPolicy.transformRule.trim()) {
      normalizedPolicy.transformRule = rawPolicy.transformRule.trim();
    } else if (rawPolicy.transformRule !== undefined) {
      throw new BadRequestException(`workflowDsl.inputPolicy.params.${paramName || '*'}.transformRule 必须是非空字符串`);
    }
    if (typeof rawPolicy.templateBinding === 'string' && rawPolicy.templateBinding.trim()) {
      normalizedPolicy.templateBinding = rawPolicy.templateBinding.trim();
    } else if (rawPolicy.templateBinding !== undefined) {
      throw new BadRequestException(`workflowDsl.inputPolicy.params.${paramName || '*'}.templateBinding 必须是非空字符串`);
    }

    return Object.keys(normalizedPolicy).length > 0 ? normalizedPolicy : undefined;
  }

  private assertWorkflowPolicyDefaultValueCompatible(
    paramName: string | undefined,
    defaultValue: unknown,
    inputParamType?: WorkflowInputParamType,
  ): void {
    if (!inputParamType) {
      return;
    }

    const compatible = this.isWorkflowPolicyDefaultValueCompatible(defaultValue, inputParamType);

    if (!compatible) {
      throw new BadRequestException(
        `workflowDsl.inputPolicy.params.${paramName || '*'}.defaultValue 与参数类型 ${inputParamType} 不兼容`,
      );
    }
  }

  private isWorkflowPolicyDefaultValueCompatible(
    defaultValue: unknown,
    inputParamType: WorkflowInputParamType,
  ): boolean {
    if (this.isLocalizedWorkflowDefaultValue(defaultValue)) {
      const localizedValues = Object.values(defaultValue);
      return localizedValues.length > 0
        && localizedValues.every((value) => this.isWorkflowPolicyDefaultValueCompatible(value, inputParamType));
    }

    return inputParamType === 'string' || inputParamType === 'date'
      ? typeof defaultValue === 'string'
      : inputParamType === 'number'
        ? typeof defaultValue === 'number' && Number.isFinite(defaultValue)
        : inputParamType === 'boolean'
          ? typeof defaultValue === 'boolean'
          : true;
  }

  private isLocalizedWorkflowDefaultValue(value: unknown): value is WorkflowLocalizedValueMap {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const entries = Object.entries(value);
    return entries.length > 0
      && entries.every(([key, entryValue]) => (
        typeof key === 'string'
        && key.trim().length > 0
        && (
          typeof entryValue === 'string'
          || typeof entryValue === 'number'
          || typeof entryValue === 'boolean'
        )
      ));
  }

  private async resolveWorkflowInputPolicyAllowedKeys(
    inputParams: Record<string, WorkflowInputParamDefinition> | undefined,
    sourceContext?: TemporalWorkflowSourceContext,
  ): Promise<Set<string>> {
    const skillId = String(sourceContext?.sourceTemplate?.skillId || '').trim();
    if (skillId) {
      const skill = await this.prisma.skillConfig.findUnique({
        where: { id: skillId },
        select: { paramsSchema: true },
      }).catch(() => null);
      const schema = skill?.paramsSchema as Record<string, unknown> | undefined;
      const properties = schema?.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
        ? schema.properties as Record<string, unknown>
        : {};
      const skillKeys = Object.keys(properties);
      if (skillKeys.length > 0) {
        return new Set(skillKeys);
      }
    }

    return new Set(Object.keys(inputParams || {}));
  }

  private async normalizeWorkflowStep(
    step: WorkflowStep,
    activityDsl?: ActivityDsl,
  ): Promise<WorkflowStep> {
    if (!step || step.type !== 'activity') {
      return step;
    }

    const normalizedStep = this.sanitizeJsonValue(step) as WorkflowStep;
    const builtinFromRef = normalizedStep.activityRef
      ? this.builtinActivityRegistry.getByRef(normalizedStep.activityRef)
      : null;
    if (builtinFromRef) {
      return {
        ...normalizedStep,
        activityRef: builtinFromRef.ref,
        activityName: normalizedStep.activityName || builtinFromRef.name,
      };
    }

    if (normalizedStep.activityRef?.startsWith('custom:')) {
      const activityId = normalizedStep.activityRef.slice('custom:'.length).trim();
      const dbActivity = activityId && this.isLikelyUuid(activityId)
        ? await this.prisma.activity.findUnique({ where: { id: activityId } }).catch(() => null)
        : null;
      return {
        ...normalizedStep,
        activityRef: activityId ? `custom:${activityId}` : undefined,
        activityName: normalizedStep.activityName || dbActivity?.name || normalizedStep.activityName,
      };
    }

    const legacyIdentifier = String(normalizedStep.activityName || '').trim();
    const builtinFromLegacy = this.builtinActivityRegistry.findByLegacyIdentifier(legacyIdentifier);
    if (builtinFromLegacy) {
      return {
        ...normalizedStep,
        activityRef: builtinFromLegacy.ref,
        activityName: normalizedStep.activityName || builtinFromLegacy.name,
      };
    }

    const activityFromDsl = (activityDsl?.activities || []).find((activity) =>
      activity.name === legacyIdentifier || activity.fn === legacyIdentifier,
    );
    if (activityFromDsl) {
      const builtinFromDsl = this.builtinActivityRegistry.getByFn(activityFromDsl.fn)
        || this.builtinActivityRegistry.findByLegacyIdentifier(activityFromDsl.name);
      if (builtinFromDsl) {
        return {
          ...normalizedStep,
          activityRef: builtinFromDsl.ref,
          activityName: normalizedStep.activityName || activityFromDsl.name || builtinFromDsl.name,
        };
      }
      const dbActivity = await this.prisma.activity.findUnique({
        where: { name: activityFromDsl.name },
      }).catch(() => null);
      if (dbActivity) {
        return {
          ...normalizedStep,
          activityRef: `custom:${dbActivity.id}`,
          activityName: normalizedStep.activityName || dbActivity.name,
        };
      }
    }

    if (!legacyIdentifier) {
      return normalizedStep;
    }

    const dbActivity = await this.prisma.activity.findUnique({
      where: { name: legacyIdentifier },
    }).catch(() => null);
    if (dbActivity) {
      return {
        ...normalizedStep,
        activityRef: `custom:${dbActivity.id}`,
        activityName: normalizedStep.activityName || dbActivity.name,
      };
    }

    return normalizedStep;
  }

  private isLikelyUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  }
}
