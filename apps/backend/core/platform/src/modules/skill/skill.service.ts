/**
 * Skill Service
 * Skill配置管理服务 - 支持权限管控和AI语义匹配
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SkillConfigDto,
  CreateSkillDTO,
  SkillMatchResult,
  SkillPermissionDTO,
  SkillValidationResult,
  SkillToolBinding,
  SkillToolValidationResult,
} from './interfaces';
import { ToolCatalogService } from './tool-catalog.service';
import { SkillToolBindingService } from './skill-tool-binding.service';
import { SkillEnrichmentService } from './skill-enrichment.service';
import { SkillAccessService } from './skill-access.service';
import { SkillMatcherService } from './skill-matcher.service';
import { SkillValidationEmitter, SkillValidationService } from './skill-validation.service';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

const DEFAULT_SKILLS: CreateSkillDTO[] = [
  {
    name: 'general_document_generator',
    description: '通用文档生成技能 - 根据模板和参数生成 Office 文档',
    triggerKeywords: ['生成文档', '创建报告', '导出Word', '生成Excel'],
    paramsSchema: {
      properties: {
        templateName: {
          type: 'string',
          description: '模板名称',
          required: true,
        },
        title: {
          type: 'string',
          description: '文档标题',
          required: true,
        },
        content: {
          type: 'string',
          description: '文档主要内容',
          required: true,
        },
      },
      required: ['templateName', 'title'],
    },
    tools: ['document_render'],
    executionFlow: [
      {
        id: 'step1',
        name: '渲染文档',
        type: 'tool',
        tool: { name: 'document_render' },
      },
    ],
  },
  {
    name: 'system_status_checker',
    description: '系统状态检查 - 检查当前自动化服务的健康状态',
    triggerKeywords: ['系统状态', '服务检查', '健康检查', 'status'],
    paramsSchema: {
      properties: {
        serviceName: {
          type: 'string',
          description: '指定检查的服务名称（可选）',
          required: false,
        },
      },
      required: [],
    },
    tools: ['api_call'],
    executionFlow: [
      {
        id: 'step1',
        name: '检查健康状态',
        type: 'api',
        api: {
          url: '/health',
          method: 'GET',
          description: '调用健康检查接口',
        },
      },
    ],
  },
];

@Injectable()
export class SkillService implements OnModuleInit {
  private readonly logger = new Logger(SkillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolCatalogService: ToolCatalogService,
    private readonly skillToolBindingService: SkillToolBindingService,
    private readonly skillEnrichmentService: SkillEnrichmentService,
    private readonly skillAccessService: SkillAccessService,
    private readonly skillMatcherService: SkillMatcherService,
    private readonly skillValidationService: SkillValidationService
  ) {}

  private logStructured(
    level: 'log' | 'warn' | 'error',
    event: string,
    payload: Record<string, unknown>
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

  async onModuleInit() {
    this.logStructured('log', 'skill_service_init_started', {
      defaultSkillCount: DEFAULT_SKILLS.length,
    });
    await this.toolCatalogService.ensureInfrastructure();
    await this.skillAccessService.ensureSystemRoles();
    await this.toolCatalogService.seedSystemCatalog();
    await this.validateDefaultSkillsStartupConsistency();
    await this.loadDefaultSkills();
    this.logStructured('log', 'skill_service_init_completed', {
      defaultSkillCount: DEFAULT_SKILLS.length,
    });
  }

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
            declaredTools: this.skillToolBindingService.normalizeToolNames(skill.tools),
            flowTools: this.skillToolBindingService.extractToolNamesFromExecutionFlow(
              skill.executionFlow as any[]
            ),
          });
        } else {
          const shouldSyncParams =
            !existing.paramsSchema ||
            Object.keys((existing.paramsSchema as any).properties || {}).length === 0;

          const existingFlowTemplateIds = (existing.executionFlowTemplateIds as string[]) || [];

          if (shouldSyncParams) {
            await this.prisma.skillConfig.update({
              where: { id: existing.id },
              data: {
                paramsSchema: skill.paramsSchema as any,
                triggerKeywords:
                  ((existing.triggerKeywords as any[]) || []).length === 0
                    ? skill.triggerKeywords
                    : (existing.triggerKeywords as any[]),
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
        const validation = await this.skillToolBindingService
          .buildSkillToolValidation(skill)
          .catch(() => null);
        this.logStructured('error', 'default_skill_ensure_failed', {
          skillName: skill.name,
          declaredTools: this.skillToolBindingService.normalizeToolNames(skill.tools),
          flowTools: this.skillToolBindingService.extractToolNamesFromExecutionFlow(
            skill.executionFlow as any[]
          ),
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
      const declaredTools = this.skillToolBindingService.normalizeToolNames(skill.tools);
      const flowTools = this.skillToolBindingService.extractToolNamesFromExecutionFlow(
        skill.executionFlow as any[]
      );
      const validation = await this.skillToolBindingService.buildSkillToolValidation(skill);
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

  async createSkill(dto: CreateSkillDTO): Promise<SkillConfigDto> {
    const toolValidation = await this.skillToolBindingService.buildSkillToolValidation(dto);
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
        paramsSchema: dto.paramsSchema as any,
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
      JSON.stringify(toolValidation)
    );
    await this.skillToolBindingService.syncSkillToolBindings(skill.id, dto);

    const [enriched] = await this.skillEnrichmentService.enrichSkillsWithPublication([skill]);
    return enriched!;
  }

  async listSkills(): Promise<SkillConfigDto[]> {
    const skills = await this.prisma.skillConfig.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return this.skillEnrichmentService.enrichSkillsWithPublication(skills, {
      hideHistoricalPublishedVersions: true,
    });
  }

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
    const [enriched] = await this.skillEnrichmentService.enrichSkillsWithPublication([skill]);
    return enriched || null;
  }

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
        executionFlowTemplateIds:
          dto.executionFlowTemplateIds ?? ((current.executionFlowTemplateIds as string[]) || []),
        executionFlow: (dto.executionFlow ?? (current.executionFlow as any[]) ?? []) as any,
        tools: dto.tools ?? ((current.tools as string[]) || []),
        apiEndpoints: (dto.apiEndpoints ?? current.apiEndpoints) as any,
      };

      const toolValidation =
        await this.skillToolBindingService.buildSkillToolValidation(mergedPayload);
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
          paramsSchema: dto.paramsSchema as any,
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
        JSON.stringify(toolValidation)
      );
      await this.skillToolBindingService.syncSkillToolBindings(id, mergedPayload);

      const [enriched] = await this.skillEnrichmentService.enrichSkillsWithPublication([skill]);
      return enriched || null;
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
        id
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
        id
      );

      this.logger.warn(
        `Skill ${id} has runtime references (executions=${executionCount}, releases=${releaseRefCount}), archived instead of hard delete`
      );
      return true;
    }

    await this.prisma.skillConfig.delete({
      where: { id },
    });

    return true;
  }

  async matchSkill(userInput: string): Promise<SkillMatchResult | null> {
    return this.skillMatcherService.matchSkill(userInput, () => this.listSkills());
  }

  async listSkillsForUser(userId: string): Promise<SkillConfigDto[]> {
    if (!isValidUUID(userId)) {
      this.logger.warn(`Invalid userId format: ${userId}, returning empty skills list`);
      return [];
    }
    return this.skillAccessService.listSkillsForUser(userId);
  }

  async checkUserSkillPermission(userId: string, skillId: string): Promise<boolean> {
    return this.skillAccessService.checkUserSkillPermission(userId, skillId);
  }

  async grantSkillToRole(
    skillId: string,
    roleId: string,
    grantedBy: string
  ): Promise<SkillPermissionDTO> {
    return this.skillAccessService.grantSkillToRole(skillId, roleId, grantedBy);
  }

  async revokeSkillFromRole(skillId: string, roleId: string): Promise<boolean> {
    return this.skillAccessService.revokeSkillFromRole(skillId, roleId);
  }

  async getSkillPermissions(skillId: string): Promise<SkillPermissionDTO[]> {
    return this.skillAccessService.getSkillPermissions(skillId);
  }

  async getSkillToolBindings(skillId: string): Promise<{
    bindings: SkillToolBinding[];
    validation: SkillToolValidationResult;
  }> {
    const skill = await this.getSkill(skillId);
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    const bindingsMap = await this.skillToolBindingService.getSkillToolBindingMap([skillId]);
    const bindings = bindingsMap.get(skillId) || [];
    const validation = await this.skillToolBindingService.buildSkillToolValidation({
      tools: skill.tools,
      executionFlow: skill.executionFlow,
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
    });

    return { bindings, validation };
  }

  async setSkillToolBindings(
    skillId: string,
    tools: string[]
  ): Promise<{
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

    const validation = await this.skillToolBindingService.buildSkillToolValidation(mergedPayload);
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
      JSON.stringify(validation)
    );
    await this.skillToolBindingService.syncSkillToolBindings(skillId, mergedPayload);

    const bindingsMap = await this.skillToolBindingService.getSkillToolBindingMap([skillId]);
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

    const validation = await this.skillToolBindingService.buildSkillToolValidation({
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
      JSON.stringify(validation)
    );

    return validation;
  }

  async validateSkillToolsPayload(
    payload: Pick<CreateSkillDTO, 'tools' | 'executionFlow' | 'executionFlowTemplateIds'>
  ): Promise<SkillToolValidationResult> {
    return this.skillToolBindingService.buildSkillToolValidation(payload);
  }

  async matchSkillWithAI(userInput: string, userId: string): Promise<SkillMatchResult | null> {
    return this.skillMatcherService.matchSkillWithAI(userInput, userId, (id) =>
      this.listSkillsForUser(id)
    );
  }

  async listRoles(): Promise<{ id: string; name: string }[]> {
    return this.skillAccessService.listRoles();
  }

  async validateSkill(
    skillId: string,
    emit?: SkillValidationEmitter
  ): Promise<SkillValidationResult> {
    return this.skillValidationService.validateSkill(skillId, (id) => this.getSkill(id), emit);
  }

  async applyGeneratedSkillAdjustment(
    id: string,
    generatedSkill?: Partial<SkillConfigDto>
  ): Promise<SkillConfigDto | null> {
    return this.skillValidationService.applyGeneratedSkillAdjustment(
      id,
      generatedSkill,
      (skillId) => this.getSkill(skillId),
      async (skillId, nextSkill, current) =>
        this.updateSkill(skillId, {
          name: nextSkill.name || current.name,
          description: nextSkill.description || current.description,
          triggerKeywords: nextSkill.triggerKeywords || current.triggerKeywords,
          paramsSchema: nextSkill.paramsSchema || current.paramsSchema,
          executionFlowTemplateIds:
            nextSkill.executionFlowTemplateIds || current.executionFlowTemplateIds,
          executionFlow: nextSkill.executionFlow || current.executionFlow,
          tools: nextSkill.tools || current.tools,
          apiEndpoints: nextSkill.apiEndpoints || current.apiEndpoints,
        })
    );
  }
}
