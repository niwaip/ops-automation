// @ts-nocheck
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
    const handleSimpleCommandSpy = jest
      .spyOn(adapter, 'handleSimpleCommand')
      .mockResolvedValue({
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
    const generateLocatorSpy = jest
      .spyOn(adapter, 'generateLocator')
      .mockResolvedValue('unused');
    const handleSimpleCommandSpy = jest
      .spyOn(adapter, 'handleSimpleCommand')
      .mockResolvedValue({
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
    const handleSimpleCommandSpy = jest
      .spyOn(adapter, 'handleSimpleCommand')
      .mockResolvedValue({
        status: 'success',
        command: 'click',
      });

    await adapter.runCliAction('click', { target: 'menuitem[name="Executions"]' }, 'runtime-1');

    expect(handleSimpleCommandSpy).toHaveBeenCalledWith('runtime-1', 'click', [
      'menuitem[name="Executions"]',
    ]);
    expect(adapter.normalizeSemanticRoleSelector('menuitem[name="Executions"]')).toBe(
      'role=menuitem[name="Executions"]',
    );
  });

  it('uses run-code text click fallback for pure text click commands', async () => {
    const adapter = createAdapter();
    jest.spyOn(adapter, 'ensureDirectories').mockResolvedValue(undefined);
    jest.spyOn(adapter, 'ensureSessionReady').mockResolvedValue(undefined);
    const execCliSpy = jest
      .spyOn(adapter, 'execCli')
      .mockResolvedValue({
        stdout: 'ok',
        stderr: '',
      });

    const result = await adapter.runCliAction(
      'click',
      { text: 'RAM登录' },
      'runtime-1',
    );

    expect(result.command).toBe('click');
    expect(execCliSpy).toHaveBeenCalledTimes(1);
    expect(execCliSpy.mock.calls[0][0]).toBe('runtime-1');
    expect(execCliSpy.mock.calls[0][1][0]).toBe('run-code');
    expect(execCliSpy.mock.calls[0][1][1]).toContain(`getByText("RAM登录", { exact: false })`);
    expect(execCliSpy.mock.calls[0][1][1]).toContain(`getByRole('button', { name: "RAM登录", exact: false })`);
  });

  it('falls back from shorthand textbox role selectors to placeholder inputs on fill', async () => {
    const adapter = createAdapter();
    jest.spyOn(adapter, 'ensureDirectories').mockResolvedValue(undefined);
    jest.spyOn(adapter, 'ensureSessionReady').mockResolvedValue(undefined);
    const execCliSpy = jest
      .spyOn(adapter, 'execCli')
      .mockResolvedValueOnce({
        stdout: '### Error\nError: "role=textbox[name="Enter username"]" does not match any elements.',
        stderr: '',
      })
      .mockResolvedValueOnce({
        stdout: 'ok',
        stderr: '',
      });

    const result = await adapter.runCliAction(
      'fill',
      { target: 'textbox[name="Enter username"]', value: 'demo' },
      'runtime-1',
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
    const execCliSpy = jest
      .spyOn(adapter, 'execCli')
      .mockResolvedValue({
        stdout: 'ok',
        stderr: '',
      });

    const result = await adapter.runCliAction(
      'wait',
      { selector: 'textbox[name="Enter username"]', duration: 15000 },
      'runtime-1',
    );

    expect(result.command).toBe('wait');
    expect(execCliSpy).toHaveBeenCalledWith('runtime-1', [
      'run-code',
      `async page => {
          const activePage = page;
          await activePage.locator("role=textbox[name=\\"Enter username\\"]").first().waitFor({ timeout: 15000 });
          return "selector-ready";
        }`,
    ]);
  });

  it('fails fast when a runtime target ref cannot be resolved', async () => {
    const adapter = createAdapter();
    jest.spyOn(adapter, 'ensureDirectories').mockResolvedValue(undefined);
    jest.spyOn(adapter, 'generateLocator').mockResolvedValue(undefined);

    await expect(
      adapter.runCliAction('click', { target: 'e53' }, 'runtime-1'),
    ).rejects.toThrow('Failed to resolve runtime target ref: e53');
  });
});
