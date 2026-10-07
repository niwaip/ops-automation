import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { HtmlPreviewBlock } from '@chat-web/components/HtmlPreviewBlock';
import { appendAuthToken, safeUrlTransform } from '@chat-web/components/MessageContentRenderer';
import { useChatStreaming } from '../hooks/useChatStreaming';

const { mockApiClient, mockExecutionApi, mockChatApi } = vi.hoisted(() => ({
  mockApiClient: {
    ensureFreshAccessToken: vi.fn().mockResolvedValue('MOCK_TOKEN'),
    post: vi.fn().mockResolvedValue({}),
  },
  mockExecutionApi: {
    cancel: vi.fn().mockResolvedValue({}),
  },
  mockChatApi: {
    stream: vi.fn(),
  },
}));

vi.mock('react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('../../../api', () => ({
  apiClient: mockApiClient,
  executionApi: mockExecutionApi,
  chatApi: mockChatApi,
}));

vi.mock('../../../adapters/auth/authStore', () => ({
  authStore: {
    getState: () => ({ accessToken: 'MOCK_TOKEN' }),
  },
}));

vi.mock('../../../adapters/streaming/browserStreamingTransport', () => ({
  browserStreamingTransport: {},
}));

vi.mock('../lib/workflowNaturalLanguageRouter', () => ({
  handleWorkflowNaturalLanguage: vi.fn().mockResolvedValue(null),
}));

describe('Frontend Audit Security & Concurrency Fixes (F1 - F5)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:3000',
      },
    });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (key === 'ops-user-auth') {
          return JSON.stringify({ accessToken: 'TEST_SECRET_TOKEN' });
        }
        return null;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('F1: HTML Artifact Sandbox Isolation', () => {
    it('enforces opaque-origin sandbox without allow-same-origin in inline iframe', () => {
      const html = renderToStaticMarkup(
        <HtmlPreviewBlock
          code="<!DOCTYPE html><html><body><h1>Safe Sandbox</h1></body></html>"
          defaultExpanded={true}
        />
      );
      expect(html).toContain('<iframe');
      expect(html).toContain('sandbox="allow-scripts allow-forms allow-popups allow-modals"');
      expect(html).not.toContain('allow-same-origin');
    });
  });

  describe('F2: Image URL Authentication Token Isolation', () => {
    it('appends token for same-origin workspace files URL', () => {
      const sameOriginUrl = '/api/ai/chat/workspace-files/report.png';
      const transformed = safeUrlTransform(sameOriginUrl);
      const withToken = appendAuthToken(transformed);
      expect(withToken).toContain('token=TEST_SECRET_TOKEN');
      expect(withToken).toBe('/api/ai/chat/workspace-files/report.png?token=TEST_SECRET_TOKEN');
    });

    it('rejects external domain matching workspace-files path without appending token', () => {
      const externalUrl = 'https://collector.invalid/api/ai/chat/workspace-files/demo.png';
      const transformed = safeUrlTransform(externalUrl);
      const withToken = appendAuthToken(transformed);
      expect(withToken).not.toContain('token=');
      expect(withToken).toBe(externalUrl);
    });

    it('rejects protocol-relative URL without appending token', () => {
      const protoRelativeUrl = '//collector.invalid/api/ai/chat/workspace-files/demo.png';
      const transformed = safeUrlTransform(protoRelativeUrl);
      const withToken = appendAuthToken(transformed);
      expect(withToken).not.toContain('token=');
      expect(withToken).toBe(protoRelativeUrl);
    });

    it('rejects URL with workspace-files in query string without appending token', () => {
      const spoofedQueryUrl = 'https://evil.com/img.png?redirect=/api/ai/chat/workspace-files/hack';
      const transformed = safeUrlTransform(spoofedQueryUrl);
      const withToken = appendAuthToken(transformed);
      expect(withToken).not.toContain('token=');
      expect(withToken).toBe(spoofedQueryUrl);
    });
  });

  describe('F3 & F4: useChatStreaming Session & Concurrency Isolation', () => {
    it('provides isSessionStreaming and avoids cross-session cancellation', () => {
      let streamingHook: ReturnType<typeof useChatStreaming> | null = null;
      const sessionMessagesRef = {
        current: {
          sessionA: [{ id: 'msgA', content: '', role: 'assistant' as const }],
          sessionB: [{ id: 'msgB', content: '', role: 'assistant' as const }],
        },
      };

      // Lightweight Test Component to mount useChatStreaming
      function TestHost() {
        streamingHook = useChatStreaming({
          toast: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() } as any,
          notifiedTaskStateKeysRef: { current: new Set() },
          sessionMessagesRef: sessionMessagesRef as any,
          appendProgressLog: vi.fn(),
          snapshotMessageThoughts: vi.fn(),
          updateMessage: vi.fn(),
          updateSessionMeta: vi.fn(),
          getCurrentSelectedSessionId: () => 'sessionA',
        });
        return null;
      }

      renderToStaticMarkup(<TestHost />);
      expect(streamingHook).not.toBeNull();
      if (!streamingHook) return;

      expect(typeof (streamingHook as any).isSessionStreaming).toBe('function');
      expect((streamingHook as any).isSessionStreaming('sessionA')).toBe(false);

      // When stopping a session without running streams, it must NOT call executionApi.cancel or blindly call /ai/chat/stop
      (streamingHook as any).handleStopStreaming('sessionB');
      expect(mockExecutionApi.cancel).not.toHaveBeenCalled();
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });
  });
});
