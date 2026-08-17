import { Injectable } from '@nestjs/common';
import { jsonSchemaValidator } from '@ops/backend-runtime-capability-contract';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from '../registry/errors';

export interface ManifestValidationReport {
  passed: true;
  promptVariables: string[];
  inputFields: string[];
  outputFields: string[];
  checks: string[];
}

@Injectable()
export class OperationManifestValidatorService {
  public validate(manifest: Record<string, unknown>): ManifestValidationReport {
    const violations: string[] = [];
    const inputSchema = this.readClosedObjectSchema(
      manifest.inputSchema,
      'inputSchema',
      violations,
    );
    const outputSchema = this.readClosedObjectSchema(
      manifest.outputSchema,
      'outputSchema',
      violations,
    );
    const prompt = this.readObject(manifest.prompt, 'prompt', violations);

    const systemTemplate = this.readNonEmptyString(
      prompt.systemTemplate,
      'prompt.systemTemplate',
      violations,
    );
    const userTemplate = this.readNonEmptyString(
      prompt.userTemplate,
      'prompt.userTemplate',
      violations,
    );
    const declaredVariables = Array.isArray(prompt.variables)
      ? prompt.variables.filter((value): value is string => typeof value === 'string')
      : [];
    if (!Array.isArray(prompt.variables)) {
      violations.push('prompt.variables 必须是字符串数组');
    }

    const systemVariables = this.extractVariables(systemTemplate);
    if (systemVariables.length > 0) {
      violations.push(
        `prompt.systemTemplate 不能包含动态变量（当前 Runtime 只渲染 userTemplate）: ${systemVariables.join(', ')}`,
      );
    }
    const templateVariables = this.extractVariables(userTemplate);
    const uniqueDeclared = [...new Set(declaredVariables)].sort();
    const uniqueTemplate = [...new Set(templateVariables)].sort();
    if (JSON.stringify(uniqueDeclared) !== JSON.stringify(uniqueTemplate)) {
      violations.push(
        `prompt.variables 必须与 userTemplate 占位符完全一致: declared=[${uniqueDeclared.join(', ')}], template=[${uniqueTemplate.join(', ')}]`,
      );
    }

    const inputProperties = this.readProperties(inputSchema);
    const outputProperties = this.readProperties(outputSchema);
    const requiredInputs = this.readRequired(inputSchema, 'inputSchema', inputProperties, violations);
    const requiredOutputs = this.readRequired(outputSchema, 'outputSchema', outputProperties, violations);

    for (const variable of uniqueTemplate) {
      if (!(variable in inputProperties)) {
        violations.push(`Prompt 变量 '${variable}' 未在 inputSchema.properties 中声明`);
      }
    }
    for (const field of requiredInputs) {
      if (!uniqueTemplate.includes(field)) {
        violations.push(`inputSchema 必填字段 '${field}' 没有被 userTemplate 使用`);
      }
    }

    const combinedPrompt = `${systemTemplate}\n${userTemplate}`;
    for (const field of requiredOutputs) {
      if (!combinedPrompt.includes(field)) {
        violations.push(`Prompt 没有明确要求模型输出必填字段 '${field}'`);
      }
    }

    const executionPolicy = this.readObject(
      manifest.executionPolicy,
      'executionPolicy',
      violations,
    );
    if (executionPolicy.tools !== 'disabled') {
      violations.push("executionPolicy.tools 必须为 'disabled'");
    }

    for (const [field, value] of [
      ['maxInputTokens', manifest.maxInputTokens],
      ['maxOutputTokens', manifest.maxOutputTokens],
      ['timeoutMs', manifest.timeoutMs],
    ] as const) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        violations.push(`${field} 必须是大于 0 的有限数字`);
      }
    }

    if (violations.length > 0) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.INVALID_OPERATION_CONFIG,
        `Operation Manifest validation failed: ${violations.join('; ')}`,
        { violations },
      );
    }

    return {
      passed: true,
      promptVariables: uniqueTemplate,
      inputFields: Object.keys(inputProperties).sort(),
      outputFields: Object.keys(outputProperties).sort(),
      checks: [
        'closed-json-schema',
        'prompt-variable-binding',
        'required-input-consumption',
        'required-output-instruction',
        'tool-call-disabled',
        'budget-policy',
      ],
    };
  }

  private readClosedObjectSchema(
    value: unknown,
    field: string,
    violations: string[],
  ): Record<string, unknown> {
    const schema = this.readObject(value, field, violations);
    if (schema.type !== 'object') violations.push(`${field}.type 必须为 'object'`);
    if (
      !schema.properties ||
      typeof schema.properties !== 'object' ||
      Array.isArray(schema.properties)
    ) {
      violations.push(`${field}.properties 必须是对象`);
    }
    if (schema.additionalProperties !== false) {
      violations.push(`${field}.additionalProperties 必须显式为 false`);
    }
    const compileResult = jsonSchemaValidator.validateOutput({}, schema);
    if (compileResult.errors?.some((error) => error.keyword === 'compilation')) {
      violations.push(`${field} 不是合法 JSON Schema: ${compileResult.errors[0]?.message}`);
    }
    return schema;
  }

  private readObject(
    value: unknown,
    field: string,
    violations: string[],
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      violations.push(`${field} 必须是对象`);
      return {};
    }
    return value as Record<string, unknown>;
  }

  private readNonEmptyString(value: unknown, field: string, violations: string[]): string {
    if (typeof value !== 'string' || !value.trim()) {
      violations.push(`${field} 必须是非空字符串`);
      return '';
    }
    return value;
  }

  private extractVariables(template: string): string[] {
    return [...template.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)].map((match) => match[1]!);
  }

  private readProperties(schema: Record<string, unknown>): Record<string, unknown> {
    const properties = schema.properties;
    return properties && typeof properties === 'object' && !Array.isArray(properties)
      ? (properties as Record<string, unknown>)
      : {};
  }

  private readRequired(
    schema: Record<string, unknown>,
    field: string,
    properties: Record<string, unknown>,
    violations: string[],
  ): string[] {
    if (!Array.isArray(schema.required) || schema.required.length === 0) {
      violations.push(`${field}.required 必须至少声明一个字段`);
      return [];
    }
    const required = schema.required.filter((value): value is string => typeof value === 'string');
    for (const name of required) {
      if (!(name in properties)) violations.push(`${field}.required 引用了未声明字段 '${name}'`);
    }
    return required;
  }
}
