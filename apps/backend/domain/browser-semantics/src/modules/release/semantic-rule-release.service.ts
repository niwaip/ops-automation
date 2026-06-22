import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  extractSemanticRuleCategory,
  validateSemanticRuleOutputs,
} from '../rule-set/semantic-rule-output.validation';
import {
  ListSemanticRuleReleasesQueryDto,
  PromoteSemanticRuleSetToActiveDto,
  PromoteSemanticRuleSetToCanaryDto,
  RollbackSemanticRuleSetDto,
} from './semantic-rule-release.dto';

@Injectable()
export class SemanticRuleReleaseService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(ruleSetId: string) {
    const ruleSet = await this.prisma.semanticRuleSet.findUnique({
      where: { id: ruleSetId },
      include: {
        rules: true,
      },
    });

    if (!ruleSet) {
      throw new NotFoundException(`Rule set ${ruleSetId} not found`);
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const categorySet = new Set<string>();
    const ruleNameSet = new Set<string>();

    if (!ruleSet.rules.length) {
      errors.push('规则集下没有任何规则');
    }

    for (const rule of ruleSet.rules) {
      const category = extractSemanticRuleCategory({
        type: rule.type,
        tags: rule.tags,
      });
      if (category) {
        categorySet.add(category);
      }

      const normalizedName = rule.name.trim().toLowerCase();
      if (!normalizedName) {
        errors.push(`存在未命名规则（ID: ${rule.id}）`);
      } else if (ruleNameSet.has(normalizedName)) {
        warnings.push(`规则名重复：${rule.name}`);
      } else {
        ruleNameSet.add(normalizedName);
      }

      if (!Array.isArray(rule.patterns) || !rule.patterns.length) {
        errors.push(`规则 ${rule.name} 缺少 patterns`);
      } else {
        for (const pattern of rule.patterns) {
          if (typeof pattern !== 'string' || !pattern.trim()) {
            errors.push(`规则 ${rule.name} 存在空 pattern`);
            continue;
          }

          try {
            new RegExp(pattern, rule.flags || undefined);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'invalid regex';
            errors.push(`规则 ${rule.name} 的正则无效：${message}`);
          }
        }
      }

      const outputErrors = validateSemanticRuleOutputs({
        type: rule.type,
        category,
        tags: rule.tags,
        outputs: rule.outputs,
      });
      errors.push(...outputErrors.map((message) => `规则 ${rule.name} 的 ${message}`));
    }

    return {
      valid: errors.length === 0,
      rule_set_id: ruleSet.id,
      rule_count: ruleSet.rules.length,
      category_count: categorySet.size,
      validated_at: new Date().toISOString(),
      errors,
      warnings,
    };
  }

  async list(query: ListSemanticRuleReleasesQueryDto) {
    return this.prisma.semanticRuleRelease.findMany({
      where: {
        ruleSetId: query.rule_set_id,
        ruleSet:
          query.domain_code || query.key
            ? {
                domain: query.domain_code ? { code: query.domain_code } : undefined,
                key: query.key,
              }
            : undefined,
      },
      include: {
        ruleSet: true,
      },
      orderBy: [{ triggeredAt: 'desc' }],
      take: 100,
    });
  }

  async promoteToCanary(ruleSetId: string, dto: PromoteSemanticRuleSetToCanaryDto) {
    await this.prisma.semanticRuleSet.update({
      where: { id: ruleSetId },
      data: { status: 'CANARY', archivedAt: null },
    });

    return this.prisma.semanticRuleRelease.create({
      data: {
        ruleSetId,
        releaseMode: 'MANUAL',
        fromStatus: 'DRAFT',
        toStatus: 'CANARY',
        releasedBy: 'system',
        releaseNote: dto.release_note,
      },
    });
  }

  async promoteToActive(ruleSetId: string, dto: PromoteSemanticRuleSetToActiveDto) {
    await this.prisma.semanticRuleSet.update({
      where: { id: ruleSetId },
      data: { status: 'ACTIVE', activatedAt: new Date(), archivedAt: null },
    });

    return this.prisma.semanticRuleRelease.create({
      data: {
        ruleSetId,
        releaseMode: 'MANUAL',
        fromStatus: 'CANARY',
        toStatus: 'ACTIVE',
        releasedBy: 'system',
        releaseNote: dto.release_note,
      },
    });
  }

  async rollback(ruleSetId: string, dto: RollbackSemanticRuleSetDto) {
    await this.prisma.semanticRuleSet.update({
      where: { id: ruleSetId },
      data: { status: 'ROLLED_BACK' },
    });

    await this.prisma.semanticRuleSet.update({
      where: { id: dto.target_rule_set_id },
      data: { status: 'ACTIVE', activatedAt: new Date(), archivedAt: null },
    });

    return this.prisma.semanticRuleRelease.create({
      data: {
        ruleSetId,
        releaseMode: 'ROLLBACK',
        fromStatus: 'ACTIVE',
        toStatus: 'ROLLED_BACK',
        releasedBy: 'system',
        releaseNote: dto.reason,
        previousActiveRuleSetId: dto.target_rule_set_id,
      },
    });
  }
}
