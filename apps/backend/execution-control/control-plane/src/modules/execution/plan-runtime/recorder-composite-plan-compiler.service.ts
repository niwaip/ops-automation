import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  canonicalizePlan,
  BROWSER_RECORDING_ROOT_NODE_ID,
  projectOutputSchemaV1,
  resolvePrimaryOutputFieldV1,
  type DeterministicPlanDraftV1,
  type DeterministicPlanNodeV1,
  type ValueBindingV1,
} from '@ops/backend-deterministic-plan';
import { PrismaService } from '../../prisma/prisma.service';
import { CapabilityContractCatalogService } from './capability-contract-catalog.service';

type CompositionOutput = { name: string; kind: 'content' | 'value' | 'artifact' | 'page_state' };
type PostStepBase = {
  id: string;
  dependsOn?: string[];
  runWhen: 'browser_succeeded' | 'browser_terminal';
};
type LlmPostStep = PostStepBase & {
  type: 'llm_operation';
  operationId: string;
  operationVersion: string;
  inputBindings: Record<string, unknown>;
};
type WorkflowPostStep = PostStepBase & {
  type: 'workflow_skill';
  skillId: string;
  releaseId: string;
  inputProjection: 'ops-report-projection/v1';
  inputBindings?: Record<string, unknown>;
};

export type RecorderCompositeExecutionSpecV1 = {
  schemaVersion?: 'recorder-composite-execution/v1';
  browser: { skillId: string; skillVersion: string; outputNames?: string[] };
  objective?: string;
  composition: {
    outputDeclarations: CompositionOutput[];
    postProcessingSteps: Array<LlmPostStep | WorkflowPostStep>;
    finalNodeId?: string;
  };
};

/**
 * Turns an explicit recorder composition into the same deterministic plan
 * draft used by every other execution.  This is intentionally run at execute
 * time, not recorder publish time: operation and skill contracts are resolved
 * immediately before the normal freeze path pins their immutable identities.
 */
@Injectable()
export class RecorderCompositePlanCompilerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CapabilityContractCatalogService
  ) {}

  async compile(value: unknown): Promise<DeterministicPlanDraftV1> {
    const spec = this.validate(value);
    const contentOutputs = spec.composition.outputDeclarations
      .filter((output) => output.kind === 'content')
      .map((output) => output.name);
    const browserOutputs = new Set([
      'browserRunOutput',
      ...(spec.browser.outputNames || []),
      ...spec.composition.outputDeclarations.map((output) => output.name),
    ]);
    const hasTerminalPostProcessor = spec.composition.postProcessingSteps.some(
      (step) => step.runWhen === 'browser_terminal'
    );
    const nodes: DeterministicPlanNodeV1[] = [
      {
        nodeId: BROWSER_RECORDING_ROOT_NODE_ID,
        sequence: 1,
        title: '浏览器录制执行',
        kind: 'skill',
        skillId: spec.browser.skillId,
        skillVersion: spec.browser.skillVersion,
        runtimeType: 'browser_template',
        dependsOn: [],
        inputBindings: {},
        outputContract: Object.fromEntries([...browserOutputs].map((name) => [name, 'json'])),
        failurePolicy: hasTerminalPostProcessor ? 'continue' : 'abort',
      },
    ];

    for (const post of spec.composition.postProcessingSteps) {
      const sequence = nodes.length + 1;
      const dependsOn = this.resolveDependencies(post, nodes);
      if (
        post.type === 'workflow_skill' &&
        !post.inputBindings &&
        !dependsOn.includes(BROWSER_RECORDING_ROOT_NODE_ID)
      ) {
        dependsOn.push(BROWSER_RECORDING_ROOT_NODE_ID);
      }
      if (post.type === 'llm_operation') {
        const resolved = await this.catalog.resolveContract(this.prisma, {
          nodeId: post.id,
          kind: 'llm_operation',
          operationId: post.operationId,
          operationVersion: post.operationVersion,
        });
        const ref = resolved.capabilityRef;
        const matchesVersion =
          ref &&
          (ref.version === post.operationVersion ||
            ref.version.startsWith(`${post.operationVersion}.`) ||
            post.operationVersion === '1' ||
            !post.operationVersion);
        if (!ref || !matchesVersion) {
          throw new BadRequestException(
            `RECORDER_COMPOSITION_OPERATION_VERSION_INVALID: ${post.operationId}@${post.operationVersion}`
          );
        }
        nodes.push({
          nodeId: post.id,
          sequence,
          title: post.operationId,
          kind: 'llm_operation',
          operationId: post.operationId as any,
          operationVersion: ref.version,
          operationDigest: ref.digest,
          contractDigest: ref.digest,
          dependsOn,
          inputBindings: this.normalizeNodeBindings(post.inputBindings, contentOutputs, dependsOn),
          outputContract: projectOutputSchemaV1(resolved.outputSchema).outputContract,
          failurePolicy: 'abort',
          runWhen: post.runWhen,
        });
      } else {
        const workflowNode = {
          nodeId: post.id,
          kind: 'skill' as const,
          skillId: post.skillId,
          skillVersion: post.releaseId,
        };
        const resolved = await this.catalog.resolveContract(this.prisma, workflowNode);
        nodes.push({
          nodeId: post.id,
          sequence,
          title: post.skillId,
          kind: 'skill',
          skillId: post.skillId,
          skillVersion: post.releaseId,
          runtimeType: 'workflow',
          dependsOn,
          inputBindings: post.inputBindings
            ? this.normalizeNodeBindings(post.inputBindings, contentOutputs, dependsOn)
            : {
                report: {
                  source: 'node_output',
                  nodeId: BROWSER_RECORDING_ROOT_NODE_ID,
                  fromNodeId: BROWSER_RECORDING_ROOT_NODE_ID,
                  path: 'browserRunOutput',
                  expectedType: 'json',
                  transform: 'project_ops_report',
                },
              },
          outputContract: projectOutputSchemaV1(resolved.outputSchema).outputContract,
          failurePolicy: 'abort',
          runWhen: post.runWhen,
        });
      }
    }

    const finalNode = this.resolveFinalNode(spec, nodes);
    const primary = resolvePrimaryOutputFieldV1({ outputContract: finalNode.outputContract });
    const finalOutputs = primary
      ? [
          {
            targetField: 'result',
            fromNodeId: finalNode.nodeId,
            fromNodeOutput: primary,
            expectedType: finalNode.outputContract[primary]!,
            isArtifact: finalNode.outputContract[primary] === 'artifact_ref',
          },
        ]
      : [];
    const plan: DeterministicPlanDraftV1 = {
      schemaVersion: 'deterministic-plan/v1',
      plannerVersion: 'recorder-composition/v1',
      catalogVersion: 'runtime',
      planType: this.resolvePlanType(nodes),
      objective: spec.objective || '执行录制的浏览器流程及其显式后处理',
      originalRequest: spec.objective || '执行录制的浏览器流程及其显式后处理',
      status: 'validated',
      nodes,
      finalOutputs,
      requirements: { externalData: true },
    };
    plan.planHash = createHash('sha256')
      .update(JSON.stringify(canonicalizePlan(plan)))
      .digest('hex');
    return plan;
  }

  private normalizeNodeBindings(
    raw: Record<string, unknown>,
    contentOutputs: string[],
    dependsOn: string[]
  ): Record<string, ValueBindingV1> {
    const bindings: Record<string, ValueBindingV1> = {};
    for (const [field, value] of Object.entries(raw || {})) {
      const binding =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : undefined;
      if (!binding || binding.source !== 'node_output') {
        bindings[field] = value as ValueBindingV1;
        continue;
      }
      const sourceNodeId =
        (typeof binding.fromNodeId === 'string' && binding.fromNodeId.trim()) ||
        (typeof binding.nodeId === 'string' && binding.nodeId.trim()) ||
        BROWSER_RECORDING_ROOT_NODE_ID;
      if (!dependsOn.includes(sourceNodeId)) {
        throw new BadRequestException(
          `RECORDER_COMPOSITION_BINDING_SOURCE_NOT_DEPENDENCY: field '${field}' references '${sourceNodeId}'`
        );
      }
      const fallbackPath =
        sourceNodeId === BROWSER_RECORDING_ROOT_NODE_ID && contentOutputs.length === 1
          ? contentOutputs[0]
          : undefined;
      const rawPath =
        typeof binding.path === 'string'
          ? binding.path
          : typeof binding.outputPath === 'string'
            ? binding.outputPath
            : fallbackPath;
      const paths = Array.isArray(binding.paths)
        ? (binding.paths as string[]).filter(Boolean)
        : rawPath?.includes(',')
          ? rawPath
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean)
          : rawPath
            ? [rawPath]
            : [];

      if (!rawPath && paths.length === 0) {
        throw new BadRequestException(
          `RECORDER_COMPOSITION_CONTENT_BINDING_AMBIGUOUS: field '${field}' needs an explicit content output path`
        );
      }
      bindings[field] = {
        source: 'node_output',
        nodeId: sourceNodeId,
        fromNodeId: sourceNodeId,
        path: rawPath || paths.join(','),
        ...(paths.length > 1 ? ({ paths } as any) : {}),
        ...(typeof binding.expectedType === 'string'
          ? { expectedType: binding.expectedType as any }
          : { expectedType: 'json' }),
        ...(typeof binding.transform === 'string' ? { transform: binding.transform as any } : {}),
      };
    }
    return bindings;
  }

  private resolveDependencies(
    post: LlmPostStep | WorkflowPostStep,
    nodes: DeterministicPlanNodeV1[]
  ): string[] {
    const explicitDependencies = Array.isArray(post.dependsOn)
      ? [...new Set(post.dependsOn.map((value) => String(value || '').trim()).filter(Boolean))]
      : [];
    const dependsOn =
      explicitDependencies.length > 0 ? explicitDependencies : [BROWSER_RECORDING_ROOT_NODE_ID];
    const availableNodeIds = new Set(nodes.map((node) => node.nodeId));
    for (const dependency of dependsOn) {
      if (!availableNodeIds.has(dependency)) {
        throw new BadRequestException(
          `RECORDER_COMPOSITION_DEPENDENCY_INVALID: step '${post.id}' references unknown or forward dependency '${dependency}'`
        );
      }
    }
    return dependsOn;
  }

  private resolveFinalNode(
    spec: RecorderCompositeExecutionSpecV1,
    nodes: DeterministicPlanNodeV1[]
  ): DeterministicPlanNodeV1 {
    const dependedOn = new Set(nodes.flatMap((node) => node.dependsOn));
    const sinks = nodes.filter((node) => !dependedOn.has(node.nodeId));
    const explicitFinalNodeId = spec.composition.finalNodeId?.trim();
    if (explicitFinalNodeId) {
      const finalNode = nodes.find((node) => node.nodeId === explicitFinalNodeId);
      if (!finalNode || !sinks.some((node) => node.nodeId === explicitFinalNodeId)) {
        throw new BadRequestException(
          `RECORDER_COMPOSITION_FINAL_NODE_INVALID: '${explicitFinalNodeId}' must identify a DAG sink`
        );
      }
      return finalNode;
    }
    if (sinks.length !== 1) {
      throw new BadRequestException(
        `RECORDER_COMPOSITION_FINAL_NODE_AMBIGUOUS: expected one DAG sink, got ${sinks.map((node) => node.nodeId).join(', ')}`
      );
    }
    return sinks[0]!;
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

  private validate(value: unknown): RecorderCompositeExecutionSpecV1 {
    const spec =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as RecorderCompositeExecutionSpecV1)
        : undefined;
    if (
      !spec?.browser?.skillId ||
      !spec.browser.skillVersion ||
      !spec.composition ||
      !Array.isArray(spec.composition.outputDeclarations) ||
      !Array.isArray(spec.composition.postProcessingSteps)
    ) {
      throw new BadRequestException(
        'RECORDER_COMPOSITION_INVALID: browser skill/version, output declarations and post-processing steps are required'
      );
    }
    if (spec.composition.postProcessingSteps.length === 0) {
      throw new BadRequestException(
        'RECORDER_COMPOSITION_INVALID: at least one explicit post-processing step is required'
      );
    }
    const postIds = spec.composition.postProcessingSteps.map((post) => post.id?.trim());
    if (
      postIds.some((id) => !id || id === BROWSER_RECORDING_ROOT_NODE_ID) ||
      new Set(postIds).size !== postIds.length
    ) {
      throw new BadRequestException(
        `RECORDER_COMPOSITION_INVALID: post-processing IDs must be unique, non-empty, and cannot use '${BROWSER_RECORDING_ROOT_NODE_ID}'`
      );
    }
    return spec;
  }
}
