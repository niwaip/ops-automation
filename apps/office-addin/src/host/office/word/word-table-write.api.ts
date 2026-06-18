import {
  formatWordTableCellParagraphSnapshot,
  formatWordTableRowSnapshot,
  getWordTableCellByColumn,
  loadWordTableRowCells,
  replaceWordTableCellTextPreservingParagraphs,
} from '../shared/document-file';
import { WordReadAPI } from './word-read.api';

export const WordTableWriteAPI = {
  async replaceTableCellText(
    tableIndex: number,
    rowIndex: number,
    cellIndex: number,
    replacementText: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const tables = context.document.body.tables;
        tables.load('items');
        await context.sync();

        if (tableIndex < 0 || tableIndex >= tables.items.length) {
          WordReadAPI.emitDebugLog(
            'error',
            '普通表格单元格写入失败',
            `表格: ${tableIndex}\n行: ${rowIndex}\n列: ${cellIndex}\n原因: 表格索引越界`
          );
          resolve(false);
          return;
        }

        const table = tables.items[tableIndex];
        const rows = table.rows;
        rows.load('items');
        await context.sync();

        if (rowIndex < 0 || rowIndex >= rows.items.length) {
          WordReadAPI.emitDebugLog(
            'error',
            '普通表格单元格写入失败',
            `表格: ${tableIndex}\n行: ${rowIndex}\n列: ${cellIndex}\n原因: 目标行不存在`
          );
          resolve(false);
          return;
        }

        const targetRow = rows.items[rowIndex];
        const rowCells = await loadWordTableRowCells(context, targetRow);
        const targetCell = getWordTableCellByColumn(rowCells, cellIndex);
        if (!targetCell) {
          WordReadAPI.emitDebugLog(
            'error',
            '普通表格单元格写入失败',
            [
              `表格: ${tableIndex}`,
              `行: ${rowIndex}`,
              `列: ${cellIndex}`,
              `目标行内容: ${formatWordTableRowSnapshot(rowCells)}`,
              '原因: 未找到可写入单元格',
            ].join('\n')
          );
          resolve(false);
          return;
        }

        const updated = await replaceWordTableCellTextPreservingParagraphs(context, targetCell, {
          replacementText,
        });
        if (!updated.updated) {
          WordReadAPI.emitDebugLog(
            'warn',
            '普通表格单元格写入未完成',
            [
              `表格: ${tableIndex}`,
              `行: ${rowIndex}`,
              `请求列: ${cellIndex}`,
              `实际命中列: ${updated.debugInfo.cellIndex}`,
              `写入内容: ${replacementText || '(empty)'}`,
              `目标行列索引: ${rowCells.map((cell) => Number(cell.cellIndex || 0)).join(', ') || '(none)'}`,
              '目标单元格原始段落:',
              formatWordTableCellParagraphSnapshot(updated.debugInfo.beforeParagraphTexts),
              '目标单元格内容段落:',
              formatWordTableCellParagraphSnapshot(updated.debugInfo.contentParagraphTextsBefore),
              `命中目标段落: p${updated.debugInfo.targetParagraphIndex}`,
              `是否追加新段落: ${updated.debugInfo.appendNewParagraph ? 'yes' : 'no'}`,
              '目标单元格写入后段落:',
              formatWordTableCellParagraphSnapshot(updated.debugInfo.afterParagraphTexts),
            ].join('\n')
          );
        }
        resolve(updated.updated);
      }).catch((error) => {
        console.warn('replaceTableCellText error:', error);
        WordReadAPI.emitDebugLog(
          'error',
          '普通表格单元格写入异常',
          [
            `表格: ${tableIndex}`,
            `行: ${rowIndex}`,
            `列: ${cellIndex}`,
            `写入内容: ${replacementText || '(empty)'}`,
            error instanceof Error ? error.message : String(error),
          ].join('\n')
        );
        resolve(false);
      });
    });
  },
};
