import { useState, useMemo, useEffect } from 'react';
import { useAppStore, AISuggestion } from '../../taskpane/store';
import { WordAPI } from '../../utils/office/word/api';

export function useParameterApply(hostAdapter: any, isExcelMode: boolean) {
  const store = useAppStore();
  const {
    suggestions,
    setSuggestions,
    applySuggestion,
    addDebugLog,
    excelSheetPairs,
    setExcelSheetPairs,
    dismissSuggestion,
    updateSuggestionName,
    updateSuggestionDetails,
  } = store;

  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewAction, setPreviewAction] = useState<'apply' | 'reapply'>('apply');
  const [activeManualAddGroup, setActiveManualAddGroup] = useState<string | null>(null);
  const [manualParamName, setManualParamName] = useState('d.');
  const [manualFormatter, setManualFormatter] = useState('');
  const [selectedContent, setSelectedContent] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [manualLoopMode, setManualLoopMode] = useState(false);
  const [manualArrayPath, setManualArrayPath] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [manualSignificance, setManualSignificance] = useState('');
  const [supportsSuggestionPreview, setSupportsSuggestionPreview] = useState(!isExcelMode);

  const [collapsedSuggestionGroups, setCollapsedSuggestionGroups] = useState<Record<string, boolean>>({});

  const visibleExcelPairs = useMemo(
    () => excelSheetPairs.filter((pair) => !pair.hidden),
    [excelSheetPairs]
  );

  useEffect(() => {
    let disposed = false;
    hostAdapter
      .getCapabilities()
      .then((capabilities: any) => {
        if (!disposed) {
          setSupportsSuggestionPreview(Boolean(capabilities.canPreviewSuggestion));
        }
      })
      .catch(() => {
        if (!disposed) {
          setSupportsSuggestionPreview(false);
        }
      });
    return () => {
      disposed = true;
    };
  }, [hostAdapter]);

  useEffect(() => {
    if (hostAdapter?.host !== 'word') {
      return undefined;
    }

    WordAPI.setDebugLogger((level, message, details) => {
      addDebugLog(level, message, details);
    });

    return () => {
      WordAPI.clearDebugLogger();
    };
  }, [addDebugLog, hostAdapter]);

  const suggestVariableNameFromText = (text: string): string => {
    const normalized = text.trim();
    if (!normalized) return 'd.textValue';

    // 提取所有的英文单词和数字，拼接作为变量名
    const asciiWords = normalized.match(/[A-Za-z0-9]+/g);
    if (asciiWords && asciiWords.length > 0) {
      return `d.${asciiWords.join('_').toLowerCase()}`;
    }

    // 默认回退
    return 'd.textValue';
  };

  type BatchApplyItem = {
    suggestion: AISuggestion;
    sourceSuggestions: AISuggestion[];
    targetKey?: string;
  };

  const normalizeSuggestionPath = (value: string): string => (
    String(value || '')
      .replace(/[{}]/g, '')
      .trim()
  );

  const extractSuggestionLanguageSuffix = (value: string): 'zh' | 'ja' | undefined => {
    const normalizedPath = normalizeSuggestionPath(value);
    if (/(?:_|\.)(?:cn|zh)$/iu.test(normalizedPath)) {
      return 'zh';
    }
    if (/(?:_|\.)(?:jp|ja)$/iu.test(normalizedPath)) {
      return 'ja';
    }
    return undefined;
  };

  const getSuggestionLanguageHint = (suggestion: AISuggestion): 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' => (
    suggestion.details?.currentLanguageHint
    || extractSuggestionLanguageSuffix(suggestion.suggestedName)
    || 'unknown'
  );

  const stripSuggestionLanguageSuffix = (value: string): string => (
    normalizeSuggestionPath(value)
      .replace(/(?:_|\.)(?:cn|zh|jp|ja)$/iu, '')
      .trim()
  );

  const isWordTableCellTarget = (targetKey: string | undefined): boolean => (
    Boolean(targetKey) && String(targetKey).startsWith('word:table-cell:')
  );

  const isWordTableLoopCellTarget = (targetKey: string | undefined): boolean => (
    Boolean(targetKey) && String(targetKey).startsWith('word:table-loop-cell:')
  );

  const buildSuggestionPairKey = (suggestion: AISuggestion): string | undefined => {
    const candidateId = String(suggestion.details?.candidateId || '').trim();
    const peerCandidateId = String(suggestion.details?.peerCandidateId || '').trim();
    if (candidateId && peerCandidateId) {
      return `candidate-pair:${[candidateId, peerCandidateId].sort().join('|')}`;
    }

    const language = getSuggestionLanguageHint(suggestion);
    const basePath = stripSuggestionLanguageSuffix(suggestion.suggestedName);
    if ((language === 'zh' || language === 'ja') && basePath) {
      return `path-pair:${basePath}`;
    }

    return undefined;
  };

  const hasBilingualSuggestionPair = (items: AISuggestion[]): boolean => {
    const languagesByPair = new Map<string, Set<'zh' | 'ja'>>();

    items.forEach((item) => {
      const pairKey = buildSuggestionPairKey(item);
      const language = getSuggestionLanguageHint(item);
      if (!pairKey || (language !== 'zh' && language !== 'ja')) {
        return;
      }
      const current = languagesByPair.get(pairKey) || new Set<'zh' | 'ja'>();
      current.add(language);
      languagesByPair.set(pairKey, current);
    });

    return Array.from(languagesByPair.values()).some((languages) =>
      languages.has('zh') && languages.has('ja')
    );
  };

  const sortSuggestionsForMergedApply = (items: AISuggestion[]): AISuggestion[] => {
    const firstIndexByPairKey = new Map<string, number>();
    items.forEach((item, index) => {
      const pairKey = buildSuggestionPairKey(item);
      if (pairKey && !firstIndexByPairKey.has(pairKey)) {
        firstIndexByPairKey.set(pairKey, index);
      }
    });

    const getLanguageOrder = (suggestion: AISuggestion): number => {
      const language = getSuggestionLanguageHint(suggestion);
      if (language === 'zh') {
        return 0;
      }
      if (language === 'ja') {
        return 1;
      }
      return 9;
    };

    return [...items].sort((left, right) => {
      const leftPairKey = buildSuggestionPairKey(left);
      const rightPairKey = buildSuggestionPairKey(right);
      const leftPairIndex = firstIndexByPairKey.get(leftPairKey || '') ?? Number.MAX_SAFE_INTEGER;
      const rightPairIndex = firstIndexByPairKey.get(rightPairKey || '') ?? Number.MAX_SAFE_INTEGER;
      const leftPairOrdinal = typeof left.details?.pairOrdinal === 'number' ? left.details.pairOrdinal : Number.MAX_SAFE_INTEGER;
      const rightPairOrdinal = typeof right.details?.pairOrdinal === 'number' ? right.details.pairOrdinal : Number.MAX_SAFE_INTEGER;

      if (leftPairKey && rightPairKey && leftPairKey === rightPairKey) {
        return getLanguageOrder(left) - getLanguageOrder(right);
      }

      if (leftPairOrdinal !== rightPairOrdinal) {
        return leftPairOrdinal - rightPairOrdinal;
      }

      if (leftPairIndex !== rightPairIndex) {
        return leftPairIndex - rightPairIndex;
      }

      return items.indexOf(left) - items.indexOf(right);
    });
  };

  const buildMergedSuggestionName = (items: AISuggestion[]): string => {
    const orderedSuggestions = sortSuggestionsForMergedApply(items);
    return Array.from(new Set(
      orderedSuggestions
        .map((item) => String(item.suggestedName || '').trim())
        .filter(Boolean)
    )).join('\n');
  };

  const shouldMergeSuggestionsForTarget = (targetKey: string | undefined, items: AISuggestion[]): boolean => {
    if (!targetKey || items.length <= 1) {
      return false;
    }

    if (isWordTableLoopCellTarget(targetKey)) {
      return false;
    }

    return isWordTableCellTarget(targetKey) && hasBilingualSuggestionPair(items);
  };

  const formatSuggestionSummaryLine = (suggestion: AISuggestion, index: number): string => (
    [
      `${index + 1}. ${suggestion.originalText || suggestion.elementPath || suggestion.id}`,
      `marker=${String(suggestion.suggestedName || '').trim() || '(empty)'}`,
      `candidateId=${String(suggestion.details?.candidateId || '').trim() || '(none)'}`,
      `lang=${getSuggestionLanguageHint(suggestion)}`,
    ].join(' | ')
  );

  const formatApplyDebugBlock = (
    title: string,
    item: BatchApplyItem,
    extraLines: Array<string | undefined> = [],
  ): string => (
    [
      `[${title}]`,
      `target=${item.targetKey || item.suggestion.elementPath || 'unknown'}`,
      `sourceCount=${item.sourceSuggestions.length}`,
      ...extraLines.filter(Boolean),
      'sources:',
      ...sortSuggestionsForMergedApply(item.sourceSuggestions).map(formatSuggestionSummaryLine),
      'mergedOutput:',
      item.suggestion.suggestedName || '(empty)',
    ].join('\n')
  );

  const extractWordLoopArrayPath = (suggestion: AISuggestion): string => {
    const directPath = String(suggestion.details?.arrayPath || '').trim();
    if (directPath) {
      return directPath.replace(/\[(?:i(?:\+\d+)?)?\]$/u, '');
    }

    const normalizedName = String(suggestion.suggestedName || '').trim();
    const loopMatch = normalizedName.match(/\{#([^}]+)\}/u);
    if (loopMatch?.[1]) {
      return loopMatch[1].trim();
    }

    const variableMatch = normalizedName
      .replace(/[{}]/g, '')
      .match(/^(d\.[A-Za-z_][A-Za-z0-9_.]*)\[(?:i(?:\+\d+)?)?\]\.[A-Za-z_][A-Za-z0-9_]*$/u);
    return variableMatch?.[1]?.trim() || '';
  };

  const buildSuggestionTargetKey = (suggestion: AISuggestion): string | undefined => {
    const wordAnchor = suggestion.details?.wordAnchor as
      | {
          type?: string;
          contentControlId?: number;
          tableIndex?: number;
          rowIndex?: number;
          cellIndex?: number;
          paragraphIndex?: number;
          start?: number;
          end?: number;
        }
      | undefined;

    const normalizedSuggestedName = String(suggestion.suggestedName || '').trim();
    const isWordTableLoopRelated = wordAnchor?.type === 'table-cell' && (
      suggestion.type === 'loop'
      || Boolean(String(suggestion.details?.arrayPath || '').trim())
      || /\{#.+\}\{\/.+\}/u.test(normalizedSuggestedName)
      || /\[[^\]]*\]\./u.test(normalizedSuggestedName.replace(/[{}]/g, ''))
    );

    // 循环表格需要按列分别写入下一行，并自动补开始/结束标记，不能再按原锚点合并成多行文本。
    if (isWordTableLoopRelated) {
      const loopArrayPath = extractWordLoopArrayPath(suggestion);
      if (
        suggestion.type !== 'loop'
        && typeof wordAnchor?.tableIndex === 'number'
        && typeof wordAnchor?.rowIndex === 'number'
        && typeof wordAnchor?.cellIndex === 'number'
        && loopArrayPath
      ) {
        return `word:table-loop-cell:${wordAnchor.tableIndex}:${wordAnchor.rowIndex}:${wordAnchor.cellIndex}:${loopArrayPath}`;
      }
      return undefined;
    }

    if (wordAnchor?.type === 'content-control' && typeof wordAnchor.contentControlId === 'number') {
      return `word:content-control:${wordAnchor.contentControlId}`;
    }

    if (
      wordAnchor?.type === 'table-cell'
      && typeof wordAnchor.tableIndex === 'number'
      && typeof wordAnchor.rowIndex === 'number'
      && typeof wordAnchor.cellIndex === 'number'
    ) {
      return `word:table-cell:${wordAnchor.tableIndex}:${wordAnchor.rowIndex}:${wordAnchor.cellIndex}`;
    }

    if (
      wordAnchor?.type === 'text-range'
      && typeof wordAnchor.paragraphIndex === 'number'
      && typeof wordAnchor.start === 'number'
      && typeof wordAnchor.end === 'number'
    ) {
      return `word:text-range:${wordAnchor.paragraphIndex}:${wordAnchor.start}:${wordAnchor.end}`;
    }

    const underlineInfo = suggestion.underlineInfo;
    if (
      typeof underlineInfo?.paragraphIndex === 'number'
      && typeof underlineInfo?.position?.start === 'number'
      && typeof underlineInfo?.position?.end === 'number'
    ) {
      return `word:underline:${underlineInfo.paragraphIndex}:${underlineInfo.position.start}:${underlineInfo.position.end}`;
    }

    const excelAnchor = suggestion.details?.excelAnchor as
      | { type?: string; sheetName?: string; address?: string; tableName?: string; pairIndex?: number }
      | undefined;
    if (excelAnchor?.type === 'cell' && excelAnchor.sheetName && excelAnchor.address) {
      return `excel:cell:${excelAnchor.sheetName}:${excelAnchor.address}`;
    }
    if (excelAnchor?.type === 'table' && excelAnchor.sheetName && excelAnchor.tableName) {
      return `excel:table:${excelAnchor.sheetName}:${excelAnchor.tableName}:${excelAnchor.pairIndex ?? 'na'}`;
    }

    const contextKey = String(suggestion.context || suggestion.details?.context || '').trim();
    if (contextKey) {
      return `context:${contextKey}`;
    }

    return undefined;
  };

  const buildBatchApplyItems = (items: AISuggestion[]): BatchApplyItem[] => {
    const indexedItems = items.map((suggestion, index) => ({
      suggestion,
      index,
      targetKey: buildSuggestionTargetKey(suggestion),
    }));
    const groupedIndexes = new Set<number>();
    const indexedSuggestionsByTarget = new Map<string, Array<typeof indexedItems[number]>>();

    indexedItems.forEach((entry) => {
      if (!entry.targetKey) {
        return;
      }
      const current = indexedSuggestionsByTarget.get(entry.targetKey) || [];
      current.push(entry);
      indexedSuggestionsByTarget.set(entry.targetKey, current);
    });

    const result: BatchApplyItem[] = [];
    indexedItems.forEach((entry) => {
      if (groupedIndexes.has(entry.index)) {
        return;
      }

      const targetEntries = entry.targetKey
        ? (indexedSuggestionsByTarget.get(entry.targetKey) || [])
        : [];
      const sourceSuggestions = shouldMergeSuggestionsForTarget(
        entry.targetKey,
        targetEntries.map((item) => item.suggestion)
      )
        ? targetEntries.map((item) => item.suggestion)
        : [entry.suggestion];

      if (sourceSuggestions.length > 1) {
        targetEntries.forEach((item) => groupedIndexes.add(item.index));
      } else {
        groupedIndexes.add(entry.index);
      }

      result.push({
        suggestion: sourceSuggestions.length > 1
          ? {
              ...entry.suggestion,
              suggestedName: buildMergedSuggestionName(sourceSuggestions),
            }
          : entry.suggestion,
        sourceSuggestions,
        targetKey: entry.targetKey,
      });
    });

    return result;
  };

  const applySuggestionToDocument = async (
    suggestion: AISuggestion,
    onApplyComplete?: () => void
  ): Promise<{ success: boolean; reason?: string }> => {
    try {
      const capabilities = await hostAdapter.getCapabilities();
      if (!capabilities.canApplySuggestion) {
        addDebugLog('warn', '当前宿主暂不支持应用建议', capabilities.warnings?.join('\n'));
        return {
          success: false,
          reason: capabilities.warnings?.join('\n') || '当前宿主暂不支持应用建议',
        };
      }

      await hostAdapter.applySuggestion(suggestion);
      applySuggestion(suggestion.id);
      addDebugLog('info', `应用建议成功`, `${suggestion.originalText} → ${suggestion.suggestedName}`);
      onApplyComplete?.();
      return { success: true };
    } catch (error: any) {
      const reason = error?.message || '未知错误';
      addDebugLog('error', '应用建议失败', `${suggestion.originalText} → ${suggestion.suggestedName}\n${reason}`);
      return { success: false, reason };
    }
  };

  const applyBatchItemToDocument = async (
    item: BatchApplyItem,
    onApplyComplete?: () => void
  ): Promise<{ success: boolean; reason?: string; logBlock?: string }> => {
    try {
      const capabilities = await hostAdapter.getCapabilities();
      if (!capabilities.canApplySuggestion) {
        return {
          success: false,
          reason: capabilities.warnings?.join('\n') || '当前宿主暂不支持应用建议',
          logBlock: formatApplyDebugBlock('apply-skipped', item, [
            `reason=${capabilities.warnings?.join(' | ') || '当前宿主暂不支持应用建议'}`,
          ]),
        };
      }

      await hostAdapter.applySuggestion(item.suggestion);
      item.sourceSuggestions.forEach((sourceSuggestion) => applySuggestion(sourceSuggestion.id));
      onApplyComplete?.();
      return {
        success: true,
        logBlock: formatApplyDebugBlock(
          item.sourceSuggestions.length > 1 ? 'apply-merged-success' : 'apply-success',
          item,
          item.targetKey?.startsWith('word:table-loop-cell:')
            ? [`arrayPath=${extractWordLoopArrayPath(item.suggestion) || '(none)'}`]
            : [],
        ),
      };
    } catch (error: any) {
      const reason = error?.message || '未知错误';
      return {
        success: false,
        reason,
        logBlock: formatApplyDebugBlock(
          item.sourceSuggestions.length > 1 ? 'apply-merged-failed' : 'apply-failed',
          item,
          [`reason=${reason}`],
        ),
      };
    }
  };

  const handleApplySingle = async (suggestion: AISuggestion, onApplyComplete?: () => void) => {
    await applySuggestionToDocument(suggestion, onApplyComplete);
  };

  const generatePreviewSummary = (items: AISuggestion[], actionLabel: string): string => {
    const lines = items.map((s, i) => `${i + 1}. "${s.originalText}" → ${s.suggestedName}`);
    return `即将${actionLabel} ${items.length} 个替换:\n\n${lines.join('\n')}`;
  };

  const applySuggestionBatch = async (
    items: AISuggestion[],
    mode: 'apply' | 'reapply',
    onApplyComplete?: () => void
  ) => {
    if (items.length === 0) {
      addDebugLog('info', mode === 'apply' ? '没有待应用参数' : '没有可重新应用的参数');
      setShowPreview(false);
      setPreviewContent('');
      setPreviewAction('apply');
      return;
    }

    const actionLabel = mode === 'apply' ? '应用' : '重新应用';
    setPreviewAction(mode);
    setPreviewContent(generatePreviewSummary(items, actionLabel));
    setShowPreview(false);

    const batchItems = buildBatchApplyItems(items);
    const mergedSuggestionCount = batchItems.reduce(
      (total, item) => total + Math.max(0, item.sourceSuggestions.length - 1),
      0
    );

    let successCount = 0;
    let successSuggestionCount = 0;
    const failedReasons: string[] = [];
    const batchLogBlocks: string[] = [];
    for (const item of batchItems) {
      const result = await applyBatchItemToDocument(item, onApplyComplete);
      if (result.logBlock) {
        batchLogBlocks.push(result.logBlock);
      }
      if (result.success) {
        successCount += 1;
        successSuggestionCount += item.sourceSuggestions.length;
      } else {
        failedReasons.push(
          `${item.suggestion.originalText || item.suggestion.elementPath || item.suggestion.suggestedName}: ${result.reason || '未知错误'}`
        );
      }
    }

    setShowPreview(false);
    setPreviewContent('');
    setPreviewAction('apply');
    setCollapsed(true);
    addDebugLog(
      failedReasons.length > 0 ? 'warn' : 'info',
      `${actionLabel}完成`,
      [
        `成功${actionLabel}了 ${successSuggestionCount} / ${items.length} 个建议`,
        `实际写入目标 ${successCount} / ${batchItems.length} 个`,
        mergedSuggestionCount > 0 ? `同锚点合并 ${mergedSuggestionCount} 条建议，避免后写覆盖前写` : undefined,
        failedReasons.length > 0 ? '' : undefined,
        failedReasons.length > 0 ? '失败原因:' : undefined,
        ...(failedReasons.length > 0 ? failedReasons.slice(0, 10).map((item, index) => `${index + 1}. ${item}`) : []),
        batchLogBlocks.length > 0 ? '' : undefined,
        batchLogBlocks.length > 0 ? '应用明细:' : undefined,
        ...(batchLogBlocks.length > 0 ? [batchLogBlocks.join('\n\n')] : []),
      ].filter(Boolean).join('\n')
    );
  };

  const handleApplyAll = async (onApplyComplete?: () => void) => {
    try {
      const unapplied = suggestions.filter((s) => !s.applied);
      await applySuggestionBatch(unapplied, 'apply', onApplyComplete);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      addDebugLog('error', '批量应用失败', message);
    }
  };

  const handleReapplyAll = async (onApplyComplete?: () => void) => {
    try {
      await applySuggestionBatch(suggestions, 'reapply', onApplyComplete);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      addDebugLog('error', '重新应用失败', message);
    }
  };

  const handleCancelPreview = () => {
    setShowPreview(false);
    setPreviewContent('');
    setPreviewAction('apply');
  };

  const handleGetSelection = async () => {
    try {
      const selection = await hostAdapter.extractSelection();
      if (!selection || !selection.text) {
        addDebugLog('warn', `获取选中内容失败`, '当前宿主未返回可用选区');
        return;
      }

      setSelectedContent(selection.text);
      addDebugLog('info', `获取选中内容`, `内容: ${selection.text.substring(0, 50)}...`);
    } catch (error: any) {
      addDebugLog('error', `获取选中内容失败`, error.message);
    }
  };

  const generateManualMarker = (): string => {
    let marker = `{${manualParamName}`;
    if (manualFormatter) {
      marker += `:${manualFormatter}`;
    }
    marker += '}';

    if (manualLoopMode && manualArrayPath) {
      marker = `{#${manualArrayPath}}${marker}{/${manualArrayPath}}`;
    }
    return marker;
  };

  const handleAIGenerateVariableName = async () => {
    if (!selectedContent) {
      addDebugLog('warn', '请先获取选中内容');
      return;
    }

    setIsGeneratingAI(true);
    try {
      const variableName = suggestVariableNameFromText(selectedContent);
      setManualParamName(variableName);
      addDebugLog('info', `AI生成变量名`, `${variableName}`);
    } catch (error: any) {
      addDebugLog('error', `AI生成失败`, error.message);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleManualAddParam = async (targetGroupName: string) => {
    if (!manualParamName || manualParamName.trim() === '') {
      addDebugLog('warn', '请输入参数名称');
      return;
    }

    const marker = generateManualMarker();

    const newSuggestion: AISuggestion = {
      id: `manual-${Date.now()}`,
      type: manualLoopMode ? 'loop' : 'variable',
      elementPath: selectedContent ? `【${selectedContent.substring(0, 30)}...】` : '手动添加',
      suggestedName: marker,
      originalText: selectedContent || '手动添加的参数',
      confidence: 1.0,
      applied: false,
      context: selectedContent || '用户手动添加',
      details: {
        source: 'manual',
        description: manualSignificance || '用户手动补充的参数说明',
        chapter: targetGroupName,
        significance: manualSignificance || '用户自定义参数',
        displayPosition: selectedContent ? `【${selectedContent.substring(0, 30)}...】` : '手动添加',
        context: selectedContent || '',
        fieldType: manualLoopMode ? 'loop' : 'text',
        formatter: manualFormatter,
        arrayPath: manualLoopMode ? manualArrayPath : undefined,
        beforeBlank: selectedContent ? selectedContent.substring(0, 15) : '',
        afterBlank: selectedContent ? selectedContent.substring(Math.max(0, selectedContent.length - 15)) : '',
        excelAnchor: isExcelMode ? { sheetName: targetGroupName, type: 'cell' } : undefined,
      }
    };

    setSuggestions([...suggestions, newSuggestion]);
    addDebugLog('info', `手动添加参数到列表`, `参数名: ${marker} (${targetGroupName})`);

    setActiveManualAddGroup(null);
    setSelectedContent('');
    setManualParamName('d.');
    setManualFormatter('');
    setManualLoopMode(false);
    setManualArrayPath('');
    setManualSignificance('');
    setCollapsed(false);
  };

  const toggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  const handleClearSuggestions = () => {
    setSuggestions([]);
    addDebugLog('info', '已清除参数列表');
  };

  const handleSetVisibleExcelPairsCompare = (compare: boolean) => {
    const visiblePairIds = new Set(visibleExcelPairs.map((pair) => pair.id));
    setExcelSheetPairs(
      excelSheetPairs.map((pair) => (
        visiblePairIds.has(pair.id)
          ? { ...pair, compare }
          : pair
      ))
    );
    addDebugLog('info', compare ? '已全选参考卡片组' : '已全部不选参考卡片组');
  };

  const getSuggestionGroupName = (suggestion: AISuggestion): string => {
    if (isExcelMode) {
      return suggestion.details?.excelAnchor?.sheetName
        || suggestion.details?.chapter
        || '未归属 Sheet';
    }
    return suggestion.details?.chapter || '默认分组';
  };

  const groupSuggestions = (): Record<string, AISuggestion[]> => {
    const grouped: Record<string, AISuggestion[]> = {};

    for (const suggestion of suggestions) {
      const groupName = getSuggestionGroupName(suggestion);
      if (!grouped[groupName]) {
        grouped[groupName] = [];
      }
      grouped[groupName].push(suggestion);
    }

    if (isExcelMode) {
      const sortedKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
      const sortedGrouped: Record<string, AISuggestion[]> = {};
      for (const key of sortedKeys) {
        sortedGrouped[key] = grouped[key];
      }
      return sortedGrouped;
    }

    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      // 提取可能的数字编号进行排序（例如 "第1章", "Section 2"）
      const getNumber = (str: string) => {
        const match = str.match(/\d+/);
        return match ? parseInt(match[0], 10) : 999;
      };
      
      const aNum = getNumber(a);
      const bNum = getNumber(b);
      
      if (aNum !== bNum) {
        return aNum - bNum;
      }
      // 如果没有数字，按字母顺序排序
      return a.localeCompare(b, 'zh-Hans-CN');
    });

    const sortedGrouped: Record<string, AISuggestion[]> = {};
    for (const key of sortedKeys) {
      sortedGrouped[key] = grouped[key];
    }

    return sortedGrouped;
  };

  const groupedSuggestions = groupSuggestions();

  const toggleSuggestionGroupCollapse = (groupName: string) => {
    setCollapsedSuggestionGroups((current) => ({
      ...current,
      [groupName]: !current[groupName],
    }));
  };

  const getGroupIcon = (groupName: string): string => {
    if (isExcelMode) return '📊';
    
    const match = groupName.match(/\d+/);
    if (match) return '📝';
    
    return '📑';
  };

  const handleApplyGroup = async (groupName: string, onApplyComplete?: () => void) => {
    try {
      const groupItems = groupedSuggestions[groupName] || [];
      const unapplied = groupItems.filter((s) => !s.applied);
      await applySuggestionBatch(unapplied, 'apply', onApplyComplete);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      addDebugLog('error', `应用分组[${groupName}]失败`, message);
    }
  };

  const handleReapplyGroup = async (groupName: string, onApplyComplete?: () => void) => {
    try {
      const groupItems = groupedSuggestions[groupName] || [];
      await applySuggestionBatch(groupItems, 'reapply', onApplyComplete);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      addDebugLog('error', `重新应用分组[${groupName}]失败`, message);
    }
  };

  return {
    showPreview,
    previewContent,
    previewAction,
    activeManualAddGroup,
    setActiveManualAddGroup,
    manualParamName,
    setManualParamName,
    manualFormatter,
    setManualFormatter,
    selectedContent,
    collapsed,
    manualLoopMode,
    setManualLoopMode,
    manualArrayPath,
    setManualArrayPath,
    isGeneratingAI,
    manualSignificance,
    setManualSignificance,
    supportsSuggestionPreview,
    
    visibleExcelPairs,
    suggestions,
    dismissSuggestion,
    updateSuggestionName,
    updateSuggestionDetails,

    collapsedSuggestionGroups,
    toggleSuggestionGroupCollapse,

    handleApplySingle,
    handleApplyAll,
    handleReapplyAll,
    handleApplyGroup,
    handleReapplyGroup,
    handleCancelPreview,
    handleGetSelection,
    generateManualMarker,
    handleAIGenerateVariableName,
    handleManualAddParam,
    toggleCollapse,
    handleClearSuggestions,
    handleSetVisibleExcelPairsCompare,
    groupedSuggestions,
    getGroupIcon,
  };
}
