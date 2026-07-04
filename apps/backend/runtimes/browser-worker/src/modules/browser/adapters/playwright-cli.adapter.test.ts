// @ts-nocheck
jest.mock('dockerode', () => jest.fn(() => ({})), { virtual: true });

import { PlaywrightCliAdapter } from './playwright-cli.adapter';

describe('PlaywrightCliAdapter', () => {
  const createAdapter = () =>
    new PlaywrightCliAdapter({
      touchWorkerByRuntimeSessionId: jest.fn(),
    });

  it('resolves runtime target refs before click execution', async () => {
    const adapter = createAdapter();
    jest.spyOn(adapter, 'ensureDirectories').mockResolvedValue(undefined);
    const generateLocatorSpy = jest
      .spyOn(adapter, 'generateLocator')
      .mockResolvedValue('role=button[name="Executions"]');
    const handleSimpleCommandSpy = jest.spyOn(adapter, 'handleSimpleCommand').mockResolvedValue({
      status: 'success',
      command: 'click',
    });

    await adapter.runCliAction('click', { target: 'e53' }, 'runtime-1');

    expect(generateLocatorSpy).toHaveBeenCalledWith('e53', {
      runtimeSessionId: 'runtime-1',
    });
    expect(handleSimpleCommandSpy).toHaveBeenCalledWith('runtime-1', 'click', [
      'role=button[name="Executions"]',
    ]);
  });

  it('keeps non-ref selectors unchanged', async () => {
    const adapter = createAdapter();
    jest.spyOn(adapter, 'ensureDirectories').mockResolvedValue(undefined);
    const generateLocatorSpy = jest.spyOn(adapter, 'generateLocator').mockResolvedValue('unused');
    const handleSimpleCommandSpy = jest.spyOn(adapter, 'handleSimpleCommand').mockResolvedValue({
      status: 'success',
      command: 'click',
    });

    await adapter.runCliAction('click', { selector: '[data-testid="submit"]' }, 'runtime-1');

    expect(generateLocatorSpy).not.toHaveBeenCalled();
    expect(handleSimpleCommandSpy).toHaveBeenCalledWith('runtime-1', 'click', [
      '[data-testid="submit"]',
    ]);
  });

  it('normalizes shorthand role selectors before click execution', async () => {
    const adapter = createAdapter();
    jest.spyOn(adapter, 'ensureDirectories').mockResolvedValue(undefined);
    const handleSimpleCommandSpy = jest.spyOn(adapter, 'handleSimpleCommand').mockResolvedValue({
      status: 'success',
      command: 'click',
    });

    await adapter.runCliAction('click', { target: 'menuitem[name="Executions"]' }, 'runtime-1');

    expect(handleSimpleCommandSpy).toHaveBeenCalledWith('runtime-1', 'click', [
      'menuitem[name="Executions"]',
    ]);
    expect(adapter.normalizeSemanticRoleSelector('menuitem[name="Executions"]')).toBe(
      'role=menuitem[name="Executions"]'
    );
  });

  it('uses run-code text click fallback for pure text click commands', async () => {
    const adapter = createAdapter();
    jest.spyOn(adapter, 'ensureDirectories').mockResolvedValue(undefined);
    jest.spyOn(adapter, 'ensureSessionReady').mockResolvedValue(undefined);
    const execCliSpy = jest.spyOn(adapter, 'execCli').mockResolvedValue({
      stdout: 'ok',
      stderr: '',
    });

    const result = await adapter.runCliAction('click', { text: 'RAM登录' }, 'runtime-1');

    expect(result.command).toBe('click');
    expect(execCliSpy).toHaveBeenCalledTimes(1);
    expect(execCliSpy.mock.calls[0][0]).toBe('runtime-1');
    expect(execCliSpy.mock.calls[0][1][0]).toBe('run-code');
    expect(execCliSpy.mock.calls[0][1][1]).toContain(`getByText("RAM登录", { exact: false })`);
    expect(execCliSpy.mock.calls[0][1][1]).toContain(
      `getByRole('button', { name: "RAM登录", exact: false })`
    );
  });

  it('falls back from shorthand textbox role selectors to placeholder inputs on fill', async () => {
    const adapter = createAdapter();
    jest.spyOn(adapter, 'ensureDirectories').mockResolvedValue(undefined);
    jest.spyOn(adapter, 'ensureSessionReady').mockResolvedValue(undefined);
    const execCliSpy = jest
      .spyOn(adapter, 'execCli')
      .mockResolvedValueOnce({
        stdout:
          '### Error\nError: "role=textbox[name="Enter username"]" does not match any elements.',
        stderr: '',
      })
      .mockResolvedValueOnce({
        stdout: 'ok',
        stderr: '',
      });

    const result = await adapter.runCliAction(
      'fill',
      { target: 'textbox[name="Enter username"]', value: 'demo' },
      'runtime-1'
    );

    expect(result.command).toBe('fill');
    expect(execCliSpy).toHaveBeenNthCalledWith(1, 'runtime-1', [
      'fill',
      'role=textbox[name="Enter username"]',
      'demo',
    ]);
    expect(execCliSpy).toHaveBeenNthCalledWith(2, 'runtime-1', [
      'fill',
      'input[placeholder="Enter username"], textarea[placeholder="Enter username"]',
      'demo',
    ]);
  });

  it('normalizes shorthand role selectors before wait execution', async () => {
    const adapter = createAdapter();
    jest.spyOn(adapter, 'ensureDirectories').mockResolvedValue(undefined);
    jest.spyOn(adapter, 'ensureSessionReady').mockResolvedValue(undefined);
    const execCliSpy = jest.spyOn(adapter, 'execCli').mockResolvedValue({
      stdout: 'ok',
      stderr: '',
    });

    const result = await adapter.runCliAction(
      'wait',
      { selector: 'textbox[name="Enter username"]', duration: 15000 },
      'runtime-1'
    );

    expect(result.command).toBe('wait');
    expect(execCliSpy).toHaveBeenCalledTimes(1);
    expect(execCliSpy.mock.calls[0][0]).toBe('runtime-1');
    expect(execCliSpy.mock.calls[0][1][0]).toBe('run-code');
    expect(execCliSpy.mock.calls[0][1][1]).toContain(
      'activePage.locator("role=textbox[name=\\"Enter username\\"]")'
    );
    expect(execCliSpy.mock.calls[0][1][1]).toContain('waitFor({ timeout: 15000 })');
    expect(execCliSpy.mock.calls[0][1][1]).toContain(
      'Timeout waiting for selector in page and iframes'
    );
  });

  it('uses run-code positional selector fallback for nth-match click', async () => {
    const adapter = createAdapter();
    jest.spyOn(adapter, 'ensureDirectories').mockResolvedValue(undefined);
    jest.spyOn(adapter, 'ensureSessionReady').mockResolvedValue(undefined);
    const execCliSpy = jest.spyOn(adapter, 'execCli').mockResolvedValue({
      stdout: 'ok',
      stderr: '',
    });

    const result = await adapter.runCliAction(
      'click',
      { target: ':nth-match([data-ai-action="detail"], 1)' },
      'runtime-1'
    );

    expect(result.command).toBe('click');
    expect(execCliSpy).toHaveBeenCalledTimes(1);
    expect(execCliSpy.mock.calls[0][0]).toBe('runtime-1');
    expect(execCliSpy.mock.calls[0][1][0]).toBe('run-code');
    expect(execCliSpy.mock.calls[0][1][1]).toContain(
      'scope.locator("[data-ai-action=\\"detail\\"]").nth(0)'
    );
    expect(execCliSpy.mock.calls[0][1][1]).toContain('locator.click({ force: true, timeout: 5000 })');
  });

  it('uses nth locator fallback for nth-match wait selectors', async () => {
    const adapter = createAdapter();
    jest.spyOn(adapter, 'ensureDirectories').mockResolvedValue(undefined);
    jest.spyOn(adapter, 'ensureSessionReady').mockResolvedValue(undefined);
    const execCliSpy = jest.spyOn(adapter, 'execCli').mockResolvedValue({
      stdout: 'ok',
      stderr: '',
    });

    const result = await adapter.runCliAction(
      'wait',
      { selector: ':nth-match([data-ai-action="detail"], 1)', duration: 15000 },
      'runtime-1'
    );

    expect(result.command).toBe('wait');
    expect(execCliSpy).toHaveBeenCalledTimes(1);
    expect(execCliSpy.mock.calls[0][0]).toBe('runtime-1');
    expect(execCliSpy.mock.calls[0][1][0]).toBe('run-code');
    expect(execCliSpy.mock.calls[0][1][1]).toContain(
      'activePage.locator("[data-ai-action=\\"detail\\"]").nth(0).waitFor({ timeout: 15000 })'
    );
    expect(execCliSpy.mock.calls[0][1][1]).toContain(
      'frame.locator("[data-ai-action=\\"detail\\"]").nth(0).waitFor({ timeout: 15000 })'
    );
  });

  it('fails fast when a runtime target ref cannot be resolved', async () => {
    const adapter = createAdapter();
    jest.spyOn(adapter, 'ensureDirectories').mockResolvedValue(undefined);
    jest.spyOn(adapter, 'generateLocator').mockResolvedValue(undefined);

    await expect(adapter.runCliAction('click', { target: 'e53' }, 'runtime-1')).rejects.toThrow(
      'Failed to resolve runtime target ref: e53'
    );
  });

  // v4.1 P0 regression: Issue #4 — localStorage restore was merge (setItem only),
  // not replace. The restore script must call localStorage.clear() before setItem
  // so dirty keys from the rolled-back step don't survive. Also verifies cross-origin
  // iframe detection (doc §4.4 promises partial: true + reason: 'cross-origin-iframe').
  it('restoreState script clears localStorage before setItem and detects cross-origin iframes', async () => {
    const adapter = createAdapter();
    jest.spyOn(adapter as any, 'resolveStateFilePath').mockResolvedValue('/fake/state.json');
    jest.spyOn(adapter as any, 'ensureSessionReady').mockResolvedValue(undefined);
    jest.spyOn(adapter as any, 'getOrCreateSession').mockReturnValue({ preferLatestTab: false });

    const fsPromises = require('fs/promises');
    jest.spyOn(fsPromises, 'readFile').mockResolvedValue(
      JSON.stringify({
        url: 'https://example.com',
        storageState: {
          cookies: [],
          origins: [
            { origin: 'https://example.com', localStorage: [{ name: 'key1', value: 'val1' }] },
          ],
        },
      })
    );

    let capturedScript = '';
    jest.spyOn(adapter as any, 'execCli').mockImplementation(async (_sid: string, args: string[]) => {
      if (args[0] === 'run-code' && args[1]) capturedScript = args[1];
      return { stdout: JSON.stringify({ restored: true, partial: false }), stderr: '', exitCode: 0 };
    });

    await adapter.restoreState('rt-1', 'rw:rt-1:3');

    // localStorage.clear() must appear BEFORE the setItem loop — without it, keys
    // written by the rolled-back step (draft marks, feature flags) survive as residue.
    expect(capturedScript).toContain('localStorage.clear()');
    const clearPos = capturedScript.indexOf('localStorage.clear()');
    const setItemPos = capturedScript.indexOf('localStorage.setItem(');
    expect(clearPos).toBeGreaterThan(-1);
    expect(setItemPos).toBeGreaterThan(clearPos);

    // Cross-origin iframe detection must be present (doc §4.4 / §5.1)
    expect(capturedScript).toContain('iframe');
    expect(capturedScript).toContain('cross-origin-iframe');
  });
});
