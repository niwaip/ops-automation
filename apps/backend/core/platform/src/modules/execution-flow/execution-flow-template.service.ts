/**
 * Execution Flow Template Service
 * 执行流程模板服务 - 支持创建、查询和模板管理
 */

import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateExecutionFlowTemplateDTO,
  UpdateExecutionFlowTemplateDTO,
  ExecutionFlowTemplateDTO,
  ExecutionFlowStep,
  EXECUTION_FLOW_CATEGORIES,
  WorkflowInputPolicy,
  WorkflowParamPolicy,
  WorkflowParamRequiredMode,
} from './interfaces';
import { randomUUID } from 'crypto';
import { ExecutionFlowValidationService } from './execution-flow-validation.service';

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
          extractionPrompt:
            '从用户请求中识别本次查询所需的核心关键词；如果用户未提供，请礼貌询问。',
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
    description: '按 schema 识别参数、补齐缺失信息并统一渲染文档',
    category: 'document',
    steps: [
      {
        type: 'text',
        name: '技能匹配',
        content: '根据用户输入匹配文档技能，并读取对应的 paramsSchema',
        expectedOutput: '匹配到的技能、模板和参数 schema',
      },
      {
        type: 'text',
        name: '参数识别',
        content: '基于 paramsSchema 识别扁平字段，只抽取有依据的值',
        expectedOutput: '扁平字段参数和缺失项分析',
      },
      {
        type: 'text',
        name: '缺失补参',
        content: '缺少必填或低置信度字段时进入 waiting_input，继续自然语言补参',
        expectedOutput: '满足执行条件的确认参数',
      },
      {
        type: 'api',
        name: '渲染文档',
        api: {
          endpoint: '/api/carbone/render-resolved',
          method: 'POST',
        },
        expectedOutput: '基于 execution.normalizedInputJson.input 的文档结果',
      },
    ],
    executionFlowKeys: ['文档', '生成文档', '合同', '报告'],
    isPublic: true,
  },
];

@Injectable()
export class ExecutionFlowTemplateService implements OnModuleInit {
  private readonly logger = new Logger(ExecutionFlowTemplateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionFlowValidationService: ExecutionFlowValidationService
  ) {}

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
        inputPolicy: template.inputPolicy,
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
    return {
      templates: templates
        .map((t) => this.mapTemplateToDTO(t))
        .filter((t): t is ExecutionFlowTemplateDTO => t !== null),
      total: Number(total[0]?.count || 0),
    };
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
    const normalizedInputPolicy = this.normalizeWorkflowInputPolicy(
      data.inputPolicy,
      data.paramsSchema
    );
    const persistedParamsSchema = this.serializeTemplateParamsSchema(
      data.paramsSchema,
      normalizedInputPolicy
    );

    const result = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO execution_flow_templates (id, name, description, goal, expected_result, params_schema, category, steps, execution_flow_keys, is_public, created_by)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10, $11::uuid)
       RETURNING id, name, description, goal, expected_result as "expectedResult", params_schema as "paramsSchema", category, steps, execution_flow_keys as "executionFlowKeys", validation, usage_count as "usageCount", is_public as "isPublic", created_by as "createdBy", is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"`,
      templateId,
      data.name,
      data.description || null,
      data.goal || null,
      data.expectedResult || null,
      JSON.stringify(persistedParamsSchema),
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
    const persistedParamsSchema = this.asRecord(raw.paramsSchema || raw.params_schema);
    const inputPolicy = this.extractWorkflowInputPolicy(persistedParamsSchema);
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      goal: raw.goal,
      expectedResult: raw.expectedResult || raw.expected_result,
      paramsSchema: this.stripWorkflowInputPolicyFromParamsSchema(persistedParamsSchema),
      ...(inputPolicy ? { inputPolicy } : {}),
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
  async updateTemplate(
    id: string,
    data: UpdateExecutionFlowTemplateDTO
  ): Promise<ExecutionFlowTemplateDTO | null> {
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
      data.inputPolicy !== undefined ||
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
      const normalizedInputPolicy = this.normalizeWorkflowInputPolicy(
        data.inputPolicy !== undefined ? data.inputPolicy : existing.inputPolicy,
        data.paramsSchema
      );
      values.push(
        JSON.stringify(this.serializeTemplateParamsSchema(data.paramsSchema, normalizedInputPolicy))
      );
      paramIndex++;
    } else if (data.inputPolicy !== undefined) {
      updates.push(`params_schema = $${paramIndex}::jsonb`);
      const normalizedInputPolicy = this.normalizeWorkflowInputPolicy(
        data.inputPolicy,
        existing.paramsSchema
      );
      values.push(
        JSON.stringify(
          this.serializeTemplateParamsSchema(existing.paramsSchema, normalizedInputPolicy)
        )
      );
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

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private stripWorkflowInputPolicyFromParamsSchema(
    paramsSchema: Record<string, unknown> | undefined
  ): Record<string, unknown> {
    if (!paramsSchema) {
      return {};
    }

    const { inputPolicy: _inputPolicy, ...rest } = paramsSchema;
    return rest;
  }

  private extractWorkflowInputPolicy(
    paramsSchema: Record<string, unknown> | undefined
  ): WorkflowInputPolicy | undefined {
    if (!paramsSchema) {
      return undefined;
    }

    const rawInputPolicy = this.asRecord(paramsSchema.inputPolicy);
    const normalizedParams = this.extractWorkflowInputPolicyParams(rawInputPolicy, paramsSchema);
    if (Object.keys(normalizedParams).length === 0) {
      return undefined;
    }

    return {
      params: normalizedParams,
    };
  }

  private serializeTemplateParamsSchema(
    paramsSchema: Record<string, unknown> | undefined,
    inputPolicy: WorkflowInputPolicy | undefined
  ): Record<string, unknown> {
    const schema = this.asRecord(paramsSchema) || {};
    if (!inputPolicy || Object.keys(inputPolicy.params || {}).length === 0) {
      return schema;
    }

    return {
      ...schema,
      inputPolicy,
    };
  }

  private normalizeWorkflowInputPolicy(
    inputPolicy: WorkflowInputPolicy | undefined,
    paramsSchema?: Record<string, unknown>
  ): WorkflowInputPolicy | undefined {
    const explicitPolicies = this.extractWorkflowInputPolicyParams(inputPolicy, paramsSchema);
    const defaultPolicies = this.buildDefaultWorkflowInputPolicyParams(paramsSchema);
    const allowedKeys = new Set([
      ...Object.keys(defaultPolicies),
      ...this.extractDeclaredParamsSchemaKeys(paramsSchema),
    ]);

    if (allowedKeys.size > 0) {
      const invalidKeys = Object.keys(explicitPolicies).filter((key) => !allowedKeys.has(key));
      if (invalidKeys.length > 0) {
        throw new BadRequestException(
          `inputPolicy.params 包含未注册参数: ${invalidKeys.join(', ')}`
        );
      }
    }

    const mergedPolicies = Object.keys({
      ...defaultPolicies,
      ...explicitPolicies,
    }).reduce<Record<string, WorkflowParamPolicy>>((acc, key) => {
      acc[key] = {
        ...(defaultPolicies[key] || {}),
        ...(explicitPolicies[key] || {}),
      };
      return acc;
    }, {});

    if (Object.keys(mergedPolicies).length === 0) {
      return undefined;
    }

    return {
      params: mergedPolicies,
    };
  }

  private buildDefaultWorkflowInputPolicyParams(
    paramsSchema?: Record<string, unknown>
  ): Record<string, WorkflowParamPolicy> {
    const schemaProperties = this.extractParamsSchemaProperties(paramsSchema);
    const requiredKeys = new Set(this.extractRequiredParamsSchemaKeys(paramsSchema));

    return Object.entries(schemaProperties).reduce<Record<string, WorkflowParamPolicy>>(
      (acc, [key, definition]) => {
        const property = this.asRecord(definition);
        if (!property) {
          return acc;
        }

        const policy: WorkflowParamPolicy = {
          enabled: true,
          requiredMode: requiredKeys.has(key) || property.required === true ? 'always' : 'optional',
        };

        if (property.default !== undefined) {
          policy.defaultValue = property.default;
        }
        if (typeof property.previewBlocking === 'boolean') {
          policy.previewBlocking = property.previewBlocking;
        }
        if (
          typeof property.confirmationThreshold === 'number' &&
          Number.isFinite(property.confirmationThreshold)
        ) {
          policy.confirmationThreshold = Math.max(0, Math.min(1, property.confirmationThreshold));
        }

        acc[key] = policy;
        return acc;
      },
      {}
    );
  }

  private extractWorkflowInputPolicyParams(
    inputPolicy: WorkflowInputPolicy | Record<string, unknown> | undefined,
    paramsSchema?: Record<string, unknown>
  ): Record<string, WorkflowParamPolicy> {
    if (!inputPolicy || typeof inputPolicy !== 'object' || Array.isArray(inputPolicy)) {
      return {};
    }

    const rawParams = this.asRecord((inputPolicy as Record<string, unknown>).params) || inputPolicy;
    const schemaProperties = this.extractParamsSchemaProperties(paramsSchema);

    return Object.entries(rawParams).reduce<Record<string, WorkflowParamPolicy>>(
      (acc, [key, value]) => {
        const trimmedKey = String(key || '').trim();
        if (!trimmedKey) {
          return acc;
        }

        const normalizedPolicy = this.normalizeWorkflowParamPolicy(
          value,
          trimmedKey,
          schemaProperties[trimmedKey]
        );
        if (normalizedPolicy) {
          acc[trimmedKey] = normalizedPolicy;
        }
        return acc;
      },
      {}
    );
  }

  private normalizeWorkflowParamPolicy(
    value: unknown,
    paramName?: string,
    schemaDefinition?: unknown
  ): WorkflowParamPolicy | undefined {
    const rawPolicy = this.asRecord(value);
    if (!rawPolicy) {
      return undefined;
    }

    const allowedPolicyKeys = new Set([
      'enabled',
      'requiredMode',
      'defaultValue',
      'defaultValueResolver',
      'valueSourcePriority',
      'confirmationThreshold',
      'previewBlocking',
      'validationRules',
      'transformRule',
      'templateBinding',
    ]);
    const invalidPolicyKeys = Object.keys(rawPolicy).filter((key) => !allowedPolicyKeys.has(key));
    if (invalidPolicyKeys.length > 0) {
      throw new BadRequestException(
        `inputPolicy.params.${paramName || '*'} 包含非法字段: ${invalidPolicyKeys.join(', ')}`
      );
    }

    const allowedRequiredModes = new Set<WorkflowParamRequiredMode>([
      'always',
      'conditional',
      'optional',
      'system_required',
    ]);
    const normalizedPolicy: WorkflowParamPolicy = {};

    if (typeof rawPolicy.enabled === 'boolean') {
      normalizedPolicy.enabled = rawPolicy.enabled;
    } else if (rawPolicy.enabled !== undefined) {
      throw new BadRequestException(
        `inputPolicy.params.${paramName || '*'}.enabled 必须是 boolean`
      );
    }
    if (
      typeof rawPolicy.requiredMode === 'string' &&
      allowedRequiredModes.has(rawPolicy.requiredMode as WorkflowParamRequiredMode)
    ) {
      normalizedPolicy.requiredMode = rawPolicy.requiredMode as WorkflowParamRequiredMode;
    } else if (rawPolicy.requiredMode !== undefined) {
      throw new BadRequestException(
        `inputPolicy.params.${paramName || '*'}.requiredMode 非法: ${String(rawPolicy.requiredMode)}`
      );
    }
    if (rawPolicy.defaultValue !== undefined) {
      this.assertWorkflowPolicyDefaultValueCompatible(
        paramName,
        rawPolicy.defaultValue,
        schemaDefinition
      );
      normalizedPolicy.defaultValue = rawPolicy.defaultValue;
    }
    if (
      typeof rawPolicy.defaultValueResolver === 'string' &&
      rawPolicy.defaultValueResolver.trim()
    ) {
      normalizedPolicy.defaultValueResolver = rawPolicy.defaultValueResolver.trim();
    } else if (rawPolicy.defaultValueResolver !== undefined) {
      throw new BadRequestException(
        `inputPolicy.params.${paramName || '*'}.defaultValueResolver 必须是非空字符串`
      );
    }
    if (Array.isArray(rawPolicy.valueSourcePriority)) {
      const valueSourcePriority = Array.from(
        new Set(
          rawPolicy.valueSourcePriority
            .map((item) => String(item || '').trim())
            .filter((item) => item.length > 0)
        )
      );
      if (valueSourcePriority.length > 0) {
        normalizedPolicy.valueSourcePriority = valueSourcePriority;
      }
    } else if (rawPolicy.valueSourcePriority !== undefined) {
      throw new BadRequestException(
        `inputPolicy.params.${paramName || '*'}.valueSourcePriority 必须是字符串数组`
      );
    }
    if (
      typeof rawPolicy.confirmationThreshold === 'number' &&
      Number.isFinite(rawPolicy.confirmationThreshold)
    ) {
      normalizedPolicy.confirmationThreshold = Math.max(
        0,
        Math.min(1, rawPolicy.confirmationThreshold)
      );
    } else if (rawPolicy.confirmationThreshold !== undefined) {
      throw new BadRequestException(
        `inputPolicy.params.${paramName || '*'}.confirmationThreshold 必须是数字`
      );
    }
    if (typeof rawPolicy.previewBlocking === 'boolean') {
      normalizedPolicy.previewBlocking = rawPolicy.previewBlocking;
    } else if (rawPolicy.previewBlocking !== undefined) {
      throw new BadRequestException(
        `inputPolicy.params.${paramName || '*'}.previewBlocking 必须是 boolean`
      );
    }
    if (Array.isArray(rawPolicy.validationRules)) {
      const validationRules = rawPolicy.validationRules.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      );
      if (validationRules.length > 0) {
        normalizedPolicy.validationRules = validationRules;
      }
    } else if (rawPolicy.validationRules !== undefined) {
      throw new BadRequestException(
        `inputPolicy.params.${paramName || '*'}.validationRules 必须是对象数组`
      );
    }
    if (typeof rawPolicy.transformRule === 'string' && rawPolicy.transformRule.trim()) {
      normalizedPolicy.transformRule = rawPolicy.transformRule.trim();
    } else if (rawPolicy.transformRule !== undefined) {
      throw new BadRequestException(
        `inputPolicy.params.${paramName || '*'}.transformRule 必须是非空字符串`
      );
    }
    if (typeof rawPolicy.templateBinding === 'string' && rawPolicy.templateBinding.trim()) {
      normalizedPolicy.templateBinding = rawPolicy.templateBinding.trim();
    } else if (rawPolicy.templateBinding !== undefined) {
      throw new BadRequestException(
        `inputPolicy.params.${paramName || '*'}.templateBinding 必须是非空字符串`
      );
    }

    return Object.keys(normalizedPolicy).length > 0 ? normalizedPolicy : undefined;
  }

  private assertWorkflowPolicyDefaultValueCompatible(
    paramName: string | undefined,
    defaultValue: unknown,
    schemaDefinition?: unknown
  ): void {
    const property = this.asRecord(schemaDefinition);
    const expectedType = typeof property?.type === 'string' ? property.type.trim() : '';
    if (!expectedType) {
      return;
    }

    const compatible =
      expectedType === 'string' || expectedType === 'date'
        ? typeof defaultValue === 'string'
        : expectedType === 'number'
          ? typeof defaultValue === 'number' && Number.isFinite(defaultValue)
          : expectedType === 'boolean'
            ? typeof defaultValue === 'boolean'
            : true;

    if (!compatible) {
      throw new BadRequestException(
        `inputPolicy.params.${paramName || '*'}.defaultValue 与参数类型 ${expectedType} 不兼容`
      );
    }
  }

  private extractParamsSchemaProperties(
    paramsSchema?: Record<string, unknown>
  ): Record<string, unknown> {
    const schema = this.asRecord(paramsSchema);
    const properties = this.asRecord(schema?.properties);
    return properties || {};
  }

  private extractRequiredParamsSchemaKeys(paramsSchema?: Record<string, unknown>): string[] {
    const schema = this.asRecord(paramsSchema);
    return Array.isArray(schema?.required)
      ? schema.required.map((item) => String(item || '').trim()).filter((item) => item.length > 0)
      : [];
  }

  private extractDeclaredParamsSchemaKeys(paramsSchema?: Record<string, unknown>): string[] {
    return Object.keys(this.extractParamsSchemaProperties(paramsSchema));
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
    testUserInput?: string
  ) {
    const template = await this.getTemplate(id);
    if (!template) {
      throw new Error('Template not found');
    }

    return this.executionFlowValidationService.validateResolvedTemplate(
      id,
      template,
      aiServiceUrl,
      testParams,
      enableExecutionTest,
      testUserInput
    );
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

    return templates
      .map((t) => this.mapTemplateToDTO(t))
      .filter(Boolean) as ExecutionFlowTemplateDTO[];
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
      count: Number(counts.find((c) => c.category === key)?.count || 0),
    }));
  }

  /**
   * 复制模板（创建副本）
   */
  async cloneTemplate(
    id: string,
    newName: string,
    createdBy?: string
  ): Promise<ExecutionFlowTemplateDTO> {
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

    return JSON.stringify(
      {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        template: {
          name: template.name,
          description: template.description || undefined,
          category: template.category,
          steps: template.steps,
          executionFlowKeys: template.executionFlowKeys,
        },
      },
      null,
      2
    );
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
    const improvedExecutionFlowKeys =
      autoAdjustment.executionFlowKeys || autoAdjustment['触发关键词'];

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

}
