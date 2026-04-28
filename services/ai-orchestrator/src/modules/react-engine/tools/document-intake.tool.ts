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

interface TemplateCandidate {
  skill: AvailableSkillDefinition;
  score: number;
  reasons: string[];
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
          templateId: {
            type: 'string',
            description: '可选，显式指定文档模板ID（通常等于 carboneTemplateId）',
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
    const requestedTemplateId = params.templateId as string | undefined;
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
    const candidates = this.rankDocumentSkills(
      availableSkills,
      userInput,
      requestedTemplateId,
      requestedSkillId,
      context.skill?.skillId,
    );
    const selectedSkill = candidates[0]?.skill || null;

    if (!selectedSkill) {
      return {
        success: false,
        output: '当前未找到可用于文档生成的技能（需要配置 carboneSkillId/carboneTemplateId）。',
        data: { error: 'document_skill_not_found' },
      };
    }

    const shouldClarify = this.shouldClarifySelection(candidates, requestedTemplateId, requestedSkillId);
    if (shouldClarify) {
      const topCandidates = candidates.slice(0, 3).map((item, index) => {
        const templateId = item.skill.carboneTemplateId || '-';
        return `${index + 1}. ${item.skill.skillName}（templateId: ${templateId}, score: ${item.score.toFixed(2)}）`;
      });
      return {
        success: false,
        output: '检测到多个文档模板候选，需先确认模板后再生成参数。',
        data: {
          error: 'template_ambiguous',
          candidates: candidates.slice(0, 3).map((item) => ({
            skillId: item.skill.skillId,
            skillName: item.skill.skillName,
            templateId: item.skill.carboneTemplateId,
            score: item.score,
            reasons: item.reasons,
          })),
        },
        requiresUserInput: true,
        userInputPrompt:
          `我识别到多个可能模板，请选择其一并回复 templateId 或 skillId：\n${topCandidates.join('\n')}`,
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
        output: `文档入口处理完成：已选择模板「${selectedSkill.skillName}」并生成参数初稿。`,
        data: {
          selectedSkillId: selectedSkill.skillId,
          selectedSkillName: selectedSkill.skillName,
          carboneSkillId: selectedSkill.carboneSkillId,
          templateId: selectedSkill.carboneTemplateId,
          paramsDraft: generatedParams,
          candidateRanking: candidates.slice(0, 3).map((item) => ({
            skillId: item.skill.skillId,
            skillName: item.skill.skillName,
            templateId: item.skill.carboneTemplateId,
            score: item.score,
          })),
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

  private rankDocumentSkills(
    availableSkills: AvailableSkillDefinition[],
    userInput: string,
    requestedTemplateId?: string,
    requestedSkillId?: string,
    contextSkillId?: string,
  ): TemplateCandidate[] {
    const documentSkills = availableSkills.filter(
      (item) => Boolean(item.carboneSkillId) && Boolean(item.carboneTemplateId),
    );
    if (documentSkills.length === 0) {
      return [];
    }

    const normalizedInput = this.normalizeText(userInput);

    // 显式指定时直接锁定
    if (requestedTemplateId) {
      const matchedByTemplate = documentSkills.find((item) => item.carboneTemplateId === requestedTemplateId);
      if (matchedByTemplate) {
        return [{ skill: matchedByTemplate, score: 10, reasons: ['templateId 显式指定'] }];
      }
    }
    if (requestedSkillId) {
      const matchedBySkill = documentSkills.find((item) => item.skillId === requestedSkillId);
      if (matchedBySkill) {
        return [{ skill: matchedBySkill, score: 10, reasons: ['skillId 显式指定'] }];
      }
    }
    if (contextSkillId) {
      const matchedByContext = documentSkills.find((item) => item.skillId === contextSkillId);
      if (matchedByContext) {
        return [{ skill: matchedByContext, score: 9, reasons: ['沿用上下文 skill'] }];
      }
    }

    const ranked = documentSkills.map<TemplateCandidate>((skill) => {
      let score = 0;
      const reasons: string[] = [];
      const nameHit = this.normalizeText(skill.skillName || '');
      if (nameHit && normalizedInput.includes(nameHit)) {
        score += 5;
        reasons.push('命中技能名称');
      }

      const keywordHits = (skill.triggerKeywords || []).filter((keyword) => {
        const normalizedKeyword = this.normalizeText(keyword || '');
        return normalizedKeyword && normalizedInput.includes(normalizedKeyword);
      });
      if (keywordHits.length > 0) {
        score += Math.min(4, keywordHits.length);
        reasons.push(`命中关键词(${keywordHits.length})`);
      }

      const desc = this.normalizeText(skill.description || '');
      if (desc && normalizedInput.includes(desc.slice(0, Math.min(8, desc.length)))) {
        score += 1;
        reasons.push('命中技能描述片段');
      }

      if (score === 0) {
        score = 0.1;
        reasons.push('默认候选');
      }

      return { skill, score, reasons };
    });

    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  }

  private shouldClarifySelection(
    ranked: TemplateCandidate[],
    requestedTemplateId?: string,
    requestedSkillId?: string,
  ): boolean {
    if (requestedTemplateId || requestedSkillId) {
      return false;
    }
    if (ranked.length <= 1) {
      return false;
    }
    const top = ranked[0];
    const second = ranked[1];
    if (!top || !second) {
      return false;
    }

    // 低分且差距小，触发澄清
    return top.score < 2 || top.score - second.score < 1;
  }

  private normalizeText(value: string): string {
    return (value || '').toLowerCase().replace(/\s+/g, '');
  }
}
