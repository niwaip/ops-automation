import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  HTTP_REQUEST_ACTIVITY_KEY,
  STRUCTURED_TRANSFORM_ACTIVITY_KEY,
  BuiltinActivityRegistry,
} from '../builtin-activity.registry';
import type { ActivityPluginJsonSchema, ActivityPluginManifest } from './activity-plugin.types';

const objectSchema = (
  properties: Record<string, ActivityPluginJsonSchema>,
  required: string[] = []
): ActivityPluginJsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

@Injectable()
export class ActivityPluginRegistryService {
  private readonly manifests = new Map<string, ActivityPluginManifest>();

  constructor(private readonly builtinActivityRegistry: BuiltinActivityRegistry) {
    this.registerBuiltinPlugins();
  }

  list(): ActivityPluginManifest[] {
    return Array.from(this.manifests.values());
  }

  getByRef(ref: string): ActivityPluginManifest | null {
    return this.manifests.get(String(ref || '').trim()) || null;
  }

  private registerBuiltinPlugins(): void {
    const http = this.requireBuiltin(HTTP_REQUEST_ACTIVITY_KEY);
    const transform = this.requireBuiltin(STRUCTURED_TRANSFORM_ACTIVITY_KEY);
    const stringMap: ActivityPluginJsonSchema = objectSchema({}, []);
    stringMap.additionalProperties = { type: ['string', 'number', 'boolean'] };

    this.manifests.set(http.ref, {
      ref: http.ref,
      version: http.version,
      activityKey: http.key,
      activityFn: http.fn,
      stepConfigKey: String(http.config.stepConfigKey),
      discovery: {
        name: http.name,
        description: http.description || '调用外部 HTTP API',
        useCases: ['查询 JSON API', '调用 REST 接口', '获取外部数据'],
      },
      contracts: {
        implementationSpecSchema: objectSchema(
          {
            method: {
              type: 'string',
              enum: http.config.supportedMethods || ['GET'],
              default: 'GET',
            },
            urlTemplate: { type: 'string', minLength: 1 },
            queryTemplate: stringMap,
            headersTemplate: stringMap,
            jsonTemplate: { type: 'object' },
            dataTemplate: {},
            timeout: { type: 'number', minimum: 1, maximum: 300, default: 30 },
            responseMode: {
              type: 'string',
              enum: ['body', 'full', 'bodyPath', 'bodyMap'],
              default: 'body',
            },
            responseBodyPath: { type: 'string', default: '' },
            responseFieldMappings: {
              type: 'object',
              additionalProperties: { type: 'string', minLength: 1 },
            },
          },
          ['method', 'urlTemplate', 'timeout', 'responseMode']
        ),
        runtimeInputSchema: objectSchema(
          {
            method: { type: 'string' },
            url: { type: 'string', minLength: 1 },
            headers: { type: 'object' },
            params: { type: 'object' },
            json: {},
            data: {},
            timeout: { type: 'number', minimum: 1, maximum: 300 },
          },
          ['method', 'url', 'timeout']
        ),
        runtimeOutputSchema: objectSchema(
          {
            status: { const: 'success' },
            ok: { const: true },
            method: { type: 'string' },
            url: { type: 'string' },
            statusCode: { type: 'number' },
            headers: { type: 'object' },
            body: {},
            text: { type: 'string' },
          },
          ['status', 'ok', 'method', 'url', 'statusCode', 'headers', 'body', 'text']
        ),
      },
      synthesis: { mode: 'spec', maxInputTokens: 2500, maxOutputTokens: 1200 },
      runtime: {
        timeout: http.timeout,
        retryPolicy: http.retryPolicy,
        implementationHash: this.hash(http.generatedCode),
      },
      validation: { supportsRealProbe: true, safeProbeMethods: ['GET', 'HEAD', 'OPTIONS'] },
    });

    this.manifests.set(transform.ref, {
      ref: transform.ref,
      version: transform.version,
      activityKey: transform.key,
      activityFn: transform.fn,
      stepConfigKey: String(transform.config.stepConfigKey),
      discovery: {
        name: transform.name,
        description: transform.description || '使用固定映射规则转换结构化数据',
        useCases: ['JSONPath 字段投影', '固定格式转换', '文本模板渲染'],
        negativeUseCases: ['需要语义理解或内容总结'],
      },
      contracts: {
        implementationSpecSchema: objectSchema(
          {
            contentType: { type: 'string', enum: ['text', 'html', 'json'], default: 'text' },
            contentTemplate: { type: 'string', minLength: 1, default: '{content}' },
            instructionTemplate: { type: 'string', default: '' },
            outputMode: { type: 'string', enum: ['json', 'text'], default: 'json' },
            outputSchema: { type: 'object' },
            contextTemplate: { type: 'string', default: '' },
            fieldMappings: {
              type: 'object',
              additionalProperties: { type: 'string', minLength: 1 },
            },
            textTemplate: { type: 'string', default: '' },
          },
          ['contentType', 'contentTemplate', 'outputMode']
        ),
        runtimeInputSchema: objectSchema(
          {
            content: {},
            contentType: { type: 'string' },
            instruction: { type: 'string' },
            outputMode: { type: 'string' },
            outputSchema: { type: 'object' },
            context: {},
            fieldMappings: { type: 'object' },
            textTemplate: { type: 'string' },
          },
          ['content', 'contentType', 'outputMode']
        ),
        runtimeOutputSchema: objectSchema(
          {
            status: { const: 'success' },
            mode: { const: 'fixed' },
            outputMode: { type: 'string', enum: ['json', 'text'] },
            result: {},
            raw: { type: 'string' },
          },
          ['status', 'mode', 'outputMode', 'result', 'raw']
        ),
      },
      synthesis: {
        mode: 'expression',
        maxInputTokens: 3500,
        maxOutputTokens: 1600,
        allowedExpressionLanguage: 'jsonpath',
      },
      runtime: {
        timeout: transform.timeout,
        retryPolicy: transform.retryPolicy,
        implementationHash: this.hash(transform.generatedCode),
      },
      validation: { supportsRealProbe: true },
    });
  }

  private requireBuiltin(key: string) {
    const builtin = this.builtinActivityRegistry.getByKey(key);
    if (!builtin) {
      throw new Error(`Missing builtin Activity for plugin: ${key}`);
    }
    return builtin;
  }

  private hash(value: string): string {
    return `sha256:${createHash('sha256').update(value).digest('hex')}`;
  }
}
