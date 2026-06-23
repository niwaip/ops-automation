import { CapabilityReleaseBrowserRecordingService } from '../src/modules/capability-release/capability-release-browser-recording.service';

describe('CapabilityReleaseBrowserRecordingService', () => {
  const createService = () => new CapabilityReleaseBrowserRecordingService();

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.BROWSER_RECORDING_BACKEND;
    delete process.env.BROWSER_EXECUTION_BACKEND;
    delete process.env.BROWSER_RUNTIME_SESSION_MODE;
    delete process.env.BROWSER_RUNTIME_ENABLE_CODEGEN;
    delete process.env.BROWSER_RUNTIME_HEADLESS;
  });

  it('prefers templateSteps from apiEndpoints runtime metadata executionPlan', () => {
    const service = createService();

    const runtimePlan = service.buildRuntimePlan(
      {
        apiEndpoints: {
          runtimeMetadata: {
            executionPlan: {
              backend: 'cli',
              sessionPreferences: {
                mode: 'agent',
              },
              templateSteps: [
                {
                  step_id: 'step_read',
                  action: 'read_value',
                  locator: { type: 'css', value: '#detail-gross-margin' },
                  params: { selector: '#detail-gross-margin', method: 'innerText' },
                  output_var: 'grossMarginRaw',
                  description: '读取毛利率',
                },
                {
                  step_id: 'step_branch',
                  action: 'branch',
                  branch: {
                    condition_fn:
                      '(ctx) => Number(String(ctx.grossMarginRaw || "").replace(/[^0-9.]+/g, "")) >= 20',
                    on_match: 'continue',
                    on_mismatch: 'takeover',
                    takeover_reason: '低于阈值需要人工介入',
                    description: '根据毛利率阈值判断',
                  },
                  description: '根据毛利率阈值判断',
                },
                {
                  step_id: 'step_click',
                  action: 'click',
                  locator: { type: 'role', value: 'button[name="承認する (Approve)"]' },
                  description: '条件满足后点击承认按钮',
                },
              ],
            },
          },
        },
      },
      {}
    );

    expect(runtimePlan.backend).toBe('cli');
    expect(runtimePlan.runtimeSteps).toEqual([
      expect.objectContaining({
        id: 'step_read',
        action: 'read_value',
        target: '#detail-gross-margin',
        args: {
          selector: '#detail-gross-margin',
          method: 'innerText',
        },
        outputVar: 'grossMarginRaw',
        description: '读取毛利率',
      }),
      expect.objectContaining({
        id: 'step_branch',
        action: 'branch',
        branch: {
          conditionFn:
            '(ctx) => Number(String(ctx.grossMarginRaw || "").replace(/[^0-9.]+/g, "")) >= 20',
          onMatch: 'continue',
          onMismatch: 'takeover',
          takeoverReason: '低于阈值需要人工介入',
          description: '根据毛利率阈值判断',
        },
        description: '根据毛利率阈值判断',
      }),
      expect.objectContaining({
        id: 'step_click',
        action: 'click',
        target: 'role=button[name="承認する (Approve)"]',
        description: '条件满足后点击承认按钮',
      }),
    ]);
    expect(runtimePlan.runtimeStepsToExecute).toHaveLength(3);
    expect(runtimePlan.targetRuntimeStep).toBeNull();
    expect(runtimePlan.loopPlan).toBeNull();
  });

  it('builds repeat_until loop plan from executionPlan loopDraft', () => {
    const service = createService();

    const runtimePlan = service.buildRuntimePlan(
      {
        apiEndpoints: {
          runtimeMetadata: {
            executionPlan: {
              backend: 'cli',
              templateSteps: [
                {
                  step_id: 'step_nav',
                  action: 'navigate',
                  params: { url: 'http://localhost/list' },
                  description: '打开列表页',
                },
                {
                  step_id: 'step_detail',
                  action: 'click',
                  locator: {
                    type: 'css',
                    value: ':nth-match([data-ai-action="detail"], ${rowIndex})',
                  },
                  description: '打开详情',
                },
                {
                  step_id: 'step_approve',
                  action: 'click',
                  locator: { type: 'text', value: '承认' },
                  description: '执行承认',
                },
              ],
              loopDraft: {
                mode: 'repeat_until',
                target: {
                  scope: 'current_list',
                  currentPageUrl: 'http://localhost/list',
                  match: {
                    field: 'status',
                    operator: 'equals',
                    value: '未承认',
                  },
                },
                eachIteration: {
                  stepIds: ['step_detail', 'step_approve'],
                  stepCount: 2,
                },
                stopWhen: {
                  read: {
                    type: 'count',
                    locator: {
                      type: 'css',
                      value: '.pending-count',
                    },
                  },
                  conditionFn: 'Number(value || 0) === 0',
                  description: '待处理数量为 0 时结束',
                },
                onNoProgress: 'takeover',
                maxIterations: 20,
              },
            },
          },
        },
      },
      { rowIndex: 1 }
    );

    expect(runtimePlan.loopPlan).toEqual(
      expect.objectContaining({
        mode: 'repeat_until',
        maxIterations: 20,
        onNoProgress: 'takeover',
        preLoopSteps: [expect.objectContaining({ id: 'step_nav', action: 'goto' })],
        iterationSteps: [
          expect.objectContaining({ id: 'step_detail', action: 'click' }),
          expect.objectContaining({ id: 'step_approve', action: 'click' }),
        ],
        postLoopSteps: [],
        stopWhen: {
          read: {
            type: 'count',
            step: expect.objectContaining({
              id: 'loop_stop_read',
              action: 'read_value',
              target: '.pending-count',
            }),
          },
          conditionFn: 'Number(value || 0) === 0',
          description: '待处理数量为 0 时结束',
        },
      })
    );
    expect(runtimePlan.runtimeStepsToExecute).toEqual([
      expect.objectContaining({ id: 'step_nav' }),
      expect.objectContaining({ id: 'step_detail' }),
      expect.objectContaining({ id: 'step_approve' }),
    ]);
  });

  it('rewrites legacy gross margin branch thresholds with runtime input', () => {
    const service = createService();

    const runtimePlan = service.buildRuntimePlan(
      {
        apiEndpoints: {
          runtimeMetadata: {
            executionPlan: {
              templateSteps: [
                {
                  step_id: 'step_read',
                  action: 'read_value',
                  locator: { type: 'css', value: '#detail-gross-margin' },
                  params: { selector: '#detail-gross-margin', method: 'innerText' },
                  output_var: 'grossMarginRaw',
                  description: '读取案件粗利率',
                },
                {
                  step_id: 'step_branch',
                  action: 'branch',
                  branch: {
                    condition_fn:
                      '(ctx) => Number(String(ctx.grossMarginRaw || "").replace(/[^0-9.]+/g, "")) >= 20',
                    on_match: 'continue',
                    on_mismatch: 'takeover',
                    takeover_reason: '案件粗利率未达到 20% 自动批准标准，需要人工介入判断',
                    description: '提取页面中的案件粗利率，若大于 20% 则继续自动承认',
                  },
                  description: '根据毛利率阈值判断是否自动承认',
                },
              ],
            },
          },
        },
      },
      { grossMarginThreshold: 10 }
    );

    expect(runtimePlan.runtimeSteps).toEqual([
      expect.objectContaining({
        id: 'step_read',
        action: 'read_value',
      }),
      expect.objectContaining({
        id: 'step_branch',
        action: 'branch',
        branch: expect.objectContaining({
          conditionFn:
            '(ctx) => Number(String(ctx.grossMarginRaw || "").replace(/[^0-9.]+/g, "")) >= 10',
        }),
      }),
    ]);
  });
});
