import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSemanticRuleErrorLogDto,
  ListSemanticRuleErrorLogsQueryDto,
} from './semantic-rule-error-log.dto';

@Injectable()
export class SemanticRuleErrorLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSemanticRuleErrorLogDto) {
    const domain = await this.prisma.semanticRuleDomain.findUnique({
      where: { code: dto.domain_code },
    });

    if (!domain) {
      return {
        created: false,
        reason: `Unknown domain: ${dto.domain_code}`,
      };
    }

    return this.prisma.semanticRuleErrorLog.create({
      data: {
        domainId: domain.id,
        ruleSetId: dto.rule_set_id,
        source: dto.source,
        errorType: dto.error_type,
        errorCode: dto.error_code,
        errorMessage: dto.error_message,
        inputText: dto.input_text,
        normalizedInput: dto.normalized_input,
        traceId: dto.trace_id,
        sessionId: dto.session_id,
        taskId: dto.task_id,
        stepId: dto.step_id,
        pageUrl: dto.page_url,
        pageTitle: dto.page_title,
        host: dto.host,
        pageType: dto.page_type,
        observationSummary: dto.observation_summary,
        candidateSummary: dto.candidate_summary
          ? JSON.parse(JSON.stringify(dto.candidate_summary))
          : undefined,
        matchedRuleIds: dto.matched_rule_ids
          ? JSON.parse(JSON.stringify(dto.matched_rule_ids))
          : undefined,
        normalizedSemantic: dto.normalized_semantic
          ? JSON.parse(JSON.stringify(dto.normalized_semantic))
          : undefined,
        parserOutput: dto.parser_output
          ? JSON.parse(JSON.stringify(dto.parser_output))
          : undefined,
        aiFallbackInput: dto.ai_fallback_input
          ? JSON.parse(JSON.stringify(dto.ai_fallback_input))
          : undefined,
        aiFallbackOutput: dto.ai_fallback_output
          ? JSON.parse(JSON.stringify(dto.ai_fallback_output))
          : undefined,
        screenshotUrl: dto.screenshot_url,
        domSnippet: dto.dom_snippet,
        locatorInfo: dto.locator_info
          ? JSON.parse(JSON.stringify(dto.locator_info))
          : undefined,
        consoleErrors: dto.console_errors
          ? JSON.parse(JSON.stringify(dto.console_errors))
          : undefined,
        metadata: dto.metadata ? JSON.parse(JSON.stringify(dto.metadata)) : undefined,
      },
      include: {
        domain: true,
        ruleSet: true,
      },
    });
  }

  async list(query: ListSemanticRuleErrorLogsQueryDto) {
    return this.prisma.semanticRuleErrorLog.findMany({
      where: {
        ruleSetId: query.rule_set_id,
        traceId: query.trace_id,
        source: query.source,
        errorType: query.error_type,
        host: query.host,
        pageType: query.page_type,
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
