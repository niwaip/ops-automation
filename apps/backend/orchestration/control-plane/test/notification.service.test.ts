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
      }),
    );
  });
});
