/**
 * 解析用户是否在对话中提出保存个人技能的自然语言指令
 * 如：“结果正确，把刚才的处理逻辑保存为个人技能，名称是按部门无偿统计”
 * 或：“把这个逻辑保存为 skill，叫做按部门无偿统计”
 */
export function parseSavePersonalSkillIntent(
  message: string
): { isMatch: boolean; displayName?: string } {
  if (!message || typeof message !== 'string') {
    return { isMatch: false };
  }
  const trimmed = message.trim();

  // 1. Slash command 支持
  const slashMatch = trimmed.match(/^\/(?:save-skill|save_skill|saveskill)\s+(.+)$/i);
  if (slashMatch && slashMatch[1] && slashMatch[1].trim()) {
    return { isMatch: true, displayName: slashMatch[1].trim() };
  }

  // 2. 否定意图识别：明确拒绝保存的不触发（如“不要保存为个人技能”、“请勿保存”）
  const isNegated =
    /(?:不要|严禁|禁止|无需|不用|请勿|不需要|切勿)[^\n，。！？；;]{0,24}(?:保存|另存)/.test(trimmed) ||
    /(?:^|[\s，。！？；;]|请|先)(?:别|不)\s*(?:再\s*)?(?:保存|另存)/.test(trimmed);
  if (isNegated) {
    return { isMatch: false };
  }

  // 3. 核心特征关键词过滤
  const hasSaveKeyword =
    /(?:保存|另存)[^\n，。！？；;]{0,120}(?:技能|\bskills?\b)/i.test(trimmed);

  if (!hasSaveKeyword) {
    return { isMatch: false };
  }

  // 4. 提取名称 (支持“名称是xxx”、“叫做xxx”、“叫xxx”、“：「xxx」”等)
  const namePatterns = [
    /(?:保存|另存)\s*(?:为|成)\s*(.+?)\s*的\s*(?:个人\s*)?(?:技能|skills?\b)/i,
    /(?:名称是|名字是|命名为|叫做|叫|：|:)\s*[「“"']?([^，。！？；;\n"”」']+)[」”"']?/,
    /[「“"']([^「“"'\n]+)[」”"']/,
    /(?:保存|另存)\s*(?:为|成)\s*(?:一个\s*)?(?:个人\s*)?(?:技能|skills?\b)\s+([^，。！？；;\n]+)/i,
  ];

  let displayName: string | undefined;
  for (const pat of namePatterns) {
    const match = trimmed.match(pat);
    if (match && match[1]) {
      const candidate = match[1].trim().replace(/^[「“"']|[」”"']$/g, '').trim();
      if (
        candidate &&
        candidate !== '个人技能' &&
        candidate !== '技能' &&
        candidate !== 'skill' &&
        candidate.length >= 2
      ) {
        displayName = candidate;
        break;
      }
    }
  }

  if (!displayName) {
    displayName = '我的个人技能';
  }

  return { isMatch: true, displayName };
}
