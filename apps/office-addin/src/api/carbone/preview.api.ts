import axios from 'axios';
import { getAxiosConfig } from './client';

type ApiBaseUrlGetter = () => string;

export function createCarbonePreviewApi(getBaseUrl: ApiBaseUrlGetter) {
  return {
    async previewRender(
      template: string,
      data: Record<string, any>
    ): Promise<{ preview: string; format: string }> {
      const response = await axios.post(
        `${getBaseUrl()}/studio/preview`,
        { template, data },
        getAxiosConfig(getBaseUrl())
      );
      return response.data;
    },

    async previewRenderContent(
      documentContent: string,
      templateConfig: any,
      format: string = 'docx'
    ): Promise<{
      success: boolean;
      previewUrl?: string;
      sampleData?: any;
      error?: string;
    }> {
      const response = await axios.post(
        `${getBaseUrl()}/studio/preview-content`,
        { documentContent, templateConfig, format },
        getAxiosConfig(getBaseUrl(), { timeout: 60000 })
      );
      return response.data;
    },

    async previewWithSkill(request: {
      templateId?: string;
      skillId?: string;
      skill?: any;
      simulatedData?: any;
    }): Promise<{
      success: boolean;
      previewUrl?: string;
      downloadUrl?: string;
      generatedData?: any;
      skillUsed?: any;
      error?: string;
      debugLogs?: string[];
    }> {
      const response = await axios.post(
        `${getBaseUrl()}/studio/preview-with-skill`,
        request,
        getAxiosConfig(getBaseUrl(), { timeout: 60000 })
      );
      return response.data;
    },

    async generateParameters(request: {
      description: string;
      skill?: any;
      skillId?: string;
      thinking?: boolean;
    }): Promise<{
      success: boolean;
      generatedData?: any;
      error?: string;
      debugInfo?: {
        rawAiResponse?: string;
        cleanedAiResponse?: string;
        extractedJson?: string;
        parseError?: string;
        upstreamError?: string;
      };
    }> {
      const response = await axios.post(
        `${getBaseUrl()}/studio/generate-parameters`,
        request,
        getAxiosConfig(getBaseUrl(), { timeout: 360000 })
      );
      return response.data;
    },
  };
}
