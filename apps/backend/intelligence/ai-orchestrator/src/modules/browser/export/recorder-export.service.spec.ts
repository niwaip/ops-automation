import { RecorderExportService } from './recorder-export.service';

describe('RecorderExportService', () => {
  it('should embed versioned executionPlan and trace into publish payload', () => {
    const service = new RecorderExportService();

    const payload = service.buildSkillPublishPayload({
      userGoal: '审批待办单据',
      backend: 'cli',
      runtimeSessionId: 'recorder-session-1',
      commands: [
        {
          tool: 'click',
          params: { target: 'e10' },
          description: '点击审批按钮',
        } as any,
      ],
      templateSteps: [
        {
          step_id: 'step_1',
          action: 'click',
          locator: { type: 'ref', value: 'e10' },
          description: '点击审批按钮',
        },
      ],
      loopDraft: {
        stopWhen: {
          read: {
            type: 'text',
            locator: { type: 'ref', value: 'e20' },
          },
          conditionFn: '(value) => value === "完成"',
          description: '状态变为完成时停止',
        },
      } as any,
      parameters: [
        {
          name: 'approvalId',
          description: '审批单号',
          required: true,
        },
      ],
      outputs: [
        {
          name: 'executionResult',
          description: '执行结果',
          location: 'browser worker',
        },
      ],
      metadata: {
        name: '审批待办单据',
        description: '自动进入审批页并点击审批按钮',
      },
      exportArtifactId: 'artifact-1',
    });

    const runtimeMetadata =
      ((payload.apiEndpoints || {}) as Record<string, any>).runtimeMetadata || {};
    const executionPlan = runtimeMetadata.executionPlan || {};

    expect(runtimeMetadata.executionPlanVersion).toBe('browser-recording-ir/v1');
    expect(executionPlan.executionPlanVersion).toBe('browser-recording-ir/v1');
    expect(executionPlan.parameters).toEqual([expect.objectContaining({ name: 'approvalId' })]);
    expect(executionPlan.outputs).toEqual([expect.objectContaining({ name: 'executionResult' })]);
    expect(executionPlan.executionLimits).toEqual(expect.objectContaining({ maxCommandCount: 1 }));
    expect(executionPlan.trace).toEqual({
      recorderSessionId: 'recorder-session-1',
      exportArtifactId: 'artifact-1',
    });
  });

  it('exports a pure browser payload without recorder-owned composition', () => {
    const service = new RecorderExportService();
    const payload = service.buildSkillPublishPayload({
      userGoal: '打开报告页',
      backend: 'cli',
      runtimeSessionId: 'recorder-session-1',
      commands: [] as any,
      templateSteps: [
        { step_id: 'step_1', action: 'goto', params: { url: 'https://example.com/report' } },
      ],
      parameters: [],
      outputs: [
        {
          name: 'browserRunOutput',
          description: '浏览器结果',
          location: 'browser-run-output/v2',
          type: 'object',
        },
      ],
      metadata: { name: '报告页', description: '报告页' },
    });
    const metadata = (payload.apiEndpoints as any).runtimeMetadata;
    expect(metadata.composition).toBeUndefined();
    expect(metadata.compositePlan).toBeUndefined();
  });

  it('keeps required parameter examples separate from executable defaults', () => {
    const service = new RecorderExportService();
    const payload = service.buildSkillPublishPayload({
      userGoal: '打开指定网页',
      backend: 'cli',
      runtimeSessionId: 'recorder-session-params',
      commands: [] as any,
      parameters: [
        {
          name: 'url',
          description: '目标网页地址',
          required: true,
          exampleValue: 'https://example.dev/article',
        },
      ],
      outputs: [],
      metadata: { name: '打开网页', description: '打开用户指定的网页' },
    });

    const property = (payload.paramsSchema as any).properties.url;
    expect(property.examples).toEqual(['https://example.dev/article']);
    expect(property.default).toBeUndefined();
    expect((payload.paramsSchema as any).required).toContain('url');
  });
});
