/**
 * Skill Service
 * Skill配置管理服务 - 支持权限管控和AI语义匹配
 */

import { Injectable, Logger, OnModuleInit, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SkillConfigDTO,
  CreateSkillDTO,
  SkillMatchResult,
  ParamsSchema,
  SkillPermissionDTO,
  AIMatchResponse,
  SkillValidationResult,
} from './interfaces';
import axios from 'axios';
import { ExecutionFlowTemplateService } from '../execution-flow/execution-flow.service';

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

/**
 * 默认Skill配置
 */
const DEFAULT_SKILLS: CreateSkillDTO[] = [
  {
    name: '保密合同生成',
    description: '生成保密协议/NDA文档',
    category: 'template',
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
    templateId: 'nda-template',
    carboneTemplateId: '48cd5507-fb0c-43f4-b3e2-d1bb19cb75ab',
    carboneSkillId: '8865ae32-23b0-4548-b136-44ee99b53e22',
    apiEndpoints: {
      generateParameters: {
        url: '/studio/generate-parameters',
        method: 'POST',
        description: '使用AI从用户输入生成模板参数',
      },
      render: {
        url: '/studio/render',
        method: 'POST',
        description: '渲染模板生成文档',
      },
    },
    executionFlow: ['skill_match', 'generate_parameters', 'confirm', 'document_render'],
    tools: ['skill_match', 'generate_parameters', 'user_ask', 'document_render'],
  },
  {
    name: '劳动合同生成',
    description: '生成劳动合同文档',
    category: 'template',
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
    templateId: 'labor-contract-template',
    executionFlow: ['collect_params', 'confirm', 'render'],
    tools: ['param_collect', 'user_ask', 'document_generate'],
  },
];

@Injectable()
export class SkillService implements OnModuleInit {
  private readonly logger = new Logger(SkillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionFlowService: ExecutionFlowTemplateService,
  ) {}

  /**
   * 模块初始化时加载默认Skills
   */
  async onModuleInit() {
    this.logger.log('Initializing Skill Service...');
    await this.loadDefaultSkills();
  }

  /**
   * 加载默认Skills（如果不存在）
   */
  private async loadDefaultSkills() {
    for (const skill of DEFAULT_SKILLS) {
      const existing = await this.prisma.skillConfig.findUnique({
        where: { name: skill.name },
      });

      if (!existing) {
        await this.createSkill(skill);
        this.logger.log(`Created default skill: ${skill.name}`);
      }
    }
  }

  /**
   * 创建Skill
   */
  async createSkill(dto: CreateSkillDTO): Promise<SkillConfigDTO> {
    const skill = await this.prisma.skillConfig.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category || 'template',
        triggerKeywords: dto.triggerKeywords,
        paramsSchema: dto.paramsSchema as any,  // Cast to JSON for Prisma
        templateId: dto.templateId,
        carboneTemplateId: dto.carboneTemplateId,
        carboneSkillId: dto.carboneSkillId,
        executionFlowTemplateId: dto.executionFlowTemplateId,
        apiEndpoints: dto.apiEndpoints as any,
        executionFlow: dto.executionFlow || [],
        tools: dto.tools || [],
        isActive: true,
      },
    });

    return this.toDTO(skill);
  }

  /**
   * 获取所有Skills
   */
  async listSkills(): Promise<SkillConfigDTO[]> {
    const skills = await this.prisma.skillConfig.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return skills.map(this.toDTO);
  }

  /**
   * 获取Skill详情
   */
  async getSkill(id: string): Promise<SkillConfigDTO | null> {
    const skill = await this.prisma.skillConfig.findUnique({
      where: { id },
    });

    return skill ? this.toDTO(skill) : null;
  }

  /**
   * 更新Skill
   */
  async updateSkill(id: string, dto: Partial<CreateSkillDTO>): Promise<SkillConfigDTO | null> {
    const skill = await this.prisma.skillConfig.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        triggerKeywords: dto.triggerKeywords,
        paramsSchema: dto.paramsSchema as any,  // Cast to JSON for Prisma
        templateId: dto.templateId,
        carboneTemplateId: dto.carboneTemplateId,
        carboneSkillId: dto.carboneSkillId,
        executionFlowTemplateId: dto.executionFlowTemplateId,
        apiEndpoints: dto.apiEndpoints as any,
        executionFlow: dto.executionFlow,
        tools: dto.tools,
      },
    });

    return this.toDTO(skill);
  }

  /**
   * 删除Skill
   */
  async deleteSkill(id: string): Promise<boolean> {
    const result = await this.prisma.skillConfig.delete({
      where: { id },
    });

    return !!result;
  }

  /**
   * 匹配Skill
   */
  async matchSkill(userInput: string): Promise<SkillMatchResult | null> {
    const skills = await this.listSkills();
    let bestMatch: SkillConfigDTO | null = null;
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

      return {
        skillId: bestMatch.id,
        skillName: bestMatch.name,
        matchedKeywords,
        confidence,
        collectedParams: {},
        missingParams: bestMatch.paramsSchema.required,
        paramsSchema: bestMatch.paramsSchema,
        templateId: bestMatch.templateId,
        carboneTemplateId: bestMatch.carboneTemplateId,
        carboneSkillId: bestMatch.carboneSkillId,
        apiEndpoints: bestMatch.apiEndpoints,
      };
    }

    return null;
  }

  /**
   * 获取用户可访问的Skills（基于角色权限）
   */
  async listSkillsForUser(userId: string): Promise<SkillConfigDTO[]> {
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

    const roleIds = userRoles.map(ur => ur.roleId);

    // 4. 检查用户是否是 admin（通过角色关联）
    const isAdmin = userRoles.some(ur => ur.role.name === 'admin' ||
      (ur.role.permissions as Record<string, boolean>)?.['all_skills'] === true);

    if (isAdmin) {
      // Admin 可访问所有 Skills
      return this.listSkills();
    }

    // 3. 如果用户没有角色，返回空列表
    if (roleIds.length === 0) {
      return [];
    }

    // 4. 获取用户角色有权限的 Skills
    const skillPermissions = await this.prisma.skillPermission.findMany({
      where: { roleId: { in: roleIds } },
      include: { skill: true },
    });

    // 5. 去重并返回活跃的 Skills
    const uniqueSkillIds = new Set<string>();
    const skills: SkillConfigDTO[] = [];

    for (const perm of skillPermissions) {
      if (!uniqueSkillIds.has(perm.skillId) && perm.skill.isActive) {
        uniqueSkillIds.add(perm.skillId);
        skills.push(this.toDTO(perm.skill));
      }
    }

    return skills;
  }

  /**
   * 检查用户是否有权限使用某 Skill
   */
  async checkUserSkillPermission(userId: string, skillId: string): Promise<boolean> {
    // 1. 获取用户的所有角色
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });

    // 2. Admin 默认有权限
    const isAdmin = userRoles.some(ur => ur.role.name === 'admin' ||
      (ur.role.permissions as Record<string, boolean>)?.['all_skills'] === true);
    if (isAdmin) {
      return true;
    }

    // 3. 检查 Skill 是否存在且活跃
    const skill = await this.prisma.skillConfig.findUnique({
      where: { id: skillId },
    });
    if (!skill || !skill.isActive) {
      return false;
    }

    // 4. 检查用户角色是否有权限
    const roleIds = userRoles.map(ur => ur.roleId);
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
    // 检查 Skill 和 Role 是否存在
    const skill = await this.prisma.skillConfig.findUnique({ where: { id: skillId } });
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }
    if (!role) {
      throw new NotFoundException('Role not found');
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

    return permissions.map(perm => ({
      skillId: perm.skillId,
      skillName: perm.skill.name,
      roleId: perm.roleId,
      roleName: perm.role.name,
      grantedAt: perm.grantedAt,
      grantedBy: perm.grantedBy,
    }));
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
      const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/model/call`, {
        modelId: 'default',
        prompt,
      });

      const aiResponse = this.parseAiMatchResponse(response.data.result, availableSkills);

      if (aiResponse) {
        const matchedSkill = availableSkills.find(s => s.name === aiResponse.matchedSkill);
        if (matchedSkill) {
          return {
            skillId: matchedSkill.id,
            skillName: matchedSkill.name,
            matchedKeywords: [], // AI 匹配不依赖关键词
            confidence: aiResponse.confidence,
            matchReason: aiResponse.reason,
            collectedParams: {},
            missingParams: matchedSkill.paramsSchema.required,
            paramsSchema: matchedSkill.paramsSchema,
            templateId: matchedSkill.templateId,
            carboneTemplateId: matchedSkill.carboneTemplateId,
            carboneSkillId: matchedSkill.carboneSkillId,
            apiEndpoints: matchedSkill.apiEndpoints,
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
  private buildSkillsPromptXml(skills: SkillConfigDTO[]): string {
    const lines = skills.map(s => `  <skill>
    <name>${s.name}</name>
    <description>${s.description || ''}</description>
    <category>${s.category}</category>
  </skill>`).join('\n');
    return `<available_skills>\n${lines}\n</available_skills>`;
  }

  /**
   * 解析 AI 匹配响应
   */
  private parseAiMatchResponse(response: string, availableSkills: SkillConfigDTO[]): AIMatchResponse | null {
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
  private matchSkillFallback(userInput: string, availableSkills: SkillConfigDTO[]): SkillMatchResult | null {
    let bestMatch: SkillConfigDTO | null = null;
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

      return {
        skillId: bestMatch.id,
        skillName: bestMatch.name,
        matchedKeywords,
        confidence,
        collectedParams: {},
        missingParams: bestMatch.paramsSchema.required,
        paramsSchema: bestMatch.paramsSchema,
        templateId: bestMatch.templateId,
        carboneTemplateId: bestMatch.carboneTemplateId,
        carboneSkillId: bestMatch.carboneSkillId,
        apiEndpoints: bestMatch.apiEndpoints,
      };
    }

    return null;
  }

  /**
   * 获取所有角色列表（用于权限分配）
   */
  async listRoles(): Promise<{ id: string; name: string }[]> {
    const roles = await this.prisma.role.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return roles;
  }

  /**
   * 转换为DTO
   */
  private toDTO(skill: any): SkillConfigDTO {
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      triggerKeywords: skill.triggerKeywords,
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateId: skill.executionFlowTemplateId,
      apiEndpoints: skill.apiEndpoints,
      executionFlow: skill.executionFlow,
      tools: skill.tools,
      isActive: skill.isActive,
    };
  }

  /**
   * 验证Skill - AI完整验证（包含流程模板模拟执行）
   */
  async validateSkill(skillId: string): Promise<SkillValidationResult> {
    const skill = await this.getSkill(skillId);
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

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
    result.details.configAnalysis.hasTriggerKeywords = skill.triggerKeywords.length > 0;
    result.details.configAnalysis.hasParamsSchema = Object.keys(skill.paramsSchema.properties).length > 0;
    result.details.configAnalysis.hasTemplate = !!skill.carboneTemplateId;
    result.details.configAnalysis.hasFlowTemplate = !!skill.executionFlowTemplateId;

    // 检查触发关键词质量
    if (skill.triggerKeywords.length < 3) {
      result.warnings.push('触发关键词数量较少，建议添加更多关键词以提高匹配准确度');
      result.score -= 10;
      result.details.configAnalysis.triggerKeywordQuality = 'poor';
    } else if (skill.triggerKeywords.length >= 5) {
      result.details.configAnalysis.triggerKeywordQuality = 'good';
    } else {
      result.details.configAnalysis.triggerKeywordQuality = 'acceptable';
    }

    // 检查参数Schema完整性
    const requiredParams = skill.paramsSchema.required || [];
    if (requiredParams.length === 0) {
      result.warnings.push('没有必填参数，可能导致执行流程无法正确收集参数');
      result.score -= 5;
      result.details.configAnalysis.paramsSchemaCompleteness = 'incomplete';
    } else {
      const hasAllDescriptions = requiredParams.every(
        param => skill.paramsSchema.properties[param]?.description
      );
      if (!hasAllDescriptions) {
        result.warnings.push('部分必填参数缺少描述，建议添加描述以提高AI参数提取准确度');
        result.score -= 5;
        result.details.configAnalysis.paramsSchemaCompleteness = 'partial';
      } else {
        result.details.configAnalysis.paramsSchemaCompleteness = 'complete';
      }
    }

    // 2. 如果关联了流程模板，进行AI模拟执行验证
    if (skill.executionFlowTemplateId) {
      try {
        const flowTemplate = await this.executionFlowService.getTemplate(skill.executionFlowTemplateId);
        if (flowTemplate) {
          const flowAnalysis = await this.simulateExecutionFlow(skill, flowTemplate);
          result.details.flowAnalysis = flowAnalysis;

          // 合并流程验证结果
          result.score = Math.min(result.score, flowAnalysis.validationScore);
          if (flowAnalysis.validationScore < 60) {
            result.isValid = false;
          }

          // 添加流程验证的建议
          const failedSteps = flowAnalysis.executionSimulations.filter(s => !s.success);
          if (failedSteps.length > 0) {
            result.warnings.push(...failedSteps.map(s => `步骤"${s.stepName}"模拟执行失败: ${s.error}`));
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.warnings.push(`流程模板验证失败: ${errorMsg}`);
        result.score -= 20;
      }
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
    return result;
  }

  /**
   * 模拟执行流程模板 - AI作为agent执行每个步骤
   */
  private async simulateExecutionFlow(
    skill: SkillConfigDTO,
    flowTemplate: any,
  ): Promise<{
    templateId: string;
    templateName: string;
    stepCount: number;
    executableSteps: number;
    validationScore: number;
    executionSimulations: Array<{
      stepId: string;
      stepName: string;
      type: string;
      simulated: boolean;
      success: boolean;
      output?: string;
      error?: string;
    }>;
  }> {
    const steps = flowTemplate.steps as any[];
    const simulationResults = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const simulation = {
        stepId: step.id || `step-${i}`,
        stepName: step.name,
        type: step.type,
        simulated: false,
        success: false,
        output: undefined as string | undefined,
        error: undefined as string | undefined,
      };

      try {
        // 根据步骤类型进行模拟执行
        switch (step.type) {
          case 'text':
            // 文本步骤：AI分析内容是否合理
            const textResult = await this.simulateTextStep(step, skill);
            simulation.simulated = true;
            simulation.success = textResult.success;
            simulation.output = textResult.output;
            if (!textResult.success) {
              simulation.error = textResult.error;
            }
            break;

          case 'script':
            // 脚本步骤：AI模拟脚本执行逻辑
            const scriptResult = await this.simulateScriptStep(step, skill);
            simulation.simulated = true;
            simulation.success = scriptResult.success;
            simulation.output = scriptResult.output;
            if (!scriptResult.success) {
              simulation.error = scriptResult.error;
            }
            break;

          case 'tool':
            // 工具步骤：AI模拟工具调用
            const toolResult = await this.simulateToolStep(step, skill);
            simulation.simulated = true;
            simulation.success = toolResult.success;
            simulation.output = toolResult.output;
            if (!toolResult.success) {
              simulation.error = toolResult.error;
            }
            break;

          case 'api':
            // API步骤：AI模拟API请求
            const apiResult = await this.simulateApiStep(step, skill);
            simulation.simulated = true;
            simulation.success = apiResult.success;
            simulation.output = apiResult.output;
            if (!apiResult.success) {
              simulation.error = apiResult.error;
            }
            break;

          default:
            simulation.error = `未知步骤类型: ${step.type}`;
        }
      } catch (error) {
        simulation.error = error instanceof Error ? error.message : 'Unknown error';
      }

      simulationResults.push(simulation);
    }

    // 计算验证分数
    const executableSteps = simulationResults.filter(s => s.simulated).length;
    const successfulSteps = simulationResults.filter(s => s.success).length;
    const validationScore = executableSteps > 0
      ? Math.round((successfulSteps / executableSteps) * 100)
      : 0;

    return {
      templateId: flowTemplate.id,
      templateName: flowTemplate.name,
      stepCount: steps.length,
      executableSteps,
      validationScore,
      executionSimulations: simulationResults,
    };
  }

  /**
   * 模拟文本步骤执行
   */
  private async simulateTextStep(step: any, skill: SkillConfigDTO): Promise<{ success: boolean; output?: string; error?: string }> {
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
      const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/model/call`, {
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
  private async simulateScriptStep(step: any, skill: SkillConfigDTO): Promise<{ success: boolean; output?: string; error?: string }> {
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
      const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/model/call`, {
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
  private async simulateToolStep(step: any, skill: SkillConfigDTO): Promise<{ success: boolean; output?: string; error?: string }> {
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
  private async simulateApiStep(step: any, skill: SkillConfigDTO): Promise<{ success: boolean; output?: string; error?: string }> {
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
      const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/model/call`, {
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