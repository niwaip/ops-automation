import {
  DEFAULT_SKILL_MATCH_MIN_CONFIDENCE,
  getSkillMatchMinConfidence,
  isAcceptedSkillMatch,
} from './skill-match-policy';

describe('skill match policy', () => {
  const originalThreshold = process.env.SKILL_MATCH_MIN_CONFIDENCE;

  afterEach(() => {
    if (originalThreshold === undefined) {
      delete process.env.SKILL_MATCH_MIN_CONFIDENCE;
    } else {
      process.env.SKILL_MATCH_MIN_CONFIDENCE = originalThreshold;
    }
  });

  it('rejects missing and low-confidence matches with the default threshold', () => {
    delete process.env.SKILL_MATCH_MIN_CONFIDENCE;

    expect(getSkillMatchMinConfidence()).toBe(DEFAULT_SKILL_MATCH_MIN_CONFIDENCE);
    expect(isAcceptedSkillMatch(undefined)).toBe(false);
    expect(isAcceptedSkillMatch(0.5)).toBe(false);
    expect(isAcceptedSkillMatch(0.7)).toBe(false);
    expect(isAcceptedSkillMatch(0.8)).toBe(true);
  });

  it('supports a bounded environment override', () => {
    process.env.SKILL_MATCH_MIN_CONFIDENCE = '0.85';

    expect(getSkillMatchMinConfidence()).toBe(0.85);
    expect(isAcceptedSkillMatch(0.8)).toBe(false);
    expect(isAcceptedSkillMatch(0.9)).toBe(true);
  });

  it('uses the default for an invalid override', () => {
    process.env.SKILL_MATCH_MIN_CONFIDENCE = '2';
    expect(getSkillMatchMinConfidence()).toBe(DEFAULT_SKILL_MATCH_MIN_CONFIDENCE);
  });
});
