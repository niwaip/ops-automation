import { Injectable, Logger } from "@nestjs/common";
import { TodoExportResult, TodoSyncPlugin } from "./todo-sync-plugin.interface";

@Injectable()
export class TodoSyncPluginRegistry {
  private readonly logger = new Logger(TodoSyncPluginRegistry.name);
  private readonly plugins = new Map<string, TodoSyncPlugin>();

  /**
   * 注册第三方待办同步插件
   */
  register(plugin: TodoSyncPlugin): void {
    if (this.plugins.has(plugin.providerId)) {
      this.logger.warn(`Overwriting existing plugin for providerId: ${plugin.providerId}`);
    }
    this.plugins.set(plugin.providerId, plugin);
    this.logger.log(`Registered TodoSyncPlugin: [${plugin.providerId}] (${plugin.displayName})`);
  }

  /**
   * 获取指定提供商插件
   */
  get(providerId: string): TodoSyncPlugin | undefined {
    return this.plugins.get(providerId);
  }

  /**
   * 列出所有已注册的插件清单
   */
  list(): Array<{ providerId: string; displayName: string; description?: string }> {
    return Array.from(this.plugins.values()).map((p) => ({
      providerId: p.providerId,
      displayName: p.displayName,
      description: p.description,
    }));
  }

  /**
   * 发现当前用户所有处于启用状态的插件
   */
  async getEnabledPlugins(userId: string): Promise<TodoSyncPlugin[]> {
    const enabled: TodoSyncPlugin[] = [];
    for (const plugin of this.plugins.values()) {
      try {
        if (await plugin.isEnabled(userId)) {
          enabled.push(plugin);
        }
      } catch (err: any) {
        this.logger.warn(`Error checking isEnabled for plugin ${plugin.providerId}: ${err.message}`);
      }
    }
    return enabled;
  }

  /**
   * 当待办被创建时，广播派发给所有已启用的外部同步插件（完全异步，零阻塞核心流程）
   */
  async dispatchTodoCreated(userId: string, todo: any): Promise<TodoExportResult[]> {
    const activePlugins = await this.getEnabledPlugins(userId);
    if (activePlugins.length === 0) {
      return [];
    }

    const results: TodoExportResult[] = [];
    for (const plugin of activePlugins) {
      try {
        const result = await plugin.exportTodo(userId, todo);
        results.push(result);
      } catch (err: any) {
        this.logger.error(`Plugin ${plugin.providerId} failed to export todo: ${err.message}`);
        results.push({
          providerId: plugin.providerId,
          success: false,
          reason: err.message,
          syncedAt: new Date().toISOString(),
        });
      }
    }
    return results;
  }
}
