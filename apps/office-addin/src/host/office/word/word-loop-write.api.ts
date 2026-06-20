import {
  extractWordLoopArrayPath,
  formatWordTableCellParagraphSnapshot,
  formatWordTableRowSnapshot,
  getWordTableCellByColumn,
  loadWordTableRowCells,
  replaceWordTableCellTextPreservingParagraphs,
  withWordTargetTableRow,
} from '../shared/document-file';
import { WordReadAPI } from './word-read.api';

export const WordLoopWriteAPI = {
  async applyLoopTableMarkersOnNextRow(
    tableIndex: number,
    rowIndex: number,
    arrayPath: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const normalizedArrayPath = extractWordLoopArrayPath(arrayPath);
        if (!normalizedArrayPath) {
          WordReadAPI.emitDebugLog(
            'warn',
            '循环表格标记跳过',
            `表格: ${tableIndex}\n源行: ${rowIndex}\n原因: arrayPath 为空`
          );
          resolve(false);
          return;
        }

        const updated = await withWordTargetTableRow(
          context,
          tableIndex,
          rowIndex,
          async (targetRow, { columnCount, targetRowIndex }) => {
            const beforeCells = await loadWordTableRowCells(context, targetRow);
            const beforeSummary = formatWordTableRowSnapshot(beforeCells);
            const targetCells = beforeCells;
            const firstCell = getWordTableCellByColumn(targetCells, 0);
            const lastCell = getWordTableCellByColumn(targetCells, Math.max(columnCount - 1, 0));

            if (!firstCell || !lastCell) {
              WordReadAPI.emitDebugLog(
                'error',
                '循环表格标记失败',
                [
                  `表格: ${tableIndex}`,
                  `源行: ${rowIndex}`,
                  `目标行: ${targetRowIndex}`,
                  `目标行内容: ${beforeSummary}`,
                  '原因: 未找到首列或末列单元格',
                ].join('\n')
              );
              return false;
            }

            await replaceWordTableCellTextPreservingParagraphs(context, firstCell, {
              arrayPath: normalizedArrayPath,
              includeStart: true,
              includeEnd: firstCell === lastCell,
            });

            if (lastCell !== firstCell) {
              await replaceWordTableCellTextPreservingParagraphs(context, lastCell, {
                arrayPath: normalizedArrayPath,
                includeEnd: true,
                includeStart: false,
              });
            }

            const afterCells = await loadWordTableRowCells(context, targetRow);
            WordReadAPI.emitDebugLog(
              'debug',
              '循环表格标记已写入',
              [
                `表格: ${tableIndex}`,
                `源行: ${rowIndex}`,
                `目标行: ${targetRowIndex}`,
                `arrayPath: ${normalizedArrayPath}`,
                `写入前: ${beforeSummary}`,
                `写入后: ${formatWordTableRowSnapshot(afterCells)}`,
              ].join('\n')
            );
            return true;
          }
        );

        resolve(Boolean(updated));
      }).catch((error) => {
        console.warn('applyLoopTableMarkersOnNextRow error:', error);
        resolve(false);
      });
    });
  },

  async replaceTableCellTextOnNextRow(
    tableIndex: number,
    rowIndex: number,
    cellIndex: number,
    replacementText: string,
    arrayPath?: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const normalizedArrayPath = extractWordLoopArrayPath(arrayPath || '');

        const updated = await withWordTargetTableRow(
          context,
          tableIndex,
          rowIndex,
          async (targetRow, { columnCount, targetRowIndex }) => {
            const beforeCells = await loadWordTableRowCells(context, targetRow);
            const beforeSummary = formatWordTableRowSnapshot(beforeCells);
            const targetCells = beforeCells;
            const targetCell = getWordTableCellByColumn(targetCells, cellIndex);
            if (!targetCell) {
              WordReadAPI.emitDebugLog(
                'error',
                '循环表格列写入失败',
                [
                  `表格: ${tableIndex}`,
                  `源行: ${rowIndex}`,
                  `目标行: ${targetRowIndex}`,
                  `目标列: ${cellIndex}`,
                  `目标行内容: ${beforeSummary}`,
                  '原因: 未找到目标单元格',
                ].join('\n')
              );
              return false;
            }

            const replaced = await replaceWordTableCellTextPreservingParagraphs(
              context,
              targetCell,
              {
                replacementText,
                arrayPath: normalizedArrayPath || undefined,
                includeStart: cellIndex <= 0,
                includeEnd: cellIndex >= Math.max(columnCount - 1, 0),
              }
            );
            const afterCells = await loadWordTableRowCells(context, targetRow);
            if (!replaced.updated) {
              WordReadAPI.emitDebugLog(
                'warn',
                '循环表格列写入未完成',
                [
                  `表格: ${tableIndex}`,
                  `源行: ${rowIndex}`,
                  `目标行: ${targetRowIndex}`,
                  `请求列: ${cellIndex}`,
                  `实际命中列: ${replaced.debugInfo.cellIndex}`,
                  `arrayPath: ${normalizedArrayPath || '(none)'}`,
                  `写入内容: ${replacementText || '(empty)'}`,
                  `目标行列索引: ${targetCells.map((cell) => Number(cell.cellIndex || 0)).join(', ') || '(none)'}`,
                  `includeStart: ${replaced.debugInfo.includeStart ? 'yes' : 'no'}`,
                  `includeEnd: ${replaced.debugInfo.includeEnd ? 'yes' : 'no'}`,
                  `写入前行: ${beforeSummary}`,
                  `写入后行: ${formatWordTableRowSnapshot(afterCells)}`,
                  '目标单元格原始段落:',
                  formatWordTableCellParagraphSnapshot(replaced.debugInfo.beforeParagraphTexts),
                  '目标单元格内容段落:',
                  formatWordTableCellParagraphSnapshot(
                    replaced.debugInfo.contentParagraphTextsBefore
                  ),
                  `命中目标段落: p${replaced.debugInfo.targetParagraphIndex}`,
                  `是否追加新段落: ${replaced.debugInfo.appendNewParagraph ? 'yes' : 'no'}`,
                  '目标单元格写入后段落:',
                  formatWordTableCellParagraphSnapshot(replaced.debugInfo.afterParagraphTexts),
                ].join('\n')
              );
            }
            return replaced.updated;
          },
          { suppressLocateLog: true }
        );

        resolve(Boolean(updated));
      }).catch((error) => {
        console.warn('replaceTableCellTextOnNextRow error:', error);
        resolve(false);
      });
    });
  },
};
