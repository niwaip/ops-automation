import { Injectable, Logger } from '@nestjs/common';
import { getBrowserTemplateServiceUrl } from '../../config/service-endpoints';

export interface TemplateStep {
  step_id: string;
  action: string;
  params?: Record<string, unknown>;
  on_fail?: string;
  execution_policy?:
    | 'auto_execute'
    | 'require_confirmation'
    | 'require_takeover'
    | 'forbid_in_replay';
  locator?: { type: string; value: string; fallback?: { type: string; value: string } };
  output_var?: string;
  description?: string;
  branch?: {
    condition_fn: string;
    on_match: 'continue' | 'stop';
    on_mismatch: 'continue' | 'stop' | 'takeover';
    takeover_reason?: string;
    description?: string;
  };
}

export interface TemplateParamSchemaProperty {
  type?: string;
  description?: string;
  default?: unknown;
  required?: boolean;
}

export interface TemplateParamsSchema {
  type?: string;
  properties?: Record<string, TemplateParamSchemaProperty>;
  required?: string[];
}

export interface Template {
  id: string;
  name: string;
  steps: TemplateStep[];
  params_schema?: TemplateParamsSchema;
  config?: Record<string, unknown>;
}

@Injectable()
export class TemplateClient {
  private readonly logger = new Logger(TemplateClient.name);
  private readonly templateServiceUrl = getBrowserTemplateServiceUrl();

  async getTemplate(templateId: string): Promise<Template | null> {
    try {
      const response = await fetch(`${this.templateServiceUrl}/templates/${templateId}`);
      if (!response.ok) {
        this.logger.error(`Failed to fetch template ${templateId}: ${response.status}`);
        return null;
      }
      return (await response.json()) as Template;
    } catch (error) {
      this.logger.error(`Error fetching template ${templateId}:`, error);
      return null;
    }
  }
}
