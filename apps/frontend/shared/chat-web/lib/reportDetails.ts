export type ReportPart =
  | { kind: 'markdown'; content: string }
  | { kind: 'details'; title: string; content: string };

/** Recognize only standalone, attribute-free details sections. Never enable raw HTML.
 * Fenced examples and malformed/unclosed sections stay ordinary Markdown.
 */
export function splitReportDetails(content: string): ReportPart[] {
  const lines = content.split('\n');
  const parts: ReportPart[] = [];
  let start = 0;
  let fence: { char: string; length: number } | undefined;
  const markdown = (end: number) => {
    if (end > start) parts.push({ kind: 'markdown', content: lines.slice(start, end).join('\n') });
  };
  for (let i = 0; i < lines.length; i += 1) {
    const marker = lines[i].match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (fence || !/^<details>\s*$/.test(lines[i])) continue;
    const summary = lines[i + 1]?.match(/^<summary>([^<>\r\n]{1,100})<\/summary>\s*$/);
    if (!summary) continue;
    let end = i + 2;
    let bodyFence: { char: string; length: number } | undefined;
    for (; end < lines.length; end += 1) {
      const bodyMarker = lines[end].match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
      if (bodyMarker) {
        if (!bodyFence) bodyFence = { char: bodyMarker[1][0], length: bodyMarker[1].length };
        else if (bodyMarker[1][0] === bodyFence.char && bodyMarker[1].length >= bodyFence.length && !bodyMarker[2].trim()) bodyFence = undefined;
        continue;
      }
      if (!bodyFence && /^<details>\s*$/.test(lines[end])) break;
      if (!bodyFence && /^<\/details>\s*$/.test(lines[end])) break;
    }
    if (end === lines.length) break;
    if (!/^<\/details>\s*$/.test(lines[end])) {
      i = end;
      continue;
    }
    markdown(i);
    parts.push({ kind: 'details', title: summary[1], content: lines.slice(i + 2, end).join('\n') });
    i = end;
    start = end + 1;
  }
  markdown(lines.length);
  return parts;
}
