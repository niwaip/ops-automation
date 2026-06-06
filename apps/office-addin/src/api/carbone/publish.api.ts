import axios from 'axios';
import type { DocumentIR } from '../../host/adapters/document-ir';
import type { AISuggestion, TemplateConfig } from '../../app/store';
import { getAxiosConfig } from './client';
import type { TemplateFieldSpec, WorkflowTermAssets } from './types';

type ApiBaseUrlGetter = () => string;

export function createCarbonePublishApi(getBaseUrl: ApiBaseUrlGetter) {
  return {
    async generateSkill(request: {
      templateId?: string;
      suggestions: AISuggestion[];
      templateConfig?: TemplateConfig;
      templateType?: string;
      documentDescription?: string;
    }): Promise<{
      success: boolean;
      skill?: any;
      skillId?: string;
      error?: string;
    }> {
      const response = await axios.post(
        `${getBaseUrl()}/studio/generate-skill`,
        request,
        getAxiosConfig(getBaseUrl(), { timeout: 60000 })
      );
      return response.data;
    },

    async saveTemplateFull(request: {
      templateId?: string;
      documentContent?: string;
      suggestions: AISuggestion[];
      templateConfig?: TemplateConfig;
      templateMeta?: {
        templateName?: string;
        sourceLanguage?: string;
        targetLanguages?: string[];
        documentMode?: string;
        termAssets?: WorkflowTermAssets;
      };
      templateDocumentIr?: DocumentIR;
      templateFieldSpecs?: TemplateFieldSpec[];
      skill?: any;
      skillId?: string;
      format?: string;
      templateName?: string;
    }): Promise<{
      success: boolean;
      templateId?: string;
      skillId?: string;
      downloadUrl?: string;
      skillDownloadUrl?: string;
      error?: string;
    }> {
      const response = await axios.post(
        `${getBaseUrl()}/studio/save-template-full`,
        request,
        getAxiosConfig(getBaseUrl(), { timeout: 60000 })
      );
      return response.data;
    },
  };
}
