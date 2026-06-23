import { WordAPI } from '../word/api';

function hasZipHeader(base64: string): boolean {
  try {
    const decoded = atob(base64.substring(0, 100));
    return decoded.substring(0, 2) === 'PK';
  } catch (error) {
    console.warn('base64 zip header验证失败:', error);
    return false;
  }
}

export const DocumentFileAPI = {
  async getFileContentBase64(): Promise<string> {
    const documentWithContentApi = Office.context.document as Office.Document & {
      getFileContentAsync?: (
        fileType: Office.FileType,
        callback: (result: Office.AsyncResult<string | ArrayBuffer>) => void
      ) => void;
    };

    if (!documentWithContentApi.getFileContentAsync) {
      throw new Error('getFileContentAsync不支持');
    }

    return new Promise((resolve, reject) => {
      documentWithContentApi.getFileContentAsync?.(
        Office.FileType.Compressed,
        (result: Office.AsyncResult<string | ArrayBuffer>) => {
          if (result.status !== Office.AsyncResultStatus.Succeeded) {
            console.warn('getFileContentAsync失败:', result.error?.message);
            reject(new Error(result.error?.message || 'getFileContentAsync失败'));
            return;
          }

          const data = result.value;
          const dataLength =
            typeof data === 'string'
              ? data.length
              : data instanceof ArrayBuffer
                ? data.byteLength
                : 0;
          console.log(
            'getFileContentAsync成功，数据类型:',
            typeof data,
            'isArrayBuffer:',
            data instanceof ArrayBuffer,
            '长度:',
            dataLength
          );

          let base64: string;
          if (typeof data === 'string') {
            base64 = data;
          } else if (data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(data);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            base64 = btoa(binary);
          } else {
            base64 = String(data);
          }

          resolve(base64);
        }
      );
    });
  },

  async getCompressedDocumentBase64(): Promise<string> {
    return new Promise((resolve, reject) => {
      const SLICE_SIZE = 4194304;

      Office.context.document.getFileAsync(
        Office.FileType.Compressed,
        { sliceSize: SLICE_SIZE },
        (result) => {
          console.log('getFileAsync result:', result.status, 'sliceSize:', SLICE_SIZE);

          if (result.status !== Office.AsyncResultStatus.Succeeded) {
            const errorMsg = result.error?.message || '未知错误';
            console.error('获取文件失败:', errorMsg);
            reject(new Error(`获取文件失败: ${errorMsg}`));
            return;
          }

          const file = result.value;
          const sliceCount = file.sliceCount;
          console.log('sliceCount:', sliceCount);

          if (sliceCount === 0) {
            file.closeAsync();
            reject(new Error('文件切片数为0'));
            return;
          }

          const slices: string[] = [];
          let failedSlices = 0;

          const getSlice = (sliceIndex: number) => {
            if (sliceIndex >= sliceCount) {
              if (failedSlices > 0) {
                file.closeAsync();
                reject(new Error(`${failedSlices}个切片获取失败`));
                return;
              }

              file.closeAsync();
              const fullBase64 = slices.join('');
              console.log(`获取文件成功，共${sliceCount}个切片，base64长度: ${fullBase64.length}`);
              console.log(`base64前50字符: ${fullBase64.substring(0, 50)}`);

              try {
                const decoded = atob(fullBase64.substring(0, 100));
                console.log('解码后前10字节:', decoded.substring(0, 10));
                console.log('是否PK开头:', decoded.substring(0, 2) === 'PK');

                if (decoded.substring(0, 2) !== 'PK') {
                  console.warn('警告：返回的数据不是有效的压缩 Office 文件（无PK header）');
                }
              } catch (e) {
                console.warn('base64验证失败:', e);
              }

              resolve(fullBase64);
              return;
            }

            file.getSliceAsync(sliceIndex, (sliceResult) => {
              console.log(`getSliceAsync(${sliceIndex}) result:`, sliceResult.status);

              if (sliceResult.status === Office.AsyncResultStatus.Succeeded) {
                const sliceData = sliceResult.value.data;
                console.log(
                  `slice ${sliceIndex} data type:`,
                  typeof sliceData,
                  'isArrayBuffer:',
                  sliceData instanceof ArrayBuffer,
                  'length:',
                  sliceData?.length
                );

                let base64Slice: string;

                if (typeof sliceData === 'string') {
                  base64Slice = sliceData;
                } else if (sliceData instanceof ArrayBuffer) {
                  const bytes = new Uint8Array(sliceData);
                  let binary = '';
                  for (let i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                  }
                  base64Slice = btoa(binary);
                  console.log(
                    `slice ${sliceIndex} converted from ArrayBuffer to base64, length:`,
                    base64Slice.length
                  );
                } else if (sliceData && typeof sliceData === 'object') {
                  try {
                    const bytes = new Uint8Array(sliceData as any);
                    let binary = '';
                    for (let i = 0; i < bytes.length; i++) {
                      binary += String.fromCharCode(bytes[i]);
                    }
                    base64Slice = btoa(binary);
                  } catch (e) {
                    console.warn(`slice ${sliceIndex} data format unknown, treating as string`);
                    base64Slice = String(sliceData);
                  }
                } else {
                  console.error(`slice ${sliceIndex} data is null or undefined`);
                  failedSlices++;
                  getSlice(sliceIndex + 1);
                  return;
                }

                slices.push(base64Slice);
                getSlice(sliceIndex + 1);
              } else {
                failedSlices++;
                const errorMsg = sliceResult.error?.message || '未知错误';
                console.error(`获取切片${sliceIndex}失败:`, errorMsg);
                getSlice(sliceIndex + 1);
              }
            });
          };

          getSlice(0);
        }
      );
    });
  },
};

function escapeWordRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractWordLoopArrayPath(value: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  const loopMatch = normalized.match(/\{#([^}]+)\}/u);
  if (loopMatch?.[1]) {
    return loopMatch[1].trim().replace(/\[(?:i(?:\+\d+)?)?\]$/u, '');
  }

  const variableMatch = normalized
    .replace(/[{}]/g, '')
    .match(/^(d\.[A-Za-z_][A-Za-z0-9_.]*)\[(?:i(?:\+\d+)?)?\]\.[A-Za-z_][A-Za-z0-9_]*$/u);
  if (variableMatch?.[1]) {
    return variableMatch[1].trim();
  }

  return normalized
    .replace(/[{}]/g, '')
    .replace(/\[(?:i(?:\+\d+)?)?\]$/u, '')
    .trim();
}

function stripWordLoopMarkers(value: string, arrayPath: string): string {
  const normalizedArrayPath = extractWordLoopArrayPath(arrayPath);
  if (!normalizedArrayPath) {
    return String(value || '');
  }

  const startMarker = `{#${normalizedArrayPath}}`;
  const endMarker = `{/${normalizedArrayPath}}`;
  return String(value || '')
    .replace(new RegExp(escapeWordRegExp(startMarker), 'gu'), '')
    .replace(new RegExp(escapeWordRegExp(endMarker), 'gu'), '')
    .trim();
}

export async function withWordTargetTableRow<T>(
  context: Word.RequestContext,
  tableIndex: number,
  sourceRowIndex: number,
  callback: (
    targetRow: Word.TableRow,
    metadata: { columnCount: number; targetRowIndex: number }
  ) => Promise<T>,
  options?: { suppressLocateLog?: boolean }
): Promise<T | null> {
  const tables = context.document.body.tables;
  tables.load('items');
  await context.sync();

  if (tableIndex < 0 || tableIndex >= tables.items.length) {
    return null;
  }

  const table = tables.items[tableIndex];
  const rows = table.rows;
  rows.load('items');
  await context.sync();

  if (sourceRowIndex < 0 || sourceRowIndex >= rows.items.length) {
    return null;
  }

  const sourceRow = rows.items[sourceRowIndex];
  const sourceCells = sourceRow.cells;
  sourceCells.load('items');
  await context.sync();

  const columnCount = Math.max(sourceCells.items.length || 0, 1);
  for (const cell of sourceCells.items) {
    cell.load('cellIndex');
    cell.body.load('text');
  }
  await context.sync();

  if (!options?.suppressLocateLog) {
    WordAPI.emitDebugLog(
      'debug',
      '循环表格定位目标行',
      [
        `表格: ${tableIndex}`,
        `源行: ${sourceRowIndex}`,
        `当前总行数: ${rows.items.length}`,
        `列数: ${columnCount}`,
        `源行内容: ${formatWordTableRowSnapshot(sourceCells.items)}`,
      ].join('\n')
    );
  }

  let targetRowIndex = sourceRowIndex + 1;

  if (targetRowIndex >= rows.items.length) {
    try {
      const emptyRowValues = [Array.from({ length: columnCount }, () => '')];
      const tableWithAddRows = table as unknown as {
        addRows?: (insertLocation?: string, rowCount?: number, values?: string[][]) => void;
      };
      if (typeof tableWithAddRows.addRows === 'function') {
        tableWithAddRows.addRows('After', 1, emptyRowValues);
        await context.sync();
        rows.load('items');
        await context.sync();
        WordAPI.emitDebugLog(
          'debug',
          '循环表格已尝试创建下一行',
          `表格: ${tableIndex}\n源行: ${sourceRowIndex}\n创建后总行数: ${rows.items.length}`
        );
      }
    } catch (error) {
      console.warn('withWordTargetTableRow addRows error:', error);
      WordAPI.emitDebugLog(
        'warn',
        '循环表格创建下一行失败',
        `表格: ${tableIndex}\n源行: ${sourceRowIndex}\n${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (targetRowIndex >= rows.items.length) {
    WordAPI.emitDebugLog(
      'error',
      '循环表格未找到可写入的下一行',
      [
        `表格: ${tableIndex}`,
        `源行: ${sourceRowIndex}`,
        `当前总行数: ${rows.items.length}`,
        '已停止应用，避免回退覆盖源行/表头行。',
      ].join('\n')
    );
    return null;
  }

  const targetRow = rows.items[targetRowIndex];
  if (!targetRow) {
    WordAPI.emitDebugLog(
      'error',
      '循环表格目标行不存在',
      `表格: ${tableIndex}\n源行: ${sourceRowIndex}\n目标行: ${targetRowIndex}`
    );
    return null;
  }

  return callback(targetRow, { columnCount, targetRowIndex });
}

export async function loadWordTableRowCells(
  context: Word.RequestContext,
  row: Word.TableRow
): Promise<Word.TableCell[]> {
  const cells = row.cells;
  cells.load('items');
  await context.sync();

  for (const cell of cells.items) {
    cell.load('cellIndex');
    cell.body.load('text');
  }
  await context.sync();

  return cells.items;
}

function formatWordTableCellSnapshot(cell: Word.TableCell): string {
  const cellIndex = Number(cell.cellIndex || 0);
  const rawText = String(cell.body.text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const normalizedText = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' / ');
  return `[c${cellIndex}] ${normalizedText || '(blank)'}`;
}

export function formatWordTableCellParagraphSnapshot(paragraphTexts: string[]): string {
  if (!paragraphTexts.length) {
    return '(no paragraphs)';
  }
  return paragraphTexts
    .map(
      (text, index) =>
        `p${index}: ${JSON.stringify(
          String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
        )}`
    )
    .join('\n');
}

export function formatWordTableRowSnapshot(cells: Word.TableCell[]): string {
  if (!cells.length) {
    return '(empty row)';
  }
  return cells
    .slice()
    .sort((left, right) => Number(left.cellIndex || 0) - Number(right.cellIndex || 0))
    .map((cell) => formatWordTableCellSnapshot(cell))
    .join(' | ');
}

async function loadWordTableCellParagraphs(
  context: Word.RequestContext,
  cell: Word.TableCell
): Promise<Array<{ paragraph: Word.Paragraph; text: string }>> {
  const paragraphs = cell.body.paragraphs;
  paragraphs.load('items');
  await context.sync();

  for (const paragraph of paragraphs.items) {
    paragraph.load('text');
  }
  await context.sync();

  return paragraphs.items.map((paragraph) => ({
    paragraph,
    text: String(paragraph.text || ''),
  }));
}

export function getWordTableCellByColumn(
  cells: Word.TableCell[],
  columnIndex: number
): Word.TableCell | null {
  if (!cells.length) {
    return null;
  }

  const exactMatch = cells.find((cell) => Number(cell.cellIndex) === columnIndex);
  if (exactMatch) {
    return exactMatch;
  }

  const sorted = [...cells].sort(
    (left, right) =>
      Math.abs(Number(left.cellIndex || 0) - columnIndex) -
      Math.abs(Number(right.cellIndex || 0) - columnIndex)
  );
  return sorted[0] || null;
}

function findWordFirstNonEmptyParagraphIndex(paragraphTexts: string[]): number {
  const matchIndex = paragraphTexts.findIndex((text) => String(text || '').trim().length > 0);
  return matchIndex >= 0 ? matchIndex : 0;
}

function findWordLastNonEmptyParagraphIndex(paragraphTexts: string[]): number {
  for (let index = paragraphTexts.length - 1; index >= 0; index -= 1) {
    if (String(paragraphTexts[index] || '').trim().length > 0) {
      return index;
    }
  }
  return Math.max(paragraphTexts.length - 1, 0);
}

function findWordReplacementParagraphIndex(
  paragraphTexts: string[],
  replacementText: string
): number {
  const normalizedReplacement = String(replacementText || '').trim();
  if (!normalizedReplacement) {
    return findWordFirstNonEmptyParagraphIndex(paragraphTexts);
  }

  const existingIndex = paragraphTexts.findIndex(
    (text) => String(text || '').trim() === normalizedReplacement
  );
  if (existingIndex >= 0) {
    return existingIndex;
  }

  const fieldLeaf = normalizedReplacement.replace(/[{}]/g, '').split('.').pop() || '';

  if (/_((cn)|(zh)|(zhcn))$/iu.test(fieldLeaf)) {
    return 0;
  }
  if (/_((jp)|(ja))$/iu.test(fieldLeaf)) {
    return paragraphTexts.length > 1 ? 1 : 0;
  }
  if (/_en$/iu.test(fieldLeaf)) {
    return paragraphTexts.length > 2 ? 2 : Math.max(paragraphTexts.length - 1, 0);
  }

  const emptyIndex = paragraphTexts.findIndex((text) => String(text || '').trim().length === 0);
  if (emptyIndex >= 0) {
    return emptyIndex;
  }

  return findWordLastNonEmptyParagraphIndex(paragraphTexts);
}

function shouldAppendWordReplacementParagraph(
  paragraphTexts: string[],
  replacementText: string,
  targetIndex: number
): boolean {
  const normalizedReplacement = String(replacementText || '').trim();
  if (!normalizedReplacement) {
    return false;
  }

  if (paragraphTexts.some((text) => String(text || '').trim() === normalizedReplacement)) {
    return false;
  }

  if (paragraphTexts.some((text) => String(text || '').trim().length === 0)) {
    return false;
  }

  const currentTargetText = String(paragraphTexts[targetIndex] || '').trim();
  if (!currentTargetText) {
    return false;
  }

  return currentTargetText !== normalizedReplacement;
}

function splitWordReplacementParagraphs(replacementText: string): string[] {
  const normalizedText = String(replacementText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const parts = normalizedText
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : [String(replacementText || '').trim()];
}

function isWordMarkerOnlyParagraph(text: string, marker: string): boolean {
  return String(text || '').trim() === marker;
}

type WordTableCellReplacementResult = {
  updated: boolean;
  debugInfo: {
    cellIndex: number;
    arrayPath: string;
    replacementText: string;
    includeStart: boolean;
    includeEnd: boolean;
    beforeParagraphTexts: string[];
    contentParagraphTextsBefore: string[];
    targetParagraphIndex: number;
    appendNewParagraph: boolean;
    afterParagraphTexts: string[];
  };
};

export async function replaceWordTableCellTextPreservingParagraphs(
  context: Word.RequestContext,
  cell: Word.TableCell,
  options: {
    replacementText?: string;
    arrayPath?: string;
    includeStart?: boolean;
    includeEnd?: boolean;
  }
): Promise<WordTableCellReplacementResult> {
  const normalizedArrayPath = extractWordLoopArrayPath(options.arrayPath || '');
  const startMarker = normalizedArrayPath ? `{#${normalizedArrayPath}}` : '';
  const endMarker = normalizedArrayPath ? `{/${normalizedArrayPath}}` : '';
  const paragraphEntries = await loadWordTableCellParagraphs(context, cell);
  const cellIndex = Number(cell.cellIndex || 0);
  const normalizedReplacement = String(options.replacementText || '').trim();

  if (paragraphEntries.length === 0) {
    const fallbackValue = normalizedArrayPath
      ? buildWordLoopWrappedCellText({
          existingText: String(cell.body.text || ''),
          replacementText: options.replacementText,
          arrayPath: normalizedArrayPath,
          includeStart: Boolean(options.includeStart),
          includeEnd: Boolean(options.includeEnd),
        })
      : String(options.replacementText || '');
    cell.value = fallbackValue;
    await context.sync();
    return {
      updated: true,
      debugInfo: {
        cellIndex,
        arrayPath: normalizedArrayPath,
        replacementText: normalizedReplacement,
        includeStart: Boolean(options.includeStart),
        includeEnd: Boolean(options.includeEnd),
        beforeParagraphTexts: [],
        contentParagraphTextsBefore: [],
        targetParagraphIndex: 0,
        appendNewParagraph: false,
        afterParagraphTexts: fallbackValue ? [fallbackValue] : [],
      },
    };
  }

  const paragraphStates = paragraphEntries.map((entry) => ({
    paragraph: entry.paragraph,
    originalText: entry.text,
    cleanedText: normalizedArrayPath
      ? stripWordLoopMarkers(entry.text, normalizedArrayPath)
      : entry.text,
    isStartMarkerOnly: Boolean(startMarker) && isWordMarkerOnlyParagraph(entry.text, startMarker),
    isEndMarkerOnly: Boolean(endMarker) && isWordMarkerOnlyParagraph(entry.text, endMarker),
  }));

  const contentParagraphs = paragraphStates.filter(
    (entry) => !entry.isStartMarkerOnly && !entry.isEndMarkerOnly
  );
  const contentParagraphTexts = contentParagraphs.map((entry) => entry.cleanedText);
  const beforeParagraphTexts = paragraphEntries.map((entry) => entry.text);
  const contentParagraphTextsBefore = [...contentParagraphTexts];
  let targetParagraphIndex = findWordFirstNonEmptyParagraphIndex(contentParagraphTextsBefore);
  let appendNewParagraph = false;

  if (typeof options.replacementText === 'string') {
    const replacementParagraphs = splitWordReplacementParagraphs(options.replacementText);
    targetParagraphIndex = findWordReplacementParagraphIndex(
      contentParagraphTexts,
      replacementParagraphs[0] || options.replacementText
    );
    if (replacementParagraphs.length <= 1) {
      appendNewParagraph = shouldAppendWordReplacementParagraph(
        contentParagraphTexts,
        normalizedReplacement,
        targetParagraphIndex
      );
      if (appendNewParagraph) {
        contentParagraphTexts.push(normalizedReplacement);
      } else {
        contentParagraphTexts[targetParagraphIndex] = normalizedReplacement;
      }
    } else {
      replacementParagraphs.forEach((paragraphText, paragraphOffset) => {
        const destinationIndex = targetParagraphIndex + paragraphOffset;
        if (destinationIndex < contentParagraphTexts.length) {
          contentParagraphTexts[destinationIndex] = paragraphText;
          return;
        }
        contentParagraphTexts.push(paragraphText);
        appendNewParagraph = true;
      });
    }
  }

  contentParagraphs.forEach((entry, index) => {
    const nextText = contentParagraphTexts[index] ?? '';
    if (nextText === entry.originalText) {
      return;
    }
    const paragraphRange = entry.paragraph.getRange(Word.RangeLocation.content);
    paragraphRange.insertText(nextText, Word.InsertLocation.replace);
  });

  if (contentParagraphTexts.length > contentParagraphs.length) {
    let insertAnchor: any =
      contentParagraphs[contentParagraphs.length - 1]?.paragraph ||
      paragraphEntries[paragraphEntries.length - 1]?.paragraph;
    const cellBody = cell.body as any;
    for (let index = contentParagraphs.length; index < contentParagraphTexts.length; index += 1) {
      const paragraphText = contentParagraphTexts[index];
      if (!paragraphText) {
        continue;
      }

      if (typeof cellBody.insertParagraph === 'function') {
        insertAnchor = cellBody.insertParagraph(paragraphText, 'End');
        continue;
      }

      if (insertAnchor && typeof insertAnchor.insertParagraph === 'function') {
        insertAnchor = insertAnchor.insertParagraph(paragraphText, 'After');
      }
    }
  }

  const existingStartMarkerParagraph = paragraphStates.find((entry) => entry.isStartMarkerOnly);
  if (startMarker) {
    if (options.includeStart) {
      if (existingStartMarkerParagraph) {
        if (existingStartMarkerParagraph.originalText !== startMarker) {
          existingStartMarkerParagraph.paragraph
            .getRange(Word.RangeLocation.content)
            .insertText(startMarker, Word.InsertLocation.replace);
        }
      } else {
        const cellBody = cell.body as any;
        if (typeof cellBody.insertParagraph === 'function') {
          cellBody.insertParagraph(startMarker, 'Start');
        } else {
          const firstContentParagraph: any =
            contentParagraphs[0]?.paragraph || paragraphEntries[0]?.paragraph;
          if (
            firstContentParagraph &&
            typeof firstContentParagraph.insertParagraph === 'function'
          ) {
            firstContentParagraph.insertParagraph(startMarker, 'Before');
          }
        }
      }
    } else if (existingStartMarkerParagraph) {
      existingStartMarkerParagraph.paragraph
        .getRange(Word.RangeLocation.whole)
        .insertText('', Word.InsertLocation.replace);
    }
  }

  const existingEndMarkerParagraph = paragraphStates.find((entry) => entry.isEndMarkerOnly);
  if (endMarker) {
    if (options.includeEnd) {
      if (existingEndMarkerParagraph) {
        if (existingEndMarkerParagraph.originalText !== endMarker) {
          existingEndMarkerParagraph.paragraph
            .getRange(Word.RangeLocation.content)
            .insertText(endMarker, Word.InsertLocation.replace);
        }
      } else {
        const cellBody = cell.body as any;
        if (typeof cellBody.insertParagraph === 'function') {
          cellBody.insertParagraph(endMarker, 'End');
        } else {
          const lastContentParagraph: any =
            contentParagraphs[contentParagraphs.length - 1]?.paragraph ||
            paragraphEntries[paragraphEntries.length - 1]?.paragraph;
          if (lastContentParagraph && typeof lastContentParagraph.insertParagraph === 'function') {
            lastContentParagraph.insertParagraph(endMarker, 'After');
          }
        }
      }
    } else if (existingEndMarkerParagraph) {
      existingEndMarkerParagraph.paragraph
        .getRange(Word.RangeLocation.whole)
        .insertText('', Word.InsertLocation.replace);
    }
  }

  await context.sync();
  const afterParagraphEntries = await loadWordTableCellParagraphs(context, cell);
  return {
    updated: true,
    debugInfo: {
      cellIndex,
      arrayPath: normalizedArrayPath,
      replacementText: normalizedReplacement,
      includeStart: Boolean(options.includeStart),
      includeEnd: Boolean(options.includeEnd),
      beforeParagraphTexts,
      contentParagraphTextsBefore,
      targetParagraphIndex,
      appendNewParagraph,
      afterParagraphTexts: afterParagraphEntries.map((entry) => entry.text),
    },
  };
}

function buildWordLoopWrappedCellText(options: {
  existingText: string;
  replacementText?: string;
  arrayPath: string;
  includeStart: boolean;
  includeEnd: boolean;
}): string {
  const normalizedArrayPath = extractWordLoopArrayPath(options.arrayPath);
  const cleanContent = stripWordLoopMarkers(options.existingText, normalizedArrayPath);
  const contentLines = cleanContent
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (typeof options.replacementText === 'string') {
    const normalizedReplacement = String(options.replacementText || '').trim();
    if (!normalizedReplacement) {
      // keep existing content lines
    } else if (!contentLines.includes(normalizedReplacement)) {
      contentLines.push(normalizedReplacement);
    }
  }

  if (!normalizedArrayPath) {
    return contentLines.join('\n');
  }

  if (options.includeStart) {
    contentLines.unshift(`{#${normalizedArrayPath}}`);
  }
  if (options.includeEnd) {
    contentLines.push(`{/${normalizedArrayPath}}`);
  }

  return contentLines.join('\n');
}

/**
 * Word 操作
 */

export { hasZipHeader };
