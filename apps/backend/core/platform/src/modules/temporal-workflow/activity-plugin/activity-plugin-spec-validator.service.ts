import { Injectable } from '@nestjs/common';
import { ActivityPluginRegistryService } from './activity-plugin-registry.service';
import type {
  ActivityPluginDiagnostic,
  ActivityPluginImplementationSpec,
  ActivityPluginJsonSchema,
  ActivityPluginSpecValidationResult,
} from './activity-plugin.types';

@Injectable()
export class ActivityPluginSpecValidatorService {
  constructor(private readonly registry: ActivityPluginRegistryService) {}

  validateAndNormalize(input: ActivityPluginImplementationSpec): ActivityPluginSpecValidationResult {
    const manifest = this.registry.getByRef(input?.pluginRef);
    if (!manifest) {
      return this.failed('PLUGIN_NOT_FOUND', '/pluginRef', `未注册 Activity Plugin: ${input?.pluginRef}`);
    }
    if (input.pluginVersion && input.pluginVersion !== manifest.version) {
      return this.failed(
        'PLUGIN_VERSION_MISMATCH',
        '/pluginVersion',
        `Plugin ${manifest.ref} 版本不匹配: expected=${manifest.version}, actual=${input.pluginVersion}`
      );
    }

    const config = this.applyDefaults(
      input?.config && typeof input.config === 'object' && !Array.isArray(input.config)
        ? input.config
        : {},
      manifest.contracts.implementationSpecSchema
    ) as Record<string, unknown>;
    const diagnostics: ActivityPluginDiagnostic[] = [];
    this.validateValue(config, manifest.contracts.implementationSpecSchema, '/config', diagnostics);
    if (diagnostics.length > 0) {
      return { success: false, diagnostics };
    }
    return {
      success: true,
      spec: { pluginRef: manifest.ref, pluginVersion: manifest.version, config },
      diagnostics: [],
    };
  }

  validateRuntimeOutput(pluginRef: string, output: unknown): ActivityPluginDiagnostic[] {
    const manifest = this.registry.getByRef(pluginRef);
    if (!manifest) {
      return this.failed('PLUGIN_NOT_FOUND', '/pluginRef', `未注册 Activity Plugin: ${pluginRef}`)
        .diagnostics;
    }
    const diagnostics: ActivityPluginDiagnostic[] = [];
    this.validateValue(output, manifest.contracts.runtimeOutputSchema, '/runtimeOutput', diagnostics);
    return diagnostics.map((item) => ({ ...item, code: 'OUTPUT_SCHEMA_VIOLATION' }));
  }

  validateRuntimeInput(pluginRef: string, input: unknown): ActivityPluginDiagnostic[] {
    const manifest = this.registry.getByRef(pluginRef);
    if (!manifest) {
      return this.failed('PLUGIN_NOT_FOUND', '/pluginRef', `未注册 Activity Plugin: ${pluginRef}`)
        .diagnostics;
    }
    const diagnostics: ActivityPluginDiagnostic[] = [];
    this.validateValue(input, manifest.contracts.runtimeInputSchema, '/runtimeInput', diagnostics);
    return diagnostics;
  }

  private applyDefaults(value: unknown, schema: ActivityPluginJsonSchema): unknown {
    if ((value === undefined || value === null || value === '') && schema.default !== undefined) {
      return this.clone(schema.default);
    }
    if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
      const next: Record<string, unknown> = { ...(value as Record<string, unknown>) };
      for (const [key, childSchema] of Object.entries(schema.properties || {})) {
        const normalized = this.applyDefaults(next[key], childSchema);
        if (normalized !== undefined) next[key] = normalized;
      }
      return next;
    }
    return value;
  }

  private validateValue(
    value: unknown,
    schema: ActivityPluginJsonSchema,
    path: string,
    diagnostics: ActivityPluginDiagnostic[]
  ): void {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
    if (allowedTypes.length > 0 && !allowedTypes.some((type) => this.matchesType(value, type))) {
      diagnostics.push(this.violation(path, `必须是 ${allowedTypes.join(' | ')}，实际为 ${this.typeOf(value)}`));
      return;
    }
    if (schema.const !== undefined && value !== schema.const) {
      diagnostics.push(this.violation(path, `必须等于 ${JSON.stringify(schema.const)}`));
    }
    if (schema.enum && !schema.enum.includes(value)) {
      diagnostics.push(this.violation(path, `必须是 ${schema.enum.map(String).join('、')} 之一`));
    }
    if (typeof value === 'string' && schema.minLength !== undefined && value.length < schema.minLength) {
      diagnostics.push(this.violation(path, `字符串长度不能小于 ${schema.minLength}`));
    }
    if (typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) diagnostics.push(this.violation(path, `不能小于 ${schema.minimum}`));
      if (schema.maximum !== undefined && value > schema.maximum) diagnostics.push(this.violation(path, `不能大于 ${schema.maximum}`));
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      for (const required of schema.required || []) {
        if (record[required] === undefined || record[required] === null || record[required] === '') {
          diagnostics.push(this.violation(`${path}/${required}`, '缺少必填字段'));
        }
      }
      if (schema.minProperties !== undefined && Object.keys(record).length < schema.minProperties) {
        diagnostics.push(this.violation(path, `字段数量不能小于 ${schema.minProperties}`));
      }
      for (const [key, item] of Object.entries(record)) {
        const childSchema = schema.properties?.[key];
        if (childSchema) {
          this.validateValue(item, childSchema, `${path}/${key}`, diagnostics);
        } else if (schema.additionalProperties === false) {
          diagnostics.push(this.violation(`${path}/${key}`, '不允许的字段'));
        } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
          this.validateValue(item, schema.additionalProperties, `${path}/${key}`, diagnostics);
        }
      }
    }
  }

  private matchesType(value: unknown, type: string): boolean {
    if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    if (type === 'array') return Array.isArray(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
    if (type === 'null') return value === null;
    return typeof value === type;
  }

  private typeOf(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  private violation(path: string, message: string): ActivityPluginDiagnostic {
    return { code: 'SPEC_SCHEMA_VIOLATION', path, message, recoverable: true };
  }

  private failed(
    code: ActivityPluginDiagnostic['code'],
    path: string,
    message: string
  ): ActivityPluginSpecValidationResult {
    return { success: false, diagnostics: [{ code, path, message, recoverable: false }] };
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
