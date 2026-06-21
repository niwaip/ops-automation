import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getBrowserSemanticsServiceUrl } from '../config/service-endpoints';

export interface ResolveRuntimeSemanticRuleSetQuery {
  domain_code: string;
  environment?: string;
  tenant_id?: string;
  user_id?: string;
  skill_id?: string;
  host?: string;
  page_type?: string;
}

export interface RuntimeSemanticRule {
  id?: string;
  type?: string;
  name?: string;
  enabled?: boolean;
  priority?: number;
  stopOnMatch?: boolean;
  flags?: string;
  patterns?: unknown;
  outputs?: Record<string, unknown>;
}

export interface RuntimeResolvedSemanticRuleSet {
  rule_set_id: string;
  version: string;
  status: 'CANARY' | 'ACTIVE';
  rules: RuntimeSemanticRule[];
}

export interface CreateSemanticRuleHitLogPayload {
  domain_code: string;
  rule_set_id?: string;
  matched_rule_ids: string[];
  input_text: string;
  normalized_input?: string;
  page_type?: string;
  trace_id?: string;
  used_ai_fallback: boolean;
  final_execution_success?: boolean;
  normalized_semantic?: Record<string, unknown>;
}

export interface CreateSemanticRuleErrorLogPayload {
  domain_code: string;
  rule_set_id?: string;
  source: string;
  error_type: string;
  error_code?: string;
  error_message: string;
  input_text?: string;
  normalized_input?: string;
  trace_id?: string;
  session_id?: string;
  task_id?: string;
  step_id?: string;
  page_url?: string;
  page_title?: string;
  host?: string;
  page_type?: string;
  observation_summary?: string;
  candidate_summary?: Record<string, unknown>;
  matched_rule_ids?: string[];
  normalized_semantic?: Record<string, unknown>;
  parser_output?: Record<string, unknown>;
  ai_fallback_input?: Record<string, unknown>;
  ai_fallback_output?: Record<string, unknown>;
  screenshot_url?: string;
  dom_snippet?: string;
  locator_info?: Record<string, unknown>;
  console_errors?: string[];
  metadata?: Record<string, unknown>;
}

@Injectable()
export class BrowserSemanticsClient {
  private readonly logger = new Logger(BrowserSemanticsClient.name);

  private getBaseUrl(): string {
    return getBrowserSemanticsServiceUrl();
  }

  async resolveRuntimeRuleSet(
    query: ResolveRuntimeSemanticRuleSetQuery
  ): Promise<RuntimeResolvedSemanticRuleSet | null> {
    try {
      const response = await axios.get<RuntimeResolvedSemanticRuleSet | null>(
        `${this.getBaseUrl()}/runtime/semantic-rules/resolve`,
        { params: query, timeout: 2000 }
      );
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to resolve runtime semantic rules: ${message}`);
      return null;
    }
  }

  async createHitLog(payload: CreateSemanticRuleHitLogPayload): Promise<void> {
    try {
      await axios.post(`${this.getBaseUrl()}/runtime/semantic-rules/hit-logs`, payload, {
        timeout: 2000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to create semantic rule hit log: ${message}`);
    }
  }

  async createErrorLog(payload: CreateSemanticRuleErrorLogPayload): Promise<void> {
    try {
      await axios.post(`${this.getBaseUrl()}/runtime/semantic-rules/error-logs`, payload, {
        timeout: 2000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to create semantic rule error log: ${message}`);
    }
  }
}
