import { CdpExecutor, type TemplateStep } from '../src/modules/execution/cdp.executor';

describe('CdpExecutor execution policy', () => {
  let executor: CdpExecutor;
  let postJsonSpy: jest.SpiedFunction<any>;

  beforeEach(() => {
    executor = new CdpExecutor();
    postJsonSpy = jest.spyOn(executor as any, 'postJson').mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stops with confirmation metadata when step policy requires confirmation', async () => {
    const result = await executor.executeStep({
      step_id: 'step_1',
      action: 'click',
      execution_policy: 'require_confirmation',
      description: '点击承认',
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        step_id: 'step_1',
        action: 'click',
        confirmation_required: true,
        confirmation_reason: '步骤策略要求人工确认后执行',
      })
    );
    expect(result.takeover).toBeUndefined();
    expect(postJsonSpy).toHaveBeenCalledTimes(1);
    expect(postJsonSpy).toHaveBeenCalledWith(
      '/browser/init',
      expect.objectContaining({ backend: 'cli' })
    );
  });

  it('stops with takeover when step policy requires manual takeover', async () => {
    const result = await executor.executeStep({
      step_id: 'step_2',
      action: 'click',
      execution_policy: 'require_takeover',
      description: '人工处理 MFA',
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        step_id: 'step_2',
        action: 'click',
        takeover: true,
        takeover_reason: '步骤策略要求人工接管',
      })
    );
    expect(postJsonSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects forbidden replay steps before browser execution', async () => {
    const result = await executor.executeStep({
      step_id: 'step_3',
      action: 'click',
      execution_policy: 'forbid_in_replay',
      description: '仅录制，不允许回放',
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        step_id: 'step_3',
        action: 'click',
        error: '步骤策略禁止在回放中自动执行',
        replay_forbidden: true,
        replay_forbidden_reason: '步骤策略禁止在回放中自动执行',
      })
    );
    expect(postJsonSpy).toHaveBeenCalledTimes(1);
  });

  it('continues normal browser execution for auto steps', async () => {
    postJsonSpy.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({
      success: true,
      output: { command: 'click', status: 'success', message: 'clicked' },
    });

    const step: TemplateStep = {
      step_id: 'step_4',
      action: 'click',
      execution_policy: 'auto_execute',
      locator: { type: 'css', value: '#submit' },
    };

    const result = await executor.executeStep(step);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        step_id: 'step_4',
        action: 'click',
        message: 'clicked',
      })
    );
    expect(postJsonSpy).toHaveBeenNthCalledWith(
      2,
      '/browser/execute-step',
      expect.objectContaining({
        executionId: 'template-test:template-test-default',
        runtimeSessionId: 'template-test-default',
        backend: 'cli',
        stepId: 'step_4',
        action: 'click',
        args: { selector: '#submit' },
      })
    );
  });

  it('forwards attribute-based read_value params to browser worker', async () => {
    postJsonSpy.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({
      success: true,
      results: [{ command: 'get_text', status: 'ok', data: { text: 'mfa' } }],
    });

    const result = await executor.executeStep({
      step_id: 'step_5',
      action: 'read_value',
      locator: { type: 'css', value: 'body' },
      params: {
        selector: 'body',
        method: 'attribute',
        attribute: 'data-auth-stage',
        max_length: 128,
      },
      output_var: 'authStage',
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        step_id: 'step_5',
        action: 'read_value',
        text: 'mfa',
      })
    );
    expect(postJsonSpy).toHaveBeenNthCalledWith(
      2,
      '/browser/execute',
      expect.objectContaining({
        commands: [
          {
            tool: 'get_text',
            params: {
              selector: 'body',
              method: 'attribute',
              attribute: 'data-auth-stage',
              max_length: 128,
            },
          },
        ],
      })
    );
  });

  it('uses the standardized step endpoint and propagates content readiness failures', async () => {
    postJsonSpy.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({
      success: false,
      errorCode: 'CONTENT_NOT_READY',
      errorMessage: '页面正文未达到步骤的内容质量契约',
      output: {
        command: 'navigate',
        html: '<html><body><main>Request failed.</main></body></html>',
        text: 'Request failed.',
      },
    });

    const result = await executor.executeStep(
      {
        step_id: 'step_content',
        action: 'navigate',
        params: { url: 'https://example.com' },
        capture_profile: {
          schemaVersion: 'capture-profile/v1',
          profile: 'article',
          capture: { screenshot: true, html: true, snapshot: false, mainContent: true },
          limits: { htmlBytes: 1_000_000, contentChars: 30_000, tableCells: 500 },
        },
      },
      'session-content'
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        step_id: 'step_content',
        action: 'navigate',
        error: '页面正文未达到步骤的内容质量契约',
        html: expect.stringContaining('Request failed.'),
      })
    );
    expect(postJsonSpy).toHaveBeenNthCalledWith(
      2,
      '/browser/execute-step',
      expect.objectContaining({
        executionId: 'template-test:session-content',
        runtimeSessionId: 'session-content',
        action: 'navigate',
        args: { url: 'https://example.com' },
        captureProfile: expect.objectContaining({ profile: 'article' }),
      })
    );
  });

  it('stops subsequent automation with takeover when branch condition mismatches', async () => {
    postJsonSpy
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        output: { command: 'click', status: 'success', message: 'opened detail' },
      })
      .mockResolvedValueOnce({
        success: true,
        results: [{ command: 'get_text', status: 'ok', data: { text: '17.8%' } }],
      });

    const results = await executor.executeSteps(
      [
        {
          step_id: 'step_1',
          action: 'click',
          locator: { type: 'css', value: '[data-ai-action="detail"]' },
        },
        {
          step_id: 'step_2',
          action: 'read_value',
          locator: { type: 'css', value: '[data-testid="gross-margin-value"]' },
          params: {
            selector: '[data-testid="gross-margin-value"]',
            method: 'innerText',
          },
          output_var: 'projectGrossRate',
        },
        {
          step_id: 'step_3',
          action: 'branch',
          branch: {
            condition_fn:
              '(ctx) => { const value = Number(String(ctx.projectGrossRate || "").replace(/[^0-9.-]+/g, "")); return Number.isFinite(value) && value > 20; }',
            on_match: 'continue',
            on_mismatch: 'takeover',
            takeover_reason: '案件粗利率未达到 20% 的自动承认标准，需要人工介入审查后决定是否承认',
            description: '当案件粗利率大于 20% 时允许自动承认，否则转人工介入',
          },
        },
        {
          step_id: 'step_4',
          action: 'click',
          locator: { type: 'role', value: 'button[name="承認する (Approve)"]' },
        },
      ],
      'session-conditional',
      {},
      'cli'
    );

    expect(results).toEqual([
      expect.objectContaining({
        step_id: 'step_1',
        action: 'click',
        success: true,
      }),
      expect.objectContaining({
        step_id: 'step_2',
        action: 'read_value',
        success: true,
        text: '17.8%',
      }),
      expect.objectContaining({
        step_id: 'step_3',
        action: 'branch',
        success: false,
        takeover: true,
        takeover_reason: '案件粗利率未达到 20% 的自动承认标准，需要人工介入审查后决定是否承认',
      }),
    ]);
    expect(results.find((item) => item.step_id === 'step_4')).toBeUndefined();
  });

  it('evaluates branch conditions against session params together with read_value outputs', async () => {
    postJsonSpy
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        results: [{ command: 'get_text', status: 'ok', data: { text: '25.5%' } }],
      })
      .mockResolvedValueOnce({
        success: true,
        output: { command: 'click', status: 'success', message: 'approved' },
      });

    const results = await executor.executeSteps(
      [
        {
          step_id: 'step_1',
          action: 'read_value',
          locator: { type: 'css', value: '[data-testid="gross-margin-value"]' },
          params: {
            selector: '[data-testid="gross-margin-value"]',
            method: 'innerText',
          },
          output_var: 'projectDetailText',
        },
        {
          step_id: 'step_2',
          action: 'branch',
          branch: {
            condition_fn:
              '(ctx) => { const value = Number(String(ctx.projectDetailText || "").replace(/[^0-9.-]+/g, "")); return Number.isFinite(value) && value > Number(ctx.grossMarginThreshold); }',
            on_match: 'continue',
            on_mismatch: 'takeover',
            takeover_reason: '案件粗利率未达到阈值，需要人工介入审核',
            description: '读取页面中的案件粗利率，满足阈值时自动继续执行',
          },
        },
        {
          step_id: 'step_3',
          action: 'click',
          locator: { type: 'role', value: 'button[name="承認する (Approve)"]' },
        },
      ],
      'session-conditional-with-params',
      {
        grossMarginThreshold: '10',
      },
      'cli'
    );

    expect(results).toEqual([
      expect.objectContaining({
        step_id: 'step_1',
        action: 'read_value',
        success: true,
        text: '25.5%',
      }),
      expect.objectContaining({
        step_id: 'step_2',
        action: 'branch',
        success: true,
        message: '条件成立，继续执行',
      }),
      expect.objectContaining({
        step_id: 'step_3',
        action: 'click',
        success: true,
        message: 'approved',
      }),
    ]);
  });

  it('repeats iteration steps until repeat_until stop condition is met', async () => {
    postJsonSpy
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        output: { command: 'goto', status: 'success', message: 'opened' },
      })
      .mockResolvedValueOnce({
        success: true,
        results: [{ command: 'get_text', status: 'ok', data: { text: '2' } }],
      })
      .mockResolvedValueOnce({
        success: true,
        output: { command: 'click', status: 'success', message: 'processed 1' },
      })
      .mockResolvedValueOnce({
        success: true,
        results: [{ command: 'get_text', status: 'ok', data: { text: '1' } }],
      })
      .mockResolvedValueOnce({
        success: true,
        results: [{ command: 'get_text', status: 'ok', data: { text: '1' } }],
      })
      .mockResolvedValueOnce({
        success: true,
        output: { command: 'click', status: 'success', message: 'processed 2' },
      })
      .mockResolvedValueOnce({
        success: true,
        results: [{ command: 'get_text', status: 'ok', data: { text: '0' } }],
      });

    const results = await executor.executeSteps(
      [
        { step_id: 'step_1', action: 'goto', params: { url: 'http://example.com' } },
        { step_id: 'step_2', action: 'click', locator: { type: 'css', value: '.approve-btn' } },
      ],
      'session-1',
      {},
      'cli',
      {
        loopDraft: {
          mode: 'repeat_until',
          eachIteration: { stepIds: ['step_2'] },
          stopWhen: {
            read: {
              type: 'count',
              locator: { type: 'css', value: '.pending-count' },
            },
            conditionFn: 'Number(value || 0) === 0',
            description: '待处理数量为 0 时结束',
          },
          maxIterations: 5,
          onNoProgress: 'takeover',
        },
      }
    );

    expect(results.map((item) => item.action)).toEqual([
      'goto',
      'loop_stop_read',
      'click',
      'loop_stop_read',
      'loop_stop_read',
      'click',
      'loop_stop_read',
    ]);
    expect(results.filter((item) => item.action === 'click')).toHaveLength(2);
    expect(
      results.filter((item) => item.action === 'loop_stop_read').map((item) => item.text)
    ).toEqual(['2', '1', '1', '0']);
  });

  it('blocks the loop with takeover when no progress is detected', async () => {
    postJsonSpy
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        results: [{ command: 'get_text', status: 'ok', data: { text: '1' } }],
      })
      .mockResolvedValueOnce({
        success: true,
        output: { command: 'click', status: 'success', message: 'processed 1' },
      })
      .mockResolvedValueOnce({
        success: true,
        results: [{ command: 'get_text', status: 'ok', data: { text: '1' } }],
      });

    const results = await executor.executeSteps(
      [{ step_id: 'step_1', action: 'click', locator: { type: 'css', value: '.approve-btn' } }],
      'session-2',
      {},
      'cli',
      {
        loopDraft: {
          mode: 'repeat_until',
          eachIteration: { stepIds: ['step_1'] },
          stopWhen: {
            read: {
              type: 'count',
              locator: { type: 'css', value: '.pending-count' },
            },
            conditionFn: 'Number(value || 0) === 0',
            description: '待处理数量为 0 时结束',
          },
          maxIterations: 3,
          onNoProgress: 'takeover',
        },
      }
    );

    expect(results[results.length - 1]).toEqual(
      expect.objectContaining({
        success: false,
        step_id: 'loop_no_progress_1',
        action: 'loop_control',
        takeover: true,
      })
    );
  });
});
