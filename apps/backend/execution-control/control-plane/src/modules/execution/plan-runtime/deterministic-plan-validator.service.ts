import { Injectable, Logger } from '@nestjs/common';
import {
  DeterministicPlanDraftV1,
  PlanValidationResultV1,
  PlanValidationErrorV1,
  DeterministicPlanNodeV1,
  ValueBindingV1,
  ValueTypeV1,
} from '@ops/backend-deterministic-plan';
import { ERROR_CODES } from '@ops/backend-error-codes';

export const PLAN_LIMITS = {
  MAX_NODES: 6,
  MAX_DEPTH: 5,
};

const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,
  /bearer\s+[a-zA-Z0-9\-._~+/]+=*/i,
  /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9\-._~+/]+['"]/i,
  /password\s*[:=]\s*['"][^'"]+['"]/i,
  /\$\{[A-Z0-9_]*(API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*\}/i,
];

/**
 * Edge type compatibility table (§15.3 item 4).
 *
 * `SUBTYPE_COMPAT[upstream]` is the set of expected types the declared upstream
 * output type can satisfy. `json` is the container escape hatch (any value can
 * be treated as JSON); `string` ↔ `markdown_content` are interchangeable.
 */
const SUBTYPE_COMPAT: Record<ValueTypeV1, ReadonlySet<ValueTypeV1>> = {
  string: new Set(['string', 'markdown_content', 'json']),
  number: new Set(['number', 'json']),
  boolean: new Set(['boolean', 'json']),
  json: new Set([
    'string',
    'number',
    'boolean',
    'json',
    'text_list',
    'news_item_list',
    'markdown_content',
    'artifact_ref',
  ]),
  text_list: new Set(['text_list', 'json']),
  news_item_list: new Set(['news_item_list', 'json']),
  markdown_content: new Set(['markdown_content', 'string', 'json']),
  artifact_ref: new Set(['artifact_ref', 'json']),
};

@Injectable()
export class DeterministicPlanValidatorService {
  private readonly logger = new Logger(DeterministicPlanValidatorService.name);

  /**
   * Whether an upstream declared output type can satisfy the expected type.
   * Public so the freeze service's catalog-level edge pass reuses the same
   * compatibility authority (§15.3 item 4).
   */
  public isTypeCompatible(upstream: ValueTypeV1, expected: ValueTypeV1): boolean {
    const compat = SUBTYPE_COMPAT[upstream];
    return compat ? compat.has(expected) : false;
  }

  public validatePlan(plan: DeterministicPlanDraftV1): PlanValidationResultV1 {
    const errors: PlanValidationErrorV1[] = [];
    const warnings: string[] = [];

    // 1. Schema version check
    if (plan.schemaVersion !== 'deterministic-plan/v1') {
      errors.push({
        code: ERROR_CODES.PLAN_SCHEMA_INVALID,
        message: `Unsupported schema version: ${plan.schemaVersion}`,
      });
      return { valid: false, errors };
    }

    // 2. Node count check
    if (!Array.isArray(plan.nodes) || plan.nodes.length === 0) {
      errors.push({
        code: ERROR_CODES.PLAN_SCHEMA_INVALID,
        message: 'Plan must contain at least one node',
      });
      return { valid: false, errors };
    }

    if (plan.nodes.length > PLAN_LIMITS.MAX_NODES) {
      errors.push({
        code: ERROR_CODES.PLAN_LIMIT_EXCEEDED,
        message: `Plan exceeds maximum allowed nodes (${plan.nodes.length} > ${PLAN_LIMITS.MAX_NODES})`,
      });
    }

    // 3. Node IDs, sequence continuity, and duplicate check
    const nodeMap = new Map<string, DeterministicPlanNodeV1>();
    const nodeSequenceMap = new Map<number, string>();

    for (let i = 0; i < plan.nodes.length; i++) {
      const node = plan.nodes[i];
      const expectedSeq = i + 1;

      if (node.sequence !== expectedSeq) {
        errors.push({
          code: ERROR_CODES.PLAN_SCHEMA_INVALID,
          message: `Node '${node.nodeId}' has non-sequential sequence number ${node.sequence}, expected ${expectedSeq}`,
          nodeId: node.nodeId,
        });
      }

      if (nodeMap.has(node.nodeId)) {
        errors.push({
          code: ERROR_CODES.PLAN_DEPENDENCY_INVALID,
          message: `Duplicate node ID: ${node.nodeId}`,
          nodeId: node.nodeId,
        });
      }
      nodeMap.set(node.nodeId, node);
      nodeSequenceMap.set(node.sequence, node.nodeId);
    }

    // 4. DAG & Dependency check + Max depth calculation
    for (const node of plan.nodes) {
      if (node.failurePolicy !== 'abort' && node.failurePolicy !== 'continue') {
        errors.push({
          code: ERROR_CODES.PLAN_SCHEMA_INVALID,
          message: `Node '${node.nodeId}' has unsupported failure policy '${(node as any).failurePolicy}'`,
          nodeId: node.nodeId,
        });
      }
      if (node.runWhen && node.runWhen !== 'browser_succeeded' && node.runWhen !== 'browser_terminal') {
        errors.push({
          code: ERROR_CODES.PLAN_SCHEMA_INVALID,
          message: `Node '${node.nodeId}' has unsupported runWhen '${node.runWhen}'`,
          nodeId: node.nodeId,
        });
      }
      for (const depId of node.dependsOn || []) {
        const depNode = nodeMap.get(depId);
        if (!depNode) {
          errors.push({
            code: ERROR_CODES.PLAN_DEPENDENCY_INVALID,
            message: `Node '${node.nodeId}' depends on non-existent node '${depId}'`,
            nodeId: node.nodeId,
          });
        } else if (depNode.sequence >= node.sequence) {
          errors.push({
            code: ERROR_CODES.PLAN_DEPENDENCY_INVALID,
            message: `Node '${node.nodeId}' (seq ${node.sequence}) depends on node '${depId}' (seq ${depNode.sequence}) which is not strictly prior`,
            nodeId: node.nodeId,
          });
        }
      }
    }

    const depth = this.calculateMaxDepth(plan.nodes, nodeMap);
    if (depth > PLAN_LIMITS.MAX_DEPTH) {
      errors.push({
        code: ERROR_CODES.PLAN_LIMIT_EXCEEDED,
        message: `Plan dependency depth (${depth}) exceeds maximum limit (${PLAN_LIMITS.MAX_DEPTH})`,
      });
    }

    // 5. Input Binding & Type Compatibility check
    for (const node of plan.nodes) {
      this.validateNodeBindings(node, nodeMap, errors, warnings);
    }

    // 6. Final Outputs Coverage check
    this.validateFinalOutputs(plan, nodeMap, errors);

    // 7. Sensitive data scanning
    this.scanSensitiveData(plan, errors);

    // 8. Freshness gate: when the user request asks for live/external data, the
    // plan MUST include at least one upstream node that produces results from
    // outside the LLM (i.e. a skill with non-empty node_output bindings feeding
    // the summarizer, never a literal-only outline). This prevents the failure
    // mode where an LLM is asked to summarize from a planner-authored outline
    // and hallucinates content presented as if it came from a real fetch.
    this.validateExternalDataSources(plan, errors);

    return {
      valid: errors.length === 0,
      errors,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  private validateExternalDataSources(
    plan: DeterministicPlanDraftV1,
    errors: PlanValidationErrorV1[],
  ): void {
    const freshnessPattern =
      /查询|搜索|最新|新闻|实时|行情|股价|股票|天气|温度|今天|此刻|现在|当前|fetch|search|news|stock|price|weather|today|now|latest|current/i;
    const objective = plan.objective || plan.originalRequest || '';
    if (!freshnessPattern.test(objective)) {
      return;
    }

    const skillNodes = plan.nodes.filter((n) => n.kind === 'skill');
    const llmNodes = plan.nodes.filter((n) => n.kind === 'llm_operation');
    if (llmNodes.length === 0) {
      return;
    }

    const nodeMap = new Map(plan.nodes.map((n) => [n.nodeId, n]));
    const offends: string[] = [];

    for (const llm of llmNodes) {
      const bindings = llm.inputBindings || {};
      const bindingEntries = Object.entries(bindings);
      if (bindingEntries.length === 0) continue;

      const hasUpstreamData = bindingEntries.some(([, binding]) => {
        if (!binding || typeof binding !== 'object') return false;
        const b = binding as { source?: string; nodeId?: string; fromNodeId?: string };
        if (b.source !== 'node_output') return false;
        const upstreamId = b.nodeId || b.fromNodeId || '';
        const upstream = nodeMap.get(upstreamId);
        if (!upstream) return false;
        return upstream.kind === 'skill' && skillNodes.some((s) => s.nodeId === upstream.nodeId);
      });

      if (!hasUpstreamData) {
        offends.push(llm.nodeId);
      }
    }

    if (offends.length === 0) {
      return;
    }

    const offendingList = offends.join(', ');
    const skillCount = skillNodes.length;
    const hint = skillCount === 0
      ? 'Plan must include at least one skill node that fetches external data (e.g. web search).'
      : `Plan must feed '${offendingList}' from an upstream skill output rather than literal-only inputs.`;

    errors.push({
      code: ERROR_CODES.PLAN_NODE_CAPABILITY_MISSING,
      message:
        `Freshness-required request detected in objective "${objective}". ` +
        `LLM operation(s) [${offendingList}] have no upstream skill node feeding them. ` +
        hint,
      nodeId: offendingList,
    });
  }

  private calculateMaxDepth(
    nodes: DeterministicPlanNodeV1[],
    nodeMap: Map<string, DeterministicPlanNodeV1>,
  ): number {
    const depthMemo = new Map<string, number>();
    const visiting = new Set<string>();

    const getDepth = (nodeId: string): number => {
      if (depthMemo.has(nodeId)) return depthMemo.get(nodeId)!;
      if (visiting.has(nodeId)) return 1; // Break cycle safely

      visiting.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (!node || !node.dependsOn || node.dependsOn.length === 0) {
        visiting.delete(nodeId);
        depthMemo.set(nodeId, 1);
        return 1;
      }
      let maxParentDepth = 0;
      for (const depId of node.dependsOn) {
        maxParentDepth = Math.max(maxParentDepth, getDepth(depId));
      }
      visiting.delete(nodeId);
      const currentDepth = maxParentDepth + 1;
      depthMemo.set(nodeId, currentDepth);
      return currentDepth;
    };

    let maxDepth = 0;
    for (const node of nodes) {
      maxDepth = Math.max(maxDepth, getDepth(node.nodeId));
    }
    return maxDepth;
  }

  private validateNodeBindings(
    node: DeterministicPlanNodeV1,
    nodeMap: Map<string, DeterministicPlanNodeV1>,
    errors: PlanValidationErrorV1[],
    warnings: string[],
  ): void {
    if (!node.inputBindings) return;

    for (const [fieldName, binding] of Object.entries(node.inputBindings)) {
      if (!binding || !binding.source) {
        errors.push({
          code: ERROR_CODES.INPUT_BINDING_MISSING,
          message: `Node '${node.nodeId}' field '${fieldName}' has invalid or missing binding`,
          nodeId: node.nodeId,
          field: fieldName,
        });
        continue;
      }

      if (binding.source === 'node_output') {
        const targetNodeId = binding.nodeId || binding.fromNodeId || '';
        const fromNode = nodeMap.get(targetNodeId);
        if (!fromNode) {
          errors.push({
            code: ERROR_CODES.INPUT_BINDING_MISSING,
            message: `Node '${node.nodeId}' field '${fieldName}' references output from non-existent node '${targetNodeId}'`,
            nodeId: node.nodeId,
            field: fieldName,
          });
        } else if (fromNode.sequence >= node.sequence) {
          errors.push({
            code: ERROR_CODES.PLAN_DEPENDENCY_INVALID,
            message: `Node '${node.nodeId}' field '${fieldName}' binds output from non-prior node '${targetNodeId}'`,
            nodeId: node.nodeId,
            field: fieldName,
          });
        } else {
          const outPath = binding.path || binding.outputPath || '';
          const upstreamOutputType = fromNode.outputContract?.[outPath];
          if (!upstreamOutputType) {
            errors.push({
              code: ERROR_CODES.INPUT_TYPE_MISMATCH,
              message: `Node '${node.nodeId}' field '${fieldName}' binds output path '${outPath}' which is not declared in node '${fromNode.nodeId}' output contract`,
              nodeId: node.nodeId,
              field: fieldName,
            });
          } else if (!binding.expectedType) {
            // Backward-compatible: planners may omit expectedType. Type
            // compatibility is then unenforced at planner level (the freeze
            // service's catalog-level pass may still assert it from schemas).
            warnings.push(
              `Node '${node.nodeId}' field '${fieldName}' binds upstream output '${outPath}' without expectedType — edge type compatibility is not enforced`,
            );
          } else if (!this.isTypeCompatible(upstreamOutputType, binding.expectedType)) {
            errors.push({
              code: ERROR_CODES.EDGE_TYPE_INCOMPATIBLE,
              message: `Node '${node.nodeId}' field '${fieldName}' expects type '${binding.expectedType}', but producer node '${fromNode.nodeId}' output path '${outPath}' provides '${upstreamOutputType}'`,
              nodeId: node.nodeId,
              field: fieldName,
            });
          }
        }
      } else if (binding.source === 'literal') {
        if (this.isSensitiveFieldName(fieldName)) {
          errors.push({
            code: ERROR_CODES.PLAN_SENSITIVE_DATA_FOUND,
            message: `Node '${node.nodeId}' field '${fieldName}' must not be supplied as a literal binding`,
            nodeId: node.nodeId,
            field: fieldName,
          });
        }

        if (typeof binding.value === 'string' && /\$\{[^}]+\}/.test(binding.value)) {
          errors.push({
            code: ERROR_CODES.INPUT_BINDING_MISSING,
            message: `Node '${node.nodeId}' field '${fieldName}' contains unresolved placeholder '${binding.value}'`,
            nodeId: node.nodeId,
            field: fieldName,
          });
        }
      }
    }
  }

  private validateFinalOutputs(
    plan: DeterministicPlanDraftV1,
    nodeMap: Map<string, DeterministicPlanNodeV1>,
    errors: PlanValidationErrorV1[],
  ): void {
    if (!Array.isArray(plan.finalOutputs)) {
      errors.push({
        code: ERROR_CODES.PLAN_SCHEMA_INVALID,
        message: 'Plan finalOutputs must be an array',
      });
      return;
    }

    for (const req of plan.finalOutputs) {
      const producerNode = nodeMap.get(req.fromNodeId);
      if (!producerNode) {
        errors.push({
          code: ERROR_CODES.FINAL_OUTPUT_UNSATISFIED,
          message: `Final output requirement references non-existent node '${req.fromNodeId}'`,
          nodeId: req.fromNodeId,
          field: req.targetField,
        });
        continue;
      }

      const declaredType = producerNode.outputContract?.[req.fromNodeOutput];
      if (!declaredType) {
        errors.push({
          code: ERROR_CODES.FINAL_OUTPUT_UNSATISFIED,
          message: `Final output field '${req.targetField}' references output '${req.fromNodeOutput}' which is not in node '${req.fromNodeId}' output contract`,
          nodeId: req.fromNodeId,
          field: req.targetField,
        });
      } else if (declaredType !== req.expectedType) {
        errors.push({
          code: ERROR_CODES.FINAL_OUTPUT_UNSATISFIED,
          message: `Final output field '${req.targetField}' expects '${req.expectedType}' but node '${req.fromNodeId}' declares '${declaredType}'`,
          nodeId: req.fromNodeId,
          field: req.targetField,
        });
      } else if (req.isArtifact || req.expectedType === 'artifact_ref') {
        // Artifact capability is a contract property, not a Skill ID/name
        // convention. The exact output field and its artifact_ref type were
        // already proven above; only executable Skill nodes may publish files.
        if (producerNode.kind !== 'skill') {
          errors.push({
            code: ERROR_CODES.FINAL_OUTPUT_UNSATISFIED,
            message: `Final output field '${req.targetField}' requires an artifact-producing Skill node`,
            nodeId: req.fromNodeId,
            field: req.targetField,
          });
        }
      }
    }
  }

  private scanSensitiveData(
    plan: DeterministicPlanDraftV1,
    errors: PlanValidationErrorV1[],
  ): void {
    const rawJson = JSON.stringify(plan);
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(rawJson)) {
        errors.push({
          code: ERROR_CODES.PLAN_SENSITIVE_DATA_FOUND,
          message: `Sensitive token pattern detected in plan draft`,
        });
        break;
      }
    }
  }

  private isSensitiveFieldName(fieldName: string): boolean {
    return /api[_-]?key|token|secret|password|credential|authorization/i.test(fieldName);
  }
}
