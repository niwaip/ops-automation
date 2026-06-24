/**
 * Tool Base Class
 * 所有工具的基类，定义统一接口
 */

import { Logger } from '@nestjs/common';
import { ToolDefinition, ToolResult, ExecutionContext } from '../interfaces';

export abstract class BaseTool implements ToolDefinition {
  name: string;
  description: string;
  parameters: ToolDefinition['parameters'];
  category?: ToolDefinition['category'];
  requiresConfirmation?: boolean;
  requiredRoles?: string[];
  protected logger: Logger;

  constructor(
    name: string,
    description: string,
    parameters: ToolDefinition['parameters'],
    options?: {
      category?: ToolDefinition['category'];
      requiresConfirmation?: boolean;
      requiredRoles?: string[];
    }
  ) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.category = options?.category;
    this.requiresConfirmation = options?.requiresConfirmation;
    this.requiredRoles = options?.requiredRoles;
    this.logger = new Logger(name);
  }

  /**
   * 执行工具 - 子类必须实现
   */
  abstract execute(params: Record<string, unknown>, context: ExecutionContext): Promise<ToolResult>;

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
   * 检查用户是否有权限执行此工具
   */
  isAuthorized(userRoles?: string[]): boolean {
    // 如果工具没有角色限制，则所有人可执行
    if (!this.requiredRoles || this.requiredRoles.length === 0) {
      return true;
    }

    // 如果用户没有角色信息，但工具限制了角色，则无权执行
    if (!userRoles || userRoles.length === 0) {
      return false;
    }

    // 检查用户角色是否包含工具所需的任一角色
    return this.requiredRoles.some((role) => userRoles.includes(role));
  }

  /**
   * 获取工具定义（用于AI调用）
   */
  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      category: this.category,
      requiresConfirmation: this.requiresConfirmation,
      requiredRoles: this.requiredRoles,
      validateParams: this.validateParams.bind(this),
      execute: this.execute.bind(this),
    };
  }
}
