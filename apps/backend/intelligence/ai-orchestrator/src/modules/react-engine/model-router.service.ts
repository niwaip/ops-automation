import { Injectable } from '@nestjs/common';
import { ModelService } from '../model/model.service';
import { decideModelFallbackStrategy, ModelFallbackStrategy } from './error-recovery-policy';
import { AvailableSkillDefinition, ToolResult } from './interfaces';
import { AIModelDTO } from '../../interfaces';

export interface ModelRoutingDecision {
  modelId: string;
  attemptedModelIds: string[];
  reason: string;
  strategy?: ModelFallbackStrategy;
}

type TaskRoutingProfile = 'chat' | 'document' | 'flow' | 'query' | 'code' | 'general_task';

export interface InitialModelRoutingContext {
  mode?: 'chat' | 'task';
  userInput?: string;
  userRoles?: string[];
  availableSkills?: AvailableSkillDefinition[];
}

@Injectable()
export class ModelRouterService {
  constructor(private readonly modelService: ModelService) {}

  resolveInitialModel(
    requestedModelId: string,
    existingActiveModelId?: string,
    attemptedModelIds?: string[],
    context?: InitialModelRoutingContext
  ): ModelRoutingDecision {
    if (existingActiveModelId) {
      return {
        modelId: existingActiveModelId,
        attemptedModelIds: attemptedModelIds || [existingActiveModelId],
        reason: 'resume_active_model',
      };
    }

    const fallbackChain = this.modelService.getFallbackModelIds(requestedModelId);
    const preferredModelId =
      requestedModelId === 'default' ? this.selectTaskAwareInitialModel(context) : undefined;
    const modelId = preferredModelId || fallbackChain[0] || requestedModelId;
    return {
      modelId,
      attemptedModelIds: [modelId],
      reason: preferredModelId
        ? `task_type_${this.detectTaskRoutingProfile(context)}`
        : requestedModelId === modelId
          ? 'requested_model'
          : 'resolved_default_model',
    };
  }

  resolveFallbackModel(
    currentModelId: string,
    attemptedModelIds: string[],
    result?: ToolResult
  ): ModelRoutingDecision | null {
    const strategy = decideModelFallbackStrategy(result);
    const fallbackChain = this.modelService.getFallbackModelIds(currentModelId, strategy);
    const nextModelId = fallbackChain.find((modelId) => !attemptedModelIds.includes(modelId));
    if (!nextModelId) {
      return null;
    }

    return {
      modelId: nextModelId,
      attemptedModelIds: [...attemptedModelIds, nextModelId],
      reason: strategy.reason,
      strategy,
    };
  }

  private selectTaskAwareInitialModel(context?: InitialModelRoutingContext): string | undefined {
    const routingProfile = this.detectTaskRoutingProfile(context);
    const models = this.modelService.listActiveModelsForRouting?.() || [];
    if (models.length === 0) {
      return undefined;
    }

    const scopedDefault = this.modelService.getPreferredDefaultModel?.({
      mode: context?.mode,
      userRoles: context?.userRoles,
    });
    if (routingProfile !== 'code' && scopedDefault) {
      return scopedDefault.id;
    }

    let bestModelId: string | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const model of models) {
      const score = this.scoreModelForProfile(model, routingProfile);
      if (score > bestScore) {
        bestScore = score;
        bestModelId = model.id;
      }
    }

    return bestScore > 0 ? bestModelId : undefined;
  }

  private detectTaskRoutingProfile(context?: InitialModelRoutingContext): TaskRoutingProfile {
    if (context?.mode === 'chat') {
      return 'chat';
    }

    const matchedExecutionType = this.matchExecutionTypeFromSkills(
      context?.userInput,
      context?.availableSkills || []
    );
    if (
      matchedExecutionType === 'document' ||
      matchedExecutionType === 'flow' ||
      matchedExecutionType === 'query'
    ) {
      return matchedExecutionType;
    }
    if (matchedExecutionType === 'artifact') {
      return 'document';
    }

    const normalizedInput = (context?.userInput || '').toLowerCase();
    if (
      /(代码|coding|coder|debug|调试|测试|test|开发|实现|修复|bug|接口|api|脚本|script)/.test(
        normalizedInput
      )
    ) {
      return 'code';
    }
    if (/(文档|合同|报告|模板|生成pdf|生成 doc|carbone|报表|渲染)/.test(normalizedInput)) {
      return 'document';
    }
    if (/(流程|审批|执行流|run flow|工作流|自动化|编排)/.test(normalizedInput)) {
      return 'flow';
    }
    if (/(查询|检索|统计|汇总|问答|搜索)/.test(normalizedInput)) {
      return 'query';
    }

    return 'general_task';
  }

  private matchExecutionTypeFromSkills(
    userInput: string | undefined,
    skills: AvailableSkillDefinition[]
  ): AvailableSkillDefinition['executionType'] {
    if (!userInput) {
      return skills.length === 1 ? skills[0]?.executionType : undefined;
    }

    const normalizedInput = userInput.toLowerCase();
    const matchedSkill = skills.find((skill) => {
      return skill.triggerKeywords.some((keyword) =>
        normalizedInput.includes(keyword.toLowerCase())
      );
    });

    return matchedSkill?.executionType;
  }

  private scoreModelForProfile(model: AIModelDTO, profile: TaskRoutingProfile): number {
    const tags = this.getModelRoutingTags(model);
    const score =
      (tags.has('default') ? 3 : 0) +
      (tags.has('global_default') ? 3 : 0) +
      (tags.has('admin_chat_default') ? (profile === 'chat' ? 8 : 1) : 0) +
      (tags.has('admin_task_default') ? (profile !== 'chat' ? 8 : 1) : 0) +
      (tags.has('general_task') ? 2 : 0) +
      (tags.has(profile) ? 6 : 0) +
      (tags.has('advanced') ? (profile === 'code' || profile === 'flow' ? 7 : 2) : 0) +
      (tags.has('code_preferred') && profile === 'code' ? 8 : 0) +
      (profile === 'document' && tags.has('multimodal') ? 3 : 0) +
      ((profile === 'flow' || profile === 'code') && tags.has('code') ? 4 : 0) +
      ((profile === 'chat' || profile === 'query') && tags.has('chat') ? 3 : 0) +
      ((profile === 'chat' || profile === 'query') && tags.has('fast') ? 2 : 0) -
      (profile === 'document' && tags.has('code') ? 1 : 0);

    return score;
  }

  private getModelRoutingTags(model: AIModelDTO): Set<string> {
    const tags = new Set<string>();
    const configuredTags = Array.isArray(model.config?.routing_tags)
      ? model.config.routing_tags
      : [];
    configuredTags.forEach((tag) => {
      if (typeof tag === 'string' && tag.trim()) {
        tags.add(tag.trim().toLowerCase());
      }
    });

    const inputModes = Array.isArray(model.config?.input) ? model.config.input : [];
    if (inputModes.some((item) => typeof item === 'string' && item.toLowerCase() === 'image')) {
      tags.add('multimodal');
      tags.add('document');
    }
    if (model.config?.default === true) {
      tags.add('default');
      tags.add('general_task');
    }
    if (model.config?.default_scope?.global === true) {
      tags.add('global_default');
      tags.add('default');
      tags.add('general_task');
    }
    if (model.config?.default_scope?.admin_chat === true) {
      tags.add('admin_chat_default');
    }
    if (model.config?.default_scope?.admin_task === true) {
      tags.add('admin_task_default');
    }
    if (model.config?.capability_tier === 'advanced') {
      tags.add('advanced');
    }
    if (model.config?.routing_preferences?.prefer_for_code === true) {
      tags.add('code_preferred');
      tags.add('code');
      tags.add('flow');
    }

    const descriptor = [
      model.name,
      typeof model.config?.display_name === 'string' ? model.config.display_name : '',
      typeof model.config?.description === 'string' ? model.config.description : '',
    ]
      .join(' ')
      .toLowerCase();

    if (/(coder|编程|coding|代码)/.test(descriptor)) {
      tags.add('code');
      tags.add('flow');
    }
    if (/(chat|对话|text)/.test(descriptor)) {
      tags.add('chat');
    }
    if (/(turbo|快速)/.test(descriptor)) {
      tags.add('fast');
      tags.add('query');
    }
    if (/(通用|general|默认|default|高性能)/.test(descriptor)) {
      tags.add('general_task');
    }
    if (/(多模态|图像|vision)/.test(descriptor)) {
      tags.add('multimodal');
      tags.add('document');
    }

    return tags;
  }
}
