import { EmailInboxSyncService } from "../src/modules/workbench-inbox/workflow/email-inbox-sync.service";
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
      skillConfig: {
        findFirst: jest.fn().mockResolvedValue({ id: "workflow-skill-uuid-1" }),
      },
    };
    mockInboxService = {
      ingest: jest.fn(),
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
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("should dispatch EmailInboxSyncWorkflow via control-plane and return processed results", async () => {
    mockUserEmailService.getConnection.mockResolvedValue({
      configured: true,
      emailAddress: "dev@company.com",
      providerType: "smtp_imap",
    });

    (mockedAxios.post as any).mockResolvedValue({
      data: {
        id: "exec-001",
        status: "succeeded",
        result: {
          businessData: {
            inboxItems: [{ id: "inbox-1" }, { id: "inbox-2" }],
            messageIds: ["msg-1", "msg-2"],
            markedReadCount: 2,
            interventionRequired: false,
          },
        },
      },
    });

    const result = await service.syncUserUnreadEmails("user-1", { limit: 10 });

    expect(result.success).toBe(true);
    expect(result.processedCount).toBe(2);
    expect(result.message).toContain("已沉淀 2 封邮件");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/executions"),
      expect.objectContaining({
        skillId: "workflow-skill-uuid-1",
        input: expect.objectContaining({
          runMode: "AUTO",
          sourceType: "EMAIL",
          maxCount: 10,
          autoDeduplicate: true,
          userId: "user-1",
        }),
      }),
      expect.any(Object)
    );
  });

  it("should handle workflow execution failure gracefully", async () => {
    mockUserEmailService.getConnection.mockResolvedValue({
      configured: true,
      emailAddress: "dev@company.com",
    });

    (mockedAxios.post as any).mockResolvedValue({
      data: {
        id: "exec-002",
        status: "failed",
        failureReason: "Temporal worker timed out",
      },
    });

    const result = await service.syncUserUnreadEmails("user-1");

    expect(result.success).toBe(false);
    expect(result.message).toContain("工作流执行失败: Temporal worker timed out");
    expect(result.errors).toContain("Temporal worker timed out");
  });
});

