import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSemanticRuleSetDto,
  ListSemanticRuleSetsQueryDto,
  ReplaceSemanticRuleCategoryDto,
  UpdateSemanticRuleSetDto,
} from './semantic-rule-set.dto';
import type { SemanticRuleCategory, SemanticRuleType } from '../../types/semantic-rule.types';

@Injectable()
export class SemanticRuleSetService {
  constructor(private readonly prisma: PrismaService) {}

  private buildRuleCreateManyInput(rules: CreateSemanticRuleSetDto['rules']) {
    return rules.map((rule) => ({
      type: rule.type,
      name: rule.name,
      enabled: rule.enabled ?? true,
      priority: rule.priority,
      stopOnMatch: rule.stop_on_match ?? false,
      flags: rule.flags,
      patterns: JSON.parse(JSON.stringify(rule.patterns)),
      outputs: JSON.parse(JSON.stringify(rule.outputs)),
      tags: this.buildRuleTags(rule.type, rule.category),
    }));
  }

  private buildRuleTags(type: SemanticRuleType, category?: SemanticRuleCategory) {
    const resolvedCategory = category || this.inferCategoryFromRuleType(type);
    return JSON.parse(JSON.stringify([`category:${resolvedCategory}`]));
  }

  private inferCategoryFromRuleType(type?: string | null): SemanticRuleCategory {
    switch (type) {
      case 'LOGIN_PHRASE':
        return 'LOGIN';
      case 'READ_INTENT':
        return 'READ_VALUE';
      case 'FIELD_ALIAS':
        return 'FIELD_FILL';
      case 'ROW_REFERENCE':
        return 'ROW_ACTION';
      default:
        return 'GENERIC_ALIAS';
    }
  }

  private extractCategoryFromTags(tags: unknown, type?: string | null): SemanticRuleCategory {
    if (Array.isArray(tags)) {
      const categoryTag = tags.find(
        (item): item is string => typeof item === 'string' && item.startsWith('category:')
      );
      if (categoryTag) {
        const rawCategory = categoryTag.slice('category:'.length).trim();
        if (rawCategory) {
          return rawCategory as SemanticRuleCategory;
        }
      }
    }

    return this.inferCategoryFromRuleType(type);
  }

  private mapRuleSet<T extends { rules?: Array<Record<string, unknown>> }>(ruleSet: T) {
    return {
      ...ruleSet,
      rules: (ruleSet.rules || []).map((rule) => ({
        ...rule,
        category: this.extractCategoryFromTags(rule.tags, typeof rule.type === 'string' ? rule.type : null),
      })),
    };
  }

  private buildTargetingCreateManyInput(targetings: NonNullable<CreateSemanticRuleSetDto['targetings']>) {
    return targetings.map((targeting) => ({
      environments: targeting.environments
        ? JSON.parse(JSON.stringify(targeting.environments))
        : undefined,
      hosts: targeting.hosts ? JSON.parse(JSON.stringify(targeting.hosts)) : undefined,
      tenantIds: targeting.tenant_ids
        ? JSON.parse(JSON.stringify(targeting.tenant_ids))
        : undefined,
      userIds: targeting.user_ids ? JSON.parse(JSON.stringify(targeting.user_ids)) : undefined,
      skillIds: targeting.skill_ids ? JSON.parse(JSON.stringify(targeting.skill_ids)) : undefined,
      pageTypes: targeting.page_types
        ? JSON.parse(JSON.stringify(targeting.page_types))
        : undefined,
      sampleRate: targeting.sample_rate,
      enabled: targeting.enabled ?? true,
    }));
  }

  async list(query: ListSemanticRuleSetsQueryDto) {
    const ruleSets = await this.prisma.semanticRuleSet.findMany({
      where: {
        key: query.key,
        status: query.status,
        domain: query.domain_code ? { code: query.domain_code } : undefined,
      },
      include: {
        domain: true,
        rules: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    return ruleSets.map((ruleSet) => this.mapRuleSet(ruleSet));
  }

  async getById(id: string) {
    const ruleSet = await this.prisma.semanticRuleSet.findUnique({
      where: { id },
      include: {
        domain: true,
        rules: true,
        targetings: true,
      },
    });
    return ruleSet ? this.mapRuleSet(ruleSet) : null;
  }

  async create(dto: CreateSemanticRuleSetDto) {
    const domain = await this.prisma.semanticRuleDomain.findUnique({
      where: { code: dto.domain_code },
    });

    if (!domain) {
      return {
        created: false,
        reason: `Unknown domain: ${dto.domain_code}`,
      };
    }

    const created = await this.prisma.semanticRuleSet.create({
      data: {
        domainId: domain.id,
        key: dto.key,
        name: dto.name,
        version: dto.version ?? 'draft',
        status: 'DRAFT',
        description: dto.description,
        basedOnRuleSetId: dto.based_on_rule_set_id,
        changeSummary: dto.change_summary,
        createdBy: dto.created_by,
        rules: {
          create: this.buildRuleCreateManyInput(dto.rules),
        },
        targetings: dto.targetings?.length
          ? {
              create: this.buildTargetingCreateManyInput(dto.targetings),
            }
          : undefined,
      },
      include: {
        domain: true,
        rules: true,
        targetings: true,
      },
    });
    return this.mapRuleSet(created);
  }

  async update(id: string, dto: UpdateSemanticRuleSetDto) {
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.rules !== undefined) {
        await tx.semanticRule.deleteMany({
          where: { ruleSetId: id },
        });
      }

      if (dto.targetings !== undefined) {
        await tx.semanticRuleTargeting.deleteMany({
          where: { ruleSetId: id },
        });
      }

      return tx.semanticRuleSet.update({
        where: { id },
        data: {
          name: dto.name,
          version: dto.version,
          description: dto.description,
          rules:
            dto.rules !== undefined
              ? {
                  create: this.buildRuleCreateManyInput(dto.rules),
                }
              : undefined,
          targetings:
            dto.targetings !== undefined
              ? dto.targetings.length
                ? {
                    create: this.buildTargetingCreateManyInput(dto.targetings),
                  }
                : undefined
              : undefined,
        },
        include: {
          domain: true,
          rules: true,
          targetings: true,
        },
      });
    });
    return this.mapRuleSet(updated);
  }

  async replaceCategoryRules(
    id: string,
    category: SemanticRuleCategory,
    dto: ReplaceSemanticRuleCategoryDto
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const currentRuleSet = await tx.semanticRuleSet.findUnique({
        where: { id },
        include: {
          rules: true,
        },
      });

      if (!currentRuleSet) {
        return null;
      }

      const matchedRuleIds = currentRuleSet.rules
        .filter(
          (rule) => this.extractCategoryFromTags(rule.tags, typeof rule.type === 'string' ? rule.type : null) === category
        )
        .map((rule) => rule.id);

      if (matchedRuleIds.length) {
        await tx.semanticRule.deleteMany({
          where: {
            id: {
              in: matchedRuleIds,
            },
          },
        });
      }

      return tx.semanticRuleSet.update({
        where: { id },
        data: {
          rules: {
            create: this.buildRuleCreateManyInput(
              dto.rules.map((rule) => ({
                ...rule,
                category,
              }))
            ),
          },
        },
        include: {
          domain: true,
          rules: true,
          targetings: true,
        },
      });
    });

    return updated ? this.mapRuleSet(updated) : null;
  }
}
