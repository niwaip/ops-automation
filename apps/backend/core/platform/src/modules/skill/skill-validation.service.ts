import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import { SkillConfigDto, SkillValidationResult } from './interfaces';

export type SkillValidationStreamEvent = {
  type: 'stage' | 'log' | 'result' | 'error';
  content: string;
  data?: Record<string, unknown>;
};

export type SkillValidationEmitter = (event: SkillValidationStreamEvent) => void;

@Injectable()
export class SkillValidationService {
  private readonly logger = new Logger(SkillValidationService.name);

  async validateSkill(
    skillId: string,
    loadSkill: (skillId: string) => Promise<SkillConfigDto | null>,
    emit?: SkillValidationEmitter
  ): Promise<SkillValidationResult> {
    const skill = await loadSkill(skillId);
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    emit?.({
      type: 'stage',
      content: '开始验证 Skill 配置',
      data: { stage: 'config', skillId, skillName: skill.name },
    });

    const result: SkillValidationResult = {
      isValid: true,
      score: 100,
      suggestions: [],
      warnings: [],
      validatedAt: new Date().toISOString(),
      validatedBy: 'ai-validator',
      details: {
        configAnalysis: {
          hasTriggerKeywords: false,
          hasParamsSchema: false,
          hasTemplate: false,
          hasFlowTemplate: false,
          triggerKeywordQuality: '',
          paramsSchemaCompleteness: '',
        },
      },
    };

    result.details!.configAnalysis.hasTriggerKeywords = skill.triggerKeywords.length > 0;
    result.details!.configAnalysis.hasParamsSchema =
      Object.keys(skill.paramsSchema.properties).length > 0;
    result.details!.configAnalysis.hasTemplate = !!skill.apiEndpoints?.runtimeMetadata?.sourceType;
    result.details!.configAnalysis.hasFlowTemplate = skill.executionFlowTemplateIds.length > 0;

    if (skill.triggerKeywords.length < 3) {
      result.warnings.push('触发关键词数量较少，建议添加更多关键词以提高匹配准确度');
      result.score -= 10;
      result.details!.configAnalysis.triggerKeywordQuality = 'poor';
    } else if (skill.triggerKeywords.length >= 5) {
      result.details!.configAnalysis.triggerKeywordQuality = 'good';
    } else {
      result.details!.configAnalysis.triggerKeywordQuality = 'acceptable';
    }

    const requiredParams = skill.paramsSchema.required || [];
    if (requiredParams.length === 0) {
      result.warnings.push('没有必填参数，可能导致执行流程无法正确收集参数');
      result.score -= 5;
      result.details!.configAnalysis.paramsSchemaCompleteness = 'incomplete';
    } else {
      const hasAllDescriptions = requiredParams.every(
        (param) => skill.paramsSchema.properties[param]?.description
      );
      if (!hasAllDescriptions) {
        result.warnings.push('部分必填参数缺少描述，建议添加描述以提高AI参数提取准确度');
        result.score -= 5;
        result.details!.configAnalysis.paramsSchemaCompleteness = 'partial';
      } else {
        result.details!.configAnalysis.paramsSchemaCompleteness = 'complete';
      }
    }

    emit?.({
      type: 'stage',
      content: '基础配置检查完成，开始真实模拟执行',
      data: {
        stage: 'execution',
        configAnalysis: result.details!.configAnalysis as unknown as Record<string, unknown>,
      },
    });

    try {
      const simulation = await this.simulateSkillWithReactAI(skill, emit);
      result.details!.skillSimulation = simulation;
      result.score = Math.min(result.score, simulation.validationScore);

      if (!simulation.success) {
        result.isValid = false;
      }

      if (simulation.issues.length > 0) {
        result.warnings.push(...simulation.issues);
      }

      if (simulation.suggestions.length > 0) {
        result.suggestions.push(...simulation.suggestions);
      }

      if (simulation.generatedSkill) {
        result.suggestions.push('已生成标准 Skill 预览，可直接作为外部 AI 的可调用定义参考');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.warnings.push(`Skill 整体验证失败: ${errorMsg}`);
      result.score -= 20;
    }

    result.score = Math.max(0, Math.min(100, result.score));
    if (result.score < 60) {
      result.isValid = false;
    }

    this.logger.log(`Validated skill ${skillId}: score=${result.score}, valid=${result.isValid}`);
    emit?.({
      type: 'result',
      content: 'Skill 验证完成',
      data: { validation: result as unknown as Record<string, unknown> },
    });
    return result;
  }

  async applyGeneratedSkillAdjustment(
    id: string,
    generatedSkill: Partial<SkillConfigDto> | undefined,
    loadSkill: (skillId: string) => Promise<SkillConfigDto | null>,
    saveAdjustment: (
      skillId: string,
      generatedSkill: Partial<SkillConfigDto>,
      current: SkillConfigDto
    ) => Promise<SkillConfigDto | null>
  ): Promise<SkillConfigDto | null> {
    const current = await loadSkill(id);
    if (!current) {
      throw new NotFoundException('Skill not found');
    }

    if (!generatedSkill) {
      throw new Error('No generated skill suggestion provided');
    }

    return saveAdjustment(id, generatedSkill, current);
  }

  private async simulateSkillWithReactAI(
    skill: SkillConfigDto,
    emit?: SkillValidationEmitter
  ): Promise<{
    success: boolean;
    validationScore: number;
    simulatedRequest: string;
    summary: string;
    issues: string[];
    suggestions: string[];
    log?: string[];
    iterations?: number;
    generatedSkill?: Partial<SkillConfigDto>;
  }> {
    const simulatedRequest = this.buildSampleRequest(skill);
    try {
      const executionTrace = await this.executeSkillValidationFlow(skill, simulatedRequest, emit);
      emit?.({
        type: 'stage',
        content: '真实模拟执行完成，开始 AI 审计',
        data: { stage: 'audit' },
      });
      const auditResult = await this.auditSkillWithAI(
        skill,
        simulatedRequest,
        executionTrace,
        emit
      );

      const issues = Array.isArray(auditResult?.issues) ? auditResult.issues.map(String) : [];
      const suggestions = Array.isArray(auditResult?.suggestions)
        ? auditResult.suggestions.map(String)
        : [];

      if (!executionTrace.usedReactFlowExecute) {
        issues.unshift('真实模拟执行阶段未实际调用 flow_execute');
      }

      return {
        success: Boolean(auditResult?.success) && executionTrace.usedReactFlowExecute,
        validationScore: Number(auditResult?.validationScore || 0),
        simulatedRequest,
        summary: String(auditResult?.summary || 'AI 未返回摘要'),
        issues,
        suggestions,
        log: executionTrace.log,
        iterations: executionTrace.iterations,
        generatedSkill: auditResult?.generatedSkill,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`AI Skill validation failed: ${errorMsg}`);
      return {
        success: false,
        validationScore: 0,
        simulatedRequest,
        summary: `AI 验证调用失败: ${errorMsg}`,
        issues: ['AI 服务连接失败或响应超时'],
        suggestions: ['请检查 ai-orchestrator 服务状态'],
        log: [`[Error] ${errorMsg}`],
      };
    }
  }

  private async executeSkillValidationFlow(
    skill: SkillConfigDto,
    simulatedRequest: string,
    emit?: SkillValidationEmitter
  ): Promise<{
    usedReactFlowExecute: boolean;
    result: string;
    log: string[];
    iterations: number;
  }> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const sampleParams = this.buildSampleParams(skill);
    const templateId = skill.executionFlowTemplateIds?.[0];

    if (!templateId) {
      emit?.({
        type: 'log',
        content: '[System] Skill 未关联流程模板，未执行 flow_execute',
        data: { phase: 'execution' },
      });
      return {
        usedReactFlowExecute: false,
        result: 'Skill 未关联流程模板，跳过真实执行阶段',
        log: ['[System] Skill 未关联流程模板，未执行 flow_execute'],
        iterations: 0,
      };
    }

    const executionPrompt = [
      '你是一个 Skill 执行验证代理，当前运行在 ReAct JSON 引擎中。',
      '本阶段只负责真实模拟执行，不做总结报告。',
      `技能名称：${skill.name}`,
      `模拟用户请求：${simulatedRequest}`,
      `测试参数：${JSON.stringify(sampleParams, null, 2)}`,
      '执行规则：',
      `1. 第一轮必须调用 flow_execute，actionInput 使用 {"templateId":"${templateId}","params":${JSON.stringify(sampleParams)}}。`,
      '2. 拿到执行结果后，下一轮直接 finish。',
      '3. finalAnswer 只保留执行结论和最终输出，不要生成额外 JSON。',
    ].join('\n\n');

    const response = await axios.post(
      `${aiOrchestratorUrl}/ai/chat/stream`,
      {
        message: executionPrompt,
        userId: 'skill-validator',
        sessionId: `skill-exec-${skill.id}-${randomUUID()}`,
        modelId: 'default',
        config: {
          mode: 'task',
          maxIterations: 8,
          tools: ['flow_execute'],
        },
      },
      { responseType: 'stream', timeout: 120000 }
    );

    const executionLog: string[] = [];
    let result = '';
    let iterations = 0;
    let usedReactFlowExecute = false;
    let executionError = '';

    for await (const chunk of response.data as AsyncIterable<any>) {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue;
        }

        try {
          const event = JSON.parse(line.slice(6));
          let logLine: string | null = null;

          if (event.type === 'thought') {
            logLine = `[Thought] ${event.content}`;
            iterations = event.iteration || iterations;
          } else if (event.type === 'action') {
            if (event.content === 'flow_execute') {
              usedReactFlowExecute = true;
            }
            logLine = `[Action] ${event.content} ${JSON.stringify(event.data?.actionInput || {})}`;
          } else if (event.type === 'observation') {
            logLine = `[Observation] ${event.content?.slice(0, 500)}...`;
          } else if (event.type === 'result') {
            result = event.content;
            logLine = `[Result] ${result}`;
          } else if (event.type === 'error') {
            executionError = event.content || '未知错误';
            logLine = `[Error] ${executionError}`;
          }

          if (logLine) {
            executionLog.push(logLine);
            emit?.({
              type: 'log',
              content: logLine,
              data: {
                phase: 'execution',
                iteration: event.iteration,
                eventType: event.type,
              },
            });
          }
        } catch {
          // Ignore partial or invalid json
        }
      }
    }

    if (executionError && !result) {
      throw new Error(executionError);
    }

    return {
      usedReactFlowExecute,
      result,
      log: executionLog,
      iterations,
    };
  }

  private async auditSkillWithAI(
    skill: SkillConfigDto,
    simulatedRequest: string,
    executionTrace: {
      usedReactFlowExecute: boolean;
      result: string;
      log: string[];
      iterations: number;
    },
    emit?: SkillValidationEmitter
  ): Promise<Record<string, any>> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    emit?.({
      type: 'log',
      content: '[Audit] 正在根据执行轨迹生成最终审计结论',
      data: { phase: 'audit' },
    });
    const auditPrompt = [
      '你是一个 Skill 审计代理，请根据 Skill 配置和真实执行轨迹给出最终审计结论。',
      '注意：这里的判断对象是一个单一的原子 Skill，而不是逐步骤挑错。',
      `技能名称：${skill.name}`,
      `技能描述：${skill.description || ''}`,
      `触发关键词：${JSON.stringify(skill.triggerKeywords)}`,
      `参数定义：${JSON.stringify(skill.paramsSchema, null, 2)}`,
      `关联流程模板：${JSON.stringify(skill.executionFlowTemplateIds || [])}`,
      `模拟用户请求：${simulatedRequest}`,
      `是否调用 flow_execute：${executionTrace.usedReactFlowExecute}`,
      `执行迭代次数：${executionTrace.iterations}`,
      `执行日志：${JSON.stringify(executionTrace.log, null, 2)}`,
      `执行结果：${executionTrace.result}`,
      '请严格输出 JSON，不要输出其他文字：',
      JSON.stringify(
        {
          success: true,
          validationScore: 90,
          summary: '一句话总结该 Skill 是否可用',
          issues: ['问题1'],
          suggestions: ['建议1'],
          generatedSkill: {
            name: skill.name,
            description: skill.description,
            triggerKeywords: skill.triggerKeywords,
            paramsSchema: skill.paramsSchema,
            executionFlowTemplateIds: skill.executionFlowTemplateIds,
            executionFlow: skill.executionFlow,
          },
        },
        null,
        2
      ),
    ].join('\n\n');

    const aiResponse = await axios.post(
      `${aiOrchestratorUrl}/ai/chat/stream`,
      {
        message: auditPrompt,
        sessionId: `skill-audit-${skill.id}-${randomUUID()}`,
        modelId: 'default',
        config: { mode: 'chat', maxIterations: 5 },
      },
      { responseType: 'stream', timeout: 120000 }
    );

    let fullContent = '';
    let aiErrorReceived = '';
    for await (const chunk of aiResponse.data as AsyncIterable<any>) {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue;
        }
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'result') {
            fullContent = data.content;
          } else if (data.type === 'observation') {
            emit?.({
              type: 'log',
              content: `[Audit] ${String(data.content || '').slice(0, 200)}...`,
              data: { phase: 'audit', eventType: 'observation' },
            });
          } else if (data.type === 'error') {
            aiErrorReceived = data.content || '未知错误';
          }
        } catch {
          // Ignore partial or invalid json
        }
      }
    }

    if (!fullContent || !fullContent.trim()) {
      throw new Error(aiErrorReceived || '未收到有效 AI 审计响应');
    }

    const parsed = this.extractJsonObject(fullContent);
    if (!parsed) {
      throw new Error(`AI 返回内容不是有效 JSON: ${fullContent.slice(0, 300)}`);
    }

    return parsed;
  }

  private buildSampleRequest(skill: SkillConfigDto): string {
    const requiredParams = skill.paramsSchema?.required || [];

    if (requiredParams.length === 0) {
      return `请帮我执行“${skill.name}”`;
    }

    const sampleArgs = requiredParams.map((param) => `${param}为示例值`).join('，');

    return `请帮我执行“${skill.name}”，${sampleArgs}`;
  }

  private buildSampleParams(skill: SkillConfigDto): Record<string, unknown> {
    const sampleParams: Record<string, unknown> = {};
    const requiredParams = skill.paramsSchema?.required || [];

    for (const param of requiredParams) {
      const definition = skill.paramsSchema?.properties?.[param];
      if (!definition) {
        continue;
      }

      switch (definition.type) {
        case 'number':
          sampleParams[param] = 100;
          break;
        case 'boolean':
          sampleParams[param] = true;
          break;
        case 'date':
          sampleParams[param] = '2025-04-18';
          break;
        default:
          sampleParams[param] = `${param}示例值`;
      }
    }

    return sampleParams;
  }

  private extractJsonObject(content: string): Record<string, any> | null {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
