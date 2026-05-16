import { Injectable } from '@nestjs/common';
import { PolicyContext, RuntimeStepInvokeRequest } from './runtime-adapter.interface';

interface RuntimeStepPhaseMetadata {
  phaseKey: string;
  phaseName: string;
  phaseType: string;
}

@Injectable()
export class RuntimeStepRequestFactory {
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
      runtimeType: 'browser',
      runtimeSessionId: input.runtimeSessionId,
      skillId: (input.execution.skillId as string | null) || null,
      publishedSkillId: this.resolveExecutionCapabilityId(input.execution) || null,
      capabilityType: 'browser.step',
      action: 'goto',
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
  }): RuntimeStepInvokeRequest | null {
    const capabilityId = this.resolveExecutionCapabilityId(input.execution);
    if (!capabilityId) {
      return null;
    }

    const executionId = input.execution.id as string;

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
        ...(input.phaseMetadata || {}),
      },
    };
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

  resolveExecutionRuntimeType(execution: Record<string, unknown>): 'document' | 'workflow' | 'custom' {
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
    if (normalizedInput?.input && typeof normalizedInput.input === 'object') {
      return normalizedInput.input as Record<string, unknown>;
    }

    return (execution.inputJson as Record<string, unknown> | undefined) || {};
  }

  buildPolicyContext(execution: Record<string, unknown>): PolicyContext {
    return {
      riskLevel: (execution.riskLevel as 'L0' | 'L1' | 'L2' | 'L3' | undefined) || 'L0',
      requiresApproval: Boolean(execution.requiresApproval),
    };
  }
}
