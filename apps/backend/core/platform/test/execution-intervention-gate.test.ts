import { ExecutionInterventionGateService } from "../src/modules/workbench-inbox/interceptor/execution-intervention-gate.service";

describe("ExecutionInterventionGateService", () => {
  let gateService: ExecutionInterventionGateService;
  let mockPrisma: any;
  let mockInboxService: any;

  beforeEach(() => {
    mockPrisma = {
      workbenchInboxItem: {
        findFirst: jest.fn(),
      },
    };
    mockInboxService = {
      ingest: jest.fn().mockResolvedValue({ id: "inbox-item-gate-1" }),
    };

    gateService = new ExecutionInterventionGateService(
      mockPrisma as any,
      mockInboxService as any
    );
  });

  it("should NOT ingest chat execution errors into inbox (silence rule for inline chat errors)", async () => {
    const result = await gateService.evaluateAndIngest({
      executionId: "exec-chat-1",
      userId: "user-1",
      title: "聊天中生成的脚本执行",
      status: "failed",
      source: "chat",
      sessionId: "session-123",
      failureReason: "语法错误",
    });

    expect(result.ingested).toBe(false);
    expect(result.reason).toBe("chat_interactive_error_inline_displayed");
    expect(mockInboxService.ingest).not.toHaveBeenCalled();
  });

  it("should NOT ingest when active chat sessionId is present", async () => {
    const result = await gateService.evaluateAndIngest({
      executionId: "exec-chat-2",
      userId: "user-1",
      status: "human_control",
      sessionId: "chat-active-456",
    });

    expect(result.ingested).toBe(false);
    expect(result.reason).toBe("chat_interactive_error_inline_displayed");
  });

  it("should ingest unattended scheduler failure into GTD inbox", async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue(null);

    const result = await gateService.evaluateAndIngest({
      executionId: "exec-sched-1",
      userId: "user-1",
      title: "定时数据库全量备份工作流",
      status: "failed",
      source: "scheduler",
      failureReason: "连接存储桶 S3 鉴权失败 (403 Forbidden)",
    });

    expect(result.ingested).toBe(true);
    expect(result.inboxItemId).toBe("inbox-item-gate-1");
    expect(mockInboxService.ingest).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: expect.stringContaining("[后台执行中断]"),
        sourceRefId: "exec-sched-1",
        rawContent: expect.stringContaining("403 Forbidden"),
      })
    );
  });

  it("should ingest human_control / pending_approval states into GTD inbox", async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue(null);

    const result = await gateService.evaluateAndIngest({
      executionId: "exec-approval-1",
      userId: "user-1",
      title: "批量归档老旧客户资料",
      status: "pending_approval",
      source: "workflow",
      approvalPrompt: "检测到将永久归档 1000 条记录，需管理员人工确认审批",
    });

    expect(result.ingested).toBe(true);
    expect(mockInboxService.ingest).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: expect.stringContaining("[待审批]"),
        rawContent: expect.stringContaining("需管理员人工确认审批"),
      })
    );
  });

  it("should deduplicate and avoid re-ingesting already handled execution items", async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({ id: "existing-inbox-exec" });

    const result = await gateService.evaluateAndIngest({
      executionId: "exec-dup-1",
      userId: "user-1",
      status: "waiting_input",
      source: "scheduler",
    });

    expect(result.ingested).toBe(false);
    expect(result.reason).toBe("already_ingested_in_inbox");
    expect(mockInboxService.ingest).not.toHaveBeenCalled();
  });
});
