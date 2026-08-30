import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  WorkflowDsl,
  WorkflowInputParamDefinition,
  WorkflowInputParamFormat,
  WorkflowValidationAssertion,
  WorkflowValidationScenario,
} from '../../modules/temporal-workflow/temporal-workflow.types';
import {
  isLegacyRequiredAssertionOperator,
  normalizeWorkflowValidationAssertionOperator,
} from '../../modules/temporal-workflow/temporal-workflow-validation-assertion.utils';

const RESERVED_VALIDATION_SCENARIO = '__validationScenario';

export interface NormalizedWorkflowValidationInput {
  input: Record<string, unknown>;
  scenario?: WorkflowValidationScenario;
}

export interface WorkflowValidationContractResult {
  success: boolean;
  errors: string[];
}

@Injectable()
export class TemporalWorkflowValidationContractService {
  normalizeInput(
    workflowDsl: WorkflowDsl | undefined,
    rawInput?: Record<string, unknown>
  ): NormalizedWorkflowValidationInput {
    const source = { ...(rawInput || {}) };
    delete source.__httpResponsePreview;
    const selectedScenarioId = this.nonEmptyString(source[RESERVED_VALIDATION_SCENARIO]);
    delete source[RESERVED_VALIDATION_SCENARIO];

    const definitions = workflowDsl?.inputParams || {};
    const definitionKeys = Object.keys(definitions);
    if (definitionKeys.length === 0) {
      return { input: this.removeEmptyValues(source) };
    }

    const unknownKeys = Object.keys(source).filter((key) => !(key in definitions));
    if (unknownKeys.length > 0) {
      throw new BadRequestException(`端到端验证包含未声明参数: ${unknownKeys.join(', ')}`);
    }

    const scenario = this.resolveScenario(workflowDsl, selectedScenarioId);
    const allowedKeys = scenario
      ? new Set([
          ...scenario.parameters,
          ...Object.entries(definitions)
            .filter(([, definition]) => definition.required === true)
            .map(([key]) => key),
        ])
      : undefined;
    const disallowedKeys = allowedKeys
      ? Object.keys(source).filter(
          (key) => !allowedKeys.has(key) && !this.isEmptyValue(source[key])
        )
      : [];
    if (disallowedKeys.length > 0) {
      throw new BadRequestException(
        `验证场景“${scenario?.label}”不允许参数: ${disallowedKeys.join(', ')}`
      );
    }

    const normalized: Record<string, unknown> = {};
    for (const [key, definition] of Object.entries(definitions)) {
      if (allowedKeys && !allowedKeys.has(key)) {
        continue;
      }
      const rawValue = source[key];
      if (this.isEmptyValue(rawValue)) {
        const fallbackDefault =
          (definition as any).defaultValue ??
          (definition as any).default ??
          (definition as any).exampleValue;
        if (!this.isEmptyValue(fallbackDefault)) {
          normalized[key] = this.normalizeValue(key, fallbackDefault, definition);
        }
        continue;
      }
      normalized[key] = this.normalizeValue(key, rawValue, definition);
    }

    const requiredKeys = new Set([
      ...Object.entries(definitions)
        .filter(([, definition]) => definition.required === true)
        .map(([key]) => key),
      ...(scenario?.requiredParameters || []),
    ]);
    const missingKeys = [...requiredKeys].filter((key) => this.isEmptyValue(normalized[key]));
    if (missingKeys.length > 0) {
      throw new BadRequestException(`端到端验证缺少必填参数: ${missingKeys.join(', ')}`);
    }

    return { input: normalized, scenario };
  }

  validateResult(
    workflowDsl: WorkflowDsl | undefined,
    rawResult: unknown,
    scenario?: WorkflowValidationScenario
  ): WorkflowValidationContractResult {
    const assertions = (workflowDsl?.validation?.assertions || []).filter(
      (assertion) =>
        !assertion.scenarioIds?.length ||
        Boolean(scenario?.id && assertion.scenarioIds.includes(scenario.id))
    );
    if (assertions.length > 0) {
      const errors = assertions.flatMap((assertion) =>
        this.evaluateAssertion(rawResult, assertion) ? [] : [this.assertionError(assertion)]
      );
      return { success: errors.length === 0, errors };
    }

    const businessData = this.findBusinessData(rawResult);
    if (businessData === undefined) {
      return {
        success: false,
        errors: ['真实执行没有返回标准结果契约中的 result.businessData。'],
      };
    }
    if (!this.hasMeaningfulBusinessValue(businessData)) {
      return {
        success: false,
        errors: ['真实执行虽然成功，但业务结果为空，不能作为可发布的端到端验证证据。'],
      };
    }
    return { success: true, errors: [] };
  }

  resolveFormat(
    key: string,
    definition: WorkflowInputParamDefinition
  ): WorkflowInputParamFormat | undefined {
    if (definition.format) {
      return definition.format;
    }
    const hint = `${key} ${definition.description || ''}`.toLowerCase();
    if (/毫秒|milliseconds?|epoch\s*ms|unix\s*ms/.test(hint)) {
      return 'unix-milliseconds';
    }
    if (/秒级时间戳|unix\s*seconds?|epoch\s*seconds?/.test(hint)) {
      return 'unix-seconds';
    }
    if (definition.type === 'date') {
      return /时间|time|datetime/.test(hint) ? 'date-time' : 'date';
    }
    return undefined;
  }

  private normalizeValue(
    key: string,
    value: unknown,
    definition: WorkflowInputParamDefinition
  ): unknown {
    const format = this.resolveFormat(key, definition);
    let normalized: unknown;
    if (format === 'unix-milliseconds' || format === 'unix-seconds') {
      normalized = this.normalizeUnixTimestamp(key, value, format);
    } else if (definition.type === 'integer') {
      const numberValue = this.toFiniteNumber(key, value);
      if (!Number.isSafeInteger(numberValue)) {
        throw new BadRequestException(`参数 ${key} 必须是安全整数`);
      }
      normalized = numberValue;
    } else if (definition.type === 'number') {
      normalized = this.toFiniteNumber(key, value);
    } else if (definition.type === 'boolean') {
      normalized = this.toBoolean(key, value);
    } else if (definition.type === 'date') {
      normalized = this.normalizeDate(key, value, format || 'date');
    } else {
      normalized = typeof value === 'string' ? value.trim() : String(value);
    }

    if (definition.enum?.length && !definition.enum.includes(normalized as string | number)) {
      throw new BadRequestException(`参数 ${key} 必须是以下值之一: ${definition.enum.join(', ')}`);
    }
    return normalized;
  }

  private normalizeUnixTimestamp(
    key: string,
    value: unknown,
    format: 'unix-milliseconds' | 'unix-seconds'
  ): number {
    const text = String(value).trim();
    let milliseconds: number;
    if (/^-?\d+$/.test(text)) {
      const numeric = Number(text);
      if (!Number.isSafeInteger(numeric)) {
        throw new BadRequestException(`参数 ${key} 不是有效的 Unix 时间戳`);
      }
      milliseconds = format === 'unix-seconds' ? numeric * 1000 : numeric;
    } else {
      milliseconds = Date.parse(text);
    }
    if (!Number.isFinite(milliseconds)) {
      throw new BadRequestException(`参数 ${key} 不是有效的日期时间`);
    }
    const normalized = format === 'unix-seconds' ? Math.floor(milliseconds / 1000) : milliseconds;
    if (!Number.isSafeInteger(normalized)) {
      throw new BadRequestException(`参数 ${key} 超出安全时间戳范围`);
    }
    return normalized;
  }

  private normalizeDate(
    key: string,
    value: unknown,
    format: 'date' | 'date-time' | WorkflowInputParamFormat
  ): string {
    const text = String(value).trim();
    if (format === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text;
    }
    const milliseconds = Date.parse(text);
    if (!Number.isFinite(milliseconds)) {
      throw new BadRequestException(`参数 ${key} 不是有效的日期时间`);
    }
    return format === 'date'
      ? new Date(milliseconds).toISOString().slice(0, 10)
      : new Date(milliseconds).toISOString();
  }

  private resolveScenario(
    workflowDsl: WorkflowDsl | undefined,
    selectedScenarioId?: string
  ): WorkflowValidationScenario | undefined {
    const scenarios = workflowDsl?.validation?.scenarios || [];
    if (scenarios.length === 0) {
      return undefined;
    }
    if (!selectedScenarioId) {
      if (scenarios.length === 1) {
        return scenarios[0];
      }
      throw new BadRequestException('该 Workflow 定义了多个互斥验证场景，请明确选择验证场景');
    }
    const scenario = scenarios.find((candidate) => candidate.id === selectedScenarioId);
    if (!scenario) {
      throw new BadRequestException(`未知的端到端验证场景: ${selectedScenarioId}`);
    }
    return scenario;
  }

  private evaluateAssertion(rawResult: unknown, assertion: WorkflowValidationAssertion): boolean {
    const field = String(assertion.field || '').trim();
    const businessData = field ? this.findBusinessData(rawResult) : undefined;
    const fieldValue =
      field && businessData && typeof businessData === 'object' && !Array.isArray(businessData)
        ? (businessData as Record<string, unknown>)[field]
        : undefined;
    const value = field
      ? this.extractPath(fieldValue, assertion.fieldPath || '$')
      : this.extractPath(rawResult, assertion.path || '$');
    const operator = normalizeWorkflowValidationAssertionOperator(
      (assertion as { operator?: unknown }).operator
    );
    if (
      isLegacyRequiredAssertionOperator((assertion as { operator?: unknown }).operator) &&
      assertion.value === false
    ) {
      return true;
    }
    switch (operator) {
      case 'exists':
        return value !== undefined && value !== null;
      case 'nonEmpty':
        return this.hasMeaningfulBusinessValue(value);
      case 'equals':
        return value === assertion.value;
      case 'notEquals':
        return value !== assertion.value;
      case 'minItems':
        return Array.isArray(value) && value.length >= Number(assertion.value ?? 1);
      case 'min':
        return (
          typeof value === 'number' && Number.isFinite(value) && value >= Number(assertion.value)
        );
      case 'max':
        return (
          typeof value === 'number' && Number.isFinite(value) && value <= Number(assertion.value)
        );
      default:
        return false;
    }
  }

  private assertionError(assertion: WorkflowValidationAssertion): string {
    const target = assertion.field
      ? `businessData.${assertion.field}${
          assertion.fieldPath && assertion.fieldPath !== '$'
            ? `.${assertion.fieldPath.replace(/^\$\.?/, '')}`
            : ''
        }`
      : assertion.path || '$';
    return (
      assertion.message ||
      `业务结果断言失败: ${target} ${assertion.operator}${
        assertion.value === undefined ? '' : ` ${String(assertion.value)}`
      }`
    );
  }

  private extractPath(source: unknown, rawPath: string): unknown {
    const path = String(rawPath || '')
      .trim()
      .replace(/^\$\.?/, '')
      .replace(/\[(\d+)\]/g, '.$1');
    if (!path) {
      return source;
    }
    return path
      .split('.')
      .filter(Boolean)
      .reduce<unknown>((current, segment) => {
        if (current === undefined || current === null) return undefined;
        if (Array.isArray(current)) return current[Number(segment)];
        if (typeof current === 'object') return (current as Record<string, unknown>)[segment];
        return undefined;
      }, source);
  }

  private findBusinessData(value: unknown, depth = 0): unknown {
    if (depth > 6 || !value || typeof value !== 'object') return undefined;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findBusinessData(item, depth + 1);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    const record = value as Record<string, unknown>;
    if ('businessData' in record) return record.businessData;
    for (const child of Object.values(record)) {
      const found = this.findBusinessData(child, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  private hasMeaningfulBusinessValue(value: unknown, key = ''): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value !== 'object') return false;
    const metadataKeys = /^(type|mode|status|code|id|count|total|snapshot_time)$/i;
    return Object.entries(value as Record<string, unknown>).some(
      ([childKey, childValue]) =>
        !metadataKeys.test(childKey) && this.hasMeaningfulBusinessValue(childValue, childKey || key)
    );
  }

  private removeEmptyValues(source: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(source).filter(([, value]) => !this.isEmptyValue(value))
    );
  }

  private isEmptyValue(value: unknown): boolean {
    return value === undefined || value === null || (typeof value === 'string' && !value.trim());
  }

  private nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private toFiniteNumber(key: string, value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(numeric)) {
      throw new BadRequestException(`参数 ${key} 必须是数字`);
    }
    return numeric;
  }

  private toBoolean(key: string, value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    const text = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', '是'].includes(text)) return true;
    if (['false', '0', 'no', '否'].includes(text)) return false;
    throw new BadRequestException(`参数 ${key} 必须是布尔值`);
  }
}
