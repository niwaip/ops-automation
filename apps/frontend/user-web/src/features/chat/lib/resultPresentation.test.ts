import { describe, expect, it } from 'vitest';
import { resolveChatOutcomePresentation } from '@ops/user-core';

describe('resolveChatOutcomePresentation', () => {
  it('rebuilds historical raw envelopes and does not let completion placeholders hide data', () => {
    const businessData = {
      date: '2026-08-12',
      morning: { tempC: '26' },
      noon: { tempC: '28' },
      evening: { tempC: '27' },
    };
    const result = resolveChatOutcomePresentation({
      finalResult: 'weather_query_workflow已完成。',
      finalSummary: 'weather_query_workflow已完成。',
      rawResult: {
        execution: { status: 'success' },
        result: {
          title: 'weather_query_workflow',
          resultType: 'generic',
          businessData,
        },
        presentation: { preferAiSummary: true },
      },
    });

    expect(result.hasBusinessResult).toBe(true);
    expect(result.structuredData).toEqual(businessData);
    expect(result.primaryText).toContain('"noon"');
    expect(result.primaryText).not.toBe('weather_query_workflow已完成。');
  });

  it('uses an explicit contract summary before structured data', () => {
    const result = resolveChatOutcomePresentation({
      normalizedResult: {
        summary: '上海中午 28°C，傍晚 27°C。',
        structuredData: { noon: { tempC: '28' } },
        hasBusinessResult: true,
      },
    });

    expect(result.primaryText).toBe('上海中午 28°C，傍晚 27°C。');
  });
});
