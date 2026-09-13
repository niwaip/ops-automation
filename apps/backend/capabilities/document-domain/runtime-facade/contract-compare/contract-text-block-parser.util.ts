import type { DocumentBlock } from './contract-compare.types';

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
    /^(\d+(?:\.\d+)+|[（\(](?:[0-9一二三四五六七八九十a-zA-Z]+)[）\)]|[一二三四五六七八九十]+[、\.]|[0-9a-zA-Z][)）\.、])\s*(.*)$/;

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
      /[\u4e00-\u9fa5\u3040-\u30ff]/.test(prevChar) ||
      /[\u4e00-\u9fa5\u3040-\u30ff]/.test(nextChar);
    return isCjk ? prev + next : `${prev} ${next}`;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isPreamble) {
      // 1. Heading in Preamble: e.g. # 软件定制开发主协议
      if (/^#{1,6}\s+/.test(line)) {
        flushPreambleMetadata();
        const headingText = line.replace(/^#{1,6}\s+/, '').replace(/\*\*/g, '').trim();
        blocks.push({
          id: `blk-${blocks.length}`,
          type: 'heading',
          primaryText: headingText,
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
    }

    // Check list item prefix: e.g. 1.1, 3.1.1, (1), （一）
    const listMatch = line.match(LIST_PREFIX_REGEX);
    if (listMatch) {
      flushPreambleMetadata();
      const prefix = listMatch[1].trim();
      const bodyText = listMatch[2].replace(/\*\*/g, '').trim();
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

    // Continuation line vs new paragraph
    flushPreambleMetadata();
    if (currentBlock && currentBlock.type === 'list_item' && currentBlock.primaryText !== undefined) {
      currentBlock.primaryText = joinLines(currentBlock.primaryText, line);
    } else if (currentBlock && currentBlock.type === 'paragraph' && currentBlock.primaryText !== undefined) {
      // If previous line didn't end with sentence terminator, merge as continuation
      if (!/[。！？；:：]$/.test(currentBlock.primaryText) && currentBlock.primaryText.length < 200) {
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
      normalizedLines.push(`${b.prefix ? `${b.prefix} ` : ''}${b.primaryText || ''}`);
    } else if (b.type === 'table' && b.tableData) {
      for (const row of b.tableData.rows) {
        normalizedLines.push(`| ${row.join(' | ')} |`);
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
