export const findCompanyCandidate = (text?: string): string | null => {
  if (!text || typeof text !== 'string') return null;
  const matches = [
    text.match(
      /(?:与|和)?(?:[^\s,，。]+?[省市区街道路弄号]+(?:的)?\s*)?([^\s,，。]+?(?:公司|集团|事务所|商行))/
    ),
    text.match(/([^\s,，。]+?(?:公司|企业|集团|事务所|商行))/),
  ];
  for (const match of matches) {
    const candidate = match?.[1]
      ?.replace(/^(?:我方|对方|和|与|与我方|和对方|以及|向|由)\s*/, '')
      .trim();
    if (candidate && candidate.length >= 4 && /(?:公司|企业|集团|事务所|商行)$/.test(candidate)) {
      return candidate;
    }
  }
  return null;
};
