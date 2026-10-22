import type { DocumentBlock } from './contract-compare.types';
import { tryExtractCommercialTable } from './contract-tabular-extractor.util';

/**
 * Universal Legal Text Block Parser:
 * Intelligently converts raw plain-text lines of a contract clause into high-fidelity DocumentBlocks:
 * - Preamble key-values (合同编号, 甲方, 乙方, 签署日期) -> key_value_grid
 * - Hierarchical numbered sub-clauses (1.1, 3.1.1, (1), （一）, 一、) -> list_item with prefix
 * - Seamlessly joins wrapped continuation lines without breaking sentences or losing hanging indentation
 */
export function buildDocumentBlocksFromText(
  rawContent: string,
  isPreamble: boolean
): { content: string; blocks: DocumentBlock[] } {
  if (!rawContent || !rawContent.trim()) {
    return { content: '', blocks: [] };
  }

  const rawLines = rawContent.split(/\r?\n/);
  const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { content: '', blocks: [] };
  }

  const blocks: DocumentBlock[] = [];
  const preambleMetadata: Array<{ key: string; value: string }> = [];

  const LIST_PREFIX_REGEX =
    /^(\d+(?:\.\d+)+|[（(](?:\d{1,2}|[一二三四五六七八九十]{1,3}|[ivxIVX]+|[a-zA-Z])[）)]|[一二三四五六七八九十]{1,3}[、.]|(?:\d{1,2}|[a-zA-Z])[)）.、]|[■◆●▶★])\s*(.*)$/;

  let currentBlock: DocumentBlock | null = null;

  const flushPreambleMetadata = () => {
    if (preambleMetadata.length > 0) {
      blocks.push({
        id: `blk-${blocks.length}`,
        type: 'key_value_grid',
        metadata: [...preambleMetadata],
      });
      preambleMetadata.length = 0;
    }
  };

  const joinLines = (prev: string, next: string): string => {
    if (!prev) return next;
    const prevChar = prev.slice(-1);
    const nextChar = next.slice(0, 1);
    const isCjk =
      /[\u4e00-\u9fa5\u3040-\u30ff\u3000-\u303f\uff00-\uffef]/.test(prevChar) ||
      /[\u4e00-\u9fa5\u3040-\u30ff\u3000-\u303f\uff00-\uffef]/.test(nextChar);
    return isCjk ? prev + next : `${prev} ${next}`;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isPreamble) {
      // 1. Heading in Preamble: Markdown header or leading standalone document title
      const isFirstContentLine = blocks.length === 0 && preambleMetadata.length === 0;
      const isDocumentTitle =
        isFirstContentLine &&
        !line.includes('：') &&
        !line.includes(':') &&
        line.length <= 50 &&
        !LIST_PREFIX_REGEX.test(line) &&
        !/^[-—_*]{3,}$/.test(line);

      if (/^#{1,6}\s+/.test(line) || isDocumentTitle) {
        flushPreambleMetadata();
        const headingText = line.replace(/^#{1,6}\s+/, '').replace(/\*\*/g, '').trim();
        blocks.push({
          id: `blk-${blocks.length}`,
          type: 'heading',
          primaryText: headingText,
          alignment: 'center',
          isBold: true,
        });
        currentBlock = null;
        continue;
      }

      // 2. Horizontal divider
      if (/^[-—_*]{3,}$/.test(line)) {
        flushPreambleMetadata();
        currentBlock = null;
        continue;
      }

      // 3. Preamble Key-Value line: e.g. **合同编号**：SW-001 or 甲方：...
      const kvMatch = line.match(/^(\*\*[^*]+\*\*|[^:：]{2,20})[:：]\s*(.*)$/);
      if (kvMatch) {
        const k = kvMatch[1].replace(/\*\*/g, '').trim();
        const v = kvMatch[2].replace(/\*\*/g, '').trim();
        preambleMetadata.push({ key: k, value: v });
        currentBlock = null;
        continue;
      }

      // 4. Multiline continuation of previous preamble Key-Value entry (e.g. wrapped address, bank branch, entity name)
      const isRecitalParagraph =
        /^(?:鉴于|本合同[由经甲乙]|双方(?:经|同意|在|恪守)|根据(?:《|中华人民共和国)|为(?:明确|保证|此)|经双方友好协商)/.test(line);
      const isListItemOrDate =
        LIST_PREFIX_REGEX.test(line) ||
        /^\s*(?:\d{4}\s*年\s*\d{1,2}\s*月|\d{4}[-/.]\d{1,2})/.test(line);

      if (preambleMetadata.length > 0 && !isRecitalParagraph && !isListItemOrDate) {
        const lastMeta = preambleMetadata[preambleMetadata.length - 1];
        if (!/[。！？]$/.test(lastMeta.value)) {
          lastMeta.value = joinLines(lastMeta.value, line);
          continue;
        }
      }
    }

    // Check structured commercial table (quotation / fee schedule in Annex or clause)
    const tableResult = tryExtractCommercialTable(lines, i);
    if (tableResult) {
      flushPreambleMetadata();
      blocks.push(tableResult.tableBlock);
      i += tableResult.consumedLines - 1;
      currentBlock = null;
      continue;
    }

    // Check list item prefix: e.g. 1.1, 3.1.1, (1), （一）, 1.
    const listMatch = line.match(LIST_PREFIX_REGEX);
    if (listMatch) {
      const prefix = listMatch[1].trim();
      const bodyText = listMatch[2].replace(/\*\*/g, '').trim();

      // Guard: if preceding block was mid-sentence (e.g. ended without sentence terminators like 。！？),
      // or if prefix is a sub-level Roman/letter like (ii) while preceding block contains inline (i),
      // treat as inline continuation within the paragraph rather than an artificial standalone list item.
      const isSecondLevelRomanOrLetter = /^[(（]?(?:ii+|iii|iv|v|vi|b|c)[)）.]?$/i.test(prefix);
      const isLevel1ListPrefix = /^(?:[1-9一二三四五六七八九十][)）.、]|[(（][1-9一二三四五六七八九十][)）]|[■◆●▶★])/.test(prefix);
      const isPrecedingKeyValue =
        currentBlock &&
        currentBlock.type === 'paragraph' &&
        currentBlock.primaryText !== undefined &&
        /^[^:：\n]{2,20}[:：]/.test(currentBlock.primaryText);

      const isPrecedingMidSentence =
        currentBlock &&
        currentBlock.type === 'paragraph' &&
        currentBlock.primaryText !== undefined &&
        !isPrecedingKeyValue &&
        !isLevel1ListPrefix &&
        (!/[。！？；:：]$/.test(currentBlock.primaryText) ||
          (isSecondLevelRomanOrLetter && /[(（]i[)）]/i.test(currentBlock.primaryText)));

      if (isPrecedingMidSentence && currentBlock && currentBlock.primaryText !== undefined) {
        currentBlock.primaryText = joinLines(currentBlock.primaryText, line);
        continue;
      }

      flushPreambleMetadata();
      currentBlock = {
        id: `blk-${blocks.length}`,
        type: 'list_item',
        prefix,
        primaryText: bodyText,
      };
      blocks.push(currentBlock);
      continue;
    }

    // Check table row (markdown table: | a | b |)
    if (line.startsWith('|') && line.endsWith('|') && line.includes('|')) {
      flushPreambleMetadata();
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      // Skip separator row |---|---|
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        continue;
      }
      const prevBlock = blocks[blocks.length - 1];
      if (prevBlock && prevBlock.type === 'table' && prevBlock.tableData) {
        prevBlock.tableData.rows.push(cells);
      } else {
        currentBlock = {
          id: `blk-${blocks.length}`,
          type: 'table',
          tableData: { rows: [cells] },
        };
        blocks.push(currentBlock);
      }
      continue;
    }

    // Check standalone date item (e.g. 2026年04月05日)
    const DATE_LINE_REGEX =
      /^\s*(?:\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日?|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s*$/;
    if (DATE_LINE_REGEX.test(line)) {
      flushPreambleMetadata();
      currentBlock = {
        id: `blk-${blocks.length}`,
        type: 'list_item',
        prefix: '•',
        primaryText: line,
      };
      blocks.push(currentBlock);
      continue;
    }

    // Explanatory lead-in ending with colon (e.g. 验收预定日：)
    // Only treat as standalone paragraph if currentBlock was not a list item
    if ((line.endsWith('：') || line.endsWith(':')) && (!currentBlock || currentBlock.type !== 'list_item')) {
      flushPreambleMetadata();
      currentBlock = {
        id: `blk-${blocks.length}`,
        type: 'paragraph',
        primaryText: line,
      };
      blocks.push(currentBlock);
      continue;
    }

    // Continuation line vs new paragraph
    flushPreambleMetadata();
    if (currentBlock && currentBlock.type === 'list_item' && currentBlock.primaryText !== undefined) {
      // Unnumbered continuation line under a list item (e.g. breakdown under item 1, schedule under item 3)
      // Maintains subordination to the parent list item rather than dropping to root margin
      if (/[。！？；:：]$/.test(currentBlock.primaryText)) {
        currentBlock.primaryText += '\n' + line;
      } else {
        currentBlock.primaryText = joinLines(currentBlock.primaryText, line);
      }
    } else if (currentBlock && currentBlock.type === 'paragraph' && currentBlock.primaryText !== undefined) {
      // If previous line didn't end with sentence terminator, merge as continuation
      // Eliminates arbitrary line length caps that tore sentences apart
      const isPrevEnded = /[。！？:：]$/.test(currentBlock.primaryText);
      const isNextDistinct =
        /^[^:：\n]{2,20}[:：]\s*.+$/.test(line) ||
        /^[（(]\s*单位[：:]?[^）)]+[）)]$/.test(line) ||
        line.endsWith('：') ||
        line.endsWith(':');

      if (!isPrevEnded && !isNextDistinct) {
        currentBlock.primaryText = joinLines(currentBlock.primaryText, line);
      } else {
        currentBlock = {
          id: `blk-${blocks.length}`,
          type: 'paragraph',
          primaryText: line,
        };
        blocks.push(currentBlock);
      }
    } else {
      currentBlock = {
        id: `blk-${blocks.length}`,
        type: 'paragraph',
        primaryText: line,
      };
      blocks.push(currentBlock);
    }
  }

  flushPreambleMetadata();

  // Reconstruct normalized clean text from blocks
  const normalizedLines: string[] = [];
  for (const b of blocks) {
    if (b.type === 'heading') {
      normalizedLines.push(`# ${b.primaryText}`);
    } else if (b.type === 'key_value_grid' && b.metadata) {
      for (const m of b.metadata) {
        normalizedLines.push(`**${m.key}**：${m.value}`);
      }
    } else if (b.type === 'list_item') {
      const subLines = (b.primaryText || '').split('\n');
      for (let k = 0; k < subLines.length; k++) {
        if (k === 0) {
          normalizedLines.push(`${b.prefix ? `${b.prefix} ` : ''}${subLines[k]}`);
        } else {
          normalizedLines.push(subLines[k]);
        }
      }
    } else if (b.type === 'table' && b.tableData) {
      for (const row of b.tableData.rows) {
        normalizedLines.push(`| ${row.map((c) => (typeof c === 'string' ? c : c?.text || '')).join(' | ')} |`);
      }
    } else if (b.type === 'paragraph') {
      normalizedLines.push(b.primaryText || '');
    }
  }

  return {
    content: normalizedLines.join('\n'),
    blocks,
  };
}
