/**
 * Document Generate Tool
 * 调用Carbone引擎生成文档
 */

import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';
import axios from 'axios';

type DocumentGenerateResponse = {
  downloadUrl?: string;
  fileName?: string;
  format?: string;
};

export class DocumentGenTool extends BaseTool {
  private carboneApiUrl: string;

  constructor(carboneApiUrl: string = process.env.CARBONE_API_URL || 'http://localhost:3010') {
    super(
      'document_generate',
      '根据Skill和参数生成文档。调用Carbone引擎渲染模板并返回下载链接。',
      {
        type: 'object',
        properties: {
          skillId: {
            type: 'string',
            description: '技能ID，用于获取关联的模板',
            required: true,
          },
          params: {
            type: 'object',
            description: '渲染参数（完整填充）',
            required: true,
          },
          outputFormat: {
            type: 'string',
            description: '输出格式：docx, pdf, html 等',
            required: false,
          },
        },
        required: ['skillId', 'params'],
      },
    );
    this.carboneApiUrl = carboneApiUrl;
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    const skillId = params.skillId as string;
    const renderParams = params.params as Record<string, unknown>;
    const outputFormat = (params.outputFormat as string) || 'docx';

    try {
      // 获取Skill关联的模板ID
      // 这里需要调用SkillService获取templateId
      // 暂时从context中获取
      const templateId = context.skill?.templateId || params.templateId;

      if (!templateId) {
        return {
          success: false,
          output: '未找到关联的模板，无法生成文档',
          data: { error: 'template_not_found' },
        };
      }

      // 调用Carbone渲染API
      const response = await axios.post<DocumentGenerateResponse>(
        `${this.carboneApiUrl}/studio/render`,
        {
          templateId,
          data: renderParams,
          outputFormat,
        },
        { timeout: 30000 },
      );

      if (response.data?.downloadUrl) {
        return {
          success: true,
          output: `文档已生成，下载链接: ${response.data.downloadUrl}`,
          data: {
            downloadUrl: response.data.downloadUrl,
            fileName: response.data.fileName,
            format: response.data.format,
          },
        };
      }

      return {
        success: false,
        output: '文档生成失败，API返回异常',
        data: { error: 'render_failed', response: response.data },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        output: `文档生成异常: ${errorMsg}`,
        data: { error: 'render_error', message: errorMsg },
      };
    }
  }
}
