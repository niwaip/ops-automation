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
});
