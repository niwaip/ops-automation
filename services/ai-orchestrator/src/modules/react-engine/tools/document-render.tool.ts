/**
 * Document Render Tool
 * 使用Carbone引擎渲染模板生成文档
 */

import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';

type DocumentRenderResponse = {
  downloadUrl?: string;
  fileName?: string;
  format?: string;
  documentId?: string;
};

const looksLikeParameterIssue = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return (
    normalized.includes('参数')
    || normalized.includes('missing')
    || normalized.includes('invalid')
    || normalized.includes('validation')
    || normalized.includes('required')
  );
};

const isTemplateVisibleInSnapshot = (
  templateId: string | undefined,
  context: ExecutionContext,
): boolean => {
  if (!templateId || !context.capabilitySnapshot) {
    return true;
  }

  return context.capabilitySnapshot.visibleSkills.some((skill) => {
    return Boolean(
      skill.carboneTemplateId === templateId
      || skill.templateId === templateId
      || skill.executionFlowTemplateIds?.includes(templateId),
    );
  });
};

// Carbone引擎服务地址（内部调用）
const CARBONE_SERVICE_URL = process.env.CARBONE_SERVICE_URL || 'http://carbone-engine:3009';
// 外部可访问的下载地址（返回给用户）
const CARBONE_EXTERNAL_URL = process.env.CARBONE_EXTERNAL_URL || `http://${process.env.HOST_IP || 'localhost'}:3009`;

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
      { 
        category: 'execution', 
        requiresConfirmation: true,
        requiredRoles: ['admin'] // 仅管理员可执行最终渲染
      },
    );
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    const lockedTemplateId = context.documentContext?.selectedTemplateId;
    const requestedTemplateId = params.templateId as string | undefined;
    const templateId = lockedTemplateId || requestedTemplateId || context.skill?.carboneTemplateId;
    let data = params.data as Record<string, unknown> | undefined;
    const format = (params.format as string) || 'docx';

    if (!data && context.collectedParams) {
      data = context.collectedParams;
    }

    if (
      lockedTemplateId
      && requestedTemplateId
      && lockedTemplateId !== requestedTemplateId
    ) {
      return {
        success: false,
        output: `模板已锁定为 ${lockedTemplateId}，当前请求模板 ${requestedTemplateId} 与已选模板不一致。`,
        code: 'template_mismatch',
        severity: 'warning',
        data: {
          error: 'template_mismatch',
          lockedTemplateId,
          requestedTemplateId,
        },
        requiresUserInput: true,
        userInputPrompt:
          `当前会话已锁定模板（templateId=${lockedTemplateId}）。请确认是否继续使用该模板，或先通过 document_intake 重新选择模板。`,
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedTemplateId: lockedTemplateId,
        },
      };
    }

    if (!templateId || !data) {
      return {
        success: false,
        output: '缺少必要参数：需要提供templateId和data，或者先执行参数收集步骤',
        code: 'missing_params',
        severity: 'warning',
        data: {
          error: 'missing_params',
          missingTemplateId: !templateId,
          missingData: !data,
        },
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedTemplateId: templateId,
        },
      };
    }

    if (!isTemplateVisibleInSnapshot(templateId, context)) {
      return {
        success: false,
        output: `当前权限下不可使用模板 ${templateId} 进行渲染。`,
        code: 'template_not_visible_in_capability_snapshot',
        severity: 'error',
        data: {
          error: 'template_not_visible_in_capability_snapshot',
          templateId,
        },
        meta: {
          toolName: this.name,
          capabilityChecked: true,
          selectedTemplateId: templateId,
        },
      };
    }

    try {
      // 调用Carbone引擎的render API
      const response = await axios.post<DocumentRenderResponse>(`${CARBONE_SERVICE_URL}/studio/render`, {
        templateId,
        data,
        format,
      });

      const renderResult = response.data;

      // Carbone API返回格式: {downloadUrl, fileName, format}
      if (renderResult && renderResult.downloadUrl) {
        // 外部可访问的下载链接
        const externalDownloadUrl = `${CARBONE_EXTERNAL_URL}${renderResult.downloadUrl}`;
        const finalAnswer = `文档生成成功！您可以点击下方链接下载：\n\n[${renderResult.fileName}](${externalDownloadUrl})`;

        return {
          success: true,
          output: `文档生成成功！任务已完成。\n\n文件名: ${renderResult.fileName}\n下载链接: ${externalDownloadUrl}\n\n【任务完成】请输出 Final Answer，告知用户文档已生成并提供下载链接。不要再调用任何工具。`,
          code: 'document_render_completed',
          severity: 'info',
          data: {
            fileName: renderResult.fileName,
            downloadUrl: externalDownloadUrl,
            format: renderResult.format || format,
            taskComplete: true,
            finalAnswer,
          },
          meta: {
            toolName: this.name,
            capabilityChecked: Boolean(context.capabilitySnapshot),
            selectedTemplateId: templateId,
          },
        };
      }

      // 兼容旧格式 {documentId}
      if (renderResult && renderResult.documentId) {
        const downloadUrl = `${CARBONE_EXTERNAL_URL}/studio/download/${renderResult.documentId}`;
        const finalAnswer = `文档生成成功！您可以点击下方链接下载：\n\n[下载文档](${downloadUrl})`;

        return {
          success: true,
          output: `文档生成成功！任务已完成。\n\n下载链接: ${downloadUrl}\n\n【任务完成】请输出 Final Answer，告知用户文档已生成并提供下载链接。不要再调用任何工具。`,
          code: 'document_render_completed',
          severity: 'info',
          data: {
            documentId: renderResult.documentId,
            downloadUrl,
            format,
            taskComplete: true,
            finalAnswer,
          },
          meta: {
            toolName: this.name,
            capabilityChecked: Boolean(context.capabilitySnapshot),
            selectedTemplateId: templateId,
          },
        };
      }

      return {
        success: false,
        output: '文档渲染失败',
        code: 'render_failed',
        severity: 'error',
        data: { error: 'render_failed', response: renderResult },
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedTemplateId: templateId,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const parameterIssue = looksLikeParameterIssue(errorMsg);
      return {
        success: false,
        output: `文档渲染服务调用失败: ${errorMsg}`,
        code: parameterIssue ? 'param_validation_failed' : 'service_error',
        severity: 'error',
        data: {
          error: parameterIssue ? 'param_validation_failed' : 'service_error',
          message: errorMsg,
          parameterIssue,
        },
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedTemplateId: templateId,
        },
      };
    }
  }
}
