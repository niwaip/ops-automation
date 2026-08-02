import * as crypto from 'crypto';

export type LlmOperationIdV1 =
  | 'summarize_text'
  | 'summarize_list'
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

export type ValueBindingV1 =
  | { source: 'literal'; value: unknown }
  | { source: 'user_input'; path: string }
  | { source: 'node_output'; nodeId: string; fromNodeId?: string; path?: string; outputPath?: string; expectedType?: ValueTypeV1 }
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
  promptTemplateId: string;
  promptTemplateVersion: string;
  modelPolicyId: string;
  temperature: 0;
  maxInputTokens: number;
  maxOutputTokens: number;
}

export type DeterministicPlanNodeV1 =
  | SkillPlanNodeV1
  | LlmOperationPlanNodeV1;

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
  category?: SkillPlanNodeV1['runtimeType'];
  /** Actual execution runtime type (e.g. 'document_markdown_writer'). When absent, category/runtimeType is used for dispatch. */
  executionRuntimeType?: string;
  supportsArtifactOutput?: boolean;
  publishedSkillId?: string;
  executableVersion?: string;
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
        if (node.executionRuntimeType) canonicalNode.executionRuntimeType = node.executionRuntimeType;
        if (node.retryPolicyId) canonicalNode.retryPolicyId = node.retryPolicyId;
      } else if (node.kind === 'llm_operation') {
        canonicalNode.operationId = node.operationId;
        canonicalNode.promptTemplateId = node.promptTemplateId;
        canonicalNode.promptTemplateVersion = node.promptTemplateVersion;
        canonicalNode.modelPolicyId = node.modelPolicyId;
        canonicalNode.temperature = node.temperature;
        canonicalNode.maxInputTokens = node.maxInputTokens;
        canonicalNode.maxOutputTokens = node.maxOutputTokens;
      }
      return canonicalNode;
    });

  const sortedFinalOutputs = [...plan.finalOutputs]
    .sort((a, b) => `${a.fromNodeId}:${a.targetField}`.localeCompare(`${b.fromNodeId}:${b.targetField}`))
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
