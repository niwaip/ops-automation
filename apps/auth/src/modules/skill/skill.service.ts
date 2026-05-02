/**
 * Skill Service
 * Skill配置管理服务 - 支持权限管控和AI语义匹配
 */

import { Injectable, Logger, OnModuleInit, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SkillConfigDto,
  CreateSkillDTO,
  SkillMatchResult,
  SkillPermissionDTO,
  AIMatchResponse,
  SkillValidationResult,
  LLMUsage,
  SkillToolBinding,
  SkillToolValidationMessage,
  SkillToolValidationResult,
} from './interfaces';
import axios from 'axios';
import { ExecutionFlowTemplateService } from '../execution-flow/execution-flow.service';
import { ToolCatalogService } from './tool-catalog.service';

// UUID验证正则表达式
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * 验证字符串是否为有效的UUID格式
 */
function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

// AI Orchestrator 服务地址
const getAiOrchestratorUrl = () => {
  if (process.env.AI_ORCHESTRATOR_URL) {
    return process.env.AI_ORCHESTRATOR_URL;
  }
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return 'http://ops-ai-orchestrator:3007';  // Docker 内部通信使用服务名
  }
  // 本地开发：使用外部访问地址（如果设置）或 localhost
  const externalHost = process.env.EXTERNAL_HOST || 'localhost';
  return `http://${externalHost}:3007`;
};

type SkillValidationStreamEvent = {
  type: 'stage' | 'log' | 'result' | 'error';
  content: string;
  data?: Record<string, unknown>;
};

type SkillValidationEmitter = (event: SkillValidationStreamEvent) => void;

type PublishedSkillReleaseMeta = {
  skillId: string;
  releaseId: string;
  releaseVersion: number;
  status: string;
  deploymentStatus: string;
  sourceType: string;
};

/**
 * 默认Skill配置
 */
const DEFAULT_SKILLS: CreateSkillDTO[] = [
  {
    name: '保密合同生成',
    description: '生成保密协议/NDA文档',
    triggerKeywords: ['保密', 'NDA', '保密协议', '保密合同', '机密', '保密条款'],
    paramsSchema: {
      properties: {
        甲方名称: {
          type: 'string',
          description: '甲方公司名称',
          required: true,
          extractionPrompt: '从"甲方"、"甲方名称"、"甲方公司"等关键词后提取',
        },
        甲方地址: {
          type: 'string',
          description: '甲方公司地址',
          required: false,
        },
        乙方名称: {
          type: 'string',
          description: '乙方公司名称',
          required: true,
          extractionPrompt: '从"乙方"、"乙方名称"、"乙方公司"等关键词后提取',
        },
        乙方地址: {
          type: 'string',
          description: '乙方公司地址',
          required: false,
        },
        签订日期: {
          type: 'date',
          description: '合同签订日期',
          required: true,
        },
        保密期限: {
          type: 'string',
          description: '保密期限（如：3年、永久）',
          required: false,
          default: '3年',
        },
        保密范围: {
          type: 'string',
          description: '保密内容范围描述',
          required: false,
          default: '技术资料、商业信息、客户数据等',
        },
      },
      required: ['甲方名称', '乙方名称', '签订日期'],
    },
    apiEndpoints: {
      runtimeMetadata: {
        sourceType: 'document',
      },
    },
    executionFlow: [
      { type: 'tool', name: 'AI语义匹配', tool: { name: 'skill_match' } },
      { type: 'tool', name: 'AI生成参数', tool: { name: 'generate_parameters' } },
      { type: 'tool', name: '用户确认', tool: { name: 'user_ask' } },
      { type: 'tool', name: '文档渲染', tool: { name: 'document_render' } },
    ],
    tools: ['skill_match', 'generate_parameters', 'user_ask', 'document_render'],
  },
  {
    name: '劳动合同生成',
    description: '生成劳动合同文档',
    triggerKeywords: ['劳动合同', '雇佣合同', '入职合同', '员工合同', '劳动合同书'],
    paramsSchema: {
      properties: {
        用人单位名称: {
          type: 'string',
          description: '用人单位/公司名称',
          required: true,
        },
        劳动者姓名: {
          type: 'string',
          description: '员工姓名',
          required: true,
        },
        劳动者身份证号: {
          type: 'string',
          description: '员工身份证号码',
          required: true,
        },
        劳动者地址: {
          type: 'string',
          description: '员工住址',
          required: false,
        },
        合同期限: {
          type: 'string',
          description: '劳动合同期限（如：3年）',
          required: true,
        },
        工作岗位: {
          type: 'string',
          description: '工作岗位名称',
          required: true,
        },
        工作地点: {
          type: 'string',
          description: '工作地点',
          required: false,
        },
        月薪: {
          type: 'number',
          description: '月薪金额',
          required: true,
        },
        签订日期: {
          type: 'date',
          description: '合同签订日期',
          required: true,
        },
      },
      required: ['用人单位名称', '劳动者姓名', '劳动者身份证号', '合同期限', '工作岗位', '月薪', '签订日期'],
    },
    apiEndpoints: {
      runtimeMetadata: {
        sourceType: 'document',
      },
    },
    executionFlow: [
      { type: 'tool', name: '收集参数', tool: { name: 'param_collect' } },
      { type: 'tool', name: '用户确认', tool: { name: 'user_ask' } },
      { type: 'tool', name: '渲染输出', tool: { name: 'document_generate' } },
    ],
    tools: ['param_collect', 'user_ask', 'document_generate'],
  },
];

@Injectable()
export class SkillService implements OnModuleInit {
  private readonly logger = new Logger(SkillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionFlowService: ExecutionFlowTemplateService,
    private readonly toolCatalogService: ToolCatalogService,
  ) {}

  private logStructured(
    level: 'log' | 'warn' | 'error',
    event: string,
    payload: Record<string, unknown>,
  ): void {
    const message = JSON.stringify({
      event,
      module: SkillService.name,
      ...payload,
    });

    if (level === 'error') {
      this.logger.error(message);
      return;
    }
    if (level === 'warn') {
      this.logger.warn(message);
      return;
    }
    this.logger.log(message);
  }

  /**
   * 模块初始化时加载默认Skills
   */
  async onModuleInit() {
    this.logStructured('log', 'skill_service_init_started', {
      defaultSkillCount: DEFAULT_SKILLS.length,
    });
    await this.toolCatalogService.ensureInfrastructure();
    await this.ensureSystemRoles();
    await this.toolCatalogService.seedSystemCatalog();
    await this.validateDefaultSkillsStartupConsistency();
    await this.loadDefaultSkills();
    this.logStructured('log', 'skill_service_init_completed', {
      defaultSkillCount: DEFAULT_SKILLS.length,
    });
  }

  /**
   * 确保基础系统角色存在，避免权限分配时出现“角色映射缺失”
   */
  private async ensureSystemRoles(): Promise<void> {
    const systemRoles: Array<{
      name: string;
      description: string;
      permissions: Record<string, boolean>;
    }> = [
      {
        name: 'employee',
        description: '普通员工角色',
        permissions: {},
      },
      {
        name: 'agent',
        description: '自动化代理角色',
        permissions: {
          replay_start: true,
          replay_stop: true,
          agent_create: true,
        },
      },
      {
        name: 'admin',
        description: '系统管理员角色',
        permissions: {
          all_skills: true,
        },
      },
    ];

    for (const role of systemRoles) {
      await this.prisma.role.upsert({
        where: { name: role.name },
        update: {
          isSystem: true,
        },
        create: {
          name: role.name,
          description: role.description,
          permissions: role.permissions as any,
          isSystem: true,
        },
      });
    }
  }

  /**
   * 加载默认Skills（如果不存在）
   */
  private async loadDefaultSkills() {
    for (const skill of DEFAULT_SKILLS) {
      try {
        const existing = await this.prisma.skillConfig.findUnique({
          where: { name: skill.name },
        });

        if (!existing) {
          await this.createSkill(skill);
          this.logStructured('log', 'default_skill_created', {
            skillName: skill.name,
            triggerKeywordCount: skill.triggerKeywords.length,
            declaredTools: this.normalizeToolNames(skill.tools),
            flowTools: this.extractToolNamesFromExecutionFlow(skill.executionFlow as any[]),
          });
        } else {
          // 同步默认技能的核心配置，防止被误修改或丢失
          const shouldSyncParams = !existing.paramsSchema ||
            Object.keys((existing.paramsSchema as any).properties || {}).length === 0;

          const existingFlowTemplateIds = (existing.executionFlowTemplateIds as string[]) || [];

          if (shouldSyncParams) {
            await this.prisma.skillConfig.update({
              where: { id: existing.id },
              data: {
                paramsSchema: skill.paramsSchema as any,
                triggerKeywords: (existing.triggerKeywords as any[] || []).length === 0 ? skill.triggerKeywords : (existing.triggerKeywords as any[]),
                executionFlowTemplateIds: existingFlowTemplateIds,
              },
            });
            this.logStructured('log', 'default_skill_synced', {
              skillName: skill.name,
              skillId: existing.id,
              syncedFields: ['paramsSchema', 'triggerKeywords', 'executionFlowTemplateIds'],
            });
          }
        }
      } catch (error) {
        const validation = await this.buildSkillToolValidation(skill).catch(() => null);
        this.logStructured('error', 'default_skill_ensure_failed', {
          skillName: skill.name,
          declaredTools: this.normalizeToolNames(skill.tools),
          flowTools: this.extractToolNamesFromExecutionFlow(skill.executionFlow as any[]),
          validation: validation
            ? {
                isValid: validation.isValid,
                missingTools: validation.missingTools,
                disabledTools: validation.disabledTools,
                forbiddenSkillTools: validation.forbiddenSkillTools,
                undeclaredFlowTools: validation.undeclaredFlowTools,
                messages: validation.messages.map((item) => ({
                  code: item.code,
                  severity: item.severity,
                  toolName: item.toolName,
                  message: item.message,
                })),
              }
            : null,
          errorMessage: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  }

  private async validateDefaultSkillsStartupConsistency(): Promise<void> {
    for (const skill of DEFAULT_SKILLS) {
      const declaredTools = this.normalizeToolNames(skill.tools);
      const flowTools = this.extractToolNamesFromExecutionFlow(skill.executionFlow as any[]);
      const validation = await this.buildSkillToolValidation(skill);
      const payload = {
        skillName: skill.name,
        declaredTools,
        flowTools,
        inferredTools: validation.inferredTools,
        missingTools: validation.missingTools,
        disabledTools: validation.disabledTools,
        forbiddenSkillTools: validation.forbiddenSkillTools,
        undeclaredFlowTools: validation.undeclaredFlowTools,
        isValid: validation.isValid,
      };

      if (validation.isValid) {
        this.logStructured('log', 'default_skill_startup_validation_passed', payload);
        continue;
      }

      this.logStructured('error', 'default_skill_startup_validation_failed', {
        ...payload,
        messages: validation.messages.map((item) => ({
          code: item.code,
          severity: item.severity,
          toolName: item.toolName,
          message: item.message,
        })),
      });
    }
  }

  private normalizeToolNames(toolNames?: string[]): string[] {
    return Array.from(new Set((toolNames || []).map((item) => String(item || '').trim()).filter(Boolean)));
  }

  private extractToolNamesFromExecutionFlow(executionFlow?: Array<Record<string, any>>): string[] {
    if (!Array.isArray(executionFlow)) {
      return [];
    }

    const inferred = executionFlow.flatMap((step) => {
      if (!step || typeof step !== 'object') {
        return [];
      }
      if (step.type === 'api') {
        return ['api_call'];
      }
      return typeof step?.tool?.name === 'string' ? [step.tool.name] : [];
    });

    return this.normalizeToolNames(inferred);
  }

  private async inferToolNamesFromTemplates(templateIds?: string[]): Promise<string[]> {
    const inferred = new Set<string>();
    const normalizedTemplateIds = this.normalizeToolNames(templateIds);

    if (normalizedTemplateIds.length === 0) {
      return [];
    }

    inferred.add('flow_execute');

    for (const templateId of normalizedTemplateIds) {
      const template = await this.executionFlowService.getTemplate(templateId);
      if (!template) {
        continue;
      }
      for (const step of template.steps || []) {
        if (step?.type === 'api') {
          inferred.add('api_call');
        }
        if (step?.tool?.name) {
          inferred.add(step.tool.name);
        }
      }
    }

    return Array.from(inferred);
  }

  private async buildSkillToolValidation(
    payload: Pick<CreateSkillDTO, 'tools' | 'executionFlow' | 'executionFlowTemplateIds'>,
  ): Promise<SkillToolValidationResult> {
    const declaredTools = this.normalizeToolNames(payload.tools);
    const inferredFromFlow = this.extractToolNamesFromExecutionFlow(payload.executionFlow as any[]);
    const inferredFromTemplates = await this.inferToolNamesFromTemplates(payload.executionFlowTemplateIds);
    const inferredTools = this.normalizeToolNames([...inferredFromFlow, ...inferredFromTemplates]);
    const effectiveTools = this.normalizeToolNames([...declaredTools, ...inferredTools]);

    const catalogMap = await this.toolCatalogService.getCatalogItemsByNames(effectiveTools);
    const missingTools = effectiveTools.filter((toolName) => !catalogMap.has(toolName));
    const disabledTools = effectiveTools.filter((toolName) => catalogMap.get(toolName)?.status !== 'active');
    const forbiddenSkillTools = declaredTools.filter((toolName) => {
      const tool = catalogMap.get(toolName);
      return tool ? !tool.allowSkillBinding : false;
    });
    const undeclaredFlowTools = inferredTools.filter((toolName) => !declaredTools.includes(toolName));

    const messages: SkillToolValidationMessage[] = [];
    missingTools.forEach((toolName) => {
      messages.push({
        code: 'tool_not_registered_in_catalog',
        toolName,
        severity: 'error',
        message: `工具 "${toolName}" 未注册到工具目录中`,
      });
    });
    disabledTools.forEach((toolName) => {
      messages.push({
        code: 'tool_disabled',
        toolName,
        severity: 'error',
        message: `工具 "${toolName}" 当前已被禁用`,
      });
    });
    forbiddenSkillTools.forEach((toolName) => {
      messages.push({
        code: 'tool_binding_forbidden',
        toolName,
        severity: 'error',
        message: `工具 "${toolName}" 不允许被 Skill 绑定`,
      });
    });
    undeclaredFlowTools.forEach((toolName) => {
      messages.push({
        code: 'undeclared_flow_tool',
        toolName,
        severity: 'error',
        message: `执行流中推导出了工具 "${toolName}"，但 Skill.tools 未显式声明该工具`,
      });
    });

    return {
      isValid: messages.every((item) => item.severity !== 'error'),
      declaredTools,
      inferredTools,
      effectiveTools,
      missingTools,
      disabledTools,
      forbiddenSkillTools,
      undeclaredFlowTools,
      messages,
    };
  }

  private async syncSkillToolBindings(
    skillId: string,
    payload: Pick<CreateSkillDTO, 'tools' | 'executionFlow' | 'executionFlowTemplateIds'>,
  ): Promise<void> {
    const declaredTools = this.normalizeToolNames(payload.tools);
    const inferredFromFlow = this.extractToolNamesFromExecutionFlow(payload.executionFlow as any[]);
    const inferredFromTemplates = await this.inferToolNamesFromTemplates(payload.executionFlowTemplateIds);

    const bindingRows = [
      ...declaredTools.map((toolName) => ({ toolName, bindingSource: 'declared' })),
      ...this.normalizeToolNames([...inferredFromFlow, ...inferredFromTemplates])
        .filter((toolName) => !declaredTools.includes(toolName))
        .map((toolName) => ({
          toolName,
          bindingSource: toolName === 'flow_execute' ? 'system_required' : 'inferred_from_flow',
        })),
    ];

    await this.prisma.$executeRawUnsafe(
      `DELETE FROM skill_tool_bindings WHERE skill_id = $1::uuid`,
      skillId,
    );

    for (const row of bindingRows) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO skill_tool_bindings (
          id, skill_id, tool_name, binding_source, created_at, updated_at
        ) VALUES (
          $1::uuid, $2::uuid, $3, $4, now(), now()
        )`,
        randomUUID(),
        skillId,
        row.toolName,
        row.bindingSource,
      );
    }
  }

  private async getSkillToolBindingMap(skillIds: string[]): Promise<Map<string, SkillToolBinding[]>> {
    const uniqueSkillIds = Array.from(new Set(skillIds.filter((id) => isValidUUID(id))));
    if (uniqueSkillIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT skill_id, tool_name, binding_source
       FROM skill_tool_bindings
       WHERE skill_id = ANY($1::uuid[])
       ORDER BY tool_name ASC`,
      uniqueSkillIds,
    );

    const map = new Map<string, SkillToolBinding[]>();
    for (const row of rows) {
      const current = map.get(row.skill_id) || [];
      current.push({
        skillId: row.skill_id,
        toolName: row.tool_name,
        bindingSource: row.binding_source,
      });
      map.set(row.skill_id, current);
    }
    return map;
  }

  /**
   * 创建Skill
   */
  async createSkill(dto: CreateSkillDTO): Promise<SkillConfigDto> {
    const toolValidation = await this.buildSkillToolValidation(dto);
    if (!toolValidation.isValid) {
      throw new BadRequestException({
        message: 'Skill 工具校验失败',
        toolValidation,
      });
    }

    const skill = await this.prisma.skillConfig.create({
      data: {
        name: dto.name,
        description: dto.description,
        triggerKeywords: dto.triggerKeywords,
        paramsSchema: dto.paramsSchema as any,  // Cast to JSON for Prisma
        executionFlowTemplateIds: dto.executionFlowTemplateIds || [],
        apiEndpoints: dto.apiEndpoints as any,
        executionFlow: (dto.executionFlow || []) as any,
        tools: dto.tools || [],
        isActive: true,
      },
    });

    await this.prisma.$executeRawUnsafe(
      `UPDATE skill_configs
       SET config_status = 'valid',
           last_validation_summary = $2::jsonb,
           updated_at = now()
       WHERE id = $1::uuid`,
      skill.id,
      JSON.stringify(toolValidation),
    );
    await this.syncSkillToolBindings(skill.id, dto);
    return this.toDTO(skill);
  }

  /**
   * 获取所有Skills
   */
  async listSkills(): Promise<SkillConfigDto[]> {
    const skills = await this.prisma.skillConfig.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return this.enrichSkillsWithPublication(skills, { hideHistoricalPublishedVersions: true });
  }

  /**
   * 获取Skill详情
   */
  async getSkill(id: string): Promise<SkillConfigDto | null> {
    if (!isValidUUID(id)) {
      return null;
    }
    const skill = await this.prisma.skillConfig.findUnique({
      where: { id },
    });
    if (!skill) {
      return null;
    }
    const [enriched] = await this.enrichSkillsWithPublication([skill]);
    return enriched || null;
  }

  /**
   * 更新Skill
   */
  async updateSkill(id: string, dto: Partial<CreateSkillDTO>): Promise<SkillConfigDto | null> {
    if (!isValidUUID(id)) {
      return null;
    }
    try {
      const current = await this.prisma.skillConfig.findUnique({
        where: { id },
      });
      if (!current) {
        return null;
      }

      const mergedPayload: CreateSkillDTO = {
        name: dto.name ?? current.name,
        description: dto.description ?? current.description ?? '',
        triggerKeywords: dto.triggerKeywords ?? (current.triggerKeywords as string[]),
        paramsSchema: (dto.paramsSchema ?? current.paramsSchema) as any,
        executionFlowTemplateIds: dto.executionFlowTemplateIds ?? ((current.executionFlowTemplateIds as string[]) || []),
        executionFlow: (dto.executionFlow ?? (current.executionFlow as any[]) ?? []) as any,
        tools: dto.tools ?? ((current.tools as string[]) || []),
        apiEndpoints: (dto.apiEndpoints ?? current.apiEndpoints) as any,
      };

      const toolValidation = await this.buildSkillToolValidation(mergedPayload);
      if (!toolValidation.isValid) {
        throw new BadRequestException({
          message: 'Skill 工具校验失败',
          toolValidation,
        });
      }

      const skill = await this.prisma.skillConfig.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          triggerKeywords: dto.triggerKeywords,
          paramsSchema: dto.paramsSchema as any, // Cast to JSON for Prisma
          executionFlowTemplateIds: dto.executionFlowTemplateIds,
          apiEndpoints: dto.apiEndpoints as any,
          executionFlow: (dto.executionFlow || []) as any,
          tools: dto.tools,
        },
      });

      await this.prisma.$executeRawUnsafe(
        `UPDATE skill_configs
         SET config_status = 'valid',
             last_validation_summary = $2::jsonb,
             updated_at = now()
         WHERE id = $1::uuid`,
        id,
        JSON.stringify(toolValidation),
      );
      await this.syncSkillToolBindings(id, mergedPayload);
      return this.toDTO(skill);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (message.includes('Record to update not found')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * 删除Skill
   */
  async deleteSkill(id: string): Promise<boolean> {
    if (!isValidUUID(id)) {
      return false;
    }
    const skill = await this.prisma.skillConfig.findUnique({
      where: { id },
    });
    if (!skill) {
      return false;
    }

    const [executionCount, publishedReleaseRefs] = await Promise.all([
      this.prisma.execution.count({
        where: { skillId: id },
      }),
      this.prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
        `SELECT COUNT(*)::int AS count
         FROM capability_releases
         WHERE published_skill_id = $1::uuid
           AND archived_at IS NULL`,
        id,
      ),
    ]);

    const releaseRefCount = Number(publishedReleaseRefs[0]?.count || 0);
    const hasRuntimeReferences = executionCount > 0 || releaseRefCount > 0;

    if (hasRuntimeReferences) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE skill_configs
         SET is_active = false,
             config_status = 'archived',
             updated_at = now()
         WHERE id = $1::uuid`,
        id,
      );

      this.logger.warn(
        `Skill ${id} has runtime references (executions=${executionCount}, releases=${releaseRefCount}), archived instead of hard delete`,
      );
      return true;
    }

    await this.prisma.skillConfig.delete({
      where: { id },
    });

    return true;
  }

  /**
   * 匹配Skill
   */
  async matchSkill(userInput: string): Promise<SkillMatchResult | null> {
    const skills = await this.listSkills();
    let bestMatch: SkillConfigDto | null = null;
    let bestScore = 0;
    const matchedKeywords: string[] = [];

    // 关键词匹配
    for (const skill of skills) {
      const keywords = skill.triggerKeywords;
      let score = 0;
      const matched: string[] = [];

      for (const keyword of keywords) {
        if (userInput.toLowerCase().includes(keyword.toLowerCase())) {
          score += 1;
          matched.push(keyword);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = skill;
        matchedKeywords.length = 0;
        matchedKeywords.push(...matched);
      }
    }

    if (bestMatch) {
      // 计算置信度
      const confidence = Math.min(bestScore / bestMatch.triggerKeywords.length, 1);
      const { collectedParams, missingParams } = this.extractParamsFromUserInput(bestMatch, userInput);

      return {
        skillId: bestMatch.id,
        skillName: bestMatch.name,
        matchedKeywords,
        confidence,
        collectedParams,
        missingParams,
        paramsSchema: bestMatch.paramsSchema,
        executionFlowTemplateIds: bestMatch.executionFlowTemplateIds,
        apiEndpoints: bestMatch.apiEndpoints,
        goal: bestMatch.apiEndpoints?.runtimeMetadata?.goal,
        expectedResult: bestMatch.apiEndpoints?.runtimeMetadata?.expectedResult,
        outputParams: bestMatch.apiEndpoints?.runtimeMetadata?.outputParams,
      };
    }

    return null;
  }

  /**
   * 获取用户可访问的Skills（基于角色权限）
   */
  async listSkillsForUser(userId: string): Promise<SkillConfigDto[]> {
    // 0. 验证userId是否为有效的UUID格式（anonymous等非UUID用户返回空列表）
    if (!isValidUUID(userId)) {
      this.logger.warn(`Invalid userId format: ${userId}, returning empty skills list`);
      return [];
    }

    // 1. 获取用户信息（包含直接角色属性）
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    // 2. 直接检查用户角色属性（兼容旧的 role 字段）
    if (user && user.role === 'admin') {
      return this.listSkills();
    }

    // 3. 获取用户的所有角色关联
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });

    const roleIds = userRoles.map((ur: any) => ur.roleId);
    const roleNames = new Set(userRoles.map((ur: any) => ur.role?.name).filter(Boolean));

    // 4. 检查用户是否是 admin（通过角色关联）
    const isAdmin = userRoles.some((ur: any) => ur.role.name === 'admin' ||
      (ur.role.permissions as Record<string, boolean>)?.['all_skills'] === true);

    if (isAdmin) {
      // Admin 可访问所有 Skills
      return this.listSkills();
    }

    // 兼容历史数据：user_roles 为空时，回退到 users.role 字段
    if (user?.role && !roleNames.has(user.role)) {
      const fallbackRole = await this.prisma.role.findUnique({
        where: { name: user.role },
        select: { id: true, name: true, permissions: true },
      });

      if (fallbackRole) {
        roleIds.push(fallbackRole.id);
        roleNames.add(fallbackRole.name);
      }
    }

    if (roleNames.has('admin')) {
      return this.listSkills();
    }

    // 5. 如果用户仍然没有可识别角色，返回空列表
    if (roleIds.length === 0) {
      return [];
    }

    // 6. 获取用户角色有权限的 Skills
    const skillPermissions = await this.prisma.skillPermission.findMany({
      where: { roleId: { in: roleIds } },
      include: { skill: true },
    });

    // 5. 去重并返回活跃的 Skills
    const uniqueSkillIds = new Set<string>();
    const skills = [];

    for (const perm of skillPermissions as any[]) {
      if (!uniqueSkillIds.has(perm.skillId) && perm.skill.isActive) {
        uniqueSkillIds.add(perm.skillId);
        skills.push(perm.skill);
      }
    }

    const enrichedSkills = await this.enrichSkillsWithPublication(skills);
    return enrichedSkills.filter((skill) => skill.isPublished);
  }

  /**
   * 检查用户是否有权限使用某 Skill
   */
  async checkUserSkillPermission(userId: string, skillId: string): Promise<boolean> {
    // 验证userId和skillId是否为有效的UUID格式
    if (!isValidUUID(userId) || !isValidUUID(skillId)) {
      return false;
    }

    // 1. 获取用户信息（兼容旧的直接 role 字段）
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (user?.role === 'admin') {
      return true;
    }

    // 2. 获取用户的所有角色
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });

    // 3. Admin 默认有权限
    const isAdmin = userRoles.some((ur: any) => ur.role.name === 'admin' ||
      (ur.role.permissions as Record<string, boolean>)?.['all_skills'] === true);
    if (isAdmin) {
      return true;
    }

    // 4. 检查 Skill 是否存在且活跃
    const skill = await this.prisma.skillConfig.findUnique({
      where: { id: skillId },
    });
    if (!skill || !skill.isActive) {
      return false;
    }

    const publication = await this.getPublishedReleaseMap([skillId]);
    if (!publication.has(skillId)) {
      return false;
    }

    // 5. 检查用户角色是否有权限
    const roleIds = userRoles.map((ur: any) => ur.roleId);
    const roleNames = new Set(userRoles.map((ur: any) => ur.role?.name).filter(Boolean));

    // 兼容历史数据：user_roles 为空时，回退到 users.role 字段
    if (user?.role && !roleNames.has(user.role)) {
      const fallbackRole = await this.prisma.role.findUnique({
        where: { name: user.role },
        select: { id: true, name: true, permissions: true },
      });
      if (fallbackRole) {
        roleIds.push(fallbackRole.id);
      }
    }

    const permission = await this.prisma.skillPermission.findFirst({
      where: {
        skillId,
        roleId: { in: roleIds },
      },
    });

    return !!permission;
  }

  /**
   * 授权 Skill 给角色
   */
  async grantSkillToRole(skillId: string, roleId: string, grantedBy: string): Promise<SkillPermissionDTO> {
    // 验证 UUID 格式
    if (!isValidUUID(skillId)) {
      throw new ForbiddenException('Invalid skillId format');
    }
    if (!isValidUUID(roleId)) {
      throw new ForbiddenException('Invalid roleId format');
    }

    // 检查 Skill 和 Role 是否存在
    const skill = await this.prisma.skillConfig.findUnique({ where: { id: skillId } });
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (!skill.isActive) {
      throw new BadRequestException('当前 Skill 已停用，不能分配权限');
    }

    const publication = await this.getPublishedReleaseMap([skillId]);
    if (!publication.has(skillId)) {
      throw new BadRequestException('只有已公开发布的 Skill 才能分配给普通用户使用');
    }

    // 创建权限（如果已存在则更新）
    const permission = await this.prisma.skillPermission.upsert({
      where: {
        skillId_roleId: { skillId, roleId },
      },
      update: {
        grantedAt: new Date(),
        grantedBy,
      },
      create: {
        skillId,
        roleId,
        grantedBy,
      },
    });

    return {
      skillId: permission.skillId,
      skillName: skill.name,
      roleId: permission.roleId,
      roleName: role.name,
      grantedAt: permission.grantedAt,
      grantedBy: permission.grantedBy,
    };
  }

  /**
   * 撤销角色的 Skill 权限
   */
  async revokeSkillFromRole(skillId: string, roleId: string): Promise<boolean> {
    const result = await this.prisma.skillPermission.delete({
      where: {
        skillId_roleId: { skillId, roleId },
      },
    });

    return !!result;
  }

  /**
   * 获取 Skill 的所有权限分配
   */
  async getSkillPermissions(skillId: string): Promise<SkillPermissionDTO[]> {
    const permissions = await this.prisma.skillPermission.findMany({
      where: { skillId },
      include: { skill: true, role: true },
    });

    return permissions.map((perm: any) => ({
      skillId: perm.skillId,
      skillName: perm.skill.name,
      roleId: perm.roleId,
      roleName: perm.role.name,
      grantedAt: perm.grantedAt,
      grantedBy: perm.grantedBy,
    }));
  }

  async getSkillToolBindings(skillId: string): Promise<{
    bindings: SkillToolBinding[];
    validation: SkillToolValidationResult;
  }> {
    const skill = await this.getSkill(skillId);
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    const bindingsMap = await this.getSkillToolBindingMap([skillId]);
    const bindings = bindingsMap.get(skillId) || [];
    const validation = await this.buildSkillToolValidation({
      tools: skill.tools,
      executionFlow: skill.executionFlow,
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
    });

    return { bindings, validation };
  }

  async setSkillToolBindings(skillId: string, tools: string[]): Promise<{
    bindings: SkillToolBinding[];
    validation: SkillToolValidationResult;
  }> {
    const skill = await this.getSkill(skillId);
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    const mergedPayload: CreateSkillDTO = {
      name: skill.name,
      description: skill.description,
      triggerKeywords: skill.triggerKeywords,
      paramsSchema: skill.paramsSchema,
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
      executionFlow: skill.executionFlow,
      tools,
      apiEndpoints: skill.apiEndpoints,
    };

    const validation = await this.buildSkillToolValidation(mergedPayload);
    if (!validation.isValid) {
      throw new BadRequestException({
        message: 'Skill 工具校验失败',
        toolValidation: validation,
      });
    }

    await this.prisma.skillConfig.update({
      where: { id: skillId },
      data: {
        tools,
      },
    });
    await this.prisma.$executeRawUnsafe(
      `UPDATE skill_configs
       SET config_status = 'valid',
           last_validation_summary = $2::jsonb,
           updated_at = now()
       WHERE id = $1::uuid`,
      skillId,
      JSON.stringify(validation),
    );
    await this.syncSkillToolBindings(skillId, mergedPayload);

    const bindingsMap = await this.getSkillToolBindingMap([skillId]);
    return {
      bindings: bindingsMap.get(skillId) || [],
      validation,
    };
  }

  async validateSkillTools(skillId: string): Promise<SkillToolValidationResult> {
    const skill = await this.getSkill(skillId);
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    const validation = await this.buildSkillToolValidation({
      tools: skill.tools,
      executionFlow: skill.executionFlow,
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
    });

    await this.prisma.$executeRawUnsafe(
      `UPDATE skill_configs
       SET config_status = $2,
           last_validation_summary = $3::jsonb,
           updated_at = now()
       WHERE id = $1::uuid`,
      skillId,
      validation.isValid ? 'valid' : 'invalid',
      JSON.stringify(validation),
    );

    return validation;
  }

  async validateSkillToolsPayload(
    payload: Pick<CreateSkillDTO, 'tools' | 'executionFlow' | 'executionFlowTemplateIds'>,
  ): Promise<SkillToolValidationResult> {
    return this.buildSkillToolValidation(payload);
  }

  /**
   * AI 语义匹配 Skill（带权限过滤）
   */
  async matchSkillWithAI(
    userInput: string,
    userId: string,
  ): Promise<SkillMatchResult | null> {
    // 1. 获取用户可访问的 Skills
    const availableSkills = await this.listSkillsForUser(userId);

    if (availableSkills.length === 0) {
      this.logger.warn(`User ${userId} has no available skills`);
      return null;
    }

    // 2. 构建 Skills Prompt XML（类似 Crush）
    const skillsXml = this.buildSkillsPromptXml(availableSkills);

    // 3. 构建 AI Prompt
    const prompt = `你是一个技能匹配助手。根据用户输入，从可用技能中选择最匹配的一个。

可用技能：
${skillsXml}

用户输入：${userInput}

请分析用户意图，返回最匹配的技能信息。如果没有任何技能匹配，返回 null。

请严格按照以下 JSON 格式返回（不要添加任何其他文字）：
{
  "matchedSkill": "技能名称或null",
  "confidence": 0.0到1.0之间的数字,
  "reason": "匹配原因简述"
}`;

    // 4. 调用 AI Orchestrator 进行语义匹配
    try {
      const aiOrchestratorUrl = getAiOrchestratorUrl();
      const response = await axios.post<{
        result: string;
        usage?: LLMUsage;
        debug?: {
          modelId: string;
          requestMessages: Array<{ role: 'user'; content: string }>;
          responseText: string;
        };
      }>(`${aiOrchestratorUrl}/ai/model/call`, {
        modelId: 'default',
        prompt,
        includeDebug: true,
      });

      const aiResponse = this.parseAiMatchResponse(response.data.result, availableSkills);

      if (aiResponse) {
        const matchedSkill = availableSkills.find(s => s.name === aiResponse.matchedSkill);
        if (matchedSkill) {
          const { collectedParams, missingParams } = this.extractParamsFromUserInput(matchedSkill, userInput);
          return {
            skillId: matchedSkill.id,
            skillName: matchedSkill.name,
            matchedKeywords: [], // AI 匹配不依赖关键词
            confidence: aiResponse.confidence,
            matchReason: aiResponse.reason,
            collectedParams,
            missingParams,
            paramsSchema: matchedSkill.paramsSchema,
            executionFlowTemplateIds: matchedSkill.executionFlowTemplateIds,  // 新增
            apiEndpoints: matchedSkill.apiEndpoints,
            goal: matchedSkill.apiEndpoints?.runtimeMetadata?.goal,
            expectedResult: matchedSkill.apiEndpoints?.runtimeMetadata?.expectedResult,
            outputParams: matchedSkill.apiEndpoints?.runtimeMetadata?.outputParams,
            usage: response.data.usage,
            debug: {
              llmCalls: response.data.debug ? [
                {
                  stage: 'skills-match',
                  label: '技能匹配',
                  modelId: response.data.debug.modelId,
                  requestMessages: response.data.debug.requestMessages,
                  responseText: response.data.debug.responseText,
                },
              ] : [],
            },
          };
        }
      }

      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`AI match failed: ${errorMsg}`);
      // AI 匹配失败时，回退到关键词匹配（但仅限于用户可访问的 Skills）
      return this.matchSkillFallback(userInput, availableSkills);
    }
  }

  /**
   * 构建 Skills Prompt XML
   */
  private buildSkillsPromptXml(skills: SkillConfigDto[]): string {
    const getMatchSummary = (skill: SkillConfigDto): string => {
      const runtimeMetadata = skill.apiEndpoints?.runtimeMetadata as Record<string, unknown> | undefined;
      const matchSummary = typeof runtimeMetadata?.matchSummary === 'string'
        ? runtimeMetadata.matchSummary.trim()
        : '';
      return matchSummary || skill.description || '';
    };

    const lines = skills.map(s => `  <skill>
    <name>${s.name}</name>
    <description>${getMatchSummary(s)}</description>
  </skill>`).join('\n');
    return `<available_skills>\n${lines}\n</available_skills>`;
  }

  /**
   * 解析 AI 匹配响应
   */
  private parseAiMatchResponse(response: string, availableSkills: SkillConfigDto[]): AIMatchResponse | null {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // 验证匹配的 Skill 是否在可用列表中
        if (parsed.matchedSkill && parsed.matchedSkill !== 'null') {
          const skillExists = availableSkills.some(s => s.name === parsed.matchedSkill);
          if (!skillExists) {
            this.logger.warn(`AI matched skill "${parsed.matchedSkill}" not in available list`);
            return null;
          }
        }

        return {
          matchedSkill: parsed.matchedSkill === 'null' ? null : parsed.matchedSkill,
          confidence: parsed.confidence || 0,
          reason: parsed.reason || '',
        };
      }
    } catch (e) {
      this.logger.error(`Failed to parse AI response: ${response}`);
    }

    return null;
  }

  /**
   * 关键词匹配回退方案（仅限用户可访问的 Skills）
   */
  private matchSkillFallback(userInput: string, availableSkills: SkillConfigDto[]): SkillMatchResult | null {
    let bestMatch: SkillConfigDto | null = null;
    let bestScore = 0;
    const matchedKeywords: string[] = [];

    for (const skill of availableSkills) {
      const keywords = skill.triggerKeywords;
      let score = 0;
      const matched: string[] = [];

      for (const keyword of keywords) {
        if (userInput.toLowerCase().includes(keyword.toLowerCase())) {
          score += 1;
          matched.push(keyword);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = skill;
        matchedKeywords.length = 0;
        matchedKeywords.push(...matched);
      }
    }

    if (bestMatch) {
      const confidence = Math.min(bestScore / bestMatch.triggerKeywords.length, 1);
      const { collectedParams, missingParams } = this.extractParamsFromUserInput(bestMatch, userInput);

      return {
        skillId: bestMatch.id,
        skillName: bestMatch.name,
        matchedKeywords,
        confidence,
        collectedParams,
        missingParams,
        paramsSchema: bestMatch.paramsSchema,
        executionFlowTemplateIds: bestMatch.executionFlowTemplateIds,
        apiEndpoints: bestMatch.apiEndpoints,
        goal: bestMatch.apiEndpoints?.runtimeMetadata?.goal,
        expectedResult: bestMatch.apiEndpoints?.runtimeMetadata?.expectedResult,
        outputParams: bestMatch.apiEndpoints?.runtimeMetadata?.outputParams,
      };
    }

    return null;
  }

  /**
   * 获取所有角色列表（用于权限分配）
   */
  async listRoles(): Promise<{ id: string; name: string }[]> {
    await this.ensureSystemRoles();
    const roles = await this.prisma.role.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return roles;
  }

  private extractParamsFromUserInput(
    skill: SkillConfigDto,
    _userInput: string,
  ): { collectedParams: Record<string, unknown>; missingParams: string[] } {
    const collectedParams: Record<string, unknown> = {};
    const requiredParams = skill.paramsSchema?.required || [];

    const missingParams = requiredParams.filter((param) => {
      const value = collectedParams[param];
      return value === undefined || value === null || value === '';
    });

    return { collectedParams, missingParams };
  }

  /**
   * 转换为DTO
   */
  private async enrichSkillsWithPublication(
    skills: any[],
    options?: { hideHistoricalPublishedVersions?: boolean },
  ): Promise<SkillConfigDto[]> {
    if (!skills.length) {
      return [];
    }
    const skillIds = skills.map((skill) => skill.id);
    const publicationMap = await this.getPublishedReleaseMap(skillIds);
    const publishedBindingSet = await this.getPublishedSkillBindingSet(skillIds);
    const toolBindingMap = await this.getSkillToolBindingMap(skillIds);
    return skills
      .filter((skill) => {
        if (!options?.hideHistoricalPublishedVersions) {
          return true;
        }
        const isCurrentPublished = publicationMap.has(skill.id);
        const hasPublishedHistory = publishedBindingSet.has(skill.id);
        return isCurrentPublished || !hasPublishedHistory;
      })
      .map((skill) => this.toDTO(skill, publicationMap.get(skill.id), toolBindingMap.get(skill.id) || []));
  }

  private async getPublishedReleaseMap(skillIds: string[]): Promise<Map<string, PublishedSkillReleaseMeta>> {
    const rows = await this.getCurrentPublishedReleaseRows();

    return new Map(
      rows
        .filter((row) => skillIds.includes(row.published_skill_id))
        .map((row) => [
        row.published_skill_id,
        {
          skillId: row.published_skill_id,
          releaseId: row.id,
          releaseVersion: Number(row.release_version || 0),
          status: row.status,
          deploymentStatus: row.deployment_status,
          sourceType: row.source_type,
        } satisfies PublishedSkillReleaseMeta,
      ]),
    );
  }

  private async getPublishedSkillBindingSet(skillIds: string[]): Promise<Set<string>> {
    const uniqueSkillIds = Array.from(new Set(skillIds.filter((id) => isValidUUID(id))));
    if (uniqueSkillIds.length === 0) {
      return new Set();
    }

    const rows = await this.prisma.$queryRawUnsafe<Array<{ published_skill_id: string }>>(
      `SELECT DISTINCT published_skill_id
       FROM capability_releases
       WHERE archived_at IS NULL
         AND published_skill_id = ANY($1::uuid[])`,
      uniqueSkillIds,
    );

    return new Set(rows.map((row) => row.published_skill_id));
  }

  private async getCurrentPublishedReleaseRows(): Promise<any[]> {
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT DISTINCT ON (source_type, COALESCE(source_id::text, source_name, published_skill_id::text))
          published_skill_id,
          id,
          release_version,
          status,
          deployment_status,
          source_type,
          source_id,
          source_name,
          updated_at
       FROM capability_releases
       WHERE archived_at IS NULL
         AND published_skill_id IS NOT NULL
       ORDER BY source_type,
                COALESCE(source_id::text, source_name, published_skill_id::text),
                release_version DESC,
                updated_at DESC`
    );
  }

  private toDTO(
    skill: any,
    publication?: PublishedSkillReleaseMeta,
    bindings: SkillToolBinding[] = [],
  ): SkillConfigDto {
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      triggerKeywords: skill.triggerKeywords as string[],
      paramsSchema: skill.paramsSchema as any,
      executionFlowTemplateIds: (skill.executionFlowTemplateIds as string[]) || [],
      executionFlow: (skill.executionFlow as any[]) || [],
      tools: skill.tools as string[],
      effectiveTools: bindings.map((item) => item.toolName),
      apiEndpoints: skill.apiEndpoints ? {
        runtimeMetadata: (skill.apiEndpoints as any).runtimeMetadata
      } : undefined,
      isActive: skill.isActive,
      configStatus: skill.configStatus || skill.config_status || undefined,
      isPublished: Boolean(publication),
      publishedReleaseId: publication?.releaseId || null,
    };
  }

  /**
   * 验证Skill - AI完整验证（包含流程模板模拟执行）
   */
  async validateSkill(
    skillId: string,
    emit?: SkillValidationEmitter,
  ): Promise<SkillValidationResult> {
    const skill = await this.getSkill(skillId);
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

    // 1. 基础配置检查
    result.details!.configAnalysis.hasTriggerKeywords = skill.triggerKeywords.length > 0;
    result.details!.configAnalysis.hasParamsSchema = Object.keys(skill.paramsSchema.properties).length > 0;
    result.details!.configAnalysis.hasTemplate = !!skill.apiEndpoints?.runtimeMetadata?.sourceType;
    result.details!.configAnalysis.hasFlowTemplate = skill.executionFlowTemplateIds.length > 0;

    // 检查触发关键词质量
    if (skill.triggerKeywords.length < 3) {
      result.warnings.push('触发关键词数量较少，建议添加更多关键词以提高匹配准确度');
      result.score -= 10;
      result.details!.configAnalysis.triggerKeywordQuality = 'poor';
    } else if (skill.triggerKeywords.length >= 5) {
      result.details!.configAnalysis.triggerKeywordQuality = 'good';
    } else {
      result.details!.configAnalysis.triggerKeywordQuality = 'acceptable';
    }

    // 检查参数Schema完整性
    const requiredParams = skill.paramsSchema.required || [];
    if (requiredParams.length === 0) {
      result.warnings.push('没有必填参数，可能导致执行流程无法正确收集参数');
      result.score -= 5;
      result.details!.configAnalysis.paramsSchemaCompleteness = 'incomplete';
    } else {
      const hasAllDescriptions = requiredParams.every(
        param => skill.paramsSchema.properties[param]?.description
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

    // 2. 使用 ReAct AI 以“Skill 整体能力”进行模拟验证，而不是逐步骤逐个校验
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

    // 确保分数在有效范围
    result.score = Math.max(0, Math.min(100, result.score));
    if (result.score < 60) {
      result.isValid = false;
    }

    // 更新Skill的验证状态（保存到数据库）
    await this.prisma.skillConfig.update({
      where: { id: skillId },
      data: {
        // 可以在这里添加一个validation字段来保存验证结果
        // 但目前schema中没有这个字段，所以暂时不保存
      },
    });

    this.logger.log(`Validated skill ${skillId}: score=${result.score}, valid=${result.isValid}`);
    emit?.({
      type: 'result',
      content: 'Skill 验证完成',
      data: { validation: result as unknown as Record<string, unknown> },
    });
    return result;
  }

  /**
   * 使用 ReAct AI 对 Skill 作为一个完整能力进行模拟验证
   */
  private async simulateSkillWithReactAI(
    skill: SkillConfigDto,
    emit?: SkillValidationEmitter,
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
      const auditResult = await this.auditSkillWithAI(skill, simulatedRequest, executionTrace, emit);

      const issues = Array.isArray(auditResult?.issues) ? auditResult.issues.map(String) : [];
      const suggestions = Array.isArray(auditResult?.suggestions) ? auditResult.suggestions.map(String) : [];

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
    emit?: SkillValidationEmitter,
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

    const response = await axios.post(`${aiOrchestratorUrl}/ai/chat/stream`, {
      message: executionPrompt,
      userId: 'skill-validator',
      sessionId: `skill-exec-${skill.id}-${randomUUID()}`,
      modelId: 'default',
      config: {
        mode: 'task',
        maxIterations: 8,
        tools: ['flow_execute'],
      },
    }, { responseType: 'stream', timeout: 120000 });

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
    emit?: SkillValidationEmitter,
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
      JSON.stringify({
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
      }, null, 2),
    ].join('\n\n');

    const aiResponse = await axios.post(`${aiOrchestratorUrl}/ai/chat/stream`, {
      message: auditPrompt,
      sessionId: `skill-audit-${skill.id}-${randomUUID()}`,
      modelId: 'default',
      config: { mode: 'chat', maxIterations: 5 },
    }, { responseType: 'stream', timeout: 120000 });

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

  async applyGeneratedSkillAdjustment(
    id: string,
    generatedSkill?: Partial<SkillConfigDto>,
  ): Promise<SkillConfigDto | null> {
    const current = await this.getSkill(id);
    if (!current) {
      throw new NotFoundException('Skill not found');
    }

    if (!generatedSkill) {
      throw new Error('No generated skill suggestion provided');
    }

    return this.updateSkill(id, {
      name: generatedSkill.name || current.name,
      description: generatedSkill.description || current.description,
      triggerKeywords: generatedSkill.triggerKeywords || current.triggerKeywords,
      paramsSchema: generatedSkill.paramsSchema || current.paramsSchema,
      executionFlowTemplateIds: generatedSkill.executionFlowTemplateIds || current.executionFlowTemplateIds,
      executionFlow: generatedSkill.executionFlow || current.executionFlow,
      tools: generatedSkill.tools || current.tools,
      apiEndpoints: generatedSkill.apiEndpoints || current.apiEndpoints,
    });
  }

  private buildSampleRequest(skill: SkillConfigDto): string {
    const requiredParams = skill.paramsSchema?.required || [];

    if (requiredParams.length === 0) {
      return `请帮我执行“${skill.name}”`;
    }

    const sampleArgs = requiredParams
      .map((param) => `${param}为示例值`)
      .join('，');

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

  /**
   * 模拟文本步骤执行
   */
  private async simulateTextStep(step: any, skill: SkillConfigDto): Promise<{ success: boolean; output?: string; error?: string }> {
    if (!step.content) {
      return { success: false, error: '文本步骤缺少content内容' };
    }

    // 使用AI分析文本内容的合理性
    const prompt = `你是一个流程验证助手。请分析以下流程步骤的内容是否合理：

Skill名称: ${skill.name}
Skill描述: ${skill.description}
步骤名称: ${step.name}
步骤类型: 文本指导
步骤内容: ${step.content}

请判断：
1. 内容是否与Skill的目标相关
2. 内容是否清晰易懂
3. 是否有必要的指导信息

请返回JSON格式结果：
{
  "success": true或false,
  "analysis": "分析结果简述",
  "output": "模拟输出（如果success为true）"
}`;

    try {
      const aiOrchestratorUrl = getAiOrchestratorUrl();
      const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/ai/model/call`, {
        modelId: 'default',
        prompt,
      });

      const jsonMatch = response.data.result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: parsed.success,
          output: parsed.output || parsed.analysis,
          error: parsed.success ? undefined : parsed.analysis,
        };
      }
    } catch (error) {
      this.logger.warn(`Text step simulation failed: ${error}`);
    }

    // AI调用失败时，使用基础检查
    return {
      success: step.content.length > 10,
      output: '文本内容已验证',
      error: step.content.length > 10 ? undefined : '文本内容过短',
    };
  }

  /**
   * 模拟脚本步骤执行
   */
  private async simulateScriptStep(step: any, skill: SkillConfigDto): Promise<{ success: boolean; output?: string; error?: string }> {
    if (!step.script?.code) {
      return { success: false, error: '脚本步骤缺少code内容' };
    }

    // 使用AI分析脚本的安全性
    const prompt = `你是一个流程验证助手。请分析以下脚本步骤的安全性：

Skill名称: ${skill.name}
步骤名称: ${step.name}
脚本语言: ${step.script.language}
脚本代码: ${step.script.code}

请判断脚本是否：
1. 包含危险操作（如：rm -rf, sudo, chmod 777, curl | bash等）
2. 语法是否基本正确
3. 是否符合Skill的预期功能

请返回JSON格式结果：
{
  "success": true或false,
  "analysis": "分析结果简述",
  "output": "模拟输出（如果success为true）",
  "error": "错误信息（如果success为false）"
}`;

    try {
      const aiOrchestratorUrl = getAiOrchestratorUrl();
      const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/ai/model/call`, {
        modelId: 'default',
        prompt,
      });

      const jsonMatch = response.data.result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: parsed.success,
          output: parsed.output || parsed.analysis,
          error: parsed.success ? undefined : parsed.error || parsed.analysis,
        };
      }
    } catch (error) {
      this.logger.warn(`Script step simulation failed: ${error}`);
    }

    // 基础安全检查
    const dangerousPatterns = ['rm -rf', 'sudo', 'chmod 777', 'curl | bash', '> /dev/'];
    const hasDangerous = dangerousPatterns.some(p => step.script.code.includes(p));
    return {
      success: !hasDangerous,
      output: hasDangerous ? undefined : '脚本已通过安全检查',
      error: hasDangerous ? '脚本包含潜在危险操作' : undefined,
    };
  }

  /**
   * 模拟工具步骤执行
   */
  private async simulateToolStep(step: any, skill: SkillConfigDto): Promise<{ success: boolean; output?: string; error?: string }> {
    if (!step.tool?.name) {
      return { success: false, error: '工具步骤缺少tool.name' };
    }

    // 检查工具是否在Skill的tools列表中
    const toolAvailable = skill.tools.includes(step.tool.name);
    if (!toolAvailable) {
      return {
        success: false,
        error: `工具"${step.tool.name}"不在Skill可用工具列表中`,
      };
    }

    return {
      success: true,
      output: `工具"${step.tool.name}"模拟执行成功`,
    };
  }

  /**
   * 模拟API步骤执行
   */
  private async simulateApiStep(step: any, skill: SkillConfigDto): Promise<{ success: boolean; output?: string; error?: string }> {
    if (!step.api?.endpoint) {
      return { success: false, error: 'API步骤缺少endpoint' };
    }

    // 使用AI分析API配置的合理性
    const prompt = `你是一个流程验证助手。请分析以下API步骤的配置：

Skill名称: ${skill.name}
步骤名称: ${step.name}
API端点: ${step.api.endpoint}
API方法: ${step.api.method}
请求头: ${JSON.stringify(step.api.headers || {})}
请求体: ${JSON.stringify(step.api.body || {})}

请判断API配置是否：
1. endpoint格式是否合理（可以是相对路径或完整URL）
2. method是否正确（GET/POST/PUT/DELETE）
3. 是否有必要的认证信息（headers中的Authorization等）

请返回JSON格式结果：
{
  "success": true或false,
  "analysis": "分析结果简述",
  "output": "模拟输出（如果success为true）",
  "error": "错误信息（如果success为false）"
}`;

    try {
      const aiOrchestratorUrl = getAiOrchestratorUrl();
      const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/ai/model/call`, {
        modelId: 'default',
        prompt,
      });

      const jsonMatch = response.data.result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: parsed.success,
          output: parsed.output || parsed.analysis,
          error: parsed.success ? undefined : parsed.error || parsed.analysis,
        };
      }
    } catch (error) {
      this.logger.warn(`API step simulation failed: ${error}`);
    }

    // 基础检查
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    const methodValid = validMethods.includes(step.api.method);
    return {
      success: methodValid && step.api.endpoint.length > 0,
      output: 'API配置已验证',
      error: methodValid ? undefined : 'API方法无效',
    };
  }
}
