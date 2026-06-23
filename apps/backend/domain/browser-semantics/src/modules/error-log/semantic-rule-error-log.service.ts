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
    const logs = await this.prisma.semanticRuleErrorLog.findMany({
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

    if (
      !query.login_status &&
      !query.login_reason &&
      !query.read_status &&
      !query.read_reason &&
      !query.navigation_status &&
      !query.navigation_reason &&
      !query.field_fill_status &&
      !query.field_fill_reason &&
      !query.action_status &&
      !query.action_reason
    ) {
      return logs;
    }

    return logs.filter((log) => {
      const loginMetadata = this.extractLoginMetadata(log);
      const readMetadata = this.extractReadMetadata(log);
      const navigationMetadata = this.extractNavigationMetadata(log);
      const fieldFillMetadata = this.extractFieldFillMetadata(log);
      const actionMetadata = this.extractActionMetadata(log);

      if (query.login_status && loginMetadata?.status !== query.login_status) {
        return false;
      }

      if (query.login_reason && loginMetadata?.reason !== query.login_reason) {
        return false;
      }

      if (query.read_status && readMetadata?.status !== query.read_status) {
        return false;
      }

      if (query.read_reason && readMetadata?.reason !== query.read_reason) {
        return false;
      }

      if (query.navigation_status && navigationMetadata?.status !== query.navigation_status) {
        return false;
      }

      if (query.navigation_reason && navigationMetadata?.reason !== query.navigation_reason) {
        return false;
      }

      if (query.field_fill_status && fieldFillMetadata?.status !== query.field_fill_status) {
        return false;
      }

      if (query.field_fill_reason && fieldFillMetadata?.reason !== query.field_fill_reason) {
        return false;
      }

      if (query.action_status && actionMetadata?.status !== query.action_status) {
        return false;
      }

      if (query.action_reason && actionMetadata?.reason !== query.action_reason) {
        return false;
      }

      return true;
    });
  }

  private extractLoginMetadata(log: {
    normalizedSemantic: unknown;
    parserOutput: unknown;
  }): { status?: string; reason?: string } | null {
    return this.extractMetadataNode(log, 'login');
  }

  private extractNavigationMetadata(log: {
    normalizedSemantic: unknown;
    parserOutput: unknown;
  }): { status?: string; reason?: string } | null {
    return this.extractMetadataNode(log, 'navigation');
  }

  private extractReadMetadata(log: {
    normalizedSemantic: unknown;
    parserOutput: unknown;
  }): { status?: string; reason?: string } | null {
    return this.extractMetadataNode(log, 'read');
  }

  private extractFieldFillMetadata(log: {
    normalizedSemantic: unknown;
    parserOutput: unknown;
  }): { status?: string; reason?: string } | null {
    return this.extractMetadataNode(log, 'fieldFill');
  }

  private extractActionMetadata(log: {
    normalizedSemantic: unknown;
    parserOutput: unknown;
  }): { status?: string; reason?: string } | null {
    return this.extractMetadataNode(log, 'action');
  }

  private extractMetadataNode(
    log: { normalizedSemantic: unknown; parserOutput: unknown },
    key: 'login' | 'navigation' | 'fieldFill' | 'action' | 'read'
  ): { status?: string; reason?: string } | null {
    const normalizedSemantic = this.asRecord(log.normalizedSemantic);
    const parserOutput = this.asRecord(log.parserOutput);
    const normalizedNode = this.asRecord(this.asRecord(normalizedSemantic?.parser_metadata)?.[key]);
    const parserNode = this.asRecord(this.asRecord(parserOutput?.metadata)?.[key]);
    const metadata = normalizedNode || parserNode;

    if (!metadata) {
      return null;
    }

    return {
      status: typeof metadata.status === 'string' ? metadata.status : undefined,
      reason: typeof metadata.reason === 'string' ? metadata.reason : undefined,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
}
