import { WorkbenchInboxIngestionService } from "../src/modules/workbench-inbox/workbench-inbox-ingestion.service";
import { WorkbenchInboxService } from "../src/modules/workbench-inbox/workbench-inbox.service";
import {
  InboxItemStatus,
  TodoPriority,
  TodoSourceType,
  TodoStatus,
} from "../src/modules/workbench-inbox/dto/workbench-inbox.dto";

describe("WorkbenchInboxIngestionService", () => {
  let ingestionService: WorkbenchInboxIngestionService;

  beforeEach(() => {
    ingestionService = new WorkbenchInboxIngestionService();
  });

  describe("normalizeIngestPayload", () => {
    it("should normalize chat messages into UnifiedInboxContent correctly", () => {
      const result = ingestionService.normalizeIngestPayload({
        title: "请处理故障",
        rawContent: "线上订单导出超时，请尽快排查",
        sourceType: TodoSourceType.chat,
        sourceSender: "Zhang San",
        sourceRefId: "msg-1001",
        sourceTitle: "技术支持群",
      });

      expect(result.title).toBe("请处理故障");
      expect(result.unifiedPayload.rawContent).toContain("线上订单导出超时");
      expect(result.unifiedPayload.source.type).toBe(TodoSourceType.chat);
      expect(result.unifiedPayload.source.refId).toBe("msg-1001");
      expect(result.unifiedPayload.source.sender).toBe("Zhang San");
      expect(result.unifiedPayload.source.senderType).toBe("assistant");
    });

    it("should extract title when title is not explicitly provided", () => {
      const result = ingestionService.normalizeIngestPayload({
        rawContent: "请于本周五前完成财务数据汇总并生成 PDF 报表。",
        sourceType: TodoSourceType.email,
        sourceSender: "boss@company.com",
      });

      expect(result.title).toBeDefined();
      expect(result.unifiedPayload.source.type).toBe(TodoSourceType.email);
      expect(result.unifiedPayload.source.sender).toBe("boss@company.com");
    });
  });

  describe("evaluateHeuristicClarification", () => {
    it("should assign high confidence and actionable status to explicit tasks", () => {
      const rawText = "请在明天下午5点前完成订单同步脚本的编写与上线验证，联系李工协同。";
      const analysis = ingestionService.evaluateHeuristicClarification(
        "完成订单同步脚本编写",
        rawText,
        [],
      );

      expect(analysis.isActionable).toBe(true);
      expect(analysis.confidence).toBeGreaterThanOrEqual(0.75);
      expect(analysis.needsRefinement).toBe(false);
      expect(analysis.actionItem?.title).toBe("完成订单同步脚本编写");
    });

    it("should assign low confidence and recommend refinement for ambiguous messages", () => {
      const rawText = "大家对这个方案怎么看？我也不知道行不行，有没有什么想法吗？";
      const analysis = ingestionService.evaluateHeuristicClarification("讨论方案", rawText, []);

      expect(analysis.confidence).toBeLessThan(0.75);
      expect(analysis.needsRefinement).toBe(true);
      expect(analysis.refinementNotes).toContain("建议点击「AI 智能整理」");
    });

    it("should recognize high priority keywords", () => {
      const rawText = "紧急故障：线上支付回调丢失，请立刻马上排查！";
      const analysis = ingestionService.evaluateHeuristicClarification("支付报警", rawText, []);

      expect(analysis.actionItem?.priority).toBe(TodoPriority.high);
    });

    it("should recognize low priority keywords", () => {
      const rawText = "后续有空的时候可以参考一下这个开源项目的架构设计。";
      const analysis = ingestionService.evaluateHeuristicClarification("参考设计", rawText, []);

      expect(analysis.actionItem?.priority).toBe(TodoPriority.low);
    });

    it("should match automated workflow by name", () => {
      const rawText = "请帮我生成一份销售报表并导出为PDF。";
      const workflows = [
        { id: "wf-pdf", name: "销售报表自动化工作流" },
        { id: "wf-backup", name: "数据备份脚本" },
      ];
      const analysis = ingestionService.evaluateHeuristicClarification("生成报表", rawText, workflows);

      expect(analysis.actionItem?.suggestedWorkflowId).toBe("wf-pdf");
      expect(analysis.actionItem?.suggestedWorkflowName).toBe("销售报表自动化工作流");
    });
  });
});

describe("WorkbenchInboxService", () => {
  let inboxService: WorkbenchInboxService;
  let mockPrisma: any;
  let ingestionService: WorkbenchInboxIngestionService;
  let mockTodoService: any;

  beforeEach(() => {
    mockPrisma = {
      workbenchInboxItem: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      workbenchTodo: {
        create: jest.fn(),
      },
    };
    mockTodoService = {
      discoverTaskRunnableWorkflows: jest.fn().mockResolvedValue([]),
    };
    ingestionService = new WorkbenchInboxIngestionService();
    inboxService = new WorkbenchInboxService(
      mockPrisma as any,
      ingestionService,
      {} as any,
      mockTodoService as any,
    );
  });

  it("should ingest item, normalize content, and persist with unprocessed status", async () => {
    mockPrisma.workbenchInboxItem.create.mockImplementation((args: any) => ({
      id: "inbox-1",
      userId: "user-1",
      ...args.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await inboxService.ingest("user-1", {
      title: "紧急处理报警",
      rawContent: "线上数据库连接池耗尽，需要马上扩容",
      sourceType: TodoSourceType.chat,
    });

    expect(result.id).toBe("inbox-1");
    expect(result.status).toBe(InboxItemStatus.unprocessed);
    expect(mockPrisma.workbenchInboxItem.create).toHaveBeenCalled();
    const createdData = mockPrisma.workbenchInboxItem.create.mock.calls[0][0].data;
    expect(createdData.sourceType).toBe(TodoSourceType.chat);
    expect(createdData.confidence).toBeGreaterThan(0.5);
  });

  it("should convert inbox item into formal workbench todo", async () => {
    const mockInboxItem = {
      id: "inbox-1",
      userId: "user-1",
      title: "修复报表BUG",
      rawText: "请在下周一前修复导出BUG",
      sourceType: TodoSourceType.chat,
      sourceRefId: "ref-1",
      sourceTitle: "讨论会",
      sourceSender: "Li",
      status: InboxItemStatus.unprocessed,
      aiClarification: {
        actionItem: {
          title: "修复导出BUG",
          description: "请在下周一前修复导出BUG",
          priority: TodoPriority.high,
          dueDate: "2026-09-08T00:00:00Z",
        },
      },
      unifiedPayload: {},
    };

    mockPrisma.workbenchInboxItem.findUnique.mockResolvedValue(mockInboxItem);
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue(mockInboxItem);
    mockPrisma.workbenchTodo.create.mockResolvedValue({
      id: "todo-99",
      title: "修复导出BUG",
      priority: TodoPriority.high,
      status: TodoStatus.pending,
    });
    mockPrisma.workbenchInboxItem.update.mockResolvedValue({
      ...mockInboxItem,
      status: InboxItemStatus.converted,
      convertedTodoId: "todo-99",
    });

    const result = await inboxService.convertToTodo("user-1", "inbox-1", {
      title: "修复导出BUG",
    });

    expect(mockPrisma.workbenchTodo.create).toHaveBeenCalled();
    expect(mockPrisma.workbenchInboxItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inbox-1" },
        data: expect.objectContaining({
          status: InboxItemStatus.converted,
          convertedTodoId: "todo-99",
        }),
      }),
    );
    expect(result.todo.id).toBe("todo-99");
    expect(result.inboxItem.status).toBe(InboxItemStatus.converted);
  });
});
