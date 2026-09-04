import { EmailInboxSyncService } from "../src/modules/workbench-inbox/workflow/email-inbox-sync.service";
import { TodoSourceType } from "../src/modules/workbench-inbox/dto/workbench-inbox.dto";
import axios from "axios";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("EmailInboxSyncService", () => {
  let service: EmailInboxSyncService;
  let mockPrisma: any;
  let mockInboxService: any;
  let mockUserEmailService: any;

  beforeEach(() => {
    mockPrisma = {
      workbenchInboxItem: {
        findFirst: jest.fn(),
      },
    };
    mockInboxService = {
      ingest: jest.fn().mockResolvedValue({ id: "inbox-item-1" }),
    };
    mockUserEmailService = {
      getConnection: jest.fn(),
    };

    service = new EmailInboxSyncService(
      mockPrisma as any,
      mockInboxService as any,
      mockUserEmailService as any
    );
  });

  it("should return unconfigured message if user email is not configured", async () => {
    mockUserEmailService.getConnection.mockResolvedValue({ configured: false });

    const result = await service.syncUserUnreadEmails("user-1");

    expect(result.success).toBe(false);
    expect(result.message).toContain("未配置邮箱连接");
    expect(mockInboxService.ingest).not.toHaveBeenCalled();
  });

  it("should sync unread emails, ingest to inbox, and call email.update to mark as read", async () => {
    mockUserEmailService.getConnection.mockResolvedValue({
      configured: true,
      emailAddress: "dev@company.com",
      providerType: "smtp_imap",
    });

    (mockedAxios.post as any).mockImplementation((url: string, body: any) => {
      if (body?.skillId === "platform.email.messages") {
        return Promise.resolve({
          data: {
            output: {
              items: [
                {
                  id: "msg-001",
                  subject: "紧急系统告警",
                  from: "ops@company.com",
                  body: "主库磁盘空间占用超过 90%，请尽快扩容清理",
                  receivedAt: "2026-09-04T16:00:00Z",
                },
                {
                  id: "msg-002",
                  subject: "周报提交通知",
                  from: "hr@company.com",
                  body: "请各位同学于今日下班前提交本周工作总结",
                  receivedAt: "2026-09-04T16:10:00Z",
                },
              ],
            },
          },
        });
      }
      if (body?.skillId === "platform.email.update") {
        return Promise.resolve({ data: { success: true } });
      }
      return Promise.resolve({ data: {} });
    });

    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue(null);

    const result = await service.syncUserUnreadEmails("user-1");

    expect(result.success).toBe(true);
    expect(result.processedCount).toBe(2);
    expect(mockInboxService.ingest).toHaveBeenCalledTimes(2);

    expect(mockInboxService.ingest).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "紧急系统告警",
        sourceType: TodoSourceType.email,
        sourceRefId: "msg-001",
      })
    );

    // 验证调用了 platform.email.update 标记已读
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/executions"),
      expect.objectContaining({
        skillId: "platform.email.update",
        input: expect.objectContaining({
          messageRefs: ["msg-001", "msg-002"],
          isRead: true,
        }),
      }),
      expect.any(Object)
    );
  });

  it("should skip already ingested emails and not create duplicate inbox items", async () => {
    mockUserEmailService.getConnection.mockResolvedValue({
      configured: true,
      emailAddress: "dev@company.com",
    });

    (mockedAxios.post as any).mockResolvedValue({
      data: {
        output: {
          items: [
            { id: "msg-001", subject: "已收过的邮件", from: "a@b.com", body: "test" },
          ],
        },
      },
    });

    // 模拟该邮件已在收件箱中
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({ id: "existing-inbox-1" });

    const result = await service.syncUserUnreadEmails("user-1");

    expect(result.processedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(mockInboxService.ingest).not.toHaveBeenCalled();
  });
});
