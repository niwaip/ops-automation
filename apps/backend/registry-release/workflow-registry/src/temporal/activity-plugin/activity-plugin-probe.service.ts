import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  HTTP_REQUEST_ACTIVITY_KEY,
  STRUCTURED_TRANSFORM_ACTIVITY_KEY,
  BuiltinActivityRegistry,
} from '../builtin-activity.registry';
import { ActivityExecutionService } from '../runtime-bridge/temporal-activity-execution.service';
import { ActivityPluginRegistryService } from './activity-plugin-registry.service';
import { ActivityPluginSpecValidatorService } from './activity-plugin-spec-validator.service';
import {
  buildHttpPluginRuntimeInput,
  buildStructuredTransformRuntimeInput,
  extractPluginPath,
  normalizeHttpPluginConfig,
} from './activity-plugin-runtime-input';
import type {
  ActivityPluginDiagnostic,
  ActivityPluginImplementationSpec,
  ActivityPluginProbeResult,
} from './activity-plugin.types';

export interface ActivityPluginProbeRequest {
  spec: ActivityPluginImplementationSpec;
  inputParams?: Record<string, unknown>;
  sampleInput?: unknown;
  allowUnsafeSideEffects?: boolean;
}

@Injectable()
export class ActivityPluginProbeService {
  constructor(
    private readonly registry: ActivityPluginRegistryService,
    private readonly validator: ActivityPluginSpecValidatorService,
    private readonly builtinRegistry: BuiltinActivityRegistry,
    private readonly executionService: ActivityExecutionService
  ) {}

  async probe(request: ActivityPluginProbeRequest): Promise<ActivityPluginProbeResult> {
    const validatedAt = new Date().toISOString();
    const validation = this.validator.validateAndNormalize(request.spec);
    if (!validation.success || !validation.spec) {
      return {
        success: false,
        pluginRef: String(request.spec?.pluginRef || ''),
        pluginVersion: String(request.spec?.pluginVersion || ''),
        validatedAt,
        diagnostics: validation.diagnostics,
      };
    }

    const spec = validation.spec;
    const manifest = this.registry.getByRef(spec.pluginRef)!;
    const builtin = this.builtinRegistry.getByKey(manifest.activityKey);
    if (!builtin) {
      return this.failure(spec, validatedAt, 'PLUGIN_NOT_FOUND', '固定 Activity 实现不存在');
    }

    const runtimeInput = this.buildRuntimeInput(
      manifest.activityKey,
      spec.config,
      request.inputParams || {},
      request.sampleInput
    );
    const inputDiagnostics = this.validator.validateRuntimeInput(spec.pluginRef, runtimeInput);
    if (inputDiagnostics.length > 0) {
      return { ...this.base(spec, validatedAt), runtimeInput, diagnostics: inputDiagnostics };
    }

    const method = String(runtimeInput.method || '').toUpperCase();
    if (
      manifest.validation.safeProbeMethods &&
      !manifest.validation.safeProbeMethods.includes(method) &&
      !request.allowUnsafeSideEffects
    ) {
      return this.failure(
        spec,
        validatedAt,
        'UNSAFE_REAL_PROBE',
        `真实探测默认禁止 ${method}；仅允许 ${manifest.validation.safeProbeMethods.join(', ')}`,
        runtimeInput
      );
    }

    const startedAt = Date.now();
    const execution = await this.executionService.executeCodeInTemporalSandbox(
      builtin.generatedCode,
      builtin.fn,
      'activity-plugin-real-probe',
      runtimeInput
    );
    const durationMs = Date.now() - startedAt;
    if (!execution.success) {
      return {
        ...this.base(spec, validatedAt),
        runtimeInput,
        durationMs,
        diagnostics: [
          {
            code: 'REAL_PROBE_FAILED',
            message: execution.error || '固定 Activity 真实执行失败',
            recoverable: true,
          },
        ],
      };
    }

    const runtimeOutput = this.asRecord(execution.result);
    const diagnostics = this.validator.validateRuntimeOutput(spec.pluginRef, runtimeOutput);
    const projection = this.project(manifest.activityKey, spec.config, runtimeOutput);
    diagnostics.push(...projection.diagnostics);
    if (manifest.activityKey === STRUCTURED_TRANSFORM_ACTIVITY_KEY) {
      diagnostics.push(...this.validateStructuredResult(spec.config, projection.value));
    }
    return {
      ...this.base(spec, validatedAt),
      success: diagnostics.length === 0,
      runtimeInput,
      runtimeOutput: this.redact(runtimeOutput),
      projectedOutput: projection.value,
      sampleHash: `sha256:${createHash('sha256')
        .update(this.stableJson({ runtimeInput, runtimeOutput, projectedOutput: projection.value }))
        .digest('hex')}`,
      durationMs,
      diagnostics,
    };
  }

  private buildRuntimeInput(
    activityKey: string,
    config: Record<string, unknown>,
    params: Record<string, unknown>,
    sampleInput: unknown
  ): Record<string, unknown> {
    if (activityKey === HTTP_REQUEST_ACTIVITY_KEY) {
      return buildHttpPluginRuntimeInput(normalizeHttpPluginConfig(config), params);
    }
    if (activityKey === STRUCTURED_TRANSFORM_ACTIVITY_KEY) {
      return buildStructuredTransformRuntimeInput(config, sampleInput, params);
    }
    return { ...params, ...(sampleInput === undefined ? {} : { content: sampleInput }) };
  }

  private project(
    activityKey: string,
    config: Record<string, unknown>,
    output: Record<string, unknown>
  ): { value: unknown; diagnostics: ActivityPluginDiagnostic[] } {
    if (activityKey === STRUCTURED_TRANSFORM_ACTIVITY_KEY) {
      return { value: output.result, diagnostics: [] };
    }
    if (activityKey !== HTTP_REQUEST_ACTIVITY_KEY) return { value: output, diagnostics: [] };

    const mode = String(config.responseMode || 'body');
    if (mode === 'full') return { value: output, diagnostics: [] };
    const body = output.body;
    if (mode === 'body') return { value: body, diagnostics: [] };
    if (mode === 'bodyPath') {
      const path = String(config.responseBodyPath || '');
      const value = extractPluginPath(body, path);
      return value === undefined
        ? { value, diagnostics: [this.missingPath(path, '/config/responseBodyPath')] }
        : { value, diagnostics: [] };
    }
    if (mode === 'bodyMap') {
      const mappings = this.asRecord(config.responseFieldMappings);
      const projected: Record<string, unknown> = {};
      const diagnostics: ActivityPluginDiagnostic[] = [];
      for (const [field, rawPath] of Object.entries(mappings)) {
        const path = String(rawPath || '');
        const value = extractPluginPath(body, path);
        if (value === undefined) diagnostics.push(this.missingPath(path, `/config/responseFieldMappings/${field}`));
        else projected[field] = value;
      }
      return { value: projected, diagnostics };
    }
    return {
      value: undefined,
      diagnostics: [
        {
          code: 'OUTPUT_SCHEMA_VIOLATION',
          path: '/config/responseMode',
          message: `不支持的 responseMode: ${mode}`,
          recoverable: true,
        },
      ],
    };
  }

  private missingPath(path: string, configPath: string): ActivityPluginDiagnostic {
    return {
      code: 'OUTPUT_PATH_NOT_FOUND',
      path: configPath,
      message: `真实响应中不存在路径: ${path || '(empty)'}`,
      recoverable: true,
    };
  }

  private validateStructuredResult(
    config: Record<string, unknown>,
    result: unknown
  ): ActivityPluginDiagnostic[] {
    if (String(config.outputMode || 'json') !== 'json') return [];
    const outputSchema = this.asRecord(config.outputSchema);
    const fieldMappings = this.asRecord(config.fieldMappings);
    const record = this.asRecord(result);
    const diagnostics: ActivityPluginDiagnostic[] = [];

    for (const [field, sourcePath] of Object.entries(fieldMappings)) {
      if (record[field] === undefined || record[field] === null) {
        diagnostics.push(
          this.missingPath(String(sourcePath || ''), `/config/fieldMappings/${field}`)
        );
      }
    }
    for (const [field, typeHint] of Object.entries(outputSchema)) {
      const value = record[field];
      if (value === undefined) {
        diagnostics.push({
          code: 'OUTPUT_SCHEMA_VIOLATION',
          path: `/projectedOutput/${field}`,
          message: `真实输出缺少声明字段: ${field}`,
          recoverable: true,
        });
        continue;
      }
      if (typeof typeHint !== 'string') continue;
      const expected = typeHint.toLowerCase().split(/[.\s]/)[0];
      const matches =
        expected === 'array'
          ? Array.isArray(value)
          : expected === 'object'
            ? Boolean(value) && typeof value === 'object' && !Array.isArray(value)
            : ['string', 'number', 'boolean'].includes(expected)
              ? typeof value === expected
              : true;
      if (!matches) {
        diagnostics.push({
          code: 'OUTPUT_SCHEMA_VIOLATION',
          path: `/projectedOutput/${field}`,
          message: `字段 ${field} 类型不匹配: expected=${expected}, actual=${Array.isArray(value) ? 'array' : typeof value}`,
          recoverable: true,
        });
      }
    }
    return diagnostics;
  }

  private failure(
    spec: ActivityPluginImplementationSpec,
    validatedAt: string,
    code: ActivityPluginDiagnostic['code'],
    message: string,
    runtimeInput?: Record<string, unknown>
  ): ActivityPluginProbeResult {
    return {
      ...this.base(spec, validatedAt),
      runtimeInput,
      diagnostics: [{ code, message, recoverable: code !== 'PLUGIN_NOT_FOUND' }],
    };
  }

  private base(spec: ActivityPluginImplementationSpec, validatedAt: string) {
    return {
      success: false,
      pluginRef: spec.pluginRef,
      pluginVersion: spec.pluginVersion,
      spec,
      validatedAt,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private redact(value: Record<string, unknown>): Record<string, unknown> {
    const clone = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    if (clone.headers && typeof clone.headers === 'object') {
      for (const key of Object.keys(clone.headers as Record<string, unknown>)) {
        if (/authorization|cookie|api[-_]?key/i.test(key)) {
          (clone.headers as Record<string, unknown>)[key] = '[REDACTED]';
        }
      }
    }
    return clone;
  }

  private stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.stableJson((value as Record<string, unknown>)[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }
}
