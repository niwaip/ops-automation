import { Injectable, Logger } from '@nestjs/common';
import { getAuthServiceUrl } from '../../config/service-endpoints';
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

type RuntimeToolPolicy = {
  name: string;
  promptExposure: 'hidden' | 'prompt_only' | 'runtime_only' | 'prompt_and_runtime';
  defaultRequiresConfirmation: boolean;
  defaultRequiresApproval: boolean;
  status: string;
};

const WEB_SEARCH_SKILL_IDS = new Set([
  'platform.search.web',
  'platform.web_search',
  'tavily_search',
  'web_search',
]);

@Injectable()
export class CapabilityResolver {
  private readonly logger = new Logger(CapabilityResolver.name);
  private readonly snapshotTtlMs = Number(process.env.REACT_CAPABILITY_SNAPSHOT_TTL_MS || 300_000);
  private readonly authServiceUrl = getAuthServiceUrl();

  constructor(private readonly toolExecutor: ToolExecutor) {}

  async resolve(request: ChatRequestDTO, context: ExecutionContext): Promise<CapabilitySnapshot> {
    const mode = request.config?.mode || 'task';
    const roles = request.userRoles || context.userRoles || [];
    const webSearchEnabled = request.config?.webSearch === true;
    const availableSkills = await this.loadAvailableSkills(context, webSearchEnabled);
    const selectedSkillId = context.skill?.skillId || context.documentContext?.selectedSkillId;

    const visibleSkills = this.toVisibleSkills(availableSkills);
    const configuredToolNames = request.config?.tools;
    const allVisibleTools = configuredToolNames?.length
      ? this.toolExecutor.getTools(configuredToolNames, roles)
      : this.toolExecutor.getAllTools(roles);
    const toolScope = await this.loadSelectedSkillToolScope(selectedSkillId, context);
    const visibleTools = this.toVisibleTools(
      this.applyToolVisibilityPolicy(allVisibleTools, visibleSkills, mode).filter((tool) => {
        if (!toolScope.allowedToolNames?.length) {
          return true;
        }
        return toolScope.allowedToolNames.includes(tool.name);
      }),
      toolScope.toolPolicies
    );

    return {
      userId: context.userId,
      sessionId: context.sessionId,
      roles,
      mode,
      webSearchEnabled,
      selectedSkillId,
      skillScopedToolNames: toolScope.allowedToolNames,
      deniedToolNames: toolScope.deniedToolNames,
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
        requireApprovalToolNames: visibleTools
          .filter((tool) => tool.requiresApproval)
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
    context: ExecutionContext
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

    if (Boolean(snapshot.webSearchEnabled) !== (request.config?.webSearch === true)) {
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
    context: ExecutionContext
  ): Promise<CapabilitySnapshot> {
    if (
      !this.shouldRefresh(context.capabilitySnapshot, request, context) &&
      context.capabilitySnapshot
    ) {
      return context.capabilitySnapshot;
    }

    return this.resolve(request, context);
  }

  private async loadAvailableSkills(
    context: ExecutionContext,
    webSearchEnabled: boolean
  ): Promise<AvailableSkillDefinition[]> {
    if (!context.userId) {
      return [];
    }

    try {
      const response = await fetch(`${this.authServiceUrl}/skills`, {
        headers: {
          ...(context.authToken ? { Authorization: context.authToken } : {}),
          ...(context.traceId ? { 'x-trace-id': context.traceId } : {}),
        },
      });

      if (!response.ok) {
        this.logger.warn(`Failed to load available skills: ${response.status}`);
        return [];
      }

      const payload = (await response.json()) as { skills?: Array<Record<string, unknown>> };
      const rawSkills = Array.isArray(payload.skills) ? payload.skills : [];

      const legacySkills = rawSkills
        .map((item) => {
          const apiEndpoints =
            typeof item.apiEndpoints === 'object' && item.apiEndpoints
              ? (item.apiEndpoints as AvailableSkillDefinition['apiEndpoints'])
              : undefined;
          const sourceTemplate = apiEndpoints?.runtimeMetadata?.sourceTemplate;
          const templateId =
            typeof item.templateId === 'string'
              ? item.templateId
              : typeof sourceTemplate?.templateId === 'string'
                ? sourceTemplate.templateId
                : undefined;
          const carboneTemplateId =
            typeof item.carboneTemplateId === 'string'
              ? item.carboneTemplateId
              : typeof sourceTemplate?.templateId === 'string'
                ? sourceTemplate.templateId
                : undefined;
          const carboneSkillId =
            typeof item.carboneSkillId === 'string'
              ? item.carboneSkillId
              : typeof sourceTemplate?.skillId === 'string'
                ? sourceTemplate.skillId
                : undefined;
          const sourceType = apiEndpoints?.runtimeMetadata?.sourceType;
          const executionType: AvailableSkillDefinition['executionType'] =
            sourceType === 'document' || sourceType === 'execution_flow_template'
              ? 'document'
              : undefined;

          return {
            skillId: String(item.id || ''),
            skillName: String(item.name || ''),
            description: typeof item.description === 'string' ? item.description : undefined,
            triggerKeywords: Array.isArray(item.triggerKeywords)
              ? item.triggerKeywords.map(String)
              : [],
            paramsSchema: (item.paramsSchema as AvailableSkillDefinition['paramsSchema']) || {
              properties: {},
              required: [],
            },
            templateId,
            carboneTemplateId,
            carboneSkillId,
            executionType,
            executionFlowTemplateIds: Array.isArray(item.executionFlowTemplateIds)
              ? item.executionFlowTemplateIds.map(String)
              : [],
            executionFlow: Array.isArray(item.executionFlow)
              ? item.executionFlow
                  .map((step) =>
                    step && typeof step === 'object'
                      ? String(
                          (step as Record<string, unknown>).name ||
                            (step as Record<string, unknown>).type ||
                            ''
                        )
                      : ''
                  )
                  .filter(Boolean)
              : [],
            apiEndpoints,
            goal: apiEndpoints?.runtimeMetadata?.goal,
            expectedResult: apiEndpoints?.runtimeMetadata?.expectedResult,
            outputParams: apiEndpoints?.runtimeMetadata?.outputParams,
            effectiveTools: Array.isArray(item.effectiveTools)
              ? item.effectiveTools.map(String)
              : undefined,
          };
        })
        .filter((item) => item.skillId && item.skillName)
        .filter((item) => webSearchEnabled || !this.isWebSearchSkill(item));

      if (!webSearchEnabled) return legacySkills;

      const builtinSearchSkill = await this.loadBuiltinWebSearchSkill(context);
      if (!builtinSearchSkill) return legacySkills;

      return [...legacySkills.filter((item) => !this.isWebSearchSkill(item)), builtinSearchSkill];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to load available skills: ${message}`);
      return [];
    }
  }

  private async loadBuiltinWebSearchSkill(
    context: ExecutionContext
  ): Promise<AvailableSkillDefinition | undefined> {
    try {
      const internalSecret =
        process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET;
      const response = await fetch(`${this.authServiceUrl}/internal/builtin-skills/catalog`, {
        headers: {
          ...(internalSecret ? { 'x-internal-secret': internalSecret } : {}),
          ...(context.userId ? { 'x-user-id': context.userId } : {}),
          ...(context.organizationId ? { 'x-org-id': context.organizationId } : {}),
          ...(context.userRoles?.length ? { 'x-role-ids': context.userRoles.join(',') } : {}),
          ...(context.traceId ? { 'x-trace-id': context.traceId } : {}),
        },
      });
      if (!response.ok) {
        this.logger.warn(`Failed to load built-in web search skill: ${response.status}`);
        return undefined;
      }

      const payload = (await response.json()) as {
        capabilities?: Array<Record<string, unknown>>;
      };
      const capability = (payload.capabilities || []).find((item) => {
        const ref = item.capabilityRef as Record<string, unknown> | undefined;
        return ref?.id === 'platform.search.web';
      });
      if (!capability) return undefined;

      const ref = capability.capabilityRef as Record<string, unknown>;
      const runtimeHints = capability.runtimeHints as Record<string, unknown> | undefined;
      const inputSchema = (capability.inputSchema || {}) as Record<string, unknown>;
      return {
        skillId: String(ref.id),
        skillName: String(capability.displayName || ref.id),
        description:
          typeof capability.description === 'string' ? capability.description : undefined,
        triggerKeywords: Array.isArray(runtimeHints?.triggerKeywords)
          ? runtimeHints.triggerKeywords.map(String)
          : [],
        paramsSchema: {
          properties:
            inputSchema.properties && typeof inputSchema.properties === 'object'
              ? (inputSchema.properties as AvailableSkillDefinition['paramsSchema']['properties'])
              : {},
          required: Array.isArray(inputSchema.required) ? inputSchema.required.map(String) : [],
        },
        executionType: 'flow',
        executionFlow: ['search_web'],
        goal: '检索公开互联网中的最新信息并返回可引用来源',
        expectedResult: '包含标题、URL、摘要和相关度的结构化搜索结果',
      };
    } catch (error) {
      this.logger.warn(
        `Failed to load built-in web search skill: ${error instanceof Error ? error.message : 'unknown'}`
      );
      return undefined;
    }
  }

  private isWebSearchSkill(skill: AvailableSkillDefinition): boolean {
    return WEB_SEARCH_SKILL_IDS.has(skill.skillId) || WEB_SEARCH_SKILL_IDS.has(skill.skillName);
  }

  private applyToolVisibilityPolicy(
    tools: ToolDefinition[],
    visibleSkills: CapabilityVisibleSkill[],
    mode: 'chat' | 'task'
  ): ToolDefinition[] {
    const hasDocumentSkill = visibleSkills.some((skill) => skill.executionType === 'document');

    return tools.filter((tool) => {
      if (mode === 'task' && ['api_call', 'skill_match'].includes(tool.name)) {
        return false;
      }

      if (tool.name === 'document_render') {
        return hasDocumentSkill;
      }

      return true;
    });
  }

  private async loadSelectedSkillToolScope(
    selectedSkillId: string | undefined,
    context: ExecutionContext
  ): Promise<{
    allowedToolNames: string[];
    deniedToolNames: string[];
    toolPolicies: Map<string, RuntimeToolPolicy>;
  }> {
    if (!selectedSkillId) {
      return {
        allowedToolNames: [],
        deniedToolNames: [],
        toolPolicies: new Map(),
      };
    }

    try {
      const response = await fetch(
        `${this.authServiceUrl}/capabilities/runtime/skills/${selectedSkillId}/context`,
        {
          headers: {
            ...(context.authToken ? { Authorization: context.authToken } : {}),
            ...(context.traceId ? { 'x-trace-id': context.traceId } : {}),
          },
        }
      );

      if (!response.ok) {
        this.logger.warn(
          `Failed to load tool scope for skill ${selectedSkillId}: ${response.status}`
        );
        return {
          allowedToolNames: [],
          deniedToolNames: [],
          toolPolicies: new Map(),
        };
      }

      const payload = (await response.json()) as {
        allowedToolNames?: string[];
        toolPolicies?: RuntimeToolPolicy[];
      };
      const allowedToolNames = Array.isArray(payload.allowedToolNames)
        ? payload.allowedToolNames.map(String)
        : [];
      const toolPolicies = new Map(
        (Array.isArray(payload.toolPolicies) ? payload.toolPolicies : [])
          .filter((item): item is RuntimeToolPolicy => Boolean(item?.name))
          .map((item) => [
            String(item.name),
            {
              name: String(item.name),
              promptExposure: item.promptExposure || 'prompt_and_runtime',
              defaultRequiresConfirmation: Boolean(item.defaultRequiresConfirmation),
              defaultRequiresApproval: Boolean(item.defaultRequiresApproval),
              status: String(item.status || 'active'),
            },
          ])
      );

      return {
        allowedToolNames,
        deniedToolNames: [],
        toolPolicies,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to load tool scope for skill ${selectedSkillId}: ${error instanceof Error ? error.message : 'unknown'}`
      );
      return {
        allowedToolNames: [],
        deniedToolNames: [],
        toolPolicies: new Map(),
      };
    }
  }

  private toVisibleTools(
    tools: ToolDefinition[],
    toolPolicies: Map<string, RuntimeToolPolicy> = new Map()
  ): CapabilityVisibleTool[] {
    const visibleTools: CapabilityVisibleTool[] = [];

    for (const tool of tools) {
      const policy = toolPolicies.get(tool.name);
      const exposure = policy?.promptExposure || 'prompt_and_runtime';
      if (exposure === 'hidden' || (policy?.status && policy.status !== 'active')) {
        continue;
      }

      visibleTools.push({
        name: tool.name,
        description: tool.description,
        category: tool.category,
        requiresConfirmation: Boolean(
          tool.requiresConfirmation || policy?.defaultRequiresConfirmation
        ),
        requiresApproval: Boolean(policy?.defaultRequiresApproval),
        requiredRoles: tool.requiredRoles,
        parameters: tool.parameters,
        exposure:
          exposure === 'runtime_only'
            ? 'runtime_only'
            : exposure === 'prompt_only'
              ? 'prompt_only'
              : 'prompt_and_runtime',
      });
    }

    return visibleTools;
  }

  private toVisibleSkills(skills: AvailableSkillDefinition[]): CapabilityVisibleSkill[] {
    return skills.map((skill) => ({
      skillId: skill.skillId,
      skillName: skill.skillName,
      description: skill.description,
      triggerKeywords: skill.triggerKeywords,
      paramsSchema: skill.paramsSchema,
      executionType: skill.carboneSkillId
        ? 'document'
        : skill.executionFlow?.length
          ? 'flow'
          : 'query',
      templateId: skill.templateId,
      carboneSkillId: skill.carboneSkillId,
      carboneTemplateId: skill.carboneTemplateId,
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
      executionFlow: skill.executionFlow,
      apiEndpoints: skill.apiEndpoints,
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
