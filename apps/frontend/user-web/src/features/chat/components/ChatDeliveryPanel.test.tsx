import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ChatDeliveryPanel } from './ChatDeliveryPanel';

describe('ChatDeliveryPanel', () => {
  it('hides stale draft content until final delivery', () => {
    const message: any = { role: 'assistant', isStreaming: true, content: '', metadata: {
      mode: 'chat', progressLogs: [{ stage: 'observation', text:
        '正在生成（待校验）\n### 热点\n\n| 排名 | 话题 |\n| --- | --- |\n| 1 | **热点一** |' }],
    } };
    const running = renderToStaticMarkup(<ChatDeliveryPanel message={message} />);
    expect(running).not.toContain('<table');
    expect(running).not.toContain('热点一');
    expect(running).toContain('等待校验');
    expect(running).not.toContain('### 热点');
    expect(running).not.toContain('overflow-y');
    expect(renderToStaticMarkup(<ChatDeliveryPanel message={{ ...message, isStreaming: false }} />)).toBe('');
  });
  it('shows progress separately and files only when delivery completes', () => {
    const message: any = { role: 'assistant', content: '固定正文', isStreaming: true,
      metadata: { mode: 'chat', progressLogs: [{ stage: 'observation', text: '正在验收' }],
        artifacts: [{ name: 'result.xlsx', downloadUrl: '/api/ai/chat/workspace-files/me/result.xlsx' }] } };
    const running = renderToStaticMarkup(<ChatDeliveryPanel message={message} />);
    expect(running).toContain('正在验收');
    expect(running).not.toContain('result.xlsx');
    const complete = renderToStaticMarkup(<ChatDeliveryPanel message={{ ...message, isStreaming: false }} />);
    expect(complete).toContain('生成文件');
    expect(complete).toContain('result.xlsx');
    expect(complete).not.toContain('固定正文');
    expect(complete).not.toContain('正在验收');
  });
});
