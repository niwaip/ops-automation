import { Injectable, Logger } from '@nestjs/common';
import { PolicyContext, RuntimeStepInvokeRequest } from '../../adapters/runtime-adapter.interface';
import { BROWSER_ACTIONS, BROWSER_RUNTIME } from '../browser/browser-execution-constants';

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
    const stepObj = input.step as Record<string, unknown> | null | undefined;
    const capabilityId = this.resolveExecutionCapabilityId(input.execution, stepObj);
    if (!capabilityId) {
      return null;
    }

    const executionId = input.execution.id as string;
    const includeExecutionStepMetadata = this.shouldIncludeExecutionStepMetadata(input.execution);
    const isBuiltin = capabilityId.startsWith('platform.');

    const frozenMeta = (
      (stepObj?.inputBindingsJson as any)?._frozenMetadata ||
      (stepObj?.input_bindings_json as any)?._frozenMetadata ||
      (stepObj?.outputContractJson as any)?._frozenMetadata ||
      (stepObj?.output_contract_json as any)?._frozenMetadata ||
      stepObj?.metadata ||
      {}
    ) as Record<string, unknown>;

    const capabilityVersion = this.resolveExecutionCapabilityVersion(input.execution, stepObj);

    return {
      requestId: `${executionId}:${input.stepId}`,
      executionId,
      stepId: input.stepId,
      runtimeType: isBuiltin ? 'workflow' : this.resolveExecutionRuntimeType(input.execution),
      runtimeSessionId: input.runtimeSessionId,
      skillId: (input.execution.skillId as string | null) || capabilityId,
      publishedSkillId: capabilityId,
      capabilityType: isBuiltin ? 'builtin' : this.resolveExecutionCapabilityType(input.execution),
      action: isBuiltin ? 'run' : this.resolveExecutionAction(input.execution),
      input: this.resolveExecutionInput(input.execution),
      policyContext: this.buildPolicyContext(input.execution),
      metadata: {
        capabilityVersion,
        ...(isBuiltin ? { builtinSkill: true, definitionVersion: capabilityVersion } : {}),
        ...(frozenMeta.handlerKey
          ? { handlerKey: frozenMeta.handlerKey as string }
          : isBuiltin
            ? {
                handlerKey:
                  capabilityId === 'platform.document.markdown-artifact-writer'
                    ? 'document.markdown-artifact-writer'
                    : capabilityId === 'platform.notification.internal-message'
                      ? 'platform.notification.internal-message'
                      : undefined,
              }
            : {}),
        ...(frozenMeta.definitionDigest ? { definitionDigest: frozenMeta.definitionDigest as string } : {}),
        ...(frozenMeta.adapterRoute ? { adapterRoute: frozenMeta.adapterRoute as string } : {}),
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

  resolveExecutionCapabilityId(
    execution: Record<string, unknown>,
    step?: Record<string, unknown> | null,
  ): string | undefined {
    if (typeof step?.capabilityId === 'string' && step.capabilityId.trim()) {
      return step.capabilityId.trim();
    }
    if (typeof step?.capability_id === 'string' && step.capability_id.trim()) {
      return step.capability_id.trim();
    }

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

  resolveExecutionCapabilityVersion(
    execution: Record<string, unknown>,
    step?: Record<string, unknown> | null,
  ): string | undefined {
    if (typeof step?.capabilityVersion === 'string' && step.capabilityVersion.trim()) {
      return step.capabilityVersion.trim();
    }
    if (typeof step?.capability_version === 'string' && step.capability_version.trim()) {
      return step.capability_version.trim();
    }
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

    for (const [name, entry] of Object.entries(rawParamResolution || {})) {
      const normalizedEntry = this.normalizeDocumentParamResolutionEntry(entry);
      if (!normalizedEntry || normalizedEntry.final !== true || normalizedEntry.value === undefined || normalizedEntry.value === null) {
        continue;
      }
      const bindingPaths = this.resolveDocumentBindingPaths(normalizedEntry);
      if (bindingPaths.length === 0) {
        continue;
      }
      for (const bindingPath of bindingPaths) {
        this.setValueByPath(dataPayload, bindingPath, normalizedEntry.value);
        hasBindingMappings = true;
      }
    }

    if (hasBindingMappings) {
      result.data = dataPayload;
    }
    return result;
  }

  private normalizeDocumentParamResolutionEntry(entry: unknown): {
    final?: boolean;
    value?: unknown;
    bindingPath?: string;
    bindingPaths?: string[];
  } | null {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return null;
    }

    const rec = entry as Record<string, unknown>;
    const bindingPaths = Array.isArray(rec.bindingPaths)
      ? rec.bindingPaths.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : undefined;

    return {
      final: Boolean(rec.final),
      value: rec.value,
      bindingPath: typeof rec.bindingPath === 'string' && rec.bindingPath.trim() ? rec.bindingPath.trim() : undefined,
      bindingPaths: bindingPaths && bindingPaths.length > 0 ? bindingPaths : undefined,
    };
  }

  private resolveDocumentBindingPaths(entry: {
    bindingPath?: string;
    bindingPaths?: string[];
  }): string[] {
    const paths = new Set<string>();
    if (entry.bindingPath) {
      paths.add(entry.bindingPath);
    }
    if (entry.bindingPaths) {
      for (const path of entry.bindingPaths) {
        paths.add(path);
      }
    }
    return Array.from(paths);
  }

  private setValueByPath(target: Record<string, unknown>, pathStr: string, value: unknown): void {
    const parts = pathStr.split('.').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) {
      return;
    }

    let cursor: Record<string, unknown> = target;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const next = cursor[part];
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }

    cursor[parts[parts.length - 1]] = value;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private buildPolicyContext(execution: Record<string, unknown>): PolicyContext {
    return {
      riskLevel: (execution.riskLevel as PolicyContext['riskLevel']) || 'L0',
      requiresApproval: (execution.requiresApproval as boolean) || false,
    };
  }
}
