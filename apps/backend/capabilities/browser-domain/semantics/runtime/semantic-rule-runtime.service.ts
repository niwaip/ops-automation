import { Injectable } from '@nestjs/common';
import type {
  SemanticRuleSet,
  SemanticRuleTargeting,
} from '../prisma';
import { PrismaService } from '../prisma/prisma.service';
import { ResolveRuntimeSemanticRuleSetQueryDto } from './semantic-rule-runtime.dto';

@Injectable()
export class SemanticRuleRuntimeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(query: ResolveRuntimeSemanticRuleSetQueryDto) {
    const domain = await this.prisma.semanticRuleDomain.findUnique({
      where: { code: query.domain_code },
    });

    if (!domain) {
      return null;
    }

    const canary = await this.findBestMatchedRuleSet(domain.id, 'CANARY', query);

    if (canary) {
      return {
        rule_set_id: canary.id,
        version: canary.version,
        status: canary.status,
        rules: canary.rules,
      };
    }

    const active = await this.findBestMatchedRuleSet(domain.id, 'ACTIVE', query);

    if (!active) {
      return null;
    }

    return {
      rule_set_id: active.id,
      version: active.version,
      status: active.status,
      rules: active.rules,
    };
  }

  private async findBestMatchedRuleSet(
    domainId: string,
    status: 'CANARY' | 'ACTIVE',
    query: ResolveRuntimeSemanticRuleSetQueryDto
  ) {
    const candidates = await this.prisma.semanticRuleSet.findMany({
      where: {
        domainId,
        status,
      },
      include: {
        rules: {
          where: { enabled: true },
          orderBy: { priority: 'desc' },
        },
        targetings: {
          where: { enabled: true },
        },
      },
      orderBy: status === 'CANARY' ? { updatedAt: 'desc' } : { activatedAt: 'desc' },
    });

    return (
      candidates
        .map((candidate, index) => ({
          candidate,
          index,
          score: this.getTargetingMatchScore(candidate, query),
        }))
        .filter((item) => item.score >= 0)
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }
          return left.index - right.index;
        })[0]?.candidate ?? null
    );
  }

  private getTargetingMatchScore(
    ruleSet: SemanticRuleSet & { targetings: SemanticRuleTargeting[] },
    query: ResolveRuntimeSemanticRuleSetQueryDto
  ): number {
    if (!ruleSet.targetings.length) {
      return 0;
    }

    const matchedScores = ruleSet.targetings
      .map((targeting) => this.getSingleTargetingMatchScore(targeting, query))
      .filter((score) => score >= 0);

    return matchedScores.length > 0 ? Math.max(...matchedScores) : -1;
  }

  private getSingleTargetingMatchScore(
    targeting: SemanticRuleTargeting,
    query: ResolveRuntimeSemanticRuleSetQueryDto
  ): number {
    const configuredGroups: unknown[] = [
      targeting.environments,
      this.getTargetingHosts(targeting),
      targeting.tenantIds,
      targeting.userIds,
      targeting.skillIds,
      targeting.pageTypes,
    ];

    if (
      !this.matchesStringList(targeting.environments, query.environment) ||
      !this.matchesStringList(this.getTargetingHosts(targeting), query.host) ||
      !this.matchesStringList(targeting.tenantIds, query.tenant_id) ||
      !this.matchesStringList(targeting.userIds, query.user_id) ||
      !this.matchesStringList(targeting.skillIds, query.skill_id) ||
      !this.matchesStringList(targeting.pageTypes, query.page_type)
    ) {
      return -1;
    }

    let score = 0;
    for (const value of configuredGroups) {
      if (this.normalizeStringList(value).length > 0) {
        score += 1;
      }
    }

    return score;
  }

  private matchesStringList(value: unknown, actual?: string): boolean {
    const configured = this.normalizeStringList(value);
    if (configured.length === 0) {
      return true;
    }
    if (!actual?.trim()) {
      return false;
    }

    const normalizedActual = actual.trim().toLowerCase();
    return configured.includes(normalizedActual);
  }

  private normalizeStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim().toLowerCase());
  }

  private getTargetingHosts(targeting: SemanticRuleTargeting): unknown {
    return (targeting as unknown as Record<string, unknown>).hosts;
  }
}
