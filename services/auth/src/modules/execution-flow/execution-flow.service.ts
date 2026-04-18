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
      this.prisma.$queryRawUnsafe<ExecutionFlowTemplateDTO[]>(
        `SELECT id, name, description, category, steps, execution_flow_keys, validation, usage_count, is_public, created_by, is_active, created_at, updated_at
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
    return { templates, total: Number(total[0]?.count || 0) };
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
    const template = await this.prisma.$queryRawUnsafe<ExecutionFlowTemplateDTO[]>(
      `SELECT id, name, description, category, steps, execution_flow_keys, validation, usage_count, is_public, created_by, is_active, created_at, updated_at
       FROM execution_flow_templates
       WHERE id = $1::uuid`,
      id
    );

    return template[0] || null;
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

    const result = await this.prisma.$queryRawUnsafe<ExecutionFlowTemplateDTO[]>(
      `INSERT INTO execution_flow_templates (name, description, category, steps, execution_flow_keys, is_public, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::uuid)
       RETURNING id, name, description, category, steps, execution_flow_keys, validation, usage_count, is_public, created_by, is_active, created_at, updated_at`,
      data.name,
      data.description || null,
      data.category || 'document',
      JSON.stringify(steps),
      JSON.stringify(data.executionFlowKeys || []),
      data.isPublic ?? true,
      data.createdBy || null
    );

    this.logger.log(`Created execution flow template: ${data.name}`);
    return result[0];
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

    const result = await this.prisma.$queryRawUnsafe<ExecutionFlowTemplateDTO[]>(
      `UPDATE execution_flow_templates SET ${updates.join(', ')} WHERE id = $${paramIndex}::uuid
       RETURNING id, name, description, category, steps, execution_flow_keys, validation, usage_count, is_public, created_by, is_active, created_at, updated_at`,
      ...values
    );

    this.logger.log(`Updated execution flow template: ${id}`);
    return result[0] || null;
  }

  /**
   * 删除模板
   */
  async deleteTemplate(id: string): Promise<boolean> {
    const result = await this.prisma.$queryRawUnsafe(
      `DELETE FROM execution_flow_templates WHERE id = $1::uuid`,
      id
    );

    return (result as any[]).length > 0;
  }

  /**
   * 使用模板（增加使用计数）
   */
  async useTemplate(id: string): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `UPDATE execution_flow_templates SET usage_count = usage_count + 1 WHERE id = $1::uuid`,
      id
    );
  }

  /**
   * 验证流程模板 - AI验证功能
   * 检查流程是否可执行、步骤是否合理
   */
  async validateTemplate(id: string, aiServiceUrl?: string): Promise<ValidationResult> {
    const template = await this.getTemplate(id);
    if (!template) {
      throw new Error('Template not found');
    }

    // Perform validation
    const validationResult: ValidationResult = {
      isValid: true,
      score: 100,
      suggestions: [],
      warnings: [],
      validatedAt: new Date().toISOString(),
      validatedBy: 'local-validator',
      details: {
        stepAnalysis: [],
      },
    };

    // Validate each step
    const steps = template.steps as ExecutionFlowStep[];
    let hasScriptStep = false;
    let hasApiStep = false;
    let hasToolStep = false;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepAnalysis = {
        stepId: step.id || `step-${i}`,
        stepName: step.name,
        isExecutable: true,
        hasDependencies: false,
        suggestion: undefined as string | undefined,
      };

      // Check step type specific validation
      switch (step.type) {
        case 'text':
          if (!step.content) {
            stepAnalysis.isExecutable = false;
            stepAnalysis.suggestion = '文本步骤缺少content内容';
            validationResult.warnings?.push(`步骤"${step.name}"缺少指导内容`);
            validationResult.score! -= 10;
          }
          break;

        case 'script':
          hasScriptStep = true;
          if (!step.script?.code) {
            stepAnalysis.isExecutable = false;
            stepAnalysis.suggestion = '脚本步骤缺少代码';
            validationResult.warnings?.push(`步骤"${step.name}"缺少执行代码`);
            validationResult.score! -= 20;
          }
          // Check for dangerous patterns
          if (step.script?.code) {
            const dangerousPatterns = ['rm -rf', 'sudo', 'chmod 777', 'curl | bash'];
            for (const pattern of dangerousPatterns) {
              if (step.script.code.includes(pattern)) {
                stepAnalysis.suggestion = `脚本包含潜在危险操作: ${pattern}`;
                validationResult.warnings?.push(`步骤"${step.name}"包含潜在危险操作: ${pattern}`);
                validationResult.score! -= 30;
              }
            }
          }
          break;

        case 'tool':
          hasToolStep = true;
          if (!step.tool?.name) {
            stepAnalysis.isExecutable = false;
            stepAnalysis.suggestion = '工具步骤缺少工具名称';
            validationResult.warnings?.push(`步骤"${step.name}"缺少工具名称`);
            validationResult.score! -= 15;
          }
          break;

        case 'api':
          hasApiStep = true;
          if (!step.api?.endpoint) {
            stepAnalysis.isExecutable = false;
            stepAnalysis.suggestion = 'API步骤缺少endpoint';
            validationResult.warnings?.push(`步骤"${step.name}"缺少API端点`);
            validationResult.score! -= 15;
          }
          break;

        default:
          stepAnalysis.isExecutable = false;
          stepAnalysis.suggestion = `未知步骤类型: ${step.type}`;
          validationResult.isValid = false;
          validationResult.suggestions.push(`步骤"${step.name}"使用了未知类型`);
      }

      // Check dependencies between steps
      if (i > 0 && (step.type === 'api' || step.type === 'tool')) {
        stepAnalysis.hasDependencies = true;
        // Check if previous step provides output needed for this step
        const prevStep = steps[i - 1];
        if (prevStep.type === 'text' && !prevStep.expectedOutput) {
          validationResult.suggestions.push(
            `建议为步骤"${prevStep.name}"添加expectedOutput，以便后续步骤"${step.name}"使用`
          );
        }
      }

      validationResult.details!.stepAnalysis.push(stepAnalysis);
    }

    // Overall suggestions
    if (hasScriptStep) {
      validationResult.suggestions.push('脚本执行步骤需要确保执行环境安全');
    }
    if (hasApiStep) {
      validationResult.suggestions.push('API调用步骤建议添加超时和错误处理配置');
    }
    if (steps.length > 10) {
      validationResult.suggestions.push('流程步骤较多，建议拆分为多个子流程');
    }

    // Adjust score
    if (validationResult.score! < 0) {
      validationResult.score = 0;
    }
    if (validationResult.score! < 60) {
      validationResult.isValid = false;
    }

    // Save validation result to template
    await this.prisma.$queryRawUnsafe(
      `UPDATE execution_flow_templates SET validation = $1::jsonb WHERE id = $2::uuid`,
      JSON.stringify(validationResult),
      id
    );

    this.logger.log(`Validated template ${id}: score=${validationResult.score}, valid=${validationResult.isValid}`);
    return validationResult;
  }

  /**
   * 获取热门模板（按使用次数排序）
   */
  async getPopularTemplates(limit?: number): Promise<ExecutionFlowTemplateDTO[]> {
    const templates = await this.prisma.$queryRawUnsafe<ExecutionFlowTemplateDTO[]>(
      `SELECT id, name, description, category, steps, execution_flow_keys, validation, usage_count, is_public, created_by, is_active, created_at, updated_at
       FROM execution_flow_templates
       WHERE is_public = true AND is_active = true
       ORDER BY usage_count DESC
       LIMIT $1`,
      limit || 10
    );

    return templates;
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