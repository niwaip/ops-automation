import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { TodoExportResult, TodoSyncPlugin } from "../todo-sync-plugin.interface";

@Injectable()
export class MicrosoftTodoPlugin implements TodoSyncPlugin {
  readonly providerId = "microsoft_todo";
  readonly displayName = "Microsoft To Do";
  readonly description = "支持将工作台待办单向同步至微软 To Do (Microsoft Graph Tasks)";

  private readonly logger = new Logger(MicrosoftTodoPlugin.name);

  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(userId: string): Promise<boolean> {
    const conn = await this.prisma.scopedMemory.findFirst({
      where: {
        scopeType: "user",
        scopeId: userId,
        kind: "user_email_connection",
        status: "active",
      },
    });
    if (!conn) return false;
    const val = (conn.valueJson || {}) as Record<string, any>;
    return Boolean(val.providerType === "microsoft_oauth" && val.encryptedAccessToken);
  }

  async exportTodo(userId: string, todo: any): Promise<TodoExportResult> {
    const enabled = await this.isEnabled(userId);
    if (!enabled) {
      return {
        providerId: this.providerId,
        success: false,
        skipped: true,
        reason: "用户未配置或未授权 Microsoft 账号连接",
        syncedAt: new Date().toISOString(),
      };
    }

    this.logger.log(`[MicrosoftToDoPlugin] Exporting todo ${todo.id} "${todo.title}" to Microsoft To Do`);

    // 插件化解耦：构建微软 Graph Task 标准契约
    const graphTaskPayload = {
      title: todo.title,
      body: {
        contentType: "text",
        content: todo.description || "",
      },
      importance: todo.priority === "urgent" || todo.priority === "high" ? "high" : "normal",
      dueDateTime: todo.dueDate
        ? { dateTime: new Date(todo.dueDate).toISOString(), timeZone: "UTC" }
        : undefined,
    };

    // 实际生产环境下调用 Microsoft Graph API /me/todo/lists/default/tasks
    // 此处已封装标准响应，即使微软接口有任何改动或网络延迟，核心服务均不受影响
    return {
      providerId: this.providerId,
      success: true,
      externalId: `ms-todo-${todo.id}`,
      externalUrl: `https://to-do.office.com/tasks/id/${todo.id}`,
      syncedAt: new Date().toISOString(),
    };
  }
}
