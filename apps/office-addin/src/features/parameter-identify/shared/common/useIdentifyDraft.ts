import { useEffect, useState } from 'react';
import { carboneAPI } from '../../../../api/carbone-api';
import type {
  TemplateRenderDataResponse,
  TemplateWorkflowSummary,
  WorkflowTermAssets,
} from '../../../../api/carbone-api';
import type { AISuggestion } from '../../../../app/store';
import type {
  DraftInfo,
  LatestBackendDraftInfo,
  TemplateAssetDraftInfo,
  TemplateAssetNotice,
} from './identify-panel.types';

type DraftSnapshotData = {
  draftId?: string;
  templateType?: string;
  suggestions?: AISuggestion[];
  aiSkillGuide?: any;
  aiDescription?: string;
  aiGeneratedData?: any;
  templateAssetDraftInfo?: TemplateAssetDraftInfo;
  workflowDraftInfo?: TemplateAssetDraftInfo;
  parameterCount?: number;
  variables?: unknown;
  templateName?: string;
  savedAt?: string;
};

type ExcelDraftRuntime = {
  sheetPairs: any[];
  setSheetPairs: (pairs: any[]) => void;
  resetWorkbookUnderstanding: () => void;
  prepareWorkbookForDraft: () => Promise<{
    renamedSheets: Array<{ from: string; to: string }>;
    deletedSheets: string[];
    frozenFormulaCount: number;
  }>;
};

interface UseIdentifyDraftOptions {
  apiBaseUrl: string;
  officeType: string;
  draftStorageKey: string;
  hostDocumentFormat: string;
  selectedTemplateType: string;
  setSelectedTemplateType: (value: string) => void;
  suggestions: AISuggestion[];
  setSuggestions: (suggestions: AISuggestion[]) => void;
  aiSkillGuide: any;
  setAiSkillGuide: (value: any) => void;
  aiDescription: string;
  setAiDescription: (value: string) => void;
  aiGeneratedData: any;
  setAiGeneratedData: (value: any) => void;
  templateName: string;
  setTemplateName: (value: string) => void;
  templateConfig: any;
  addDebugLog: (level: 'info' | 'warn' | 'error' | 'debug', message: string, details?: string) => void;
  loadTemplateSource: () => Promise<{ documentContent: string; format: string }>;
  isExcelMode: boolean;
  excelDraftRuntime?: ExcelDraftRuntime;
  setTemplateFieldSpecsDraft: (specs: any[]) => void;
  setTemplateTermAssetsDraft: (value: WorkflowTermAssets | null) => void;
  setTemplateTermAssetsText: (value: string) => void;
  setTemplateAssetRenderDiagnostics: (value: TemplateRenderDataResponse | null) => void;
  setTemplateAssetNotice: (value: TemplateAssetNotice | null) => void;
  extractTemplateAssetDraftInfo: (workflow?: TemplateWorkflowSummary | null) => TemplateAssetDraftInfo | null;
}

export function useIdentifyDraft({
  apiBaseUrl,
  officeType,
  draftStorageKey,
  hostDocumentFormat,
  selectedTemplateType,
  setSelectedTemplateType,
  suggestions,
  setSuggestions,
  aiSkillGuide,
  setAiSkillGuide,
  aiDescription,
  setAiDescription,
  aiGeneratedData,
  setAiGeneratedData,
  templateName,
  setTemplateName,
  templateConfig,
  addDebugLog,
  loadTemplateSource,
  isExcelMode,
  excelDraftRuntime,
  setTemplateFieldSpecsDraft,
  setTemplateTermAssetsDraft,
  setTemplateTermAssetsText,
  setTemplateAssetRenderDiagnostics,
  setTemplateAssetNotice,
  extractTemplateAssetDraftInfo,
}: UseIdentifyDraftOptions) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftInfo, setDraftInfo] = useState<DraftInfo | null>(null);
  const [latestBackendDraftInfo, setLatestBackendDraftInfo] = useState<LatestBackendDraftInfo | null>(null);
  const [templateAssetDraftInfo, setTemplateAssetDraftInfo] = useState<TemplateAssetDraftInfo | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const resolveDraftParameterCount = (data: {
    suggestions?: unknown;
    parameterCount?: unknown;
    aiSkillGuide?: { parameters?: unknown } | null;
    variables?: unknown;
  }): number => {
    if (typeof data.parameterCount === 'number' && data.parameterCount > 0) {
      return data.parameterCount;
    }
    if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
      return data.suggestions.length;
    }
    const skillParameters = data.aiSkillGuide && Array.isArray(data.aiSkillGuide.parameters)
      ? data.aiSkillGuide.parameters
      : [];
    if (skillParameters.length > 0) {
      return skillParameters.length;
    }
    if (Array.isArray(data.variables) && data.variables.length > 0) {
      return data.variables.length;
    }
    return 0;
  };

  const applyDraftSnapshot = (
    data: DraftSnapshotData | null,
    options?: { logRestore?: boolean; restoreSuggestions?: boolean; restoreSkillGuide?: boolean }
  ) => {
    if (!data) {
      return;
    }

    if (data.draftId) {
      setDraftId(data.draftId);
    }
    if (data.templateType) {
      setSelectedTemplateType(data.templateType);
    }
    const shouldRestoreSuggestions = options?.restoreSuggestions !== false;
    if (shouldRestoreSuggestions && Array.isArray(data.suggestions)) {
      setSuggestions(data.suggestions);
      if (options?.logRestore !== false) {
        addDebugLog('info', '已从暂存副本恢复参数', `恢复 ${data.suggestions.length} 个参数，后续识别结果会与未覆盖的旧参数合并显示`);
      }
    }
    if (options?.restoreSkillGuide !== false && data.aiSkillGuide) {
      setAiSkillGuide(data.aiSkillGuide);
    }
    if (typeof data.aiDescription === 'string') {
      setAiDescription(data.aiDescription);
      try {
        setAiGeneratedData(JSON.parse(data.aiDescription));
      } catch {
        setAiGeneratedData(data.aiGeneratedData ?? null);
      }
    } else if (data.aiGeneratedData) {
      setAiGeneratedData(data.aiGeneratedData);
      setAiDescription(JSON.stringify(data.aiGeneratedData, null, 2));
    }
    if (typeof data.templateName === 'string') {
      setTemplateName(data.templateName);
    }
    if (data.draftId) {
      const parameterCount = resolveDraftParameterCount(data);
      setDraftInfo({
        templateType: data.templateType || 'unknown',
        parameterCount,
        savedAt: data.savedAt || '',
      });
    }
    const restoredTemplateAssetDraftInfo = data.templateAssetDraftInfo || data.workflowDraftInfo;
    if (restoredTemplateAssetDraftInfo) {
      setTemplateAssetDraftInfo(restoredTemplateAssetDraftInfo);
      setTemplateTermAssetsDraft(restoredTemplateAssetDraftInfo.termAssets || null);
      setTemplateTermAssetsText(
        restoredTemplateAssetDraftInfo.termAssets
          ? JSON.stringify(restoredTemplateAssetDraftInfo.termAssets, null, 2)
          : ''
      );
    }
  };

  const readDraftSnapshot = (): DraftSnapshotData | null => {
    const stagedData = localStorage.getItem(draftStorageKey);
    if (!stagedData) {
      return null;
    }
    try {
      return JSON.parse(stagedData) as DraftSnapshotData;
    } catch {
      return null;
    }
  };

  const parseDraftSequence = (fileName?: string): number => {
    const match = String(fileName || '').trim().match(/^draft-(\d+)/i);
    return match ? Number(match[1]) : 0;
  };

  const findLatestBackendDraft = async () => {
    carboneAPI.setBaseUrl(apiBaseUrl);
    const response = await carboneAPI.getTemplates({ includeDrafts: true });
    const templates = Array.isArray(response?.templates) ? response.templates : [];
    const draftTemplates = templates.filter(
      (template) =>
        String(template.fileName || '').trim().toLowerCase().startsWith('draft-')
        && template.format === hostDocumentFormat
    );
    if (draftTemplates.length === 0) {
      return null;
    }
    return draftTemplates.sort((a, b) => {
      const seqDelta = parseDraftSequence(b.fileName) - parseDraftSequence(a.fileName);
      if (seqDelta !== 0) {
        return seqDelta;
      }
      const timeA = new Date(String(a.createdAt || a.uploadedAt || 0)).getTime() || 0;
      const timeB = new Date(String(b.createdAt || b.uploadedAt || 0)).getTime() || 0;
      return timeB - timeA;
    })[0];
  };

  const refreshLatestBackendDraftInfo = async () => {
    try {
      const latestBackendDraft = await findLatestBackendDraft();
      if (!latestBackendDraft?.id) {
        setLatestBackendDraftInfo(null);
        return;
      }
      setLatestBackendDraftInfo({
        id: latestBackendDraft.id,
        fileName: String(latestBackendDraft.fileName || `${latestBackendDraft.id}.${latestBackendDraft.format || hostDocumentFormat}`),
        savedAt: String(latestBackendDraft.createdAt || latestBackendDraft.uploadedAt || ''),
      });
    } catch {
      setLatestBackendDraftInfo(null);
    }
  };

  useEffect(() => {
    const snapshot = readDraftSnapshot();
    if (snapshot?.draftId) {
      applyDraftSnapshot(snapshot, {
        logRestore: false,
        restoreSuggestions: false,
        restoreSkillGuide: false,
      });
    }
  }, []);

  useEffect(() => {
    refreshLatestBackendDraftInfo();
  }, [apiBaseUrl, hostDocumentFormat]);

  const handleSaveDraft = async () => {
    if (!aiSkillGuide) {
      setTemplateAssetNotice({ type: 'error', message: '请先生成模板指南' });
      return;
    }

    setIsSavingDraft(true);
    try {
      let nextSuggestions = suggestions;
      if (isExcelMode && excelDraftRuntime) {
        const workbookResult = await excelDraftRuntime.prepareWorkbookForDraft();
        if (workbookResult.renamedSheets.length > 0) {
          const renameMap = new Map(workbookResult.renamedSheets.map((item) => [item.from, item.to]));
          nextSuggestions = suggestions.map((suggestion) => {
            const anchorSheetName = suggestion.details?.excelAnchor?.sheetName;
            const chapter = suggestion.details?.chapter;
            const renamedSheetName = (anchorSheetName && renameMap.get(anchorSheetName)) || (chapter && renameMap.get(chapter));
            if (!renamedSheetName) {
              return suggestion;
            }

            const nextElementPath = suggestion.elementPath.replace(/^[^!]+!/, `${renamedSheetName}!`);
            return {
              ...suggestion,
              elementPath: nextElementPath,
              details: {
                ...suggestion.details,
                chapter: renamedSheetName,
                excelAnchor: suggestion.details?.excelAnchor
                  ? { ...suggestion.details.excelAnchor, sheetName: renamedSheetName }
                  : suggestion.details?.excelAnchor,
              },
            };
          });
          setSuggestions(nextSuggestions);
        }

        excelDraftRuntime.setSheetPairs(
          excelDraftRuntime.sheetPairs.map((pair) => {
            const renamedLeftSheet = pair.leftSheetName
              ? workbookResult.renamedSheets.find((item) => item.from === pair.leftSheetName)?.to
              : undefined;
            return workbookResult.deletedSheets.includes(pair.rightSheetName || '')
              ? {
                  ...pair,
                  compare: false,
                  leftSheetName: renamedLeftSheet || pair.leftSheetName,
                  rightSheetName: undefined,
                  rightSheetIndex: undefined,
                }
              : {
                  ...pair,
                  leftSheetName: renamedLeftSheet || pair.leftSheetName,
                };
          })
        );
        excelDraftRuntime.resetWorkbookUnderstanding();
        addDebugLog(
          'info',
          '已整理 Excel 草稿工作簿',
          `删除数据 sheet ${workbookResult.deletedSheets.length} 个，重命名模板 sheet ${workbookResult.renamedSheets.length} 个，冻结公式 ${workbookResult.frozenFormulaCount} 处`
        );
      }

      const { documentContent, format } = await loadTemplateSource();
      carboneAPI.setBaseUrl(apiBaseUrl);

      const result = await carboneAPI.saveTemplateFull({
        documentContent,
        suggestions: nextSuggestions,
        templateConfig,
        skill: aiSkillGuide,
        format,
        templateName: `draft-${Date.now()}`,
      });

      if (result.success) {
        setDraftId(result.templateId || null);
        const parameterCount = resolveDraftParameterCount({ suggestions: nextSuggestions, aiSkillGuide });

        setDraftInfo({
          templateType: selectedTemplateType,
          parameterCount,
          savedAt: new Date().toISOString(),
        });
        setTemplateAssetNotice({
          type: 'success',
          message: `✅ 模板资产暂存成功！ID: ${result.templateId}`,
          lines: ['当前暂存仅保存模板资产与可选指南，不会直接创建工作流。'],
        });

        localStorage.setItem(draftStorageKey, JSON.stringify({
          draftId: result.templateId,
          officeType,
          documentFormat: hostDocumentFormat,
          templateType: selectedTemplateType,
          suggestions: nextSuggestions,
          aiSkillGuide,
          aiDescription,
          aiGeneratedData,
          templateAssetDraftInfo: undefined,
          workflowDraftInfo: undefined,
          templateName,
          savedAt: new Date().toISOString(),
        }));
        setTemplateAssetDraftInfo(null);
        setTemplateFieldSpecsDraft([]);
        setTemplateTermAssetsDraft(null);
        setTemplateTermAssetsText('');
      } else {
        setTemplateAssetNotice({ type: 'error', message: `暂存失败: ${result.error || '未知错误'}` });
      }
      await refreshLatestBackendDraftInfo();
    } catch (error: any) {
      setTemplateAssetNotice({ type: 'error', message: `暂存失败: ${error.message}` });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleLoadDraft = async () => {
    try {
      const snapshot = readDraftSnapshot();
      let effectiveDraftId = draftId || snapshot?.draftId || null;
      if (!effectiveDraftId) {
        const latestBackendDraft = await findLatestBackendDraft();
        if (!latestBackendDraft?.id) {
          if (snapshot?.draftId) {
            const parameterCount = resolveDraftParameterCount(snapshot);
            applyDraftSnapshot(snapshot);
            setTemplateAssetNotice({
              type: 'success',
              message: '✅ 已从本地暂存恢复草稿',
              lines: [`${snapshot.templateType || selectedTemplateType} · ${parameterCount} 参数 · ID: ${String(snapshot.draftId).substring(0, 8)}...`],
            });
            return;
          }
          setTemplateAssetNotice({ type: 'info', message: '没有可恢复的本地最新草稿，后端也没有 draft-* 暂存副本' });
          return;
        }
        effectiveDraftId = latestBackendDraft.id;
      }

      carboneAPI.setBaseUrl(apiBaseUrl);
      const template = await carboneAPI.getTemplate(effectiveDraftId);
      const templateSuggestions = Array.isArray(template.suggestions) ? template.suggestions : [];
      const skill =
        template.skillId
          ? await carboneAPI.getSkill(template.skillId).catch(() => aiSkillGuide)
          : aiSkillGuide;

      const restoredDraft: DraftSnapshotData = {
        draftId: template.id,
        templateType: template.config?.templateType || selectedTemplateType,
        suggestions: templateSuggestions,
        aiSkillGuide: skill || aiSkillGuide,
        templateAssetDraftInfo: extractTemplateAssetDraftInfo(template.templateWorkflow) || undefined,
        workflowDraftInfo: extractTemplateAssetDraftInfo(template.templateWorkflow) || undefined,
        parameterCount: resolveDraftParameterCount({
          suggestions: templateSuggestions,
          aiSkillGuide: skill || aiSkillGuide,
          variables: template.variables,
        }),
        variables: template.variables,
        templateName: template.fileName?.replace(/\.[^.]+$/, '') || templateName,
        savedAt: new Date().toISOString(),
      };

      applyDraftSnapshot(restoredDraft);
      localStorage.setItem(draftStorageKey, JSON.stringify({
        ...restoredDraft,
        officeType,
        documentFormat: hostDocumentFormat,
      }));
      addDebugLog(
        'info',
        '已从后端恢复草稿',
        `draftId=${effectiveDraftId}，恢复 ${templateSuggestions.length} 个参数，优先级高于本地暂存`
      );
      setTemplateAssetNotice({
        type: 'success',
        message: draftId || snapshot?.draftId ? '✅ 已从后端恢复当前模板资产暂存' : '✅ 已从后端恢复最新模板资产暂存',
        lines: [`${restoredDraft.templateType} · ${restoredDraft.parameterCount} 参数 · ID: ${String(effectiveDraftId).substring(0, 8)}...`],
      });
      await refreshLatestBackendDraftInfo();
    } catch (error: any) {
      setTemplateAssetNotice({ type: 'error', message: `载入草稿失败: ${error.message || '未知错误'}` });
    }
  };

  const handleClearDraft = (options?: { silent?: boolean }) => {
    setDraftId(null);
    setDraftInfo(null);
    setTemplateAssetDraftInfo(null);
    setTemplateFieldSpecsDraft([]);
    setTemplateTermAssetsDraft(null);
    setTemplateTermAssetsText('');
    setTemplateAssetRenderDiagnostics(null);
    localStorage.removeItem(draftStorageKey);
    if (!options?.silent) {
      setTemplateAssetNotice({ type: 'info', message: '🗑️ 已清除暂存副本' });
    }
  };

  return {
    draftId,
    draftInfo,
    latestBackendDraftInfo,
    templateAssetDraftInfo,
    setTemplateAssetDraftInfo,
    isSavingDraft,
    handleSaveDraft,
    handleLoadDraft,
    handleClearDraft,
  };
}
