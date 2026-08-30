import { Injectable, Logger } from '@nestjs/common';
import {
  BROWSER_RECORDING_ROOT_NODE_ID,
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
      if (
        node.runWhen &&
        node.runWhen !== 'browser_succeeded' &&
        node.runWhen !== 'browser_terminal'
      ) {
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

    this.validateBrowserControlFlow(plan.nodes, nodeMap, errors);

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

    // 8. External-data provenance is an explicit planner decision. Execution
    // validation must not reclassify natural language using another keyword set.
    this.validateExternalDataSources(plan, errors);

    return {
      valid: errors.length === 0,
      errors,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  private validateExternalDataSources(
    plan: DeterministicPlanDraftV1,
    errors: PlanValidationErrorV1[]
  ): void {
    if (plan.requirements?.externalData !== true) {
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
      if (bindingEntries.length === 0) {
        offends.push(llm.nodeId);
        continue;
      }

      const hasUpstreamData = bindingEntries.some(([, binding]) => {
        if (!binding || typeof binding !== 'object') return false;
        const b = binding as { source?: string; nodeId?: string; fromNodeId?: string };
        if (b.source !== 'node_output') return false;
        const upstreamId = b.nodeId || b.fromNodeId || '';
        return this.hasSkillDataProvenance(upstreamId, nodeMap);
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
    const hint =
      skillCount === 0
        ? 'Plan must include at least one skill node that fetches external data (e.g. web search).'
        : `Plan must feed '${offendingList}' from an upstream skill output rather than literal-only inputs.`;

    errors.push({
      code: ERROR_CODES.PLAN_NODE_CAPABILITY_MISSING,
      message:
        `Plan explicitly requires external data. ` +
        `LLM operation(s) [${offendingList}] have no upstream skill node feeding them. ` +
        hint,
      nodeId: offendingList,
    });
  }

  private hasSkillDataProvenance(
    nodeId: string,
    nodeMap: Map<string, DeterministicPlanNodeV1>,
    visited = new Set<string>()
  ): boolean {
    if (!nodeId || visited.has(nodeId)) return false;
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node) return false;
    if (node.kind === 'skill') return true;
    return Object.values(node.inputBindings || {}).some((binding) => {
      if (!binding || binding.source !== 'node_output') return false;
      return this.hasSkillDataProvenance(
        binding.nodeId || binding.fromNodeId || '',
        nodeMap,
        visited
      );
    });
  }

  private validateBrowserControlFlow(
    nodes: DeterministicPlanNodeV1[],
    nodeMap: Map<string, DeterministicPlanNodeV1>,
    errors: PlanValidationErrorV1[]
  ): void {
    const browserRoot = nodeMap.get(BROWSER_RECORDING_ROOT_NODE_ID);
    const terminalConsumers = nodes.filter((node) => node.runWhen === 'browser_terminal');

    for (const node of nodes) {
      if (node.failurePolicy === 'continue') {
        const isReservedBrowserRoot =
          node.nodeId === BROWSER_RECORDING_ROOT_NODE_ID &&
          node.kind === 'skill' &&
          node.runtimeType === 'browser_template';
        const hasTerminalConsumer = terminalConsumers.some((consumer) =>
          this.hasAncestor(consumer, node.nodeId, nodeMap)
        );
        if (!isReservedBrowserRoot || !hasTerminalConsumer) {
          errors.push({
            code: ERROR_CODES.PLAN_SCHEMA_INVALID,
            message:
              `Node '${node.nodeId}' uses failurePolicy='continue', but that policy is reserved for ` +
              `the '${BROWSER_RECORDING_ROOT_NODE_ID}' browser root with an explicit browser_terminal consumer`,
            nodeId: node.nodeId,
          });
        }
      }

      if (!node.runWhen) continue;
      const hasValidBrowserRoot =
        browserRoot?.kind === 'skill' && browserRoot.runtimeType === 'browser_template';
      if (
        !hasValidBrowserRoot ||
        !this.hasAncestor(node, BROWSER_RECORDING_ROOT_NODE_ID, nodeMap)
      ) {
        errors.push({
          code: ERROR_CODES.PLAN_DEPENDENCY_INVALID,
          message:
            `Node '${node.nodeId}' uses runWhen='${node.runWhen}' without the reserved browser root ` +
            `'${BROWSER_RECORDING_ROOT_NODE_ID}' as an upstream dependency`,
          nodeId: node.nodeId,
        });
      }
    }
  }

  private hasAncestor(
    node: DeterministicPlanNodeV1,
    ancestorId: string,
    nodeMap: Map<string, DeterministicPlanNodeV1>,
    visited = new Set<string>()
  ): boolean {
    for (const dependencyId of node.dependsOn || []) {
      if (dependencyId === ancestorId) return true;
      if (visited.has(dependencyId)) continue;
      visited.add(dependencyId);
      const dependency = nodeMap.get(dependencyId);
      if (dependency && this.hasAncestor(dependency, ancestorId, nodeMap, visited)) return true;
    }
    return false;
  }

  private calculateMaxDepth(
    nodes: DeterministicPlanNodeV1[],
    nodeMap: Map<string, DeterministicPlanNodeV1>
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
    warnings: string[]
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
              `Node '${node.nodeId}' field '${fieldName}' binds upstream output '${outPath}' without expectedType — edge type compatibility is not enforced`
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
    errors: PlanValidationErrorV1[]
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

  private scanSensitiveData(plan: DeterministicPlanDraftV1, errors: PlanValidationErrorV1[]): void {
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
