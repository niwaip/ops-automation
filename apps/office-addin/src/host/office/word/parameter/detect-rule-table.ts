import { extractWordParamName } from './anchor';
import { findSampleMatchForWordParam } from './sample';
import type { WordDetectedParam, WordTableCellLike } from './types';
import { safeWordRuleText } from '../shared/text';

/**
 * Word 表格参数识别规则。
 *
 * 当前规则要点：
 * 1. 先按 tableIndex / rowIndex 重建表格二维行结构，再逐表分析。
 * 2. 优先识别“左右对照表”：仅对空白单元格取同一行左侧最近标签作为参数名。
 * 3. 左侧标签支持换行、多语、斜杠分隔等拆分；拆分后逐个生成参数候选。
 * 4. 若未命中对照表规则，再识别“循环表”：首行像表头，第二行满足数据行或模板行特征时，从表头生成列参数。
 * 5. 表头双语场景会尽量推断 zh / ja 语言顺序，写入 languageHint 以辅助后续去重和展示。
 */

export type WordTableDetectionDebugEntry = {
  tableIndex: number;
  tableType: 'loop' | 'comparison' | 'unknown';
  reason: string;
  rowSummaries: string[];
  cellDiagnostics: string[];
  generatedParamCount: number;
};

function splitRawWordTableCellLines(text: string): string[] {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n+/u)
    .map((line) => safeWordRuleText(line))
    .filter(Boolean);
}

function inferWordRuleTextLanguageHint(text: string): 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' {
  const value = String(text || '').trim();
  if (!value) {
    return 'unknown';
  }

  const hasKana = /[\u3040-\u30ff]/u.test(value);
  const hasCjk = /[\u4e00-\u9fff]/u.test(value);
  const hasLatin = /[A-Za-z]/u.test(value);

  if (hasKana) {
    return 'ja';
  }
  if (hasCjk && hasLatin) {
    return 'mixed';
  }
  if (hasCjk) {
    return 'zh';
  }
  if (hasLatin) {
    return 'en';
  }

  return 'unknown';
}

function inferWordLoopHeaderLineLanguageOrder<T extends WordTableCellLike>(headerRow: T[]): Array<'zh' | 'ja'> | null {
  let zhJaPairCount = 0;
  let jaZhPairCount = 0;
  const lineStats = new Map<number, { zh: number; ja: number }>();

  headerRow.forEach((cell) => {
    const lineHints = splitRawWordTableCellLines(cell.text).map((line) => inferWordRuleTextLanguageHint(line));
    if (lineHints[0] === 'zh' && lineHints[1] === 'ja') {
      zhJaPairCount += 1;
    } else if (lineHints[0] === 'ja' && lineHints[1] === 'zh') {
      jaZhPairCount += 1;
    }

    lineHints.forEach((hint, lineIndex) => {
      if (hint !== 'zh' && hint !== 'ja') {
        return;
      }
      const current = lineStats.get(lineIndex) || { zh: 0, ja: 0 };
      current[hint] += 1;
      lineStats.set(lineIndex, current);
    });
  });

  if (zhJaPairCount > jaZhPairCount) {
    return ['zh', 'ja'];
  }
  if (jaZhPairCount > zhJaPairCount) {
    return ['ja', 'zh'];
  }

  const firstLine = lineStats.get(0);
  const secondLine = lineStats.get(1);
  if (firstLine && secondLine) {
    const firstHint = firstLine.zh > firstLine.ja ? 'zh' : (firstLine.ja > firstLine.zh ? 'ja' : undefined);
    const secondHint = secondLine.zh > secondLine.ja ? 'zh' : (secondLine.ja > secondLine.zh ? 'ja' : undefined);
    if (firstHint && secondHint && firstHint !== secondHint) {
      return [firstHint, secondHint];
    }
  }

  return null;
}

export function isBlankWordTableCellText(text: string): boolean {
  const normalized = String(text || '')
    .replace(/[\u00a0\s　]/gu, '')
    .replace(/[＿_]+/gu, '')
    .trim();
  return normalized.length === 0;
}

export function isLikelyWordTableLabel(text: string, maxLength = 48): boolean {
  const normalized = safeWordRuleText(text).replace(/[：:]$/u, '');
  if (!normalized || normalized.length > maxLength || isBlankWordTableCellText(normalized)) {
    return false;
  }
  if (/[。；;]/u.test(normalized)) {
    return false;
  }
  return true;
}

export function splitWordTableCellLines(text: string): string[] {
  return safeWordRuleText(text)
    .split(/\n+/u)
    .map((line) => safeWordRuleText(line))
    .filter(Boolean);
}

export function buildWordTableRows<T extends WordTableCellLike>(
  tableCells: T[],
): Array<{ tableIndex: number; rows: T[][] }> {
  const rowsByTable = new Map<number, Map<number, T[]>>();

  tableCells.forEach((cell) => {
    const rowMap = rowsByTable.get(cell.tableIndex) || new Map<number, T[]>();
    const rowCells = rowMap.get(cell.rowIndex) || [];
    rowCells.push(cell);
    rowMap.set(cell.rowIndex, rowCells);
    rowsByTable.set(cell.tableIndex, rowMap);
  });

  return Array.from(rowsByTable.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([tableIndex, rowMap]) => ({
      tableIndex,
      rows: Array.from(rowMap.entries())
        .sort((left, right) => left[0] - right[0])
        .map(([, rowCells]) => [...rowCells].sort((left, right) => left.cellIndex - right.cellIndex)),
    }));
}

function isLikelyWordLoopHeaderRow<T extends WordTableCellLike>(row: T[]): boolean {
  const headerTexts = row.map((cell) => safeWordRuleText(cell.text)).filter(Boolean);
  return headerTexts.length >= 2 && headerTexts.every((text) => isLikelyWordTableLabel(text));
}

function countWordNonEmptyCellsAcrossHeader<T extends WordTableCellLike>(row: T[], headerRow: T[]): number {
  return headerRow.reduce((count, headerCell) => {
    const currentCell = row.find((cell) => cell.cellIndex === headerCell.cellIndex);
    return count + (!isBlankWordTableCellText(currentCell?.text || '') ? 1 : 0);
  }, 0);
}

function countWordBlankCellsAcrossHeader<T extends WordTableCellLike>(row: T[], headerRow: T[]): number {
  return headerRow.reduce((count, headerCell) => {
    const currentCell = row.find((cell) => cell.cellIndex === headerCell.cellIndex);
    return count + (isBlankWordTableCellText(currentCell?.text || '') ? 1 : 0);
  }, 0);
}

function isLikelyWordLoopDataRow<T extends WordTableCellLike>(row: T[], headerRow: T[]): boolean {
  const requiredNonEmptyCount = Math.max(2, Math.ceil(headerRow.length * 0.5));
  return countWordNonEmptyCellsAcrossHeader(row, headerRow) >= requiredNonEmptyCount;
}

function isLikelyWordLoopTemplateRow<T extends WordTableCellLike>(row: T[], headerRow: T[]): boolean {
  const requiredBlankCount = Math.max(2, Math.ceil(headerRow.length * 0.5));
  return countWordBlankCellsAcrossHeader(row, headerRow) >= requiredBlankCount;
}

export function isStandardWordLoopTableRows<T extends WordTableCellLike>(rows: T[][]): boolean {
  if (rows.length < 2) {
    return false;
  }

  const headerRow = rows[0] || [];
  if (!isLikelyWordLoopHeaderRow(headerRow)) {
    return false;
  }

  return rows.slice(1).some((row) =>
    isLikelyWordLoopDataRow(row, headerRow) || isLikelyWordLoopTemplateRow(row, headerRow)
  );
}

function splitWordTableParamLabels(text: string): string[] {
  const rawText = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!rawText.trim()) {
    return [];
  }

  const lineParts = rawText
    .split(/\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const baseParts = lineParts.length > 0 ? lineParts : [rawText];

  const normalizedParts = baseParts.flatMap((part) => {
    const safePart = safeWordRuleText(part);
    if (!safePart) {
      return [];
    }
    if (/[\/／|｜]/u.test(safePart)) {
      const splitParts = safePart.split(/[\/／|｜]/u).map((item) => safeWordRuleText(item)).filter(Boolean);
      if (splitParts.length >= 2) {
        return splitParts;
      }
    }
    return [safePart];
  });

  const labels = normalizedParts
    .map((part) => part.replace(/[：:]$/u, '').trim())
    .filter((part) => isLikelyWordTableLabel(part));

  if (baseParts.length >= 2) {
    return labels;
  }

  return labels.filter((part, index, array) => array.indexOf(part) === index);
}

function findNearestWordTableLeftLabelCell<T extends WordTableCellLike>(row: T[], cellIndex: number): T | undefined {
  return [...row]
    .filter((item) => item.cellIndex < cellIndex && isLikelyWordTableLabel(item.text, 32))
    .sort((left, right) => right.cellIndex - left.cellIndex)[0];
}

function pushDetectedWordTableParam(
  params: WordDetectedParam[],
  sampleText: string,
  param: WordDetectedParam,
): void {
  params.push({
    ...param,
    ...findSampleMatchForWordParam(sampleText, param),
  });
}

function pushWordLoopTemplateParams<T extends WordTableCellLike>(
  params: WordDetectedParam[],
  sampleText: string,
  tableIndex: number,
  headerRow: T[],
): void {
  const headerLineLanguageOrder = inferWordLoopHeaderLineLanguageOrder(headerRow);
  headerRow.forEach((cell) => {
    const labels = splitWordTableParamLabels(cell.text);
    const rawLines = splitRawWordTableCellLines(cell.text);
    labels.forEach((anchorText, labelIndex) => {
      const directLineHint = inferWordRuleTextLanguageHint(rawLines[labelIndex] || '');
      const fallbackLineHint = headerLineLanguageOrder?.[labelIndex];
      const languageHint = (
        directLineHint === 'zh' || directLineHint === 'ja'
          ? directLineHint
          : fallbackLineHint
      );
      const param: WordDetectedParam = {
        id: `table-loop-${tableIndex}-${cell.rowIndex}-${cell.cellIndex}-${labelIndex}`,
        sourceType: 'table-cell',
        paragraphIndex: -1,
        start: 0,
        end: 0,
        rawText: cell.text || '',
        underlineType: 'table-loop-column',
        anchorText,
        localAnchorText: anchorText,
        parameterSlot: `${anchorText}[参数]`,
        paramName: extractWordParamName(anchorText),
        paragraphText: `${anchorText}\t${cell.text || ''}`,
        sourceBlockId: cell.sourceBlockId,
        tableIndex,
        rowIndex: cell.rowIndex,
        cellIndex: cell.cellIndex,
        languageHint,
      };
      pushDetectedWordTableParam(params, sampleText, param);
    });
  });
}

function summarizeWordTableRow<T extends WordTableCellLike>(row: T[]): string {
  return row
    .map((cell) => `[${cell.cellIndex}] ${safeWordRuleText(cell.text) || '(blank)'}`)
    .join(' | ');
}

function countWordFilledHeaderCells<T extends WordTableCellLike>(row: T[], headerRow: T[]): number {
  return headerRow.reduce((count, headerCell) => {
    const currentCell = row.find((cell) => cell.cellIndex === headerCell.cellIndex);
    return count + (isBlankWordTableCellText(currentCell?.text || '') ? 0 : 1);
  }, 0);
}

export function analyzeWordTableParams(
  tableCells: WordTableCellLike[],
  sampleText = '',
  includeDebug = false,
): { params: WordDetectedParam[]; debugEntries: WordTableDetectionDebugEntry[] } {
  const params: WordDetectedParam[] = [];
  const debugEntries: WordTableDetectionDebugEntry[] = [];
  const tableRows = buildWordTableRows(tableCells);

  tableRows.forEach(({ tableIndex, rows }) => {
    const rowSummaries = includeDebug
      ? rows.map((row, rowIndex) => `row ${rowIndex}: ${summarizeWordTableRow(row)}`)
      : [];
    const cellDiagnostics: string[] = [];
    const paramsBeforeTable = params.length;

    if (rows.length === 0) {
      debugEntries.push({
        tableIndex,
        tableType: 'unknown',
        reason: '表格没有可用单元格',
        rowSummaries,
        cellDiagnostics,
        generatedParamCount: 0,
      });
      return;
    }

    const headerRow = rows[0] || [];
    const headerIsLoopLike = isLikelyWordLoopHeaderRow(headerRow);
    const firstDataRow = rows[1] || [];
    const firstDataFilledCount = countWordFilledHeaderCells(firstDataRow, headerRow);
    const firstDataBlankCount = countWordBlankCellsAcrossHeader(firstDataRow, headerRow);
    const comparisonParams: WordDetectedParam[] = [];

    if (includeDebug) {
      cellDiagnostics.push(
        `table type check: headerIsLoopLike=${headerIsLoopLike ? 'yes' : 'no'} ; secondRowFilled=${firstDataFilledCount}/${headerRow.length || 0} ; secondRowBlank=${firstDataBlankCount}/${headerRow.length || 0}`
      );
    }

    rows.forEach((row, rowIndex) => {
      row.forEach((cell) => {
        const cellText = safeWordRuleText(cell.text);
        if (!isBlankWordTableCellText(cell.text)) {
          if (includeDebug) {
            cellDiagnostics.push(`row ${rowIndex} col ${cell.cellIndex}: 非空单元格 ${JSON.stringify(cellText)} -> 跳过`);
          }
          return;
        }

        const leftLabelCell = findNearestWordTableLeftLabelCell(row, cell.cellIndex);
        if (!leftLabelCell) {
          if (includeDebug) {
            cellDiagnostics.push(`row ${rowIndex} col ${cell.cellIndex}: 空白，但左侧未找到标签 -> 跳过`);
          }
          return;
        }

        const labels = splitWordTableParamLabels(leftLabelCell.text);
        if (labels.length === 0) {
          if (includeDebug) {
            cellDiagnostics.push(
              `row ${rowIndex} col ${cell.cellIndex}: 左侧 ${JSON.stringify(leftLabelCell.text)} 未拆出有效参数名 -> 跳过`
            );
          }
          return;
        }

        if (includeDebug) {
          cellDiagnostics.push(
            `row ${rowIndex} col ${cell.cellIndex}: 空白，左侧 ${JSON.stringify(leftLabelCell.text)} -> 参数 ${labels.join(' / ')}`
          );
        }

        const rawLines = splitRawWordTableCellLines(leftLabelCell.text);
        labels.forEach((title, titleIndex) => {
          const directLineHint = inferWordRuleTextLanguageHint(rawLines[titleIndex] || '');
          const languageHint = (
            directLineHint === 'zh' || directLineHint === 'ja'
              ? directLineHint
              : rawLines.length === labels.length && labels.length === 2
                ? (titleIndex === 0 ? 'zh' : 'ja')
                : undefined
          );
          const param: WordDetectedParam = {
            id: `table-cell-${tableIndex}-${cell.rowIndex}-${cell.cellIndex}-${titleIndex}`,
            sourceType: 'table-cell',
            paragraphIndex: -1,
            start: 0,
            end: 0,
            rawText: cell.text || '',
            underlineType: 'table-cell-empty',
            anchorText: title,
            localAnchorText: title,
            parameterSlot: `${title}[参数]`,
            paramName: extractWordParamName(title),
            paragraphText: `${title}\t${cell.text || ''}`,
            sourceBlockId: cell.sourceBlockId,
            tableIndex,
            rowIndex: cell.rowIndex,
            cellIndex: cell.cellIndex,
            languageHint,
          };
          comparisonParams.push({
            ...param,
            ...findSampleMatchForWordParam(sampleText, param),
          });
        });
      });
    });

    const dedupedComparisonParams = comparisonParams.filter((param, index, array) => {
      const key = `${param.sourceType}|${param.tableIndex}|${param.rowIndex}|${param.cellIndex}|${param.underlineType}|${param.paramName}|${param.languageHint || ''}`;
      return array.findIndex((item) => (
        `${item.sourceType}|${item.tableIndex}|${item.rowIndex}|${item.cellIndex}|${item.underlineType}|${item.paramName}|${item.languageHint || ''}`
      ) === key) === index;
    });
    if (dedupedComparisonParams.length > 0) {
      params.push(...dedupedComparisonParams);
      debugEntries.push({
        tableIndex,
        tableType: 'comparison',
        reason: '命中了左右对照表规则，只对空白单元格查找左侧标签',
        rowSummaries,
        cellDiagnostics,
        generatedParamCount: dedupedComparisonParams.length,
      });
      return;
    }

    const loopMatched = headerIsLoopLike
      && (
        isLikelyWordLoopDataRow(firstDataRow, headerRow)
        || isLikelyWordLoopTemplateRow(firstDataRow, headerRow)
      );
    if (loopMatched) {
      pushWordLoopTemplateParams(params, sampleText, tableIndex, headerRow);
      if (includeDebug) {
        headerRow.forEach((cell) => {
          const labels = splitWordTableParamLabels(cell.text);
          cellDiagnostics.push(
            `header cell c${cell.cellIndex}: ${JSON.stringify(cell.text)} -> ${labels.length > 0 ? labels.join(' / ') : '未拆出参数'}`
          );
        });
      }
      debugEntries.push({
        tableIndex,
        tableType: 'loop',
        reason: `未命中对照表规则，且首行像参数标签；第二行满足循环特征（filled=${firstDataFilledCount}/${headerRow.length || 0}, blank=${firstDataBlankCount}/${headerRow.length || 0}）`,
        rowSummaries,
        cellDiagnostics,
        generatedParamCount: params.length - paramsBeforeTable,
      });
      return;
    }

    debugEntries.push({
      tableIndex,
      tableType: 'unknown',
      reason: '未命中左右对照表规则，也未满足循环表特征',
      rowSummaries,
      cellDiagnostics,
      generatedParamCount: 0,
    });
  });

  return {
    params,
    debugEntries,
  };
}

export function detectWordTableParams(
  tableCells: WordTableCellLike[],
  sampleText = '',
): WordDetectedParam[] {
  return analyzeWordTableParams(tableCells, sampleText, false).params;
}
