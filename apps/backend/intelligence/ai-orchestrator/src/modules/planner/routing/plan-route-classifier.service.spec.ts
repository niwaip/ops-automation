import { PlanRouteClassifierService } from './plan-route-classifier.service';

describe('PlanRouteClassifierService document routing', () => {
  const service = new PlanRouteClassifierService();

  it.each(['总结pdf', '总结 PDF', '总结附件 [系统上下文：用户已上传 PDF 附件]'])(
    'routes document extraction plus summarization as a deterministic plan: %s',
    (request) => {
      expect(service.classifyRoute(request)).toBe('deterministic_plan');
    }
  );

  it('keeps plain PDF extraction on the single-skill path', () => {
    expect(service.classifyRoute('提取PDF内容')).toBe('deterministic_plan');
  });
});
