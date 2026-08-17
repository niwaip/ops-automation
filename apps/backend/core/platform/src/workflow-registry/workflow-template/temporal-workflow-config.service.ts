import { Injectable, Logger, Optional } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import { ActivityPluginProbeService } from '../../modules/temporal-workflow/activity-plugin/activity-plugin-probe.service';
import { buildHttpPluginRuntimeInput } from '../../modules/temporal-workflow/activity-plugin/activity-plugin-runtime-input';

@Injectable()
export class TemporalWorkflowConfigService {
  private readonly logger = new Logger(TemporalWorkflowConfigService.name);

  constructor(
    @Optional() private readonly activityPluginProbeService?: ActivityPluginProbeService
  ) {}

  async optimizeHttpRequestConfig(
    stepConfig: Record<string, any>,
    inputParams: Record<string, any> = {},
    userRequest?: string
  ): Promise<{
    success: boolean;
    optimizedConfig?: Record<string, any>;
    previewResponse?: Record<string, any>;
    explanation?: string;
    error?: string;
  }> {
    const userGoal = String(userRequest || '').trim();
    if (!userGoal) {
      return { success: false, error: '请先输入希望 AI 优化的目标描述' };
    }

    try {
      const previewResult = await this.previewHttpRequestConfig(stepConfig, inputParams);
      if (
        !previewResult.success ||
        !previewResult.previewResponse ||
        !previewResult.resolvedRequest ||
        !previewResult.baseConfig
      ) {
        return {
          success: false,
          error: previewResult.error || '预览当前 HTTP 配置失败',
        };
      }
      const baseConfig = previewResult.baseConfig;
      const resolvedRequest = previewResult.resolvedRequest;
      const previewResponse = previewResult.previewResponse;
      const aiResult = await this.requestAiOptimizedHttpConfig(
        baseConfig,
        resolvedRequest,
        previewResponse,
        userGoal
      );
      const optimizedConfig = this.mergeHttpConfigWithAiResult(baseConfig, aiResult);
      const optimizedPreview = await this.previewHttpRequestConfig(optimizedConfig, inputParams);
      if (!optimizedPreview.success || !optimizedPreview.previewResponse) {
        return {
          success: false,
          error: `AI 配置未通过固定 Activity 真实探测: ${optimizedPreview.error || '未知错误'}`,
        };
      }

      return {
        success: true,
        optimizedConfig,
        previewResponse: optimizedPreview.previewResponse,
        explanation: typeof aiResult?.reason === 'string' ? aiResult.reason : undefined,
      };
    } catch (error: any) {
      this.logger.error(`Optimize httpRequest config failed: ${error.message}`);
      return {
        success: false,
        error: error.message || 'AI 优化失败',
      };
    }
  }

  async previewHttpRequestConfig(
    stepConfig: Record<string, any>,
    inputParams: Record<string, any> = {}
  ): Promise<{
    success: boolean;
    baseConfig?: Record<string, any>;
    resolvedRequest?: Record<string, any>;
    previewResponse?: Record<string, any>;
    error?: string;
  }> {
    try {
      const baseConfig = this.normalizeHttpRequestConfig(stepConfig);
      this.assertHttpRequestPreviewInputs(baseConfig, inputParams);
      const resolvedRequest = this.activityPluginProbeService
        ? buildHttpPluginRuntimeInput(baseConfig, inputParams)
        : this.buildHttpRequestPreviewInput(baseConfig, inputParams);
      const previewResponse = this.activityPluginProbeService
        ? await this.executeHttpActivityPluginProbe(baseConfig, inputParams)
        : await this.executeHttpPreviewRequest(resolvedRequest);
      return {
        success: true,
        baseConfig,
        resolvedRequest,
        previewResponse,
      };
    } catch (error: any) {
      this.logger.error(`Preview httpRequest config failed: ${error.message}`);
      return {
        success: false,
        error: error.message || '预览当前 HTTP 配置失败',
      };
    }
  }

  async generateStructuredTransformConfig(
    sourceSample: Record<string, any> | string,
    userRequest: string,
    existingConfig?: Record<string, any>
  ): Promise<{
    success: boolean;
    config?: Record<string, any>;
    explanation?: string;
    error?: string;
  }> {
    const userGoal = String(userRequest || '').trim();
    if (!userGoal) {
      return { success: false, error: '请先输入希望 AI 生成的结构化转换目标描述' };
    }
    try {
      const aiResult = await this.requestAiStructuredTransformConfig(
        typeof existingConfig === 'object' && existingConfig
          ? this.normalizeStructuredTransformConfig(existingConfig)
          : {},
        sourceSample,
        userGoal
      );
      const normalized = this.normalizeStructuredTransformConfig(aiResult || {});
      if (this.activityPluginProbeService) {
        const probe = await this.activityPluginProbeService.probe({
          spec: {
            pluginRef: 'builtin:structuredTransform',
            pluginVersion: '1.0.0',
            config: normalized,
          },
          sampleInput: sourceSample,
        });
        if (!probe.success) {
          return {
            success: false,
            error: `生成配置未通过固定 Activity 真实探测: ${probe.diagnostics
              .map((item) => item.message)
              .join('; ')}`,
          };
        }
      }
      return {
        success: true,
        config: normalized,
        explanation: typeof aiResult?.reason === 'string' ? aiResult.reason : undefined,
      };
    } catch (error: any) {
      this.logger.error(`Generate structuredTransform config failed: ${error.message}`);
      return { success: false, error: error.message || 'AI 生成结构化配置失败' };
    }
  }

  async generateAiStructuredTransformDraftConfig(
    sourceSample: Record<string, any> | string,
    userRequest: string,
    existingConfig?: Record<string, any>
  ): Promise<{
    success: boolean;
    config?: Record<string, any>;
    sampleOutput?: unknown;
    explanation?: string;
    error?: string;
  }> {
    const userGoal = String(userRequest || '').trim();
    if (!userGoal) {
      return { success: false, error: '请先输入希望 AI 生成的 AI 转换目标描述' };
    }
    try {
      const aiResult = await this.requestAiStructuredTransformDraftConfig(
        typeof existingConfig === 'object' && existingConfig
          ? this.normalizeStructuredTransformConfig(existingConfig)
          : {},
        sourceSample,
        userGoal
      );
      const normalized = this.normalizeStructuredTransformConfig(aiResult || {});
      return {
        success: true,
        config: normalized,
        sampleOutput: this.sanitizeJsonValue(aiResult?.sampleOutput),
        explanation: typeof aiResult?.reason === 'string' ? aiResult.reason : undefined,
      };
    } catch (error: any) {
      this.logger.error(`Generate aiStructuredTransform draft config failed: ${error.message}`);
      return { success: false, error: error.message || 'AI 生成 AI 转换配置失败' };
    }
  }

  normalizeHttpRequestConfig(
    stepConfig: Record<string, any>,
    declaredInputKeys: Set<string> = new Set<string>()
  ): Record<string, any> {
    void declaredInputKeys;
    const normalizedConfig = this.sanitizeJsonValue(stepConfig || {}) as Record<string, any>;
    const sanitizeTemplateString = (value: unknown): string =>
      String(value || '')
        .trim()
        .replace(/^`+/, '')
        .replace(/`+$/, '')
        .replace(/`/g, '')
        .trim();
    const sanitizeTemplateRecord = (value: unknown): Record<string, any> => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
      }
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          sanitizeTemplateString(key),
          typeof item === 'string' ? sanitizeTemplateString(item) : item,
        ])
      );
    };

    const baseConfig = {
      method: String(normalizedConfig.method || 'GET').toUpperCase(),
      urlTemplate: sanitizeTemplateString(normalizedConfig.urlTemplate),
      queryTemplate: sanitizeTemplateRecord(normalizedConfig.queryTemplate),
      headersTemplate: sanitizeTemplateRecord(normalizedConfig.headersTemplate),
      jsonTemplate: sanitizeTemplateRecord(normalizedConfig.jsonTemplate),
      dataTemplate: sanitizeTemplateRecord(normalizedConfig.dataTemplate),
      timeout: Number(normalizedConfig.timeout || 30),
      responseMode: String(normalizedConfig.responseMode || 'body'),
      responseBodyPath: String(normalizedConfig.responseBodyPath || ''),
      responseFieldMappings: sanitizeTemplateRecord(normalizedConfig.responseFieldMappings),
    };

    if (!baseConfig.urlTemplate) {
      throw new Error('请先填写 URL 模板');
    }
    return baseConfig;
  }

  normalizeStructuredTransformConfig(
    stepConfig: Record<string, any>,
    declaredInputKeys: Set<string> = new Set<string>()
  ): Record<string, any> {
    void declaredInputKeys;
    const normalizedConfig = this.sanitizeJsonValue(stepConfig || {}) as Record<string, any>;
    const sanitizeTemplateString = (value: unknown): string => {
      const rawValue =
        typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value || '');
      return rawValue.trim().replace(/^`+/, '').replace(/`+$/, '').replace(/`/g, '').trim();
    };
    const sanitizeTemplateRecord = (value: unknown): Record<string, any> => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
      }
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          sanitizeTemplateString(key),
          typeof item === 'string' ? sanitizeTemplateString(item) : item,
        ])
      );
    };

    const normalizedContentTemplate = sanitizeTemplateString(normalizedConfig.contentTemplate);
    const hasTemplatePlaceholder = /\{[^{}]+\}/.test(normalizedContentTemplate);

    return {
      contentType: String(normalizedConfig.contentType || 'text').toLowerCase(),
      contentTemplate: hasTemplatePlaceholder ? normalizedContentTemplate : '{content}',
      instructionTemplate: sanitizeTemplateString(
        normalizedConfig.instructionTemplate || normalizedConfig.instruction
      ),
      outputMode: String(normalizedConfig.outputMode || 'json').toLowerCase(),
      outputSchema:
        normalizedConfig.outputSchema &&
        typeof normalizedConfig.outputSchema === 'object' &&
        !Array.isArray(normalizedConfig.outputSchema)
          ? normalizedConfig.outputSchema
          : {},
      contextTemplate: sanitizeTemplateString(
        normalizedConfig.contextTemplate || normalizedConfig.context
      ),
      fieldMappings: sanitizeTemplateRecord(normalizedConfig.fieldMappings),
      textTemplate: sanitizeTemplateString(normalizedConfig.textTemplate),
    };
  }

  collectTemplateVariables(value: unknown, target: Set<string> = new Set<string>()): Set<string> {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/\{([^{}]+)\}/g)) {
        const variable = String(match[1] || '').trim();
        if (variable) {
          target.add(variable);
        }
      }
      return target;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this.collectTemplateVariables(item, target));
      return target;
    }
    if (value && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach((item) =>
        this.collectTemplateVariables(item, target)
      );
    }
    return target;
  }

  renderHttpTemplateValue(value: unknown, params: Record<string, any>): unknown {
    if (typeof value === 'string') {
      return value.replace(/\{([^{}]+)\}/g, (_match, key) => {
        const resolved = params?.[String(key).trim()];
        return resolved === undefined || resolved === null ? '' : String(resolved);
      });
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.renderHttpTemplateValue(item, params));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          this.renderHttpTemplateValue(item, params),
        ])
      );
    }
    return value;
  }

  private pruneHttpTemplateValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.pruneHttpTemplateValue(item))
        .filter(
          (item) =>
            ![undefined, null, '', '{}', '[]'].includes(
              typeof item === 'string' ? item : JSON.stringify(item)
            )
        );
    }
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
        (acc, [key, item]) => {
          const nextValue = this.pruneHttpTemplateValue(item);
          if (nextValue === undefined || nextValue === null) {
            return acc;
          }
          if (typeof nextValue === 'string' && !nextValue.trim()) {
            return acc;
          }
          if (typeof nextValue === 'object' && JSON.stringify(nextValue) === '{}') {
            return acc;
          }
          if (Array.isArray(nextValue) && nextValue.length === 0) {
            return acc;
          }
          acc[key] = nextValue;
          return acc;
        },
        {}
      );
    }
    return value;
  }

  private collectResponseLeafPaths(
    value: unknown,
    prefix = '',
    depth = 0,
    acc: Array<{ path: string; value: unknown }> = []
  ): Array<{ path: string; value: unknown }> {
    if (depth > 6) {
      return acc;
    }
    if (Array.isArray(value)) {
      value.slice(0, 8).forEach((item, index) => {
        const nextPath = prefix ? `${prefix}.${index}` : String(index);
        this.collectResponseLeafPaths(item, nextPath, depth + 1, acc);
      });
      return acc;
    }
    if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>)
        .slice(0, 24)
        .forEach(([key, item]) => {
          const nextPath = prefix ? `${prefix}.${key}` : key;
          this.collectResponseLeafPaths(item, nextPath, depth + 1, acc);
        });
      return acc;
    }
    if (prefix) {
      acc.push({ path: prefix, value });
    }
    return acc;
  }

  private buildHttpRequestPreviewInput(
    config: Record<string, any>,
    inputParams: Record<string, any>
  ): Record<string, any> {
    const renderedHeaders = this.pruneHttpTemplateValue(
      this.renderHttpTemplateValue(config.headersTemplate || {}, inputParams)
    );
    const normalizedHeaders =
      renderedHeaders && typeof renderedHeaders === 'object'
        ? { ...(renderedHeaders as Record<string, any>) }
        : {};
    if (!Object.keys(normalizedHeaders).some((key) => key.toLowerCase() === 'user-agent')) {
      normalizedHeaders['User-Agent'] = 'ops-automation-httpRequest-preview/1.0';
    }
    if (!Object.keys(normalizedHeaders).some((key) => key.toLowerCase() === 'accept')) {
      normalizedHeaders.Accept = 'application/json, text/plain, */*';
    }
    const renderedQuery = this.pruneHttpTemplateValue(
      this.renderHttpTemplateValue(config.queryTemplate || {}, inputParams)
    );
    const renderedJson = this.pruneHttpTemplateValue(
      this.renderHttpTemplateValue(config.jsonTemplate || {}, inputParams)
    );
    const renderedData = this.pruneHttpTemplateValue(
      this.renderHttpTemplateValue(config.dataTemplate || {}, inputParams)
    );

    const requestInput: Record<string, any> = {
      method: String(config.method || 'GET').toUpperCase(),
      url: String(this.renderHttpTemplateValue(config.urlTemplate || '', inputParams) || '').trim(),
      headers: normalizedHeaders,
      params: renderedQuery && typeof renderedQuery === 'object' ? renderedQuery : {},
      timeout: Number(config.timeout || 30),
    };
    if (
      renderedJson &&
      typeof renderedJson === 'object' &&
      Object.keys(renderedJson as Record<string, unknown>).length > 0
    ) {
      requestInput.json = renderedJson;
    }
    if (
      renderedData !== undefined &&
      renderedData !== null &&
      (typeof renderedData !== 'object' ||
        Object.keys(renderedData as Record<string, unknown>).length > 0)
    ) {
      requestInput.data = renderedData;
    }
    return requestInput;
  }

  private async executeHttpPreviewRequest(
    requestInput: Record<string, any>
  ): Promise<Record<string, any>> {
    const method = String(requestInput.method || 'GET').toUpperCase();
    const url = String(requestInput.url || '').trim();
    if (!url) {
      throw new Error('URL 模板渲染后为空，无法发起预览请求');
    }

    const executeOnce = async (targetUrl: string) => {
      const response = await axios.request({
        url: targetUrl,
        method: method as any,
        headers: requestInput.headers || {},
        params: requestInput.params || {},
        data: requestInput.json !== undefined ? requestInput.json : requestInput.data,
        timeout: Number(requestInput.timeout || 30) * 1000,
        validateStatus: () => true,
      });
      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data).slice(0, 400)}`);
      }
      return response;
    };

    try {
      const response = await executeOnce(url);
      return {
        method,
        url,
        statusCode: response.status,
        headers: response.headers || {},
        body: response.data,
        text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
      };
    } catch (error: any) {
      const shouldFallbackToHttp =
        url.startsWith('https://') &&
        /SSL|EPROTO|certificate|EOF/i.test(String(error?.message || ''));
      if (!shouldFallbackToHttp) {
        throw error;
      }
      const fallbackUrl = `http://${url.slice('https://'.length)}`;
      const response = await executeOnce(fallbackUrl);
      return {
        method,
        url: fallbackUrl,
        statusCode: response.status,
        headers: response.headers || {},
        body: response.data,
        text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
      };
    }
  }

  private async executeHttpActivityPluginProbe(
    config: Record<string, any>,
    inputParams: Record<string, any>
  ): Promise<Record<string, any>> {
    const probe = await this.activityPluginProbeService!.probe({
      spec: {
        pluginRef: 'builtin:httpRequest',
        pluginVersion: '1.0.0',
        config,
      },
      inputParams,
    });
    if (!probe.success || !probe.runtimeOutput) {
      throw new Error(probe.diagnostics.map((item) => item.message).join('; ') || '真实探测失败');
    }
    return probe.runtimeOutput;
  }

  private async requestAiOptimizedHttpConfig(
    config: Record<string, any>,
    resolvedRequest: Record<string, any>,
    previewResponse: Record<string, any>,
    userGoal: string
  ): Promise<Record<string, any>> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const responseBody = previewResponse.body ?? previewResponse;
    const responsePreview = JSON.stringify(responseBody, null, 2).slice(0, 20000);
    const responseLeafPaths = this.collectResponseLeafPaths(responseBody)
      .slice(0, 80)
      .map(({ path, value }) => `${path} = ${JSON.stringify(value)}`)
      .join('\n');
    const prompt = [
      '你是一个 HTTP API 配置优化助手，需要根据现有 httpRequest 配置、实际请求样本、真实响应结果，以及用户的自然语言目标，输出一个更合适的配置 JSON。',
      '目标是优化 Temporal Workflow 里的 httpRequest 步骤配置。',
      '',
      '要求：',
      '1. 只返回 JSON 对象，不要输出 Markdown。',
      '2. 仅允许输出字段：method, urlTemplate, queryTemplate, headersTemplate, jsonTemplate, dataTemplate, timeout, responseMode, responseBodyPath, responseFieldMappings, reason。',
      '3. 如果现有请求构造已经合理，不要随意改 method/urlTemplate/queryTemplate/jsonTemplate/dataTemplate。',
      '4. 如果用户目标只需要一个字段，优先推荐 responseMode=bodyPath，并填写 responseBodyPath。',
      '5. 如果用户目标需要多个字段，优先推荐 responseMode=bodyMap，并填写 responseFieldMappings。',
      '6. responseBodyPath 和 responseFieldMappings 的路径都必须相对于 body，不能带 body 前缀。',
      '7. responseFieldMappings 的 key 应该是简洁、业务化、稳定的英文或 camelCase 字段名，value 是响应体叶子路径。',
      '8. 只有在响应结构无法稳定映射时，才退回 responseMode=body 或 full，并在 reason 中说明。',
      '',
      `用户目标: ${userGoal}`,
      `当前步骤配置: ${JSON.stringify(config, null, 2)}`,
      `实际请求样本: ${JSON.stringify(resolvedRequest, null, 2)}`,
      `真实响应 body 样本: ${responsePreview}`,
      `可选叶子路径参考:\n${responseLeafPaths || '(无可用叶子路径)'}`,
    ].join('\n');

    const aiResponse = await axios.post<{ result: string }>(
      `${aiOrchestratorUrl}/ai/model/call`,
      {
        modelId: 'default',
        prompt,
      },
      { timeout: 360000 }
    );

    return this.parseJsonFromAiContent(aiResponse.data?.result || '');
  }

  private mergeHttpConfigWithAiResult(
    baseConfig: Record<string, any>,
    aiResult: Record<string, any>
  ): Record<string, any> {
    const nextConfig = {
      ...baseConfig,
      ...this.sanitizeJsonValue(aiResult || {}),
    };
    if (
      !['body', 'full', 'bodyPath', 'bodyMap'].includes(String(nextConfig.responseMode || 'body'))
    ) {
      nextConfig.responseMode = baseConfig.responseMode || 'body';
    }
    if (typeof nextConfig.responseBodyPath === 'string') {
      nextConfig.responseBodyPath = nextConfig.responseBodyPath.replace(/^body\./, '');
    }
    const normalizedFieldMappings = Object.fromEntries(
      Object.entries(
        nextConfig.responseFieldMappings &&
          typeof nextConfig.responseFieldMappings === 'object' &&
          !Array.isArray(nextConfig.responseFieldMappings)
          ? nextConfig.responseFieldMappings
          : {}
      )
        .map(([key, value]) => [
          String(key || '').trim(),
          String(value || '')
            .trim()
            .replace(/^body\./, ''),
        ])
        .filter(([key, value]) => key && value)
    );
    nextConfig.responseFieldMappings = normalizedFieldMappings;
    if (nextConfig.responseMode === 'bodyMap') {
      nextConfig.responseBodyPath = '';
      if (Object.keys(normalizedFieldMappings).length === 0) {
        nextConfig.responseMode =
          Object.keys(baseConfig.responseFieldMappings || {}).length > 0
            ? 'bodyMap'
            : baseConfig.responseMode || 'body';
        nextConfig.responseFieldMappings =
          Object.keys(baseConfig.responseFieldMappings || {}).length > 0
            ? { ...(baseConfig.responseFieldMappings || {}) }
            : {};
      }
    } else {
      nextConfig.responseFieldMappings = {};
    }
    if (nextConfig.responseMode === 'bodyPath') {
      nextConfig.responseFieldMappings = {};
    }
    delete nextConfig.reason;
    return nextConfig;
  }

  private async requestAiStructuredTransformDraftConfig(
    baseConfig: Record<string, any>,
    sourceSample: Record<string, any> | string,
    userGoal: string
  ): Promise<Record<string, any>> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const body =
      typeof sourceSample === 'string' ? sourceSample : JSON.stringify(sourceSample, null, 2);
    const leafPaths =
      typeof sourceSample === 'object'
        ? this.collectResponseLeafPaths(sourceSample as Record<string, any>)
            .slice(0, 80)
            .map(({ path, value }) => `${path} = ${JSON.stringify(value)}`)
            .join('\n')
        : '';
    const prompt = [
      '你是一个 AI 结构化转换步骤配置助手，需要根据真实样本内容和用户目标，输出 builtin:aiStructuredTransform 的配置 JSON。',
      '目标是为 Temporal Workflow 草稿生成更合理的 AI 转换配置，并给出一个样本输出，供下游步骤继续观察与推导。',
      '',
      '要求：',
      '1. 只返回一个 JSON 对象，不要输出 Markdown。',
      '2. 仅允许输出字段：contentType, contentTemplate, instructionTemplate, outputMode, outputSchema, contextTemplate, sampleOutput, reason。',
      '3. contentType 只能是 text/html/json 之一；当样本是 JSON 时，请输出 json。',
      '4. contentTemplate 默认返回 {content}，不要内联完整样本。',
      '5. instructionTemplate 必须非空，要求明确、可执行，描述 AI 该如何转换输入。',
      '6. outputMode 只能是 json 或 text；若用户目标是格式化文本，可返回 text。',
      '7. outputMode=json 时，outputSchema 必须为非空对象；outputMode=text 时，outputSchema 可为空对象。',
      '8. sampleOutput 必须是基于真实样本推导出的一个示例输出，供后续步骤配置参考；如果 outputMode=text，则 sampleOutput 必须是字符串。',
      '9. 不要输出 fieldMappings 或 textTemplate，这一步是 AI 转换，不是固定规则转换。',
      '',
      `用户目标: ${userGoal}`,
      `当前配置: ${JSON.stringify(baseConfig, null, 2)}`,
      `真实样本: ${body.slice(0, 20000)}`,
      `可选叶子路径参考:\n${leafPaths || '(无可用叶子路径)'}`,
    ].join('\n');
    const aiResponse = await axios.post<{ result: string }>(
      `${aiOrchestratorUrl}/ai/model/call`,
      {
        modelId: 'default',
        prompt,
      },
      { timeout: 360000 }
    );
    return this.parseJsonFromAiContent(aiResponse.data?.result || '');
  }

  private async requestAiStructuredTransformConfig(
    baseConfig: Record<string, any>,
    sourceSample: Record<string, any> | string,
    userGoal: string
  ): Promise<Record<string, any>> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const body =
      typeof sourceSample === 'string' ? sourceSample : JSON.stringify(sourceSample, null, 2);
    const leafPaths =
      typeof sourceSample === 'object'
        ? this.collectResponseLeafPaths(sourceSample as Record<string, any>)
            .slice(0, 80)
            .map(({ path, value }) => `${path} = ${JSON.stringify(value)}`)
            .join('\n')
        : '';
    const prompt = [
      '你是一个固定规则结构化转换配置助手，需要根据真实样本内容和用户目标，输出 builtin:structuredTransform（固定规则版）步骤的配置 JSON。',
      '目标是帮助 Temporal Workflow 生成稳定、可审计、默认不依赖 AI 的结构化转换配置。',
      '',
      '要求：',
      '1. 只返回一个 JSON 对象，不要输出 Markdown。',
      '2. 仅允许输出字段：contentType, contentTemplate, instructionTemplate, outputMode, outputSchema, contextTemplate, fieldMappings, textTemplate, reason。',
      '3. contentType 只能是 text/html/json 之一；当样本是 JSON 时，请输出 json。',
      '4. 默认优先输出固定规则：JSON 结构优先使用 fieldMappings，文本格式优先使用 textTemplate。',
      '5. instructionTemplate 仅作为说明性规则摘要，可为空；不要把 AI 提示词当作唯一执行逻辑。',
      '6. outputMode 缺省为 json；若用户目标是格式化纯文本，可返回 text。',
      '7. outputSchema 必须是对象，key 为输出字段名，value 为字段含义或类型提示（如 string/number/array.object 等）。',
      '8. fieldMappings 必须是对象，key 为输出字段名，value 为来源路径、已有字段名或模板变量名。',
      '9. textTemplate 必须是模板字符串，使用 {fieldName} 引用 fieldMappings 或输入内容中的字段；如果 outputMode=text，优先生成 textTemplate。',
      '10. 不要在 contentTemplate 中内联样本全文，请使用占位符；默认必须返回 {content}，不要返回 json/html/text 这类字面量。',
      '11. 不要输出 builtin:aiStructuredTransform 配置，不要把 AI 理解逻辑写进本配置对象。',
      '',
      `用户目标: ${userGoal}`,
      `当前配置: ${JSON.stringify(baseConfig, null, 2)}`,
      `真实样本: ${body.slice(0, 20000)}`,
      `可选叶子路径参考:\n${leafPaths || '(无可用叶子路径)'}`,
    ].join('\n');
    const aiResponse = await axios.post<{ result: string }>(
      `${aiOrchestratorUrl}/ai/model/call`,
      {
        modelId: 'default',
        prompt,
      },
      { timeout: 360000 }
    );
    return this.parseJsonFromAiContent(aiResponse.data?.result || '');
  }

  private assertHttpRequestPreviewInputs(
    baseConfig: Record<string, any>,
    inputParams: Record<string, any>
  ): void {
    const requiredInputKeys = Array.from(this.collectTemplateVariables(baseConfig));
    const missingInputKeys = requiredInputKeys.filter(
      (key) => String(inputParams?.[key] ?? '').trim() === ''
    );
    if (missingInputKeys.length > 0) {
      throw new Error(
        `请先为这些输入参数提供示例值后再进行 AI 优化: ${missingInputKeys.join('、')}`
      );
    }
  }

  private parseJsonFromAiContent(content: string): Record<string, any> {
    const sanitized = (content || '').replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(sanitized);
      return this.recursiveSanitizeTemplates(parsed);
    } catch {
      const start = sanitized.indexOf('{');
      const end = sanitized.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(sanitized.slice(start, end + 1));
        return this.recursiveSanitizeTemplates(parsed);
      }
      throw new Error('AI 返回内容不是有效 JSON');
    }
  }

  private recursiveSanitizeTemplates(value: any): any {
    if (typeof value === 'string') {
      return value.replace(/`/g, '').trim();
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.recursiveSanitizeTemplates(item));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.recursiveSanitizeTemplates(val);
      }
      return result;
    }
    return value;
  }

  private sanitizeJsonValue<T>(value: T): T {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.sanitizeJsonValue(item))
        .filter((item) => item !== undefined) as T;
    }
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
        (acc, [key, item]) => {
          if (item === undefined) {
            return acc;
          }
          acc[key] = this.sanitizeJsonValue(item);
          return acc;
        },
        {}
      ) as T;
    }
    return value;
  }
}
