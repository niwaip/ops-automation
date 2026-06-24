import { BrowserCommandAtomicService } from './browser-command-atomic.service';

describe('BrowserCommandAtomicService', () => {
  const service = new BrowserCommandAtomicService();

  it('parses wait duration in seconds into milliseconds', () => {
    const result = service.parseAtomicCommand('等待 2 秒');

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'wait',
          params: { duration: 2000 },
          description: '等待 2000ms',
        },
      ],
      explanation: '将等待 2000 毫秒',
    });
  });

  it('maps common key aliases when parsing press-key commands', () => {
    const result = service.parseAtomicCommand('按下 回车 键');

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'press_key',
          params: { key: 'Enter' },
          description: '按下 Enter 键',
        },
      ],
      explanation: '将按下 Enter 键',
    });
  });

  it('parses latest-tab switching as an atomic command', () => {
    const result = service.parseAtomicCommand('切换到最新标签页');

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'switch_latest_tab',
          params: {},
          description: '切换到最新标签页',
        },
      ],
      explanation: '将切换到当前浏览器会话中的最新标签页',
    });
  });
});
