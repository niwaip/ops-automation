/**
 * Document Intake Tool
 * 入口阶段由 AI 主导：模板选择 + 参数初稿生成
 */

import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext, AvailableSkillDefinition } from '../interfaces';

const CARBONE_SERVICE_URL = process.env.CARBONE_SERVICE_URL || 'http://carbone-engine:3009';
const REPORT_SERVICE_URL = process.env.REPORT_SERVICE_URL || 'http://ops-report:3008';

interface GenerateParamsResponse {
  success?: boolean;
  generatedData?: Record<string, unknown>;
}

interface TemplateCandidate {
  skill: AvailableSkillDefinition;
  templateName?: string;
  score: number;
  reasons: string[];
}

interface ReportTemplateRegistryItem {
  id: string;
  name: string;
  format?: string;
  ai_config?: Record<string, unknown>;
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
    const requestedTemplateId =
      (params.templateId as string)
      || context.documentContext?.selectedTemplateId;
    const requestedSkillId =
      (params.skillId as string)
      || context.documentContext?.selectedSkillId;

    if (!userInput.trim()) {
      return {
        success: false,
        output: '缺少用户需求描述，无法进行模板识别与参数初稿生成。',
        code: 'missing_user_input',
        severity: 'warning',
        data: { error: 'missing_user_input' },
        requiresUserInput: true,
        userInputPrompt: '请先描述你要生成的文档内容（例如：生成保密合同，甲方xxx，乙方yyy）。',
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
        },
      };
    }

    const availableSkills = context.capabilitySnapshot
      ? context.capabilitySnapshot.visibleSkills
          .filter((skill) => skill.executionType === 'document')
          .map<AvailableSkillDefinition>((skill) => ({
            skillId: skill.skillId,
            skillName: skill.skillName,
            description: skill.description,
            triggerKeywords: skill.triggerKeywords,
            paramsSchema: skill.paramsSchema,
            templateId: skill.templateId,
            carboneSkillId: skill.carboneSkillId,
            carboneTemplateId: skill.carboneTemplateId,
            executionFlowTemplateIds: skill.executionFlowTemplateIds,
            executionFlow: skill.executionFlow,
            goal: skill.runtimeHints?.goal,
            expectedResult: skill.runtimeHints?.expectedResult,
            outputParams: skill.runtimeHints?.outputParams,
          }))
      : (context.availableSkills || []);
    const templateRegistry = await this.fetchTemplateRegistry();

    if (
      requestedTemplateId
      && context.capabilitySnapshot
      && !availableSkills.some((skill) => skill.carboneTemplateId === requestedTemplateId)
    ) {
      return {
        success: false,
        output: `当前权限下不可使用模板 ${requestedTemplateId}。`,
        code: 'template_not_visible_in_capability_snapshot',
        severity: 'error',
        data: { error: 'template_not_visible_in_capability_snapshot', templateId: requestedTemplateId },
        meta: {
          toolName: this.name,
          capabilityChecked: true,
          selectedTemplateId: requestedTemplateId,
        },
      };
    }

    const candidates = this.rankDocumentSkills(
      availableSkills,
      templateRegistry,
      userInput,
      requestedTemplateId,
      requestedSkillId,
      context.skill?.skillId,
    );
    const selectedSkill = candidates[0]?.skill || null;

    if (!selectedSkill) {
      const matchedTemplate = templateRegistry.find((item) => item.id === requestedTemplateId);
      if (requestedTemplateId && matchedTemplate) {
        return {
          success: false,
          output: `模板「${matchedTemplate.name}」已选择，但当前未找到绑定该模板的可执行技能。`,
          code: 'template_without_bound_skill',
          severity: 'warning',
          data: {
            error: 'template_without_bound_skill',
            templateId: matchedTemplate.id,
            templateName: matchedTemplate.name,
          },
          requiresUserInput: true,
          userInputPrompt: '请改选其他模板，或先在技能配置中绑定该模板后再试。',
          meta: {
            toolName: this.name,
            capabilityChecked: Boolean(context.capabilitySnapshot),
            selectedTemplateId: matchedTemplate.id,
          },
        };
      }
      return {
        success: false,
        output: '当前未找到可用于文档生成的技能（需要配置 carboneSkillId/carboneTemplateId）。',
        code: 'document_skill_not_found',
        severity: 'error',
        data: { error: 'document_skill_not_found' },
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
        },
      };
    }

    const shouldClarify = this.shouldClarifySelection(candidates, requestedTemplateId, requestedSkillId);
    if (shouldClarify) {
      const topCandidates = candidates.slice(0, 3).map((item, index) => {
        const templateId = item.skill.carboneTemplateId || '-';
        const templateNameSuffix = item.templateName ? ` / ${item.templateName}` : '';
        return `${index + 1}. ${item.skill.skillName}${templateNameSuffix}（templateId: ${templateId}, score: ${item.score.toFixed(2)}）`;
      });
      context.documentContext = {
        ...(context.documentContext || {}),
        pendingTemplateClarification: true,
        candidateRanking: candidates.slice(0, 3).map((item) => ({
          skillId: item.skill.skillId,
          skillName: item.skill.skillName,
          templateId: item.skill.carboneTemplateId,
          templateName: item.templateName,
          score: item.score,
        })),
      };
      return {
        success: false,
        output: '检测到多个文档模板候选，需先确认模板后再生成参数。',
        code: 'template_ambiguous',
        severity: 'warning',
        data: {
          error: 'template_ambiguous',
          candidates: candidates.slice(0, 3).map((item) => ({
            skillId: item.skill.skillId,
            skillName: item.skill.skillName,
            templateId: item.skill.carboneTemplateId,
            templateName: item.templateName,
            score: item.score,
            reasons: item.reasons,
          })),
        },
        requiresUserInput: true,
        userInputPrompt:
          `我识别到多个可能模板，请选择其一并回复 templateId 或 skillId：\n${topCandidates.join('\n')}`,
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
        },
      };
    }

    if (!selectedSkill.carboneSkillId || !selectedSkill.carboneTemplateId) {
      return {
        success: false,
        output: `技能 ${selectedSkill.skillName} 缺少文档引擎配置（carboneSkillId/carboneTemplateId）。`,
        code: 'missing_carbone_binding',
        severity: 'error',
        data: {
          error: 'missing_carbone_binding',
          skillId: selectedSkill.skillId,
        },
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedSkillId: selectedSkill.skillId,
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
      context.documentContext = {
        ...(context.documentContext || {}),
        pendingTemplateClarification: false,
        selectedTemplateId: selectedSkill.carboneTemplateId,
        selectedTemplateName: candidates[0]?.templateName || selectedSkill.skillName,
        selectedSkillId: selectedSkill.skillId,
        selectionSource: requestedTemplateId || requestedSkillId ? 'explicit' : context.skill?.skillId ? 'context' : 'ranking',
        candidateRanking: candidates.slice(0, 3).map((item) => ({
          skillId: item.skill.skillId,
          skillName: item.skill.skillName,
          templateId: item.skill.carboneTemplateId,
          templateName: item.templateName,
          score: item.score,
        })),
      };

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
        code: 'document_intake_completed',
        severity: 'info',
        data: {
          selectedSkillId: selectedSkill.skillId,
          selectedSkillName: selectedSkill.skillName,
          carboneSkillId: selectedSkill.carboneSkillId,
          templateId: selectedSkill.carboneTemplateId,
          templateName: candidates[0]?.templateName || selectedSkill.skillName,
          paramsDraft: generatedParams,
          candidateRanking: candidates.slice(0, 3).map((item) => ({
            skillId: item.skill.skillId,
            skillName: item.skill.skillName,
            templateId: item.skill.carboneTemplateId,
            templateName: item.templateName,
            score: item.score,
          })),
        },
        // 固定流：入口完成后进入渲染
        nextAction: 'document_render',
        nextActionParams: {
          templateId: selectedSkill.carboneTemplateId,
          data: generatedParams,
        },
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedSkillId: selectedSkill.skillId,
          selectedTemplateId: selectedSkill.carboneTemplateId,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return {
        success: false,
        output: `文档入口阶段失败：参数初稿生成失败（${message}）。`,
        code: 'document_intake_failed',
        severity: 'error',
        data: {
          error: 'document_intake_failed',
          message,
          selectedSkillId: selectedSkill.skillId,
        },
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedSkillId: selectedSkill.skillId,
          selectedTemplateId: selectedSkill.carboneTemplateId,
        },
      };
    }
  }

  private rankDocumentSkills(
    availableSkills: AvailableSkillDefinition[],
    templateRegistry: ReportTemplateRegistryItem[],
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
        return [{
          skill: matchedByTemplate,
          templateName: templateRegistry.find((item) => item.id === requestedTemplateId)?.name,
          score: 10,
          reasons: ['templateId 显式指定'],
        }];
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
      const templateName = templateRegistry.find((item) => item.id === skill.carboneTemplateId)?.name;
      const nameHit = this.normalizeText(skill.skillName || '');
      if (nameHit && normalizedInput.includes(nameHit)) {
        score += 5;
        reasons.push('命中技能名称');
      }
      const normalizedTemplateName = this.normalizeText(templateName || '');
      if (normalizedTemplateName && normalizedInput.includes(normalizedTemplateName)) {
        score += 4;
        reasons.push('命中文档模板名');
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

      return { skill, templateName, score, reasons };
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

  private async fetchTemplateRegistry(): Promise<ReportTemplateRegistryItem[]> {
    try {
      const response = await axios.get<{ templates: ReportTemplateRegistryItem[] }>(
        `${REPORT_SERVICE_URL}/report-templates`,
        { timeout: 2500 },
      );
      return Array.isArray(response.data?.templates) ? response.data.templates : [];
    } catch {
      return [];
    }
  }
}
