/**
 * Carbone Studio API
 * 用于管理Carbone模板和Skills
 */

import { apiClient } from './client';

// Carbone Template DTO for Skills page
export interface CarboneTemplateDTO {
  id: string;
  name: string;
  fileName: string;
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  skillId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Carbone API for Skills page (uses portal proxy)
export const carboneApi = {
  list: async (): Promise<{ templates: CarboneTemplateDTO[] }> => {
    // Use Portal proxy: /api/carbone -> Vite proxy -> host.docker.internal:3009/studio in Docker,
    // or localhost:3009/studio when running locally.
    return apiClient.get<{ templates: CarboneTemplateDTO[] }>('/carbone/templates');
  },

  getById: async (id: string): Promise<CarboneTemplateDTO> => {
    return apiClient.get<CarboneTemplateDTO>(`/carbone/templates/${id}`);
  },
};

// ========== Legacy API for CarboneTemplateListPage ==========

// 统一通过 Portal 代理访问 Carbone，避免浏览器直连 3009 带来的跨域和环境差异问题
const PORTAL_CARBONE_BASE = `${import.meta.env.VITE_API_BASE_URL || '/api'}/carbone`;

export interface CarboneTemplate {
  id: string;
  fileName: string;
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  size?: number;
  variables?: string[];
  loops?: Array<{ arrayPath: string }>;
  skillId?: string;
  createdAt?: string;
  updatedAt?: string;
  config?: any;
  suggestions?: any[];
}

export interface CarboneSkill {
  id: string;
  templateId: string;
  parameters?: any[];
  parsingGuide?: string;
  dataParsing?: any;
  validation?: any;
  aiInstructions?: string;
  skillGuideMarkdown?: string;
  dataExampleJson?: any;
  updatedAt?: string;
}

const isDraftDocumentTemplate = (template: CarboneTemplate): boolean => {
  const fileName = String(template.fileName || '').trim().toLowerCase();
  return fileName.startsWith('draft-');
};

class CarboneAPI {
  /**
   * 获取所有模板列表
   */
  async getTemplates(): Promise<CarboneTemplate[]> {
    const response = await apiClient.get<{ templates: CarboneTemplate[] }>(`/carbone/templates`);
    return (response.templates || []).filter((template) => !isDraftDocumentTemplate(template));
  }

  /**
   * 获取单个模板详情
   */
  async getTemplate(id: string): Promise<CarboneTemplate> {
    return apiClient.get<CarboneTemplate>(`/carbone/templates/${id}`);
  }

  /**
   * 获取模板Skill
   */
  async getSkill(skillId: string): Promise<CarboneSkill> {
    return apiClient.get<CarboneSkill>(`/carbone/skill/${skillId}`);
  }

  /**
   * 删除模板
   */
  async deleteTemplate(id: string): Promise<{ success: boolean }> {
    return apiClient.post<{ success: boolean }>(`/carbone/templates/${id}/delete`);
  }

  /**
   * 重命名模板
   */
  async renameTemplate(id: string, newName: string): Promise<{ success: boolean; fileName: string }> {
    return apiClient.post<{ success: boolean; fileName: string }>(
      `/carbone/templates/${id}/rename`,
      { newName },
    );
  }

  /**
   * 下载模板文件URL
   */
  getDownloadTemplateUrl(id: string): string {
    return `${PORTAL_CARBONE_BASE}/download-template/${id}`;
  }

  /**
   * 下载Skill文件URL
   */
  getDownloadSkillUrl(skillId: string): string {
    return `${PORTAL_CARBONE_BASE}/download-skill/${skillId}`;
  }

  /**
   * 获取模板预览URL
   */
  getPreviewUrl(id: string): string {
    return `${PORTAL_CARBONE_BASE}/templates/${id}/preview-html`;
  }
}

export const carboneAPI = new CarboneAPI();
export default carboneAPI;
