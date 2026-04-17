/**
 * Skill Service
 * Skill配置管理服务
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SkillConfigDTO,
  CreateSkillDTO,
  SkillMatchResult,
  ParamsSchema,
} from './interfaces';

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
    executionFlow: ['collect_params', 'confirm', 'render'],
    tools: ['param_collect', 'user_ask', 'document_generate'],
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

  constructor(private readonly prisma: PrismaService) {}

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
      };
    }

    return null;
  }

  /**
   * 获取Skill参数Schema
   */
  async getSkillParamsSchema(skillId: string): Promise<ParamsSchema | null> {
    const skill = await this.getSkill(skillId);
    return skill?.paramsSchema || null;
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
      executionFlow: skill.executionFlow,
      tools: skill.tools,
      isActive: skill.isActive,
    };
  }
}