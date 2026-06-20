import { officeAddinRuntimeConfig } from '../config/runtime';
import { createCarbonePreviewApi } from './carbone/preview.api';
import { createCarbonePublishApi } from './carbone/publish.api';
import { createCarboneTemplateApi } from './carbone/template.api';
import { createCarboneWorkflowApi } from './carbone/workflow.api';

export type {
  DocumentStructure,
  DirectAIIdentifyRequest,
  ProcessingProgressInfo,
  AIIdentifyResponse,
  GenerateTemplateRequest,
  GenerateTemplateResponse,
  TemplateFieldSpec,
  WorkflowFieldDictionaryEntry,
  WorkflowTermEntry,
  WorkflowEnumItem,
  WorkflowTermAssets,
  TemplateFieldCandidate,
  TemplateAnalyzeRequest,
  TemplateAnalyzeResponse,
  TemplateRecognizeBlockResult,
  TemplateRecognizeContextAnalysis,
  TemplateRecognizeResponse,
  TemplateCompareResponse,
  TemplateUnderstandResponse,
  TemplateSaveRequest,
  TemplateSaveResponse,
  TemplateRenderDataRequest,
  TemplateRenderDataResponse,
  TemplateWorkflowSummary,
  TemplateDetailResponse,
  RenderPlan,
  TemplateAssetManifest,
  TemplateAssetExportPayload,
  TemplateAssetImportPayload,
} from './carbone/types';
let currentBaseUrl = officeAddinRuntimeConfig.apiBaseUrl;
const getBaseUrl = () => currentBaseUrl;

const templateApi = createCarboneTemplateApi(getBaseUrl);
const workflowApi = createCarboneWorkflowApi(getBaseUrl);
const previewApi = createCarbonePreviewApi(getBaseUrl);
const publishApi = createCarbonePublishApi(getBaseUrl);

export const carboneAPI = {
  setBaseUrl(url: string) {
    currentBaseUrl = url;
  },
  ...templateApi,
  ...workflowApi,
  ...previewApi,
  ...publishApi,
};
