/**
 * Tool Executor
 * 工具执行器，管理工具注册和执行
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import axios from 'axios';
import {
  ToolDefinition,
  ToolResult,
  ExecutionContext,
  StreamEvent,
  StreamEventType,
  FlowTemplate,
} from './interfaces';
import { TRACE_ID_HEADER } from '../../common/trace.util';
import { BaseTool } from './tools/base.tool';
import { TOOL_METADATA_KEY, ToolOptions } from './decorators/tool.decorator';
import { TOOL_SECURITY_KEY, SecurityPolicy } from './decorators/security.decorator';
import { FlowExecuteTool } from './tools';

// Auth服务地址
const getAuthServiceUrl = () => {
  if (process.env.AUTH_SERVICE_URL) {
    return process.env.AUTH_SERVICE_URL;
  }
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return 'http://ops-auth:3001';
  }
  return 'http://localhost:3001';
};

@Injectable()
export class ToolExecutor implements OnModuleInit {
  private readonly logger = new Logger(ToolExecutor.name);
  private tools: Map<string, ToolDefinition> = new Map();
  private dynamicFlowToolNames: Set<string> = new Set();
  private isFlowsLoaded = false;
  private lastDynamicFlowLoadAt = 0;
  private readonly dynamicFlowTtlMs = Number(process.env.DYNAMIC_FLOW_TOOLS_TTL_MS || 60_000);

  constructor(
    private readonly discoveryService?: DiscoveryService,
    private readonly reflector: Reflector = new Reflector(),
  ) {}

  async onModuleInit() {
    this.discoverAndRegisterTools();
  }

  /**
   * 使用 DiscoveryService 自动发现并注册带有 @Tool 装饰器的工具
   */
  private discoverAndRegisterTools(): void {
    if (!this.discoveryService) {
      this.logger.debug('DiscoveryService not provided; skipping auto tool discovery');
      return;
    }

    const providers = this.discoveryService.getProviders();
    let registeredCount = 0;

    providers.forEach((wrapper) => {
      const { instance } = wrapper;
      if (!instance || typeof instance !== 'object') return;

      const metadata = this.reflector.get<ToolOptions>(
        TOOL_METADATA_KEY,
        instance.constructor,
      );

      if (metadata) {
        let tool = instance as ToolDefinition;

        // 应用 SecurityPolicy
        const securityPolicy = this.reflector.get<SecurityPolicy>(
          TOOL_SECURITY_KEY,
          instance.constructor,
        );
        if (securityPolicy) {
          this.logger.debug(`Applying security policy to tool ${metadata.name}`);
          tool = this.wrapWithSecurityPolicy(tool, securityPolicy);
        }

        this.tools.set(metadata.name, tool);
        registeredCount++;
      }
    });

    this.logger.log(`Automatically discovered and registered ${registeredCount} tools via decorators`);
  }

  /**
   * 包装工具执行逻辑以应用安全策略 (Security Middleware)
   */
  private wrapWithSecurityPolicy(tool: ToolDefinition, policy: SecurityPolicy): ToolDefinition {
    const originalExecute = tool.execute.bind(tool);

    tool.execute = async (params: Record<string, unknown>, context: ExecutionContext): Promise<ToolResult> => {
      // 1. 路径安全检查
      if (policy.validatePath) {
        for (const [key, value] of Object.entries(params)) {
          if (typeof value === 'string' && (key.toLowerCase().includes('path') || key.toLowerCase().includes('file'))) {
            if (value.includes('..') || value.startsWith('/') || value.includes('~')) {
              this.logger.warn(`Security Block: Path traversal attempt in tool ${tool.name}, parameter ${key}: ${value}`);
              return {
                success: false,
                output: `安全阻断：参数 ${key} 包含非法路径字符 (.. 或 绝对路径)。只允许相对当前工作目录的路径。`,
                data: { error: 'security_path_violation', parameter: key },
              };
            }
          }
        }
      }

      // 2. 命令注入检查
      if (policy.validateCommand) {
        const command = params.command as string | undefined;
        if (command && (command.includes(';') || command.includes('&') || command.includes('|') || command.includes('`') || command.includes('$'))) {
          this.logger.warn(`Security Block: Command injection attempt in tool ${tool.name}: ${command}`);
          return {
            success: false,
            output: '安全阻断：检测到潜在的命令注入风险字符。',
            data: { error: 'security_command_violation' },
          };
        }
      }

      // 3. 内容长度检查
      if (policy.maxContentLength) {
        for (const [key, value] of Object.entries(params)) {
          if (typeof value === 'string' && value.length > policy.maxContentLength) {
            this.logger.warn(`Security Block: Content too long in tool ${tool.name}, parameter ${key}`);
            return {
              success: false,
              output: `安全阻断：参数 ${key} 内容过长 (限制 ${policy.maxContentLength} 字符)。`,
              data: { error: 'security_length_violation', parameter: key },
            };
          }
        }
      }

      // 执行原始逻辑
      return originalExecute(params, context);
    };

    return tool;
  }

  /**
   * 动态加载流程模板并包装为工具 (Flow as a Tool)
   */
  async loadDynamicFlowTools(force = false, traceId?: string): Promise<{
    refreshed: boolean;
    loadedAt: number;
    dynamicFlowToolCount: number;
    ttlMs: number;
  }> {
    const now = Date.now();
    if (!force && this.isFlowsLoaded && now - this.lastDynamicFlowLoadAt < this.dynamicFlowTtlMs) {
      return {
        refreshed: false,
        loadedAt: this.lastDynamicFlowLoadAt,
        dynamicFlowToolCount: this.dynamicFlowToolNames.size,
        ttlMs: this.dynamicFlowTtlMs,
      };
    }

    try {
      const tracePrefix = traceId ? `[${traceId}] ` : '';
      this.logger.log(`${tracePrefix}Loading dynamic flow templates as tools...`);
      const authUrl = getAuthServiceUrl();
      const response = await axios.get<{ templates: FlowTemplate[] }>(`${authUrl}/execution-flow-templates`, {
        headers: traceId ? { [TRACE_ID_HEADER]: traceId } : undefined,
      });
      const templates = response.data.templates;

      this.removeDynamicFlowTools();

      if (!templates || templates.length === 0) {
        this.isFlowsLoaded = true;
        this.lastDynamicFlowLoadAt = Date.now();
        return {
          refreshed: true,
          loadedAt: this.lastDynamicFlowLoadAt,
          dynamicFlowToolCount: 0,
          ttlMs: this.dynamicFlowTtlMs,
        };
      }

      for (const template of templates) {
        // 将流程模板包装为工具
        const flowTool: ToolDefinition = {
          name: `flow_${template.id.replace(/-/g, '_')}`,
          description: `${template.name}: ${template.description}. 这是一个预编译流程，直接调用即可完成任务。`,
          category: 'flow',
          parameters: {
            type: 'object',
            properties: {
              params: {
                type: 'object',
                description: '执行流程所需的参数',
                required: false,
              },
            },
            required: [],
          },
          validateParams: () => ({ valid: true, missing: [] }),
          execute: async (params, context) => {
            const flowExecutor = this.getTool('flow_execute') as FlowExecuteTool;
            return flowExecutor.execute({
              templateId: template.id,
              params: params.params || context.collectedParams || {},
            }, context);
          },
        };

        this.tools.set(flowTool.name, flowTool);
        this.dynamicFlowToolNames.add(flowTool.name);
        // 同时支持通过 executionFlowKeys 匹配
        if (template.executionFlowKeys && template.executionFlowKeys.length > 0) {
          template.executionFlowKeys.forEach((key) => {
            const keyName = `flow_key_${key}`;
            this.tools.set(keyName, flowTool);
            this.dynamicFlowToolNames.add(keyName);
          });
        }
      }

      this.isFlowsLoaded = true;
      this.lastDynamicFlowLoadAt = Date.now();
      this.logger.log(`${tracePrefix}Registered ${templates.length} dynamic flow templates, ${this.dynamicFlowToolNames.size} aliases`);
      return {
        refreshed: true,
        loadedAt: this.lastDynamicFlowLoadAt,
        dynamicFlowToolCount: this.dynamicFlowToolNames.size,
        ttlMs: this.dynamicFlowTtlMs,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const tracePrefix = traceId ? `[${traceId}] ` : '';
      this.logger.error(`${tracePrefix}Failed to load dynamic flow tools: ${errorMsg}`);
      return {
        refreshed: false,
        loadedAt: this.lastDynamicFlowLoadAt,
        dynamicFlowToolCount: this.dynamicFlowToolNames.size,
        ttlMs: this.dynamicFlowTtlMs,
      };
    }
  }

  async refreshDynamicFlowTools(traceId?: string): Promise<{
    refreshed: boolean;
    loadedAt: number;
    dynamicFlowToolCount: number;
    ttlMs: number;
  }> {
    return this.loadDynamicFlowTools(true, traceId);
  }

  private removeDynamicFlowTools(): void {
    for (const toolName of this.dynamicFlowToolNames) {
      this.tools.delete(toolName);
    }
    this.dynamicFlowToolNames.clear();
  }

  /**
   * 注册自定义工具
   */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.logger.log(`Registered custom tool: ${tool.name}`);
  }

  /**
   * 获取工具
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具定义（支持权限过滤）
   */
  getAllTools(userRoles?: string[]): ToolDefinition[] {
    const allTools = Array.from(this.tools.values());
    
    // 如果没有传入角色信息，默认显示所有非限制工具
    return allTools.filter(tool => {
      if (tool instanceof BaseTool) {
        return tool.isAuthorized(userRoles);
      }
      // 对于普通对象定义的工具（如动态加载的 Flow），目前默认放行
      // 可以在 FlowTemplate 中也加入权限控制
      return true;
    });
  }

  /**
   * 获取指定工具列表（支持权限过滤）
   */
  getTools(toolNames: string[], userRoles?: string[]): ToolDefinition[] {
    return toolNames
      .map((name) => this.tools.get(name))
      .filter((t) => {
        if (!t) return false;
        if (t instanceof BaseTool) {
          return t.isAuthorized(userRoles);
        }
        return true;
      }) as ToolDefinition[];
  }

  private bindSkillContext(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): void {
    const requestedSkillId = typeof params.skillId === 'string' ? params.skillId : undefined;
    if (!requestedSkillId || context.skill?.skillId === requestedSkillId) {
      return;
    }

    const availableSkill = context.availableSkills?.find((item) => item.skillId === requestedSkillId);
    if (!availableSkill) {
      return;
    }

    context.skill = {
      skillId: availableSkill.skillId,
      skillName: availableSkill.skillName,
      matchedKeywords: availableSkill.triggerKeywords,
      confidence: 1,
      collectedParams: context.collectedParams || {},
      missingParams: availableSkill.paramsSchema.required || [],
      paramsSchema: availableSkill.paramsSchema,
      templateId: availableSkill.templateId,
      carboneSkillId: availableSkill.carboneSkillId,
      carboneTemplateId: availableSkill.carboneTemplateId,
      executionFlowTemplateId: availableSkill.executionFlowTemplateIds?.[0],
      executionFlowTemplateIds: availableSkill.executionFlowTemplateIds,
      executionFlow: availableSkill.executionFlow,
      apiEndpoints: availableSkill.apiEndpoints,
      goal: availableSkill.goal,
      expectedResult: availableSkill.expectedResult,
      outputParams: availableSkill.outputParams,
      matchReason: 'selected_from_available_skills',
    };
    context.selectedSkillToolNames = availableSkill.effectiveTools || context.selectedSkillToolNames;
  }

  private isToolVisibleInSnapshot(toolName: string, context: ExecutionContext): boolean {
    if (!context.capabilitySnapshot) {
      return true;
    }
    return context.capabilitySnapshot.visibleTools.some((tool) => tool.name === toolName);
  }

  private getCapabilityVisibleTool(toolName: string, context: ExecutionContext) {
    return context.capabilitySnapshot?.visibleTools.find((tool) => tool.name === toolName);
  }

  private hasApprovalForTool(toolName: string, context: ExecutionContext): boolean {
    return Boolean(context.approvedToolNames?.includes(toolName));
  }

  private buildToolResult(
    toolName: string,
    partial: Omit<ToolResult, 'meta'> & { meta?: ToolResult['meta'] },
  ): ToolResult {
    return {
      ...partial,
      meta: {
        toolName,
        capabilityChecked: true,
        ...(partial.meta || {}),
      },
    };
  }

  private isToolAllowedInSelectedSkill(toolName: string, context: ExecutionContext): boolean {
    const selectedSkillId =
      context.skill?.skillId
      || context.documentContext?.selectedSkillId
      || context.capabilitySnapshot?.selectedSkillId;
    const selectedSkillToolNames =
      context.selectedSkillToolNames
      || context.capabilitySnapshot?.skillScopedToolNames
      || context.availableSkills?.find((item) => item.skillId === selectedSkillId)?.effectiveTools;

    if (!selectedSkillId || !selectedSkillToolNames || selectedSkillToolNames.length === 0) {
      return true;
    }

    return selectedSkillToolNames.includes(toolName);
  }

  /**
   * 执行工具（含权限二次校验）
   */
  async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    const tracePrefix = context.traceId ? `[${context.traceId}] ` : '';
    this.logger.debug(`${tracePrefix}Allowed tools for current run: ${JSON.stringify(context.allowedToolNames || [])}`);
    if (context.allowedToolNames && !context.allowedToolNames.includes(toolName)) {
      this.logger.warn(`${tracePrefix}Tool NOT ALLOWED in current run: ${toolName}. This is a protocol violation.`);
      return this.buildToolResult(toolName, {
        success: false,
        output: `工具 "${toolName}" 不在当前任务允许列表中 (白名单约束)。请检查是否应使用技能(skillId)执行。`,
        code: 'tool_not_allowed',
        severity: 'error',
        data: { error: 'tool_not_allowed', allowedTools: context.allowedToolNames },
      });
    }

    if (!this.isToolVisibleInSnapshot(toolName, context)) {
      this.logger.warn(`${tracePrefix}Tool NOT VISIBLE in capability snapshot: ${toolName}`);
      return this.buildToolResult(toolName, {
        success: false,
        output: `工具 "${toolName}" 不在当前权限快照允许范围内。`,
        code: 'tool_not_visible_in_capability_snapshot',
        severity: 'error',
        data: { error: 'tool_not_visible_in_capability_snapshot' },
      });
    }

    const capabilityVisibleTool = this.getCapabilityVisibleTool(toolName, context);
    if (capabilityVisibleTool?.exposure === 'prompt_only') {
      this.logger.warn(`${tracePrefix}Tool is prompt-only and cannot run at runtime: ${toolName}`);
      return this.buildToolResult(toolName, {
        success: false,
        output: `工具 "${toolName}" 当前仅允许暴露给策略层，不能直接在运行时执行。`,
        code: 'tool_prompt_only',
        severity: 'error',
        data: { error: 'tool_prompt_only', toolName },
      });
    }

    if (!this.isToolAllowedInSelectedSkill(toolName, context)) {
      this.logger.warn(`${tracePrefix}Tool NOT BOUND to selected skill: ${toolName}`);
      return this.buildToolResult(toolName, {
        success: false,
        output: `工具 "${toolName}" 不在当前技能允许的工具范围内。请仅使用该 Skill 已绑定的工具。`,
        code: 'tool_not_bound_to_skill',
        severity: 'error',
        data: {
          error: 'tool_not_bound_to_skill',
          selectedSkillId:
            context.skill?.skillId
            || context.documentContext?.selectedSkillId
            || context.capabilitySnapshot?.selectedSkillId,
          allowedTools:
            context.selectedSkillToolNames
            || context.capabilitySnapshot?.skillScopedToolNames
            || [],
        },
      });
    }

    const requiresApproval = Boolean(
      context.capabilitySnapshot?.policies.requireApprovalToolNames?.includes(toolName)
      || capabilityVisibleTool?.requiresApproval,
    );
    if (requiresApproval && !this.hasApprovalForTool(toolName, context)) {
      this.logger.warn(`${tracePrefix}Tool requires approval before execution: ${toolName}`);
      return this.buildToolResult(toolName, {
        success: false,
        output: `工具 "${toolName}" 需要审批后才能执行，当前请求未携带审批通过状态。`,
        code: 'tool_requires_approval',
        severity: 'error',
        data: {
          error: 'tool_requires_approval',
          toolName,
          approvedToolNames: context.approvedToolNames || [],
        },
        requiresUserInput: true,
        userInputPrompt: `请先完成工具 "${toolName}" 的审批，再继续执行。`,
      });
    }

    const tool = this.tools.get(toolName);

    if (!tool) {
      this.logger.warn(`${tracePrefix}Tool not found: ${toolName}`);
      return this.buildToolResult(toolName, {
        success: false,
        output: `工具 "${toolName}" 不存在`,
        code: 'tool_not_found',
        severity: 'error',
        data: { error: 'tool_not_found' },
      });
    }

    // 权限二次校验（防御性编程）
    if (tool instanceof BaseTool && !tool.isAuthorized(context.userRoles)) {
      this.logger.warn(`${tracePrefix}Unauthorized tool access: user=${context.userId}, tool=${toolName}`);
      return this.buildToolResult(toolName, {
        success: false,
        output: `抱歉，您没有权限执行 "${tool.description.split(':')[0]}" 相关的操作。`,
        code: 'unauthorized_access',
        severity: 'error',
        data: { error: 'unauthorized_access' },
      });
    }

    // 对部分核心工具做参数兜底，避免模型遗漏必填字段导致流程中断。
    if (toolName === 'skill_match' && !params.userInput && context.originalUserInput) {
      params = {
        ...params,
        userInput: context.originalUserInput,
      };
    }

    if (['param_collect', 'document_intake', 'generate_parameters', 'document_render', 'document_param_recover', 'flow_execute'].includes(toolName)) {
      this.bindSkillContext(params, context);
    }

    if (toolName === 'param_collect') {
      params = {
        ...params,
        skillId: params.skillId || context.skill?.skillId,
        userInput: params.userInput || context.originalUserInput,
        existingParams: params.existingParams || context.collectedParams || {},
      };
    }

    if (toolName === 'flow_execute') {
      const incomingSkillId = typeof params.skillId === 'string' ? params.skillId : undefined;
      const matchedSkillId = context.skill?.skillId;
      const hasAvailableSkills = Boolean(context.availableSkills && context.availableSkills.length > 0);
      const isTaskConstrainedRun =
        hasAvailableSkills &&
        Array.isArray(context.allowedToolNames) &&
        !context.allowedToolNames.includes('api_call') &&
        !context.allowedToolNames.includes('skill_match');

      // 自动补全 skillId：如果模型没传，但上下文中有唯一匹配的技能，则自动补齐
      if (!incomingSkillId && matchedSkillId) {
        params.skillId = matchedSkillId;
      }

      if (isTaskConstrainedRun && !params.skillId) {
        return this.buildToolResult(toolName, {
          success: false,
          output: '任务模式下必须先基于 skillId 选择技能，再执行 flow_execute',
          code: 'skill_id_required_in_task_mode',
          severity: 'error',
          data: { error: 'skill_id_required_in_task_mode' },
        });
      }

      params = {
        ...params,
        skillId: params.skillId,
        params: params.params || context.collectedParams || {},
      };
    }

    // 验证参数
    const validation = tool.validateParams(params);
    if (!validation.valid) {
      this.logger.debug(`${tracePrefix}Tool ${toolName} missing params: ${validation.missing.join(', ')}`);
      return this.buildToolResult(toolName, {
        success: false,
        output: `参数不完整，缺少: ${validation.missing.join(', ')}`,
        code: 'missing_params',
        severity: 'warning',
        data: { missingParams: validation.missing },
        requiresUserInput: true,
        userInputPrompt: `请提供以下参数: ${validation.missing.join(', ')}`,
      });
    }

    try {
      this.logger.debug(`${tracePrefix}Executing tool: ${toolName} with params: ${JSON.stringify(params)}`);
      const result = await tool.execute(params, context);
      this.logger.debug(`${tracePrefix}Tool ${toolName} result: success=${result.success}`);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`${tracePrefix}Tool ${toolName} execution failed: ${errorMsg}`);

      return this.buildToolResult(toolName, {
        success: false,
        output: `工具执行失败: ${errorMsg}`,
        code: 'execution_error',
        severity: 'error',
        data: { error: 'execution_error', message: errorMsg },
      });
    }
  }

  /**
   * 执行工具并返回流式事件
   */
  async executeToolStream(
    toolName: string,
    params: Record<string, unknown>,
    context: ExecutionContext,
    iteration: number,
  ): Promise<StreamEvent> {
    const result = await this.executeTool(toolName, params, context);
    const resultData = result.data as Record<string, unknown> | undefined;

    return {
      type: StreamEventType.OBSERVATION,
      content: result.output,
      data: {
        tool: toolName,
        params,
        result,
        success: result.success,
        code: result.code,
        severity: result.severity,
        meta: result.meta,
        nextAction: result.nextAction,
        nextActionParams: result.nextActionParams,
        taskComplete: resultData?.taskComplete,
        finalAnswer: resultData?.finalAnswer,
        downloadUrl: resultData?.downloadUrl,
        requiresUserInput: result.requiresUserInput,
      },
      iteration,
    };
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取工具列表描述（用于AI调用）
   */
  getToolsDescription(userRoles?: string[]): string {
    return this.getAllTools(userRoles)
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');
  }
}
