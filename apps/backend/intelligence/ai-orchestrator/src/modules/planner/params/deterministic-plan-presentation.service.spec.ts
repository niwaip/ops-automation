import { DeterministicPlanPresentationService } from './deterministic-plan-presentation.service';

describe('DeterministicPlanPresentationService', () => {
  let service: DeterministicPlanPresentationService;

  beforeEach(() => {
    service = new DeterministicPlanPresentationService();
  });

  it('formats missing fileBase64 parameter with friendly label and upload hint', () => {
    const presentation = service.formatMissingInputs([
      {
        nodeId: 'step_extract',
        targetField: 'fileBase64',
      } as any,
    ]);

    expect(presentation.fields).toHaveLength(1);
    expect(presentation.fields[0]!.label).toBe('待提取的文档附件');
    expect(presentation.fields[0]!.description).toBe(
      '请通过输入框下方的附件图标上传待提取的文档或附件'
    );
    expect(presentation.message).toContain('待提取的文档附件');
    expect(presentation.message).toContain('请通过输入框下方的附件图标上传待提取的文档或附件');
  });

  it('preserves custom prompt when provided', () => {
    const presentation = service.formatMissingInputs([
      {
        nodeId: 'step_1',
        targetField: 'summaryLength',
        prompt: '请指定摘要最大字数限制',
      } as any,
    ]);

    expect(presentation.fields[0]!.description).toBe('请指定摘要最大字数限制');
  });
});
