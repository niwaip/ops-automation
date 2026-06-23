import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSemanticRuleHitLogDto, ListSemanticRuleHitLogsQueryDto } from './semantic-rule-hit-log.dto';

@Injectable()
export class SemanticRuleHitLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSemanticRuleHitLogDto) {
    const domain = await this.prisma.semanticRuleDomain.findUnique({
      where: { code: dto.domain_code },
    });

    if (!domain) {
      return {
        created: false,
        reason: `Unknown domain: ${dto.domain_code}`,
      };
    }

    return this.prisma.semanticRuleHitLog.create({
      data: {
        domainId: domain.id,
        ruleSetId: dto.rule_set_id,
        matchedRuleIds: dto.matched_rule_ids,
        inputText: dto.input_text,
        normalizedInput: dto.normalized_input,
        pageType: dto.page_type,
        traceId: dto.trace_id,
        normalizedSemantic: dto.normalized_semantic
          ? JSON.parse(JSON.stringify(dto.normalized_semantic))
          : undefined,
        usedAiFallback: dto.used_ai_fallback,
        finalExecutionSuccess: dto.final_execution_success,
      },
    });
  }

  async list(query: ListSemanticRuleHitLogsQueryDto) {
    return this.prisma.semanticRuleHitLog.findMany({
      where: {
        ruleSetId: query.rule_set_id,
        traceId: query.trace_id,
        domain: query.domain_code ? { code: query.domain_code } : undefined,
      },
      include: {
        domain: true,
        ruleSet: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
  }
}
