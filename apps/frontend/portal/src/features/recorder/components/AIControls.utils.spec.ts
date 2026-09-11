import {
  getHistoryEntryExecutionStatusMeta,
} from './AIControls.utils';
import type { CommandHistoryEntry } from './AIControls.types';

describe('getHistoryEntryExecutionStatusMeta', () => {
  it('should return success when commands are executed and execution succeeded', () => {
    const entry: CommandHistoryEntry = {
      id: 'entry-1',
      type: 'ai',
      content: '已填写账号',
      timestamp: new Date(),
      commands: [
        { tool: 'fill', params: { target: 'username' } },
        { tool: 'click', params: { target: 'submit' } },
      ],
      result: {
        status: 'executed',
        execution: {
          success: true,
          results: [],
        },
      },
    };

    const meta = getHistoryEntryExecutionStatusMeta(entry);
    expect(meta.type).toBe('success');
    expect(meta.label).toBe('已执行: fill / click');
    expect(meta.defaultOpen).toBe(false);
  });

  it('should return failed when execution failed or outcome status is failed', () => {
    const entry: CommandHistoryEntry = {
      id: 'entry-2',
      type: 'ai',
      content: '执行失败',
      timestamp: new Date(),
      commands: [{ tool: 'click', params: { target: 'btn' } }],
      result: {
        status: 'error',
        execution: {
          success: false,
          message: '元素未找到',
          results: [],
        },
      },
    };

    const meta = getHistoryEntryExecutionStatusMeta(entry);
    expect(meta.type).toBe('failed');
    expect(meta.label).toBe('元素未找到');
    expect(meta.defaultOpen).toBe(true);
  });

  it('should return blocked when outcome status is blocked and no commands executed', () => {
    const entry: CommandHistoryEntry = {
      id: 'entry-3',
      type: 'ai',
      content: '建议在输入框输入上海的天气',
      timestamp: new Date(),
      commands: [],
      result: {
        status: 'answer',
        outcome: {
          status: 'blocked',
          kind: 'answer',
          summary: {
            userVisible: '建议在输入框输入上海的天气',
            compact: '建议输入',
          },
          verification: {
            verifier: 'observation-answer',
            routeReason: 'fallback',
            level: 'tool',
            confidence: 0.4,
            success: false,
            checks: [],
            failureReason: '浏览器命令未成功执行。',
          },
        },
      },
    };

    const meta = getHistoryEntryExecutionStatusMeta(entry);
    expect(meta.type).toBe('blocked');
    expect(meta.label).toBe('浏览器命令未成功执行。');
    expect(meta.defaultOpen).toBe(true);
  });

  it('should return info when result is an answer or question without commands', () => {
    const entry: CommandHistoryEntry = {
      id: 'entry-4',
      type: 'ai',
      content: '当前页面可见输入框有 5 个',
      timestamp: new Date(),
      commands: [],
      result: {
        status: 'answer',
      },
    };

    const meta = getHistoryEntryExecutionStatusMeta(entry);
    expect(meta.type).toBe('info');
    expect(meta.label).toBe('AI 建议 / 页面分析');
    expect(meta.defaultOpen).toBe(false);
  });
});
