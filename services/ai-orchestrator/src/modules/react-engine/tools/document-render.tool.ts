/**
 * Document Render Tool
 * 使用Carbone引擎渲染模板生成文档
 */

import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';

// Carbone引擎服务地址
const CARBONE_SERVICE_URL = process.env.CARBONE_SERVICE_URL || 'http://carbone-engine:3009';

export class DocumentRenderTool extends BaseTool {
  constructor() {
    super(
      'document_render',
      '渲染模板生成最终文档。调用Carbone引擎的render API生成文档文件。可以接收templateId和data参数，或直接使用上下文中的collectedParams和carboneTemplateId。',
      {
        type: 'object',
        properties: {
          templateId: {
            type: 'string',
            description: '模板ID',
            required: true,
          },
          data: {
            type: 'object',
            description: '用于渲染模板的参数数据',
            required: true,
          },
          format: {
            type: 'string',
            description: '输出格式（docx, pdf等）',
            required: false,
          },
        },
        required: ['templateId', 'data'],
      },
    );
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    // 优先从params获取，如果没有则从context获取
    let templateId = params.templateId as string | undefined;
    let data = params.data as Record<string, unknown> | undefined;
    const format = (params.format as string) || 'docx';

    // 如果params中没有提供，从context中获取
    if (!data && context.collectedParams) {
      data = context.collectedParams;
    }
    if (!templateId && context.skill?.carboneTemplateId) {
      templateId = context.skill.carboneTemplateId;
    }

    if (!templateId || !data) {
      return {
        success: false,
        output: '缺少必要参数：需要提供templateId和data，或者先执行参数收集步骤',
        data: { error: 'missing_params' },
      };
    }

    try {
      // 调用Carbone引擎的render API
      const response = await axios.post(`${CARBONE_SERVICE_URL}/studio/render`, {
        templateId,
        data,
        format,
      });

      const renderResult = response.data;

      // Carbone API返回格式: {downloadUrl, fileName, format}
      if (renderResult && renderResult.downloadUrl) {
        // 构建完整下载链接
        const fullDownloadUrl = `${CARBONE_SERVICE_URL}${renderResult.downloadUrl}`;

        return {
          success: true,
          output: `文档生成成功！\n文件名: ${renderResult.fileName}\n下载链接: ${fullDownloadUrl}`,
          data: {
            fileName: renderResult.fileName,
            downloadUrl: fullDownloadUrl,
            format: renderResult.format || format,
          },
        };
      }

      // 兼容旧格式 {documentId}
      if (renderResult && renderResult.documentId) {
        const downloadUrl = `${CARBONE_SERVICE_URL}/studio/download/${renderResult.documentId}`;

        return {
          success: true,
          output: `文档生成成功！下载链接: ${downloadUrl}`,
          data: {
            documentId: renderResult.documentId,
            downloadUrl,
            format,
          },
        };
      }

      return {
        success: false,
        output: '文档渲染失败',
        data: { error: 'render_failed', response: renderResult },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        output: `文档渲染服务调用失败: ${errorMsg}`,
        data: { error: 'service_error', message: errorMsg },
      };
    }
  }
}