/**
 * Execution Flow Template Service
 * 执行流程模板服务 - 支持创建、查询、验证流程模板
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
    name: '天气查询流程',
    description: '查询指定城市的天气信息，调用天气API获取实时数据',
    category: 'query',
    steps: [
      {
        type: 'text',
        name: '确认查询意图',
        content: '用户想查询天气信息，需要识别城市参数',
        expectedOutput: '确认城市参数',
      },
      {
        type: 'api',
        name: '调用天气API',
        api: {
          endpoint: 'https://wttr.in/{city}?format=j1',
          method: 'GET',
        },
        expectedOutput: '天气JSON数据',
      },
      {
        type: 'text',
        name: '格式化天气结果',
        content: '将天气API返回的JSON数据转换为用户友好的文本格式输出',
        expectedOutput: '天气描述文本',
      },
    ],
    executionFlowKeys: ['天气', '查询天气', '天气预报', 'weather'],
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
   * 加载默认流程模板（如果不存在）
   */
  private async loadDefaultTemplates() {
    for (const template of DEFAULT_FLOW_TEMPLATES) {
      const existing = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM execution_flow_templates WHERE name = $1`,
        template.name
      );

      if (existing.length === 0) {
        await this.createTemplate(template);
        this.logger.log(`Created default flow template: ${template.name}`);
      }
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
    // Generate IDs for steps
    const steps = data.steps.map((step) => ({
      ...step,
      id: step.id || randomUUID(),
    }));

    const result = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO execution_flow_templates (name, description, goal, expected_result, params_schema, category, steps, execution_flow_keys, is_public, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb, $9, $10::uuid)
       RETURNING id, name, description, goal, expected_result as "expectedResult", params_schema as "paramsSchema", category, steps, execution_flow_keys as "executionFlowKeys", validation, usage_count as "usageCount", is_public as "isPublic", created_by as "createdBy", is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"`,
      data.name,
      data.description || null,
      data.goal || null,
      data.expectedResult || null,
      JSON.stringify(data.paramsSchema || {}),
      data.category || 'document',
      JSON.stringify(steps),
      JSON.stringify(data.executionFlowKeys || []),
      data.isPublic ?? true,
      data.createdBy || null
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
      const orchestratorUrl = aiServiceUrl || process.env.AI_ORCHESTRATOR_URL || 'http://ops-ai-orchestrator:3007';
      
      const auditPrompt = `你是一个高级系统架构师和 AI Agent 专家。请审计以下”执行流程模板 (Execution Flow Template)”，并验证其作为”影子工具 (Shadow Tool)”提供给 ReAct 引擎时的可行性。

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
4. 原子能力验证：每一个步骤的操作（API/Tool/Script）是否能独立完成？
5. 影子工具适配性：如果将此流程包装成一个工具，其定义的参数 Schema 是否足以驱动整个流程？
6. 容错性：流程中是否有明显的单点故障风险？

请以 JSON 格式返回审计结果，包含以下字段：
{
  “isValid”: boolean,
  “score”: number (0-100),
  “critique”: “详细的逻辑评估”,
  “issues”: [“问题1”, “问题2”],
  “suggestions”: [“改进建议1”, “改进建议2”],
  “improvedFlow”: null | Object (如果逻辑有问题，请提供自动调整后的步骤 JSON)
}
`;

      const aiResponse = await axios.post(`${orchestratorUrl}/ai/chat/stream`, {
        message: auditPrompt,
        sessionId: `audit-${id}-${randomUUID()}`,
        modelId: 'qwen3.5-plus',  // 使用配置好的模型名称
        config: { mode: 'chat', maxIterations: 5 }  // 使用chat模式，更稳定的AI响应
      }, { responseType: 'stream' });

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

      const aiAudit = JSON.parse(fullContent.replace(/```json|```/g, '').trim());

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

    // 2.5 真实执行测试（可选）- 通过ReAct引擎执行流程
    if (enableExecutionTest) {
      try {
        const orchestratorUrl = aiServiceUrl || process.env.AI_ORCHESTRATOR_URL || 'http://ops-ai-orchestrator:3007';

        this.logger.log(`Starting execution test for template ${id} with params: ${JSON.stringify(testParams || {})}`);

        // 使用 ReAct 引擎的 task 模式执行流程
        const execResponse = await axios.post(`${orchestratorUrl}/ai/chat/stream`, {
          message: `执行流程模板 ${template.name}，模板ID: ${id}`,
          sessionId: `exec-test-${id}-${randomUUID()}`,
          modelId: 'qwen3.5-plus',
          config: {
            mode: 'task',
            maxIterations: Math.max(steps.length + 5, 10),  // 给足够迭代次数完成流程
          },
        }, { responseType: 'stream', timeout: 60000 });

        // 收集执行过程
        const executionLog: string[] = [];
        let executionResult = '';
        let executionError = '';
        let iterations = 0;

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
          validationResult.warnings?.push(`执行测试失败: ${executionError}`);
          if (validationResult.details) {
            validationResult.details.executionTest = {
              success: false,
              error: executionError,
              log: executionLog,
              iterations,
            };
          }
        } else if (executionResult) {
          validationResult.suggestions.push(`执行测试成功: 流程完成，共 ${iterations} 次迭代`);
          if (validationResult.details) {
            validationResult.details.executionTest = {
              success: true,
              result: executionResult,
              log: executionLog,
              iterations,
            };
          }
        } else {
          validationResult.warnings?.push('执行测试未返回有效结果');
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
}
