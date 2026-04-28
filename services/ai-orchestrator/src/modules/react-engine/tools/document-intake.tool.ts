/**
 * Document Intake Tool
 * 入口阶段由 AI 主导：模板选择 + 参数初稿生成
 */

import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext, AvailableSkillDefinition } from '../interfaces';

const CARBONE_SERVICE_URL = process.env.CARBONE_SERVICE_URL || 'http://carbone-engine:3009';

interface GenerateParamsResponse {
  success?: boolean;
  generatedData?: Record<string, unknown>;
}

export class DocumentIntakeTool extends BaseTool {
  constructor() {
    super(
      'document_intake',
      '文档入口工具：先选择文档模板，再根据用户描述生成参数初稿。适用于“文档生成”类任务的前置阶段。',
      {
        type: 'object',
        properties: {
          userInput: {
            type: 'string',
            description: '用户原始需求描述',
            required: false,
          },
          skillId: {
            type: 'string',
            description: '可选，指定要使用的平台 skillId',
            required: false,
          },
        },
        required: [],
      },
      { category: 'parameter' },
    );
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    const userInput = (params.userInput as string) || context.originalUserInput || '';
    const requestedSkillId = params.skillId as string | undefined;

    if (!userInput.trim()) {
      return {
        success: false,
        output: '缺少用户需求描述，无法进行模板识别与参数初稿生成。',
        data: { error: 'missing_user_input' },
        requiresUserInput: true,
        userInputPrompt: '请先描述你要生成的文档内容（例如：生成保密合同，甲方xxx，乙方yyy）。',
      };
    }

    const availableSkills = context.availableSkills || [];
    const selectedSkill = this.selectDocumentSkill(availableSkills, requestedSkillId, context.skill?.skillId);

    if (!selectedSkill) {
      return {
        success: false,
        output: '当前未找到可用于文档生成的技能（需要配置 carboneSkillId/carboneTemplateId）。',
        data: { error: 'document_skill_not_found' },
      };
    }

    if (!selectedSkill.carboneSkillId || !selectedSkill.carboneTemplateId) {
      return {
        success: false,
        output: `技能 ${selectedSkill.skillName} 缺少文档引擎配置（carboneSkillId/carboneTemplateId）。`,
        data: {
          error: 'missing_carbone_binding',
          skillId: selectedSkill.skillId,
        },
      };
    }

    try {
      const response = await axios.post<GenerateParamsResponse>(
        `${CARBONE_SERVICE_URL}/studio/generate-parameters`,
        {
          // Carbone 引擎侧 skillId 为 carboneSkillId（不是平台 skillId）
          skillId: selectedSkill.carboneSkillId,
          description: userInput,
        },
      );

      const generatedParams = response.data?.generatedData || {};
      context.collectedParams = generatedParams;

      // 将匹配技能绑定到上下文，后续 document_render 可直接消费 templateId
      context.skill = {
        ...(context.skill || {
          skillId: selectedSkill.skillId,
          skillName: selectedSkill.skillName,
          matchedKeywords: selectedSkill.triggerKeywords,
          confidence: 1,
          missingParams: selectedSkill.paramsSchema.required || [],
          paramsSchema: selectedSkill.paramsSchema,
          collectedParams: {},
        }),
        skillId: selectedSkill.skillId,
        skillName: selectedSkill.skillName,
        carboneSkillId: selectedSkill.carboneSkillId,
        carboneTemplateId: selectedSkill.carboneTemplateId,
        executionFlowTemplateIds: selectedSkill.executionFlowTemplateIds,
        apiEndpoints: selectedSkill.apiEndpoints,
        collectedParams: generatedParams,
      };

      return {
        success: true,
        output: `文档入口处理完成：已选择技能「${selectedSkill.skillName}」并生成参数初稿。`,
        data: {
          selectedSkillId: selectedSkill.skillId,
          selectedSkillName: selectedSkill.skillName,
          carboneSkillId: selectedSkill.carboneSkillId,
          templateId: selectedSkill.carboneTemplateId,
          paramsDraft: generatedParams,
        },
        // 固定流：入口完成后进入渲染
        nextAction: 'document_render',
        nextActionParams: {
          templateId: selectedSkill.carboneTemplateId,
          data: generatedParams,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return {
        success: false,
        output: `文档入口阶段失败：参数初稿生成失败（${message}）。`,
        data: {
          error: 'document_intake_failed',
          message,
          selectedSkillId: selectedSkill.skillId,
        },
      };
    }
  }

  private selectDocumentSkill(
    availableSkills: AvailableSkillDefinition[],
    requestedSkillId?: string,
    contextSkillId?: string,
  ): AvailableSkillDefinition | null {
    const documentSkills = availableSkills.filter(
      (item) => Boolean(item.carboneSkillId) && Boolean(item.carboneTemplateId),
    );
    if (documentSkills.length === 0) {
      return null;
    }

    if (requestedSkillId) {
      return documentSkills.find((item) => item.skillId === requestedSkillId) || null;
    }
    if (contextSkillId) {
      return documentSkills.find((item) => item.skillId === contextSkillId) || null;
    }

    return documentSkills[0] || null;
  }
}
