import {
  buildWordContextSearchTexts,
  extractLongestWordBlank,
  pickWordSearchResultByPosition,
} from './word-context-search';

export const WordHighlightAPI = {
  async highlightAtPosition(
    paragraphIndex: number,
    startPos: number,
    endPos: number
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items');
        await context.sync();

        if (paragraphIndex >= paragraphs.items.length) {
          resolve(false);
          return;
        }

        const paragraph = paragraphs.items[paragraphIndex];
        const text = paragraph.text;
        if (startPos > endPos) {
          resolve(false);
          return;
        }

        const highlightText = text.substring(startPos, endPos);
        if (!highlightText) {
          resolve(false);
          return;
        }

        const searchResults = paragraph.search(highlightText, {
          matchCase: false,
          matchWholeWord: false,
        });
        searchResults.load('items');
        await context.sync();

        if (searchResults.items.length > 0) {
          let targetRange =
            pickWordSearchResultByPosition(searchResults.items, text, highlightText, startPos) ||
            searchResults.items[0];

          if (searchResults.items.length > 1) {
            const extendBefore = 4;
            const extendAfter = 4;
            const extendedStart = Math.max(0, startPos - extendBefore);
            const extendedEnd = Math.min(text.length, endPos + extendAfter);
            const extendedText = text.substring(extendedStart, extendedEnd);

            if (extendedText) {
              const extendedSearch = paragraph.search(extendedText, {
                matchCase: true,
                matchWholeWord: false,
              });
              extendedSearch.load('items');
              await context.sync();

              if (extendedSearch.items.length > 0) {
                const foundRange =
                  pickWordSearchResultByPosition(
                    extendedSearch.items,
                    text,
                    extendedText,
                    extendedStart
                  ) || extendedSearch.items[0];
                const nestedSearch = foundRange.search(highlightText, {
                  matchCase: false,
                  matchWholeWord: false,
                });
                nestedSearch.load('items');
                await context.sync();

                if (nestedSearch.items.length > 0) {
                  targetRange =
                    pickWordSearchResultByPosition(
                      nestedSearch.items,
                      extendedText,
                      highlightText,
                      startPos - extendedStart
                    ) || nestedSearch.items[0];
                }
              }
            }
          }

          targetRange.select();
          targetRange.font.highlightColor = 'yellow';
          await context.sync();
          resolve(true);
        } else {
          resolve(false);
        }
      }).catch(reject);
    });
  },

  async highlightUnderlineByPosition(
    paragraphIndex: number,
    startPos: number,
    endPos: number,
    _textHint?: string
  ): Promise<boolean> {
    return this.highlightAtPosition(paragraphIndex, startPos, endPos);
  },

  async highlightContentControlById(contentControlId: number): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const contentControl =
          context.document.contentControls.getByIdOrNullObject(contentControlId);
        contentControl.load('isNullObject');
        await context.sync();

        if (contentControl.isNullObject) {
          resolve(false);
          return;
        }

        const range = contentControl.getRange(Word.RangeLocation.whole);
        range.select();
        range.font.highlightColor = 'yellow';
        await context.sync();
        resolve(true);
      }).catch((error) => {
        console.warn('highlightContentControlById error:', error);
        resolve(false);
      });
    });
  },

  async highlightTableCell(
    tableIndex: number,
    rowIndex: number,
    cellIndex: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const tables = context.document.body.tables;
        tables.load('items');
        await context.sync();

        if (tableIndex < 0 || tableIndex >= tables.items.length) {
          resolve(false);
          return;
        }

        const cell = tables.items[tableIndex].getCell(rowIndex, cellIndex);
        try {
          const wholeRange = cell.body.getRange(Word.RangeLocation.whole);
          wholeRange.load('text');
          await context.sync();
          if (String(wholeRange.text || '').trim()) {
            wholeRange.font.highlightColor = 'yellow';
            wholeRange.select();
            await context.sync();
            resolve(true);
            return;
          }
        } catch (wholeRangeError) {
          console.warn('highlightTableCell whole-range error:', wholeRangeError);
        }

        try {
          const table = tables.items[tableIndex];
          const rows = table.rows;
          rows.load('items');
          await context.sync();

          const pickVisibleFallbackCell = async (
            targetRowIndex: number
          ): Promise<Word.TableCell | null> => {
            if (targetRowIndex < 0 || targetRowIndex >= rows.items.length) {
              return null;
            }
            const targetRow = rows.items[targetRowIndex];
            const cells = targetRow.cells;
            cells.load('items');
            await context.sync();

            for (const candidateCell of cells.items) {
              candidateCell.load('cellIndex');
              candidateCell.body.load('text');
            }
            await context.sync();

            const visibleCells = cells.items
              .filter((candidateCell) => String(candidateCell.body.text || '').trim())
              .sort(
                (left, right) =>
                  Math.abs((left.cellIndex || 0) - cellIndex) -
                  Math.abs((right.cellIndex || 0) - cellIndex)
              );

            return visibleCells[0] || null;
          };

          const fallbackCell =
            (await pickVisibleFallbackCell(rowIndex)) || (await pickVisibleFallbackCell(0));

          if (fallbackCell) {
            const fallbackRange = fallbackCell.body.getRange(Word.RangeLocation.whole);
            fallbackRange.font.highlightColor = 'yellow';
          }

          const targetRange = cell.body.getRange(Word.RangeLocation.whole);
          targetRange.select();
          await context.sync();

          if (fallbackCell) {
            resolve(true);
            return;
          }

          const paragraphs = cell.body.paragraphs;
          paragraphs.load('items');
          await context.sync();

          if (paragraphs.items.length > 0) {
            for (const paragraph of paragraphs.items) {
              const range = paragraph.getRange(Word.RangeLocation.whole);
              range.font.highlightColor = 'yellow';
            }
            paragraphs.items[0].getRange(Word.RangeLocation.whole).select();
            await context.sync();
            resolve(true);
            return;
          }

          resolve(false);
        } catch (rangeError) {
          console.warn('highlightTableCell paragraph fallback error:', rangeError);
          resolve(false);
        }
      }).catch((error) => {
        console.warn('highlightTableCell error:', error);
        resolve(false);
      });
    });
  },

  async highlightText(text: string): Promise<number> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        if (text === ' ' || text.trim() === '') {
          console.log('空白标记无法直接高亮');
          resolve(0);
          return;
        }

        const searchResults = context.document.body.search(text, {
          matchCase: false,
          matchWholeWord: false,
        });
        searchResults.load('items');
        await context.sync();

        const foundCount = searchResults.items.length;

        if (foundCount > 0) {
          const firstResult = searchResults.items[0];
          firstResult.select();
          firstResult.font.highlightColor = 'yellow';
          await context.sync();
        }

        resolve(foundCount);
      }).catch((error) => {
        reject(error);
      });
    });
  },

  async clearAllHighlights(): Promise<void> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const clearHighlightColor = null as any;

        const bodyRange = context.document.body.getRange(Word.RangeLocation.whole);
        bodyRange.font.highlightColor = clearHighlightColor;

        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items');
        const tables = context.document.body.tables;
        tables.load('items');
        const controls = context.document.contentControls;
        controls.load('items');
        await context.sync();

        for (const paragraph of paragraphs.items) {
          const range = paragraph.getRange(Word.RangeLocation.whole);
          range.font.highlightColor = clearHighlightColor;
        }

        for (const control of controls.items) {
          const range = control.getRange(Word.RangeLocation.whole);
          range.font.highlightColor = clearHighlightColor;
        }

        for (const table of tables.items) {
          const rows = table.rows;
          rows.load('items');
          await context.sync();

          for (const row of rows.items) {
            const cells = row.cells;
            cells.load('items');
            await context.sync();

            for (const cell of cells.items) {
              const cellRange = cell.body.getRange(Word.RangeLocation.whole);
              cellRange.font.highlightColor = clearHighlightColor;
            }
          }
        }

        context.document.body.getRange(Word.RangeLocation.start).select();
        await context.sync();
        resolve();
      }).catch((error) => {
        console.warn('清除高亮失败:', error);
        resolve();
      });
    });
  },

  async clearHighlight(text: string): Promise<number> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        if (!text || text.trim() === '') {
          resolve(0);
          return;
        }

        const searchResults = context.document.body.search(text, {
          matchCase: false,
          matchWholeWord: false,
        });
        searchResults.load('items');
        await context.sync();

        const count = searchResults.items.length;
        const clearHighlightColor = null as any;
        for (const item of searchResults.items) {
          item.font.highlightColor = clearHighlightColor;
        }
        await context.sync();
        resolve(count);
      }).catch(reject);
    });
  },

  async highlightByContext(contextSnippet: string): Promise<{ found: boolean; blankText: string }> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const searchTexts = buildWordContextSearchTexts(contextSnippet);
        if (searchTexts.length === 0) {
          resolve({ found: false, blankText: '' });
          return;
        }

        for (const searchText of searchTexts) {
          const searchResults = context.document.body.search(searchText, {
            matchCase: false,
            matchWholeWord: false,
          });
          searchResults.load('items');
          await context.sync();

          if (searchResults.items.length === 0) {
            continue;
          }

          const foundRange = searchResults.items[0];
          foundRange.load('text');
          await context.sync();

          const blankText =
            extractLongestWordBlank(searchText) || extractLongestWordBlank(foundRange.text || '');
          if (blankText && blankText.length >= 2) {
            const blankSearch = foundRange.search(blankText, {
              matchCase: false,
              matchWholeWord: false,
            });
            blankSearch.load('items');
            await context.sync();

            if (blankSearch.items.length > 0) {
              const blankMatch = blankSearch.items[0];
              blankMatch.select();
              blankMatch.font.highlightColor = 'yellow';
              await context.sync();
              resolve({ found: true, blankText });
              return;
            }
          }
        }

        resolve({ found: false, blankText: '' });
      }).catch(reject);
    });
  },

  async focusParagraph(paragraphIndex: number): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items');
        await context.sync();

        if (paragraphIndex < 0 || paragraphIndex >= paragraphs.items.length) {
          resolve(false);
          return;
        }

        const range = paragraphs.items[paragraphIndex].getRange(Word.RangeLocation.whole);
        range.select();
        range.font.highlightColor = 'yellow';
        await context.sync();
        resolve(true);
      }).catch((error) => {
        console.warn('focusParagraph error:', error);
        resolve(false);
      });
    });
  },
};
