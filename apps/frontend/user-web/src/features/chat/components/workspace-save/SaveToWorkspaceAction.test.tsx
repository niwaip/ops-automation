import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaveToWorkspaceAction } from './SaveToWorkspaceAction';
import type { ChatMessage } from '@ops/user-core';

vi.mock('../../../../api/workspace', () => ({
  workspaceApi: {
    saveTextNote: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('react-query', () => ({
  useMutation: (fn: any) => ({
    mutate: fn,
    isLoading: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    App: {
      useApp: () => ({
        message: {
          success: vi.fn(),
          error: vi.fn(),
        },
      }),
    },
  };
});

describe('SaveToWorkspaceAction Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders save button for assistant message in personal mode', () => {
    const message: ChatMessage = {
      id: 'msg-p1',
      role: 'assistant',
      content: '这是个人对话中关于敏捷开发站会的回答。',
      timestamp: new Date().toISOString(),
      sessionId: 'sess-p1',
      metadata: {
        mode: 'chat',
        aiModel: 'qwen-3.8-27b',
      } as any,
    };

    const html = renderToStaticMarkup(
      <SaveToWorkspaceAction message={message} userQuery="日常站会规范" />
    );

    expect(html).toContain('chat-action-btn');
    expect(html).toContain('aria-label="保存到资料空间"');
  });

  it('renders save button for work mode task result message', () => {
    const message: ChatMessage = {
      id: 'msg-w1',
      role: 'assistant',
      content: '任务执行成功，生成了审计成果。',
      timestamp: new Date().toISOString(),
      sessionId: 'sess-w1',
      metadata: {
        mode: 'task',
        executionId: 'exec-12345',
        skillUsed: 'platform.security.audit',
      },
    };

    const html = renderToStaticMarkup(
      <SaveToWorkspaceAction message={message} userQuery="执行安全审计" />
    );

    expect(html).toContain('chat-action-btn');
    expect(html).toContain('aria-label="保存到资料空间"');
  });
});
