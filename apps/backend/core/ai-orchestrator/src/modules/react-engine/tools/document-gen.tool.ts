/**
 * Document Generate Tool
 * 调用Carbone引擎生成文档
 */

import { Inject, Injectable, Optional } from '@nestjs/common';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';
import axios from 'axios';
import { Tool } from '../decorators/tool.decorator';
import { getCarboneServiceUrl } from '../../../config/service-endpoints';

type DocumentGenerateResponse = {
  downloadUrl?: string;
  fileName?: string;
  format?: string;
};

const isSkillVisibleInSnapshot = (
  skillId: string | undefined,
  context: ExecutionContext,
): boolean => {
  if (!skillId || !context.capabilitySnapshot) {
    return true;
  }

  return context.capabilitySnapshot.visibleSkills.some((skill) => skill.skillId === skillId);
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

@Injectable()
@Tool({
  name: 'document_generate',
  description: '根据Skill和参数生成文档。调用Carbone引擎渲染模板并返回下载链接。',
  parameters: {
    type: 'object',
    properties: {
      skillId: {
        type: 'string',
        description: '技能ID',
        required: true,
      },
      templateId: {
        type: 'string',
        description: 'Carbone模板ID',
        required: true,
      },
      data: {
        type: 'object',
        description: '填充模板的数据对象',
        required: true,
      },
      format: {
        type: 'string',
        description: '输出格式：pdf, docx, xlsx',
        required: false,
      },
    },
    required: ['skillId', 'templateId', 'data'],
  },
  isDefault: true,
})
export class DocumentGenTool extends BaseTool {
  private carboneApiUrl: string;

  constructor(
    @Optional() @Inject('CARBONE_API_URL') carboneApiUrl?: string,
  ) {
    super(
      'document_generate',
      '根据Skill和参数生成文档。调用Carbone引擎渲染模板并返回下载链接。',
      {
        type: 'object',
        properties: {
          skillId: {
            type: 'string',
            description: '技能ID',
            required: true,
          },
          templateId: {
            type: 'string',
            description: 'Carbone模板ID',
            required: true,
          },
          data: {
            type: 'object',
            description: '填充模板的数据对象',
            required: true,
          },
          format: {
            type: 'string',
            description: '输出格式：pdf, docx, xlsx',
            required: false,
          },
        },
        required: ['skillId', 'templateId', 'data'],
      },
    );
    this.carboneApiUrl = carboneApiUrl || getCarboneServiceUrl();
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    const skillId = params.skillId as string;
    const renderParams = params.data as Record<string, unknown>;
    const outputFormat = (params.format as string) || 'docx';
    const templateId = (params.templateId as string)
      || context.documentContext?.selectedTemplateId
      || context.skill?.carboneTemplateId
      || context.skill?.templateId;

    if (!isSkillVisibleInSnapshot(skillId, context)) {
      return {
        success: false,
        output: `当前权限下不可使用 skillId=${skillId} 生成文档。`,
        code: 'skill_not_visible_in_capability_snapshot',
        severity: 'error',
        data: { error: 'skill_not_visible_in_capability_snapshot', skillId },
        meta: {
          toolName: this.name,
          capabilityChecked: true,
          selectedSkillId: skillId,
        },
      };
    }

    if (!templateId) {
      return {
        success: false,
        output: '未找到关联的模板，无法生成文档',
        code: 'template_not_found',
        severity: 'error',
        data: { error: 'template_not_found' },
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedSkillId: skillId,
        },
      };
    }

    if (!isTemplateVisibleInSnapshot(templateId, context)) {
      return {
        success: false,
        output: `当前权限下不可使用模板 ${templateId} 生成文档。`,
        code: 'template_not_visible_in_capability_snapshot',
        severity: 'error',
        data: { error: 'template_not_visible_in_capability_snapshot', templateId },
        meta: {
          toolName: this.name,
          capabilityChecked: true,
          selectedSkillId: skillId,
          selectedTemplateId: templateId,
        },
      };
    }

    try {
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
        const downloadUrl = response.data.downloadUrl;
        const fileName = response.data.fileName || 'document.docx';
        const finalAnswer = `文档已生成！您可以点击下方链接下载：\n\n[${fileName}](${downloadUrl})`;

        return {
          success: true,
          output: `文档已生成，下载链接: ${downloadUrl}`,
          code: 'document_generate_completed',
          severity: 'info',
          data: {
            downloadUrl,
            fileName,
            format: response.data.format,
            taskComplete: true,
            finalAnswer,
          },
          meta: {
            toolName: this.name,
            capabilityChecked: Boolean(context.capabilitySnapshot),
            selectedSkillId: skillId,
            selectedTemplateId: templateId,
          },
        };
      }

      return {
        success: false,
        output: '文档生成失败，API返回异常',
        code: 'render_failed',
        severity: 'error',
        data: { error: 'render_failed', response: response.data },
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedSkillId: skillId,
          selectedTemplateId: templateId,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        output: `文档生成异常: ${errorMsg}`,
        code: 'render_error',
        severity: 'error',
        data: { error: 'render_error', message: errorMsg },
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedSkillId: skillId,
          selectedTemplateId: templateId,
        },
      };
    }
  }
}
