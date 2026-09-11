import * as path from 'path';

// ---------------------------------------------------------------------------
// Locator / error pattern constants
// Keep in sync with browser-domain.constants.ts in ai-orchestrator.
// ---------------------------------------------------------------------------
/** Playwright strict-mode: locator resolved to multiple elements. */
export const STRICT_MODE_VIOLATION_PATTERN = /strict mode violation/i;

/** Playwright: element not found or timed out. */
export const ELEMENT_NOT_FOUND_PATTERN = /does not match any elements|No element found|Timeout/i;

/** Any locator resolution failure (superset of the two above). */
export const LOCATOR_ERROR_PATTERN =
  /does not match any elements|No element found|strict mode violation|Unknown engine|Timeout/i;

/** Ephemeral runtime element handle (e.g. "e24" or "12_3"). */
export const EPHEMERAL_REF_RE = /^(?:e\d+|\d+_\d+)$/i;

/**
 * W3C/Playwright ARIA role names that are valid targets for `getByRole()`.
 * HTML tag names (input, select, textarea, div, span, …) must NOT be treated
 * as roles — they are CSS selectors and must be passed through unchanged.
 */
export const PLAYWRIGHT_ARIA_ROLES = new Set([
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'blockquote',
  'button',
  'caption',
  'cell',
  'checkbox',
  'code',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'deletion',
  'dialog',
  'directory',
  'document',
  'emphasis',
  'feed',
  'figure',
  'form',
  'generic',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'insertion',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'meter',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'navigation',
  'none',
  'note',
  'option',
  'paragraph',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'strong',
  'subscript',
  'superscript',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'time',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
]);

export interface CliSessionState {
  runtimeSessionId: string;
  profilePath: string;
  initialized: boolean;
  attached: boolean;
  controlMode: 'AGENT_RUNNING' | 'HUMAN_CONTROL';
  frozenReason?: string;
  preferLatestTab?: boolean;
  lastUrl?: string;
  lastSnapshotState?: BrowserSnapshotState;
  lastSearchResults?: Array<{
    rank: number;
    text: string;
    href: string;
    score?: number;
    host?: string;
  }>;
}

export interface BrowserSnapshotState {
  url?: string;
  title?: string;
  scrollX?: number;
  scrollY?: number;
  bodyLength?: number;
  hasModal?: boolean;
  timestamp: number;
}

export interface CliBinary {
  command: string;
  baseArgs: string[];
}

export interface CliExecResult {
  stdout: string;
  stderr: string;
}

export interface CliActionResult {
  status: 'success';
  command: string;
  stdout?: string;
  stderr?: string;
  screenshot?: string;
  html?: string;
  text?: string;
  data?: Record<string, unknown>;
  snapshot?: {
    id: string;
    path: string;
  };
}

export interface RecorderStateRecord {
  executionIndex: number;
  capturedAt: string;
  url?: string;
  storageState: {
    cookies?: unknown[];
    origins?: unknown[];
  };
}

export interface PlaywrightCliContext {
  execCli(sessionId: string, args: string[], timeoutMs?: number): Promise<CliExecResult>;
  ensureSessionReady(sessionId: string): Promise<void>;
  ensureDirectories(): Promise<void>;
  getOrCreateSession(sessionId: string): CliSessionState;
  handleSimpleCommand(sessionId: string, command: string, args: string[]): Promise<CliActionResult>;
  generateLocator(targetRef: string, options?: { runtimeSessionId?: string }): Promise<string | undefined>;
  settlePageAfterAction(sessionId: string): Promise<void>;
  enrichResultArtifacts(
    sessionId: string,
    result: CliActionResult,
    options?: { captureScreenshot?: boolean }
  ): Promise<CliActionResult>;
  resolveStateFilePath(sessionId: string, executionIndex: number): Promise<string>;
}

export interface PlaywrightCliConfig {
  profileDir: string;
  artifactDir: string;
  screenshotCompressionThresholdBytes: number;
  screenshotMaxDimension: number;
  screenshotJpegQuality: number;
  maxHtmlChars: number;
  cliAutoArtifactTimeoutMs: number;
  cliActionTimeoutMs: number;
  cliNavigationTimeoutMs: number;
  cliProcessTimeoutMs: number;
  cliPageSettleTimeoutMs: number;
  chromeRemoteDebuggingHost: string;
  chromeRemoteDebuggingPort: number;
}

export function getDefaultPlaywrightConfig(): PlaywrightCliConfig {
  const readTimeoutMs = (envKey: string, fallback: number): number => {
    const raw = process.env[envKey];
    if (!raw) return fallback;
    const val = parseInt(raw, 10);
    return Number.isFinite(val) && val > 0 ? val : fallback;
  };

  return {
    profileDir:
      process.env.PLAYWRIGHT_CLI_PROFILE_DIR?.trim() ||
      path.join(process.cwd(), 'temp', 'playwright-profiles'),
    artifactDir:
      process.env.PLAYWRIGHT_CLI_ARTIFACT_DIR?.trim() ||
      path.join(process.cwd(), 'temp', 'playwright-cli-artifacts'),
    screenshotCompressionThresholdBytes: 350 * 1024,
    screenshotMaxDimension: 1600,
    screenshotJpegQuality: 70,
    maxHtmlChars: parseInt(process.env.PLAYWRIGHT_CLI_MAX_HTML_CHARS || '1000000', 10),
    cliAutoArtifactTimeoutMs: readTimeoutMs('PLAYWRIGHT_CLI_AUTO_ARTIFACT_TIMEOUT_MS', 8000),
    cliActionTimeoutMs: readTimeoutMs('PLAYWRIGHT_CLI_ACTION_TIMEOUT_MS', 60000),
    cliNavigationTimeoutMs: readTimeoutMs('PLAYWRIGHT_CLI_NAVIGATION_TIMEOUT_MS', 60000),
    cliProcessTimeoutMs: readTimeoutMs('PLAYWRIGHT_CLI_PROCESS_TIMEOUT_MS', 120000),
    cliPageSettleTimeoutMs: readTimeoutMs('PLAYWRIGHT_CLI_PAGE_SETTLE_TIMEOUT_MS', 2500),
    chromeRemoteDebuggingHost: process.env.CHROME_REMOTE_DEBUGGING_HOST || 'browser-chrome',
    chromeRemoteDebuggingPort: Number(process.env.CHROME_REMOTE_DEBUGGING_PORT || '9222'),
  };
}
