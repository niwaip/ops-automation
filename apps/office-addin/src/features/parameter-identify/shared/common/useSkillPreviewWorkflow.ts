import { useState } from 'react';
import { carboneAPI } from '../../../../api/carbone-api';
import type { AISuggestion } from '../../../../app/store';
import type {
  ActionResult,
  PreviewResult,
  TemplateAssetDraftInfo,
  TemplateAssetNotice,
} from './identify-panel.types';

interface UseSkillPreviewWorkflowOptions {
  apiBaseUrl: string;
  officeType: string;
  isExcelMode: boolean;
  suggestions: AISuggestion[];
  draftId: string | null;
  aiSkillGuide: any;
  setAiSkillGuide: (value: any) => void;
  aiDescription: string;
  setAiDescription: (value: string) => void;
  aiGeneratedData: any;
  setAiGeneratedData: (value: any) => void;
  templateName: string;
  setTemplateName: (value: string) => void;
  templateConfig: any;
  selectedTemplateType: string;
  excelWorkbookSummary?: string;
  globalUnderstandingSummary?: string;
  templateAssetDraftInfo: TemplateAssetDraftInfo | null;
  templateFieldSpecsDraft: any[];
  templateTermAssetsDraft: any;
  assetSourceLanguage: string;
  assetTargetLanguages: string[];
  addDebugLog: (level: 'info' | 'warn' | 'error' | 'debug', message: string, details?: string) => void;
  setTemplateAssetNotice: (value: TemplateAssetNotice | null) => void;
  setTemplateAssetRenderDiagnostics: (value: any) => void;
  loadTemplateSource: () => Promise<{ documentContent: string; format: string }>;
  normalizeLanguageCode: (language?: string) => string;
  extractDocument: () => Promise<any>;
  clearDraftSilently?: () => void;
}

export function useSkillPreviewWorkflow({
  apiBaseUrl,
  officeType,
  isExcelMode,
  suggestions,
  draftId,
  aiSkillGuide,
  setAiSkillGuide,
  aiDescription,
  setAiDescription,
  aiGeneratedData,
  setAiGeneratedData,
  templateName,
  setTemplateName,
  templateConfig,
  selectedTemplateType,
  excelWorkbookSummary,
  globalUnderstandingSummary,
  templateAssetDraftInfo,
  templateFieldSpecsDraft,
  templateTermAssetsDraft,
  assetSourceLanguage,
  assetTargetLanguages,
  addDebugLog,
  setTemplateAssetNotice,
  setTemplateAssetRenderDiagnostics,
  loadTemplateSource,
  normalizeLanguageCode,
  extractDocument,
  clearDraftSilently,
}: UseSkillPreviewWorkflowOptions) {
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [isGeneratingParams, setIsGeneratingParams] = useState(false);
  const [aiGenerateResult, setAiGenerateResult] = useState<ActionResult | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [saveResult, setSaveResult] = useState<ActionResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleGenerateAISkillGuide = async () => {
    if (suggestions.length === 0) {
      return;
    }

    setIsGeneratingGuide(true);
    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const documentDescription =
        (isExcelMode
          ? excelWorkbookSummary || globalUnderstandingSummary
          : globalUnderstandingSummary || templateName.trim())
        || undefined;
      const requestSuggestions = suggestions.map((s) => ({ ...s, applied: true }));
      const suggestionNames = requestSuggestions
        .map((s) => String(s?.suggestedName || (s as any)?.details?.variableName || '').trim())
        .filter(Boolean);

      addDebugLog(
        'info',
        '开始生成 AI 指南',
        `draftId=${draftId || 'none'}，本次发送 ${requestSuggestions.length} 条 suggestions，名称=${suggestionNames.join(', ') || 'none'}`
      );

      const result = await carboneAPI.generateSkill({
        templateId: draftId || undefined,
        suggestions: requestSuggestions,
        templateConfig,
        templateType: selectedTemplateType,
        documentDescription,
      });

      if (result.success && result.skill) {
        const generatedParameterNames = Array.isArray(result.skill.parameters)
          ? result.skill.parameters
            .map((p: any) => String(p?.name || '').trim())
            .filter(Boolean)
          : [];
        addDebugLog(
          'info',
          'AI 指南生成完成',
          `返回 ${generatedParameterNames.length} 个 parameters，名称=${generatedParameterNames.join(', ') || 'none'}`
        );
        setAiSkillGuide(result.skill);
        setTemplateAssetNotice({
          type: 'success',
          message: '✅ 指南已生成',
          lines: [`包含 ${result.skill.parameters?.length || 0} 个参数`],
        });
      } else {
        addDebugLog('warn', 'AI 指南生成失败', result.error || '未知错误');
        setTemplateAssetNotice({ type: 'error', message: `生成模板指南失败: ${result.error || '未知错误'}` });
      }
    } catch (error: any) {
      addDebugLog('error', 'AI 指南生成异常', error.message || '未知错误');
      setTemplateAssetNotice({ type: 'error', message: `生成模板指南失败: ${error.message}` });
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  const handleGenerateParameters = async () => {
    if (!aiSkillGuide) {
      setAiGenerateResult({ success: false, message: '请先生成模板指南' });
      return;
    }

    const currentDescription = aiDescription;

    setIsGeneratingParams(true);
    setAiGenerateResult(null);
    setPreviewResult(null);
    setAiGeneratedData(null);
    setTemplateAssetRenderDiagnostics(null);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      let previewTemplateId = draftId;
      if (!previewTemplateId) {
        const { documentContent, format } = await loadTemplateSource();
        const templateResult = await carboneAPI.generateTemplate({
          documentContent,
          suggestions: suggestions.map((s) => ({ ...s, applied: true })),
          templateConfig,
          format,
        });

        if (!templateResult.success || !templateResult.templateId) {
          setAiGenerateResult({ success: false, message: `生成失败: ${templateResult.error || '模板生成失败'}` });
          return;
        }

        previewTemplateId = templateResult.templateId;
      }

      const result = await carboneAPI.previewWithSkill({
        templateId: previewTemplateId,
        skill: aiSkillGuide,
      });

      if (result.success && result.generatedData) {
        setAiGeneratedData(result.generatedData);
        setTemplateAssetRenderDiagnostics(null);
        setAiDescription(JSON.stringify(result.generatedData, null, 2));
        setAiGenerateResult({
          success: true,
          message: currentDescription.trim() ? '✅ 数据生成成功！' : '✅ 默认实例参数生成成功！',
        });
        return;
      }

      if (result.debugLogs?.length) {
        addDebugLog('error', '生成参数失败调试信息', result.debugLogs.join('\n'));
      }
      setAiGenerateResult({ success: false, message: `生成失败: ${result.error || '未知错误'}` });
    } catch (error: any) {
      setAiGenerateResult({ success: false, message: `生成失败: ${error.message}` });
    } finally {
      setIsGeneratingParams(false);
    }
  };

  const handleAiDescriptionChange = (value: string) => {
    setAiDescription(value);
    try {
      const parsed = JSON.parse(value);
      setAiGeneratedData(parsed);
    } catch {
      setAiGeneratedData(null);
    }
  };

  const parsePreviewDataFromInput = (): { data?: any; error?: string } => {
    const raw = aiDescription.trim();
    if (!raw) {
      return { error: '请先输入数据内容' };
    }
    try {
      return { data: JSON.parse(raw) };
    } catch {
      return { error: '预览数据需要使用 JSON 格式。可先点“生成数据”，再按需修改后预览。' };
    }
  };

  const getPreviewSuccessMessage = (): string => {
    if (officeType === 'excel') {
      return '✅ 数据预览成功！请下载 Excel 查看结果（浏览器内联预览 XLSX 可能显示为空）';
    }
    return '✅ 数据预览成功！';
  };

  const handlePreviewWithAIParams = async () => {
    if (!aiSkillGuide) {
      setPreviewResult({ success: false, message: '请先生成模板指南' });
      return;
    }

    const { data: latestGeneratedData, error: previewDataError } = parsePreviewDataFromInput();
    if (!latestGeneratedData) {
      setPreviewResult({ success: false, message: previewDataError || '请先输入有效数据' });
      return;
    }

    setIsPreviewing(true);
    setPreviewResult(null);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);

      if (draftId) {
        const result = await carboneAPI.previewWithSkill({
          templateId: draftId,
          skill: aiSkillGuide,
          simulatedData: latestGeneratedData,
        });

        if (result.success) {
          setPreviewResult({
            success: true,
            message: `${getPreviewSuccessMessage()}（从副本）`,
            previewUrl: result.previewUrl,
            downloadUrl: result.downloadUrl,
            generatedData: latestGeneratedData,
          });
        } else {
          setPreviewResult({ success: false, message: `预览失败: ${result.error || '未知错误'}` });
        }
        return;
      }

      const { documentContent, format } = await loadTemplateSource();
      const templateResult = await carboneAPI.generateTemplate({
        documentContent,
        suggestions: suggestions.map((s) => ({ ...s, applied: true })),
        templateConfig,
        format,
      });

      if (!templateResult.success) {
        setPreviewResult({ success: false, message: `模板生成失败: ${templateResult.error}` });
        return;
      }

      const result = await carboneAPI.previewWithSkill({
        templateId: templateResult.templateId,
        skill: aiSkillGuide,
        simulatedData: latestGeneratedData,
      });

      if (result.success) {
        setPreviewResult({
          success: true,
          message: getPreviewSuccessMessage(),
          previewUrl: result.previewUrl,
          downloadUrl: result.downloadUrl,
          generatedData: latestGeneratedData,
        });
      } else {
        setPreviewResult({ success: false, message: `预览失败: ${result.error || '未知错误'}` });
      }
    } catch (error: any) {
      setPreviewResult({ success: false, message: `预览失败: ${error.message}` });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSaveTemplateAndGuide = async (options?: { onSuccess?: () => void }) => {
    if (!aiSkillGuide) {
      setSaveResult({ success: false, message: '请先生成模板指南' });
      return;
    }

    if (!draftId) {
      setSaveResult({ success: false, message: '请先暂存副本' });
      return;
    }

    setIsSaving(true);
    setSaveResult(null);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const finalTemplateName = templateName.trim() || `${selectedTemplateType}-template-${Date.now()}`;
      const publishFieldSpecs = templateFieldSpecsDraft.length > 0
        ? templateFieldSpecsDraft
        : (templateAssetDraftInfo?.fields || []);
      const publishSourceLanguage = normalizeLanguageCode(assetSourceLanguage || templateAssetDraftInfo?.sourceLanguage);
      const publishTargetLanguages = Array.from(
        new Set(
          (assetTargetLanguages.length > 0 ? assetTargetLanguages : (templateAssetDraftInfo?.targetLanguages || []))
            .map((lang) => normalizeLanguageCode(lang))
            .filter(Boolean)
        )
      );

      const saveParams: any = {
        templateId: draftId,
        suggestions,
        templateConfig,
        skill: aiSkillGuide,
        format: officeType === 'excel' ? 'xlsx' : officeType === 'ppt' ? 'pptx' : 'docx',
        templateName: finalTemplateName,
      };

      if (publishFieldSpecs.length > 0) {
        saveParams.templateMeta = {
          templateName: finalTemplateName,
          sourceLanguage: publishSourceLanguage,
          targetLanguages: publishTargetLanguages,
          documentMode: publishTargetLanguages.length > 0 ? 'single_or_bilingual' : 'single_language',
          termAssets: templateTermAssetsDraft || templateAssetDraftInfo?.termAssets || undefined,
        };
        saveParams.templateFieldSpecs = publishFieldSpecs;
        saveParams.templateDocumentIr = await extractDocument();
      }

      const result = await carboneAPI.saveTemplateFull(saveParams);

      if (result.success) {
        setSaveResult({
          success: true,
          message: `✅ 模板资产发布成功！模板ID: ${result.templateId || 'N/A'}, 指南ID: ${result.skillId || 'N/A'}`,
        });
        clearDraftSilently?.();
        options?.onSuccess?.();
      } else {
        setSaveResult({ success: false, message: `保存失败: ${result.error || '未知错误'}` });
      }
    } catch (error: any) {
      setSaveResult({ success: false, message: `保存失败: ${error.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    aiSkillGuide,
    setAiSkillGuide,
    isGeneratingGuide,
    aiDescription,
    setAiDescription,
    aiGeneratedData,
    setAiGeneratedData,
    isGeneratingParams,
    aiGenerateResult,
    previewResult,
    isPreviewing,
    templateName,
    setTemplateName,
    saveResult,
    isSaving,
    handleGenerateAISkillGuide,
    handleGenerateParameters,
    handleAiDescriptionChange,
    handlePreviewWithAIParams,
    handleSaveTemplateAndGuide,
  };
}
