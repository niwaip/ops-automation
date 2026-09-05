import type { RecognizeParamsResponseDTO } from '../../../interfaces';
import type { ParamsSchema } from '../../react-engine/interfaces';
import { projectPreviousResultInput } from '../binding/previous-result-input-projector';

export interface PreviousResultContinuationProjection {
  recognized: RecognizeParamsResponseDTO;
  projectedFields: string[];
  sourceExecutionId?: string;
}

interface PreviousResultContext {
  mode?: unknown;
  previous_result?: unknown;
}

const IGNORED_INPUT_KEYS = new Set([
  'browserPhaseVariables',
  'input',
  'inputs',
  'inputJson',
  'resolvedInputJson',
  'commands',
  'params',
  'args',
  'variables',
  'request',
  'user_input',
  '__promptDebug',
]);

/**
 * Checks whether user prompt contains relative/positional reference directives
 * such as "第一个url", "第2条链接", "刚才的", "上述网址" etc.
 */
export function hasRelativeExtractionDirective(text?: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return /(?:第[一二三四五六七八九十0-9]+[个条篇项份张页本位次]|第一个|第1个|第二个|第2个|第三个|第3个|前[一二两12]个|最新|刚才的|上面的|上一条|上述|链接|url|网址)/i.test(
    text
  );
}

/**
 * Completes a single Skill's unresolved required input from the latest completed
 * execution. Exact schema field matches are preferred. A primary-result
 * projection is only used when exactly one required field remains unresolved,
 * which prevents the same payload from being copied into unrelated parameters.
 */
export function projectPreviousResultIntoRecognition(
  recognized: RecognizeParamsResponseDTO,
  schema: ParamsSchema,
  context?: PreviousResultContext,
  userRequest?: string,
): PreviousResultContinuationProjection {
  const snapshot = asRecord(context?.previous_result);
  if (context?.mode !== 'single_step_continuation' || !snapshot) {
    return { recognized, projectedFields: [] };
  }

  // If user prompt explicitly indicates relative extraction (e.g. "打开 第一个url"),
  // do not deterministically short-circuit parameter recognition with stale values.
  if (hasRelativeExtractionDirective(userRequest)) {
    return { recognized, projectedFields: [] };
  }

  const structuredData = snapshot.structuredData;
  const detailText = asString(snapshot.detailText);
  if (structuredData === undefined && !detailText) {
    return { recognized, projectedFields: [] };
  }

  const params = { ...(recognized.params || {}) };
  const projectedFields: string[] = [];
  const requiredFields = resolveRequiredFields(schema);

  for (const fieldName of requiredFields) {
    if (hasMeaningfulValue(params[fieldName])) continue;
    const exactValue = findExactFieldValue(structuredData, fieldName);
    const normalized = normalizeForType(exactValue, schema.properties[fieldName]?.type);
    if (normalized === undefined) continue;
    params[fieldName] = normalized;
    projectedFields.push(fieldName);
  }

  const unresolved = requiredFields.filter((fieldName) => !hasMeaningfulValue(params[fieldName]));
  if (unresolved.length === 1) {
    const fieldName = unresolved[0];
    if (fieldName) {
      const property = schema.properties[fieldName];
      const projected = projectPreviousResultInput(
        property ? { type: property.type } : undefined,
        {
          previousResultData: structuredData,
          previousResultText: detailText,
          previousResultRef: {
            executionId: asString(snapshot.executionId),
          },
        },
        fieldName,
      );
      const normalized = normalizeForType(projected?.value, property?.type);
      if (normalized !== undefined) {
        params[fieldName] = normalized;
        projectedFields.push(fieldName);
      }
    }
  }

  if (projectedFields.length === 0) {
    return { recognized, projectedFields: [] };
  }

  const projectedSet = new Set(projectedFields);
  return {
    recognized: {
      ...recognized,
      params,
      field_confidences: {
        ...(recognized.field_confidences || {}),
        ...Object.fromEntries(projectedFields.map((fieldName) => [fieldName, 1])),
      },
      uncertain_fields: (recognized.uncertain_fields || []).filter(
        (fieldName) => !projectedSet.has(fieldName),
      ),
      debug: {
        ...recognized.debug,
        notes: [
          ...(recognized.debug?.notes || []),
          `已从上一执行${asString(snapshot.executionId) ? ` ${asString(snapshot.executionId)}` : ''}的可信结果快照投影参数: ${projectedFields.join(', ')}`,
        ],
      },
    },
    projectedFields,
    sourceExecutionId: asString(snapshot.executionId),
  };
}

function resolveRequiredFields(schema: ParamsSchema): string[] {
  const required = new Set(schema.required || []);
  for (const [fieldName, property] of Object.entries(schema.properties || {})) {
    if (property.required) required.add(fieldName);
  }
  return [...required].filter((fieldName) => Boolean(schema.properties?.[fieldName]));
}

function findExactFieldValue(value: unknown, fieldName: string, depth = 0): unknown {
  if (depth > 4) return undefined;
  const record = asRecord(value);
  if (!record) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, fieldName)) {
    const val = record[fieldName];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const nested =
        asString((val as any).text) ||
        asString((val as any).content) ||
        asString((val as any).value) ||
        asString((val as any).summary);
      if (nested) return nested;
      return undefined;
    }
    return val;
  }
  for (const [childKey, child] of Object.entries(record)) {
    if (IGNORED_INPUT_KEYS.has(childKey)) continue;
    const found = findExactFieldValue(child, fieldName, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function normalizeForType(value: unknown, type?: string): unknown {
  if (!hasMeaningfulValue(value)) return undefined;
  if (type === 'string') {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') return undefined;
    return String(value).trim();
  }
  if (type === 'array') return Array.isArray(value) && value.length > 0 ? value : undefined;
  if (type === 'number') {
    const numberValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 'false') return value === 'true';
    return undefined;
  }
  return value;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
