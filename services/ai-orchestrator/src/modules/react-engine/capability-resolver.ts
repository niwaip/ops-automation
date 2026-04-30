import { Injectable, Logger } from '@nestjs/common';
import {
  AvailableSkillDefinition,
  CapabilitySnapshot,
  CapabilityVisibleSkill,
  CapabilityVisibleTool,
  ChatRequestDTO,
  ExecutionContext,
  ToolDefinition,
} from './interfaces';
import { ToolExecutor } from './tool-executor';

@Injectable()
export class CapabilityResolver {
  private readonly logger = new Logger(CapabilityResolver.name);
  private readonly snapshotTtlMs = Number(process.env.REACT_CAPABILITY_SNAPSHOT_TTL_MS || 300_000);

  constructor(private readonly toolExecutor: ToolExecutor) {}

  async resolve(
    request: ChatRequestDTO,
    context: ExecutionContext,
  ): Promise<CapabilitySnapshot> {
    const mode = request.config?.mode || 'task';
    const roles = request.userRoles || context.userRoles || [];
    const availableSkills = await this.loadAvailableSkills(context);

    const visibleSkills = this.toVisibleSkills(availableSkills);
    const configuredToolNames = request.config?.tools;
    const allVisibleTools = configuredToolNames?.length
      ? this.toolExecutor.getTools(configuredToolNames, roles)
      : this.toolExecutor.getAllTools(roles);
    const visibleTools = this.toVisibleTools(
      this.applyToolVisibilityPolicy(allVisibleTools, visibleSkills, mode),
    );

    return {
      userId: context.userId,
      sessionId: context.sessionId,
      roles,
      mode,
      visibleTools,
      visibleSkills: visibleSkills.slice(0, 20),
      constraints: {
        disallowToolNames: mode === 'task' ? ['api_call', 'skill_match'] : [],
        disallowSkillIds: [],
        forceSkillBoundExecution: mode === 'task',
        forbidExternalApiInTaskMode: mode === 'task',
        maxVisibleSkills: 20,
      },
      policies: {
        requireConfirmToolNames: visibleTools
          .filter((tool) => tool.requiresConfirmation)
          .map((tool) => tool.name),
        requireHumanReviewOnWrite: true,
        documentTemplateClarificationEnabled: true,
      },
      generatedAt: new Date().toISOString(),
      version: 'v1',
    };
  }

  shouldRefresh(
    snapshot: CapabilitySnapshot | undefined,
    request: ChatRequestDTO,
    context: ExecutionContext,
  ): boolean {
    if (!snapshot) {
      return true;
    }

    if (snapshot.version !== 'v1') {
      return true;
    }

    if (snapshot.userId !== context.userId || snapshot.sessionId !== context.sessionId) {
      return true;
    }

    const expectedMode = request.config?.mode || 'task';
    if (snapshot.mode !== expectedMode) {
      return true;
    }

    const requestRoles = request.userRoles || context.userRoles || [];
    if (!this.sameStringSet(snapshot.roles, requestRoles)) {
      return true;
    }

    const generatedAt = Date.parse(snapshot.generatedAt);
    if (Number.isNaN(generatedAt)) {
      return true;
    }

    return Date.now() - generatedAt > this.snapshotTtlMs;
  }

  async resolveIfNeeded(
    request: ChatRequestDTO,
    context: ExecutionContext,
  ): Promise<CapabilitySnapshot> {
    if (!this.shouldRefresh(context.capabilitySnapshot, request, context) && context.capabilitySnapshot) {
      return context.capabilitySnapshot;
    }

    return this.resolve(request, context);
  }

  private async loadAvailableSkills(context: ExecutionContext): Promise<AvailableSkillDefinition[]> {
    if (!context.userId) {
      return [];
    }

    try {
      const authUrl = process.env.AUTH_SERVICE_URL
        || (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production'
          ? 'http://ops-auth:3001'
          : 'http://localhost:3001');
      const response = await fetch(`${authUrl}/skills`, {
        headers: {
          ...(context.authToken ? { Authorization: context.authToken } : {}),
          ...(context.traceId ? { 'x-trace-id': context.traceId } : {}),
        },
      });

      if (!response.ok) {
        this.logger.warn(`Failed to load available skills: ${response.status}`);
        return [];
      }

      const payload = await response.json() as { skills?: Array<Record<string, unknown>> };
      const rawSkills = Array.isArray(payload.skills) ? payload.skills : [];

      return rawSkills.map((item) => {
        const apiEndpoints = (typeof item.apiEndpoints === 'object' && item.apiEndpoints)
          ? item.apiEndpoints as AvailableSkillDefinition['apiEndpoints']
          : undefined;

        return {
          skillId: String(item.id || ''),
          skillName: String(item.name || ''),
          description: typeof item.description === 'string' ? item.description : undefined,
          triggerKeywords: Array.isArray(item.triggerKeywords) ? item.triggerKeywords.map(String) : [],
          paramsSchema: (item.paramsSchema as AvailableSkillDefinition['paramsSchema']) || { properties: {}, required: [] },
          templateId: typeof item.templateId === 'string' ? item.templateId : undefined,
          carboneTemplateId: typeof item.carboneTemplateId === 'string' ? item.carboneTemplateId : undefined,
          carboneSkillId: typeof item.carboneSkillId === 'string' ? item.carboneSkillId : undefined,
          executionFlowTemplateIds: Array.isArray(item.executionFlowTemplateIds) ? item.executionFlowTemplateIds.map(String) : [],
          executionFlow: Array.isArray(item.executionFlow)
            ? item.executionFlow
                .map((step) => (step && typeof step === 'object'
                  ? String((step as Record<string, unknown>).name || (step as Record<string, unknown>).type || '')
                  : ''))
                .filter(Boolean)
            : [],
          apiEndpoints,
          goal: apiEndpoints?.runtimeMetadata?.goal,
          expectedResult: apiEndpoints?.runtimeMetadata?.expectedResult,
          outputParams: apiEndpoints?.runtimeMetadata?.outputParams,
        };
      }).filter((item) => item.skillId && item.skillName);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to load available skills: ${message}`);
      return [];
    }
  }

  private applyToolVisibilityPolicy(
    tools: ToolDefinition[],
    visibleSkills: CapabilityVisibleSkill[],
    mode: 'chat' | 'task',
  ): ToolDefinition[] {
    const hasDocumentSkill = visibleSkills.some((skill) => skill.executionType === 'document');

    return tools.filter((tool) => {
      if (mode === 'task' && ['api_call', 'skill_match'].includes(tool.name)) {
        return false;
      }

      if (tool.name === 'document_intake' || tool.name === 'document_render' || tool.name === 'document_param_recover') {
        return hasDocumentSkill;
      }

      if (tool.name === 'generate_parameters') {
        return visibleSkills.some((skill) => Boolean(skill.carboneSkillId));
      }

      return true;
    });
  }

  private toVisibleTools(tools: ToolDefinition[]): CapabilityVisibleTool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      requiresConfirmation: tool.requiresConfirmation,
      requiredRoles: tool.requiredRoles,
      parameters: tool.parameters,
      exposure: 'prompt_and_runtime',
    }));
  }

  private toVisibleSkills(skills: AvailableSkillDefinition[]): CapabilityVisibleSkill[] {
    return skills.map((skill) => ({
      skillId: skill.skillId,
      skillName: skill.skillName,
      description: skill.description,
      triggerKeywords: skill.triggerKeywords,
      paramsSchema: skill.paramsSchema,
      executionType: skill.carboneSkillId ? 'document' : skill.executionFlow?.length ? 'flow' : 'query',
      templateId: skill.templateId,
      carboneSkillId: skill.carboneSkillId,
      carboneTemplateId: skill.carboneTemplateId,
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
      executionFlow: skill.executionFlow,
      runtimeHints: {
        goal: skill.goal,
        expectedResult: skill.expectedResult,
        outputParams: skill.outputParams,
      },
    }));
  }

  private sameStringSet(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
      return false;
    }

    const leftSorted = [...left].sort();
    const rightSorted = [...right].sort();
    return leftSorted.every((value, index) => value === rightSorted[index]);
  }
}
