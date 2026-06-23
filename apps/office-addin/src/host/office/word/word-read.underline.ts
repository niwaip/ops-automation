import { emitDebugLog, setLastUnderlineDebugReport } from './word-read.debug';

function shouldDebugWordUnderlineParagraph(text: string): boolean {
  return /technical service is to be rendered|duration of technical service|技术服务地点|技术服务期限/iu.test(
    String(text || '')
  );
}

type UnderlineFallbackLanguage = 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';

type UnderlineSpaceCandidate = {
  paragraphIndex: number;
  paragraphText: string;
  text: string;
  start: number;
  end: number;
  blankIndex: number;
  blankCount: number;
  blankLength: number;
  hasUnderlineFormat: boolean;
  foundByContext: boolean;
  mirrorShape: string;
  language: UnderlineFallbackLanguage;
  hasKana: boolean;
};

function detectUnderlineFallbackLanguage(text: string): UnderlineFallbackLanguage {
  const sourceText = String(text || '');
  const hasZh = /[\u4e00-\u9fff]/u.test(sourceText);
  const hasJaKana = /[\u3040-\u30ff]/u.test(sourceText);
  const hasEn = /[A-Za-z]/.test(sourceText);
  const languageCount = Number(hasZh) + Number(hasJaKana) + Number(hasEn);

  if (languageCount > 1) {
    return 'mixed';
  }
  if (hasJaKana) {
    return 'ja';
  }
  if (hasZh) {
    return 'zh';
  }
  if (hasEn) {
    return 'en';
  }
  return 'unknown';
}

function buildUnderlineMirrorShape(text: string): string {
  const sourceText = String(text || '');
  let result = '';
  let previousToken = '';

  const pushToken = (token: string) => {
    if (!token || token === previousToken) {
      return;
    }
    result += token;
    previousToken = token;
  };

  for (const char of sourceText) {
    if (/[ 　\t_＿]/u.test(char)) {
      pushToken('_');
    } else if (/[：:]/u.test(char)) {
      pushToken(':');
    } else if (/[。．.!！？?]/u.test(char)) {
      pushToken('.');
    } else if (/[、，,；;]/u.test(char)) {
      pushToken(',');
    } else if (/[0-9０-９]/u.test(char)) {
      pushToken('9');
    } else if (/[A-Za-z]/.test(char)) {
      pushToken('A');
    } else if (/[\u3040-\u30ff\u3400-\u9fff]/u.test(char)) {
      pushToken('X');
    } else {
      pushToken('#');
    }
  }

  return result;
}

function canUseMirrorUnderlineFallback(
  current: UnderlineSpaceCandidate,
  counterpart: UnderlineSpaceCandidate
): boolean {
  if (current.hasUnderlineFormat || !counterpart.hasUnderlineFormat) {
    return false;
  }
  if (
    current.blankCount !== counterpart.blankCount ||
    current.blankIndex !== counterpart.blankIndex
  ) {
    return false;
  }
  if (current.blankLength !== counterpart.blankLength) {
    return false;
  }
  if (!current.mirrorShape || current.mirrorShape !== counterpart.mirrorShape) {
    return false;
  }
  if (Math.abs(current.paragraphIndex - counterpart.paragraphIndex) > 1) {
    return false;
  }

  const languagePair = new Set([current.language, counterpart.language]);
  if (languagePair.has('en') || languagePair.has('unknown')) {
    return false;
  }

  if (current.language === counterpart.language && current.hasKana === counterpart.hasKana) {
    return false;
  }

  return true;
}

export async function getUnderlinedTexts(): Promise<
  Array<{
    text: string;
    underlineType: string;
    index: number;
    paragraphIndex: number;
    paragraphText: string;
    position: { start: number; end: number };
  }>
> {
  return new Promise((resolve) => {
    Word.run(async (context) => {
      const result: Array<{
        text: string;
        underlineType: string;
        index: number;
        paragraphIndex: number;
        paragraphText: string;
        position: { start: number; end: number };
      }> = [];
      const spaceCandidates: UnderlineSpaceCandidate[] = [];
      const warrantyDebugLines: string[] = [];
      const targetUnderlineDebugLines: string[] = [];
      const pushWarrantyDebug = (line: string) => {
        warrantyDebugLines.push(line);
        console.log(line);
      };
      const pushTargetUnderlineDebug = (line: string, details?: Record<string, unknown>) => {
        const detailText = details ? ` | ${JSON.stringify(details)}` : '';
        const finalLine = `${line}${detailText}`;
        targetUnderlineDebugLines.push(finalLine);
        console.log(finalLine);
        emitDebugLog('debug', line, details ? JSON.stringify(details, null, 2) : undefined);
      };
      const detectionStats = {
        spaceRanges: 0,
        contextHits: 0,
        directHits: 0,
        noSearchResult: 0,
        filteredByUnderline: 0,
        searchErrors: 0,
      };

      console.log('[DEBUG] 开始检测下划线参数位置...');

      try {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items');
        await context.sync();
        console.log(`[DEBUG] 文档共 ${paragraphs.items.length} 个段落`);

        for (let pIdx = 0; pIdx < paragraphs.items.length; pIdx += 1) {
          const paragraph = paragraphs.items[pIdx];
          paragraph.load('text');
          await context.sync();

          const fullText = paragraph.text || '';
          if (!fullText || fullText.length < 2) {
            continue;
          }

          const isWarrantyDebugParagraph = /保修期|アフターサービス保証期間|年内|年とする/u.test(
            fullText
          );
          const isUnderlineDebugParagraph = shouldDebugWordUnderlineParagraph(fullText);
          const paragraphLanguage = detectUnderlineFallbackLanguage(fullText);
          const paragraphHasKana = /[\u3040-\u30ff]/u.test(fullText);

          if (isWarrantyDebugParagraph) {
            pushWarrantyDebug(`[DEBUG][WARRANTY] 段落${pIdx} 原文: ${JSON.stringify(fullText)}`);
          }
          if (isUnderlineDebugParagraph) {
            pushTargetUnderlineDebug(
              '[DEBUG][UNDERLINE][A] target paragraph entered underline scan',
              {
                location: 'word-read.underline.ts:getUnderlinedTexts:paragraph-entry',
                paragraphIndex: pIdx,
                paragraphLanguage,
                paragraphHasKana,
                paragraphText: fullText,
              }
            );
          }

          const underlineCharMatches: Array<{ text: string; start: number; end: number }> = [];
          const underlineCharRegex = /[＿_]{2,}/g;
          let match: RegExpExecArray | null;
          while ((match = underlineCharRegex.exec(fullText)) !== null) {
            underlineCharMatches.push({
              text: match[0],
              start: match.index,
              end: match.index + match[0].length,
            });
          }

          const spaceMatches: Array<{ text: string; start: number; end: number }> = [];
          const spaceRegex = /[ 　\t]{2,}/g;
          while ((match = spaceRegex.exec(fullText)) !== null) {
            if (!underlineCharMatches.some((u) => Math.abs(u.start - match!.index) < 2)) {
              spaceMatches.push({
                text: match[0],
                start: match.index,
                end: match.index + match[0].length,
              });
            }
          }

          const totalBlankCount = underlineCharMatches.length + spaceMatches.length;
          if (totalBlankCount === 0) {
            continue;
          }

          console.log(
            `[DEBUG] 段落 ${pIdx}: 发现 ${underlineCharMatches.length} 个下划线字符 + ${spaceMatches.length} 个空格区域`
          );
          if (isUnderlineDebugParagraph) {
            pushTargetUnderlineDebug('[DEBUG][UNDERLINE][A] target paragraph blank scan result', {
              location: 'word-read.underline.ts:getUnderlinedTexts:blank-scan',
              paragraphIndex: pIdx,
              underlineCharCount: underlineCharMatches.length,
              underlineCharRanges: underlineCharMatches,
              spaceCount: spaceMatches.length,
              spaceRanges: spaceMatches,
              paragraphText: fullText,
            });
          }
          if (isWarrantyDebugParagraph) {
            pushWarrantyDebug(
              `[DEBUG][WARRANTY] 段落${pIdx} 空白统计: underlineChar=${underlineCharMatches.length}, spaces=${spaceMatches.length}`
            );
            underlineCharMatches.forEach((underlineMatch, underlineIndex) => {
              pushWarrantyDebug(
                `[DEBUG][WARRANTY] 段落${pIdx} 下划线字符#${underlineIndex + 1}: ${underlineMatch.start}-${underlineMatch.end} ${JSON.stringify(underlineMatch.text)}`
              );
            });
            spaceMatches.forEach((spaceMatch, spaceIndex) => {
              pushWarrantyDebug(
                `[DEBUG][WARRANTY] 段落${pIdx} 空格候选#${spaceIndex + 1}: ${spaceMatch.start}-${spaceMatch.end} ${JSON.stringify(spaceMatch.text)}`
              );
            });
          }

          for (const underlineMatch of underlineCharMatches) {
            result.push({
              text: underlineMatch.text,
              underlineType: 'underline-char',
              index: result.length,
              paragraphIndex: pIdx,
              paragraphText: fullText,
              position: { start: underlineMatch.start, end: underlineMatch.end },
            });
            console.log(
              `[DEBUG] ✓ 下划线字符: 段落${pIdx} 位置${underlineMatch.start}-${underlineMatch.end}`
            );
          }

          for (let spaceIndex = 0; spaceIndex < spaceMatches.length; spaceIndex += 1) {
            const spaceMatch = spaceMatches[spaceIndex];
            detectionStats.spaceRanges += 1;
            const candidateMeta: UnderlineSpaceCandidate = {
              paragraphIndex: pIdx,
              paragraphText: fullText,
              text: spaceMatch.text,
              start: spaceMatch.start,
              end: spaceMatch.end,
              blankIndex: spaceIndex,
              blankCount: spaceMatches.length,
              blankLength: spaceMatch.text.length,
              hasUnderlineFormat: false,
              foundByContext: false,
              mirrorShape: buildUnderlineMirrorShape(fullText),
              language: paragraphLanguage,
              hasKana: paragraphHasKana,
            };

            try {
              const blankText = spaceMatch.text;
              let hasUnderlineFormat = false;
              let foundByContext = false;
              let countedUnderlineFilter = false;
              let contextRangeCount = 0;
              let directRangeCount = 0;
              let contextUnderlineStates: string[] = [];
              let directUnderlineStates: string[] = [];
              const extendBefore = 4;
              const extendAfter = 4;
              const extendedStart = Math.max(0, spaceMatch.start - extendBefore);
              const extendedEnd = Math.min(fullText.length, spaceMatch.end + extendAfter);
              const extendedText = fullText.substring(extendedStart, extendedEnd);

              if (isWarrantyDebugParagraph) {
                pushWarrantyDebug(
                  `[DEBUG][WARRANTY] 段落${pIdx} 空格${spaceMatch.start}-${spaceMatch.end}: 扩展上下文 ${JSON.stringify(extendedText)}`
                );
              }

              if (extendedText.length > blankText.length) {
                const extSearchResults = paragraph.search(extendedText, {
                  matchCase: true,
                  matchWholeWord: false,
                });
                extSearchResults.load('items');
                await context.sync();

                if (extSearchResults.items.length > 0) {
                  const extRange = extSearchResults.items[0];
                  const blankInExt = extRange.search(blankText, {
                    matchCase: false,
                    matchWholeWord: false,
                  });
                  blankInExt.load('items');
                  await context.sync();

                  if (blankInExt.items.length > 0) {
                    for (const foundRange of blankInExt.items) {
                      foundRange.load('text,font/underline');
                    }
                    await context.sync();

                    contextRangeCount = blankInExt.items.length;
                    contextUnderlineStates = blankInExt.items.map((foundRange) =>
                      String(foundRange.font.underline)
                    );

                    if (isWarrantyDebugParagraph) {
                      pushWarrantyDebug(
                        `[DEBUG][WARRANTY] 段落${pIdx} 空格${spaceMatch.start}-${spaceMatch.end}: 上下文命中 ${blankInExt.items.length} 个空格 range`
                      );
                      blankInExt.items.forEach((foundRange, foundIndex) => {
                        pushWarrantyDebug(
                          `[DEBUG][WARRANTY] 段落${pIdx} 上下文range#${foundIndex + 1}: text=${JSON.stringify(foundRange.text)} underline=${String(foundRange.font.underline)}`
                        );
                      });
                    }

                    hasUnderlineFormat = blankInExt.items.some((foundRange) => {
                      const underline = foundRange.font.underline;
                      return underline && underline !== 'None' && underline !== 'Mixed';
                    });
                    foundByContext = hasUnderlineFormat;
                    candidateMeta.hasUnderlineFormat = hasUnderlineFormat;
                    candidateMeta.foundByContext = foundByContext;

                    if (!hasUnderlineFormat) {
                      detectionStats.filteredByUnderline += 1;
                      countedUnderlineFilter = true;
                      console.log(
                        `[DEBUG] 段落${pIdx} 位置${spaceMatch.start}-${spaceMatch.end}: 上下文定位成功，但空格区域 underline 为 None/Mixed`
                      );
                    }
                  } else {
                    if (isWarrantyDebugParagraph) {
                      pushWarrantyDebug(
                        `[DEBUG][WARRANTY] 段落${pIdx} 空格${spaceMatch.start}-${spaceMatch.end}: 上下文内没有找到空格片段`
                      );
                    }
                    console.log(
                      `[DEBUG] 段落${pIdx} 位置${spaceMatch.start}-${spaceMatch.end}: 上下文命中，但在上下文内未找到空格片段`
                    );
                  }
                } else {
                  if (isWarrantyDebugParagraph) {
                    pushWarrantyDebug(
                      `[DEBUG][WARRANTY] 段落${pIdx} 空格${spaceMatch.start}-${spaceMatch.end}: 扩展上下文未命中`
                    );
                  }
                  console.log(
                    `[DEBUG] 段落${pIdx} 位置${spaceMatch.start}-${spaceMatch.end}: 未找到扩展上下文 "${extendedText}"`
                  );
                }
              }

              if (!hasUnderlineFormat) {
                const searchResults = paragraph.search(blankText, {
                  matchCase: false,
                  matchWholeWord: false,
                });
                searchResults.load('items');
                await context.sync();

                if (isWarrantyDebugParagraph) {
                  pushWarrantyDebug(
                    `[DEBUG][WARRANTY] 段落${pIdx} 空格${spaceMatch.start}-${spaceMatch.end}: 直接搜索命中 ${searchResults.items.length} 个 range`
                  );
                }

                if (searchResults.items.length === 0) {
                  detectionStats.noSearchResult += 1;
                  console.log(`[DEBUG] 段落${pIdx} 位置${spaceMatch.start}: 未找到空格文本`);
                  continue;
                }

                for (const foundRange of searchResults.items) {
                  foundRange.load('text,font/underline');
                }
                await context.sync();

                directRangeCount = searchResults.items.length;
                directUnderlineStates = searchResults.items.map((foundRange) =>
                  String(foundRange.font.underline)
                );

                if (isWarrantyDebugParagraph) {
                  searchResults.items.forEach((foundRange, foundIndex) => {
                    pushWarrantyDebug(
                      `[DEBUG][WARRANTY] 段落${pIdx} 直接range#${foundIndex + 1}: text=${JSON.stringify(foundRange.text)} underline=${String(foundRange.font.underline)}`
                    );
                  });
                }

                hasUnderlineFormat = searchResults.items.some((foundRange) => {
                  const underline = foundRange.font.underline;
                  return underline && underline !== 'None' && underline !== 'Mixed';
                });
                candidateMeta.hasUnderlineFormat = hasUnderlineFormat;

                if (!hasUnderlineFormat) {
                  if (!countedUnderlineFilter) {
                    detectionStats.filteredByUnderline += 1;
                  }
                  console.log(
                    `[DEBUG] 段落${pIdx} 位置${spaceMatch.start}-${spaceMatch.end}: 直接搜索命中，但空格区域 underline 为 None/Mixed`
                  );
                }
              }

              if (hasUnderlineFormat) {
                if (foundByContext) {
                  detectionStats.contextHits += 1;
                } else {
                  detectionStats.directHits += 1;
                }
                result.push({
                  text: blankText,
                  underlineType: foundByContext ? 'SingleContext' : 'Single',
                  index: result.length,
                  paragraphIndex: pIdx,
                  paragraphText: fullText,
                  position: { start: spaceMatch.start, end: spaceMatch.end },
                });
                console.log(
                  `[DEBUG] ✓ 下划线空格: 段落${pIdx} 位置${spaceMatch.start}-${spaceMatch.end}`
                );
                if (isWarrantyDebugParagraph) {
                  pushWarrantyDebug(
                    `[DEBUG][WARRANTY] 段落${pIdx} 空格${spaceMatch.start}-${spaceMatch.end}: 已写入结果，类型=${foundByContext ? 'SingleContext' : 'Single'}`
                  );
                }
              } else if (isWarrantyDebugParagraph) {
                pushWarrantyDebug(
                  `[DEBUG][WARRANTY] 段落${pIdx} 空格${spaceMatch.start}-${spaceMatch.end}: 未写入结果，原因=underline 未通过或搜索未命中`
                );
              }

              if (isUnderlineDebugParagraph) {
                pushTargetUnderlineDebug(
                  '[DEBUG][UNDERLINE][B] target paragraph space candidate decision',
                  {
                    location: 'word-read.underline.ts:getUnderlinedTexts:space-decision',
                    paragraphIndex: pIdx,
                    paragraphText: fullText,
                    blankIndex: spaceIndex,
                    blankStart: spaceMatch.start,
                    blankEnd: spaceMatch.end,
                    blankLength: spaceMatch.text.length,
                    extendedText,
                    contextRangeCount,
                    contextUnderlineStates,
                    directRangeCount,
                    directUnderlineStates,
                    hasUnderlineFormat,
                    foundByContext,
                    resultWritten: hasUnderlineFormat,
                  }
                );
              }
            } catch (searchErr) {
              detectionStats.searchErrors += 1;
              console.warn('[DEBUG] 空格搜索错误:', searchErr);
            }

            spaceCandidates.push(candidateMeta);
          }
        }
      } catch (formatErr) {
        console.warn('[DEBUG] 格式检测总错误:', formatErr);
      }

      const confirmedCandidateKeys = new Set(
        result.map(
          (entry) => `${entry.paragraphIndex}:${entry.position.start}:${entry.position.end}`
        )
      );
      const paragraphCandidateMap = new Map<number, UnderlineSpaceCandidate[]>();
      spaceCandidates.forEach((candidate) => {
        const currentList = paragraphCandidateMap.get(candidate.paragraphIndex) || [];
        currentList.push(candidate);
        paragraphCandidateMap.set(candidate.paragraphIndex, currentList);
      });
      paragraphCandidateMap.forEach((candidates) => {
        candidates.sort((left, right) => left.start - right.start);
      });

      const fallbackCandidates: typeof result = [];
      spaceCandidates.forEach((candidate) => {
        if (candidate.hasUnderlineFormat) {
          return;
        }

        const fallbackKey = `${candidate.paragraphIndex}:${candidate.start}:${candidate.end}`;
        if (confirmedCandidateKeys.has(fallbackKey)) {
          return;
        }

        const neighborParagraphs = [
          paragraphCandidateMap.get(candidate.paragraphIndex - 1) || [],
          paragraphCandidateMap.get(candidate.paragraphIndex + 1) || [],
        ].flat();

        if (shouldDebugWordUnderlineParagraph(candidate.paragraphText)) {
          pushTargetUnderlineDebug('[DEBUG][UNDERLINE][C] evaluating mirror fallback candidates', {
            location: 'word-read.underline.ts:getUnderlinedTexts:mirror-fallback',
            paragraphIndex: candidate.paragraphIndex,
            paragraphText: candidate.paragraphText,
            candidateLanguage: candidate.language,
            candidateHasKana: candidate.hasKana,
            candidateBlankIndex: candidate.blankIndex,
            candidateBlankCount: candidate.blankCount,
            candidateBlankLength: candidate.blankLength,
            candidateMirrorShape: candidate.mirrorShape,
            neighborSummaries: neighborParagraphs.map((neighbor) => ({
              paragraphIndex: neighbor.paragraphIndex,
              language: neighbor.language,
              hasKana: neighbor.hasKana,
              blankIndex: neighbor.blankIndex,
              blankCount: neighbor.blankCount,
              blankLength: neighbor.blankLength,
              hasUnderlineFormat: neighbor.hasUnderlineFormat,
              mirrorShapeMatched: neighbor.mirrorShape === candidate.mirrorShape,
              paragraphText: neighbor.paragraphText,
            })),
          });
        }

        const mirroredSource = neighborParagraphs.find((neighbor) =>
          canUseMirrorUnderlineFallback(candidate, neighbor)
        );
        if (!mirroredSource) {
          if (shouldDebugWordUnderlineParagraph(candidate.paragraphText)) {
            pushTargetUnderlineDebug('[DEBUG][UNDERLINE][C] mirror fallback not applied', {
              location: 'word-read.underline.ts:getUnderlinedTexts:mirror-fallback-miss',
              paragraphIndex: candidate.paragraphIndex,
              paragraphText: candidate.paragraphText,
              candidateLanguage: candidate.language,
              candidateHasKana: candidate.hasKana,
            });
          }
          return;
        }

        fallbackCandidates.push({
          text: candidate.text,
          underlineType: 'bilingual-mirror-fallback',
          index: 0,
          paragraphIndex: candidate.paragraphIndex,
          paragraphText: candidate.paragraphText,
          position: { start: candidate.start, end: candidate.end },
        });
        confirmedCandidateKeys.add(fallbackKey);

        if (/保修期|アフターサービス保証期間|年内|年とする/u.test(candidate.paragraphText)) {
          pushWarrantyDebug(
            `[DEBUG][WARRANTY] 段落${candidate.paragraphIndex} 空格${candidate.start}-${candidate.end}: 镜像兜底生效，参考段落${mirroredSource.paragraphIndex} 同序号空格已确认 underline`
          );
        }
        if (shouldDebugWordUnderlineParagraph(candidate.paragraphText)) {
          pushTargetUnderlineDebug('[DEBUG][UNDERLINE][C] mirror fallback applied', {
            location: 'word-read.underline.ts:getUnderlinedTexts:mirror-fallback-hit',
            paragraphIndex: candidate.paragraphIndex,
            paragraphText: candidate.paragraphText,
            mirroredSourceParagraphIndex: mirroredSource.paragraphIndex,
            mirroredSourceLanguage: mirroredSource.language,
            mirroredSourceHasKana: mirroredSource.hasKana,
            mirroredSourceParagraphText: mirroredSource.paragraphText,
          });
        }
      });

      if (fallbackCandidates.length > 0) {
        fallbackCandidates.forEach((item) => result.push(item));
      }

      const targetResultEntries = result.filter((entry) =>
        shouldDebugWordUnderlineParagraph(entry.paragraphText)
      );
      if (targetResultEntries.length > 0 || targetUnderlineDebugLines.length > 0) {
        pushTargetUnderlineDebug('[DEBUG][UNDERLINE][D] final underline result snapshot', {
          location: 'word-read.underline.ts:getUnderlinedTexts:final-result',
          matchedEntryCount: targetResultEntries.length,
          matchedEntries: targetResultEntries.map((entry) => ({
            paragraphIndex: entry.paragraphIndex,
            underlineType: entry.underlineType,
            start: entry.position.start,
            end: entry.position.end,
            text: entry.text,
            paragraphText: entry.paragraphText,
          })),
        });
      }

      setLastUnderlineDebugReport(
        [...targetUnderlineDebugLines, ...warrantyDebugLines].length > 0
          ? [...targetUnderlineDebugLines, ...warrantyDebugLines].join('\n')
          : '本次未捕获到目标英文下划线段落或保修期定向下划线调试信息。'
      );

      console.log('[DEBUG] 最终检测到', result.length, '个参数位置');
      console.log('[DEBUG] 下划线空格检测统计:', detectionStats);
      resolve(
        result
          .sort((a, b) => {
            if (a.paragraphIndex !== b.paragraphIndex) {
              return a.paragraphIndex - b.paragraphIndex;
            }
            return a.position.start - b.position.start;
          })
          .map((entry, index) => ({
            ...entry,
            index,
          }))
      );
    }).catch((error) => {
      console.error('[DEBUG] underline总错误:', error);
      resolve([]);
    });
  });
}
