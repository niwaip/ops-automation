import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ExecutionNormalizedInputJson,
  ExecutionParamRequiredMode,
  ExecutionParamResolutionEntry,
  ExecutionRequiredInput,
} from '../state/execution.dto';

export interface ExecutionUsageSummary {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

export interface SubmitInputStateContext {
  normalized: Record<string, unknown>;
  requiredInputs: ExecutionRequiredInput[];
  currentParamResolution: Record<string, ExecutionParamResolutionEntry>;
  missingInputs: ExecutionRequiredInput[];
}

export interface SubmitInputResolutionResult {
  normalizedSubmittedInput: Record<string, unknown>;
  updatedRequiredInputs: ExecutionRequiredInput[];
  updatedParamResolution: Record<string, ExecutionParamResolutionEntry>;
  mergedSubmittedInput: Record<string, unknown>;
  remainingMissingInputs: ExecutionRequiredInput[];
  canResumeExecution: boolean;
  updatedNormalized: Record<string, unknown>;
}

@Injectable()
export class ExecutionInputResolutionService {
  resolveSubmitInputState(
    context: SubmitInputStateContext,
    options: {
      input?: Record<string, unknown>;
      currentUsage?: ExecutionUsageSummary;
      submittedUsage?: ExecutionUsageSummary;
      reconcileSemantic?: (
        semantic: Record<string, unknown> | undefined,
        requiredInputs: ExecutionRequiredInput[]
      ) => Record<string, unknown> | undefined;
    } = {}
  ): SubmitInputResolutionResult {
    const submittedKeys = Object.keys(options.input || {});
    if (submittedKeys.length === 0) {
      throw new BadRequestException('Input payload must contain at least one field');
    }

    const allowedKeys = new Set(context.missingInputs.map((item) => item.name));
    const invalidKeys = submittedKeys.filter((key) => !allowedKeys.has(key));
    if (invalidKeys.length > 0) {
      throw new BadRequestException(`Unexpected input fields: ${invalidKeys.join(', ')}`);
    }

    const normalizedSubmittedInput = Object.fromEntries(
      context.missingInputs.map((item) => [
        item.name,
        this.normalizeSubmittedInputValue(options.input?.[item.name], item.type),
      ])
    );

    const updatedParamResolution = this.reconcileParamResolutionWithSubmittedInput(
      context.currentParamResolution,
      context.requiredInputs,
      normalizedSubmittedInput,
      submittedKeys
    );
    const updatedRequiredInputs =
      this.buildRequiredInputsFromParamResolution(updatedParamResolution);
    const mergedSubmittedInput = this.buildFinalInputFromParamResolution(updatedParamResolution);
    const remainingMissingInputs = updatedRequiredInputs.filter(
      (item) => item.required && this.isBlockingRequiredInput(item)
    );
    const canResumeExecution = remainingMissingInputs.length === 0;
    const totalUsage = this.sumUsage(options.currentUsage, options.submittedUsage);
    const normalizedInputData =
      context.normalized.input && typeof context.normalized.input === 'object'
        ? (context.normalized.input as Record<string, unknown>)
        : {};
    const passthroughInput = this.omitTrackedInputKeys(
      normalizedInputData,
      new Set(Object.keys(updatedParamResolution))
    );
    const currentSemantic =
      context.normalized.semantic &&
      typeof context.normalized.semantic === 'object' &&
      !Array.isArray(context.normalized.semantic)
        ? (context.normalized.semantic as Record<string, unknown>)
        : undefined;
    const updatedSemantic = options.reconcileSemantic?.(currentSemantic, updatedRequiredInputs);
    const updatedNormalized = {
      ...context.normalized,
      ...(totalUsage ? { __usage: totalUsage } : {}),
      ...normalizedSubmittedInput,
      input: {
        ...passthroughInput,
        ...mergedSubmittedInput,
      },
      requiredInputs: updatedRequiredInputs,
      paramResolution: updatedParamResolution,
      ...(updatedSemantic ? { semantic: updatedSemantic } : {}),
    };

    return {
      normalizedSubmittedInput,
      updatedRequiredInputs,
      updatedParamResolution,
      mergedSubmittedInput,
      remainingMissingInputs,
      canResumeExecution,
      updatedNormalized,
    };
  }

  getMissingRequiredInputs(execution: Record<string, unknown>): ExecutionRequiredInput[] {
    return this.getRequiredInputs(execution).filter((item) => this.isBlockingRequiredInput(item));
  }

  hasMeaningfulSubmittedInputValue(value: unknown): boolean {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.some((item) => this.hasMeaningfulSubmittedInputValue(item));
    }
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some((item) =>
        this.hasMeaningfulSubmittedInputValue(item)
      );
    }
    return true;
  }

  normalizeSubmittedInputValue(value: unknown, expectedType: string): unknown {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (Array.isArray(value)) {
      const normalized = value
        .map((item) => this.normalizeSubmittedInputValue(item, expectedType))
        .filter((item) => item !== undefined);
      return normalized.length > 0 ? normalized : undefined;
    }
    if (typeof value === 'object') {
      const normalizedEntries = Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, this.normalizeSubmittedInputValue(item, expectedType)] as const)
        .filter(([, item]) => item !== undefined);
      return normalizedEntries.length > 0 ? Object.fromEntries(normalizedEntries) : undefined;
    }
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed || this.isPlaceholderTextValue(trimmed)) {
      return undefined;
    }

    if (expectedType === 'date') {
      return this.normalizeDateInputValue(trimmed) || trimmed;
    }

    return trimmed;
  }

  getRequiredInputs(execution: Record<string, unknown>): ExecutionRequiredInput[] {
    const normalizedInput = execution.normalizedInputJson as Record<string, unknown> | undefined;
    const paramResolution = normalizedInput?.paramResolution;
    if (paramResolution && typeof paramResolution === 'object' && !Array.isArray(paramResolution)) {
      return this.buildRequiredInputsFromParamResolution(
        paramResolution as Record<string, ExecutionParamResolutionEntry>
      );
    }
    const requiredInputs = Array.isArray(normalizedInput?.requiredInputs)
      ? (normalizedInput.requiredInputs as ExecutionRequiredInput[])
      : [];

    return requiredInputs;
  }

  getParamResolution(
    execution: Record<string, unknown>
  ): Record<string, ExecutionParamResolutionEntry> {
    const normalizedInput = execution.normalizedInputJson as
      | ExecutionNormalizedInputJson
      | undefined;
    const paramResolution = normalizedInput?.paramResolution;
    if (paramResolution && typeof paramResolution === 'object' && !Array.isArray(paramResolution)) {
      return this.normalizeParamResolutionEntries(
        paramResolution as Record<string, ExecutionParamResolutionEntry>
      );
    }
    return this.buildParamResolutionFromRequiredInputs(this.getRequiredInputs(execution));
  }

  buildParamResolutionFromRequiredInputs(
    requiredInputs?: ExecutionRequiredInput[]
  ): Record<string, ExecutionParamResolutionEntry> {
    return (requiredInputs || []).reduce<Record<string, ExecutionParamResolutionEntry>>(
      (acc, item) => {
        if (!item?.name) {
          return acc;
        }

        const requiredMode: ExecutionParamRequiredMode =
          item.required_mode || (item.required ? 'always' : 'optional');
        acc[item.name] = {
          type: item.type || 'string',
          required: Boolean(item.required),
          value: item.value,
          source: item.source || 'unresolved',
          requiredMode,
          ...(Array.isArray(item.source_priority)
            ? { valueSourcePriority: item.source_priority }
            : {}),
          missing: item.missing === true,
          needsConfirmation: item.needs_confirmation === true,
          confirmed: item.source === 'user_input' ? true : undefined,
          final: item.missing !== true && item.needs_confirmation !== true,
          ...(item.description ? { description: item.description } : {}),
          ...(item.display_name ? { display_name: item.display_name } : {}),
          ...(item.group_label ? { group_label: item.group_label } : {}),
          ...(item.render_path ? { render_path: item.render_path } : {}),
          ...(item.template_binding ? { template_binding: item.template_binding } : {}),
          ...(typeof item.confidence === 'number' ? { confidence: item.confidence } : {}),
          ...(typeof item.confirmation_threshold === 'number'
            ? { confirmation_threshold: item.confirmation_threshold }
            : {}),
          ...(item.missing_reason ? { missing_reason: item.missing_reason } : {}),
          ...(typeof item.preview_blocking === 'boolean'
            ? { preview_blocking: item.preview_blocking }
            : {}),
        };
        return acc;
      },
      {}
    );
  }

  buildRequiredInputsFromParamResolution(
    paramResolution: Record<string, ExecutionParamResolutionEntry>
  ): ExecutionRequiredInput[] {
    return Object.entries(this.normalizeParamResolutionEntries(paramResolution)).map(
      ([name, entry]) => ({
        name,
        type: entry.type || 'string',
        ...(entry.description ? { description: entry.description } : {}),
        ...(entry.display_name ? { display_name: entry.display_name } : {}),
        ...(entry.group_label ? { group_label: entry.group_label } : {}),
        ...(entry.render_path ? { render_path: entry.render_path } : {}),
        ...(entry.template_binding ? { template_binding: entry.template_binding } : {}),
        required: entry.required === true,
        required_mode: entry.requiredMode,
        ...(entry.value !== undefined ? { value: entry.value } : {}),
        missing: entry.missing === true,
        source: entry.source || 'unresolved',
        ...(Array.isArray(entry.valueSourcePriority)
          ? { source_priority: entry.valueSourcePriority }
          : {}),
        ...(typeof entry.confidence === 'number' ? { confidence: entry.confidence } : {}),
        needs_confirmation: entry.needsConfirmation === true,
        ...(typeof entry.confirmation_threshold === 'number'
          ? { confirmation_threshold: entry.confirmation_threshold }
          : {}),
        ...(entry.missing_reason ? { missing_reason: entry.missing_reason } : {}),
        ...(typeof entry.preview_blocking === 'boolean'
          ? { preview_blocking: entry.preview_blocking }
          : {}),
      })
    );
  }

  buildFinalInputFromParamResolution(
    paramResolution: Record<string, ExecutionParamResolutionEntry>
  ): Record<string, unknown> {
    return Object.entries(this.normalizeParamResolutionEntries(paramResolution)).reduce<
      Record<string, unknown>
    >((acc, [name, entry]) => {
      if (entry.final !== true || entry.value === undefined || entry.value === null) {
        return acc;
      }
      acc[name] = entry.value;
      return acc;
    }, {});
  }

  omitTrackedInputKeys(
    input: Record<string, unknown>,
    trackedKeys: Set<string>
  ): Record<string, unknown> {
    return Object.fromEntries(Object.entries(input).filter(([name]) => !trackedKeys.has(name)));
  }

  reconcileParamResolutionWithSubmittedInput(
    currentParamResolution: Record<string, ExecutionParamResolutionEntry>,
    requiredInputs: ExecutionRequiredInput[],
    normalizedSubmittedInput: Record<string, unknown>,
    submittedKeys: string[]
  ): Record<string, ExecutionParamResolutionEntry> {
    const baseParamResolution =
      Object.keys(currentParamResolution).length > 0
        ? currentParamResolution
        : this.buildParamResolutionFromRequiredInputs(requiredInputs);

    return Object.fromEntries(
      Object.entries(baseParamResolution).map(([name, entry]) => {
        if (!submittedKeys.includes(name)) {
          return [name, entry];
        }

        const normalizedValue = normalizedSubmittedInput[name];
        if (!this.hasMeaningfulSubmittedInputValue(normalizedValue)) {
          return [
            name,
            {
              ...entry,
              value: undefined,
              source: 'unresolved' as const,
              missing: true,
              needsConfirmation: false,
              confirmed: false,
              final: false,
              missing_reason: undefined,
            },
          ];
        }

        return [
          name,
          {
            ...entry,
            value: normalizedValue,
            source: 'user_input' as const,
            missing: false,
            needsConfirmation: false,
            confirmed: true,
            final: true,
            missing_reason: undefined,
          },
        ];
      })
    );
  }

  isBlockingRequiredInput(item?: ExecutionRequiredInput | null): boolean {
    if (!item) {
      return false;
    }
    return item.missing === true || item.needs_confirmation === true;
  }

  private normalizeParamResolutionEntries(
    paramResolution: Record<string, ExecutionParamResolutionEntry>
  ): Record<string, ExecutionParamResolutionEntry> {
    return Object.fromEntries(
      Object.entries(paramResolution).map(([name, entry]) => [
        name,
        this.normalizeParamResolutionEntry(entry),
      ])
    );
  }

  private normalizeParamResolutionEntry(
    entry: ExecutionParamResolutionEntry
  ): ExecutionParamResolutionEntry {
    const rawEntry = entry as ExecutionParamResolutionEntry & Record<string, unknown>;

    return {
      ...entry,
      ...(rawEntry.display_name === undefined && typeof rawEntry.displayName === 'string'
        ? { display_name: rawEntry.displayName }
        : {}),
      ...(rawEntry.group_label === undefined && typeof rawEntry.groupLabel === 'string'
        ? { group_label: rawEntry.groupLabel }
        : {}),
      ...(rawEntry.missing_reason === undefined && typeof rawEntry.missingReason === 'string'
        ? { missing_reason: rawEntry.missingReason }
        : {}),
      ...(rawEntry.preview_blocking === undefined && typeof rawEntry.previewBlocking === 'boolean'
        ? { preview_blocking: rawEntry.previewBlocking }
        : {}),
      ...(rawEntry.confirmation_threshold === undefined &&
      typeof rawEntry.confirmationThreshold === 'number'
        ? { confirmation_threshold: rawEntry.confirmationThreshold }
        : {}),
      ...(rawEntry.render_path === undefined &&
      (typeof rawEntry.renderPath === 'string' ||
        (Array.isArray(rawEntry.renderPath) &&
          rawEntry.renderPath.every((item) => typeof item === 'string')))
        ? { render_path: rawEntry.renderPath as string | string[] }
        : {}),
      ...(rawEntry.template_binding === undefined && typeof rawEntry.templateBinding === 'string'
        ? { template_binding: rawEntry.templateBinding }
        : {}),
    };
  }

  private normalizeDateInputValue(value: string): string | undefined {
    const normalized = value.trim();
    const isoMatch = normalized.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const zhMatch = normalized.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
    if (zhMatch) {
      const [, year, month, day] = zhMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return undefined;
  }

  private isPlaceholderTextValue(value: string): boolean {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/^[`"'“”‘’]+|[`"'“”‘’。．.,，；;：:、!！?？]+$/g, '');

    if (!normalized) {
      return true;
    }

    return new Set([
      '-',
      '--',
      'n/a',
      'n.a.',
      'n.a',
      'na',
      'none',
      'null',
      'undefined',
      'unknown',
      'tbd',
      'pending',
      'notprovided',
      'notspecified',
      'notavailable',
      '待补充',
      '待确认',
      '待定',
      '暂未提供',
      '未提供',
      '未填写',
      '未确定',
      '未知',
      '未说明',
      '未注明',
      '未提及',
      '未明确',
      '留空',
      '空字符串',
      '空值',
      '暂无',
      '暂无数据',
      '无',
      '无数据',
      '无具体信息',
      '不详',
      'to be confirmed',
      'to be determined',
    ]).has(normalized);
  }

  private sumUsage(
    ...usages: (ExecutionUsageSummary | undefined)[]
  ): ExecutionUsageSummary | undefined {
    const validUsages = usages.filter(
      (u): u is ExecutionUsageSummary => !!u && (u.total_tokens > 0 || u.prompt_tokens > 0)
    );
    if (validUsages.length === 0) {
      return undefined;
    }

    const result: ExecutionUsageSummary = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      completion_tokens_details: {
        reasoning_tokens: 0,
      },
    };

    for (const usage of validUsages) {
      result.prompt_tokens += usage.prompt_tokens || 0;
      result.completion_tokens += usage.completion_tokens || 0;
      result.total_tokens += usage.total_tokens || 0;
      if (usage.completion_tokens_details?.reasoning_tokens) {
        if (!result.completion_tokens_details) {
          result.completion_tokens_details = { reasoning_tokens: 0 };
        }
        result.completion_tokens_details.reasoning_tokens =
          (result.completion_tokens_details.reasoning_tokens || 0) +
          usage.completion_tokens_details.reasoning_tokens;
      }
    }

    return result;
  }
}
