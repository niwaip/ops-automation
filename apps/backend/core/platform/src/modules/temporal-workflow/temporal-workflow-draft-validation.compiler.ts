import type {
  WorkflowDslV2Field,
  WorkflowDslV2Output,
  WorkflowValidationAssertion,
  WorkflowValidationContract,
} from './temporal-workflow.types';
import {
  isLegacyRequiredAssertionOperator,
  normalizeWorkflowValidationAssertionOperator,
} from './temporal-workflow-validation-assertion.utils';

export interface CompiledDraftValidation {
  validation?: WorkflowValidationContract;
  issues: string[];
}

function normalizeRelativePath(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw || raw === '$') return '$';
  if (raw.startsWith('$.')) return raw;
  return `$.${raw.replace(/^\.+/, '')}`;
}

function businessDataSuffix(path: unknown): string[] | undefined {
  const normalized = String(path || '')
    .trim()
    .replace(/^\$\.?/, '')
    .replace(/\[(\d+)\]/g, '.$1');
  const segments = normalized.split('.').filter(Boolean);
  const businessDataIndex = segments.lastIndexOf('businessData');
  if (businessDataIndex < 0) return undefined;
  return segments.slice(businessDataIndex + 1);
}

function compileAssertion(
  assertion: WorkflowValidationAssertion,
  fields: Record<string, WorkflowDslV2Field>
): { assertion: WorkflowValidationAssertion; issue?: string } {
  const fieldNames = Object.keys(fields);
  const explicitField = String(assertion.field || '').trim();
  let compiledAssertion = assertion;
  if (explicitField) {
    if (!fieldNames.includes(explicitField)) {
      return {
        assertion,
        issue: `验证断言引用了未声明的业务输出字段: ${explicitField}`,
      };
    }
    let normalizedFieldPath = normalizeRelativePath(assertion.fieldPath);
    if (normalizedFieldPath === `$.${explicitField}` || normalizedFieldPath === explicitField) {
      normalizedFieldPath = '$';
    } else if (normalizedFieldPath.startsWith(`$.${explicitField}.`)) {
      normalizedFieldPath = `$.${normalizedFieldPath.slice(explicitField.length + 3)}`;
    }
    compiledAssertion = {
      ...assertion,
      field: explicitField,
      fieldPath: normalizedFieldPath,
      path: undefined,
    };
  } else {
    const suffix = businessDataSuffix(assertion.path);
    if (suffix && suffix.length > 0 && fieldNames.includes(suffix[0])) {
      compiledAssertion = {
        ...assertion,
        field: suffix[0],
        fieldPath: normalizeRelativePath(suffix.slice(1).join('.')),
        path: undefined,
      };
    } else if (suffix && fieldNames.length === 1) {
      // A single declared output commonly represents the complete upstream body.
      // Anchor legacy AI paths below that field instead of guessing envelope depth.
      compiledAssertion = {
        ...assertion,
        field: fieldNames[0],
        fieldPath: normalizeRelativePath(suffix.join('.')),
        path: undefined,
      };
    } else if (suffix) {
      return {
        assertion,
        issue: `验证断言路径 ${assertion.path || '（空）'} 无法唯一映射到业务输出字段`,
      };
    }
  }

  const rawOperator = (compiledAssertion as { operator?: unknown }).operator;
  const operator = normalizeWorkflowValidationAssertionOperator(rawOperator);
  if (!operator) {
    return {
      assertion: compiledAssertion,
      issue: `验证断言使用了不支持的操作符: ${String(rawOperator || '（空）')}`,
    };
  }
  if (isLegacyRequiredAssertionOperator(rawOperator) && compiledAssertion.value === false) {
    return {
      assertion: compiledAssertion,
      issue: '验证断言 required=false 不构成有效断言，请删除该断言',
    };
  }

  const normalizedAssertion: WorkflowValidationAssertion = {
    ...compiledAssertion,
    operator,
    ...(isLegacyRequiredAssertionOperator(rawOperator) ? { value: undefined } : {}),
  };
  const fieldType = normalizedAssertion.field
    ? String(fields[normalizedAssertion.field]?.type || '').toLowerCase()
    : '';
  if (operator === 'minItems' && fieldType && fieldType !== 'array') {
    return {
      assertion: normalizedAssertion,
      issue: `验证断言 minItems 只能用于 array 字段: ${normalizedAssertion.field}`,
    };
  }
  if (
    (operator === 'min' || operator === 'max') &&
    fieldType &&
    !['integer', 'number'].includes(fieldType)
  ) {
    return {
      assertion: normalizedAssertion,
      issue: `验证断言 ${operator} 只能用于 integer/number 字段: ${normalizedAssertion.field}`,
    };
  }
  if (operator === 'minItems') {
    const value = Number(normalizedAssertion.value ?? 1);
    if (!Number.isInteger(value) || value < 0) {
      return {
        assertion: normalizedAssertion,
        issue: '验证断言 minItems 的 value 必须是非负整数',
      };
    }
  }
  if (operator === 'min' || operator === 'max') {
    const value = Number(normalizedAssertion.value);
    if (!Number.isFinite(value)) {
      return {
        assertion: normalizedAssertion,
        issue: `验证断言 ${operator} 的 value 必须是有限数字`,
      };
    }
  }
  return { assertion: normalizedAssertion };
}

/**
 * Compiles AI-authored validation intent against compiler-owned v2Output.
 * Runtime envelope paths are removed from new drafts; persisted legacy paths
 * remain supported by the validation service.
 */
export function compileDraftValidationContract(
  validation: WorkflowValidationContract | undefined,
  v2Output: WorkflowDslV2Output | undefined
): CompiledDraftValidation {
  if (!validation) return { validation: undefined, issues: [] };

  const fields = v2Output?.fields || {};
  const issues: string[] = [];
  const assertions = (validation.assertions || []).map((assertion) => {
    const compiled = compileAssertion(assertion, fields);
    if (compiled.issue) issues.push(compiled.issue);
    return compiled.assertion;
  });

  const scenarioIds = new Set((validation.scenarios || []).map((scenario) => scenario.id));
  for (const assertion of assertions) {
    for (const scenarioId of assertion.scenarioIds || []) {
      if (!scenarioIds.has(scenarioId)) {
        issues.push(`验证断言引用了不存在的场景: ${scenarioId}`);
      }
    }
  }

  return {
    validation: {
      ...(validation.scenarios ? { scenarios: validation.scenarios } : {}),
      ...(assertions.length ? { assertions } : {}),
    },
    issues,
  };
}
