import { PlaywrightInspectionHandler } from './playwright-inspection.handler';
import { PlaywrightSessionManager } from './playwright-session.manager';
import { BrowserPageStateDto } from '../../../../dto/worker.dto';

describe('PlaywrightInspectionHandler smart screenshot policy', () => {
  let sessionManager: PlaywrightSessionManager;
  let handler: PlaywrightInspectionHandler;
  const sessionId = 'test-session-1';

  beforeEach(() => {
    sessionManager = new PlaywrightSessionManager({} as any);
    handler = new PlaywrightInspectionHandler(
      {} as any,
      sessionManager,
      {} as any
    );
  });

  it('captures on initial observation when no prior snapshot exists', () => {
    const result = handler.shouldCaptureScreenshot({
      action: 'click',
      success: true,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/home',
        scrollX: 0,
        scrollY: 0,
        bodyLength: 200,
        hasModal: false,
      } as BrowserPageStateDto,
    });

    expect(result).toEqual({ capture: true, reason: 'initial_observation' });
  });

  it('captures on explicit screenshot or snapshot action', () => {
    handler.updateLastSnapshotState(sessionId, {
      url: 'https://example.com/home',
      scrollX: 0,
      scrollY: 0,
      bodyLength: 200,
      hasModal: false,
    });

    const resultScreenshot = handler.shouldCaptureScreenshot({
      action: 'screenshot',
      success: true,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/home',
        scrollX: 0,
        scrollY: 0,
      } as BrowserPageStateDto,
    });
    expect(resultScreenshot).toEqual({ capture: true, reason: 'explicit_action' });

    const resultSnapshot = handler.shouldCaptureScreenshot({
      action: 'snapshot',
      success: true,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/home',
      } as BrowserPageStateDto,
    });
    expect(resultSnapshot).toEqual({ capture: true, reason: 'explicit_action' });
  });

  it('always captures on step failure or takeover to preserve evidence', () => {
    handler.updateLastSnapshotState(sessionId, {
      url: 'https://example.com/home',
      scrollX: 0,
      scrollY: 0,
    });

    const failureResult = handler.shouldCaptureScreenshot({
      action: 'type',
      success: false,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/home',
        scrollX: 0,
        scrollY: 0,
      } as BrowserPageStateDto,
    });
    expect(failureResult).toEqual({ capture: true, reason: 'failure_or_takeover' });

    const takeoverResult = handler.shouldCaptureScreenshot({
      action: 'click',
      success: true,
      shouldTakeover: true,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/home',
      } as BrowserPageStateDto,
    });
    expect(takeoverResult).toEqual({ capture: true, reason: 'failure_or_takeover' });
  });

  it('captures on navigation action or url change', () => {
    handler.updateLastSnapshotState(sessionId, {
      url: 'https://example.com/login',
      scrollX: 0,
      scrollY: 0,
    });

    // Same URL but action is navigate/goto
    const navResult = handler.shouldCaptureScreenshot({
      action: 'goto',
      success: true,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/login',
      } as BrowserPageStateDto,
    });
    expect(navResult).toEqual({ capture: true, reason: 'navigation_action' });

    // Action is click, but URL changed to /dashboard
    const urlChangeResult = handler.shouldCaptureScreenshot({
      action: 'click',
      success: true,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/dashboard',
      } as BrowserPageStateDto,
    });
    expect(urlChangeResult).toEqual({ capture: true, reason: 'url_changed' });
  });

  it('captures on explicit scroll action or scroll displacement >= 40px', () => {
    handler.updateLastSnapshotState(sessionId, {
      url: 'https://example.com/feed',
      scrollX: 0,
      scrollY: 100,
    });

    // Explicit scroll action
    const scrollActionResult = handler.shouldCaptureScreenshot({
      action: 'scroll',
      success: true,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/feed',
        scrollX: 0,
        scrollY: 100,
      } as BrowserPageStateDto,
    });
    expect(scrollActionResult).toEqual({ capture: true, reason: 'scroll_action' });

    // Non-scroll action (e.g. click) that scrolled down by 150px
    const scrollDisplacedResult = handler.shouldCaptureScreenshot({
      action: 'click',
      success: true,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/feed',
        scrollX: 0,
        scrollY: 250,
      } as BrowserPageStateDto,
    });
    expect(scrollDisplacedResult).toEqual({ capture: true, reason: 'viewport_scrolled' });
  });

  it('captures when modal dialog appears or disappears', () => {
    handler.updateLastSnapshotState(sessionId, {
      url: 'https://example.com/settings',
      hasModal: false,
    });

    const modalOpened = handler.shouldCaptureScreenshot({
      action: 'click',
      success: true,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/settings',
        hasModal: true,
      } as BrowserPageStateDto,
    });
    expect(modalOpened).toEqual({ capture: true, reason: 'modal_state_changed' });
  });

  it('captures when page title changes', () => {
    handler.updateLastSnapshotState(sessionId, {
      url: 'https://example.com/app',
      title: 'App - Inbox',
    });

    const titleChanged = handler.shouldCaptureScreenshot({
      action: 'click',
      success: true,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/app',
        pageTitle: 'App - Sent (3)',
      } as BrowserPageStateDto,
    });
    expect(titleChanged).toEqual({ capture: true, reason: 'title_changed' });
  });

  it('captures when DOM body length mutates significantly (>= 80 chars)', () => {
    handler.updateLastSnapshotState(sessionId, {
      url: 'https://example.com/list',
      bodyLength: 200,
    });

    const domMutated = handler.shouldCaptureScreenshot({
      action: 'click',
      success: true,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/list',
        bodyLength: 450,
      } as BrowserPageStateDto,
    });
    expect(domMutated).toEqual({ capture: true, reason: 'dom_content_mutated' });
  });

  it('skips screenshot on intermediate text typing and input focus with no layout change', () => {
    handler.updateLastSnapshotState(sessionId, {
      url: 'https://example.com/login',
      title: 'Login Page',
      scrollX: 0,
      scrollY: 0,
      bodyLength: 500,
      hasModal: false,
    });

    // 1. Click input focus
    const focusResult = handler.shouldCaptureScreenshot({
      action: 'focus',
      success: true,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/login',
        title: 'Login Page',
        scrollX: 0,
        scrollY: 0,
        bodyLength: 500,
        hasModal: false,
      } as BrowserPageStateDto,
    });
    expect(focusResult).toEqual({ capture: false, reason: 'no_significant_change' });

    // 2. Typing username (small text length change < 80 chars)
    const typeResult = handler.shouldCaptureScreenshot({
      action: 'type',
      success: true,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/login',
        title: 'Login Page',
        scrollX: 0,
        scrollY: 0,
        bodyLength: 512,
        hasModal: false,
      } as BrowserPageStateDto,
    });
    expect(typeResult).toEqual({ capture: false, reason: 'no_significant_change' });

    // 3. Hovering button
    const hoverResult = handler.shouldCaptureScreenshot({
      action: 'hover',
      success: true,
      sessionId,
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/login',
        title: 'Login Page',
        scrollX: 0,
        scrollY: 0,
        bodyLength: 512,
        hasModal: false,
      } as BrowserPageStateDto,
    });
    expect(hoverResult).toEqual({ capture: false, reason: 'no_significant_change' });
  });

  it('honors screenshotPolicy=all to capture every step unconditionally', () => {
    handler.updateLastSnapshotState(sessionId, {
      url: 'https://example.com/login',
      scrollX: 0,
      scrollY: 0,
      bodyLength: 500,
      hasModal: false,
    });

    const allPolicyResult = handler.shouldCaptureScreenshot({
      action: 'type',
      success: true,
      sessionId,
      captureProfile: {
        screenshotPolicy: 'all',
      },
      pageState: {
        runtimeSessionId: sessionId,
        pageUrl: 'https://example.com/login',
        scrollX: 0,
        scrollY: 0,
        bodyLength: 500,
        hasModal: false,
      } as BrowserPageStateDto,
    });
    expect(allPolicyResult).toEqual({ capture: true, reason: 'policy_all' });
  });

  it('honors captureProfile.capture.screenshot=false to completely disable screenshot', () => {
    const disabledResult = handler.shouldCaptureScreenshot({
      action: 'goto',
      success: true,
      sessionId,
      captureProfile: {
        capture: { screenshot: false },
      },
    });
    expect(disabledResult).toEqual({ capture: false, reason: 'capture_profile_disabled' });
  });
});
