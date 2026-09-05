export const DEFAULT_SKILL_MATCH_MIN_CONFIDENCE = 0.8;

export const NO_MATCHING_SKILL_MESSAGE =
  '当前没有可执行且与该请求充分匹配的 Skills，任务未执行。';

export function formatNoMatchingSkillMessage(userInput?: string): string {
  const text = (userInput || '').trim();
  if (/(ppt|演示文稿|幻灯片|presentation|slides?|做幻灯|生成ppt)/i.test(text)) {
    return (
      '当前工作模式下未匹配到企业级自动化技能。\n\n' +
      '💡 **模式指引**：检测到您正在制作 **PPT / 演示文稿**。该能力由专属安全沙箱（DeepSeek Harness + guizang-ppt 设计引擎）提供支持。\n' +
      '👉 请在左下方将模式切换为 **【个人模式】** 后重新发送，沙箱将自动为您生成高保真交互式演示文稿并保存至工作区！'
    );
  }
  return NO_MATCHING_SKILL_MESSAGE;
}

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

