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

@Injectable()
export class DeterministicPlanValidatorService {
  private readonly logger = new Logger(DeterministicPlanValidatorService.name);

  public validatePlan(plan: DeterministicPlanDraftV1): PlanValidationResultV1 {
    const errors: PlanValidationErrorV1[] = [];

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
      this.validateNodeBindings(node, nodeMap, errors);
    }

    // 6. Final Outputs Coverage check
    this.validateFinalOutputs(plan, nodeMap, errors);

    // 7. Sensitive data scanning
    this.scanSensitiveData(plan, errors);

    return {
      valid: errors.length === 0,
      errors,
    };
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
        const pNode = producerNode as any;
        const isArtifactProducer =
          pNode.kind === 'skill' &&
          (pNode.runtimeType === 'artifact' ||
            pNode.runtimeType === 'document' ||
            pNode.runtimeType === 'document_markdown_writer' ||
            pNode.executionRuntimeType === 'document_markdown_writer' ||
            pNode.supportsArtifact === true ||
            pNode.skillId === 'platform.document.markdown-artifact-writer' ||
            pNode.capabilityKey === 'platform.document.markdown-artifact-writer' ||
            pNode.capabilityKey === 'markdown_artifact_writer' ||
            pNode.skillName === 'markdown_artifact_writer' ||
            (typeof pNode.skillId === 'string' && pNode.skillId.startsWith('platform.')) ||
            pNode.nodeId === 'write_md_file' ||
            (typeof pNode.nodeId === 'string' && (pNode.nodeId.includes('md') || pNode.nodeId.includes('writer') || pNode.nodeId.includes('artifact'))));

        if (!isArtifactProducer) {
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
