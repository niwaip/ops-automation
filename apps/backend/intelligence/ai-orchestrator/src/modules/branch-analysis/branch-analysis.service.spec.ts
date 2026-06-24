import axios from 'axios';
import { BranchAnalysisService } from './branch-analysis.service';

jest.mock('axios');
jest.mock('../../config/service-endpoints', () => ({
  getBrowserWorkerUrl: () => 'http://browser-worker',
}));

describe('BranchAnalysisService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  const createService = (overrides?: {
    getPreferredDefaultModel?: jest.Mock;
    callModel?: jest.Mock;
  }) =>
    new BranchAnalysisService({
      getPreferredDefaultModel: overrides?.getPreferredDefaultModel || jest.fn(),
      callModel: overrides?.callModel || jest.fn(),
    } as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizeSpec should preserve camelCase outputVar and drop mismatched condition variables', () => {
    const service = createService();

    const normalized = (service as any).normalizeSpec(
      {
        readSelectors: ['.status-badge'],
        readMethod: 'innerText',
        outputVar: 'pageText',
        conditionFn: "(ctx) => !String(ctx.pagetext || '').includes('承認済み')",
        takeoverReason: '案件已是承認済み状态，无需再次承認，请人工确认',
        onMismatch: 'takeover',
        onMatch: 'continue',
        description: '检查案件是否还未承認，若未承認则继续点击承認按钮',
      },
      '检查案件是否还未承認，若未承認则继续点击承認按钮',
      '保留中 承認する (Approve)',
      'takeover'
    );

    expect(normalized.outputVar).toBe('pageText');
    expect(normalized.conditionFn).toContain('ctx.pageText');
    expect(normalized.conditionFn).not.toContain('ctx.pagetext');
  });

  it('analyzeBranchCondition should demote empty selectors and fall back to readable body text', async () => {
    const service = createService({
      getPreferredDefaultModel: jest.fn().mockReturnValue({ id: 'model-1' }),
      callModel: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          readSelectors: ['.status-badge'],
          readMethod: 'innerText',
          outputVar: 'pageText',
          conditionFn: "(ctx) => !String(ctx.pageText || '').includes('承認済み')",
          takeoverReason: '案件已是承認済み状态，无需再次承認，请人工确认',
          onMismatch: 'takeover',
          onMatch: 'continue',
          description: '检查案件是否还未承認，若未承認则继续点击承認按钮',
        }),
      }),
    });

    mockedAxios.post.mockImplementation(async (url, body) => {
      if (url === 'http://browser-worker/browser/inspect-state') {
        return {
          data: {
            runtimeSessionId: 'runtime-1',
            pageUrl: 'http://localhost/#approvals',
            pageTitle: 'Approvals',
          },
        } as any;
      }

      if (
        url === 'http://browser-worker/browser/execute' &&
        Array.isArray((body as any)?.commands)
      ) {
        const commands = (body as any).commands;
        if (commands.length === 1 && !commands[0]?.params?.selector) {
          return {
            data: {
              results: [
                {
                  data: {
                    text: '保留中 承認する (Approve)',
                  },
                },
              ],
            },
          } as any;
        }

        return {
          data: {
            results: commands.map((command: any) => ({
              data: {
                text: command.params.selector === 'body' ? '保留中 承認する (Approve)' : '',
              },
            })),
          },
        } as any;
      }

      throw new Error(`Unexpected axios call: ${String(url)}`);
    });

    const result = await service.analyzeBranchCondition({
      runtimeSessionId: 'runtime-1',
      userIntent: '检查案件是否还未承認，若未承認则继续点击承認按钮',
      onMismatch: 'takeover',
      pageSignals: {
        buttons: ['承認する (Approve)'],
        headings: ['案件承認管理 / 案件詳細'],
        links: [],
        currentPageUrl: 'http://localhost/#approvals/detail',
        pageTitle: 'Approvals',
        pageText: '保留中 承認する (Approve)',
      },
    });

    expect(result.branchStepSpec.outputVar).toBe('pageText');
    expect(result.branchStepSpec.conditionFn).toContain('ctx.pageText');
    expect(result.branchStepSpec.readSelectors[0]).toBe('body');
  });
});
