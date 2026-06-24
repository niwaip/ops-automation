import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import type { ExecutionFlowTemplateDTO, ExecutionFlowStep, ValidationResult } from './interfaces';

@Injectable()
export class ExecutionFlowValidationService {
  private readonly logger = new Logger(ExecutionFlowValidationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async validateResolvedTemplate(
    id: string,
    template: ExecutionFlowTemplateDTO,
    aiServiceUrl?: string,
    testParams?: Record<string, unknown>,
    enableExecutionTest?: boolean,
    testUserInput?: string
  ): Promise<ValidationResult> {
    const validationResult: ValidationResult = {
      isValid: true,
      score: 100,
      suggestions: [],
      warnings: [],
      validatedAt: new Date().toISOString(),
      validatedBy: 'ai-flow-auditor',
      details: {
        stepAnalysis: [],
      },
    };

    const steps = template.steps as ExecutionFlowStep[];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepAnalysis = {
        stepId: step.id || `step-${i}`,
        stepName: step.name,
        isExecutable: true,
        hasDependencies: false,
        suggestion: undefined as string | undefined,
      };

      if (step.type === 'text' && !step.content) {
        stepAnalysis.isExecutable = false;
        validationResult.warnings?.push(`步骤"${step.name}"缺少指导内容`);
      } else if (step.type === 'api' && !step.api?.endpoint) {
        stepAnalysis.isExecutable = false;
        validationResult.warnings?.push(`步骤"${step.name}"缺少API端点`);
      }

      validationResult.details?.stepAnalysis.push(stepAnalysis);
    }

    try {
      const orchestratorUrl = aiServiceUrl || getAiOrchestratorUrl();

      const auditPrompt = `你是一个高级系统架构师和 AI Agent 专家。请审计以下“执行流程模板 (Execution Flow Template)”，并验证它作为一个“宏工具”时，是否只封装了一个清晰、原子、可确定执行的能力。

流程名称: ${template.name}
流程描述: ${template.description || '无'}
${template.goal ? `流程目标: ${template.goal}` : '流程目标: 未定义'}
${template.expectedResult ? `预期结果: ${template.expectedResult}` : '预期结果: 未定义'}
${template.paramsSchema ? `参数定义: ${JSON.stringify(template.paramsSchema, null, 2)}` : '参数定义: 未定义'}
步骤列表: ${JSON.stringify(template.steps, null, 2)}
触发关键词: ${JSON.stringify(template.executionFlowKeys)}

请从以下维度进行分析：
1. 目标一致性：流程步骤是否能达成定义的目标？预期结果是否可实现？
2. 参数完整性：如果定义了参数Schema，流程是否正确使用了这些参数？
3. 逻辑一致性：步骤间的参数传递是否闭合？是否存在后续步骤依赖但前序步骤未提供的参数？
4. 原子能力验证：流程是否只聚焦一个原子能力，而不是试图解决整条业务链路？
5. 影子工具适配性：如果将此流程包装成一个工具，其参数 Schema 是否足以驱动整个流程，并尽量减少额外上下文和 token 消耗？
6. 确定性与容错性：步骤是否尽可能确定、可复现，是否存在明显单点故障风险？

输出要求：
1. 只返回一个 JSON 对象，不要输出 Markdown、代码块、解释文字。
2. 如果流程整体可用但存在优化空间，isValid 仍可为 true。
3. improvedFlow 只在“存在高置信度、可自动修复的结构性问题”时提供。
4. improvedFlow 必须遵循以下结构：
{
  "steps": [ 优化后的步骤列表 ],
  "paramsSchema": { 优化后的参数定义 },
  "goal": "优化后的流程目标",
  "expectedResult": "优化后的预期结果",
  "executionFlowKeys": [ 优化后的触发关键词 ]
}
5. 优化原则：
   - 移除不必要的 inputMapping，简化上下文引用。
   - 为网络请求步骤（如 API）添加 timeout 配置（建议 5000ms-10000ms）。
   - 优化错误触发条件，建议基于“成功路径未完成”的逻辑，或确保引擎支持 'skipped' 状态判断。
   - 如果涉及 LLM 解析 JSON，在 prompt 中明确指示 LLM 处理可能的解析错误，增加鲁棒性。
   - 考虑增加缓存机制（如在步骤描述中建议），避免重复调用 API。

返回格式：
{
  "isValid": boolean,
  "score": number,
  "critique": "详细的逻辑评估",
  "issues": ["问题1", "问题2"],
  "suggestions": ["改进建议1", "改进建议2"],
  "improvedFlow": { "steps": [], "paramsSchema": {}, "goal": "", "expectedResult": "", "executionFlowKeys": [] } | null
}
`;

      const aiResponse = await axios.post(
        `${orchestratorUrl}/ai/chat/stream`,
        {
          message: auditPrompt,
          sessionId: `audit-${id}-${randomUUID()}`,
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
            } else if (data.type === 'error') {
              aiErrorReceived = data.content || '未知错误';
            }
          } catch {
            // Ignore partial or invalid json
          }
        }
      }

      if (!fullContent || fullContent.trim() === '') {
        const errorMsg = aiErrorReceived || '未收到有效响应';
        throw new Error(errorMsg);
      }

      const aiAudit = this.parseJsonFromAiContent(fullContent);

      if (aiAudit) {
        validationResult.isValid = validationResult.isValid && aiAudit.isValid;
        validationResult.score = Math.min(validationResult.score || 100, aiAudit.score);
        validationResult.suggestions.push(...(aiAudit.suggestions || []));
        validationResult.warnings?.push(...(aiAudit.issues || []));

        if (validationResult.details) {
          validationResult.details.aiCritique = aiAudit.critique;
          validationResult.details.autoAdjustment = aiAudit.improvedFlow;
        }

        if (aiAudit.improvedFlow) {
          validationResult.suggestions.push(
            'AI 已生成自动优化建议，您可以点击“应用建议”一键修复流程。'
          );
        }
      }
    } catch (aiError) {
      const message = aiError instanceof Error ? aiError.message : '未知错误';
      this.logger.error('AI Audit failed, falling back to static validation only:', message);
      validationResult.warnings?.push(`AI 深度审计不可用 (错误: ${message})，仅执行静态检查。`);
    }

    if (enableExecutionTest) {
      try {
        const orchestratorUrl = aiServiceUrl || getAiOrchestratorUrl();
        this.logger.log(`Starting skill-based execution test for template ${id}`);

        const normalizedTestParams = testParams || {};
        const normalizedUserInput = (testUserInput || '').trim();
        const executionPrompt = [
          '你现在是“AI Skill 完整性验证器”。',
          '请把当前的流程模板当成一个【单一的原子 Skill】进行整体验证。',
          '不要因为某个中间步骤的 API 暂时不可访问就判定失败，只要逻辑流转正确、参数定义清晰即可。',
          `技能名称: ${template.name}`,
          template.goal ? `技能目标: ${template.goal}` : '技能目标: 未定义',
          template.expectedResult ? `预期结果: ${template.expectedResult}` : '预期结果: 未定义',
          `模板ID: ${id}`,
          `模拟用户输入: ${normalizedUserInput || '未提供，请根据技能目标构造合理输入'}`,
          `结构化参数: ${JSON.stringify(normalizedTestParams, null, 2)}`,
          '验证规则:',
          '1. 使用 flow_execute 执行流程。',
          '2. 验证参数提取是否准确（基于 paramsSchema）。',
          '3. 验证步骤间的逻辑关联是否闭环。',
          '4. 最终生成一个“标准 Skill 定义”，供外部 AI 调用。',
        ].join('\n');

        const execResponse = await axios.post(
          `${orchestratorUrl}/ai/chat/stream`,
          {
            message: executionPrompt,
            sessionId: `skill-test-${id}-${randomUUID()}`,
            modelId: 'default',
            config: {
              mode: 'task',
              maxIterations: Math.max(Math.min(steps.length + 5, 10), 6),
              tools: ['flow_execute'],
            },
          },
          { responseType: 'stream', timeout: 180000 }
        );

        const executionLog: string[] = [];
        let executionResult = '';
        let executionError = '';
        let iterations = 0;
        let generatedSkill: Record<string, unknown> | null = null;

        for await (const chunk of execResponse.data as AsyncIterable<any>) {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) {
              continue;
            }
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'thought') {
                executionLog.push(`[Thought] ${data.content}`);
                iterations = data.iteration || iterations;
              } else if (data.type === 'action') {
                executionLog.push(
                  `[Action] ${data.content} ${JSON.stringify(data.data?.actionInput || {})}`
                );
              } else if (data.type === 'observation') {
                executionLog.push(`[Observation] ${data.content?.slice(0, 500)}...`);
              } else if (data.type === 'result') {
                executionResult = data.content;
                executionLog.push(`[Result] ${executionResult}`);

                const jsonMatch = executionResult.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.name || parsed.paramsSchema) {
                      generatedSkill = parsed;
                    }
                  } catch {}
                }
              } else if (data.type === 'error') {
                executionError = data.content;
                executionLog.push(`[Error] ${executionError}`);
              } else if (data.type === 'done') {
                executionLog.push('[Done] Stream completed');
              }
            } catch {
              // Ignore partial JSON
            }
          }
        }

        if (executionError) {
          validationResult.warnings?.push(`Skill 整体验证存在异常: ${executionError}`);
          if (validationResult.details) {
            validationResult.details.executionTest = {
              success: false,
              error: executionError,
              log: executionLog,
              iterations,
            };
          }
        } else if (executionResult) {
          validationResult.suggestions.push(
            `Skill 整体验证通过: 流程逻辑闭环，共 ${iterations} 次迭代`
          );
          if (generatedSkill) {
            validationResult.suggestions.push(
              '已成功生成标准 Skill 定义，您可以点击“发布技能”将其同步到技能库。'
            );
            if (validationResult.details) {
              (validationResult.details as Record<string, unknown>).generatedSkill = generatedSkill;
            }
          }

          if (validationResult.details) {
            validationResult.details.executionTest = {
              success: true,
              result: executionResult,
              log: executionLog,
              iterations,
            };
          }
        } else {
          validationResult.warnings?.push('执行测试未返回有效结论');
        }
      } catch (execError) {
        const message = execError instanceof Error ? execError.message : '未知错误';
        this.logger.error('Execution test failed:', message);
        validationResult.warnings?.push(`执行测试异常: ${message}`);
      }
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE execution_flow_templates SET validation = $1::jsonb WHERE id = $2::uuid`,
      JSON.stringify(validationResult),
      id
    );

    this.logger.log(
      `Validated template ${id}: score=${validationResult.score}, ai_integrated=true`
    );
    return validationResult;
  }

  private parseJsonFromAiContent(content: string): Record<string, any> {
    const sanitized = content.replace(/```json|```/g, '').trim();

    try {
      return JSON.parse(sanitized);
    } catch {
      const start = sanitized.indexOf('{');
      const end = sanitized.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(sanitized.slice(start, end + 1));
      }
      throw new Error('AI 返回内容不是有效 JSON');
    }
  }
}
