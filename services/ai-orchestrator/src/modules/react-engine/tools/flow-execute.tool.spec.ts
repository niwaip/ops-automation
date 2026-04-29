import axios from 'axios';
import { FlowExecuteTool } from './flow-execute.tool';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FlowExecuteTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('surfaces nested downloadUrl from temporal workflow runtime results', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        name: '保密协议生成',
        executionFlow: [],
        apiEndpoints: {
          runtimeMetadata: {
            sourceType: 'temporal_workflow',
            workflowSteps: [],
          },
        },
      },
    } as any);

    mockedAxios.post.mockResolvedValue({
      data: {
        success: true,
        result: {
          status: 'rendered',
          data: {
            downloadUrl: 'http://127.0.0.1:3009/studio/download/doc-123',
          },
        },
        logs: ['rendered'],
      },
    } as any);

    const tool = new FlowExecuteTool();
    const result = await tool.execute(
      {
        skillId: 'skill-1',
        params: {
          'partyA.name': '豆包公司',
        },
      },
      {} as any,
    );

    expect(result.success).toBe(true);
    expect(result.data?.taskComplete).toBe(true);
    expect(result.data?.downloadUrl).toBe('http://127.0.0.1:3009/studio/download/doc-123');
    expect(result.output).toContain('下载链接: http://127.0.0.1:3009/studio/download/doc-123');
  });
});
