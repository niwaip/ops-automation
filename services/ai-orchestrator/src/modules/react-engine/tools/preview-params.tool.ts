/**
 * Preview Parameters Tool
 * 使用AI生成的参数预览文档效果
 * 调用Carbone引擎的preview-with-skill API
 */

import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';

// Carbone引擎服务地址
const CARBONE_SERVICE_URL = process.env.CARBONE_SERVICE_URL || 'http://carbone-engine:3009';

export class PreviewParamsTool extends BaseTool {
  constructor() {
    super(
      'preview_params',
      '使用AI生成的参数预览文档效果。调用preview-with-skill API验证参数是否正确填充到模板中。',
      {
        type: 'object',
        properties: {
          templateId: {
            type: 'string',
            description: '模板ID',
            required: true,
          },
          skillId: {
            type: 'string',
            description: 'AI Skill ID',
            required: false,
          },
          data: {
            type: 'object',
            description: '用于预览的参数数据',
            required: true,
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
    // 优先从params获取，其次从context获取
    let templateId = params.templateId as string | undefined;
    let skillId = params.skillId as string | undefined;
    let data = params.data as Record<string, unknown> | undefined;

    // 从context获取fallback值
    if (!templateId && context.skill?.carboneTemplateId) {
      templateId = context.skill.carboneTemplateId;
    }
    if (!skillId && context.skill?.carboneSkillId) {
      skillId = context.skill.carboneSkillId;
    }
    if (!data && context.collectedParams) {
      data = context.collectedParams;
    }

    if (!templateId || !data) {
      return {
        success: false,
        output: '缺少必要参数：需要提供templateId和data',
        data: { error: 'missing_params' },
      };
    }

    try {
      // 调用Carbone引擎的preview-with-skill API
      const response = await axios.post(`${CARBONE_SERVICE_URL}/studio/preview-with-skill`, {
        templateId,
        skillId,
        simulatedData: data,
      });

      const previewResult = response.data;

      if (previewResult && previewResult.success) {
        const previewUrl = previewResult.previewUrl;
        const downloadUrl = previewResult.downloadUrl;

        // 构建完整URL
        const fullPreviewUrl = previewUrl ? `${CARBONE_SERVICE_URL}${previewUrl}` : null;
        const fullDownloadUrl = downloadUrl ? `${CARBONE_SERVICE_URL}${downloadUrl}` : null;

        return {
          success: true,
          output: `参数预览成功！
生成的参数数据:
${JSON.stringify(previewResult.generatedData || data, null, 2)}

预览链接: ${fullPreviewUrl || '未生成'}
下载链接: ${fullDownloadUrl || '未生成'}

【参数验证】参数已正确填充到模板中，可以生成最终文档。
下一步请调用 document_render 工具生成正式文档。`,
          data: {
            previewUrl: fullPreviewUrl,
            downloadUrl: fullDownloadUrl,
            generatedData: previewResult.generatedData || data,
            skillUsed: previewResult.skillUsed,
          },
          // 提示下一步调用document_render
          nextAction: 'document_render',
          nextActionParams: {
            templateId,
            data: previewResult.generatedData || data,
          },
        };
      }

      return {
        success: false,
        output: '参数预览失败',
        data: { error: 'preview_failed', response: previewResult },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        output: `参数预览服务调用失败: ${errorMsg}`,
        data: { error: 'service_error', message: errorMsg },
      };
    }
  }
}