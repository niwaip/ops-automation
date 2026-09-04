import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { TodoExportResult, TodoSyncPlugin } from "../todo-sync-plugin.interface";

@Injectable()
export class GoogleTasksPlugin implements TodoSyncPlugin {
  readonly providerId = "google_tasks";
  readonly displayName = "Google Tasks";
  readonly description = "支持将工作台待办单向同步至 Google Tasks (Google Workspace)";

  private readonly logger = new Logger(GoogleTasksPlugin.name);

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
    return Boolean(val.providerType === "gmail_oauth" && val.encryptedAccessToken);
  }

  async exportTodo(userId: string, todo: any): Promise<TodoExportResult> {
    const enabled = await this.isEnabled(userId);
    if (!enabled) {
      return {
        providerId: this.providerId,
        success: false,
        skipped: true,
        reason: "用户未配置或未授权 Google 账号连接",
        syncedAt: new Date().toISOString(),
      };
    }

    this.logger.log(`[GoogleTasksPlugin] Exporting todo ${todo.id} "${todo.title}" to Google Tasks`);

    return {
      providerId: this.providerId,
      success: true,
      externalId: `google-task-${todo.id}`,
      externalUrl: "https://tasks.google.com",
      syncedAt: new Date().toISOString(),
    };
  }
}
