import axios from 'axios';
import { getAxiosConfig } from './client';
import type {
  GenerateTemplateRequest,
  GenerateTemplateResponse,
  TemplateDetailResponse,
} from './types';

type ApiBaseUrlGetter = () => string;

function isDraftDocumentTemplate(template: { fileName?: string }): boolean {
  const fileName = String(template.fileName || '').trim().toLowerCase();
  return fileName.startsWith('draft-');
}

export function createCarboneTemplateApi(getBaseUrl: ApiBaseUrlGetter) {
  return {
    async parseTemplate(templateContent: string): Promise<{
      variables: Array<{
        marker: string;
        path: string;
        formatter: string | null;
        isArray: boolean;
      }>;
      totalMarkers: number;
    }> {
      const response = await axios.post(
        `${getBaseUrl()}/parse`,
        { template: templateContent },
        getAxiosConfig(getBaseUrl(), { timeout: 30000 })
      );
      return response.data;
    },

    async renderTemplate(
      templateContent: string,
      data: Record<string, any>,
      options?: { convertTo?: string }
    ): Promise<{ result: string; format: string }> {
      const response = await axios.post(
        `${getBaseUrl()}/render`,
        {
          template: templateContent,
          data,
          options: options || {},
        },
        getAxiosConfig(getBaseUrl(), { timeout: 60000 })
      );
      return response.data;
    },

    async generateTemplate(request: GenerateTemplateRequest): Promise<GenerateTemplateResponse> {
      const response = await axios.post(
        `${getBaseUrl()}/studio/generate`,
        request,
        getAxiosConfig(getBaseUrl(), { timeout: 30000 })
      );
      return response.data;
    },

    async validateTemplate(templateContent: string): Promise<{
      valid: boolean;
      errors: string[];
      warnings: string[];
    }> {
      const response = await axios.post(
        `${getBaseUrl()}/studio/validate-content`,
        { template: templateContent },
        getAxiosConfig(getBaseUrl())
      );
      return response.data;
    },

    async getTemplateTypes(): Promise<Array<{ id: string; name: string; description: string }>> {
      const response = await axios.get(
        `${getBaseUrl()}/studio/template-types`,
        getAxiosConfig(getBaseUrl())
      );
      return response.data;
    },

    async getFormatters(): Promise<Array<{
      name: string;
      syntax: string;
      description: string;
      example: string;
    }>> {
      const response = await axios.get(
        `${getBaseUrl()}/studio/formatters`,
        getAxiosConfig(getBaseUrl())
      );
      return response.data;
    },

    async getTemplates(options?: { includeDrafts?: boolean }): Promise<{
      templates: Array<{
        id: string;
        fileName?: string;
        format: string;
        size?: number;
        createdAt?: string;
        uploadedAt?: string;
        config?: any;
        suggestions?: any[];
      }>;
    }> {
      const response = await axios.get(
        `${getBaseUrl()}/studio/templates`,
        getAxiosConfig(getBaseUrl())
      );
      const includeDrafts = options?.includeDrafts === true;
      return {
        ...response.data,
        templates: includeDrafts
          ? (response.data.templates || [])
          : (response.data.templates || []).filter(
              (template: { fileName?: string }) => !isDraftDocumentTemplate(template)
            ),
      };
    },

    async getTemplate(templateId: string): Promise<TemplateDetailResponse> {
      const response = await axios.get(
        `${getBaseUrl()}/studio/templates/${templateId}`,
        getAxiosConfig(getBaseUrl())
      );
      const templateWorkflow = response.data?.templateWorkflow || response.data?.templateConfig?.templateWorkflow;
      return {
        ...response.data,
        templateWorkflow,
      };
    },

    getTemplateDownloadUrl(templateId: string): string {
      return `${getBaseUrl()}/studio/download-template/${templateId}`;
    },

    async getSkill(skillId: string): Promise<{
      id: string;
      templateType?: string;
      parameters?: Array<{
        name: string;
        usage: string;
        dataType: string;
        extractionHint: string;
        example: string;
      }>;
      parameterization?: any;
      createdAt?: string;
    }> {
      const response = await axios.get(
        `${getBaseUrl()}/studio/skill/${skillId}`,
        getAxiosConfig(getBaseUrl())
      );
      return response.data;
    },

    getSkillDownloadUrl(skillId: string): string {
      return `${getBaseUrl()}/studio/download-skill/${skillId}`;
    },
  };
}
