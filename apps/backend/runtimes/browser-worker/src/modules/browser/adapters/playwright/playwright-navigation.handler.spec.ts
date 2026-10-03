import { PlaywrightNavigationHandler } from './playwright-navigation.handler';
import { PlaywrightCliRunner } from './playwright-cli.runner';
import { PlaywrightSessionManager } from './playwright-session.manager';

describe('PlaywrightNavigationHandler', () => {
  let cliRunner: jest.Mocked<PlaywrightCliRunner>;
  let sessionManager: jest.Mocked<PlaywrightSessionManager>;
  let handler: PlaywrightNavigationHandler;
  const sessionId = 'test-nav-session';

  beforeEach(() => {
    cliRunner = {
      execCli: jest.fn(),
      assertNoCliError: jest.fn(),
      parseJsonStdout: jest.fn(),
    } as unknown as jest.Mocked<PlaywrightCliRunner>;

    sessionManager = {
      getOrCreateSession: jest.fn().mockReturnValue({
        initialized: true,
        lastUrl: undefined,
      }),
      openSession: jest.fn(),
      ensureSessionReady: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PlaywrightSessionManager>;

    handler = new PlaywrightNavigationHandler(cliRunner, sessionManager);
  });

  describe('normalizeUrl', () => {
    it('prepends https:// when protocol is missing', () => {
      expect(handler.normalizeUrl('www.baidu.com')).toBe('https://www.baidu.com');
      expect(handler.normalizeUrl('baidu.com/s?wd=test')).toBe('https://baidu.com/s?wd=test');
    });

    it('preserves existing http, https, and about schemes', () => {
      expect(handler.normalizeUrl('http://insecure.test')).toBe('http://insecure.test');
      expect(handler.normalizeUrl('https://secure.test')).toBe('https://secure.test');
      expect(handler.normalizeUrl('about:blank')).toBe('about:blank');
    });

    it('returns empty string when url is empty or whitespace', () => {
      expect(handler.normalizeUrl('')).toBe('');
      expect(handler.normalizeUrl('   ')).toBe('');
    });
  });

  describe('handleNavigate', () => {
    it('throws when navigation script reports a failure', async () => {
      cliRunner.execCli.mockResolvedValue({
        stdout: JSON.stringify({
          status: 'failed',
          error: 'net::ERR_NAME_NOT_RESOLVED',
          url: 'about:blank',
        }),
        stderr: '',
      });
      cliRunner.parseJsonStdout.mockReturnValue({
        status: 'failed',
        error: 'net::ERR_NAME_NOT_RESOLVED',
        url: 'about:blank',
      });

      await expect(handler.handleNavigate(sessionId, 'www.nonexistent-domain-xyz.com')).rejects.toThrow(
        'Navigation failed: net::ERR_NAME_NOT_RESOLVED'
      );
    });

    it('throws when navigation remained on about:blank for a non-blank url', async () => {
      cliRunner.execCli.mockResolvedValue({
        stdout: JSON.stringify({
          status: 'navigated',
          url: 'about:blank',
          articles: 0,
        }),
        stderr: '',
      });
      cliRunner.parseJsonStdout.mockReturnValue({
        status: 'navigated',
        url: 'about:blank',
        articles: 0,
      });

      await expect(handler.handleNavigate(sessionId, 'www.baidu.com')).rejects.toThrow(
        'Navigation failed: page remained on blank page (about:blank)'
      );
    });

    it('successfully updates session.lastUrl when navigation succeeds', async () => {
      const mockSession = { initialized: true, lastUrl: undefined as string | undefined };
      sessionManager.getOrCreateSession.mockReturnValue(mockSession as any);

      cliRunner.execCli.mockResolvedValue({
        stdout: JSON.stringify({
          status: 'navigated',
          url: 'https://www.baidu.com/',
          articles: 0,
        }),
        stderr: '',
      });
      cliRunner.parseJsonStdout.mockReturnValue({
        status: 'navigated',
        url: 'https://www.baidu.com/',
        articles: 0,
      });

      const result = await handler.handleNavigate(sessionId, 'www.baidu.com');

      expect(result.status).toBe('success');
      expect(result.data?.pageUrl).toBe('https://www.baidu.com/');
      expect(mockSession.lastUrl).toBe('https://www.baidu.com/');
    });
  });

  describe('settlePageAfterAction', () => {
    it('detects new tab and updates preferLatestTab, activeTabIndex, and lastUrl', async () => {
      const mockSession: {
        initialized: boolean;
        lastUrl?: string;
        preferLatestTab?: boolean;
        activeTabIndex?: number;
      } = {
        initialized: true,
        lastUrl: 'https://www.baidu.com/',
        preferLatestTab: false,
      };
      sessionManager.getOrCreateSession.mockReturnValue(mockSession as any);

      cliRunner.execCli.mockResolvedValue({
        stdout: JSON.stringify({
          pageCount: 2,
          activeUrl: 'https://mcp.pkulaw.com/',
        }),
        stderr: '',
      });
      cliRunner.parseJsonStdout.mockReturnValue({
        pageCount: 2,
        isNewTab: true,
        activeUrl: 'https://mcp.pkulaw.com/',
      });

      await handler.settlePageAfterAction(sessionId);

      expect(mockSession.preferLatestTab).toBe(true);
      expect(mockSession.lastUrl).toBe('https://mcp.pkulaw.com/');
      expect((mockSession as any).lastKnownPageCount).toBe(2);
      expect((mockSession as any).activeTabIndex).toBe(1);
      expect(cliRunner.execCli).toHaveBeenCalledWith(sessionId, ['tab-select', '1']);
    });

    it('does not switch tabs or set preferLatestTab when pageCount has not increased', async () => {
      const mockSession: {
        initialized: boolean;
        lastUrl?: string;
        preferLatestTab?: boolean;
        lastKnownPageCount?: number;
        activeTabIndex?: number;
      } = {
        initialized: true,
        lastUrl: 'https://www.baidu.com/',
        preferLatestTab: false,
        lastKnownPageCount: 2,
      };
      sessionManager.getOrCreateSession.mockReturnValue(mockSession as any);

      cliRunner.execCli.mockResolvedValue({
        stdout: JSON.stringify({
          pageCount: 2,
          isNewTab: false,
          activeUrl: 'https://www.baidu.com/',
        }),
        stderr: '',
      });
      cliRunner.parseJsonStdout.mockReturnValue({
        pageCount: 2,
        isNewTab: false,
        activeUrl: 'https://www.baidu.com/',
      });

      await handler.settlePageAfterAction(sessionId);

      expect(mockSession.preferLatestTab).toBe(false);
      expect(mockSession.lastUrl).toBe('https://www.baidu.com/');
      expect(mockSession.lastKnownPageCount).toBe(2);
      expect(cliRunner.execCli).not.toHaveBeenCalledWith(sessionId, expect.arrayContaining(['tab-select']));
    });
  });

  describe('handleSwitchLatestTab', () => {
    it('switches to latest tab and calls tab-select', async () => {
      const mockSession = { initialized: true, preferLatestTab: false, activeTabIndex: 0, lastUrl: '' };
      sessionManager.getOrCreateSession.mockReturnValue(mockSession as any);
      cliRunner.execCli.mockResolvedValue({
        stdout: JSON.stringify({
          pageCount: 3,
          switched: true,
          landedUrl: 'https://example.com/latest',
          title: 'Latest Tab',
        }),
        stderr: '',
      });
      cliRunner.parseJsonStdout.mockReturnValue({
        pageCount: 3,
        switched: true,
        landedUrl: 'https://example.com/latest',
        title: 'Latest Tab',
      });

      const result = await handler.handleSwitchLatestTab(sessionId);

      expect(result.status).toBe('success');
      expect(mockSession.preferLatestTab).toBe(true);
      expect(mockSession.activeTabIndex).toBe(2);
      expect(cliRunner.execCli).toHaveBeenCalledWith(sessionId, ['tab-select', '2']);
    });
  });

  describe('handleCloseTab', () => {
    it('closes tab, selects remaining tab, and updates activeTabIndex', async () => {
      const mockSession = { initialized: true, preferLatestTab: true, activeTabIndex: 2, lastUrl: '' };
      sessionManager.getOrCreateSession.mockReturnValue(mockSession as any);
      cliRunner.execCli.mockResolvedValue({
        stdout: JSON.stringify({
          pageCount: 2,
          closed: true,
          landedUrl: 'https://example.com/previous',
          title: 'Previous Tab',
        }),
        stderr: '',
      });
      cliRunner.parseJsonStdout.mockReturnValue({
        pageCount: 2,
        closed: true,
        landedUrl: 'https://example.com/previous',
        title: 'Previous Tab',
      });

      const result = await handler.handleCloseTab(sessionId);

      expect(result.status).toBe('success');
      expect(mockSession.preferLatestTab).toBe(true);
      expect(mockSession.activeTabIndex).toBe(1);
      expect(cliRunner.execCli).toHaveBeenCalledWith(sessionId, ['tab-select', '1']);
    });
  });
});
