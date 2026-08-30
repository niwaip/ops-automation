import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  DeterministicPlanDraftV1,
  DeterministicPlanNodeV1,
  SkillPlanNodeV1,
  LlmOperationPlanNodeV1,
  FinalOutputRequirementV1,
  CompactCapabilityCardV1,
  ValueTypeV1,
  ValueBindingV1,
  canonicalizePlan,
  resolvePrimaryOutputFieldV1,
} from '@ops/backend-deterministic-plan';
import type { DeterministicTopologyDraftV1 } from '../topology/deterministic-topology.types';
import type { ParameterBindingResult } from '../binding/multi-node-parameter-binder.service';

@Injectable()
export class DeterministicContractAssemblerService {
  private readonly logger = new Logger(DeterministicContractAssemblerService.name);

  public assemblePlan(
    topology: DeterministicTopologyDraftV1,
    bindingResult: ParameterBindingResult,
    capabilityMap: Map<string, CompactCapabilityCardV1>,
    runtimeModelId?: string
  ): DeterministicPlanDraftV1 {
    const nodes: DeterministicPlanNodeV1[] = [];
    const refToNodeId = new Map<string, string>();
    for (const node of topology.nodes) {
      const card = capabilityMap.get(node.capabilityKey);
      const nodeId = `${node.ref}_${card?.displayName || 'step'}`;
      refToNodeId.set(node.ref, nodeId);
    }

    for (let index = 0; index < topology.nodes.length; index++) {
      const node = topology.nodes[index]!;
      const card = capabilityMap.get(node.capabilityKey);
      const sequence = index + 1;
      const isSkill = card?.kind === 'skill';
      const nodeId = refToNodeId.get(node.ref)!;

      const outputContract: Record<string, ValueTypeV1> = {};
      const outputProperties = (card?.outputs as any)?.properties
        ? ((card?.outputs as any).properties as Record<string, any>)
        : (card?.outputs as Record<string, any>) || {};

      for (const [key, val] of Object.entries(outputProperties)) {
        outputContract[key] =
          typeof val === 'object' && val !== null
            ? ((val as any).type as ValueTypeV1) || 'string'
            : (val as ValueTypeV1) || 'string';
      }
      if (Object.keys(outputContract).length === 0) {
        const err = new Error(
          `Capability '${card?.id || node.capabilityKey}' has no authoritative output contract`
        ) as Error & { code: string };
        err.code = 'CAPABILITY_CONTRACT_MISSING';
        throw err;
      }

      const dependsOnNodeIds = node.dependsOn.map((depRef) => refToNodeId.get(depRef) || depRef);

      const rawBindings = bindingResult.nodeBindings[node.ref] || {};
      const inputBindings: Record<string, ValueBindingV1> = {};

      for (const [paramKey, binding] of Object.entries(rawBindings)) {
        if (binding.source === 'node_output') {
          const mappedNodeId = refToNodeId.get(binding.nodeId) || binding.nodeId;
          inputBindings[paramKey] = {
            ...binding,
            nodeId: mappedNodeId,
            fromNodeId: mappedNodeId,
          };
        } else {
          inputBindings[paramKey] = binding;
        }
      }

      if (isSkill) {
        const rawRuntimeType = card?.category || 'workflow';
        const runtimeType: 'api' | 'workflow' | 'browser_template' | 'artifact' =
          rawRuntimeType === 'artifact' ||
          rawRuntimeType === 'browser_template' ||
          rawRuntimeType === 'api'
            ? rawRuntimeType
            : 'workflow';

        const planNode: SkillPlanNodeV1 = {
          nodeId,
          sequence,
          title: card?.displayName || `Step ${sequence}`,
          kind: 'skill',
          skillId: card?.publishedSkillId || card?.id || node.capabilityKey,
          skillVersion: card?.executableVersion || '1.0.0',
          runtimeType,
          executionRuntimeType: card?.executionRuntimeType,
          dependsOn: dependsOnNodeIds,
          inputBindings,
          outputContract,
          failurePolicy: 'abort',
        };
        nodes.push(planNode);
      } else {
        if (!card?.executableVersion || !card.operationDigest || !card.contractDigest) {
          const err = new Error(
            `LLM Operation '${card?.id || node.capabilityKey}' is missing immutable version metadata`
          ) as Error & { code: string };
          err.code = 'CAPABILITY_NOT_FOUND';
          throw err;
        }
        const planNode: LlmOperationPlanNodeV1 = {
          nodeId,
          sequence,
          title: card?.displayName || `Step ${sequence}`,
          kind: 'llm_operation',
          operationId: (card?.id || node.capabilityKey) as any,
          operationVersion: card.executableVersion,
          operationDigest: card.operationDigest,
          contractDigest: card.contractDigest,
          ...(runtimeModelId ? { modelId: runtimeModelId } : {}),
          dependsOn: dependsOnNodeIds,
          inputBindings,
          outputContract,
          failurePolicy: 'abort',
        };
        nodes.push(planNode);
      }
    }

    const finalNodeObj =
      topology.nodes.find((n) => n.ref === topology.finalNodeRef) ||
      topology.nodes[topology.nodes.length - 1]!;
    const finalCard = capabilityMap.get(finalNodeObj.capabilityKey);
    const finalNodeId = refToNodeId.get(finalNodeObj.ref)!;
    const finalOutputs: FinalOutputRequirementV1[] = [];
    const finalNode = nodes.find((node) => node.nodeId === finalNodeId)!;
    const requestedType: ValueTypeV1 | undefined =
      topology.finalOutputKind === 'artifact' ? 'artifact_ref' : undefined;
    const primaryOutput = resolvePrimaryOutputFieldV1(
      {
        outputContract: finalNode.outputContract,
        primaryOutput: finalCard?.primaryOutput,
      },
      requestedType
    );

    if (!primaryOutput && requestedType) {
      const err: any = new Error(
        `Cannot resolve a unique primary output for final capability '${finalCard?.id || finalNodeId}'` +
          `${requestedType ? ` with semantic type '${requestedType}'` : ''}. ` +
          `Declare primaryOutput/x-primary-output in its authoritative output schema.`
      );
      err.code = 'FINAL_OUTPUT_UNSATISFIED';
      throw err;
    }

    if (primaryOutput) {
      const expectedType = finalNode.outputContract[primaryOutput]!;
      finalOutputs.push({
        targetField: 'result',
        fromNodeId: finalNodeId,
        fromNodeOutput: primaryOutput,
        expectedType,
        isArtifact: expectedType === 'artifact_ref',
      });
    } else {
      // Value-producing terminal capabilities may legitimately expose a
      // structured acknowledgement (for example { code, message }). Preserve
      // every declared field instead of inventing an arbitrary primary output.
      for (const [field, expectedType] of Object.entries(finalNode.outputContract)) {
        finalOutputs.push({
          targetField: field,
          fromNodeId: finalNodeId,
          fromNodeOutput: field,
          expectedType,
          isArtifact: expectedType === 'artifact_ref',
        });
      }
    }

    const mappedRequiredUserInputs = bindingResult.requiredUserInputs.map((input) => {
      const mappedNodeId = input.nodeId
        ? refToNodeId.get(input.nodeId) || input.nodeId
        : input.nodeId;
      return {
        ...input,
        nodeId: mappedNodeId,
      };
    });

    const planDraft: DeterministicPlanDraftV1 = {
      schemaVersion: 'deterministic-plan/v1',
      plannerVersion: '2.1.0-two-stage-llm',
      catalogVersion: '1.0.0',
      planType: this.resolvePlanType(nodes),
      objective: topology.objective,
      originalRequest: topology.objective,
      status: 'validated',
      nodes,
      finalOutputs,
      requirements: {
        externalData: topology.requiresExternalData === true,
      },
      requiredUserInputs:
        mappedRequiredUserInputs.length > 0 ? mappedRequiredUserInputs : undefined,
    };

    try {
      const canonical = canonicalizePlan(planDraft);
      planDraft.planHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(canonical))
        .digest('hex');
    } catch {
      // Ignore hash error fallback
    }

    return planDraft;
  }

  private resolvePlanType(nodes: DeterministicPlanNodeV1[]): DeterministicPlanDraftV1['planType'] {
    if (nodes.length <= 1) return 'single';
    const isLinear = nodes.every((node, index) =>
      index === 0
        ? node.dependsOn.length === 0
        : node.dependsOn.length === 1 && node.dependsOn[0] === nodes[index - 1]!.nodeId
    );
    return isLinear ? 'sequential' : 'dag';
  }
}
