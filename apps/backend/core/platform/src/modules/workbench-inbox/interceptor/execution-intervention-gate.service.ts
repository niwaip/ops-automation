import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { TodoPriority, TodoSourceType } from "../dto/workbench-inbox.dto";
import { WorkbenchInboxService } from "../workbench-inbox.service";

export interface ExecutionInterventionEvent {
  executionId: string;
  userId: string;
  title?: string;
  status: string; // human_control | waiting_input | pending_approval | failed | succeeded | ...
  source?: string; // chat | scheduler | workflow | manual | api
  sessionId?: string; // 聊天会话ID
  failureReason?: string;
  requiredInputPrompt?: string;
  approvalPrompt?: string;
  actionUrl?: string;
  isUnattended?: boolean;
}

export interface GateEvaluationResult {
  ingested: boolean;
  reason: string;
  inboxItemId?: string;
}

@Injectable()
export class ExecutionInterventionGateService {
  private readonly logger = new Logger(ExecutionInterventionGateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxService: WorkbenchInboxService
  ) {}

  /**
   * 四级门禁判定：评估执行事件是否应该进入 GTD 收件箱
   */
  async evaluateAndIngest(event: ExecutionInterventionEvent): Promise<GateEvaluationResult> {
    const { executionId, userId, status, source, sessionId } = event;

    // 门禁 1：来源过滤 (用户在聊天时出错直接在对话中可见，绝不进入收件箱打扰)
    if (source === "chat" || (sessionId && sessionId.trim().length > 0)) {
      this.logger.debug(
        `Ignored execution ${executionId} from chat session ${sessionId}: inline displayed to user`
      );
      return {
        ingested: false,
        reason: "chat_interactive_error_inline_displayed",
      };
    }

    // 门禁 2：状态与人工介入需求识别
    const isHumanActionRequired = ["human_control", "waiting_input", "pending_approval"].includes(
      status
    );
    const isUnattendedFailure =
      status === "failed" && (source === "scheduler" || event.isUnattended === true || !sessionId);

    if (!isHumanActionRequired && !isUnattendedFailure) {
      return {
        ingested: false,
        reason: "non_blocking_or_transient_error",
      };
    }

    // 门禁 3：幂等去重检查 (同一次 executionId 不得重复写入收件箱)
    const interventionSourceType =
      source === "scheduler" ? TodoSourceType.schedule : TodoSourceType.manual;

    const existing = await this.prisma.workbenchInboxItem.findFirst({
      where: {
        userId,
        sourceRefId: executionId,
      },
    });

    if (existing) {
      return {
        ingested: false,
        reason: "already_ingested_in_inbox",
        inboxItemId: existing.id,
      };
    }

    // 门禁 4：构建标准化 GTD 收件箱条目 (统一要素与高优先级)
    let prefix = "[需人工介入]";
    if (status === "pending_approval") {
      prefix = "[待审批]";
    } else if (status === "waiting_input") {
      prefix = "[需补充输入]";
    } else if (status === "human_control") {
      prefix = "[需人工接管]";
    } else if (status === "failed") {
      prefix = "[后台执行中断]";
    }

    const title = `${prefix} ${event.title || "自动化任务"}`;
    const details = [
      `执行单号: ${executionId}`,
      `当前状态: ${status}`,
      event.failureReason ? `原因说明: ${event.failureReason}` : "",
      event.requiredInputPrompt ? `所需输入: ${event.requiredInputPrompt}` : "",
      event.approvalPrompt ? `审批说明: ${event.approvalPrompt}` : "",
      "请点击查看执行详情并进行相应的人工介入操作。",
    ]
      .filter(Boolean)
      .join("\n");

    const inboxItem = await this.inboxService.ingest(userId, {
      title,
      rawContent: details,
      sourceType: interventionSourceType,
      sourceRefId: executionId,
      sourceTitle: event.title || "自动化工作流",
      sourceSender: source === "scheduler" ? "定时调度引擎" : "执行控制面",
      extra: {
        executionId,
        status,
        source: event.source,
        actionUrl: event.actionUrl || `/executions/${executionId}`,
        requiresHumanIntervention: true,
      },
    });

    this.logger.log(`Ingested intervention item ${inboxItem.id} for execution ${executionId}`);

    return {
      ingested: true,
      reason: "intervention_required_ingested",
      inboxItemId: inboxItem.id,
    };
  }
}
