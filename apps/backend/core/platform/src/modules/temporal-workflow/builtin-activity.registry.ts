import { Injectable } from '@nestjs/common';
import {
  FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_CODE,
  FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_FN,
  FIXED_DOCUMENT_RENDER_ACTIVITY_CODE,
  FIXED_DOCUMENT_RENDER_ACTIVITY_FN,
  FIXED_HTTP_REQUEST_ACTIVITY_CODE,
  FIXED_HTTP_REQUEST_ACTIVITY_FN,
  FIXED_STRUCTURED_TRANSFORM_ACTIVITY_CODE,
  FIXED_STRUCTURED_TRANSFORM_ACTIVITY_FN,
} from './fixed-activity-templates';

export interface BuiltinActivityDefinition {
  key: string;
  ref: string;
  version: string;
  name: string;
  fn: string;
  timeout: string;
  retryPolicy?: { maxRetries?: number; backoffMs?: number };
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
  generatedCode: string;
  readonly: true;
  description?: string;
}

export const BUILTIN_ACTIVITY_REF_PREFIX = 'builtin:';
export const DOCUMENT_RENDER_ACTIVITY_KEY = 'documentRender';
export const HTTP_REQUEST_ACTIVITY_KEY = 'httpRequest';
export const STRUCTURED_TRANSFORM_ACTIVITY_KEY = 'structuredTransform';
export const AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY = 'aiStructuredTransform';
export const HTTP_REQUEST_STEP_CONFIG_KEY = '__httpRequest';
export const STRUCTURED_TRANSFORM_STEP_CONFIG_KEY = '__structuredTransform';

@Injectable()
export class BuiltinActivityRegistry {
  private readonly activities = new Map<string, BuiltinActivityDefinition>();

  constructor() {
    const documentRender: BuiltinActivityDefinition = {
      key: DOCUMENT_RENDER_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${DOCUMENT_RENDER_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: '文档渲染',
      fn: FIXED_DOCUMENT_RENDER_ACTIVITY_FN,
      timeout: '60s',
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      handler: 'carbone',
      config: {},
      generatedCode: FIXED_DOCUMENT_RENDER_ACTIVITY_CODE,
      readonly: true,
      description: '系统内置 Carbone 文档渲染 Activity',
    };
    const httpRequest: BuiltinActivityDefinition = {
      key: HTTP_REQUEST_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${HTTP_REQUEST_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: 'HTTP 请求',
      fn: FIXED_HTTP_REQUEST_ACTIVITY_FN,
      timeout: '30s',
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      handler: 'api',
      config: {
        supportedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        stepConfigKey: HTTP_REQUEST_STEP_CONFIG_KEY,
        defaultStepConfig: {
          method: 'GET',
          urlTemplate: '',
          queryTemplate: {},
          headersTemplate: {},
          jsonTemplate: {},
          timeout: 30,
          responseMode: 'body',
          responseBodyPath: '',
        },
      },
      generatedCode: FIXED_HTTP_REQUEST_ACTIVITY_CODE,
      readonly: true,
      description: '系统内置通用 HTTP 请求 Activity',
    };
    const structuredTransform: BuiltinActivityDefinition = {
      key: STRUCTURED_TRANSFORM_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${STRUCTURED_TRANSFORM_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: '结构化转换(固定规则)',
      fn: FIXED_STRUCTURED_TRANSFORM_ACTIVITY_FN,
      timeout: '90s',
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      handler: 'api',
      config: {
        supportedContentTypes: ['text', 'html', 'json'],
        supportedOutputModes: ['json', 'text'],
        stepConfigKey: STRUCTURED_TRANSFORM_STEP_CONFIG_KEY,
        defaultStepConfig: {
          contentType: 'text',
          contentTemplate: '',
          instructionTemplate: '',
          outputMode: 'json',
          outputSchema: {},
          contextTemplate: '',
          fieldMappings: {},
          textTemplate: '',
        },
      },
      generatedCode: FIXED_STRUCTURED_TRANSFORM_ACTIVITY_CODE,
      readonly: true,
      description: '系统内置固定规则结构化转换 Activity，使用字段映射和文本模板完成提取、映射和格式化，不调用 AI',
    };
    const aiStructuredTransform: BuiltinActivityDefinition = {
      key: AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: '结构化转换(AI)',
      fn: FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_FN,
      timeout: '90s',
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      handler: 'api',
      config: {
        supportedContentTypes: ['text', 'html', 'json'],
        supportedOutputModes: ['json', 'text'],
        stepConfigKey: STRUCTURED_TRANSFORM_STEP_CONFIG_KEY,
        defaultStepConfig: {
          contentType: 'text',
          contentTemplate: '',
          instructionTemplate: '',
          outputMode: 'json',
          outputSchema: {},
          contextTemplate: '',
        },
      },
      generatedCode: FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_CODE,
      readonly: true,
      description: '系统内置 AI 结构化转换 Activity，适用于无法用固定字段映射和文本模板表达的提取、归纳与格式化',
    };

    this.activities.set(documentRender.key, documentRender);
    this.activities.set(httpRequest.key, httpRequest);
    this.activities.set(structuredTransform.key, structuredTransform);
    this.activities.set(aiStructuredTransform.key, aiStructuredTransform);
  }

  list(): BuiltinActivityDefinition[] {
    return Array.from(this.activities.values());
  }

  getByKey(key: string): BuiltinActivityDefinition | null {
    return this.activities.get(String(key || '').trim()) || null;
  }

  getByRef(ref: string): BuiltinActivityDefinition | null {
    const normalized = String(ref || '').trim();
    if (!normalized.startsWith(BUILTIN_ACTIVITY_REF_PREFIX)) {
      return null;
    }
    return this.getByKey(normalized.slice(BUILTIN_ACTIVITY_REF_PREFIX.length));
  }

  getByFn(fn: string): BuiltinActivityDefinition | null {
    const normalized = String(fn || '').trim();
    return this.list().find((activity) => activity.fn === normalized) || null;
  }

  findByLegacyIdentifier(identifier: string): BuiltinActivityDefinition | null {
    const normalized = String(identifier || '').trim();
    if (!normalized) {
      return null;
    }
    return this.list().find((activity) =>
      activity.key === normalized
      || activity.ref === normalized
      || activity.fn === normalized
      || activity.name === normalized,
    ) || null;
  }
}
