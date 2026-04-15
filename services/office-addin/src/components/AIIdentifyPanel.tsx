/**
 * AI 识别面板组件
 * 显示 AI 分析结果和建议，支持一键应用或部分应用
 * 包含详细错误显示和调试日志功能
 */

import React, { useState, useEffect } from 'react';
import { useAppStore, AISuggestion } from '../taskpane/store';
import { carboneAPI } from '../api/carbone-api';
import { OfficeHelper } from '../utils/office-api';

interface Props {
  onApplyComplete?: () => void;
}

// 动态加载进度消息（用于旧API）
const loadingMessages = [
  '⏳ 正在处理文档...',
  '📝 正在分析内容...',
  '🤖 正在智能识别...',
  '✨ 正在生成结果...',
];

// 多阶段进度消息映射（用于SSE实时进度，目前HTTP API不支持）
const stageProgressMessages: Record<string, string[]> = {
  'document_understanding': ['🔍 分析文档整体结构...', '📖 理解文档内容和用途...', '📋 提取章节信息...'],
  'section_analysis': ['📝 分段参数化处理...', '🤖 语义识别中...', '✨ 生成变量建议...'],
  'integration': ['🔄 整合识别结果...', '✅ 确认最终参数...', '📊 生成配置信息...'],
  'complete': ['✅ 处理完成！']
};

export const AIIdentifyPanel: React.FC<Props> = ({ onApplyComplete }) => {
  const {
    officeType,
    isAnalyzing,
    suggestions,
    analysisError,
    analysisErrorDetails,
    setAnalyzing,
    setSuggestions,
    setAnalysisError,
    applySuggestion,
    applyAllSuggestions,
    dismissSuggestion,
    updateSuggestionName,
    templateConfig,
    apiBaseUrl,
    addDebugLog,
    showDebugPanel,
    setShowDebugPanel,
  } = useAppStore();

  const [selectedTemplateType, setSelectedTemplateType] = useState('contract');  // 默认合同类型
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [showPreview, setShowPreview] = useState(false);  // 预览模式
  const [previewContent, setPreviewContent] = useState<string>('');  // 预览内容
  const [loadingProgress, setLoadingProgress] = useState(0);  // 加载进度（百分比）
  const [loadingMessage, setLoadingMessage] = useState('');  // 当前加载消息
  const [currentStage, setCurrentStage] = useState<string>('');  // 当前处理阶段
  const [currentSection, setCurrentSection] = useState<string>('');  // 当前处理章节
  const [useMultiStage, setUseMultiStage] = useState(true);  // 是否使用多阶段处理
  const [showManualAdd, setShowManualAdd] = useState(false);  // 显示手动添加参数界面
  const [manualParamName, setManualParamName] = useState('d.');  // 手动添加的参数名
  const [manualFormatter, setManualFormatter] = useState('');  // 手动添加的格式化器
  const [selectedContent, setSelectedContent] = useState('');  // 当前选中的文档内容
  const [collapsed, setCollapsed] = useState(false);  // 参数列表是否收起
  const [manualLoopMode, setManualLoopMode] = useState(false);  // 手动添加的循环模式
  const [manualArrayPath, setManualArrayPath] = useState('');  // 循环模式的数组路径
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);  // AI生成变量名状态
  const [manualSignificance, setManualSignificance] = useState('');  // 用途说明

  // 验证模版状态
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; message: string; warnings?: string[] } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // AI指南状态
  const [aiSkillGuide, setAiSkillGuide] = useState<any>(null);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);

  // 保存状态
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 暂存状态
  const [hasStagedData, setHasStagedData] = useState(false);
  const [isLoadingStaged, setIsLoadingStaged] = useState(false);
  const [stagedDataInfo, setStagedDataInfo] = useState<{ templateType: string; parameterCount: number; savedAt: string } | null>(null);

  // 检查是否有暂存数据
  useEffect(() => {
    const stagedData = localStorage.getItem('ai-template-staged');
    if (stagedData) {
      try {
        const data = JSON.parse(stagedData);
        setHasStagedData(true);
        setStagedDataInfo({
          templateType: data.templateType || 'unknown',
          parameterCount: data.suggestions?.length || 0,
          savedAt: data.savedAt || ''
        });
      } catch {
        setHasStagedData(false);
      }
    }
  }, []);

  // 载入暂存数据
  const handleLoadStagedData = () => {
    setIsLoadingStaged(true);
    try {
      const stagedData = localStorage.getItem('ai-template-staged');
      if (!stagedData) {
        addDebugLog('warn', '没有暂存数据可载入');
        return;
      }

      const data = JSON.parse(stagedData);

      // 恢复suggestions
      if (data.suggestions && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
        addDebugLog('info', `✅ 载入暂存数据`, `恢复 ${data.suggestions.length} 个参数`);
      }

      // 恢复templateType
      if (data.templateType) {
        setSelectedTemplateType(data.templateType);
      }

      // 恢复AI指南
      if (data.aiSkillGuide) {
        setAiSkillGuide(data.aiSkillGuide);
        addDebugLog('info', `✅ 载入AI指南`, `${data.aiSkillGuide.parameters?.length || 0} 个参数`);
      }

      // 恢复验证结果
      if (data.verifyResult) {
        setVerifyResult(data.verifyResult);
      }

      addDebugLog('info', `✅ 暂存数据载入成功`, `保存时间: ${data.savedAt}`);
    } catch (error: any) {
      addDebugLog('error', `载入暂存数据失败`, error.message);
    } finally {
      setIsLoadingStaged(false);
    }
  };

  // 保存到暂存（localStorage）
  const saveToStaged = () => {
    const stagedData = {
      suggestions,
      templateType: selectedTemplateType,
      aiSkillGuide,
      verifyResult,
      templateConfig,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem('ai-template-staged', JSON.stringify(stagedData));
    setHasStagedData(true);
    setStagedDataInfo({
      templateType: selectedTemplateType,
      parameterCount: suggestions.length,
      savedAt: stagedData.savedAt
    });
    addDebugLog('info', `✅ 数据已暂存`, `${suggestions.length} 个参数`);
  };

  // 动态更新加载消息（仅用于旧API的模拟进度）
  // 注意：当前HTTP API不支持实时进度，这只是dots动画
  // loadingProgress 由 handleAnalyze 中的 updateProgress 控制
  useEffect(() => {
    if (isAnalyzing) {
      // 只更新dots动画，不修改loadingProgress（由handleAnalyze控制）
      let dotCount = 0;
      const interval = setInterval(() => {
        dotCount = (dotCount + 1) % 4;
        const dots = '.'.repeat(dotCount);
        // 只有在进度未完成时才显示dots动画
        if (loadingProgress < 100) {
          setLoadingMessage(`⏳ 正在处理文档${dots}`);
        }
      }, 500);  // 每0.5秒更新一次（dots动画）

      setLoadingMessage('⏳ 正在处理文档...');

      return () => clearInterval(interval);
    } else {
      setLoadingMessage('');
    }
  }, [isAnalyzing, loadingProgress]);  // 添加loadingProgress依赖

  /**
   * 执行 AI 分析（使用多阶段处理流程）
   */
  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalysisError(null);
    setLoadingProgress(0);
    setCurrentStage('');
    setCurrentSection('');

    addDebugLog('info', `开始 AI 识别`, `模板类型: ${selectedTemplateType}`);

    try {
      // 获取文档内容
      let documentContent = '';
      let documentStructure: any = null;
      let underlineInfo: any = null;
      let paragraphFormats: any = null;

      addDebugLog('debug', `获取文档内容`, `Office 类型: ${officeType}`);

      if (officeType === 'word') {
        documentContent = await OfficeHelper.Word.getDocumentContent();
        documentStructure = await OfficeHelper.Word.getDocumentStructure();
        addDebugLog('debug', `Word 文档内容获取成功`, `长度: ${documentContent.length}`);

        // 获取下划线信息（用于精确识别空白位置）
        try {
          underlineInfo = await OfficeHelper.Word.getUnderlinedTexts();
          addDebugLog('debug', `下划线信息获取成功`, `发现 ${underlineInfo?.length || 0} 个下划线位置`);
        } catch (underlineError: any) {
          addDebugLog('warn', `获取下划线信息失败`, underlineError.message);
          underlineInfo = null;
        }

        // 获取段落格式信息
        try {
          paragraphFormats = await OfficeHelper.Word.getParagraphsWithFormat();
          addDebugLog('debug', `段落格式信息获取成功`, `段落数: ${paragraphFormats?.length || 0}`);
        } catch (formatError: any) {
          addDebugLog('warn', `获取段落格式失败`, formatError.message);
          paragraphFormats = null;
        }
      } else if (officeType === 'excel') {
        const sheetData = await OfficeHelper.Excel.getSheetData();
        documentContent = JSON.stringify(sheetData.values);
        documentStructure = { tables: [], paragraphs: [], images: [] };
        addDebugLog('debug', `Excel 数据获取成功`, `行数: ${sheetData.values?.length || 0}`);
      } else if (officeType === 'ppt') {
        const slidesContent = await OfficeHelper.PowerPoint.getSlidesContent();
        documentContent = JSON.stringify(slidesContent);
        documentStructure = { slides: slidesContent };
        addDebugLog('debug', `PPT 内容获取成功`, `幻灯片数: ${slidesContent?.length || 0}`);
      }

      // 构建请求参数（包含下划线信息用于AI识别）
      const requestPayload = {
        documentContent,
        documentType: officeType === 'ppt' ? 'pptx' : officeType,
        templateType: selectedTemplateType,
        context: `这是一份${selectedTemplateType}类型的${officeType === 'word' ? 'Word文档' : officeType === 'excel' ? 'Excel表格' : 'PPT演示文稿'}，需要识别空白填充部分并生成模板变量`,
        underlineInfo: underlineInfo,      // 下划线信息（用于提高空白识别准确度）
        paragraphFormats: paragraphFormats  // 段落格式信息（用于辅助AI判断）
      };

      carboneAPI.setBaseUrl(apiBaseUrl);

      if (useMultiStage) {
        // 使用新的多阶段处理流程（API会根据underlineInfo自动选择快速或多阶段）
        addDebugLog('info', `调用多阶段处理API`, `等待后端返回实际处理流程类型...`);

        // 更新进度的辅助函数
        const updateProgress = (stageName: string, progress: number, message: string, section?: string) => {
          setCurrentStage(stageName);
          setLoadingProgress(progress);
          setLoadingMessage(message);
          if (section) {
            setCurrentSection(section);
          }
          addDebugLog('debug', `进度更新`, `${stageName}: ${progress}% - ${message}${section ? ` (${section})` : ''}`);
        };

        // 显示处理中提示（模糊进度，HTTP不支持实时进度）
        updateProgress('处理中', 50, '⏳ 正在处理文档...');

        // 调用多阶段API
        const result = await carboneAPI.identifyDocumentMultiStage(requestPayload);

        // 根据返回的flowType显示正确的流程类型
        const flowType = result.contextAnalysis?.flowType || 'unknown';
        const flowTypeDisplay = flowType === 'quick' ? '快速识别（有下划线位置）' :
                                flowType === 'multi-stage' ? '多阶段处理（文档理解→分段参数化→整合确认）' :
                                '未知流程';

        // 更新到100%
        updateProgress('完成', 100, '✅ 处理完成！');

        // 记录结果（显示正确的流程类型）
        const usedAI = result.contextAnalysis?.usedAI ?? true;
        addDebugLog('info', `处理完成，实际流程: ${flowTypeDisplay}`,
          `识别到 ${result.suggestions?.length || 0} 个参数，模板类型: ${result.templateConfig?.templateType}`);

        // 使用 rawSuggestions（包含详细信息）如果可用
        const displaySuggestions = result.rawSuggestions || result.suggestions;
        addDebugLog('info', `AI 分析成功`, `识别到 ${displaySuggestions?.length || 0} 个参数`);
        setSuggestions(displaySuggestions);
      } else {
        // 使用旧的单一处理流程
        addDebugLog('info', `调用原有 API`, `URL: ${apiBaseUrl}/studio/direct-ai-identify`);

        const result = await carboneAPI.identifyDocumentDirect(requestPayload);

        const usedAI = result.contextAnalysis?.usedAI ?? false;
        const aiServiceUrl = result.contextAnalysis?.aiServiceUrl || '未配置';

        addDebugLog('info', `识别方式: ${usedAI ? '🤖 AI智能识别' : '📋 规则匹配'}`,
          usedAI ? `AI服务地址: ${aiServiceUrl}` : `AI服务不可用(${aiServiceUrl})，使用规则后备方案`);

        const displaySuggestions = result.rawSuggestions || result.suggestions;
        addDebugLog('info', `AI 分析成功`, `识别到 ${displaySuggestions?.length || 0} 个空白填充项`);
        setSuggestions(displaySuggestions);
      }
    } catch (error: any) {
      // 详细错误信息
      const errorMessage = error.message || 'AI 分析失败';
      let errorDetails = '';

      if (error.response) {
        errorDetails = `状态码: ${error.response.status}\n`;
        errorDetails += `响应数据: ${JSON.stringify(error.response.data, null, 2)}\n`;
        errorDetails += `请求URL: ${error.config?.url || apiBaseUrl}`;
      } else if (error.request) {
        errorDetails = `请求未收到响应\n`;
        errorDetails += `可能原因:\n`;
        errorDetails += `1. 后端服务未启动 (${apiBaseUrl})\n`;
        errorDetails += `2. HTTPS 证书问题（Office 要求 HTTPS）\n`;
        errorDetails += `3. 网络连接问题\n`;
        errorDetails += `4. CORS 配置问题`;
      } else {
        errorDetails = `请求配置错误: ${error.message}\n`;
        errorDetails += `堆栈: ${error.stack || '无'}`;
      }

      addDebugLog('error', errorMessage, errorDetails);
      setAnalysisError(errorMessage, errorDetails);
    } finally {
      setAnalyzing(false);
      setCurrentSection('');
    }
  };

  /**
   * 测试后端连接
   */
  const handleTestConnection = async () => {
    addDebugLog('info', `测试后端连接`, `URL: ${apiBaseUrl}/health`);
    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if (response.ok) {
        const data = await response.json();
        addDebugLog('info', `连接成功`, JSON.stringify(data));
      } else {
        addDebugLog('error', `连接失败`, `状态码: ${response.status}`);
      }
    } catch (error: any) {
      addDebugLog('error', `连接失败`, error.message);
    }
  };

  /**
   * 验证模版配置（使用模版配置页的逻辑）
   */
  const handleVerifyTemplate = async () => {
    if (suggestions.length === 0) {
      setVerifyResult({ valid: false, message: '请先进行AI识别或手动添加参数' });
      return;
    }

    setIsVerifying(true);
    setVerifyResult(null);
    addDebugLog('info', `验证模版配置`, `参数数量: ${suggestions.length}`);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);

      // 构建模版配置（与模版配置页一致）
      const configToValidate = {
        templateType: selectedTemplateType,
        variables: suggestions.reduce((acc, s) => {
          // 从 suggestedName 提取变量路径（去掉 {} 包装）
          const varPath = s.suggestedName.replace(/[{}]/g, '').replace(/^d\./, '');
          acc[varPath] = s.originalText || '';
          return acc;
        }, {} as Record<string, string>),
        loops: suggestions
          .filter(s => s.details?.fieldType === 'loop')
          .map(s => ({
            arrayPath: s.details?.arrayPath || '',
            startMarker: `{#${s.details?.arrayPath || ''}}`,
            endMarker: `{/${s.details?.arrayPath || ''}}`
          }))
      };

      const result = await carboneAPI.validateTemplate(JSON.stringify(configToValidate));

      if (result.valid) {
        setVerifyResult({ valid: true, message: '✅ 验证成功！模版配置有效', warnings: result.warnings });
        addDebugLog('info', `✅ 验证成功`, `模版配置有效`);
        if (result.warnings && result.warnings.length > 0) {
          addDebugLog('warn', `⚠️ 警告`, result.warnings.join('\n'));
        }
      } else {
        setVerifyResult({ valid: false, message: '❌ 验证失败', warnings: result.errors });
        addDebugLog('error', `❌ 验证失败`, result.errors?.join('\n') || '未知错误');
      }
    } catch (error: any) {
      setVerifyResult({ valid: false, message: `验证失败: ${error.message}` });
      addDebugLog('error', `验证失败`, error.message);
    } finally {
      setIsVerifying(false);
    }
  };

  /**
   * 生成AI Skill Guide
   */
  const handleGenerateAISkillGuide = async () => {
    if (suggestions.length === 0) {
      addDebugLog('warn', '请先进行AI识别或手动添加参数');
      return;
    }

    setIsGeneratingGuide(true);
    addDebugLog('info', `生成AI Skill Guide`, `参数数量: ${suggestions.length}`);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);

      const result = await carboneAPI.generateSkill({
        suggestions: suggestions.map(s => ({ ...s, applied: true })),
        templateConfig,
        templateType: selectedTemplateType
      });

      if (result.success && result.skill) {
        setAiSkillGuide(result.skill);
        addDebugLog('info', `✅ AI指南生成成功`, `包含 ${result.skill.parameters?.length || 0} 个参数`);
      } else {
        addDebugLog('error', `生成AI指南失败`, result.error || '未知错误');
      }
    } catch (error: any) {
      addDebugLog('error', `生成AI指南失败`, error.message);
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  /**
   * 保存模版和AI指南
   */
  const handleSaveTemplateAndGuide = async () => {
    if (!aiSkillGuide) {
      setSaveResult({ success: false, message: '请先生成AI指南' });
      return;
    }

    setIsSaving(true);
    setSaveResult(null);
    addDebugLog('info', `保存模版和AI指南`);

    try {
      // 获取当前文档内容（根据officeType使用对应API）
      let documentContent = '';
      if (officeType === 'word') {
        documentContent = await OfficeHelper.Word.getDocumentContent();
      } else if (officeType === 'excel') {
        documentContent = await OfficeHelper.Excel.getDocumentContent();
      } else {
        documentContent = await OfficeHelper.PowerPoint.getDocumentContent();
      }

      carboneAPI.setBaseUrl(apiBaseUrl);

      const result = await carboneAPI.saveTemplateFull({
        documentContent,
        suggestions: suggestions,
        templateConfig,
        skill: aiSkillGuide,
        format: officeType === 'excel' ? 'xlsx' : 'docx',
        templateName: `${selectedTemplateType}-template-${Date.now()}`
      });

      if (result.success) {
        setSaveResult({
          success: true,
          message: `✅ 保存成功！模板ID: ${result.templateId || 'N/A'}, 指南ID: ${result.skillId || 'N/A'}`
        });
        addDebugLog('info', `✅ 保存成功`, `模板ID: ${result.templateId}, 指南ID: ${result.skillId}`);
        // 同时保存到本地暂存
        saveToStaged();
      } else {
        setSaveResult({ success: false, message: `保存失败: ${result.error || '未知错误'}` });
        addDebugLog('error', `保存失败`, result.error || '未知错误');
      }
    } catch (error: any) {
      setSaveResult({ success: false, message: `保存失败: ${error.message}` });
      addDebugLog('error', `保存失败`, error.message);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 应用单个建议
   * 使用underlineInfo精确位置进行替换（参考测试下划线逻辑）
   */
  const handleApplySingle = async (suggestion: AISuggestion) => {
    try {
      if (officeType === 'word') {
        // 优先使用underlineInfo精确位置替换
        if (suggestion.underlineInfo?.paragraphIndex !== undefined) {
          const info = suggestion.underlineInfo;
          const success = await OfficeHelper.Word.replaceUnderlineByPosition(
            info.paragraphIndex,
            info.position?.start || 0,
            info.position?.end || 0,
            suggestion.suggestedName,
            suggestion.originalText,
            info.paragraphText || ''
          );
          if (success) {
            applySuggestion(suggestion.id);
            addDebugLog('info', `精确替换成功`, `"${suggestion.originalText}" → ${suggestion.suggestedName}`);
            // 不移除，只标记为已应用（保留在列表中用于生成AI指南）
            return;
          }
        }

        // 后备方案：使用上下文替换
        const contextSnippet = suggestion.context || suggestion.details?.context || suggestion.elementPath;
        if (contextSnippet && contextSnippet.length > 5) {
          const result = await OfficeHelper.Word.replaceBlankWithContext(
            contextSnippet,
            suggestion.suggestedName
          );
          if (result.success) {
            applySuggestion(suggestion.id);
            addDebugLog('info', `上下文替换成功`, `"${result.replacedText}" → ${suggestion.suggestedName}`);
            return;
          }
        }

        // 最后后备：简单文本替换
        await OfficeHelper.Word.replaceText(
          suggestion.originalText,
          suggestion.suggestedName
        );
        applySuggestion(suggestion.id);
        addDebugLog('info', `文本替换成功`, `${suggestion.originalText} → ${suggestion.suggestedName}`);
      } else if (officeType === 'excel') {
        // Excel 需要找到对应单元格
        const selectedRange = await OfficeHelper.Excel.getSelectedRange();
        await OfficeHelper.Excel.insertMarkerInCell(
          selectedRange.address,
          suggestion.suggestedName
        );
        applySuggestion(suggestion.id);
        addDebugLog('info', `应用建议成功`, `单元格 ${selectedRange.address} → ${suggestion.suggestedName}`);
      }
    } catch (error: any) {
      addDebugLog('error', '应用建议失败', error.message);
    }
  };

  /**
   * 预览单个建议的替换效果
   * 使用underlineInfo精确位置进行高亮（参考测试下划线逻辑）
   */
  const handlePreviewSingle = async (suggestion: AISuggestion) => {
    try {
      // 在 Word 中高亮显示要替换的文本
      if (officeType === 'word') {
        // 先清除之前的高亮
        await OfficeHelper.Word.clearAllHighlights();

        // 优先使用underlineInfo精确位置高亮
        if (suggestion.underlineInfo?.paragraphIndex !== undefined) {
          const info = suggestion.underlineInfo;
          const success = await OfficeHelper.Word.highlightUnderlineByPosition(
            info.paragraphIndex,
            info.position?.start || 0,
            info.position?.end || 0,
            suggestion.originalText
          );
          if (success) {
            addDebugLog('info', `预览: 精确高亮`, `段落#${info.paragraphIndex} 位置${info.position?.start}-${info.position?.end}`);
            return;
          }
        }

        // 后备方案：使用上下文高亮
        const contextSnippet = suggestion.context || suggestion.details?.context || suggestion.elementPath;
        if (contextSnippet && contextSnippet.length > 5) {
          const result = await OfficeHelper.Word.highlightByContext(contextSnippet);
          if (result.found) {
            addDebugLog('info', `预览: 上下文高亮`, `"${result.blankText}" → ${suggestion.suggestedName}`);
            return;
          }
        }

        // 最后后备：文本高亮
        if (suggestion.originalText) {
          const count = await OfficeHelper.Word.highlightText(suggestion.originalText);
          addDebugLog('info', `预览: 文本高亮`, `"${suggestion.originalText}" 找到 ${count} 个匹配`);
        } else {
          addDebugLog('warn', `预览失败`, '无法定位空白标记');
        }
      }
    } catch (error: any) {
      addDebugLog('error', '预览失败', error.message);
    }
  };

  /**
   * 生成预览摘要
   */
  const generatePreviewSummary = (): string => {
    const unapplied = suggestions.filter((s) => !s.applied);
    const lines = unapplied.map((s, i) => {
      return `${i + 1}. "${s.originalText}" → ${s.suggestedName}`;
    });
    return `即将应用 ${unapplied.length} 个替换:\n\n${lines.join('\n')}`;
  };

  /**
   * 一键应用所有建议（带预览确认）
   */
  const handleApplyAll = async () => {
    if (!showPreview) {
      // 先显示预览
      setPreviewContent(generatePreviewSummary());
      setShowPreview(true);
      return;
    }

    // 确认后执行
    try {
      const unapplied = suggestions.filter((s) => !s.applied);

      for (const suggestion of unapplied) {
        await handleApplySingle(suggestion);
      }

      setShowPreview(false);
      // 不跳转tab页，只收起参数列表
      setCollapsed(true);
      addDebugLog('info', `批量应用完成`, `应用了 ${unapplied.length} 个建议`);
    } catch (error) {
      addDebugLog('error', '批量应用失败', error.message);
    }
  };

  /**
   * 取消预览
   */
  const handleCancelPreview = () => {
    setShowPreview(false);
    setPreviewContent('');
  };

  /**
   * 手动添加参数
   */
  /**
   * 获取当前选中的文档内容（参考ManualSelector）
   */
  const handleGetSelection = async () => {
    try {
      if (officeType === 'word') {
        const selectedText = await OfficeHelper.Word.getSelectedText();
        setSelectedContent(selectedText);
        addDebugLog('info', `获取选中内容`, `内容: ${selectedText.substring(0, 50)}...`);
      } else if (officeType === 'excel') {
        const selectedRange = await OfficeHelper.Excel.getSelectedRange();
        const cellValue = selectedRange.values[0][0] as string;
        setSelectedContent(cellValue);
        addDebugLog('info', `获取选中单元格`, `地址: ${selectedRange.address}, 值: ${cellValue}`);
      }
    } catch (error: any) {
      addDebugLog('error', `获取选中内容失败`, error.message);
    }
  };

  /**
   * 生成手动标记（参考ManualSelector，支持循环模式）
   */
  const generateManualMarker = (): string => {
    let marker = `{${manualParamName}`;
    if (manualFormatter) {
      marker += `:${manualFormatter}`;
    }
    marker += '}';

    // 循环模式包装
    if (manualLoopMode && manualArrayPath) {
      marker = `{#${manualArrayPath}}${marker}{/${manualArrayPath}}`;
    }
    return marker;
  };

  /**
   * AI生成变量名（基于选中内容的语义）
   */
  const handleAIGenerateVariableName = async () => {
    if (!selectedContent) {
      addDebugLog('warn', '请先获取选中内容');
      return;
    }

    setIsGeneratingAI(true);
    try {
      // 调用AI生成变量名
      const prompt = `根据以下文本内容，生成合适的变量名称。返回格式: {d.entity.field}

文本: "${selectedContent.substring(0, 100)}"

只返回变量名称，不要其他解释。`;

      const result = await carboneAPI.callAIForVariableName(prompt);
      if (result && result.variableName) {
        setManualParamName(result.variableName);
        addDebugLog('info', `AI生成变量名`, `${result.variableName}`);
      }
    } catch (error: any) {
      addDebugLog('error', `AI生成失败`, error.message);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  /**
   * 手动添加参数并添加到参数一览（不是直接插入文档）
   */
  const handleManualAddParam = async () => {
    if (!manualParamName || manualParamName.trim() === '') {
      addDebugLog('warn', '请输入参数名称');
      return;
    }

    const marker = generateManualMarker();

    // 创建新的建议，格式与AI识别结果一致
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
        chapter: '手动添加',
        significance: manualSignificance || '用户自定义参数',
        displayPosition: selectedContent ? `【${selectedContent.substring(0, 30)}...】` : '手动添加',
        context: selectedContent || '',
        fieldType: manualLoopMode ? 'loop' : 'text',
        formatter: manualFormatter,
        arrayPath: manualLoopMode ? manualArrayPath : undefined,
        beforeBlank: selectedContent ? selectedContent.substring(0, 15) : '',
        afterBlank: selectedContent ? selectedContent.substring(Math.max(0, selectedContent.length - 15)) : '',
      }
    };

    // 添加到建议列表
    setSuggestions([...suggestions, newSuggestion]);
    addDebugLog('info', `手动添加参数到列表`, `参数名: ${marker}`);

    // 重置状态并关闭表单
    setShowManualAdd(false);
    setSelectedContent('');
    setManualParamName('d.');
    setManualFormatter('');
    setManualLoopMode(false);
    setManualArrayPath('');
    setManualSignificance('');

    // 展开参数列表显示新添加的项
    setCollapsed(false);
  };

  /**
   * 收起/展开参数列表
   */
  const toggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  /**
   * 按章节分组建议
   * 返回格式: { "头部": [...], "第一条": [...], "第二条": [...], "正文": [...] }
   */
  const groupSuggestionsByChapter = (): Record<string, AISuggestion[]> => {
    const grouped: Record<string, AISuggestion[]> = {};

    for (const suggestion of suggestions) {
      const chapter = suggestion.details?.chapter || '正文';
      if (!grouped[chapter]) {
        grouped[chapter] = [];
      }
      grouped[chapter].push(suggestion);
    }

    // 按章节顺序排序（头部、第一条、第二条...、正文）
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      // 头部放第一位
      if (a === '头部' || a.startsWith('正文')) return -1;
      if (b === '头部' || b.startsWith('正文')) return 1;
      // 按章节编号排序
      const aNum = a.match(/第(\d+)/)?.[1] || '999';
      const bNum = b.match(/第(\d+)/)?.[1] || '999';
      return parseInt(aNum) - parseInt(bNum);
    });

    const sortedGrouped: Record<string, AISuggestion[]> = {};
    for (const key of sortedKeys) {
      sortedGrouped[key] = grouped[key];
    }

    return sortedGrouped;
  };

  /**
   * 获取章节图标
   */
  const getChapterIcon = (chapter: string): string => {
    if (chapter === '头部') return '📋';
    if (chapter.includes('第一条') || chapter.includes('第一条')) return '📝';
    if (chapter.includes('第二条')) return '📝';
    if (chapter.includes('第三条')) return '📝';
    if (chapter === '正文') return '📄';
    return '📑';
  };

  return (
    <div className="ai-identify-panel">
      {/* 模板类型选择 */}
      <div className="template-type-selector">
        <label>模板类型:</label>
        <select
          value={selectedTemplateType}
          onChange={(e) => setSelectedTemplateType(e.target.value)}
        >
          <option value="report">报告文档</option>
          <option value="invoice">发票/账单</option>
          <option value="certificate">证书/证明</option>
          <option value="contract">合同/协议</option>
          <option value="letter">信函/通知</option>
          <option value="custom">自定义</option>
        </select>
      </div>

      {/* 分析按钮 */}
      <button
        className="analyze-btn"
        onClick={handleAnalyze}
        disabled={isAnalyzing}
      >
        {isAnalyzing ? (
          <span className="analyzing-indicator">
            <span className="spinner"></span>
            <span className="loading-text">正在处理...</span>
          </span>
        ) : 'AI 智能识别'}
      </button>

      {/* 分析结果 */}
      {suggestions.length > 0 && (
        <div className="suggestions-container">
          {/* 收起/展开按钮 */}
          <button className="collapse-toggle-btn" onClick={toggleCollapse}>
            {collapsed ? '📂 展开参数列表' : '📁 收起参数列表'} ({suggestions.filter((s) => !s.applied).length} 项)
          </button>

          {!collapsed && (
            <>
              {/* 预览确认面板 */}
              {showPreview && (
                <div className="preview-confirm-panel">
                  <h4>📋 替换预览</h4>
                  <pre className="preview-content">{previewContent}</pre>
                  <div className="preview-actions">
                    <button className="confirm-btn" onClick={handleApplyAll}>
                      ✅ 确认应用
                    </button>
                    <button className="cancel-btn" onClick={handleCancelPreview}>
                      ❌ 取消
                    </button>
                  </div>
                </div>
              )}

              {/* 一键应用按钮 */}
              <div className="apply-all-section">
                <button className="apply-all-btn" onClick={handleApplyAll}>
                  {showPreview ? '✅ 确认应用全部' : '👁️ 预览后应用全部'} ({suggestions.filter((s) => !s.applied).length})
                </button>
              </div>

              {/* 分组显示建议 - 按章节分组 */}
              {Object.entries(groupSuggestionsByChapter()).map(([chapter, items]) => (
                <div key={chapter} className="suggestion-group chapter-group">
                  <h4 className="group-title chapter-title">
                    <span className="chapter-icon">{getChapterIcon(chapter)}</span>
                    <span className="chapter-name">{chapter}</span>
                    <span className="count">({items.length})</span>
                  </h4>

                  <div className="suggestion-list">
                    {items.map((suggestion) => (
                      <SuggestionItem
                        key={suggestion.id}
                        suggestion={suggestion}
                        onApply={() => handleApplySingle(suggestion)}
                        onDismiss={() => dismissSuggestion(suggestion.id)}
                        onPreview={() => handlePreviewSingle(suggestion)}
                        onUpdateName={(newName) => updateSuggestionName(suggestion.id, newName)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* 手动添加参数（参考ManualSelector） */}
      {!isAnalyzing && (
        <div className="manual-add-section">
          {!showManualAdd ? (
            <button
              className="manual-add-btn"
              onClick={() => setShowManualAdd(true)}
            >
              ➕ 手动添加参数
            </button>
          ) : (
            <div className="manual-add-form expanded">
              {/* 获取选中内容 */}
              <div className="selection-section">
                <button className="get-selection-btn" onClick={handleGetSelection}>
                  📍 获取当前选中内容
                </button>
                {selectedContent && (
                  <div className="selected-preview">
                    <span className="selected-text">已选: "{selectedContent.substring(0, 30)}..."</span>
                  </div>
                )}
              </div>

              {/* 变量配置 */}
              <div className="variable-config">
                <div className="input-group">
                  <label>变量名:</label>
                  <div className="input-with-btn">
                    <input
                      type="text"
                      className="manual-param-input"
                      value={manualParamName}
                      onChange={(e) => setManualParamName(e.target.value)}
                      placeholder="d.fieldName"
                      autoFocus
                    />
                    <button
                      className="ai-generate-btn"
                      onClick={handleAIGenerateVariableName}
                      disabled={isGeneratingAI || !selectedContent}
                    >
                      {isGeneratingAI ? '⏳' : '🤖'}
                    </button>
                  </div>
                </div>

                <div className="input-group">
                  <label>格式化器:</label>
                  <select value={manualFormatter} onChange={(e) => setManualFormatter(e.target.value)}>
                    <option value="">无格式化</option>
                    <option value="formatDate(YYYY-MM-DD)">日期 YYYY-MM-DD</option>
                    <option value="formatDate(YYYY/MM/DD)">日期 YYYY/MM/DD</option>
                    <option value="formatNumber(#,##0.00)">数字 #,##0.00</option>
                    <option value="upper">大写</option>
                    <option value="lower">小写</option>
                  </select>
                </div>

                <div className="input-group">
                  <label>用途说明:</label>
                  <input
                    type="text"
                    value={manualSignificance}
                    onChange={(e) => setManualSignificance(e.target.value)}
                    placeholder="如：合同甲方名称、发票金额"
                  />
                </div>

                {/* 循环模式 */}
                <div className="loop-config">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={manualLoopMode}
                      onChange={(e) => setManualLoopMode(e.target.checked)}
                    />
                    启用循环模式
                  </label>

                  {manualLoopMode && (
                    <div className="input-group">
                      <label>数组路径:</label>
                      <input
                        type="text"
                        value={manualArrayPath}
                        onChange={(e) => setManualArrayPath(e.target.value)}
                        placeholder="d.items"
                      />
                      <small>将包装为 {'{#d.array}...{/d.array}'}</small>
                    </div>
                  )}
                </div>
              </div>

              {/* 生成的标记预览 */}
              {manualParamName && (
                <div className="marker-preview">
                  <code>{generateManualMarker()}</code>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="manual-actions">
                <button className="confirm-add-btn" onClick={handleManualAddParam}>
                  ✅ 添加到列表
                </button>
                <button className="cancel-add-btn" onClick={() => {
                  setShowManualAdd(false);
                  setSelectedContent('');
                  setManualParamName('d.');
                  setManualFormatter('');
                  setManualLoopMode(false);
                  setManualArrayPath('');
                  setManualSignificance('');
                }}>
                  ❌ 取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 验证模版按钮 */}
      <button
        className="verify-template-btn"
        onClick={handleVerifyTemplate}
        disabled={isAnalyzing || isVerifying || suggestions.length === 0}
      >
        {isVerifying ? '⏳ 验证中...' : '🔍 验证模版'}
      </button>

      {/* 验证结果反馈 */}
      {verifyResult && (
        <div className={`verify-result ${verifyResult.valid ? 'success' : 'error'}`}>
          <span className="verify-result-message">{verifyResult.message}</span>
          {verifyResult.warnings && verifyResult.warnings.length > 0 && (
            <div className="verify-result-warnings">
              {verifyResult.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}
        </div>
      )}

      {/* 生成AI指南按钮 */}
      <button
        className="generate-guide-btn"
        onClick={handleGenerateAISkillGuide}
        disabled={isAnalyzing || isGeneratingGuide || suggestions.length === 0}
      >
        {isGeneratingGuide ? '⏳ 生成中...' : '📋 生成AI指南'}
      </button>

      {/* AI指南预览 */}
      {aiSkillGuide && (
        <div className="ai-guide-preview">
          <div className="ai-guide-header">
            <span className="ai-guide-title">✅ AI指南已生成</span>
            <span className="ai-guide-info">
              {aiSkillGuide.parameters?.length || 0} 个参数
            </span>
          </div>
          {aiSkillGuide.skillGuideMarkdown && (
            <div className="ai-guide-summary">
              <pre>{aiSkillGuide.skillGuideMarkdown.substring(0, 300)}...</pre>
            </div>
          )}
        </div>
      )}

      {/* 保存模版和指南按钮组 */}
      <div className="save-buttons-group">
        <button
          className="save-template-btn"
          onClick={handleSaveTemplateAndGuide}
          disabled={isSaving || !aiSkillGuide}
        >
          {isSaving ? '⏳ 保存中...' : '💾 保存模版和指南'}
        </button>

        <button
          className="load-staged-btn"
          onClick={handleLoadStagedData}
          disabled={isLoadingStaged || !hasStagedData}
          title={stagedDataInfo ? `暂存于: ${stagedDataInfo.savedAt}` : '无暂存数据'}
        >
          {isLoadingStaged ? '⏳ 载入中...' : '📂 载入暂存'}
        </button>
      </div>

      {/* 暂存数据信息 */}
      {hasStagedData && stagedDataInfo && (
        <div className="staged-data-info">
          <span className="staged-badge">📦 有暂存</span>
          <span className="staged-details">
            {stagedDataInfo.templateType} · {stagedDataInfo.parameterCount} 参数
          </span>
        </div>
      )}

      {/* 保存结果反馈 */}
      {saveResult && (
        <div className={`save-result ${saveResult.success ? 'success' : 'error'}`}>
          {saveResult.message}
        </div>
      )}

      {/* 调试面板开关 */}
      <button
        className="debug-toggle-btn"
        onClick={() => setShowDebugPanel(!showDebugPanel)}
      >
        {showDebugPanel ? '隐藏日志' : '显示日志'}
      </button>

      {/* 错误提示 - 改进的显示 */}
      {analysisError && (
        <div className="error-message-container">
          <div className="error-message" onClick={() => setShowErrorDetails(!showErrorDetails)}>
            <span className="error-icon">❌</span>
            <span className="error-text">{analysisError}</span>
            <span className="error-toggle">{showErrorDetails ? '▼' : '▶'}</span>
          </div>
          {showErrorDetails && analysisErrorDetails && (
            <div className="error-details">
              <pre>{analysisErrorDetails}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 单个建议项组件
 */
const SuggestionItem: React.FC<{
  suggestion: AISuggestion;
  onApply: () => void;
  onDismiss: () => void;
  onPreview?: () => void;
  onUpdateName?: (newName: string) => void;
}> = ({ suggestion, onApply, onDismiss, onPreview, onUpdateName }) => {
  const [expanded, setExpanded] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(suggestion.suggestedName);

  // 获取位置信息（使用格式化的显示位置）
  const getPositionInfo = (suggestion: AISuggestion): string => {
    // 优先使用displayPosition
    if (suggestion.details?.displayPosition) {
      return suggestion.details.displayPosition;
    }
    // 使用elementPath作为格式化位置
    if (suggestion.elementPath && suggestion.elementPath.startsWith('【')) {
      return suggestion.elementPath;
    }
    // 兼容旧格式
    if (suggestion.elementPath?.startsWith('position:')) {
      const pos = suggestion.elementPath.replace('position:', '');
      return `文档位置 ${pos}`;
    }
    // 使用beforeBlank和afterBlank构建
    if (suggestion.details?.beforeBlank || suggestion.details?.afterBlank) {
      return `【${suggestion.details.beforeBlank || ''} _____ ${suggestion.details.afterBlank || ''}】`;
    }
    return suggestion.originalText || '未知位置';
  };

  // 获取上下文片段
  const getContextSnippet = (suggestion: AISuggestion): string => {
    // 如果 suggestion 有 context 属性（后端传递），使用它
    if (suggestion.details?.context) {
      return suggestion.details.context;
    }
    // 否则从 elementPath 推断
    return suggestion.originalText;
  };

  // 预览替换效果（在原文中高亮显示）
  const handlePreview = async () => {
    if (!onPreview) return;
    setIsPreviewing(true);
    try {
      await onPreview();
    } finally {
      setIsPreviewing(false);
    }
  };

  // 处理编辑确认
  const handleEditConfirm = () => {
    if (editValue !== suggestion.suggestedName && onUpdateName) {
      onUpdateName(editValue);
    }
    setIsEditing(false);
  };

  // 处理编辑取消
  const handleEditCancel = () => {
    setEditValue(suggestion.suggestedName);
    setIsEditing(false);
  };

  return (
    <div className={`suggestion-item ${suggestion.applied ? 'applied' : ''} ${isPreviewing ? 'previewing' : ''}`}>
      <div className="suggestion-header" onClick={() => setExpanded(!expanded)}>
        <div className="confidence-badge">
          {suggestion.confidence > 0.8 ? '🟢' : suggestion.confidence > 0.5 ? '🟡' : '🔴'}
          {Math.round(suggestion.confidence * 100)}%
        </div>

        <div className="suggestion-content">
          <span className="original">{suggestion.originalText}</span>
          <span className="arrow">→</span>
          {isEditing ? (
            <input
              type="text"
              className="edit-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <span className="suggested">{suggestion.suggestedName}</span>
          )}
        </div>

        {suggestion.applied && <span className="applied-badge">已应用</span>}
        {isPreviewing && <span className="previewing-badge">预览中</span>}
      </div>

      {/* 显示原文位置（格式化显示） */}
      <div className="suggestion-context">
        <span className="context-label">原文位置:</span>
        <span className="context-text position-format">{getPositionInfo(suggestion)}</span>
      </div>

      {/* 显示项目意义 */}
      {suggestion.details?.significance && (
        <div className="suggestion-significance">
          <span className="significance-label">用途说明:</span>
          <span className="significance-text">{suggestion.details.significance}</span>
        </div>
      )}

      {/* 显示上下文内容 */}
      {suggestion.details?.context && (
        <div className="context-snippet">
          <span className="snippet-label">上下文:</span>
          <span className="snippet-text">...{suggestion.details.context}...</span>
        </div>
      )}

      {expanded && (
        <div className="suggestion-details">
          <p>变量路径: <code>{suggestion.suggestedName}</code></p>
          <p>原始文本: <code>{suggestion.originalText}</code></p>
          {suggestion.details?.formatter && (
            <p>建议格式化器: <code>{suggestion.details.formatter}</code></p>
          )}

          {!suggestion.applied && (
            <div className="suggestion-actions">
              {!isEditing ? (
                <>
                  <button className="preview-btn" onClick={handlePreview} disabled={isPreviewing}>
                    👁️ 预览
                  </button>
                  <button className="edit-btn" onClick={() => setIsEditing(true)}>
                    📝 修改
                  </button>
                  <button className="apply-btn" onClick={onApply}>
                    ✅ 应用
                  </button>
                  <button className="dismiss-btn" onClick={onDismiss}>
                    ❌ 忽略
                  </button>
                </>
              ) : (
                <>
                  <button className="confirm-btn" onClick={handleEditConfirm}>
                    ✅ 确认
                  </button>
                  <button className="cancel-btn" onClick={handleEditCancel}>
                    ❌ 取消
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AIIdentifyPanel;