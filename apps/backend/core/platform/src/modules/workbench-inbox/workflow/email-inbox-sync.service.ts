import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { PrismaService } from "../../../prisma/prisma.service";
import { getControlPlaneApiUrl } from "../../../config/service-endpoints";
import { UserEmailConnectionService } from "../../user-connection/user-email-connection.service";
import { TodoSourceType } from "../dto/workbench-inbox.dto";
import { WorkbenchInboxService } from "../workbench-inbox.service";

export interface EmailSyncResult {
  success: boolean;
  message: string;
  processedCount: number;
  skippedCount: number;
  errors: string[];
  lastSyncedAt: string;
}

export interface EmailSyncStatus {
  isConfigured: boolean;
  emailAddress?: string;
  providerType?: string;
  lastSyncedAt?: string;
  lastSyncStatus?: "success" | "failed" | "idle";
  lastError?: string;
}

@Injectable()
export class EmailInboxSyncService {
  private readonly logger = new Logger(EmailInboxSyncService.name);
  private syncStatusMap = new Map<string, { lastSyncedAt?: string; lastSyncStatus?: "success" | "failed" | "idle"; lastError?: string }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxService: WorkbenchInboxService,
    private readonly userEmailService: UserEmailConnectionService
  ) {}

  /**
   * 获取用户邮件自动同步状态
   */
  async getSyncStatus(userId: string): Promise<EmailSyncStatus> {
    const connection = await this.userEmailService.getConnection(userId);
    const cached = this.syncStatusMap.get(userId) || { lastSyncStatus: "idle" };

    return {
      isConfigured: connection.configured,
      emailAddress: connection.emailAddress,
      providerType: connection.providerType,
      lastSyncedAt: cached.lastSyncedAt,
      lastSyncStatus: cached.lastSyncStatus,
      lastError: cached.lastError,
    };
  }

  /**
   * 执行邮件收取 -> 存入 GTD 收件箱 -> 标为已读 完整闭环流水线
   */
  async syncUserUnreadEmails(
    userId: string,
    options?: { limit?: number; authToken?: string }
  ): Promise<EmailSyncResult> {
    const connection = await this.userEmailService.getConnection(userId);
    if (!connection.configured) {
      return {
        success: false,
        message: "当前用户尚未配置邮箱连接，请先前往设置绑定邮箱",
        processedCount: 0,
        skippedCount: 0,
        errors: ["邮箱连接未配置"],
        lastSyncedAt: new Date().toISOString(),
      };
    }

    const limit = Math.min(Math.max(options?.limit || 20, 1), 50);
    const errors: string[] = [];
    let processedCount = 0;
    let skippedCount = 0;

    try {
      this.logger.log(`Starting email sync for userId=${userId}, limit=${limit}`);

      // 1. 调用内置邮件技能 platform.email.messages 获取未读邮件
      const controlPlaneUrl = getControlPlaneApiUrl();
      const internalSecret =
        process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET;

      let unreadMessages: Array<{
        id: string;
        subject?: string;
        from?: string;
        body?: string;
        snippet?: string;
        receivedAt?: string;
        hasAttachments?: boolean;
      }> = [];

      try {
        const response = await axios.post(
          `${controlPlaneUrl}/executions`,
          {
            skillId: "platform.email.messages",
            capabilityId: "platform.email.messages",
            input: {
              folder: "inbox",
              unreadOnly: true,
              limit,
            },
          },
          {
            headers: {
              "Content-Type": "application/json",
              ...(internalSecret ? { "x-internal-secret": internalSecret } : {}),
              ...(options?.authToken ? { Authorization: options.authToken } : {}),
              "X-User-Id": userId,
            },
            timeout: 15000,
          }
        );

        const executionData = response.data as any;
        // 如果返回了直接的输出结果或中间记录
        if (executionData?.output?.items && Array.isArray(executionData.output.items)) {
          unreadMessages = executionData.output.items;
        } else if (executionData?.result?.items && Array.isArray(executionData.result.items)) {
          unreadMessages = executionData.result.items;
        } else if (Array.isArray(executionData?.items)) {
          unreadMessages = executionData.items;
        }
      } catch (err: any) {
        // 若从 control-plane 直接调用遇到网络或执行单排队，尝试获取该用户的邮件并容错
        const errMsg = err.response?.data?.message || err.message;
        this.logger.warn(`Control-plane email execution error: ${errMsg}`);
        errors.push(`邮件拉取失败: ${errMsg}`);
      }

      if (unreadMessages.length === 0) {
        const now = new Date().toISOString();
        this.syncStatusMap.set(userId, { lastSyncedAt: now, lastSyncStatus: "success" });
        return {
          success: true,
          message: "当前收件箱没有新的未读邮件",
          processedCount: 0,
          skippedCount: 0,
          errors,
          lastSyncedAt: now,
        };
      }

      // 2. 幂等接入 GTD 收件箱
      const succeededMessageIds: string[] = [];

      for (const email of unreadMessages) {
        const emailRefId = email.id || String(email.receivedAt || "");
        if (!emailRefId) continue;

        // 幂等防重：检查是否已有相同 sourceRefId 的收件箱记录
        const existing = await this.prisma.workbenchInboxItem.findFirst({
          where: {
            userId,
            sourceType: TodoSourceType.email,
            sourceRefId: emailRefId,
          },
        });

        if (existing) {
          skippedCount++;
          succeededMessageIds.push(email.id); // 已经在收件箱中，仍记录以确保标记为已读
          continue;
        }

        const title = email.subject?.trim() || "（无主题邮件）";
        const rawContent = (email.body || email.snippet || title).trim();

        try {
          await this.inboxService.ingest(userId, {
            title,
            rawContent,
            sourceType: TodoSourceType.email,
            sourceSender: email.from,
            sourceRefId: emailRefId,
            sourceTitle: email.subject || "邮件通知",
            extra: {
              receivedAt: email.receivedAt,
              hasAttachments: email.hasAttachments,
              providerType: connection.providerType,
            },
          });
          processedCount++;
          succeededMessageIds.push(email.id);
        } catch (ingestErr: any) {
          errors.push(`写入邮件「${title}」至收件箱失败: ${ingestErr.message}`);
        }
      }

      // 3. 将成功摄入收件箱的邮件在原邮箱中批量更新为已读 (isRead: true)
      if (succeededMessageIds.length > 0) {
        try {
          await axios.post(
            `${controlPlaneUrl}/executions`,
            {
              skillId: "platform.email.update",
              capabilityId: "platform.email.update",
              input: {
                messageRefs: succeededMessageIds,
                isRead: true,
              },
            },
            {
              headers: {
                "Content-Type": "application/json",
                ...(internalSecret ? { "x-internal-secret": internalSecret } : {}),
                ...(options?.authToken ? { Authorization: options.authToken } : {}),
                "X-User-Id": userId,
              },
              timeout: 10000,
            }
          );
        } catch (updateErr: any) {
          this.logger.warn(`Failed to mark emails as read: ${updateErr.message}`);
          errors.push(`标记邮件已读异常: ${updateErr.message}`);
        }
      }

      const now = new Date().toISOString();
      this.syncStatusMap.set(userId, {
        lastSyncedAt: now,
        lastSyncStatus: errors.length > 0 ? "failed" : "success",
        lastError: errors.join("; "),
      });

      return {
        success: errors.length === 0 || processedCount > 0,
        message: `邮件同步完成：新增 ${processedCount} 封入收件箱，跳过 ${skippedCount} 封已收邮件`,
        processedCount,
        skippedCount,
        errors,
        lastSyncedAt: now,
      };
    } catch (globalErr: any) {
      this.logger.error(`Email sync failed globally: ${globalErr.message}`, globalErr.stack);
      const now = new Date().toISOString();
      this.syncStatusMap.set(userId, {
        lastSyncedAt: now,
        lastSyncStatus: "failed",
        lastError: globalErr.message,
      });
      return {
        success: false,
        message: `邮件同步异常: ${globalErr.message}`,
        processedCount,
        skippedCount,
        errors: [...errors, globalErr.message],
        lastSyncedAt: now,
      };
    }
  }
}
