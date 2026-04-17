/**
 * Tool Base Class
 * 所有工具的基类，定义统一接口
 */

import { ToolDefinition, ToolResult, ExecutionContext } from '../interfaces';

export abstract class BaseTool implements ToolDefinition {
  name: string;
  description: string;
  parameters: ToolDefinition['parameters'];

  constructor(
    name: string,
    description: string,
    parameters: ToolDefinition['parameters'],
  ) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
  }

  /**
   * 执行工具 - 子类必须实现
   */
  abstract execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult>;

  /**
   * 验证参数
   */
  validateParams(params: Record<string, unknown>): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    const required = this.parameters.required || [];

    for (const key of required) {
      if (params[key] === undefined || params[key] === null) {
        missing.push(key);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * 获取工具定义（用于AI调用）
   */
  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      execute: this.execute.bind(this),
    };
  }
}