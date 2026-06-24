import { ExecutionBrowserReadService } from '../src/modules/execution/step-runner/browser/execution-browser-read.service';

describe('ExecutionBrowserReadService', () => {
  it('extracts plain selector text from markdown wrapped browser read output', () => {
    const browserRuntimeAdapter = {
      invokeStep: jest.fn(),
    };
    const service = new ExecutionBrowserReadService(browserRuntimeAdapter as never);

    expect(
      service.extractBrowserTextResult([
        '### Result\n""\n### Ran Playwright code\n```js\nconsole.log("demo");\n```',
      ])
    ).toBe('');
    expect(
      service.extractBrowserTextResult([
        '### Result\n"保留中"\n### Ran Playwright code\n```js\nconsole.log("demo");\n```',
      ])
    ).toBe('保留中');
  });

  it('reads browser text by selector through BrowserRuntimeAdapter and normalizes the result', async () => {
    const browserRuntimeAdapter = {
      invokeStep: jest.fn().mockResolvedValue({
        output: {
          text: '### Result\n"保留中"\n### Ran Playwright code\n```js\nconsole.log("demo");\n```',
        },
      }),
    };
    const service = new ExecutionBrowserReadService(browserRuntimeAdapter as never);

    await expect(service.readBrowserTextBySelector('runtime-1', '#status')).resolves.toBe('保留中');

    expect(browserRuntimeAdapter.invokeStep).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'runtime-1',
        runtimeSessionId: 'runtime-1',
        stepId: 'loop-stop:runtime-1',
        action: 'get_text',
        input: {
          target: '#status',
          args: {
            selector: '#status',
            method: 'textContent',
          },
        },
      })
    );
  });
});
