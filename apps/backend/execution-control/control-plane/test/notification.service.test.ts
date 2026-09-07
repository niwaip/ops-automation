import axios from 'axios';
import { NotificationService } from '../src/modules/notifications/notification.service';

jest.mock('axios');

describe('NotificationService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.resetAllMocks();
    mockedAxios.get.mockResolvedValue({ data: { reports: [] } } as any);
  });

  it('includes normalized execution result fields in execution notifications', async () => {
    const executionService = {
      list: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'execution-1',
            skillId: 'skill-1',
            status: 'succeeded',
            createdAt: '2026-06-15T10:00:00.000Z',
            updatedAt: '2026-06-15T10:05:00.000Z',
            endedAt: '2026-06-15T10:05:00.000Z',
            normalizedResult: {
              title: '日报生成',
              summary: '已生成 3 份日报',
              downloadUrl: 'https://example.com/report.pdf',
              temporalLink: 'https://temporal.example/executions/1',
              hasBusinessResult: true,
              artifacts: [
                {
                  name: 'report.pdf',
                  downloadUrl: 'https://example.com/report.pdf',
                },
              ],
            },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      }),
    } as any;

    const service = new NotificationService(executionService);
    const result = await service.list({ limit: 20 });

    expect(executionService.list).toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        category: 'completed',
        metadata: expect.objectContaining({
          resultTitle: '日报生成',
          resultSummary: '已生成 3 份日报',
          downloadUrl: 'https://example.com/report.pdf',
          temporalLink: 'https://temporal.example/executions/1',
          hasBusinessResult: true,
          normalizedResult: expect.objectContaining({
            title: '日报生成',
            summary: '已生成 3 份日报',
            artifacts: [
              expect.objectContaining({
                downloadUrl: 'https://example.com/report.pdf',
              }),
            ],
          }),
        }),
      })
    );
  });

  it('includes coordination notifications from workbench inbox items for user', async () => {
    const executionService = {
      list: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 100 }),
    } as any;

    const mockPrisma = {
      workbenchInboxItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inbox-item-1',
            userId: 'user-test',
            title: '[待我执行] 完成自动化测试报告审查',
            rawContent: '请尽快审核并提交结论',
            sourceType: 'chat',
            sourceRefId: 'coord_123',
            sourceSender: 'admin',
            status: 'unprocessed',
            createdAt: new Date('2026-09-05T14:12:00.000Z'),
            updatedAt: new Date('2026-09-05T14:12:00.000Z'),
            unifiedPayload: {
              kind: 'coordination',
              taskId: 'coord_123',
              taskType: 'assignment',
              status: 'pending',
              initiator: { id: 'admin-id', username: 'admin' },
              assignee: { id: 'user-test', username: 'test' },
            },
          },
        ]),
      },
    } as any;

    const service = new NotificationService(executionService, mockPrisma);
    const result = await service.list(
      { limit: 20 },
      { id: 'user-test', username: 'test', role: 'employee' }
    );

    expect(mockPrisma.workbenchInboxItem.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-test',
        status: { in: ['unprocessed', 'clarified'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'coordination:inbox-item-1',
        source: 'coordination',
        sourceName: 'admin',
        category: 'status_update',
        severity: 'info',
        unread: true,
        requiresAction: true,
        actionUrl: '/dashboard?tab=inbox',
        metadata: expect.objectContaining({
          title: '收到来自 @admin 的协同任务',
          resultTitle: '[待我执行] 完成自动化测试报告审查',
          resultSummary: '请尽快审核并提交结论',
          taskType: 'assignment',
        }),
      })
    );
  });
});
