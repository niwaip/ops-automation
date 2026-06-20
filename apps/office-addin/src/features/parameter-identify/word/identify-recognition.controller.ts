import { carboneAPI, type TemplateUnderstandResponse } from '../../../api/carbone-api';
import {
  commitWordRecognitionResult,
  executeWordRecognitionSections,
} from './identify-recognition.execution';
import type { CreateWordIdentifyRecognitionControllerOptions } from './identify-recognition.types';

export function createWordIdentifyRecognitionController(
  options: CreateWordIdentifyRecognitionControllerOptions
) {
  const ensureUnderstandingForRecognition = async (ensureOptions?: {
    forceRefresh?: boolean;
  }): Promise<TemplateUnderstandResponse | null> => {
    if (!options.sampleUploadState.fileBase64) {
      options.setAnalysisError('请先上传参考示例文件', '参考示例文件 base64 内容为空');
      return null;
    }
    if (
      options.compareResult &&
      options.compareCandidateSections.length > 0 &&
      options.effectiveCompareCandidateFields.length === 0
    ) {
      options.setAnalysisError(
        '请至少勾选一个章节',
        '当前已生成章节候选，但没有勾选任何章节，无法基于章节候选生成参数'
      );
      return null;
    }

    options.setIsUnderstanding(true);
    try {
      carboneAPI.setBaseUrl(options.apiBaseUrl);
      const workflowRequest = await options.buildWorkflowRequest({
        useSelectedCompareCandidates: true,
      });
      const forceRefresh = Boolean(ensureOptions?.forceRefresh);
      const cachedEntry = options.loadWordUnderstandingCache()[workflowRequest.cacheKey];
      if (!forceRefresh && options.isWordUnderstandingCacheCompatible(cachedEntry)) {
        options.setUnderstandingResult(cachedEntry.result);
        options.setUnderstandingRevision(options.sampleUploadState.revision);
        options.setUnderstandingLanguageSignature(options.languageSignature);
        options.setUnderstandingCompareSignature(options.currentCompareSignature);
        options.setUnderstandingCacheStatus('hit');
        options.setUnderstandingCacheUpdatedAt(cachedEntry.updatedAt);
        options.addDebugLog(
          'info',
          'Word 章节理解缓存命中',
          [
            `样本: ${options.sampleUploadState.fileName || '未命名样本'}`,
            `语言配置: ${options.workflowSourceLanguage} -> ${options.workflowTargetLanguages.join(', ') || '单语言'}`,
            `章节选择: ${options.selectedCompareSectionKeys.length || options.compareCandidateSections.length || 0}`,
            '',
            options.buildUnderstandingDebugText(
              cachedEntry.result,
              cachedEntry.result.summary.understandingSummaryText || ''
            ),
          ].join('\n')
        );
        return cachedEntry.result;
      }
      if (forceRefresh && cachedEntry) {
        options.addDebugLog(
          'info',
          'Word 章节理解强制刷新',
          '检测到手动重新理解请求，已跳过本地缓存并重新请求后端理解结果'
        );
      }
      if (cachedEntry) {
        options.removeWordUnderstandingCacheEntry(workflowRequest.cacheKey);
        if (!forceRefresh) {
          options.addDebugLog(
            'info',
            'Word 章节理解缓存失效',
            '检测到旧版或不兼容缓存，已自动清理并重新请求后端理解结果'
          );
        }
      }

      const result = await carboneAPI.understandTemplateWorkflow(workflowRequest.request as any);
      const nextUpdatedAt = Date.now();
      options.setUnderstandingResult(result);
      options.setUnderstandingRevision(options.sampleUploadState.revision);
      options.setUnderstandingLanguageSignature(options.languageSignature);
      options.setUnderstandingCompareSignature(options.currentCompareSignature);
      options.setUnderstandingCacheStatus('miss');
      options.setUnderstandingCacheUpdatedAt(nextUpdatedAt);
      options.saveWordUnderstandingCacheEntry({
        cacheKey: workflowRequest.cacheKey,
        result,
        updatedAt: nextUpdatedAt,
      });
      options.addDebugLog(
        'info',
        'Word 章节理解完成',
        options.buildUnderstandingDebugText(result, result.summary.understandingSummaryText || '')
      );
      return result;
    } finally {
      options.setIsUnderstanding(false);
    }
  };

  const handleStartUnderstanding = async (startOptions?: { forceRefresh?: boolean }) => {
    options.setAnalysisError(null, undefined);
    await ensureUnderstandingForRecognition(startOptions);
  };

  const handleStartRecognition = async () => {
    if (!options.sampleUploadState.uploaded) {
      return;
    }
    options.setAnalysisError(null, undefined);
    if (!options.sampleUploadState.fileBase64) {
      options.setAnalysisError('请先上传参考示例文件', '参考示例文件 base64 内容为空');
      return;
    }

    if (
      options.compareResult &&
      options.compareCandidateSections.length > 0 &&
      options.effectiveCompareCandidateFields.length === 0
    ) {
      options.setAnalysisError(
        '请至少勾选一个章节',
        '当前已生成章节候选，但没有勾选任何章节，无法生成参数'
      );
      return;
    }

    options.setIsRecognizing(true);
    options.setRecognitionCacheStatus(null);
    options.setRecognitionCacheUpdatedAt(null);
    try {
      carboneAPI.setBaseUrl(options.apiBaseUrl);
      const prefetchedUnderstanding = await ensureUnderstandingForRecognition();
      if (!prefetchedUnderstanding) {
        return;
      }
      const workflowRequest = await options.buildWorkflowRequest({
        includeUnderstanding: true,
        useSelectedCompareCandidates: true,
        prefetchedUnderstanding,
      });
      options.setRecognitionResult(null);
      const templateDocumentIr = workflowRequest.request.templateDocumentIr as any;
      const { sectionResults, nextSuggestions } = await executeWordRecognitionSections(options, {
        templateDocumentIr,
        prefetchedUnderstanding,
      });
      commitWordRecognitionResult(options, {
        sectionResults,
        nextSuggestions,
      });
    } catch (error: any) {
      options.setAnalysisError(
        error?.message || '参数识别失败',
        error?.stack || error?.response?.data
          ? JSON.stringify(error.response?.data, null, 2)
          : undefined
      );
      return;
    } finally {
      options.setIsRecognizing(false);
    }
    options.setRecognitionRevision(options.sampleUploadState.revision);
    options.setRecognitionLanguageSignature(options.languageSignature);
    options.setRecognitionCompareSignature(options.currentRecognitionCacheSignature);
    options.setRecognitionActivated(true);
  };

  return {
    ensureUnderstandingForRecognition,
    handleStartUnderstanding,
    handleStartRecognition,
  };
}
