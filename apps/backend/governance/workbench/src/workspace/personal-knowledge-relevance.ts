/** Matching metadata is derived from the same document displayed in personal space. */
export function normalizeKnowledgeEntity(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s_\-]+/g, '');
}

const GENERIC_ENTITIES = new Set([
  'ai', 'pdf', 'ppt', 'pptx', 'word', 'doc', 'docx', 'excel', 'xls', 'xlsx', 'md', 'markdown', 'txt',
  'csv', 'json', 'html', 'png', 'jpg', '文档', '文件', '附件', '资料', '表格', '报告',
  '个人空间', '知识库', '内容', '建议', '开发', '生成', '制作', '翻译', '导出',
]);

export function knowledgeTerms(query: string): string[] {
  const clean = query.toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/关于|有关|请问|有什么|有哪些|怎么|如何|查看|归纳|总结|个人空间|知识库|我的资料|我的文档|建议/g, ' ')
    .replace(/[呢吗呀啊吧么？！?！]+$/g, ' ');
  return [...new Set((clean.match(/[a-z][a-z0-9-]{1,}|[\u4e00-\u9fff]{2,}/g) || [])
    .map(normalizeKnowledgeEntity).filter((s) => !GENERIC_ENTITIES.has(s)))];
}

export function parseKnowledgeFrontmatter(text: string): { title: string; tags: string[] } {
  const fm = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || '';
  const title = (fm.match(/^title:\s*(.+)$/m)?.[1] || '').replace(/^["']|["']$/g, '').trim();
  const raw = fm.match(/^tags:\s*\[([^\]]*)\]/m)?.[1];
  const tags = raw !== undefined
    ? raw.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
    : (fm.match(/^tags:\s*\r?\n((?:[ \t]+-.*\r?\n?)*)/m)?.[1] || '')
      .split(/\r?\n/).map((s) => s.replace(/^\s*-\s*/, '').replace(/^["']|["']$/g, '').trim());
  return { title, tags: tags.filter(Boolean) };
}

export function scorePersonalKnowledge(query: string, name: string, title: string, tags: string[], text: string): number {
  const normalizedQuery = normalizeKnowledgeEntity(query);
  const terms = knowledgeTerms(query);
  const titleText = normalizeKnowledgeEntity(`${name} ${title}`);
  const tagHit = tags.some((tag) => {
    const entity = normalizeKnowledgeEntity(tag);
    return entity.length >= 2 && !GENERIC_ENTITIES.has(entity) && normalizedQuery.includes(entity);
  });
  const titleHit = terms.some((term) => titleText.includes(term));
  const headings = (text.match(/^#{1,6}\s+.+$/gm) || []).join(' ');
  const headingHit = terms.some((term) => normalizeKnowledgeEntity(headings).includes(term));
  return (tagHit ? 500 : 0) + (titleHit ? 300 : 0) + (headingHit ? 200 : 0);
}

export function knowledgeExcerpt(text: string, query: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const terms = knowledgeTerms(query);
  const lower = text.toLowerCase();
  const positions = terms.map((term) => lower.indexOf(term)).filter((n) => n >= 0);
  const start = positions.length ? Math.max(0, Math.min(...positions) - 300) : 0;
  return `${start ? '[前文省略]\n' : ''}${text.slice(start, start + maxChars)}\n[其余正文可通过 read_file 继续读取]`;
}
