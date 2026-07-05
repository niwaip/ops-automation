import { ChatWaitingInputService } from './chat-waiting-input.service';

describe('ChatWaitingInputService', () => {
  const createService = () =>
    new ChatWaitingInputService({} as never, {} as never, {} as never, {} as never);

  it('formats waiting input messages with user-friendly wording', () => {
    const service = createService();

    const message = service.formatWaitingInputMessage({
      executionId: 'execution-1',
      intro: '已创建等待补充信息的执行单。',
      missingInputs: [
        {
          name: 'city',
          description: '要查询天气的城市名称',
          display_name: '要查询天气的城市名称',
          missing: true,
        },
      ],
      semantic: {
        summary: '仍缺少 1 个必填参数。',
        previewReady: false,
        finalReady: false,
        groupedMissing: [],
      },
    });

    expect(message).toContain('已创建等待补充信息的执行单。');
    expect(message).toContain('还需要 1 项信息。');
    expect(message).toContain('请补充：要查询天气的城市名称');
    expect(message).toContain('补充后我就继续处理。');
    expect(message).toContain('执行单 ID: execution-1');
    expect(message).not.toContain('字段兜底');
    expect(message).not.toContain('可预览');
    expect(message).not.toContain('可正式生成');
  });

  it('formats submission feedback with plain-language guidance', () => {
    const service = createService();

    const feedback = service.buildWaitingInputSubmissionFeedback({
      executionId: 'execution-2',
      resolvedFieldNames: ['城市名称'],
      remainingMissingInputs: [
        {
          name: 'date',
          description: '要查询的日期',
          display_name: '要查询的日期',
          missing: true,
        },
      ],
      semantic: {
        summary: '仍缺少 1 个必填参数。',
        previewReady: false,
        finalReady: false,
        groupedMissing: [],
      },
    });

    expect(feedback).toContain('已收到你补充的信息。');
    expect(feedback).toContain('这次补充了 1 项信息：城市名称');
    expect(feedback).toContain('还需要 1 项信息：要查询的日期');
    expect(feedback).toContain('把这些内容直接发给我，我会继续处理。');
    expect(feedback).not.toContain('仍缺少业务组');
  });
});
