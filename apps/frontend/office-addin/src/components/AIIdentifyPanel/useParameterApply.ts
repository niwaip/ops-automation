import { useState, useMemo, useEffect } from 'react';
import { useAppStore, AISuggestion } from '../../taskpane/store';

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

  const applySuggestionToDocument = async (suggestion: AISuggestion, onApplyComplete?: () => void): Promise<boolean> => {
    try {
      const capabilities = await hostAdapter.getCapabilities();
      if (!capabilities.canApplySuggestion) {
        addDebugLog('warn', '当前宿主暂不支持应用建议', capabilities.warnings?.join('\n'));
        return false;
      }

      await hostAdapter.applySuggestion(suggestion);
      applySuggestion(suggestion.id);
      addDebugLog('info', `应用建议成功`, `${suggestion.originalText} → ${suggestion.suggestedName}`);
      onApplyComplete?.();
      return true;
    } catch (error: any) {
      addDebugLog('error', '应用建议失败', error.message);
      return false;
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

    if (supportsSuggestionPreview && (!showPreview || previewAction !== mode)) {
      setPreviewAction(mode);
      setPreviewContent(generatePreviewSummary(items, actionLabel));
      setShowPreview(true);
      return;
    }

    let successCount = 0;
    for (const suggestion of items) {
      const applied = await applySuggestionToDocument(suggestion, onApplyComplete);
      if (applied) {
        successCount += 1;
      }
    }

    setShowPreview(false);
    setPreviewContent('');
    setPreviewAction('apply');
    setCollapsed(true);
    addDebugLog('info', `${actionLabel}完成`, `成功${actionLabel}了 ${successCount} / ${items.length} 个建议`);
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
      const applied = groupItems.filter((s) => s.applied);
      await applySuggestionBatch(applied, 'reapply', onApplyComplete);
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
