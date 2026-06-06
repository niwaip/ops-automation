import { AISuggestion, ExcelSheetPairState, useAppStore } from '../../app/store';
import { ExcelAPI } from '../office/excel/api';
import { HostCapabilities } from './capabilities';
import { Anchor, DocumentElement, DocumentIR, DocumentSelection, TemplateSource } from './document-ir';
import { HostAdapter } from './types';

interface WorkbookSheetSummary {
  name: string;
  index: number;
  address: string;
  rowCount: number;
  columnCount: number;
  tables: Array<{
    name: string;
    address: string;
    headerAddress?: string;
    dataBodyAddress?: string;
  }>;
  values: (string | number | boolean | null)[][];
  formulas: string[][];
}

export class ExcelAdapter implements HostAdapter {
  host = 'excel' as const;

  private getExcelAnchor(suggestion: AISuggestion) {
    return suggestion.details?.excelAnchor;
  }

  private resolveTemplateSheetTarget(
    excelAnchor: NonNullable<AISuggestion['details']>['excelAnchor']
  ): { sheetName?: string; sheetIndex?: number } {
    const pairs = useAppStore.getState().excelSheetPairs;
    const anchorSheetName = excelAnchor?.sheetName;
    const anchorSheetIndex = excelAnchor?.sheetIndex;

    const matchedPair =
      pairs.find((pair) =>
        (anchorSheetName && (pair.leftSheetName === anchorSheetName || pair.rightSheetName === anchorSheetName))
        || (typeof anchorSheetIndex === 'number'
          && (pair.leftSheetIndex === anchorSheetIndex || pair.rightSheetIndex === anchorSheetIndex))
      )
      || pairs.find((pair) => typeof excelAnchor?.pairIndex === 'number' && pair.pairIndex === excelAnchor.pairIndex);

    if (!matchedPair) {
      return {
        sheetName: anchorSheetName,
        sheetIndex: anchorSheetIndex,
      };
    }

    return {
      sheetName: matchedPair.leftSheetName || anchorSheetName,
      sheetIndex: matchedPair.leftSheetIndex ?? anchorSheetIndex,
    };
  }

  private buildDefaultPairs(sheets: WorkbookSheetSummary[]): ExcelSheetPairState[] {
    const pairs: ExcelSheetPairState[] = [];
    const usedSheetIndexes = new Set<number>();

    const byName = new Map<string, WorkbookSheetSummary>();
    for (const sheet of sheets) {
      byName.set(sheet.name, sheet);
    }

    for (const sheet of sheets) {
      if (usedSheetIndexes.has(sheet.index)) {
        continue;
      }

      if (sheet.name.endsWith('_数据')) {
        const baseName = sheet.name.replace(/_数据$/, '');
        const mockSheet = byName.get(baseName);
        if (mockSheet && !usedSheetIndexes.has(mockSheet.index)) {
          const pairIndex = pairs.length;
          pairs.push({
            id: `sheet-pair-${pairIndex}`,
            pairIndex,
            compare: true,
            hidden: false,
            leftSheetName: mockSheet.name,
            leftSheetIndex: mockSheet.index,
            rightSheetName: sheet.name,
            rightSheetIndex: sheet.index,
          });
          usedSheetIndexes.add(mockSheet.index);
          usedSheetIndexes.add(sheet.index);
        }
      }
    }

    const remaining = sheets.filter((sheet) => !usedSheetIndexes.has(sheet.index));
    for (let index = 0; index < remaining.length; index += 2) {
      const leftSheet = remaining[index];
      const rightSheet = remaining[index + 1];
      const pairIndex = pairs.length;
      pairs.push({
        id: `sheet-pair-${pairIndex}`,
        pairIndex,
        compare: true,
        hidden: false,
        leftSheetName: leftSheet?.name,
        leftSheetIndex: leftSheet?.index,
        rightSheetName: rightSheet?.name,
        rightSheetIndex: rightSheet?.index,
      });
    }

    return pairs;
  }

  private getComparablePairs(sheets: WorkbookSheetSummary[]): ExcelSheetPairState[] {
    const configuredPairs = useAppStore.getState().excelSheetPairs;
    const allPairs = configuredPairs.length > 0 ? configuredPairs : this.buildDefaultPairs(sheets);

    return allPairs.filter((pair) => {
      if (!pair.compare || pair.hidden) {
        return false;
      }

      const hasLeftSheet = typeof pair.leftSheetIndex === 'number' && sheets.some((sheet) => sheet.index === pair.leftSheetIndex);
      const hasRightSheet = typeof pair.rightSheetIndex === 'number' && sheets.some((sheet) => sheet.index === pair.rightSheetIndex);
      return hasLeftSheet || hasRightSheet;
    });
  }

  async getCapabilities(): Promise<HostCapabilities> {
    return {
      canExtractDocument: true,
      canExtractSelection: true,
      canPreviewSuggestion: false,
      canApplySuggestion: true,
      canExportTemplateSource: true,
      warnings: ['Excel 预览仍处于基础模式，当前主要支持单元格回写'],
    };
  }

  async extractDocument(): Promise<DocumentIR> {
    const workbookSheets = (await ExcelAPI.getWorkbookSheets()) as WorkbookSheetSummary[];
    const elements: DocumentElement[] = [];
    const anchors: Anchor[] = [];

    const comparablePairs = this.getComparablePairs(workbookSheets);
    let totalRowCount = 0;
    let totalCellCount = 0;
    let includedSheetCount = 0;

    for (const pair of comparablePairs) {
      const pairAnchorId = `excel-sheet-pair-${pair.pairIndex}`;
      const pairSheets = [pair.leftSheetIndex, pair.rightSheetIndex]
        .filter((value): value is number => typeof value === 'number')
        .map((sheetIndex) => workbookSheets.find((sheet) => sheet.index === sheetIndex))
        .filter((sheet): sheet is WorkbookSheetSummary => Boolean(sheet));

      anchors.push({
        id: pairAnchorId,
        type: 'excel-sheet-pair',
        text: `${pair.leftSheetName || '左侧'} ↔ ${pair.rightSheetName || '右侧'}`,
        ref: {
          pairIndex: pair.pairIndex,
          leftSheetIndex: pair.leftSheetIndex,
          leftSheetName: pair.leftSheetName,
          rightSheetIndex: pair.rightSheetIndex,
          rightSheetName: pair.rightSheetName,
        },
      });

      for (const sheet of pairSheets) {
        const sheetRole =
          typeof pair.leftSheetIndex === 'number' && sheet.index === pair.leftSheetIndex
            ? 'mock'
            : typeof pair.rightSheetIndex === 'number' && sheet.index === pair.rightSheetIndex
              ? 'data'
              : sheet.index % 2 === 0
                ? 'mock'
                : 'data';
        const sheetElementId = `excel-sheet-${sheet.index}`;
        includedSheetCount += 1;

        elements.push({
          id: sheetElementId,
          type: 'sheet',
          text: sheet.name,
          anchorIds: [pairAnchorId],
          hostData: {
            sheetIndex: sheet.index,
            sheetName: sheet.name,
            sheetRole,
            pairIndex: pair.pairIndex,
                tableNames: sheet.tables.map((table) => table.name),
                tables: sheet.tables,
            address: sheet.address,
          },
        });

        totalRowCount += sheet.rowCount;
        totalCellCount += sheet.rowCount * sheet.columnCount;

        for (let rowIndex = 0; rowIndex < sheet.values.length; rowIndex += 1) {
          const row = sheet.values[rowIndex];
          for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
            const value = row[colIndex];
            const cellText = value == null ? '' : String(value);
            const cellId = `excel-cell-${sheet.index}-${rowIndex}-${colIndex}`;
            const anchorId = `excel-range-${sheet.index}-${rowIndex}-${colIndex}`;

            elements.push({
              id: cellId,
              type: 'cell',
              text: cellText,
              anchorIds: [anchorId, pairAnchorId],
              hostData: {
                sheetIndex: sheet.index,
                sheetName: sheet.name,
                sheetRole,
                pairIndex: pair.pairIndex,
                rowIndex,
                colIndex,
                formula: sheet.formulas[rowIndex]?.[colIndex] || '',
              },
            });

            anchors.push({
              id: anchorId,
              type: 'excel-range',
              text: cellText,
              ref: {
                sheetIndex: sheet.index,
                sheetName: sheet.name,
                sheetRole,
                pairIndex: pair.pairIndex,
                rowIndex,
                colIndex,
              },
            });
          }
        }
      }
    }

    return {
      host: this.host,
      metadata: {
        title: 'Excel Sheet Pair Analysis',
      },
      elements,
      anchors,
      stats: {
        sheetCount: includedSheetCount,
        sheetPairCount: comparablePairs.length,
        rowCount: totalRowCount,
        cellCount: totalCellCount,
      },
    };
  }

  async extractSelection(): Promise<DocumentSelection | null> {
    const selection = await ExcelAPI.getSelectedRange();
    const firstValue = selection.values[0]?.[0];

    return {
      text: firstValue == null ? '' : String(firstValue),
      hostData: {
        address: selection.address,
        values: selection.values,
      },
    };
  }

  async previewSuggestion(_suggestion: AISuggestion): Promise<void> {
    return Promise.resolve();
  }

  async applySuggestion(suggestion: AISuggestion): Promise<void> {
    const excelAnchor = this.getExcelAnchor(suggestion);
    const targetSheet = excelAnchor ? this.resolveTemplateSheetTarget(excelAnchor) : undefined;

    if (excelAnchor?.type === 'cell' && targetSheet?.sheetName && excelAnchor.address) {
      let marker = suggestion.suggestedName;
      if (!marker.startsWith('{')) {
        marker = marker.startsWith('d.') ? `{${marker}}` : `{d.${marker}}`;
      }
      await ExcelAPI.insertMarkerInSheetCell(
        targetSheet.sheetName,
        excelAnchor.address,
        marker
      );
      return;
    }

    if (excelAnchor?.type === 'table' && targetSheet?.sheetName && excelAnchor.tableName) {
      const arrayPath = suggestion.details?.arrayPath;
      if (!arrayPath) {
        throw new Error('循环建议缺少 arrayPath，无法写回 Excel 表格');
      }

      await ExcelAPI.insertLoopMarkersInTable(
        targetSheet.sheetName,
        excelAnchor.tableName,
        arrayPath,
        suggestion.details?.columnMappings
      );
      return;
    }

    const selection = await ExcelAPI.getSelectedRange();
    await ExcelAPI.insertMarkerInCell(selection.address, suggestion.suggestedName);
  }

  async exportTemplateSource(): Promise<TemplateSource> {
    const result = await ExcelAPI.getWorkbookFileBase64WithFallback();

    return {
      format: 'xlsx',
      content: result.mode === 'json' ? result.content : `base64:${result.content}`,
      mode: result.mode,
      isBinaryFile: result.isValidXlsx,
      warnings:
        result.method === 'json'
          ? ['当前未能导出完整 xlsx 文件，已降级为工作表 JSON 摘要']
          : result.isValidXlsx
            ? []
            : [`工作簿通过 ${result.method} 导出，但结果可能不是完整 xlsx 文件`],
    };
  }
}
