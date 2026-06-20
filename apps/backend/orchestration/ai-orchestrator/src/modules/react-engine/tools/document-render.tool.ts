/**
 * Document Render Tool
 * 使用Carbone引擎渲染模板生成文档
 */

import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { getCarboneExternalUrl, getCarboneServiceUrl } from '../../../config/service-endpoints';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';
import { Tool } from '../decorators/tool.decorator';

type DocumentRenderResponse = {
  downloadUrl?: string;
  fileName?: string;
  format?: string;
};

type RenderResolvedRequest = {
  publishedSkillId?: string;
  templateId?: string;
  skillId?: string;
  data: Record<string, unknown>;
  outputFormat?: string;
};

type GenerateRenderDataResponse = {
  success?: boolean;
  renderResolvedRequest?: RenderResolvedRequest;
};

const looksLikeParameterIssue = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return (
    normalized.includes('参数') ||
    normalized.includes('missing') ||
    normalized.includes('invalid') ||
    normalized.includes('validation') ||
    normalized.includes('required')
  );
};

const isTemplateVisibleInSnapshot = (
  templateId: string | undefined,
  context: ExecutionContext
): boolean => {
  if (!templateId || !context.capabilitySnapshot) {
    return true;
  }

  return context.capabilitySnapshot.visibleSkills.some((skill) => {
    return Boolean(
      skill.carboneTemplateId === templateId ||
      skill.templateId === templateId ||
      skill.executionFlowTemplateIds?.includes(templateId)
    );
  });
};

const resolveSelectedPublishedSkillId = (context: ExecutionContext): string | undefined => {
  return (
    context.skill?.skillId ||
    context.documentContext?.selectedSkillId ||
    context.capabilitySnapshot?.selectedSkillId
  );
};

const asPlainObject = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

@Injectable()
@Tool({
  name: 'document_render',
  description: '调用Carbone引擎根据模板ID和数据渲染文档。返回下载链接。',
  parameters: {
    type: 'object',
    properties: {
      templateId: {
        type: 'string',
        description: 'Carbone引擎中的模板ID',
        required: true,
      },
      data: {
        type: 'object',
        description: '填充模板的数据',
        required: true,
      },
      format: {
        type: 'string',
        description: '输出格式（如pdf, docx, xlsx），默认docx',
        required: false,
      },
    },
    required: ['templateId', 'data'],
  },
  isDefault: true,
})
export class DocumentRenderTool extends BaseTool {
  constructor() {
    super('document_render', '调用Carbone引擎根据模板ID和数据渲染文档。返回下载链接。', {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description: 'Carbone引擎中的模板ID',
          required: true,
        },
        data: {
          type: 'object',
          description: '填充模板的数据',
          required: true,
        },
        format: {
          type: 'string',
          description: '输出格式（如pdf, docx, xlsx），默认docx',
          required: false,
        },
      },
      required: ['templateId', 'data'],
    });
  }

  async execute(params: Record<string, unknown>, context: ExecutionContext): Promise<ToolResult> {
    const lockedTemplateId = context.documentContext?.selectedTemplateId;
    const publishedSkillId = resolveSelectedPublishedSkillId(context);
    const carboneSkillId = context.skill?.carboneSkillId;
    const requestedTemplateId = params.templateId as string | undefined;
    const templateId = lockedTemplateId || requestedTemplateId || context.skill?.carboneTemplateId;
    let data = params.data as Record<string, unknown> | undefined;
    const format = (params.format as string) || 'docx';

    if (!data && context.collectedParams) {
      data = context.collectedParams;
    }

    if (lockedTemplateId && requestedTemplateId && lockedTemplateId !== requestedTemplateId) {
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
        userInputPrompt: `当前会话已锁定模板（templateId=${lockedTemplateId}）。请确认是否继续使用该模板，或改为通过主链路重新发起文档生成请求。`,
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedTemplateId: lockedTemplateId,
        },
      };
    }

    if ((!templateId && !carboneSkillId) || !data) {
      return {
        success: false,
        output:
          '缺少必要参数：需要提供 templateId 或可解析的文档技能上下文，以及 data，或者先执行参数收集步骤',
        code: 'missing_params',
        severity: 'warning',
        data: {
          error: 'missing_params',
          missingRenderTarget: !templateId && !carboneSkillId,
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
      const defaultRequest: RenderResolvedRequest = {
        ...(publishedSkillId ? { publishedSkillId } : {}),
        ...(templateId ? { templateId } : {}),
        ...(carboneSkillId ? { skillId: carboneSkillId } : {}),
        data,
        outputFormat: format,
      };
      let renderRequest = defaultRequest;

      try {
        const standardizeResponse = await axios.post<GenerateRenderDataResponse>(
          `${getCarboneServiceUrl()}/studio/generate-render-data-with-skill`,
          {
            ...(publishedSkillId ? { publishedSkillId } : {}),
            ...(templateId ? { templateId } : {}),
            ...(carboneSkillId ? { skillId: carboneSkillId } : {}),
            simulatedData: data,
            outputFormat: format,
          }
        );
        const standardizedRequest = standardizeResponse.data?.renderResolvedRequest;
        const standardizedData = asPlainObject(standardizedRequest?.data);
        if (standardizeResponse.data?.success && standardizedRequest && standardizedData) {
          renderRequest = {
            ...standardizedRequest,
            data: standardizedData,
            ...(standardizedRequest.outputFormat ? {} : { outputFormat: format }),
          };
        }
      } catch {
        // 标准数据生成失败时回退到原始渲染请求，避免阻断纯模板渲染链路。
      }

      // 正式运行时统一收口到 render-resolved，显式区分平台 published skill 与 Carbone skill。
      const response = await axios.post<DocumentRenderResponse>(
        `${getCarboneServiceUrl()}/studio/render-resolved`,
        renderRequest
      );

      const renderResult = response.data;
      const resolvedTemplateId = renderRequest.templateId || templateId;

      // Carbone API返回格式: {downloadUrl, fileName, format}
      if (renderResult && renderResult.downloadUrl) {
        // 外部可访问的下载链接
        const externalDownloadUrl = `${getCarboneExternalUrl()}${renderResult.downloadUrl}`;
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
            selectedTemplateId: resolvedTemplateId,
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
          selectedTemplateId: resolvedTemplateId,
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
