export const DEFAULT_SKILL_MATCH_MIN_CONFIDENCE = 0.8;

export const NO_MATCHING_SKILL_MESSAGE =
  '当前没有可执行且与该请求充分匹配的 Skills，任务未执行。';

export function getSkillMatchMinConfidence(): number {
  const raw = process.env.SKILL_MATCH_MIN_CONFIDENCE;
  if (!raw?.trim()) {
    return DEFAULT_SKILL_MATCH_MIN_CONFIDENCE;
  }
  const configured = Number(raw);
  return Number.isFinite(configured) && configured >= 0 && configured <= 1
    ? configured
    : DEFAULT_SKILL_MATCH_MIN_CONFIDENCE;
}

export function isAcceptedSkillMatch(confidence: unknown): confidence is number {
  return (
    typeof confidence === 'number' &&
    Number.isFinite(confidence) &&
    confidence >= getSkillMatchMinConfidence()
  );
}
