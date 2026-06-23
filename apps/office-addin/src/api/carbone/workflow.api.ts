import axios from 'axios';
import { LONG_RUNNING_WORKFLOW_TIMEOUT_MS, getAxiosConfig } from './client';
import type {
  AIIdentifyResponse,
  DirectAIIdentifyRequest,
  ProcessingProgressInfo,
  TemplateAnalyzeRequest,
  TemplateAnalyzeResponse,
  TemplateCompareResponse,
  TemplateRecognizeBlockResult,
  TemplateRecognizeResponse,
  TemplateRenderDataRequest,
  TemplateRenderDataResponse,
  TemplateSaveRequest,
  TemplateSaveResponse,
  TemplateUnderstandResponse,
} from './types';

type ApiBaseUrlGetter = () => string;

function normalizeWorkflowLookupText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[（）()]/g, '')
    .replace(/\s+/g, '');
}

function buildUnderstandFallbackFromAnalyze(
  request: TemplateAnalyzeRequest,
  analyzeResult: TemplateAnalyzeResponse
): TemplateUnderstandResponse {
  return {
    analysisId: analyzeResult.analysisId,
    languageProfile: analyzeResult.languageProfile,
    summary: {
      documentTitle:
        request.templateDocumentIr?.metadata?.title || request.sampleDocument?.fileName,
      understandingSummaryText: undefined,
      sampleFileName: request.sampleDocument?.fileName,
      paragraphCount:
        request.templateDocumentIr?.stats?.paragraphCount ||
        request.templateDocumentIr?.elements?.filter((element) => element?.type === 'paragraph')
          .length ||
        0,
      tableCount:
        request.templateDocumentIr?.stats?.tableCount ||
        request.templateDocumentIr?.elements?.filter((element) => element?.type === 'table')
          .length ||
        0,
      sectionHints: [],
      terminologyCandidates: analyzeResult.fields
        .filter((field) => field.termMatch?.status === 'matched')
        .map((field) => field.fieldId)
        .slice(0, 8),
      fieldCandidateIds: request.candidateFields?.length
        ? request.candidateFields.map((field) => field.fieldIdHint || field.candidateId)
        : analyzeResult.fields.map((field) => field.fieldId),
      layoutFeatures: analyzeResult.languageProfile.documentMode
        ? [analyzeResult.languageProfile.documentMode]
        : [],
    },
    warnings: [
      '当前后端未开放 understand 接口，已自动降级为 analyze 结果生成整体理解摘要。',
      ...(analyzeResult.warnings || []),
    ],
  };
}

function buildRecognizeFallbackFromAnalyze(
  request: TemplateAnalyzeRequest,
  analyzeResult: TemplateAnalyzeResponse
): TemplateRecognizeResponse {
  const elements = Array.isArray(request.templateDocumentIr?.elements)
    ? request.templateDocumentIr.elements
    : [];
  const blockResults = elements
    .filter((element) => ['paragraph', 'table', 'cell'].includes(String(element?.type || '')))
    .map((element) => {
      const blockId = String(element?.id || '');
      const normalizedExcerpt = normalizeWorkflowLookupText(element?.text);
      const matchedFields = analyzeResult.fields.filter((field) =>
        (field.sourceBindings || []).some((binding) => {
          if (String(binding.blockId || '') === blockId) {
            return true;
          }
          const anchorPrefix = normalizeWorkflowLookupText(binding.anchor?.prefix);
          return Boolean(anchorPrefix) && normalizedExcerpt.includes(anchorPrefix);
        })
      );
      return {
        blockId,
        blockType: String(element?.type || 'paragraph'),
        title:
          String(element?.text || '')
            .trim()
            .slice(0, 24) || blockId,
        sectionTitle:
          String(element?.text || '')
            .trim()
            .slice(0, 24) || blockId,
        sourceExcerpt: String(element?.text || '')
          .trim()
          .slice(0, 120),
        suggestionCount: matchedFields.length,
        fieldIds: matchedFields.map((field) => field.fieldId),
        aiCallSucceeded: false,
        resultStatus: matchedFields.length > 0 ? 'fallback_success' : 'empty',
        warnings: matchedFields.length > 0 ? [] : ['当前块未识别到字段候选'],
        retryCount: 0,
        durationMs: 0,
        fallbackReason: matchedFields.length > 0 ? 'rule_based_block_scan' : undefined,
        contextAnalysis: {
          requestSummary: `块 ${blockId || 'unknown'} 已进入识别队列`,
          responseSummary:
            matchedFields.length > 0
              ? `通过回退链路识别到 ${matchedFields.length} 个字段`
              : '当前块未返回字段候选',
          cacheHit: false,
          fallbackReason: matchedFields.length > 0 ? 'rule_based_block_scan' : undefined,
          retryCount: 0,
        },
      } as TemplateRecognizeBlockResult;
    });

  return {
    ...analyzeResult,
    blockResults,
    contextAnalysis: {
      requestedAI: true,
      usedAI: false,
      resultStatus: analyzeResult.fields.length > 0 ? 'fallback_success' : 'succeeded',
      requestTrace: {
        summary: '当前后端未开放 recognize 接口，已自动降级为 analyze 结果构造块级识别视图。',
        sampleFileName: request.sampleDocument?.fileName,
        blockCount: blockResults.length,
        candidateFieldCount: analyzeResult.fields.length,
      },
      responseTrace: {
        summary:
          analyzeResult.fields.length > 0
            ? `已合并 ${analyzeResult.fields.length} 个字段候选`
            : '当前未返回字段候选',
        mergedFieldCount: analyzeResult.fields.length,
        recognizedBlockCount: blockResults.filter((block) => block.suggestionCount > 0).length,
      },
      fallbackTrace: {
        usedFallback: true,
        reason: 'recognize 接口不可用，前端已回退到 analyze 结果',
        fallbackBlockCount: blockResults.filter(
          (block) => block.resultStatus === 'fallback_success'
        ).length,
      },
      cacheTrace: {
        recognitionHit: false,
      },
    },
  };
}

export function createCarboneWorkflowApi(getBaseUrl: ApiBaseUrlGetter) {
  return {
    async identifyDocumentDirect(request: DirectAIIdentifyRequest): Promise<AIIdentifyResponse> {
      const response = await axios.post(
        `${getBaseUrl()}/studio/direct-ai-identify`,
        request,
        getAxiosConfig(getBaseUrl(), { timeout: 360000 })
      );
      return response.data;
    },

    async identifyDocumentMultiStage(
      request: DirectAIIdentifyRequest
    ): Promise<AIIdentifyResponse> {
      const response = await axios.post(
        `${getBaseUrl()}/studio/direct-ai-identify-multistage`,
        request,
        getAxiosConfig(getBaseUrl(), { timeout: 360000 })
      );
      return response.data;
    },

    identifyDocumentWithProgress(
      request: DirectAIIdentifyRequest,
      onProgress: (progress: ProcessingProgressInfo) => void,
      onResult: (result: AIIdentifyResponse) => void,
      onError: (error: string) => void
    ): void {
      const params = new URLSearchParams({
        documentContent: request.documentContent,
        documentType: request.documentType,
        templateType: request.templateType || 'report',
        context: request.context || '',
      });

      const url = `${getBaseUrl()}/studio/direct-ai-identify-progress?${params.toString()}`;
      const eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        try {
          const data: ProcessingProgressInfo = JSON.parse(event.data);

          if (data.type === 'progress') {
            onProgress(data);
          } else if (data.type === 'result') {
            onResult(data.data!);
            eventSource.close();
          } else if (data.type === 'error') {
            onError(data.error || 'Unknown error');
            eventSource.close();
          }
        } catch (error) {
          console.error('Failed to parse SSE data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        onError('Connection error');
        eventSource.close();
      };
    },

    async analyzeTemplateWorkflow(
      request: TemplateAnalyzeRequest
    ): Promise<TemplateAnalyzeResponse> {
      const response = await axios.post(
        `${getBaseUrl()}/studio/template/analyze`,
        request,
        getAxiosConfig(getBaseUrl(), { timeout: 60000 })
      );
      return response.data;
    },

    async compareTemplateWorkflow(
      request: TemplateAnalyzeRequest
    ): Promise<TemplateCompareResponse> {
      const response = await axios.post(
        `${getBaseUrl()}/studio/template/compare`,
        request,
        getAxiosConfig(getBaseUrl(), { timeout: 60000 })
      );
      return response.data;
    },

    async understandTemplateWorkflow(
      request: TemplateAnalyzeRequest
    ): Promise<TemplateUnderstandResponse> {
      try {
        const response = await axios.post(
          `${getBaseUrl()}/studio/template/understand`,
          request,
          getAxiosConfig(getBaseUrl(), { timeout: LONG_RUNNING_WORKFLOW_TIMEOUT_MS })
        );
        return response.data;
      } catch (error: any) {
        if (error?.response?.status !== 404) {
          throw error;
        }

        const analyzeResult = await this.analyzeTemplateWorkflow(request);
        return buildUnderstandFallbackFromAnalyze(request, analyzeResult);
      }
    },

    async recognizeTemplateWorkflow(
      request: TemplateAnalyzeRequest
    ): Promise<TemplateRecognizeResponse> {
      try {
        const response = await axios.post(
          `${getBaseUrl()}/studio/template/recognize`,
          request,
          getAxiosConfig(getBaseUrl(), { timeout: LONG_RUNNING_WORKFLOW_TIMEOUT_MS })
        );
        return response.data;
      } catch (error: any) {
        if (error?.response?.status !== 404) {
          throw error;
        }
        const analyzeResult = await this.analyzeTemplateWorkflow(request);
        return buildRecognizeFallbackFromAnalyze(request, analyzeResult);
      }
    },

    async saveTemplateWorkflow(request: TemplateSaveRequest): Promise<TemplateSaveResponse> {
      const response = await axios.post(
        `${getBaseUrl()}/studio/template/save`,
        request,
        getAxiosConfig(getBaseUrl(), { timeout: 60000 })
      );
      return response.data;
    },

    async generateTemplateRenderData(
      request: TemplateRenderDataRequest
    ): Promise<TemplateRenderDataResponse> {
      const response = await axios.post(
        `${getBaseUrl()}/studio/template/render-data`,
        request,
        getAxiosConfig(getBaseUrl(), { timeout: 60000 })
      );
      return response.data;
    },
  };
}
