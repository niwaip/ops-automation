/**
 * Tool Executor
 * 工具执行器，管理工具注册和执行
 */

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  ToolDefinition,
  ToolResult,
  ExecutionContext,
  StreamEvent,
  StreamEventType,
  FlowTemplate,
} from './interfaces';
import {
  SkillMatchTool,
  ParamCollectTool,
  DocumentGenTool,
  UserAskTool,
  FileParseTool,
  GenerateParametersTool,
  DocumentRenderTool,
  PreviewParamsTool,
  ApiCallTool,
  FlowExecuteTool,
  BrowserStepTool,
} from './tools';
import { BaseTool } from './tools/base.tool';

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
export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);
  private tools: Map<string, ToolDefinition> = new Map();
  private defaultTools: ToolDefinition[] = [];
  private isFlowsLoaded = false;

  constructor() {
    // 注册默认工具
    this.registerDefaultTools();
  }

  /**
   * 注册默认工具集
   */
  private registerDefaultTools(): void {
    this.defaultTools = [
      new SkillMatchTool(),
      new ParamCollectTool(),
      new DocumentGenTool(),
      new UserAskTool(),
      new FileParseTool(),
      new GenerateParametersTool(),
      new DocumentRenderTool(),
      new PreviewParamsTool(),
      new ApiCallTool(),
      new FlowExecuteTool(),
      new BrowserStepTool(),
    ];

    for (const tool of this.defaultTools) {
      this.tools.set(tool.name, tool);
    }

    this.logger.log(`Registered ${this.defaultTools.length} default tools`);
  }

  /**
   * 动态加载流程模板并包装为工具 (Flow as a Tool)
   */
  async loadDynamicFlowTools(): Promise<void> {
    if (this.isFlowsLoaded) return;

    try {
      this.logger.log('Loading dynamic flow templates as tools...');
      const authUrl = getAuthServiceUrl();
      const response = await axios.get(`${authUrl}/execution-flow-templates`);
      const templates = response.data.templates as FlowTemplate[];

      if (!templates || templates.length === 0) {
        this.isFlowsLoaded = true;
        return;
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
        // 同时支持通过 executionFlowKeys 匹配
        if (template.executionFlowKeys && template.executionFlowKeys.length > 0) {
          template.executionFlowKeys.forEach(key => {
            this.tools.set(`flow_key_${key}`, flowTool);
          });
        }
      }

      this.isFlowsLoaded = true;
      this.logger.log(`Registered ${templates.length} dynamic flow tools`);
    } catch (error) {
      this.logger.error('Failed to load dynamic flow tools:', error.message);
    }
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

  /**
   * 执行工具（含权限二次校验）
   */
  async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);

    if (!tool) {
      this.logger.warn(`Tool not found: ${toolName}`);
      return {
        success: false,
        output: `工具 "${toolName}" 不存在`,
        data: { error: 'tool_not_found' },
      };
    }

    // 权限二次校验（防御性编程）
    if (tool instanceof BaseTool && !tool.isAuthorized(context.userRoles)) {
      this.logger.warn(`Unauthorized tool access: user=${context.userId}, tool=${toolName}`);
      return {
        success: false,
        output: `抱歉，您没有权限执行 "${tool.description.split(':')[0]}" 相关的操作。`,
        data: { error: 'unauthorized_access' },
      };
    }

    // 验证参数
    const validation = tool.validateParams(params);
    if (!validation.valid) {
      this.logger.debug(`Tool ${toolName} missing params: ${validation.missing.join(', ')}`);
      return {
        success: false,
        output: `参数不完整，缺少: ${validation.missing.join(', ')}`,
        data: { missingParams: validation.missing },
        requiresUserInput: true,
        userInputPrompt: `请提供以下参数: ${validation.missing.join(', ')}`,
      };
    }

    try {
      this.logger.debug(`Executing tool: ${toolName} with params: ${JSON.stringify(params)}`);
      const result = await tool.execute(params, context);
      this.logger.debug(`Tool ${toolName} result: success=${result.success}`);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Tool ${toolName} execution failed: ${errorMsg}`);

      return {
        success: false,
        output: `工具执行失败: ${errorMsg}`,
        data: { error: 'execution_error', message: errorMsg },
      };
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

    return {
      type: StreamEventType.OBSERVATION,
      content: result.output,
      data: {
        tool: toolName,
        params,
        result,
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
