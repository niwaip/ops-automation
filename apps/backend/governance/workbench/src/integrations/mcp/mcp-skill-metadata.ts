/** Bounded routing data from tools already filtered by user, mode and revision. No schemas. */
export function mcpCapabilitySummary(tools: { remoteName: string; description?: string }[]): string {
  const descriptions = tools.slice(0, 8).map(tool => {
    // Parenthetical examples can split a capability phrase (e.g. 公共（火车、公交、地铁）交通).
    // This is a display/routing summary, never a permission or effect classification.
    const text = String(tool.description || tool.remoteName).slice(0, 1200)
      .replace(/https?:\/\/\S+/g, '').replace(/[（(][^）)]{0,160}[）)]/g, '')
      .replace(/[\r\n\t<>`]/g, ' ').replace(/\s+/g, ' ').trim();
    return text.slice(0, 72);
  });
  return [...new Set(descriptions)].filter(Boolean).join('；').slice(0, 512);
}

/** Mirrors prompt_builder.build_skills_catalog for the read-only disclosure preview. */
export function mcpCatalogEntry(skill: { id: string; name: string; description: string }): string {
  const characters = Array.from(skill.description.trim().replace(/\n/g, ' '));
  const description = characters.length > 160 ? characters.slice(0, 157).join('') + '...' : characters.join('');
  const name = Array.from(skill.name.replace(/\n/g, ' ')).slice(0, 80).join('');
  return `- ${skill.id} (${name}): ${description}`;
}
