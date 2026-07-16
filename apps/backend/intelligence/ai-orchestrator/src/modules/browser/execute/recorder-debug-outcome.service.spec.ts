jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
  }),
  { virtual: true }
);

import { RecorderDebugOutcomeService } from './recorder-debug-outcome.service';

describe('RecorderDebugOutcomeService', () => {
  it('builds action outcome with before/after diff and detail-open verification', () => {
    const service = new RecorderDebugOutcomeService();
    const beforeObservation: any = {
      currentPageUrl: 'https://example.com/list',
      title: 'List',
      text: '列表页',
      inputs: [],
      buttons: [
        {
          ref: 'e-2',
          diffKey: 'e-2',
          text: '详情',
          role: 'button',
          visible: true,
        },
      ],
      interactiveState: {
        inputs: [],
        buttons: [
          {
            ref: 'e-2',
            diffKey: 'e-2',
            text: '详情',
            role: 'button',
            visible: true,
          },
        ],
      },
      headings: [],
      links: [],
      suggestedParameters: [],
      snapshotId: 'runtime-1:1',
      snapshotPath: '/tmp/before.snapshot',
    };
    const afterObservation: any = {
      ...beforeObservation,
      currentPageUrl: 'https://example.com/detail/1',
      title: 'Detail',
      text: '详情页',
      snapshotId: 'runtime-1:2',
      snapshotPath: '/tmp/after.snapshot',
      interactiveState: {
        inputs: [],
        buttons: [
          {
            ref: 'e-2',
            diffKey: 'e-2',
            text: '详情',
            role: 'button',
            visible: true,
            selected: true,
          },
        ],
      },
    };

    const outcome = service.buildOutcome({
      status: 'executed',
      reply: '已打开详情页。',
      userGoal: '打开第一条记录详情',
      beforeObservation,
      observation: afterObservation,
      commands: [{ tool: 'click', params: { target: 'e-2' }, locator: { strategy: 'ref', value: 'e-2' } }],
      execution: { success: true, results: [], executedCommands: [{ tool: 'click', params: { target: 'e-2' } }] },
    });

    expect(outcome).toEqual(
      expect.objectContaining({
        kind: 'action',
        status: 'succeeded',
        verification: expect.objectContaining({
          verifier: 'detail-open',
          success: true,
        }),
        artifacts: expect.objectContaining({
          snapshotIdBefore: 'runtime-1:1',
          snapshotIdAfter: 'runtime-1:2',
        }),
      })
    );
    expect(outcome.evidence.diff).toEqual(
      expect.objectContaining({
        urlChanged: true,
        titleChanged: true,
      })
    );
  });

  it('marks fill outcome as partial when value change is not observable', () => {
    const service = new RecorderDebugOutcomeService();
    const observation: any = {
      currentPageUrl: 'https://example.com/form',
      title: 'Form',
      text: '填写表单',
      inputs: [],
      buttons: [],
      interactiveState: {
        inputs: [
          {
            ref: 'input-1',
            diffKey: 'input-1',
            role: 'textbox',
            name: '姓名',
            visible: true,
          },
        ],
        buttons: [],
      },
      headings: [],
      links: [],
      suggestedParameters: [],
    };

    const outcome = service.buildOutcome({
      status: 'executed',
      reply: '已尝试填写姓名。',
      userGoal: '填写姓名为张三',
      beforeObservation: observation,
      observation,
      commands: [{ tool: 'fill', params: { target: 'input-1', value: '张三' } }],
      execution: { success: true, results: [], executedCommands: [{ tool: 'fill', params: { target: 'input-1', value: '张三' } }] },
    });

    expect(outcome.status).toBe('partial');
    expect(outcome.verification).toEqual(
      expect.objectContaining({
        verifier: 'fill',
        success: 'partial',
      })
    );
  });

  it('marks detail-open outcome as failed when detail panel does not change', () => {
    const service = new RecorderDebugOutcomeService();
    const observation: any = {
      currentPageUrl: 'https://example.com/list',
      title: 'List',
      text: '列表页',
      inputs: [],
      buttons: [
        {
          ref: 'e-2',
          diffKey: 'e-2',
          text: '详情',
          role: 'button',
          visible: true,
        },
      ],
      interactiveState: {
        inputs: [],
        buttons: [
          {
            ref: 'e-2',
            diffKey: 'e-2',
            text: '详情',
            role: 'button',
            visible: true,
          },
        ],
      },
      headings: [],
      links: [],
      suggestedParameters: [],
    };

    const outcome = service.buildOutcome({
      status: 'executed',
      reply: '已尝试打开详情。',
      userGoal: '打开第一条记录详情',
      beforeObservation: observation,
      observation,
      commands: [{ tool: 'click', params: { target: 'e-2' }, locator: { strategy: 'ref', value: 'e-2' } }],
      execution: { success: true, results: [], executedCommands: [{ tool: 'click', params: { target: 'e-2' } }] },
    });

    expect(outcome.status).toBe('failed');
    expect(outcome.verification).toEqual(
      expect.objectContaining({
        verifier: 'detail-open',
        success: false,
        failureReason: '尚未观察到明确的详情区域变化。',
      })
    );
    expect(outcome.verification.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'detail_panel_changed',
          passed: false,
          required: true,
        }),
      ])
    );
  });

  it('fails select verification when another node changes selected state instead of the grounded target', () => {
    const service = new RecorderDebugOutcomeService();
    const beforeObservation: any = {
      currentPageUrl: 'https://example.com/list',
      title: 'List',
      text: '列表页',
      inputs: [],
      buttons: [],
      interactiveState: {
        inputs: [],
        buttons: [
          {
            ref: 'row-1',
            diffKey: 'row-1',
            text: '第一条记录',
            role: 'button',
            visible: true,
            selected: false,
          },
          {
            ref: 'row-2',
            diffKey: 'row-2',
            text: '第二条记录',
            role: 'button',
            visible: true,
            selected: false,
          },
        ],
      },
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const afterObservation: any = {
      ...beforeObservation,
      interactiveState: {
        inputs: [],
        buttons: [
          {
            ref: 'row-1',
            diffKey: 'row-1',
            text: '第一条记录',
            role: 'button',
            visible: true,
            selected: true,
          },
          {
            ref: 'row-2',
            diffKey: 'row-2',
            text: '第二条记录',
            role: 'button',
            visible: true,
            selected: false,
          },
        ],
      },
    };

    const outcome = service.buildOutcome({
      status: 'executed',
      reply: '已尝试选中第二条记录。',
      userGoal: '选中第二条记录',
      beforeObservation,
      observation: afterObservation,
      commands: [{ tool: 'click', params: { target: 'row-2' }, locator: { strategy: 'ref', value: 'row-2' } }],
      execution: { success: true, results: [], executedCommands: [{ tool: 'click', params: { target: 'row-2' } }] },
    });

    expect(outcome.status).toBe('failed');
    expect(outcome.verification).toEqual(
      expect.objectContaining({
        verifier: 'select',
        success: false,
        failureReason: '观察到其他节点变化，但目标本身未进入选中态。',
      })
    );
    expect(outcome.verification.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'target_selected',
          passed: false,
          required: true,
        }),
      ])
    );
  });

  it('fails fill verification when requested value is written into a different input', () => {
    const service = new RecorderDebugOutcomeService();
    const beforeObservation: any = {
      currentPageUrl: 'https://example.com/form',
      title: 'Form',
      text: '填写表单',
      inputs: [],
      buttons: [],
      interactiveState: {
        inputs: [
          {
            ref: 'input-name',
            diffKey: 'input-name',
            role: 'textbox',
            name: '姓名',
            visible: true,
            value: '',
          },
          {
            ref: 'input-note',
            diffKey: 'input-note',
            role: 'textbox',
            name: '备注',
            visible: true,
            value: '',
          },
        ],
        buttons: [],
      },
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const afterObservation: any = {
      ...beforeObservation,
      interactiveState: {
        inputs: [
          {
            ref: 'input-name',
            diffKey: 'input-name',
            role: 'textbox',
            name: '姓名',
            visible: true,
            value: '',
          },
          {
            ref: 'input-note',
            diffKey: 'input-note',
            role: 'textbox',
            name: '备注',
            visible: true,
            value: '张三',
          },
        ],
        buttons: [],
      },
    };

    const outcome = service.buildOutcome({
      status: 'executed',
      reply: '已尝试填写姓名。',
      userGoal: '填写姓名为张三',
      beforeObservation,
      observation: afterObservation,
      commands: [{ tool: 'fill', params: { target: 'input-name', value: '张三' } }],
      execution: {
        success: true,
        results: [],
        executedCommands: [{ tool: 'fill', params: { target: 'input-name', value: '张三' } }],
      },
    });

    expect(outcome.status).toBe('failed');
    expect(outcome.verification).toEqual(
      expect.objectContaining({
        verifier: 'fill',
        success: false,
        failureReason: '请求值出现在非目标输入框，或目标输入框未写入该值。',
      })
    );
    expect(outcome.verification.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'input_value_written',
          passed: false,
          required: true,
        }),
      ])
    );
  });

  it('marks export-only turn as succeeded without requiring browser execution', () => {
    const service = new RecorderDebugOutcomeService();
    const observation: any = {
      currentPageUrl: 'https://example.com/list',
      title: 'List',
      text: '列表页',
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
    };

    const outcome = service.buildOutcome({
      status: 'completed',
      reply: '已根据当前对话与执行历史生成 CLI 脚本和内部 skill 草稿。',
      userGoal: '导出',
      beforeObservation: observation,
      observation,
      exportArtifacts: {
        script: 'const { chromium } = require("playwright");',
        skillDraft: { name: 'mock-skill' },
      },
    });

    expect(outcome.status).toBe('succeeded');
    expect(outcome.verification).toEqual(
      expect.objectContaining({
        success: true,
      })
    );
    expect(outcome.verification.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'tool_command_succeeded',
          passed: true,
          required: false,
        }),
        expect.objectContaining({
          code: 'export_artifacts_generated',
          passed: true,
          required: true,
        }),
      ])
    );
    expect(outcome.verification.checks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'intent_alignment' }),
      ])
    );
  });

  it('routes login fill+click flow to form-submit verifier with 100% confidence', () => {
    const service = new RecorderDebugOutcomeService();
    const beforeObservation: any = {
      currentPageUrl: 'http://10.167.105.37:8080/login.htm',
      title: '登录画面',
      text: '登录',
      inputs: [],
      buttons: [],
      interactiveState: {
        inputs: [
          { ref: 'e1', diffKey: 'e1', role: 'textbox', name: '用户名', visible: true, value: '' },
          { ref: 'e2', diffKey: 'e2', role: 'textbox', name: '密码', visible: true, value: '' },
        ],
        buttons: [],
      },
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const afterObservation: any = {
      currentPageUrl: 'http://10.167.105.37:8080/index',
      title: '主页',
      text: '欢迎',
      inputs: [],
      buttons: [],
      interactiveState: { inputs: [], buttons: [] },
      headings: [],
      links: [],
      suggestedParameters: [],
    };

    const outcome = service.buildOutcome({
      status: 'executed',
      reply: '将依次填写用户名和密码，点击 登录\n已执行当前页面操作。',
      userGoal: '用 用户名 S22014 密码 abcd1234 进行登录',
      beforeObservation,
      observation: afterObservation,
      commands: [
        { tool: 'fill', params: { selector: '用户名', value: 'S22014' } },
        { tool: 'fill', params: { selector: '密码', value: 'abcd1234' } },
        { tool: 'click', params: { target: 'e28' } },
      ],
      execution: {
        success: true,
        results: [],
        executedCommands: [
          { tool: 'fill', params: { selector: '用户名', value: 'S22014' } },
          { tool: 'fill', params: { selector: '密码', value: 'abcd1234' } },
          { tool: 'click', params: { target: 'e28' } },
        ],
      },
    });

    expect(outcome.status).toBe('succeeded');
    expect(outcome.verification).toEqual(
      expect.objectContaining({
        verifier: 'form-submit',
        routeReason: 'goal-pattern',
        success: true,
        confidence: 1,
      })
    );
    expect(outcome.verification.checks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'input_value_written' }),
      ])
    );
  });

  it('keeps fill verifier for fill-only turns even when goal contains a submit keyword', () => {
    const service = new RecorderDebugOutcomeService();
    const beforeObservation: any = {
      currentPageUrl: 'https://example.com/login',
      title: 'Login',
      text: '登录页',
      inputs: [],
      buttons: [],
      interactiveState: {
        inputs: [
          { ref: 'input-1', diffKey: 'input-1', role: 'textbox', name: '用户名', visible: true, value: '' },
        ],
        buttons: [],
      },
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const afterObservation: any = {
      currentPageUrl: 'https://example.com/login',
      title: 'Login',
      text: '登录页',
      inputs: [],
      buttons: [],
      interactiveState: {
        inputs: [
          { ref: 'input-1', diffKey: 'input-1', role: 'textbox', name: '用户名', visible: true, value: 'S22014' },
        ],
        buttons: [],
      },
      headings: [],
      links: [],
      suggestedParameters: [],
    };

    const outcome = service.buildOutcome({
      status: 'executed',
      reply: '已填写用户名。',
      userGoal: '登录前先填写用户名 S22014',
      beforeObservation,
      observation: afterObservation,
      commands: [
        { tool: 'fill', params: { target: 'input-1', value: 'S22014' } },
      ],
      execution: {
        success: true,
        results: [],
        executedCommands: [
          { tool: 'fill', params: { target: 'input-1', value: 'S22014' } },
        ],
      },
    });

    expect(outcome.verification).toEqual(
      expect.objectContaining({
        verifier: 'fill',
        routeReason: 'actionType',
      })
    );
    expect(outcome.verification.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'input_value_written', passed: true }),
      ])
    );
  });

  it('rejects grounding chosenTarget when observation ref node collides with command intent', () => {
    const service = new RecorderDebugOutcomeService();
    const observation: any = {
      currentPageUrl: 'http://10.0.0.1:8080/login.htm',
      title: '登录画面',
      text: '登录',
      inputs: [],
      buttons: [],
      interactiveState: {
        inputs: [],
        buttons: [
          { ref: 'e28', diffKey: 'e28', role: 'cell', name: '用户：', visible: true },
          { ref: 'e29', diffKey: 'e29', role: 'button', name: '登录', text: '登录', visible: true },
        ],
      },
      headings: [],
      links: [],
      suggestedParameters: [],
    };

    const outcome = service.buildOutcome({
      status: 'executed',
      reply: '已点击登录。',
      userGoal: '点击登录按钮',
      observation,
      commands: [
        {
          tool: 'click',
          params: { target: 'e28', text: '登录' },
          locator: { strategy: 'ref', value: 'e28', generatedBy: 'cli' },
          description: '点击登录按钮',
        },
      ],
      execution: {
        success: true,
        results: [],
        executedCommands: [
          { tool: 'click', params: { target: 'e28', text: '登录' } },
        ],
      },
    });

    const chosenTarget = outcome.grounding?.chosenTarget;
    if (chosenTarget) {
      expect(chosenTarget.role).not.toBe('cell');
      expect(String(chosenTarget.name || chosenTarget.text || '').toLowerCase()).toContain('登录');
    }
  });
});
