import * as crypto from 'crypto';

export type LlmOperationIdV1 =
  | 'summarize_text'
  | 'summarize_list'
  | 'generate_text'
  | 'transform_text'
  | 'extract_structured_fields'
  | 'rewrite_to_markdown'
  | 'classify_intent_label'
  | 'merge_multi_source_notes';

export type ValueTypeV1 =
  | 'string'
  | 'number'
  | 'boolean'
  | 'json'
  | 'text_list'
  | 'news_item_list'
  | 'markdown_content'
  | 'artifact_ref';

export interface ProjectedOutputContractV1 {
  outputContract: Record<string, ValueTypeV1>;
  primaryOutput?: string;
}

const VALUE_TYPES_V1 = new Set<ValueTypeV1>([
  'string',
  'number',
  'boolean',
  'json',
  'text_list',
  'news_item_list',
  'markdown_content',
  'artifact_ref',
]);

/**
 * Projects an authoritative JSON Schema into the small semantic type system
 * used by deterministic plans. Field names remain physical output paths;
 * semantic types such as `artifact_ref` never become field names.
 *
 * Capability authors should prefer `valueType` / `x-value-type` and
 * `primaryOutput` / `x-primary-output`. Structural and legacy-name inference
 * only preserves compatibility for already-published contracts.
 */
export function projectOutputSchemaV1(schema: unknown): ProjectedOutputContractV1 {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { outputContract: {} };
  }

  const schemaRecord = schema as Record<string, any>;
  const rawProperties = Object.prototype.hasOwnProperty.call(schemaRecord, 'properties')
    ? schemaRecord.properties
    : looksLikeJsonSchema(schemaRecord)
      ? {}
      : schemaRecord;
  const properties = normalizeOutputProperties(rawProperties);
  const outputContract: Record<string, ValueTypeV1> = {};

  for (const [fieldName, property] of Object.entries(properties)) {
    outputContract[fieldName] = projectOutputValueTypeV1(fieldName, property);
  }

  const explicitPrimary = [
    schemaRecord.primaryOutput,
    schemaRecord['x-primary-output'],
    schemaRecord.xPrimaryOutput,
  ].find((value) => typeof value === 'string' && value.length > 0) as string | undefined;
  const propertyPrimary = Object.entries(properties).find(([, property]) => {
    const record = asRecord(property);
    return (
      record.primary === true ||
      record['x-primary-output'] === true ||
      record.xPrimaryOutput === true
    );
  })?.[0];
  const primaryOutput =
    explicitPrimary && outputContract[explicitPrimary] ? explicitPrimary : propertyPrimary;

  return primaryOutput ? { outputContract, primaryOutput } : { outputContract };
}

/** Resolves a physical output field without guessing by object key order. */
export function resolvePrimaryOutputFieldV1(
  projection: ProjectedOutputContractV1,
  expectedType?: ValueTypeV1
): string | undefined {
  const { outputContract, primaryOutput } = projection;
  if (
    primaryOutput &&
    outputContract[primaryOutput] &&
    (!expectedType || outputContract[primaryOutput] === expectedType)
  ) {
    return primaryOutput;
  }

  if (expectedType) {
    const matches = Object.keys(outputContract).filter(
      (fieldName) => outputContract[fieldName] === expectedType
    );
    if (matches.length === 1) return matches[0];
    return undefined;
  }

  const fields = Object.keys(outputContract);
  return fields.length === 1 ? fields[0] : undefined;
}

function projectOutputValueTypeV1(fieldName: string, property: unknown): ValueTypeV1 {
  const record = asRecord(property);
  const declaredSemanticType = [
    typeof property === 'string' ? property : undefined,
    record.valueType,
    record.semanticType,
    record['x-value-type'],
    record.xValueType,
  ].find((value) => typeof value === 'string' && VALUE_TYPES_V1.has(value as ValueTypeV1));
  if (declaredSemanticType) return declaredSemanticType as ValueTypeV1;

  // Some operation catalogs historically placed semantic types directly in
  // JSON Schema `type`. Accept only non-JSON semantic tags here so ordinary
  // `type: string` does not mask field-level compatibility semantics below.
  if (
    typeof record.type === 'string' &&
    ['text_list', 'news_item_list', 'markdown_content', 'artifact_ref', 'json'].includes(
      record.type
    )
  ) {
    return record.type as ValueTypeV1;
  }

  if (isArtifactReferenceSchema(record)) return 'artifact_ref';

  // Compatibility for contracts published before semantic annotations existed.
  if (['searchResults', 'results', 'news_item_list'].includes(fieldName)) {
    return 'news_item_list';
  }
  if (fieldName === 'markdown_content') return 'markdown_content';

  switch (record.type ?? (typeof property === 'string' ? property : undefined)) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
    case 'object':
    default:
      return 'json';
  }
}

function isArtifactReferenceSchema(schema: Record<string, any>): boolean {
  if (schema.type !== 'object' && !schema.properties) return false;
  const properties = asRecord(schema.properties);
  return 'url' in properties && 'mimeType' in properties && 'name' in properties;
}

function normalizeOutputProperties(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const result: Record<string, unknown> = {};
    for (const property of value) {
      const record = asRecord(property);
      const fieldName = record.name ?? record.fieldName ?? record.key;
      if (typeof fieldName === 'string' && fieldName.length > 0) {
        result[fieldName] = record;
      }
    }
    return result;
  }
  return asRecord(value);
}

function looksLikeJsonSchema(value: Record<string, any>): boolean {
  return [
    '$schema',
    '$id',
    'type',
    'required',
    'additionalProperties',
    'oneOf',
    'anyOf',
    'allOf',
  ].some((keyword) => Object.prototype.hasOwnProperty.call(value, keyword));
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export type ValueBindingV1 =
  | { source: 'literal'; value: unknown }
  | { source: 'user_input'; path: string }
  | {
      source: 'node_output';
      nodeId: string;
      fromNodeId?: string;
      path?: string;
      outputPath?: string;
      expectedType?: ValueTypeV1;
      transform?: 'extract_unique_array';
    }
  | { source: 'runtime_default'; key: string };

export interface PlanNodeBaseV1 {
  nodeId: string;
  sequence: number;
  title: string;
  dependsOn: string[];
  inputBindings: Record<string, ValueBindingV1>;
  outputContract: Record<string, ValueTypeV1>;
  contractRef?: string;
  contractDigest?: string;
  failurePolicy: 'abort';
}

export interface SkillPlanNodeV1 extends PlanNodeBaseV1 {
  kind: 'skill';
  skillId: string;
  skillVersion: string;
  runtimeType: 'api' | 'workflow' | 'browser_template' | 'artifact';
  /** Actual runtime type for execution dispatch (e.g. 'document_markdown_writer'). When absent, runtimeType is used. */
  executionRuntimeType?: string;
  retryPolicyId?: string;
}

export interface LlmOperationPlanNodeV1 extends PlanNodeBaseV1 {
  kind: 'llm_operation';
  operationId: LlmOperationIdV1;
  operationVersion: string;
  operationDigest: string;
  contractDigest: string;
  promptTemplateId?: string;
  promptTemplateVersion?: string;
  modelPolicyId?: string;
  /** Exact model selected when the plan is frozen. */
  modelId?: string;
  temperature?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
}

export type DeterministicPlanNodeV1 = SkillPlanNodeV1 | LlmOperationPlanNodeV1;

export interface FinalOutputRequirementV1 {
  targetField: string;
  fromNodeId: string;
  fromNodeOutput: string;
  expectedType: ValueTypeV1;
  mimeType?: string;
  isArtifact?: boolean;
}

export interface RequiredUserInputV1 {
  targetField: string;
  nodeId: string;
  prompt: string;
  /** Stable submission key exposed to the chat/client input form. */
  name?: string;
  /** Path in execution.inputJson consumed by a user_input binding. */
  inputPath?: string;
  type?: string;
  description?: string;
  enum?: Array<string | number>;
  missing?: boolean;
}

export interface PlanValidationErrorV1 {
  code: string;
  message: string;
  nodeId?: string;
  field?: string;
}

export interface PlanValidationResultV1 {
  valid: boolean;
  errors: PlanValidationErrorV1[];
  warnings?: string[];
}

export interface DeterministicPlanDraftV1 {
  schemaVersion: 'deterministic-plan/v1';
  plannerVersion: string;
  catalogVersion: string;
  planType: 'single' | 'sequential';
  objective: string;
  originalRequest: string;
  status: 'draft' | 'validated' | 'frozen' | 'rejected';
  nodes: DeterministicPlanNodeV1[];
  finalOutputs: FinalOutputRequirementV1[];
  requiredUserInputs?: RequiredUserInputV1[];
  validationResult?: PlanValidationResultV1;
  planHash?: string;
}

export interface CompactCapabilityCardV1 {
  id: string;
  kind: 'skill' | 'llm_operation';
  displayName?: string;
  summary: string;
  goals: string[];
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  /** Physical field name selected by the authoritative output schema. */
  primaryOutput?: string;
  category?: SkillPlanNodeV1['runtimeType'];
  /** Actual execution runtime type (e.g. 'document_markdown_writer'). When absent, category/runtimeType is used for dispatch. */
  executionRuntimeType?: string;
  supportsArtifactOutput?: boolean;
  publishedSkillId?: string;
  executableVersion?: string;
  /** Immutable LLM Operation manifest digest; required when kind is llm_operation. */
  operationDigest?: string;
  /** Immutable LLM Operation input/output contract digest; required when kind is llm_operation. */
  contractDigest?: string;
}

/**
 * Stable canonical JSON representation of a plan draft for deterministic SHA-256 hashing.
 */
export function canonicalizePlan(plan: DeterministicPlanDraftV1): Record<string, unknown> {
  const sortedNodes = [...plan.nodes]
    .sort((a, b) => a.sequence - b.sequence)
    .map((node) => {
      const canonicalNode: Record<string, unknown> = {
        nodeId: node.nodeId,
        sequence: node.sequence,
        kind: node.kind,
        title: node.title,
        dependsOn: [...node.dependsOn].sort(),
        inputBindings: sortObjectKeys(node.inputBindings),
        outputContract: sortObjectKeys(node.outputContract),
        failurePolicy: node.failurePolicy,
      };
      if (node.contractRef) canonicalNode.contractRef = node.contractRef;
      if (node.contractDigest) canonicalNode.contractDigest = node.contractDigest;

      if (node.kind === 'skill') {
        canonicalNode.skillId = node.skillId;
        canonicalNode.skillVersion = node.skillVersion;
        canonicalNode.runtimeType = node.runtimeType;
        if (node.executionRuntimeType)
          canonicalNode.executionRuntimeType = node.executionRuntimeType;
        if (node.retryPolicyId) canonicalNode.retryPolicyId = node.retryPolicyId;
      } else if (node.kind === 'llm_operation') {
        canonicalNode.operationId = node.operationId;
        canonicalNode.operationVersion = node.operationVersion;
        canonicalNode.operationDigest = node.operationDigest;
        canonicalNode.contractDigest = node.contractDigest;
        if (node.promptTemplateId) canonicalNode.promptTemplateId = node.promptTemplateId;
        if (node.promptTemplateVersion)
          canonicalNode.promptTemplateVersion = node.promptTemplateVersion;
        if (node.modelPolicyId) canonicalNode.modelPolicyId = node.modelPolicyId;
        if (node.modelId) canonicalNode.modelId = node.modelId;
        if (node.temperature !== undefined) canonicalNode.temperature = node.temperature;
        if (node.maxInputTokens !== undefined) canonicalNode.maxInputTokens = node.maxInputTokens;
        if (node.maxOutputTokens !== undefined)
          canonicalNode.maxOutputTokens = node.maxOutputTokens;
      }
      return canonicalNode;
    });

  const sortedFinalOutputs = [...plan.finalOutputs]
    .sort((a, b) =>
      `${a.fromNodeId}:${a.targetField}`.localeCompare(`${b.fromNodeId}:${b.targetField}`)
    )
    .map((fo) => sortObjectKeys(fo));

  return {
    schemaVersion: plan.schemaVersion,
    planType: plan.planType,
    objective: plan.objective.trim(),
    nodes: sortedNodes,
    finalOutputs: sortedFinalOutputs,
  };
}

function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sortedObj: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const key of keys) {
    sortedObj[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sortedObj;
}

export function computePlanHash(plan: DeterministicPlanDraftV1): string {
  const canonical = canonicalizePlan(plan);
  const jsonStr = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
}
