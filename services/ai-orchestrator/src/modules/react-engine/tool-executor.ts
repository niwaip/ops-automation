/**
 * Tool Executor
 * 工具执行器，管理工具注册和执行
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ToolDefinition,
  ToolResult,
  ExecutionContext,
  StreamEvent,
  StreamEventType,
} from './interfaces';
import {
  SkillMatchTool,
  ParamCollectTool,
  DocumentGenTool,
  UserAskTool,
  FileParseTool,
} from './tools';

@Injectable()
export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);
  private tools: Map<string, ToolDefinition> = new Map();
  private defaultTools: ToolDefinition[] = [];

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
    ];

    for (const tool of this.defaultTools) {
      this.tools.set(tool.name, tool);
    }

    this.logger.log(`Registered ${this.defaultTools.length} default tools`);
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
   * 获取所有工具定义
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取指定工具列表
   */
  getTools(toolNames: string[]): ToolDefinition[] {
    return toolNames
      .map((name) => this.tools.get(name))
      .filter((t) => t !== undefined) as ToolDefinition[];
  }

  /**
   * 执行工具
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
  getToolsDescription(): string {
    return this.getAllTools()
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');
  }
}