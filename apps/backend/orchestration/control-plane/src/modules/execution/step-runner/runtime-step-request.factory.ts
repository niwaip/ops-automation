import { Injectable, Logger } from '@nestjs/common';
import { PolicyContext, RuntimeStepInvokeRequest } from '../adapters/runtime-adapter.interface';
import { BROWSER_ACTIONS, BROWSER_RUNTIME } from './browser-execution-constants';

interface RuntimeStepPhaseMetadata {
  phaseKey: string;
  phaseName: string;
  phaseType: string;
}

@Injectable()
export class RuntimeStepRequestFactory {
  private readonly logger = new Logger(RuntimeStepRequestFactory.name);

  buildBrowserGotoRequest(input: {
    execution: Record<string, unknown>;
    stepId: string;
    runtimeSessionId: string;
    url: string;
    executionMode: 'bootstrap' | 'planned_step';
    phaseMetadata?: RuntimeStepPhaseMetadata;
  }): RuntimeStepInvokeRequest {
    const executionId = input.execution.id as string;

    return {
      requestId: `${executionId}:${input.stepId}`,
      executionId,
      stepId: input.stepId,
      runtimeType: BROWSER_RUNTIME.TYPE,
      runtimeSessionId: input.runtimeSessionId,
      skillId: (input.execution.skillId as string | null) || null,
      publishedSkillId: this.resolveExecutionCapabilityId(input.execution) || null,
      capabilityType: BROWSER_RUNTIME.CAPABILITY_TYPE,
      action: BROWSER_ACTIONS.GOTO,
      input: {
        target: input.url,
      },
      policyContext: this.buildPolicyContext(input.execution),
      metadata: {
        executionMode: input.executionMode,
        ...(input.phaseMetadata || {}),
      },
    };
  }

  buildSkillRuntimeRequest(input: {
    execution: Record<string, unknown>;
    stepId: string;
    runtimeSessionId: string;
    phaseMetadata?: RuntimeStepPhaseMetadata;
    step?: Record<string, unknown> | null;
  }): RuntimeStepInvokeRequest | null {
    const capabilityId = this.resolveExecutionCapabilityId(input.execution);
    if (!capabilityId) {
      return null;
    }

    const executionId = input.execution.id as string;
    const includeExecutionStepMetadata = this.shouldIncludeExecutionStepMetadata(input.execution);

    return {
      requestId: `${executionId}:${input.stepId}`,
      executionId,
      stepId: input.stepId,
      runtimeType: this.resolveExecutionRuntimeType(input.execution),
      runtimeSessionId: input.runtimeSessionId,
      skillId: (input.execution.skillId as string | null) || null,
      publishedSkillId: capabilityId,
      capabilityType: this.resolveExecutionCapabilityType(input.execution),
      action: this.resolveExecutionAction(input.execution),
      input: this.resolveExecutionInput(input.execution),
      policyContext: this.buildPolicyContext(input.execution),
      metadata: {
        capabilityVersion: this.resolveExecutionCapabilityVersion(input.execution),
        ...(includeExecutionStepMetadata
          ? {
              executionStepName:
                typeof input.step?.name === 'string' && input.step.name.trim()
                  ? input.step.name.trim()
                  : undefined,
              executionStepAction:
                typeof input.step?.action === 'string' && input.step.action.trim()
                  ? input.step.action.trim()
                  : undefined,
              executionStepIndex:
                typeof input.step?.stepIndex === 'number'
                  ? input.step.stepIndex
                  : typeof input.step?.step_index === 'number'
                    ? input.step.step_index
                    : undefined,
            }
          : {}),
        ...(input.phaseMetadata || {}),
      },
    };
  }

  private shouldIncludeExecutionStepMetadata(execution: Record<string, unknown>): boolean {
    return this.resolveExecutionRuntimeSourceType(execution) !== 'browser_recording';
  }

  resolveExecutionCapabilityId(execution: Record<string, unknown>): string | undefined {
    const normalizedInput = execution.normalizedInputJson as Record<string, unknown> | undefined;
    const capabilityMatch = normalizedInput?.capabilityMatch as Record<string, unknown> | undefined;
    const skillMatch = normalizedInput?.skillMatch as Record<string, unknown> | undefined;

    if (typeof capabilityMatch?.capabilityId === 'string' && capabilityMatch.capabilityId.trim()) {
      return capabilityMatch.capabilityId;
    }
    if (typeof skillMatch?.skill_id === 'string' && skillMatch.skill_id.trim()) {
      return skillMatch.skill_id;
    }

    const fromExecution = execution.skillId;
    if (typeof fromExecution === 'string' && fromExecution.trim()) {
      return fromExecution;
    }

    return undefined;
  }

  resolveExecutionCapabilityVersion(execution: Record<string, unknown>): string | undefined {
    return typeof execution.skillVersion === 'string' && execution.skillVersion.trim()
      ? execution.skillVersion
      : undefined;
  }

  private resolveExecutionRuntimeSourceType(
    execution: Record<string, unknown>
  ): string | undefined {
    const normalizedInput = execution.normalizedInputJson as Record<string, unknown> | undefined;
    return typeof normalizedInput?.runtimeSourceType === 'string' &&
      normalizedInput.runtimeSourceType.trim()
      ? normalizedInput.runtimeSourceType.trim()
      : undefined;
  }

  resolveExecutionRuntimeType(
    execution: Record<string, unknown>
  ): 'document' | 'workflow' | 'custom' {
    if (execution.runtimeType === 'document') {
      return 'document';
    }
    if (execution.runtimeType === 'workflow') {
      return 'workflow';
    }
    return 'custom';
  }

  resolveExecutionCapabilityType(execution: Record<string, unknown>): string {
    if (execution.runtimeType === 'document') {
      return 'document.render';
    }
    if (execution.runtimeType === 'workflow') {
      return 'workflow.run';
    }
    return 'skill.runtime';
  }

  resolveExecutionAction(execution: Record<string, unknown>): string {
    if (execution.runtimeType === 'document') {
      return 'render';
    }
    if (execution.runtimeType === 'workflow') {
      return 'run';
    }
    return 'execute';
  }

  resolveExecutionInput(execution: Record<string, unknown>): Record<string, unknown> {
    const normalizedInput = execution.normalizedInputJson as Record<string, unknown> | undefined;
    const baseInput = (
      normalizedInput?.input && typeof normalizedInput.input === 'object'
        ? normalizedInput.input
        : execution.inputJson
    ) as Record<string, unknown> | undefined;
    if (!baseInput) {
      return {};
    }

    if (execution.runtimeType === 'document') {
      return this.buildDocumentRuntimeInput(
        baseInput,
        normalizedInput?.paramResolution as Record<string, unknown> | undefined,
        typeof execution.id === 'string' ? execution.id : undefined
      );
    }

    return baseInput;
  }

  private buildDocumentRuntimeInput(
    input: Record<string, unknown>,
    rawParamResolution?: Record<string, unknown>,
    executionId?: string
  ): Record<string, unknown> {
    const result = { ...input };
    const existingData = this.asRecord(result.data);
    const dataPayload = existingData ? { ...existingData } : {};
    let hasBindingMappings = false;
    const bindingSamples: Array<{
      name: string;
      bindingPath: string;
      rawValue: unknown;
      resolvedValue: unknown;
    }> = [];
    const diagnostics = {
      totalEntries: 0,
      mapped: [] as string[],
      invalidEntry: [] as string[],
      missingValue: [] as string[],
      notFinal: [] as string[],
      missingBindingPath: [] as string[],
    };

    for (const [name, entry] of Object.entries(rawParamResolution || {})) {
      diagnostics.totalEntries += 1;
      const normalizedEntry = this.normalizeDocumentParamResolutionEntry(entry);
      if (!normalizedEntry) {
        diagnostics.invalidEntry.push(name);
        continue;
      }
      if (normalizedEntry.final !== true) {
        diagnostics.notFinal.push(name);
        continue;
      }
      if (normalizedEntry.value === undefined || normalizedEntry.value === null) {
        diagnostics.missingValue.push(name);
        continue;
      }
      const bindingPaths = this.resolveDocumentBindingPaths(normalizedEntry);
      if (bindingPaths.length === 0) {
        diagnostics.missingBindingPath.push(name);
        continue;
      }

      hasBindingMappings = true;
      diagnostics.mapped.push(name);
      bindingPaths.forEach((bindingPath) => {
        const resolvedValue = this.resolveBindingValue(bindingPath, normalizedEntry.value);
        if (
          name === 'payment.firstDays' ||
          name === 'payment.firstRatio' ||
          name === 'payment.firstAmount' ||
          name === 'payment.totalAmount' ||
          name === 'payment.bankAccount' ||
          name === 'service.endUser'
        ) {
          bindingSamples.push({
            name,
            bindingPath,
            rawValue: normalizedEntry.value,
            resolvedValue,
          });
        }
        this.setBoundValue(dataPayload, bindingPath, normalizedEntry.value);
      });
      delete result[name];
    }

    this.logDocumentRuntimeMappingDiagnostics({
      executionId,
      input,
      existingData,
      diagnostics,
    });

    if (!hasBindingMappings) {
      return result;
    }

    result.data = dataPayload;
    return result;
  }

  private logDocumentRuntimeMappingDiagnostics(input: {
    executionId?: string;
    input: Record<string, unknown>;
    existingData?: Record<string, unknown>;
    diagnostics: {
      totalEntries: number;
      mapped: string[];
      invalidEntry: string[];
      missingValue: string[];
      notFinal: string[];
      missingBindingPath: string[];
    };
  }): void {
    const { executionId, input: runtimeInput, existingData, diagnostics } = input;
    if (diagnostics.totalEntries === 0) {
      return;
    }

    if (diagnostics.mapped.length > 0) {
      return;
    }

    this.logger.warn(
      `Document runtime payload resolved zero mapped fields${executionId ? ` for execution ${executionId}` : ''}: ${JSON.stringify(
        {
          totalEntries: diagnostics.totalEntries,
          notFinal: diagnostics.notFinal,
          missingValue: diagnostics.missingValue,
          missingBindingPath: diagnostics.missingBindingPath,
          invalidEntry: diagnostics.invalidEntry,
          hasExistingData: Boolean(existingData && Object.keys(existingData).length > 0),
          inputKeys: Object.keys(runtimeInput),
        }
      )}`
    );
  }

  private normalizeDocumentParamResolutionEntry(
    value: unknown
  ): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const entry = value as Record<string, unknown>;
    return {
      ...entry,
      ...(entry.template_binding === undefined && typeof entry.templateBinding === 'string'
        ? { template_binding: entry.templateBinding }
        : {}),
      ...(entry.render_path === undefined &&
      (typeof entry.renderPath === 'string' ||
        (Array.isArray(entry.renderPath) &&
          entry.renderPath.every((item) => typeof item === 'string')))
        ? { render_path: entry.renderPath }
        : {}),
    };
  }

  private resolveDocumentBindingPaths(entry: Record<string, unknown>): string[] {
    const rawBindingPaths =
      typeof entry.template_binding === 'string' && entry.template_binding.trim()
        ? [entry.template_binding.trim()]
        : typeof entry.render_path === 'string' && entry.render_path.trim()
          ? [entry.render_path.trim()]
          : Array.isArray(entry.render_path)
            ? entry.render_path
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
            : [];
    if (rawBindingPaths.length === 0) {
      return [];
    }

    return Array.from(
      new Set(
        rawBindingPaths
          .map((bindingPath) => bindingPath.replace(/^data\./, '').trim())
          .filter((bindingPath) => bindingPath.length > 0)
      )
    );
  }

  private setBoundValue(target: Record<string, unknown>, path: string, value: unknown): void {
    const resolvedValue = this.resolveBindingValue(path, value);
    if (resolvedValue === undefined || resolvedValue === null) {
      return;
    }

    const arrayPathMatch = path.match(/^(.*)\[\]\.(.+)$/);
    if (arrayPathMatch) {
      const [, rawArrayPath, rawItemPath] = arrayPathMatch;
      const arrayPath = rawArrayPath.trim();
      const itemPath = rawItemPath.trim();
      if (!arrayPath || !itemPath || !Array.isArray(resolvedValue)) {
        return;
      }
      const list = this.ensureArrayPath(target, arrayPath);
      resolvedValue.forEach((itemValue, index) => {
        const existing = list[index];
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
          list[index] = {};
        }
        this.setNestedValue(list[index] as Record<string, unknown>, itemPath, itemValue);
      });
      return;
    }

    this.setNestedValue(target, path, resolvedValue);
  }

  private resolveBindingValue(path: string, value: unknown): unknown {
    if (Array.isArray(value)) {
      const normalized = value
        .map((item) => this.resolveLocalizedBindingValue(path, item))
        .filter((item) => item !== undefined && item !== null);
      return normalized;
    }

    return this.resolveLocalizedBindingValue(path, value);
  }

  private resolveLocalizedBindingValue(path: string, value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }

    const locale = this.extractBindingLocale(path);
    if (!locale) {
      return value;
    }

    const record = value as Record<string, unknown>;
    const localeCandidates = locale === 'cn' ? ['cn', 'zh'] : ['jp', 'ja'];

    for (const candidate of localeCandidates) {
      if (Object.prototype.hasOwnProperty.call(record, candidate)) {
        const localizedValue = record[candidate];
        if (localizedValue !== undefined && localizedValue !== null) {
          return localizedValue;
        }
      }
    }

    return undefined;
  }

  private extractBindingLocale(path: string): 'cn' | 'jp' | undefined {
    const normalizedPath = path.trim();
    if (/_cn$/i.test(normalizedPath) || /_zh$/i.test(normalizedPath)) {
      return 'cn';
    }
    if (/_jp$/i.test(normalizedPath) || /_ja$/i.test(normalizedPath)) {
      return 'jp';
    }
    return undefined;
  }

  private setNestedValue(target: Record<string, unknown>, path: string, value: unknown): void {
    const segments = path
      .split('.')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      return;
    }

    let current: Record<string, unknown> = target;
    for (const segment of segments.slice(0, -1)) {
      const existing = current[segment];
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
        current[segment] = {};
      }
      current = current[segment] as Record<string, unknown>;
    }

    current[segments[segments.length - 1]] = value;
  }

  private ensureArrayPath(target: Record<string, unknown>, path: string): unknown[] {
    const segments = path
      .split('.')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      return [];
    }

    let current: Record<string, unknown> = target;
    for (const segment of segments.slice(0, -1)) {
      const existing = current[segment];
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
        current[segment] = {};
      }
      current = current[segment] as Record<string, unknown>;
    }

    const leafKey = segments[segments.length - 1];
    const existingLeaf = current[leafKey];
    if (!Array.isArray(existingLeaf)) {
      current[leafKey] = [];
    }
    return current[leafKey] as unknown[];
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  buildPolicyContext(execution: Record<string, unknown>): PolicyContext {
    return {
      riskLevel: (execution.riskLevel as 'L0' | 'L1' | 'L2' | 'L3' | undefined) || 'L0',
      requiresApproval: Boolean(execution.requiresApproval),
    };
  }
}
