import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  LLMUsage,
  PlanDraftDTO,
  PlanSemanticDTO,
  PlanSkillMatchDTO,
  PlanStepDTO,
  RequiredInputDTO,
} from '../../../interfaces';
import { SkillMatchResult } from '../../react-engine/interfaces';

@Injectable()
export class PlanGeneratorService {
  buildSkillPlan(input: {
    objective: string;
    matchedSkill: SkillMatchResult;
    requiredInputs: RequiredInputDTO[];
    semantic?: PlanSemanticDTO;
    usage?: LLMUsage;
    semanticDebug?: Record<string, unknown>;
    llmCalls?: unknown[];
    notes?: string[];
  }): PlanDraftDTO {
    const { objective, matchedSkill, requiredInputs, semantic, usage } = input;
    const executionSnapshot = this.buildExecutionSnapshot(requiredInputs, semantic);
    const steps = this.buildPlanSteps(matchedSkill, requiredInputs);
    const missingInputs = requiredInputs.filter((item) => item.missing);
    const requiresHumanReview = false;
    const baseSummary =
      missingInputs.length > 0
        ? `已识别技能 ${matchedSkill.skillName}，但仍缺少 ${missingInputs.length} 个关键输入。`
        : `已识别技能 ${matchedSkill.skillName}，可以按计划进入执行。`;
    const summary = semantic?.summary ? `${baseSummary} ${semantic.summary}` : baseSummary;

    return {
      plan_id: uuidv4(),
      planner_mode: 'skill',
      objective,
      summary,
      skill_match: this.toPlanSkillMatch(matchedSkill),
      steps,
      required_inputs: requiredInputs,
      semantic,
      usage,
      risk_summary: {
        level: missingInputs.length > 0 ? 'medium' : 'low',
        requires_human_review: requiresHumanReview,
        items: this.buildRiskItems(matchedSkill, missingInputs.length),
      },
      metadata: {
        confidence: matchedSkill.confidence,
        expected_result: matchedSkill.expectedResult,
        goal: matchedSkill.goal,
        debug: {
          llmCalls: input.llmCalls || [],
          notes: input.notes || [],
          semanticDebug: input.semanticDebug,
        },
        execution_snapshot: executionSnapshot,
      },
    };
  }

  buildFallbackPlan(objective: string, hasVisibleSkills: boolean): PlanDraftDTO {
    return {
      plan_id: uuidv4(),
      planner_mode: 'fallback',
      objective,
      summary: hasVisibleSkills
        ? '暂未匹配到明确技能，建议先补充任务目标或关键业务对象。'
        : '当前无法读取可用技能列表，建议先确认登录态或服务连通性。',
      steps: [
        {
          id: 'clarify-goal',
          title: 'Clarify request',
          description: '补充更明确的业务目标、对象和期望产出。',
          kind: 'human_input',
          status: 'planned',
        },
      ],
      required_inputs: [
        {
          name: 'user_input',
          type: 'string',
          description: '更明确的任务描述',
          required: true,
          missing: false,
          source: 'user_input',
          value: objective,
        },
      ],
      risk_summary: {
        level: 'medium',
        requires_human_review: true,
        items: [
          hasVisibleSkills ? 'no_skill_match' : 'skills_unavailable',
          'planner_needs_clarification',
        ],
      },
      metadata: {
        has_visible_skills: hasVisibleSkills,
        debug: {
          notes: ['当前为 fallback 规划结果，没有额外的上游 LLM request/response 可展示。'],
        },
      },
    };
  }

  buildExecutionSnapshot(
    requiredInputs: RequiredInputDTO[],
    semantic?: PlanSemanticDTO
  ): Record<string, unknown> {
    const input = requiredInputs.reduce<Record<string, unknown>>((acc, item) => {
      if (!this.isExecutionInputSafe(item)) {
        return acc;
      }
      acc[item.name] = item.value;
      return acc;
    }, {});

    const paramResolution = requiredInputs.reduce<Record<string, unknown>>((acc, item) => {
      acc[item.name] = {
        type: item.type,
        value: item.value ?? null,
        source: item.source,
        required: item.required,
        requiredMode: item.required_mode || (item.required ? 'always' : 'optional'),
        ...(Array.isArray(item.source_priority)
          ? { valueSourcePriority: item.source_priority }
          : {}),
        missing: item.missing,
        needsConfirmation: item.needs_confirmation === true,
        confirmed: !item.missing && item.needs_confirmation !== true,
        final: !item.missing && item.needs_confirmation !== true,
        ...(typeof item.confidence === 'number' ? { confidence: item.confidence } : {}),
        ...(typeof item.confirmation_threshold === 'number'
          ? { confirmation_threshold: item.confirmation_threshold }
          : {}),
        ...(item.missing_reason ? { missing_reason: item.missing_reason } : {}),
        ...(item.display_name ? { display_name: item.display_name } : {}),
        ...(item.group_label ? { group_label: item.group_label } : {}),
        ...(item.render_path ? { render_path: item.render_path } : {}),
        ...(item.template_binding ? { template_binding: item.template_binding } : {}),
        ...(typeof item.preview_blocking === 'boolean'
          ? { preview_blocking: item.preview_blocking }
          : {}),
      };
      return acc;
    }, {});

    return {
      normalizedInputJson: {
        input,
        paramResolution,
        requiredInputs,
        ...(semantic ? { semantic } : {}),
      },
    };
  }

  isExecutionInputSafe(item: RequiredInputDTO): boolean {
    return !item.missing && item.needs_confirmation !== true && this.hasMeaningfulValue(item.value);
  }

  buildPlanSteps(matchedSkill: SkillMatchResult, requiredInputs: RequiredInputDTO[]): PlanStepDTO[] {
    const steps: PlanStepDTO[] = [];
    const missingRequiredInputs = requiredInputs.filter((item) => item.missing);

    if (missingRequiredInputs.length > 0) {
      steps.push({
        id: 'collect-required-inputs',
        title: 'Collect required inputs',
        description: `补齐必填参数: ${missingRequiredInputs.map((item) => item.name).join(', ')}`,
        kind: 'human_input',
        status: 'planned',
      });
    }

    const executionFlow = matchedSkill.executionFlow?.length
      ? matchedSkill.executionFlow
      : matchedSkill.apiEndpoints?.runtimeMetadata?.sourceType === 'document'
        ? ['document_render']
        : [];

    if (executionFlow.length === 0) {
      steps.push({
        id: 'execute-skill',
        title: 'Execute skill',
        description: `调用技能 ${matchedSkill.skillName} 进入执行。`,
        kind: 'skill',
        status: 'planned',
      });
      return steps;
    }

    executionFlow.forEach((toolName, index) => {
      steps.push({
        id: `step-${index + 1}`,
        title: this.toStepTitle(toolName),
        description: `执行 ${toolName} 步骤。`,
        kind: 'tool',
        tool_name: toolName,
        status: 'planned',
      });
    });

    return steps;
  }

  buildRiskItems(matchedSkill: SkillMatchResult, missingInputCount: number): string[] {
    const items: string[] = [];

    if (missingInputCount > 0) {
      items.push('missing_required_inputs');
    }

    if (matchedSkill.executionFlow?.some((step) => step.includes('browser'))) {
      items.push('browser_runtime_may_require_takeover');
    }

    if (items.length === 0) {
      items.push('no_material_risk_detected');
    }

    return items;
  }

  toPlanSkillMatch(matchedSkill: SkillMatchResult): PlanSkillMatchDTO {
    return {
      skill_id: matchedSkill.skillId,
      ...(matchedSkill.skillVersion ? { skill_version: matchedSkill.skillVersion } : {}),
      skill_name: matchedSkill.skillName,
      confidence: matchedSkill.confidence,
      match_reason: matchedSkill.matchReason,
    };
  }

  toStepTitle(toolName: string): string {
    return toolName
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private hasMeaningfulValue(value: unknown): boolean {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.some((item) => this.hasMeaningfulValue(item));
    }
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some((item) =>
        this.hasMeaningfulValue(item)
      );
    }
    return true;
  }
}
