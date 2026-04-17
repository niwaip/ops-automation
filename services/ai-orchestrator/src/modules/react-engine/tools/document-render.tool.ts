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
      '渲染模板生成最终文档。调用Carbone引擎的render API，使用参数数据生成文档文件。',
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
    const templateId = params.templateId as string;
    const data = params.data as Record<string, unknown>;
    const format = (params.format as string) || 'docx';

    try {
      // 调用Carbone引擎的render API
      const response = await axios.post(`${CARBONE_SERVICE_URL}/studio/render`, {
        templateId,
        data,
        format,
      });

      const renderResult = response.data;

      if (renderResult && renderResult.documentId) {
        // 构建下载链接
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
        data: { error: 'render_failed' },
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