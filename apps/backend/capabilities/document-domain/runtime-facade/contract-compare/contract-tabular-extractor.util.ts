import type { DocumentBlock, TableCellItem } from './contract-compare.types';

/**
 * Regex matching detailed commercial quotation / work breakdown row in contracts & annexes.
 * e.g. "1.1 Prones 系统改造费用 一式 35,400.00 35,400.00 6% ..."
 */
export const COMMERCIAL_TABLE_ROW_REGEX =
  /^(\d+\.\d+)\s+(.+?)\s+([一\d]+式|\d+)\s+([-\d,]+\.\d{2})\s+([-\d,]+\.\d{2})\s+(\d+[%％])\s*(.*)$/;

/**
 * Regex matching simple quotation item row.
 * e.g. "1 Prones 系统改造费用 作业费用 一式 154,000.00"
 */
export const SIMPLE_QUOTE_ROW_REGEX =
  /^(\d+)\s+(.+?)\s+([一\d]+式|\d+)\s+([-\d,]+\.\d{2})\s*(.*)$/;

/**
 * Regex matching summary/total rows in commercial tables.
 * e.g. "小计 164,000.00", "特别折扣 -10,000.00", "总合计（含税） 154,000.00", "6%税率（不含税） 145,283.02"
 */
export const COMMERCIAL_SUMMARY_ROW_REGEX =
  /^(小计|特别折扣|总合计|合计|总计|税额|税率|\d+[%％]税率)[\s（(]*([^）)]*)[）)]*[\s:：]+([-\d,]+\.\d{2}|[-\d,]+)/;

export interface ExtractedTableResult {
  tableBlock: DocumentBlock;
  consumedLines: number;
}

/**
 * Attempt to extract a structured commercial table (quotation, work breakdown, or fee schedule)
 * from a sequence of text lines starting at startIndex.
 */
export function tryExtractCommercialTable(
  lines: string[],
  startIndex: number
): ExtractedTableResult | null {
  let i = startIndex;
  const firstLine = lines[i]?.trim() || '';

  const isDirectDetailedRow = COMMERCIAL_TABLE_ROW_REGEX.test(firstLine);
  const isDirectSimpleRow = SIMPLE_QUOTE_ROW_REGEX.test(firstLine);
  const isHeader =
    /(?:明细|作业费用|项目|规格).*?(?:单价|总价|金额|报价).*?(?:税率|备注|备考)/.test(firstLine) ||
    /Ｎｏ\s+.*?(?:项目|备考)/.test(firstLine);

  if (!isDirectDetailedRow && !isDirectSimpleRow && !isHeader) {
    return null;
  }

  // Detect whether table is simple quote (4-5 cols) or detailed breakdown (7-8 cols)
  const isSimpleQuoteHeader = /报价金额/.test(firstLine) || (!firstLine.includes('单价') && !firstLine.includes('总价'));

  if (isHeader) {
    i++;
  }

  const rows: TableCellItem[][] = [];
  let currentItem: {
    no: string;
    item: string;
    qty: string;
    unitPrice?: string;
    totalPrice: string;
    taxRate?: string;
    remark: string;
    isDetailed: boolean;
  } | null = null;

  let rowCount = 0;
  let hasDetailedRows = false;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    const detailedMatch = line.match(COMMERCIAL_TABLE_ROW_REGEX);
    if (detailedMatch) {
      hasDetailedRows = true;
      if (currentItem) {
        pushCurrentItem(rows, currentItem);
        rowCount++;
      }
      currentItem = {
        no: detailedMatch[1],
        item: detailedMatch[2],
        qty: detailedMatch[3],
        unitPrice: detailedMatch[4],
        totalPrice: detailedMatch[5],
        taxRate: detailedMatch[6],
        remark: detailedMatch[7] || '',
        isDetailed: true,
      };
      i++;
      continue;
    }

    const simpleMatch = !hasDetailedRows ? line.match(SIMPLE_QUOTE_ROW_REGEX) : null;
    if (simpleMatch) {
      if (currentItem) {
        pushCurrentItem(rows, currentItem);
        rowCount++;
      }
      currentItem = {
        no: simpleMatch[1],
        item: simpleMatch[2],
        qty: simpleMatch[3],
        totalPrice: simpleMatch[4],
        remark: simpleMatch[5] || '',
        isDetailed: false,
      };
      i++;
      continue;
    }

    const summaryMatch = line.match(COMMERCIAL_SUMMARY_ROW_REGEX);
    if (summaryMatch) {
      if (currentItem) {
        pushCurrentItem(rows, currentItem);
        currentItem = null;
        rowCount++;
      }
      const label = summaryMatch[1] + (summaryMatch[2] ? `（${summaryMatch[2]}）` : '');
      const amount = summaryMatch[3];
      if (hasDetailedRows) {
        rows.push([
          { text: label, colSpan: 4 },
          { text: amount },
          { text: '' },
          { text: '' },
        ]);
      } else {
        rows.push([
          { text: label, colSpan: 3 },
          { text: amount },
          { text: '' },
        ]);
      }
      rowCount++;
      i++;
      continue;
    }

    // Accumulating remark lines for the current item
    if (currentItem) {
      if (
        /^[■#]/.test(line) ||
        /^[一二三四五六七八九十百]+[、.]/.test(line) ||
        /^第[一二三四五六七八九十百\d]+[条章节]/.test(line) ||
        /^\d+）明细/.test(line) ||
        /^(?:项\s*作业费用|Ｎｏ)/.test(line)
      ) {
        break;
      }
      currentItem.remark += (currentItem.remark ? '\n' : '') + line;
      i++;
      continue;
    }

    break;
  }

  if (currentItem) {
    pushCurrentItem(rows, currentItem);
    rowCount++;
  }

  if (rowCount < 2) {
    return null;
  }

  const headers = hasDetailedRows
    ? ['序号', '作业明细项', '数量', '单价 (RMB)', '总价 (RMB)', '税率', '备注与服务规格']
    : ['No', '项目', '数量', '报价金额 (RMB)', '备考'];

  const tableBlock: DocumentBlock = {
    id: `blk-table-${startIndex}`,
    type: 'table',
    tableData: {
      headers,
      rows,
    },
  };

  return {
    tableBlock,
    consumedLines: i - startIndex,
  };
}

function pushCurrentItem(
  rows: TableCellItem[][],
  item: {
    no: string;
    item: string;
    qty: string;
    unitPrice?: string;
    totalPrice: string;
    taxRate?: string;
    remark: string;
    isDetailed: boolean;
  }
) {
  if (item.isDetailed) {
    rows.push([
      item.no,
      item.item,
      item.qty,
      item.unitPrice || '',
      item.totalPrice,
      item.taxRate || '',
      item.remark,
    ]);
  } else {
    rows.push([item.no, item.item, item.qty, item.totalPrice, item.remark]);
  }
}
