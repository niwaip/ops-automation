/**
 * Execution Flow Template Service
 * 执行流程模板服务 - 支持创建、查询、验证流程模板
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import {
  CreateExecutionFlowTemplateDTO,
  UpdateExecutionFlowTemplateDTO,
  ExecutionFlowTemplateDTO,
  ExecutionFlowStep,
  ValidationResult,
  EXECUTION_FLOW_CATEGORIES,
} from './interfaces';
import { randomUUID } from 'crypto';
import axios from 'axios';

// Default execution flow templates
const DEFAULT_FLOW_TEMPLATES: CreateExecutionFlowTemplateDTO[] = [
  {
    name: '通用外部查询流程',
    description: '根据用户输入调用外部 API，并返回结构化查询结果',
    goal: '接收查询关键词和目标接口地址，调用外部服务后整理返回结果',
    expectedResult: '包含原始响应与格式化摘要的查询结果',
    paramsSchema: {
      properties: {
        query: {
          type: 'string',
          description: '查询关键词或关键参数',
          required: true,
          extractionPrompt: '从用户请求中识别本次查询所需的核心关键词；如果用户未提供，请礼貌询问。',
        },
        endpoint: {
          type: 'string',
          description: '外部服务接口地址，支持使用 {query} 占位符',
          required: true,
        },
      },
      required: ['query', 'endpoint'],
    },
    category: 'query',
    steps: [
      {
        type: 'api',
        name: '调用外部查询接口',
        api: {
          endpoint: '{endpoint}',
          method: 'GET',
          timeout: 5000,
        },
        expectedOutput: '外部服务响应数据',
      },
    ],
    executionFlowKeys: ['查询', '外部接口', 'API', '检索'],
    isPublic: true,
  },
  {
    name: '文档生成流程',
    description: '使用AI生成参数并渲染Word/PDF文档',
    category: 'document',
    steps: [
      {
        type: 'text',
        name: 'AI语义匹配',
        content: '根据用户输入匹配对应的技能和模板',
        expectedOutput: '匹配的技能ID',
      },
      {
        type: 'api',
        name: 'AI生成参数',
        api: {
          endpoint: '/api/carbone/generate-parameters',
          method: 'POST',
        },
        expectedOutput: '模板参数JSON',
      },
      {
        type: 'text',
        name: '用户确认',
        content: '展示参数给用户确认',
        expectedOutput: '用户确认结果',
      },
      {
        type: 'api',
        name: '渲染文档',
        api: {
          endpoint: '/api/carbone/render',
          method: 'POST',
        },
        expectedOutput: '文档URL',
      },
    ],
    executionFlowKeys: ['文档', '生成文档', '合同', '报告'],
    isPublic: true,
  },
];

@Injectable()
export class ExecutionFlowTemplateService implements OnModuleInit {
  private readonly logger = new Logger(ExecutionFlowTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 模块初始化时加载默认流程模板
   */
  async onModuleInit() {
    this.logger.log('Initializing Execution Flow Template Service...');
    await this.loadDefaultTemplates();
  }

  /**
   * 加载并同步默认流程模板
   */
  private async loadDefaultTemplates() {
    for (const template of DEFAULT_FLOW_TEMPLATES) {
      const existing = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM execution_flow_templates WHERE name = $1 ORDER BY created_at ASC`,
        template.name
      );

      if (existing.length === 0) {
        await this.createTemplate(template);
        this.logger.log(`Created default flow template: ${template.name}`);
        continue;
      }

      await this.updateTemplate(existing[0].id, {
        description: template.description,
        goal: template.goal,
        expectedResult: template.expectedResult,
        paramsSchema: template.paramsSchema,
        category: template.category,
        steps: template.steps,
        executionFlowKeys: template.executionFlowKeys,
        isPublic: template.isPublic,
      });
      this.logger.log(`Synced default flow template: ${template.name}`);
    }
  }

  /**
   * 获取所有流程模板（支持分页和过滤）
   */
  async listTemplates(options?: {
    category?: string;
    isPublic?: boolean;
    isActive?: boolean;
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<{ templates: ExecutionFlowTemplateDTO[]; total: number }> {
    const where: any = {};

    if (options?.category) {
      where.category = options.category;
    }
    if (options?.isPublic !== undefined) {
      where.isPublic = options.isPublic;
    }
    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }
    if (options?.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { description: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [templates, total] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id, name, description, goal, expected_result as "expectedResult", params_schema as "paramsSchema", category, steps, execution_flow_keys as "executionFlowKeys", validation, usage_count as "usageCount", is_public as "isPublic", created_by as "createdBy", is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
         FROM execution_flow_templates
         WHERE ${this.buildWhereClause(where)}
         ORDER BY usage_count DESC, created_at DESC
         LIMIT $1 OFFSET $2`,
        options?.limit || 50,
        options?.offset || 0
      ),
      this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) as count FROM execution_flow_templates WHERE ${this.buildWhereClause(where)}`
      ),
    ]);

    // Convert BigInt to Number for JSON serialization
    return { templates: templates.map(t => this.mapTemplateToDTO(t)).filter((t): t is ExecutionFlowTemplateDTO => t !== null), total: Number(total[0]?.count || 0) };
  }

  private buildWhereClause(where: any): string {
    const conditions: string[] = [];

    if (where.category) {
      conditions.push(`category = '${where.category}'`);
    }
    if (where.isPublic !== undefined) {
      conditions.push(`is_public = ${where.isPublic}`);
    }
    if (where.isActive !== undefined) {
      conditions.push(`is_active = ${where.isActive}`);
    }
    if (where.OR) {
      const orConditions = where.OR.map((c: any) => {
        const field = Object.keys(c)[0];
        const value = c[field].contains;
        return `${field} ILIKE '%${value}%'`;
      }).join(' OR ');
      conditions.push(`(${orConditions})`);
    }

    return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  }

  /**
   * 获取单个模板详情
   */
  async getTemplate(id: string): Promise<ExecutionFlowTemplateDTO | null> {
    const template = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, description, goal, expected_result as "expectedResult", params_schema as "paramsSchema", category, steps, execution_flow_keys as "executionFlowKeys", validation, usage_count as "usageCount", is_public as "isPublic", created_by as "createdBy", is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
       FROM execution_flow_templates
       WHERE id = $1::uuid`,
      id
    );

    return this.mapTemplateToDTO(template[0]) || null;
  }

  /**
   * 创建新模板
   */
  async createTemplate(data: CreateExecutionFlowTemplateDTO): Promise<ExecutionFlowTemplateDTO> {
    // Generate IDs for steps and template
    const templateId = randomUUID();
    const steps = data.steps.map((step) => ({
      ...step,
      id: step.id || randomUUID(),
    }));

    const result = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO execution_flow_templates (id, name, description, goal, expected_result, params_schema, category, steps, execution_flow_keys, is_public, created_by)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10, $11::uuid)
       RETURNING id, name, description, goal, expected_result as "expectedResult", params_schema as "paramsSchema", category, steps, execution_flow_keys as "executionFlowKeys", validation, usage_count as "usageCount", is_public as "isPublic", created_by as "createdBy", is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"`,
      templateId,
      data.name,
      data.description || null,
      data.goal || null,
      data.expectedResult || null,
      JSON.stringify(data.paramsSchema || {}),
      data.category || 'document',
      JSON.stringify(steps),
      JSON.stringify(data.executionFlowKeys || []),
      data.isPublic !== undefined ? data.isPublic : true,
      data.createdBy ?? '00000000-0000-0000-0000-000000000000'
    );

    this.logger.log(`Created execution flow template: ${data.name}`);
    return this.mapTemplateToDTO(result[0])!;
  }

  /**
   * 映射数据库结果到DTO
   */
  private mapTemplateToDTO(raw: any): ExecutionFlowTemplateDTO | null {
    if (!raw) return null;
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      goal: raw.goal,
      expectedResult: raw.expectedResult || raw.expected_result,
      paramsSchema: raw.paramsSchema || raw.params_schema,
      category: raw.category,
      steps: raw.steps,
      executionFlowKeys: raw.executionFlowKeys || raw.execution_flow_keys,
      validation: raw.validation,
      usageCount: raw.usageCount || raw.usage_count || 0,
      isPublic: raw.isPublic || raw.is_public,
      createdBy: raw.createdBy || raw.created_by,
      isActive: raw.isActive || raw.is_active,
      createdAt: raw.createdAt || raw.created_at,
      updatedAt: raw.updatedAt || raw.updated_at,
    };
  }

  /**
   * 更新模板
   */
  async updateTemplate(id: string, data: UpdateExecutionFlowTemplateDTO): Promise<ExecutionFlowTemplateDTO | null> {
    // Check if template exists
    const existing = await this.getTemplate(id);
    if (!existing) {
      return null;
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    const shouldResetValidation =
      data.name !== undefined ||
      data.description !== undefined ||
      data.goal !== undefined ||
      data.expectedResult !== undefined ||
      data.paramsSchema !== undefined ||
      data.category !== undefined ||
      data.steps !== undefined ||
      data.executionFlowKeys !== undefined;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      values.push(data.name);
      paramIndex++;
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(data.description);
      paramIndex++;
    }
    if (data.goal !== undefined) {
      updates.push(`goal = $${paramIndex}`);
      values.push(data.goal);
      paramIndex++;
    }
    if (data.expectedResult !== undefined) {
      updates.push(`expected_result = $${paramIndex}`);
      values.push(data.expectedResult);
      paramIndex++;
    }
    if (data.paramsSchema !== undefined) {
      updates.push(`params_schema = $${paramIndex}::jsonb`);
      values.push(JSON.stringify(data.paramsSchema));
      paramIndex++;
    }
    if (data.category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      values.push(data.category);
      paramIndex++;
    }
    if (data.steps !== undefined) {
      const steps = data.steps.map((step) => ({
        ...step,
        id: step.id || randomUUID(),
      }));
      updates.push(`steps = $${paramIndex}::jsonb`);
      values.push(JSON.stringify(steps));
      paramIndex++;
    }
    if (data.executionFlowKeys !== undefined) {
      updates.push(`execution_flow_keys = $${paramIndex}::jsonb`);
      values.push(JSON.stringify(data.executionFlowKeys));
      paramIndex++;
    }
    if (data.isPublic !== undefined) {
      updates.push(`is_public = $${paramIndex}`);
      values.push(data.isPublic);
      paramIndex++;
    }
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(data.isActive);
      paramIndex++;
    }

    if (shouldResetValidation) {
      updates.push(`validation = NULL`);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = now()`);
    values.push(id);

    const result = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE execution_flow_templates SET ${updates.join(', ')} WHERE id = $${paramIndex}::uuid
       RETURNING id, name, description, goal, expected_result as "expectedResult", params_schema as "paramsSchema", category, steps, execution_flow_keys as "executionFlowKeys", validation, usage_count as "usageCount", is_public as "isPublic", created_by as "createdBy", is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"`,
      ...values
    );

    this.logger.log(`Updated execution flow template: ${id}`);
    return this.mapTemplateToDTO(result[0]) || null;
  }

  /**
   * 删除模板
   */
  async deleteTemplate(id: string): Promise<boolean> {
    const affectedRows = await this.prisma.$executeRawUnsafe(
      `DELETE FROM execution_flow_templates WHERE id = $1::uuid`,
      id
    );

    return affectedRows > 0;
  }

  /**
   * 使用模板（增加使用计数）
   */
  async useTemplate(id: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE execution_flow_templates SET usage_count = usage_count + 1 WHERE id = $1::uuid`,
      id
    );
  }

  /**
   * 验证流程模板 - AI驱动的深度验证与优化
   * 检查流程逻辑一致性、参数链条、影子工具适配度，并提供自动调整建议
   * 支持真实执行测试：通过ReAct引擎的flow_execute工具实际执行流程
   */
  async validateTemplate(
    id: string,
    aiServiceUrl?: string,
    testParams?: Record<string, unknown>,
    enableExecutionTest?: boolean,
    testUserInput?: string,
  ): Promise<ValidationResult> {
    const template = await this.getTemplate(id);
    if (!template) {
      throw new Error('Template not found');
    }

    // 1. 基础静态验证
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

      // 静态类型检查
      if (step.type === 'text' && !step.content) {
        stepAnalysis.isExecutable = false;
        validationResult.warnings?.push(`步骤"${step.name}"缺少指导内容`);
      } else if (step.type === 'api' && !step.api?.endpoint) {
        stepAnalysis.isExecutable = false;
        validationResult.warnings?.push(`步骤"${step.name}"缺少API端点`);
      }

      validationResult.details?.stepAnalysis.push(stepAnalysis);
    }

    // 2. AI 驱动的深度逻辑审计
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

      const aiResponse = await axios.post(`${orchestratorUrl}/ai/chat/stream`, {
        message: auditPrompt,
        sessionId: `audit-${id}-${randomUUID()}`,
        modelId: 'default',  // 使用系统默认模型
        config: { mode: 'chat', maxIterations: 5 }  // 使用chat模式，更稳定的AI响应
      }, { responseType: 'stream', timeout: 120000 });

      let fullContent = '';
      let aiErrorReceived = '';
      for await (const chunk of aiResponse.data as AsyncIterable<any>) {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'result') {
                fullContent = data.content;
              } else if (data.type === 'error') {
                aiErrorReceived = data.content || '未知错误';
              }
            } catch (e) {
              // Ignore partial or invalid json
            }
          }
        }
      }

      // 检查是否收到有效响应
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
          validationResult.suggestions.push('AI 已生成自动优化建议，您可以点击“应用建议”一键修复流程。');
        }
      }

    } catch (aiError) {
      this.logger.error('AI Audit failed, falling back to static validation only:', aiError.message);
      validationResult.warnings?.push(`AI 深度审计不可用 (错误: ${aiError.message})，仅执行静态检查。`);
    }

    // 2.5 真实执行测试（可选）- 通过 ReAct 引擎以“Skill 整体能力”进行验证
    if (enableExecutionTest) {
      try {
        const orchestratorUrl = aiServiceUrl || getAiOrchestratorUrl();

        this.logger.log(`Starting skill-based execution test for template ${id}`);

        // 使用 ReAct 引擎验证 Skill 整体能力
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

        const execResponse = await axios.post(`${orchestratorUrl}/ai/chat/stream`, {
          message: executionPrompt,
          sessionId: `skill-test-${id}-${randomUUID()}`,
          modelId: 'default',
          config: {
            mode: 'task',
            maxIterations: Math.max(Math.min(steps.length + 5, 10), 6),
            tools: ['flow_execute'],
          },
        }, { responseType: 'stream', timeout: 180000 });

        // 收集执行过程
        const executionLog: string[] = [];
        let executionResult = '';
        let executionError = '';
        let iterations = 0;
        let generatedSkill: any = null;

        for await (const chunk of execResponse.data as AsyncIterable<any>) {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'thought') {
                  executionLog.push(`[Thought] ${data.content}`);
                  iterations = data.iteration || iterations;
                } else if (data.type === 'action') {
                  executionLog.push(`[Action] ${data.content} ${JSON.stringify(data.data?.actionInput || {})}`);
                } else if (data.type === 'observation') {
                  executionLog.push(`[Observation] ${data.content?.slice(0, 500)}...`);
                } else if (data.type === 'result') {
                  executionResult = data.content;
                  executionLog.push(`[Result] ${executionResult}`);
                  
                  // 尝试从结果中提取生成的 Skill
                  const jsonMatch = executionResult.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    try {
                      const parsed = JSON.parse(jsonMatch[0]);
                      if (parsed.name || parsed.paramsSchema) {
                        generatedSkill = parsed;
                      }
                    } catch (e) {}
                  }
                } else if (data.type === 'error') {
                  executionError = data.content;
                  executionLog.push(`[Error] ${executionError}`);
                } else if (data.type === 'done') {
                  executionLog.push('[Done] Stream completed');
                }
              } catch (e) {
                // Ignore partial JSON
              }
            }
          }
        }

        // 分析执行结果
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
          validationResult.suggestions.push(`Skill 整体验证通过: 流程逻辑闭环，共 ${iterations} 次迭代`);
          if (generatedSkill) {
            validationResult.suggestions.push('已成功生成标准 Skill 定义，您可以点击“发布技能”将其同步到技能库。');
            if (validationResult.details) {
              (validationResult.details as any).generatedSkill = generatedSkill;
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
        this.logger.error('Execution test failed:', execError.message);
        validationResult.warnings?.push(`执行测试异常: ${execError.message}`);
      }
    }

    // 3. 持久化验证结果
    await this.prisma.$executeRawUnsafe(
      `UPDATE execution_flow_templates SET validation = $1::jsonb WHERE id = $2::uuid`,
      JSON.stringify(validationResult),
      id
    );

    this.logger.log(`Validated template ${id}: score=${validationResult.score}, ai_integrated=true`);
    return validationResult;
  }

  /**
   * 获取热门模板（按使用次数排序）
   */
  async getPopularTemplates(limit?: number): Promise<ExecutionFlowTemplateDTO[]> {
    const templates = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, description, goal, expected_result as "expectedResult", params_schema as "paramsSchema", category, steps, execution_flow_keys as "executionFlowKeys", validation, usage_count as "usageCount", is_public as "isPublic", created_by as "createdBy", is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
       FROM execution_flow_templates
       WHERE is_public = true AND is_active = true
       ORDER BY usage_count DESC
       LIMIT $1`,
      limit || 10
    );

    return templates.map(t => this.mapTemplateToDTO(t)).filter(Boolean) as ExecutionFlowTemplateDTO[];
  }

  /**
   * 获取模板分类列表
   */
  async getCategories(): Promise<{ key: string; label: string; color: string; count: number }[]> {
    const counts = await this.prisma.$queryRawUnsafe<{ category: string; count: bigint }[]>(
      `SELECT category, COUNT(*) as count
       FROM execution_flow_templates
       WHERE is_active = true
       GROUP BY category`
    );

    return Object.entries(EXECUTION_FLOW_CATEGORIES).map(([key, value]) => ({
      key,
      label: value.label,
      color: value.color,
      count: Number(counts.find(c => c.category === key)?.count || 0),
    }));
  }

  /**
   * 复制模板（创建副本）
   */
  async cloneTemplate(id: string, newName: string, createdBy?: string): Promise<ExecutionFlowTemplateDTO> {
    const original = await this.getTemplate(id);
    if (!original) {
      throw new Error('Template not found');
    }

    return this.createTemplate({
      name: newName,
      description: original.description || undefined,
      category: original.category,
      steps: original.steps as ExecutionFlowStep[],
      executionFlowKeys: original.executionFlowKeys,
      isPublic: false, // Cloned templates are private by default
      createdBy,
    });
  }

  /**
   * 导出模板为JSON格式（用于分享）
   */
  async exportTemplate(id: string): Promise<string> {
    const template = await this.getTemplate(id);
    if (!template) {
      throw new Error('Template not found');
    }

    return JSON.stringify({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      template: {
        name: template.name,
        description: template.description || undefined,
        category: template.category,
        steps: template.steps,
        executionFlowKeys: template.executionFlowKeys,
      },
    }, null, 2);
  }

  /**
   * 导入模板（从JSON格式）
   */
  async importTemplate(jsonData: string, createdBy?: string): Promise<ExecutionFlowTemplateDTO> {
    try {
      const data = JSON.parse(jsonData);

      if (!data.template || !data.template.name) {
        throw new Error('Invalid template format: missing template name');
      }

      return this.createTemplate({
        name: data.template.name,
        description: data.template.description,
        category: data.template.category || 'custom',
        steps: data.template.steps || [],
        executionFlowKeys: data.template.executionFlowKeys || [],
        isPublic: false,
        createdBy,
      });
    } catch (error) {
      throw new Error(`Failed to import template: ${error.message}`);
    }
  }

  /**
   * 应用 AI 优化建议
   */
  async applyAdjustment(id: string): Promise<ExecutionFlowTemplateDTO | null> {
    const template = await this.getTemplate(id);
    if (!template || !template.validation) {
      throw new Error('No AI adjustment found for this template');
    }

    const validation = template.validation as any;
    const autoAdjustment = validation.details?.autoAdjustment;

    if (!autoAdjustment) {
      throw new Error('No improved flow suggested by AI');
    }

    // AI返回的autoAdjustment结构：{ steps, paramsSchema, goal, expectedResult, executionFlowKeys }
    // 兼容中文 Key (由于 Prompt 中可能使用了中文)
    const improvedSteps = autoAdjustment.steps || autoAdjustment['步骤列表'] || autoAdjustment;
    const improvedParamsSchema = autoAdjustment.paramsSchema || autoAdjustment['参数定义'];
    const improvedGoal = autoAdjustment.goal || autoAdjustment['流程目标'];
    const improvedExpectedResult = autoAdjustment.expectedResult || autoAdjustment['预期结果'];
    const improvedExecutionFlowKeys = autoAdjustment.executionFlowKeys || autoAdjustment['触发关键词'];

    // 验证步骤是数组
    if (!Array.isArray(improvedSteps)) {
      throw new Error('Invalid steps format in AI adjustment');
    }

    return this.updateTemplate(id, {
      steps: improvedSteps,
      paramsSchema: improvedParamsSchema || undefined,
      goal: improvedGoal || undefined,
      expectedResult: improvedExpectedResult || undefined,
      executionFlowKeys: improvedExecutionFlowKeys || undefined,
    });
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
