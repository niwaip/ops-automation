import {
  buildWordContextSearchTexts,
  extractLongestWordBlank,
  extractWordLabelValueTarget,
  extractWordMultilineLabelValueTarget,
  extractWordStandaloneLabelTarget,
  pickWordSearchResultByPosition,
} from './word-context-search';

function buildWordInsertionSearchSnippets(text: string, fromEnd: boolean): string[] {
  const normalized = String(text || '');
  if (!normalized) {
    return [];
  }

  const snippets = fromEnd
    ? [normalized.slice(-24), normalized.slice(-16), normalized.slice(-8)]
    : [normalized.slice(0, 24), normalized.slice(0, 16), normalized.slice(0, 8)];

  return Array.from(
    new Set(snippets.map((snippet) => snippet.trim()).filter((snippet) => snippet.length >= 2))
  );
}

async function insertWordTextAtParagraphPosition(
  paragraph: Word.Paragraph,
  paragraphText: string,
  position: number,
  replacementText: string
): Promise<boolean> {
  const safePosition = Math.max(0, Math.min(position, paragraphText.length));
  const beforeText = paragraphText.slice(0, safePosition);
  const afterText = paragraphText.slice(safePosition);

  const beforeSnippets = buildWordInsertionSearchSnippets(beforeText, true);
  for (const snippet of beforeSnippets) {
    const snippetSearch = paragraph.search(snippet, {
      matchCase: true,
      matchWholeWord: false,
    });
    snippetSearch.load('items');
    await paragraph.context.sync();

    if (snippetSearch.items.length === 0) {
      continue;
    }

    snippetSearch.items[snippetSearch.items.length - 1].insertText(
      replacementText,
      Word.InsertLocation.end
    );
    await paragraph.context.sync();
    return true;
  }

  const afterSnippets = buildWordInsertionSearchSnippets(afterText, false);
  for (const snippet of afterSnippets) {
    const snippetSearch = paragraph.search(snippet, {
      matchCase: true,
      matchWholeWord: false,
    });
    snippetSearch.load('items');
    await paragraph.context.sync();

    if (snippetSearch.items.length === 0) {
      continue;
    }

    snippetSearch.items[0].insertText(replacementText, Word.InsertLocation.start);
    await paragraph.context.sync();
    return true;
  }

  return false;
}

async function replaceWordValueNearLabel(
  context: Word.RequestContext,
  labelText: string,
  valueText: string,
  replacementText: string
): Promise<boolean> {
  const paragraphs = context.document.body.paragraphs;
  paragraphs.load('items');
  await context.sync();

  for (const paragraph of paragraphs.items) {
    paragraph.load('text');
  }
  await context.sync();

  const normalizedLabel = String(labelText || '').trim();
  const normalizedValue = String(valueText || '').trim();
  if (!normalizedLabel || !normalizedValue) {
    return false;
  }

  for (let index = 0; index < paragraphs.items.length; index += 1) {
    const paragraph = paragraphs.items[index];
    const paragraphText = String(paragraph.text || '');
    if (!paragraphText.includes(normalizedLabel)) {
      continue;
    }

    if (paragraphText.includes(normalizedValue)) {
      const valueSearch = paragraph.search(normalizedValue, {
        matchCase: false,
        matchWholeWord: false,
      });
      valueSearch.load('items');
      await context.sync();

      if (valueSearch.items.length > 0) {
        valueSearch.items[0].insertText(replacementText, Word.InsertLocation.replace);
        await context.sync();
        return true;
      }
    }

    const nextParagraph = paragraphs.items[index + 1];
    if (!nextParagraph) {
      continue;
    }
    const nextParagraphText = String(nextParagraph.text || '');
    if (!nextParagraphText.includes(normalizedValue)) {
      continue;
    }

    const valueSearch = nextParagraph.search(normalizedValue, {
      matchCase: false,
      matchWholeWord: false,
    });
    valueSearch.load('items');
    await context.sync();

    if (valueSearch.items.length > 0) {
      valueSearch.items[0].insertText(replacementText, Word.InsertLocation.replace);
      await context.sync();
      return true;
    }
  }

  return false;
}

async function insertWordValueAfterLabel(
  foundRange: Word.Range,
  labelText: string,
  replacementText: string
): Promise<boolean> {
  const normalizedLabel = String(labelText || '').trim();
  const normalizedFoundText = String(foundRange.text || '').trim();
  if (!normalizedLabel || !normalizedFoundText) {
    return false;
  }

  if (normalizedFoundText === normalizedLabel || normalizedFoundText.endsWith(normalizedLabel)) {
    foundRange.insertText(replacementText, Word.InsertLocation.end);
    return true;
  }

  const labelSearch = foundRange.search(normalizedLabel, {
    matchCase: false,
    matchWholeWord: false,
  });
  labelSearch.load('items');
  await foundRange.context.sync();

  if (labelSearch.items.length === 0) {
    return false;
  }

  labelSearch.items[0].insertText(replacementText, Word.InsertLocation.end);
  return true;
}

export const WordWriteAPI = {
  async replaceUnderlineByPosition(
    paragraphIndex: number,
    startPos: number,
    endPos: number,
    replacement: string,
    _textHint?: string,
    originalParagraphText?: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items');
        await context.sync();

        console.log(
          `[DEBUG] replaceUnderline: 段落${paragraphIndex}, 位置${startPos}-${endPos}, 替换为 "${replacement}"`
        );

        if (paragraphIndex >= paragraphs.items.length) {
          console.warn(`[DEBUG] 段落索引 ${paragraphIndex} 超出范围`);
          resolve(false);
          return;
        }

        const paragraph = paragraphs.items[paragraphIndex];

        try {
          let fullText = originalParagraphText;
          if (!fullText) {
            paragraph.load('text');
            await context.sync();
            fullText = paragraph.text;
          }

          if (startPos >= endPos) {
            const inserted = await insertWordTextAtParagraphPosition(
              paragraph,
              fullText,
              startPos,
              replacement
            );
            if (inserted) {
              console.log(`[DEBUG] ✓ 已插入（定位点）: 位置${startPos} -> "${replacement}"`);
              resolve(true);
              return;
            }
          }

          const blankText = fullText.substring(startPos, endPos);
          console.log(`[DEBUG] 空白文本: "${blankText}" (${blankText.length}字符)`);

          if (blankText.length >= 2) {
            const searchResults = paragraph.search(blankText, {
              matchCase: false,
              matchWholeWord: false,
            });
            searchResults.load('items');
            await context.sync();

            console.log(`[DEBUG] 搜索结果数量: ${searchResults.items.length}`);

            if (searchResults.items.length > 0) {
              if (searchResults.items.length > 1) {
                console.log('[DEBUG] 多个匹配，使用扩展文本定位');

                const extendBefore = 4;
                const extendAfter = 4;
                const extendedStart = Math.max(0, startPos - extendBefore);
                const extendedEnd = Math.min(fullText.length, endPos + extendAfter);
                const extendedText = fullText.substring(extendedStart, extendedEnd);

                console.log(`[DEBUG] 扩展文本: "${extendedText}"`);

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
                      fullText,
                      extendedText,
                      extendedStart
                    ) || extendedSearch.items[0];
                  const blankInExtended = foundRange.search(blankText, {
                    matchCase: false,
                    matchWholeWord: false,
                  });
                  blankInExtended.load('items');
                  await context.sync();

                  if (blankInExtended.items.length > 0) {
                    const targetRange =
                      pickWordSearchResultByPosition(
                        blankInExtended.items,
                        extendedText,
                        blankText,
                        startPos - extendedStart
                      ) || blankInExtended.items[0];
                    targetRange.insertText(replacement, Word.InsertLocation.replace);
                    await context.sync();
                    console.log(
                      `[DEBUG] ✓ 已替换（扩展定位）: "${blankText.substring(0, 10)}..." → "${replacement}"`
                    );
                    resolve(true);
                    return;
                  }
                }
              }

              const targetRange =
                pickWordSearchResultByPosition(
                  searchResults.items,
                  fullText,
                  blankText,
                  startPos
                ) || searchResults.items[0];
              targetRange.insertText(replacement, Word.InsertLocation.replace);
              await context.sync();
              console.log(
                `[DEBUG] ✓ 已替换（直接）: "${blankText.substring(0, 10)}..." → "${replacement}"`
              );
              resolve(true);
              return;
            }
          }

          console.warn('[DEBUG] 未找到可替换的文本');
          resolve(false);
        } catch (err) {
          console.warn('[DEBUG] 替换失败:', err);
          resolve(false);
        }
      }).catch((e) => {
        console.error('[DEBUG] replaceUnderline 错误:', e);
        resolve(false);
      });
    });
  },

  async insertMarker(
    marker: string,
    position?: { paragraphIndex: number; textRange: string }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        if (position) {
          const paragraphs = context.document.body.paragraphs;
          paragraphs.load('items');
          await context.sync();

          const paragraph = paragraphs.items[position.paragraphIndex];
          const range = paragraph.search(position.textRange);
          range.load('items');
          await context.sync();

          if (range.items.length > 0) {
            range.items[0].insertText(marker, Word.InsertLocation.replace);
          }
        } else {
          context.document.body.insertText(marker, Word.InsertLocation.end);
        }
        await context.sync();
        resolve();
      }).catch(reject);
    });
  },

  async replaceContentControlText(
    contentControlId: number,
    replacementText: string
  ): Promise<boolean> {
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

        const contentRange = contentControl.getRange(Word.RangeLocation.content);
        contentRange.insertText(replacementText, Word.InsertLocation.replace);
        await context.sync();
        resolve(true);
      }).catch((error) => {
        console.warn('replaceContentControlText error:', error);
        resolve(false);
      });
    });
  },

  async replaceText(oldText: string, newText: string): Promise<void> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const results = context.document.body.search(oldText);
        results.load('items');
        await context.sync();

        for (const item of results.items) {
          item.insertText(newText, Word.InsertLocation.replace);
        }
        await context.sync();
        resolve();
      }).catch(reject);
    });
  },

  async replaceBlankWithContext(
    contextSnippet: string,
    replacementText: string
  ): Promise<{ success: boolean; replacedText: string }> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const searchTexts = buildWordContextSearchTexts(contextSnippet);
        if (searchTexts.length === 0) {
          resolve({ success: false, replacedText: '' });
          return;
        }

        for (const searchText of searchTexts) {
          if (searchText.length < 2) {
            continue;
          }

          const searchResults = context.document.body.search(searchText, {
            matchCase: false,
            matchWholeWord: false,
          });
          searchResults.load('items');
          await context.sync();

          if (searchResults.items.length === 0) {
            continue;
          }

          const candidateRanges = searchResults.items.slice(0, 3);
          for (const foundRange of candidateRanges) {
            foundRange.load('text');
          }
          await context.sync();

          for (const foundRange of candidateRanges) {
            const foundText = foundRange.text || searchText;
            const blankText =
              extractLongestWordBlank(searchText) || extractLongestWordBlank(foundText);
            if (blankText && blankText.length >= 2) {
              const blankSearch = foundRange.search(blankText, {
                matchCase: false,
                matchWholeWord: false,
              });
              blankSearch.load('items');
              await context.sync();

              if (blankSearch.items.length > 0) {
                blankSearch.items[0].insertText(replacementText, Word.InsertLocation.replace);
                await context.sync();

                console.log(`精确替换空白: "${blankText}" → "${replacementText}"`);
                resolve({ success: true, replacedText: blankText });
                return;
              }
            }

            const labelValueTarget =
              extractWordLabelValueTarget(searchText) || extractWordLabelValueTarget(foundText);
            if (!labelValueTarget?.valueText) {
              const multilineLabelValueTarget =
                extractWordMultilineLabelValueTarget(searchText) ||
                extractWordMultilineLabelValueTarget(foundText);
              if (multilineLabelValueTarget?.valueText) {
                const replaced = await replaceWordValueNearLabel(
                  context,
                  multilineLabelValueTarget.labelText,
                  multilineLabelValueTarget.valueText,
                  replacementText
                );
                if (replaced) {
                  console.log(
                    `精确替换跨行标签后内容: "${multilineLabelValueTarget.valueText}" → "${replacementText}"`
                  );
                  resolve({ success: true, replacedText: multilineLabelValueTarget.valueText });
                  return;
                }
              }

              const standaloneLabelText =
                extractWordStandaloneLabelTarget(searchText) ||
                extractWordStandaloneLabelTarget(foundText);
              if (!standaloneLabelText) {
                continue;
              }

              const inserted = await insertWordValueAfterLabel(
                foundRange,
                standaloneLabelText,
                replacementText
              );
              if (inserted) {
                await context.sync();
                console.log(`精确插入标签后内容: "${standaloneLabelText}" + "${replacementText}"`);
                resolve({ success: true, replacedText: standaloneLabelText });
                return;
              }
              continue;
            }

            const valueSearch = foundRange.search(labelValueTarget.valueText, {
              matchCase: false,
              matchWholeWord: false,
            });
            valueSearch.load('items');
            await context.sync();

            if (valueSearch.items.length > 0) {
              valueSearch.items[0].insertText(replacementText, Word.InsertLocation.replace);
              await context.sync();

              console.log(
                `精确替换标签后内容: "${labelValueTarget.valueText}" → "${replacementText}"`
              );
              resolve({ success: true, replacedText: labelValueTarget.valueText });
              return;
            }
          }
        }

        resolve({ success: false, replacedText: '' });
      }).catch((error) => {
        reject(error);
      });
    });
  },

  async getSelectedText(): Promise<string> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const selection = context.document.getSelection();
        selection.load('text');
        await context.sync();
        resolve(selection.text);
      }).catch(reject);
    });
  },

  async insertLoopMarker(arrayPath: string, _selectionContent: string): Promise<void> {
    return new Promise((resolve, reject) => {
      Word.run(async (context) => {
        const selection = context.document.getSelection();
        selection.load('text');
        await context.sync();
        const originalText = selection.text;

        const loopStart = `{#${arrayPath}}`;
        const loopEnd = `{/${arrayPath}}`;

        selection.insertText(`${loopStart}${originalText}${loopEnd}`, Word.InsertLocation.replace);
        await context.sync();
        resolve();
      }).catch(reject);
    });
  },
};
