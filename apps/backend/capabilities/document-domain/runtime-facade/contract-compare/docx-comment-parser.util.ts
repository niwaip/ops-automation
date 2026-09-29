import type * as JSZip from 'jszip';
import type { ContractClauseNode, DocxCommentItem } from './contract-compare.types';
import { decodeXmlEntities } from './docx-openxml-parser.util';

/**
 * Extracts Word native comments from OpenXML package (word/comments.xml, word/commentsExtended.xml, word/document.xml).
 */
export async function parseDocxComments(zip: any, docXml?: string): Promise<DocxCommentItem[]> {
  const commentFile = zip.file('word/comments.xml');
  if (!commentFile) return [];

  let commentsXml = '';
  try {
    commentsXml = await commentFile.async('string');
  } catch (err) {
    return [];
  }

  if (!commentsXml) return [];

  // Check resolved status in word/commentsExtended.xml
  const resolvedParaIds = new Set<string>();
  const extFile = zip.file('word/commentsExtended.xml');
  if (extFile) {
    try {
      const extXml = await extFile.async('string');
      const extRegex = /<w15:commentEx\s+[^>]*w15:paraId="([^"]+)"[^>]*w15:done="1"/g;
      let em: RegExpExecArray | null;
      while ((em = extRegex.exec(extXml)) !== null) {
        resolvedParaIds.add(em[1]);
      }
    } catch {
      // Ignore commentsExtended parse error gracefully
    }
  }

  // Parse w:comment entries
  const commentsMap = new Map<string, DocxCommentItem>();
  const commentRegex = /<w:comment\s+([^>]+)>([\s\S]*?)<\/w:comment>/g;
  let cm: RegExpExecArray | null;

  while ((cm = commentRegex.exec(commentsXml)) !== null) {
    const attrs = cm[1];
    const body = cm[2];

    const idMatch = attrs.match(/w:id="([^"]+)"/);
    const authorMatch = attrs.match(/w:author="([^"]+)"/);
    const dateMatch = attrs.match(/w:date="([^"]+)"/);
    const initialsMatch = attrs.match(/w:initials="([^"]+)"/);

    if (!idMatch) continue;
    const id = idMatch[1];
    const author = authorMatch ? decodeXmlEntities(authorMatch[1]) : '审阅人';
    const date = dateMatch ? dateMatch[1] : undefined;
    const initials = initialsMatch ? decodeXmlEntities(initialsMatch[1]) : undefined;

    // Extract text inside runs
    const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let tm: RegExpExecArray | null;
    let text = '';
    while ((tm = tRegex.exec(body)) !== null) {
      text += decodeXmlEntities(tm[1]);
    }

    // Check paraId in w:p
    const paraIdMatch = body.match(/w14:paraId="([^"]+)"/);
    const isResolved = paraIdMatch ? resolvedParaIds.has(paraIdMatch[1]) : false;

    commentsMap.set(id, {
      id,
      author,
      date,
      initials,
      text: text.trim(),
      isResolved,
    });
  }

  if (commentsMap.size === 0) return [];

  // If docXml is provided, match comment ranges to extract the highlighted contract text
  if (docXml) {
    // 1. Range comments: accurately extract selected text for each comment (supports multiple/nested comments on same text)
    for (const [id, comment] of commentsMap.entries()) {
      const startTagRegex = new RegExp(`<w:commentRangeStart\\s+[^>]*w:id="${id}"[^>]*\\/>`);
      const endTagRegex = new RegExp(`<w:commentRangeEnd\\s+[^>]*w:id="${id}"[^>]*\\/>`);
      const startMatch = docXml.match(startTagRegex);
      const endMatch = docXml.match(endTagRegex);
      if (startMatch && endMatch && startMatch.index !== undefined && endMatch.index !== undefined && endMatch.index > startMatch.index) {
        const rangeInner = docXml.substring(startMatch.index + startMatch[0].length, endMatch.index);
        const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
        let tm: RegExpExecArray | null;
        let selectedText = '';
        while ((tm = tRegex.exec(rangeInner)) !== null) {
          selectedText += decodeXmlEntities(tm[1]);
        }
        comment.selectedText = selectedText.trim();
      }
    }

    // 2. Point comments without explicit range: fallback to nearby run text
    for (const [id, comment] of commentsMap.entries()) {
      if (!comment.selectedText) {
        const refRegex = new RegExp(`<w:r(?:\s[^>]*)?>[\\s\\S]*?<w:commentReference\\s+[^>]*w:id="${id}"[\\s\\S]*?<\\/w:r>`);
        const refMatch = docXml.match(refRegex);
        if (refMatch) {
          // Look backwards for the preceding run's text
          const beforeRef = docXml.substring(Math.max(0, refMatch.index! - 500), refMatch.index!);
          const prevRuns = [...beforeRef.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)];
          if (prevRuns.length > 0) {
            comment.selectedText = decodeXmlEntities(prevRuns[prevRuns.length - 1][1]).trim();
          }
        }
      }
    }
  }

  return Array.from(commentsMap.values());
}

/**
 * Associates extracted comments with their corresponding contract clauses.
 */
export function bindCommentsToClauses(
  comments: DocxCommentItem[],
  clauses: ContractClauseNode[]
): void {
  if (!comments || comments.length === 0 || !clauses || clauses.length === 0) return;

  for (const comment of comments) {
    if (!comment.selectedText) {
      // If no selected text, associate with first clause by default
      if (clauses.length > 0) {
        comment.clauseIndex = 0;
        comment.clauseNumber = clauses[0].clauseNumber;
        clauses[0].comments = clauses[0].comments || [];
        clauses[0].comments.push(comment);
      }
      continue;
    }

    // Find the clause that contains the selected text
    let matchedClause: ContractClauseNode | undefined;
    for (const clause of clauses) {
      if (clause.content && clause.content.includes(comment.selectedText)) {
        matchedClause = clause;
        break;
      }
    }

    // If exact match not found, try fuzzy match on first 12 characters
    if (!matchedClause && comment.selectedText.length >= 6) {
      const sub = comment.selectedText.slice(0, 12);
      matchedClause = clauses.find((c) => c.content && c.content.includes(sub));
    }

    if (matchedClause) {
      const clauseIdx = parseInt(matchedClause.id.replace('clause-', ''), 10);
      comment.clauseIndex = isNaN(clauseIdx) ? 0 : clauseIdx;
      comment.clauseNumber = matchedClause.clauseNumber;
      matchedClause.comments = matchedClause.comments || [];
      matchedClause.comments.push(comment);
    } else if (clauses.length > 0) {
      comment.clauseIndex = 0;
      comment.clauseNumber = clauses[0].clauseNumber;
      clauses[0].comments = clauses[0].comments || [];
      clauses[0].comments.push(comment);
    }
  }
}
