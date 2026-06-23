import { useState } from 'react';
import { carboneAPI } from '../../../api/carbone-api';
import { buildPreviewData, getUploadedFileFormat } from './TemplateConfigPanel.helpers';
import { getHostScopedStorageKey, type ScopedOfficeHost } from '../../../shared/utils/host-storage';

interface UseTemplateAssetManagerProps {
  apiBaseUrl: string;
  officeType: ScopedOfficeHost;
  templateConfig: any;
  suggestions: any[];
  templateName: string;
  uploadedFile: File | null;
  uploadedFileBase64: string;
  addDebugLog: (level: any, title: string, content: string) => void;
  loadTemplateSource: () => Promise<{
    documentContent: string;
    format: string;
    isBinaryFile: boolean;
  }>;
}

export function useTemplateAssetManager({
  apiBaseUrl,
  officeType,
  templateConfig,
  suggestions,
  templateName,
  uploadedFile,
  uploadedFileBase64,
  addDebugLog,
  loadTemplateSource,
}: UseTemplateAssetManagerProps) {
  const lastTemplateIdKey = getHostScopedStorageKey(officeType, 'lastTemplateId');
  const lastTemplateDownloadUrlKey = getHostScopedStorageKey(officeType, 'lastTemplateDownloadUrl');
  const lastSkillIdKey = getHostScopedStorageKey(officeType, 'lastSkillId');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<Record<string, any>>({});
  const [loadingStates, setLoadingStates] = useState({
    validate: false,
    preview: false,
    generate: false,
    skillGenerate: false,
    skillPreview: false,
    fullSave: false,
    upload: false,
  });
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [generatedSkill, setGeneratedSkill] = useState<any>(null);
  const [skillPreviewResult, setSkillPreviewResult] = useState<any>(null);

  const updatePreviewData = () => {
    const data = buildPreviewData(templateConfig.templateType, suggestions);
    setPreviewData(data as Record<string, any>);
  };

  const handlePreviewWithUploadedFile = async () => {
    if (!uploadedFileBase64 || !generatedSkill) {
      setStatusMessage('请先上传文档文件并生成模板指南');
      return;
    }

    setLoadingStates((prev) => ({ ...prev, skillPreview: true }));
    setStatusMessage('正在使用上传的文件进行预览验证...');

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);

      const templateResult = await carboneAPI.generateTemplate({
        documentContent: 'base64:' + uploadedFileBase64,
        suggestions: suggestions.filter((s) => s.applied),
        templateConfig,
        format: getUploadedFileFormat(uploadedFile),
      });

      if (!templateResult.success) {
        setStatusMessage(`模板生成失败: ${templateResult.error}`);
        return;
      }

      const result = await carboneAPI.previewWithSkill({
        templateId: templateResult.templateId,
        skill: generatedSkill,
      });

      const debugLogs = (result as any).debugLogs as string[] | undefined;
      if (debugLogs && debugLogs.length > 0) {
        console.log('=== 预览验证调试日志 ===');
        debugLogs.forEach((log: string) => console.log(log));
        addDebugLog('info', '=== 预览验证调试日志 ===', '');
        debugLogs.forEach((log: string) => addDebugLog('debug', log, ''));
      }

      if (result.success) {
        setSkillPreviewResult(result);
        setCurrentStep(4);
        setStatusMessage(`预览验证成功！模板ID: ${templateResult.templateId}`);
        setPreviewData(result.generatedData || {});
        console.log('预览结果:', result);
        addDebugLog(
          'info',
          '预览验证成功',
          `生成的数据: ${JSON.stringify(result.generatedData, null, 2)}`
        );
      } else {
        setStatusMessage(`预览验证失败: ${result.error || '未知错误'}`);
        addDebugLog('error', '预览验证失败', result.error || '未知错误');
      }
    } catch (error: any) {
      console.error('预览验证失败:', error);
      setStatusMessage(`预览验证失败: ${error.message || '未知错误'}`);
      addDebugLog('error', '预览验证异常', error.message || '未知错误');
    } finally {
      setLoadingStates((prev) => ({ ...prev, skillPreview: false }));
    }
  };

  const handleSaveWithUploadedFile = async () => {
    if (!uploadedFileBase64 || !generatedSkill) {
      setStatusMessage('请先上传文档文件并完成模板指南生成');
      return;
    }

    setLoadingStates((prev) => ({ ...prev, fullSave: true }));
    setStatusMessage('正在保存模板资产...');

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.saveTemplateFull({
        documentContent: 'base64:' + uploadedFileBase64,
        suggestions: suggestions.filter((s) => s.applied),
        templateConfig,
        skill: generatedSkill,
        format: getUploadedFileFormat(uploadedFile),
        templateName: templateName || uploadedFile?.name || `template_${Date.now()}`,
      });

      if (result.success) {
        setStatusMessage(`模板资产保存成功！模板ID: ${result.templateId}`);
        localStorage.setItem(lastTemplateIdKey, result.templateId || '');
        localStorage.setItem(lastTemplateDownloadUrlKey, result.downloadUrl || '');
        localStorage.setItem(lastSkillIdKey, result.skillId || '');
        console.log('保存结果:', result);
      } else {
        setStatusMessage(`保存失败: ${result.error || '未知错误'}`);
      }
    } catch (error: any) {
      console.error('保存模板资产失败:', error);
      setStatusMessage(`保存失败: ${error.message || '未知错误'}`);
    } finally {
      setLoadingStates((prev) => ({ ...prev, fullSave: false }));
    }
  };

  const handleValidate = async () => {
    setLoadingStates((prev) => ({ ...prev, validate: true }));
    setStatusMessage('正在验证模板配置...');
    setValidationErrors([]);
    setValidationWarnings([]);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.validateTemplate(JSON.stringify(templateConfig));
      setValidationErrors(result.errors || []);
      setValidationWarnings(result.warnings || []);

      if (result.valid) {
        setStatusMessage('验证通过，可继续生成模板指南');
        setCurrentStep(2);
      } else {
        setStatusMessage('验证失败，请检查错误');
      }
    } catch (error: any) {
      console.error('验证失败:', error);
      setValidationErrors([error.message || '验证请求失败']);
      setStatusMessage('验证请求失败');
    } finally {
      setLoadingStates((prev) => ({ ...prev, validate: false }));
    }
  };

  const handlePreview = async () => {
    setLoadingStates((prev) => ({ ...prev, preview: true }));
    setStatusMessage('正在生成预览...');

    try {
      const { documentContent, format } = await loadTemplateSource();

      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.previewRenderContent(documentContent, templateConfig, format);

      if (result.success && result.previewUrl) {
        setStatusMessage('预览生成成功！');
        setPreviewData(result.sampleData || {});
        console.log('预览链接:', result.previewUrl);
      } else {
        setStatusMessage(`预览失败: ${result.error || '未知错误'}`);
      }
    } catch (error: any) {
      console.error('预览失败:', error);
      setStatusMessage(`预览失败: ${error.message || '未知错误'}`);
    } finally {
      setLoadingStates((prev) => ({ ...prev, preview: false }));
    }
  };

  const handleGenerateTemplate = async () => {
    setLoadingStates((prev) => ({ ...prev, generate: true }));
    setStatusMessage('正在生成模板...');

    try {
      const { documentContent, format } = await loadTemplateSource();

      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.generateTemplate({
        documentContent,
        suggestions: suggestions.filter((s) => s.applied),
        templateConfig,
        format,
      });

      if (result.success) {
        setStatusMessage(`模板生成成功！模板ID: ${result.templateId || '未知'}`);
        if (result.templateId) {
          localStorage.setItem(lastTemplateIdKey, result.templateId);
          localStorage.setItem(lastTemplateDownloadUrlKey, result.downloadUrl || '');
        }
        console.log('生成的模板:', result);
      } else {
        setValidationErrors(result.validationErrors || []);
        setStatusMessage(`模板生成失败: ${result.error || '未知错误'}`);
      }
    } catch (error: any) {
      console.error('生成模板失败:', error);
      setStatusMessage(`生成模板失败: ${error.message || '未知错误'}`);
    } finally {
      setLoadingStates((prev) => ({ ...prev, generate: false }));
    }
  };

  const handleGenerateSkill = async () => {
    const appliedSuggestions = suggestions.filter((s) => s.applied);
    if (appliedSuggestions.length === 0) {
      setStatusMessage('请先在AI识别面板中应用建议，再生成模板指南');
      setValidationErrors([
        '当前没有已应用的变量。请返回AI识别面板，点击"应用全部"或逐个应用建议后再继续。',
      ]);
      return;
    }

    setLoadingStates((prev) => ({ ...prev, skillGenerate: true }));
    setStatusMessage(`正在生成模板指南（${appliedSuggestions.length}个变量）...`);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.generateSkill({
        suggestions: appliedSuggestions,
        templateConfig,
        templateType: templateConfig.templateType || 'custom',
        documentDescription: templateName || `${templateConfig.templateType || '自定义'}模板`,
      });

      if (result.success && result.skill) {
        setGeneratedSkill(result.skill);
        setCurrentStep(3);
        setStatusMessage(`模板指南生成成功！包含 ${result.skill.parameters?.length || 0} 个变量`);
        localStorage.setItem(lastSkillIdKey, result.skillId || '');
        console.log('生成的Skill:', result.skill);
      } else {
        setStatusMessage(`模板指南生成失败: ${result.error || '未知错误'}`);
      }
    } catch (error: any) {
      console.error('生成模板指南失败:', error);
      setStatusMessage(`生成模板指南失败: ${error.message || '未知错误'}`);
    } finally {
      setLoadingStates((prev) => ({ ...prev, skillGenerate: false }));
    }
  };

  const handleSkillPreview = async () => {
    if (!generatedSkill) {
      setStatusMessage('请先生成模板指南');
      return;
    }

    setLoadingStates((prev) => ({ ...prev, skillPreview: true }));
    setStatusMessage('正在使用模板指南进行预览验证...');

    try {
      const { documentContent, format, isBinaryFile } = await loadTemplateSource();

      if (!isBinaryFile && format === 'docx') {
        setStatusMessage('注意：当前导出的 Word 模板源可能不是完整 docx 文件，预览可能受限');
      }

      carboneAPI.setBaseUrl(apiBaseUrl);

      const templateResult = await carboneAPI.generateTemplate({
        documentContent,
        suggestions: suggestions.filter((s) => s.applied),
        templateConfig,
        format,
      });

      if (!templateResult.success) {
        setStatusMessage(`模板生成失败: ${templateResult.error}`);
        return;
      }

      if (!templateResult.hasValidFile) {
        setStatusMessage(
          `模板配置已保存（模板ID: ${templateResult.templateId}），但由于无法获取完整的docx文件，预览功能暂不可用。请手动上传Word文档到模板管理页面进行完整预览。`
        );
        setCurrentStep(4);
        setSkillPreviewResult({
          generatedData: generatedSkill.parameters?.map((p: any) => ({ [p.name]: p.example })),
        });
        return;
      }

      const result = await carboneAPI.previewWithSkill({
        templateId: templateResult.templateId,
        skill: generatedSkill,
      });

      if (result.success) {
        setSkillPreviewResult(result);
        setCurrentStep(4);
        setStatusMessage(`预览验证成功！可查看模拟数据效果`);
        setPreviewData(result.generatedData || {});
        console.log('预览结果:', result);
      } else {
        setStatusMessage(`预览验证失败: ${result.error || '未知错误'}`);
      }
    } catch (error: any) {
      console.error('预览验证失败:', error);
      setStatusMessage(`预览验证失败: ${error.message || '未知错误'}`);
    } finally {
      setLoadingStates((prev) => ({ ...prev, skillPreview: false }));
    }
  };

  const handleFullSave = async () => {
    if (!generatedSkill) {
      setStatusMessage('请先完成模板指南生成和预览验证');
      return;
    }

    setLoadingStates((prev) => ({ ...prev, fullSave: true }));
    setStatusMessage('正在保存模板资产...');

    try {
      const { documentContent, format, isBinaryFile } = await loadTemplateSource();

      if (!isBinaryFile && format === 'docx') {
        setStatusMessage('警告：当前导出的 Word 模板源可能不是完整 docx 文件，保存结果可能受限');
      }

      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.saveTemplateFull({
        documentContent,
        suggestions: suggestions.filter((s) => s.applied),
        templateConfig,
        skill: generatedSkill,
        format,
        templateName: templateName || `template_${Date.now()}`,
      });

      if (result.success) {
        setStatusMessage(`模板资产保存成功！模板ID: ${result.templateId}`);
        localStorage.setItem(lastTemplateIdKey, result.templateId || '');
        localStorage.setItem(lastTemplateDownloadUrlKey, result.downloadUrl || '');
        localStorage.setItem(lastSkillIdKey, result.skillId || '');
        console.log('保存结果:', result);
      } else {
        setStatusMessage(`保存失败: ${result.error || '未知错误'}`);
      }
    } catch (error: any) {
      console.error('保存模板资产失败:', error);
      setStatusMessage(`保存失败: ${error.message || '未知错误'}`);
    } finally {
      setLoadingStates((prev) => ({ ...prev, fullSave: false }));
    }
  };

  return {
    validationErrors,
    validationWarnings,
    previewData,
    loadingStates,
    statusMessage,
    currentStep,
    generatedSkill,
    skillPreviewResult,
    setLoadingStates,
    setStatusMessage,
    updatePreviewData,
    handleValidate,
    handleGenerateSkill,
    handleSkillPreview,
    handleFullSave,
    handlePreviewWithUploadedFile,
    handleSaveWithUploadedFile,
    handlePreview,
    handleGenerateTemplate,
  };
}

// Backward-compatible alias while callers migrate off the old name.
export const useTemplateWorkflow = useTemplateAssetManager;
