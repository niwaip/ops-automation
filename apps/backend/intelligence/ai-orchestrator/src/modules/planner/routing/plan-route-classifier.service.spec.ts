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

  it('routes a processing follow-up through deterministic planning when a prior result exists', () => {
    expect(service.classifyRoute('进行总结', { hasPreviousResult: true })).toBe(
      'deterministic_plan'
    );
  });

  it('routes standalone content processing through deterministic planning so missing content can be requested', () => {
    expect(service.classifyRoute('进行总结')).toBe('deterministic_plan');
    expect(service.classifyRoute('翻译成英文')).toBe('deterministic_plan');
  });

  it('routes advice and drafting through standard LLM planning instead of Skill matching', () => {
    expect(service.classifyRoute('给出穿衣建议', { hasPreviousResult: true })).toBe(
      'deterministic_plan'
    );
    expect(service.classifyRoute('写一封项目复盘邮件')).toBe('deterministic_plan');
  });

  it('does not attach an unrelated standalone request to the prior result', () => {
    expect(service.classifyRoute('查询北京天气', { hasPreviousResult: true })).toBe('single_skill');
  });

  it('attempts a single-Skill continuation only for one terminal processing action', () => {
    expect(
      service.shouldAttemptSingleSkillContinuation('bark推送', { hasPreviousResult: true })
    ).toBe(true);
    expect(
      service.shouldAttemptSingleSkillContinuation('Bark 推送', { hasPreviousResult: true })
    ).toBe(true);
    expect(
      service.shouldAttemptSingleSkillContinuation('总结后再bark推送', {
        hasPreviousResult: true,
      })
    ).toBe(false);
    expect(
      service.shouldAttemptSingleSkillContinuation('bark推送', { hasPreviousResult: false })
    ).toBe(false);
  });
});
