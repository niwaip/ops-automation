export interface PdfJsTextItem {
  str: string;
  dir?: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
  hasEOL?: boolean;
}

export interface ExtractedPdfTable {
  headers: string[];
  rows: string[][];
  tableMarkdown: string;
  headerY: number;
  minY: number;
  tableItems: Set<PdfJsTextItem>;
}

export function normalizePdfText(s: string): string {
  return s.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).trim();
}

export const TABLE_COLUMN_HEADER_REGEX =
  /^(?:项|项目|序号|编号|品名|名称|货物名称|产品名称|服务名称|项目名称|规格|型号|规格型号|数量|单位|单价|总价|金额|报价金额|含税金额|不含税金额|税率|税额|备注|备考|交付物|交付标准|阶段|周期|时间|作业明细|作业费用|No\.?|Item|Description|Spec(?:ification)?|Qty|Quantity|Unit|Price|Unit\s*Price|Total|Total\s*Price|Amount|Rate|Tax\s*Rate|Tax|Remark[s]?|Notes?)(?:\s*[\(（].*?[\)）])?$/i;

export const TABLE_SUMMARY_REGEX =
  /^(?:小计|合计|总计|总合计|合\s*计|折\s*扣|特别折扣|增值税|税\s*额|Subtotal|Total|Grand\s*Total|Discount|[\d.]+%税率)(?:[\(（].*?[\)）])?/i;

/**
 * Universal PDF Multi-Table Extractor:
 * Analyzes 2D geometric distribution of text items on a PDF page,
 * detects candidate table header rows, computes column boundaries from natural horizontal gutters,
 * and groups multi-line cell text and summary rows into structured rows, outputting high-fidelity Markdown tables.
 */
export function tryExtractPdfTables(items: PdfJsTextItem[]): ExtractedPdfTable[] {
  const substantiveItems = items.filter(
    (it) => typeof it?.str === 'string' && it.str.trim().length > 0 && Array.isArray(it.transform)
  );
  if (substantiveItems.length < 5) return [];

  // 1. Group items into horizontal lines (tolerance <= 3.5pt)
  const lineGroups: Array<{ y: number; items: PdfJsTextItem[] }> = [];
  const sortedByYDesc = [...substantiveItems].sort(
    (a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]
  );

  for (const it of sortedByYDesc) {
    const y = it.transform[5];
    const group = lineGroups.find((g) => Math.abs(g.y - y) <= 3.5);
    if (group) {
      group.items.push(it);
      group.items.sort((a, b) => a.transform[4] - b.transform[4]);
    } else {
      lineGroups.push({ y, items: [it] });
    }
  }

  // 2. Identify all candidate table header lines:
  // - >= 3 items spaced horizontally
  // - None of the items contain sentence punctuation (：, ，, 。, ；) or clause numbering (1、, 一、)
  // - None of the items exceed 15 characters
  // - None of the items are standalone numbers or percentages
  // - At least 3 items (or >= 50% of items) match TABLE_COLUMN_HEADER_REGEX
  const headerGroups: Array<{ groupIndex: number; headerGroup: { y: number; items: PdfJsTextItem[] } }> = [];
  for (let i = 0; i < lineGroups.length; i++) {
    const g = lineGroups[i];
    if (g.items.length < 3) continue;
    const lineItems = g.items;
    const hasSentenceOrNumber = lineItems.some((it) => {
      const s = normalizePdfText(it.str);
      return (
        /[：:，,。;；]/.test(s) ||
        /^[0-9]+[、.]|^[一二三四五六七八九十]+[、.]/.test(s) ||
        /^\d+(?:\.\d+)?%?$/.test(s) ||
        /^(?:RMB|USD|EUR|CNY|¥|\$|%|个|套|台|件)$/i.test(s) ||
        s.length > 15
      );
    });
    if (hasSentenceOrNumber) continue;

    const matchedHeaders = lineItems.filter((it) => TABLE_COLUMN_HEADER_REGEX.test(normalizePdfText(it.str)));
    if (matchedHeaders.length >= 3 && matchedHeaders.length >= Math.ceil(lineItems.length * 0.5)) {
      headerGroups.push({ groupIndex: i, headerGroup: g });
    }
  }

  if (headerGroups.length === 0) return [];

  const tables: ExtractedPdfTable[] = [];

  for (let hIdx = 0; hIdx < headerGroups.length; hIdx++) {
    const { headerGroup } = headerGroups[hIdx];
    const headers = headerGroup.items;
    const headerY = headerGroup.y;
    const nextHeaderY =
      hIdx < headerGroups.length - 1 ? headerGroups[hIdx + 1].headerGroup.y : -Infinity;

    // 3. Find candidate lines strictly below header, stopping when non-table content begins
    const candidateLines = lineGroups.filter((g) => g.y < headerY - 3.5 && g.y > nextHeaderY);
    if (candidateLines.length === 0) continue;

    const tableLines: Array<{ y: number; items: PdfJsTextItem[] }> = [];
    let lastLineY = headerY;
    let seenGrandTotal = false;

    for (const line of candidateLines) {
      // If vertical gap between lines > 45pt, table has ended
      if (lastLineY - line.y > 45) {
        break;
      }
      const lineText = line.items.map((it) => it.str).join(' ').trim();
      const normLineText = normalizePdfText(lineText);

      // Non-table indicators: section titles, bullet markers, notes
      const isSectionStart =
        /^(?:[一二三四五六七八九十]+[、.]|第[一二三四五六七八九十0-9]+条|注[：:]|说明[：:]|特别提示|注意事项|落款|甲方[：:]|乙方[：:]|[■●◆▲▼★※☆○◇【])/i.test(
          normLineText
        );
      const hasWideParagraphItem = line.items.some(
        (it) => it.transform[4] < 120 && (it.width || 0) > 180 && !/^\d+(\.\d+)?$/.test(it.str.trim())
      );

      if (isSectionStart || hasWideParagraphItem) {
        break;
      }

      // If already passed grand total line, any subsequent non-summary text terminates the table
      if (seenGrandTotal && !TABLE_SUMMARY_REGEX.test(normLineText)) {
        break;
      }
      if (/^(?:总合计|合计|总计|合\s*计|Grand\s*Total)(?:[\(（].*?[\)）])?/i.test(normLineText)) {
        seenGrandTotal = true;
      }

      tableLines.push(line);
      lastLineY = line.y;
    }

    const tableItems = tableLines.flatMap((l) => l.items);
    if (tableItems.length === 0) continue;

    // 4. Compute dynamic column split boundaries
    const h0 = headers[0];
    const h1 = headers[1];
    const potentialAnchors: Array<{
      anchor: PdfJsTextItem;
      line: { y: number; items: PdfJsTextItem[] };
      nextItem: PdfJsTextItem | null;
    }> = [];

    for (const line of tableLines) {
      const first = line.items[0];
      if (
        first &&
        /^\d+(\.\d+)?$/.test(first.str.trim()) &&
        first.transform[4] < (h1 ? h1.transform[4] : 200)
      ) {
        potentialAnchors.push({
          anchor: first,
          line,
          nextItem: line.items[1] || null,
        });
      }
    }

    const splits: number[] = [];

    // Boundary 0: between Column 0 and Column 1
    if (potentialAnchors.length >= 1 && potentialAnchors[0].nextItem) {
      const maxAnchorRight = Math.max(
        h0.transform[4] + (h0.width || 10),
        ...potentialAnchors.map((p) => p.anchor.transform[4] + (p.anchor.width || 5))
      );
      const minNextLeft = Math.min(
        ...potentialAnchors.filter((p) => p.nextItem).map((p) => p.nextItem!.transform[4])
      );
      if (minNextLeft > maxAnchorRight) {
        splits.push((maxAnchorRight + minNextLeft) / 2);
      } else {
        splits.push((h0.transform[4] + (h0.width || 10) + h1.transform[4]) / 2);
      }
    } else {
      splits.push((h0.transform[4] + (h0.width || 10) + h1.transform[4]) / 2);
    }

    // Boundaries 1 to N-2
    for (let i = 1; i < headers.length - 1; i++) {
      const hA = headers[i];
      const hB = headers[i + 1];
      const hALeft = hA.transform[4];
      const hARight = hALeft + (hA.width || 10);
      const hBLeft = hB.transform[4];
      const hBRight = hBLeft + (hB.width || 10);

      // Collect intervals in the column transition zone
      const relevantItems = [...tableItems, ...headers].filter((it) => {
        const left = it.transform[4];
        const right = left + (it.width || 5);
        return right > hALeft && left < hBRight;
      });

      const intervals = relevantItems
        .map((it) => ({
          left: it.transform[4],
          right: it.transform[4] + (it.width || 5),
        }))
        .sort((a, b) => a.left - b.left);

      const merged: Array<{ left: number; right: number }> = [];
      for (const inv of intervals) {
        if (merged.length === 0) {
          merged.push({ left: inv.left, right: inv.right });
        } else {
          const last = merged[merged.length - 1];
          if (inv.left <= last.right + 2) {
            last.right = Math.max(last.right, inv.right);
          } else {
            merged.push({ left: inv.left, right: inv.right });
          }
        }
      }

      const candidateGaps: Array<{ start: number; end: number; mid: number; width: number }> = [];
      for (let g = 0; g < merged.length - 1; g++) {
        const gStart = merged[g].right;
        const gEnd = merged[g + 1].left;
        if (gEnd - gStart >= 2) {
          candidateGaps.push({ start: gStart, end: gEnd, mid: (gStart + gEnd) / 2, width: gEnd - gStart });
        }
      }

      let chosenSplit: number;
      if (candidateGaps.length === 1) {
        chosenSplit = candidateGaps[0].mid;
      } else if (candidateGaps.length > 1) {
        // Score candidate gaps by minimizing intra-line item collisions in adjacent columns
        const leftBound = splits[i - 1] ?? 0;
        const rightBound = headers[i + 2] ? headers[i + 2].transform[4] : hBRight + 100;
        const headerMid = (hARight + hBLeft) / 2;

        const scored = candidateGaps.map((g) => {
          let collisions = 0;
          for (const line of tableLines) {
            const inA = line.items.filter((it) => it.transform[4] >= leftBound && it.transform[4] < g.mid);
            const inB = line.items.filter((it) => it.transform[4] >= g.mid && it.transform[4] < rightBound);
            if (inA.length > 1) collisions += (inA.length - 1) * 10;
            if (inB.length > 1) collisions += (inB.length - 1) * 10;
          }
          const distToHeaderMid = Math.abs(g.mid - headerMid);
          return { gap: g, penalty: collisions + distToHeaderMid * 0.05 };
        });

        scored.sort((a, b) => a.penalty - b.penalty);
        chosenSplit = scored[0].gap.mid;
      } else {
        chosenSplit = (hARight + hBLeft) / 2;
      }
      splits.push(chosenSplit);
    }

    const columnBounds: Array<{ name: string; left: number; right: number }> = [];
    for (let i = 0; i < headers.length; i++) {
      const left = i === 0 ? 0 : splits[i - 1];
      const right = i === headers.length - 1 ? 99999 : splits[i];
      columnBounds.push({ name: headers[i].str.trim(), left, right });
    }

    // 5. Group items into structured rows (data rows + summary rows)
    const col0 = columnBounds[0];
    const anchors = tableItems.filter(
      (it) =>
        it.transform[4] >= col0.left &&
        it.transform[4] < col0.right &&
        /^\d+(\.\d+)?$/.test(it.str.trim())
    );
    anchors.sort((a, b) => b.transform[5] - a.transform[5]);

    // Separate summary lines
    const summaryLineGroups: Array<{ y: number; items: PdfJsTextItem[] }> = [];
    const regularLineGroups: Array<{ y: number; items: PdfJsTextItem[] }> = [];
    for (const line of tableLines) {
      const lineText = line.items.map((it) => it.str).join(' ').trim();
      if (TABLE_SUMMARY_REGEX.test(normalizePdfText(lineText))) {
        summaryLineGroups.push(line);
      } else {
        regularLineGroups.push(line);
      }
    }

    const regularItems = regularLineGroups.flatMap((l) => l.items);
    const rows: string[][] = [];

    if (anchors.length > 0) {
      for (let r = 0; r < anchors.length; r++) {
        const topY = r === 0 ? headerY : (anchors[r - 1].transform[5] + anchors[r].transform[5]) / 2;
        const bottomY =
          r === anchors.length - 1
            ? (summaryLineGroups.length > 0
                ? Math.max(...summaryLineGroups.map((l) => l.y)) + 1
                : anchors[r].transform[5] - 25)
            : (anchors[r].transform[5] + anchors[r + 1].transform[5]) / 2;

        const rItems = regularItems.filter(
          (it) => it.transform[5] <= topY && it.transform[5] > bottomY
        );
        const cells = columnBounds.map((b) => {
          const cItems = rItems.filter(
            (it) => it.transform[4] >= b.left && it.transform[4] < b.right
          );
          cItems.sort(
            (a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]
          );
          return cItems.map((it) => it.str).join(' ').trim();
        });
        rows.push(cells);
      }

      // Add summary rows in Y order
      summaryLineGroups.sort((a, b) => b.y - a.y);
      for (const sLine of summaryLineGroups) {
        const cells = columnBounds.map((b) => {
          const cItems = sLine.items.filter(
            (it) => it.transform[4] >= b.left && it.transform[4] < b.right
          );
          cItems.sort((a, b) => a.transform[4] - b.transform[4]);
          return cItems.map((it) => it.str).join(' ').trim();
        });
        if (cells.some((c) => c.length > 0)) {
          rows.push(cells);
        }
      }
    } else {
      // Line-by-line fallback when no numeric anchors exist
      for (const line of tableLines) {
        const cells = columnBounds.map((b) => {
          const cItems = line.items.filter(
            (it) => it.transform[4] >= b.left && it.transform[4] < b.right
          );
          cItems.sort((a, b) => a.transform[4] - b.transform[4]);
          return cItems.map((it) => it.str).join(' ').trim();
        });
        if (cells.some((c) => c.length > 0)) {
          rows.push(cells);
        }
      }
    }

    const markdownLines: string[] = [];
    markdownLines.push(`| ${columnBounds.map((b) => b.name).join(' | ')} |`);
    markdownLines.push(`| ${columnBounds.map(() => '---').join(' | ')} |`);
    rows.forEach((r) => markdownLines.push(`| ${r.join(' | ')} |`));

    const allItems = [...headerGroup.items, ...tableItems];
    const minY = Math.min(...allItems.map((it) => it.transform[5]));

    tables.push({
      headers: columnBounds.map((b) => b.name),
      rows,
      tableMarkdown: markdownLines.join('\n'),
      headerY,
      minY,
      tableItems: new Set(allItems),
    });
  }

  return tables;
}

/**
 * Universal PDF Single-Table Extractor (convenience wrapper):
 * Returns the first detected table on the page, or null if none found.
 */
export function tryExtractPdfTable(items: PdfJsTextItem[]): ExtractedPdfTable | null {
  const tables = tryExtractPdfTables(items);
  return tables.length > 0 ? tables[0] : null;
}
