/**
 * Carbone Studio API
 * 用于管理Carbone模板和Skills
 */

import { apiClient } from './client';
import axios from 'axios';

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
    // Use portal proxy: /api/carbone -> carbone-engine:3009/studio
    return apiClient.get<{ templates: CarboneTemplateDTO[] }>('/carbone/templates');
  },

  getById: async (id: string): Promise<CarboneTemplateDTO> => {
    return apiClient.get<CarboneTemplateDTO>(`/carbone/templates/${id}`);
  },
};

// ========== Legacy API for CarboneTemplateListPage ==========

// Carbone Engine API 基础URL（独立服务）
const CARBONE_API_URL = import.meta.env.VITE_CARBONE_API_URL || 'https://localhost:3443';

// 创建独立的axios实例（不使用portal的认证）
const carboneClient = axios.create({
  baseURL: CARBONE_API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

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

class CarboneAPI {
  /**
   * 获取所有模板列表
   */
  async getTemplates(): Promise<CarboneTemplate[]> {
    const response = await carboneClient.get('/studio/templates');
    return response.data.templates || response.data;
  }

  /**
   * 获取单个模板详情
   */
  async getTemplate(id: string): Promise<CarboneTemplate> {
    const response = await carboneClient.get(`/studio/templates/${id}`);
    return response.data;
  }

  /**
   * 获取模板Skill
   */
  async getSkill(skillId: string): Promise<CarboneSkill> {
    const response = await carboneClient.get(`/studio/skill/${skillId}`);
    return response.data;
  }

  /**
   * 删除模板
   */
  async deleteTemplate(id: string): Promise<{ success: boolean }> {
    const response = await carboneClient.post(`/studio/templates/${id}/delete`);
    return response.data;
  }

  /**
   * 重命名模板
   */
  async renameTemplate(id: string, newName: string): Promise<{ success: boolean; fileName: string }> {
    const response = await carboneClient.post(`/studio/templates/${id}/rename`, { newName });
    return response.data;
  }

  /**
   * 下载模板文件URL
   */
  getDownloadTemplateUrl(id: string): string {
    return `${CARBONE_API_URL}/studio/download-template/${id}`;
  }

  /**
   * 下载Skill文件URL
   */
  getDownloadSkillUrl(skillId: string): string {
    return `${CARBONE_API_URL}/studio/download-skill/${skillId}`;
  }

  /**
   * 获取模板预览URL
   */
  getPreviewUrl(id: string): string {
    return `${CARBONE_API_URL}/studio/templates/${id}/preview-html`;
  }
}

export const carboneAPI = new CarboneAPI();
export default carboneAPI;