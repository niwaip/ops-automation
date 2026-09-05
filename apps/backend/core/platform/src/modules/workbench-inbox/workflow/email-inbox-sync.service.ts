import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { PrismaService } from "../../../prisma/prisma.service";
import { getControlPlaneApiUrl } from "../../../config/service-endpoints";
import { UserEmailConnectionService } from "../../user-connection/user-email-connection.service";
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
   * 执行邮件收取 -> 存入 GTD 收件箱 -> 标为已读 流水线
   * （完全切换为由 EmailInboxSyncWorkflow 工作流执行，移除原有硬编码三步过程式代码）
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
    const now = new Date().toISOString();

    try {
      this.logger.log(`Invoking EmailInboxSyncWorkflow for userId=${userId}, limit=${limit}`);

      // 1. 动态解析已发布的 EmailInboxSyncWorkflow 技能 ID
      const workflowSkill = await this.prisma.skillConfig.findFirst({
        where: { name: "EmailInboxSyncWorkflow", isActive: true },
        select: { id: true },
      });
      if (!workflowSkill?.id) {
        throw new Error("未找到已发布的 EmailInboxSyncWorkflow 工作流技能，请先在技能中心完成发布");
      }
      const skillId = workflowSkill.id;

      const controlPlaneUrl = getControlPlaneApiUrl();
      const internalSecret =
        process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET;

      // 2. 调度已发布工作流执行（通过 Control Plane 驱动 Temporal 编排引擎）
      const response = await axios.post<{ id: string; status?: string; result?: any }>(
        `${controlPlaneUrl}/executions`,
        {
          skillId,
          capabilityId: skillId,
          input: {
            runMode: "AUTO",
            maxCount: limit,
            sourceType: "EMAIL",
            autoDeduplicate: true,
            userId,
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

      const executionId = response.data?.id;
      this.logger.log(`EmailInboxSyncWorkflow dispatched: executionId=${executionId}`);

      let executionData: any = response.data;
      // 若非直接终态，短暂轮询等待工作流返回业务数据（最多轮询 6 次，共 3 秒）
      if (
        executionId &&
        executionData?.status !== "succeeded" &&
        executionData?.status !== "failed"
      ) {
        for (let i = 0; i < 6; i++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          try {
            const pollRes = await axios.get(`${controlPlaneUrl}/executions/${executionId}`, {
              headers: {
                ...(internalSecret ? { "x-internal-secret": internalSecret } : {}),
                ...(options?.authToken ? { Authorization: options.authToken } : {}),
                "X-User-Id": userId,
              },
              timeout: 5000,
            });
            executionData = pollRes.data;
            if (executionData?.status === "succeeded" || executionData?.status === "failed") {
              break;
            }
          } catch {
            // 轮询异常不阻断，继续等待或返回已提交
          }
        }
      }

      const isFailed = executionData?.status === "failed";
      const businessData =
        executionData?.result?.businessData ||
        executionData?.result_json?.result?.businessData ||
        executionData?.result_json?.businessData ||
        {};
      const processedCount =
        Array.isArray(businessData.inboxItems)
          ? businessData.inboxItems.length
          : Array.isArray(businessData.messageIds)
          ? businessData.messageIds.length
          : 0;
      const markedReadCount = businessData.markedReadCount ?? processedCount;
      const errorReason = businessData.errorReason || executionData?.failureReason;

      this.syncStatusMap.set(userId, {
        lastSyncedAt: now,
        lastSyncStatus: isFailed ? "failed" : "success",
        lastError: isFailed ? (errorReason || "工作流执行失败") : undefined,
      });

      return {
        success: !isFailed,
        message: isFailed
          ? `工作流执行失败: ${errorReason || "未知异常"}`
          : `工作流同步完成：已沉淀 ${processedCount} 封邮件，已标记 ${markedReadCount} 封已读`,
        processedCount,
        skippedCount: 0,
        errors: isFailed && errorReason ? [errorReason] : [],
        lastSyncedAt: now,
      };
    } catch (globalErr: any) {
      const errMsg = globalErr.response?.data?.message || globalErr.message;
      this.logger.error(`Email sync workflow invocation failed: ${errMsg}`, globalErr.stack);
      this.syncStatusMap.set(userId, {
        lastSyncedAt: now,
        lastSyncStatus: "failed",
        lastError: errMsg,
      });
      return {
        success: false,
        message: `工作流触发异常: ${errMsg}`,
        processedCount: 0,
        skippedCount: 0,
        errors: [errMsg],
        lastSyncedAt: now,
      };
    }
  }
}
