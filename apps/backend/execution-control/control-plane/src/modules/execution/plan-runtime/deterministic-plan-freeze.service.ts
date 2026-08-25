import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DeterministicPlanDraftV1,
  PlanValidationErrorV1,
  ValueBindingV1,
  ValueTypeV1,
  computePlanHash,
  projectOutputSchemaV1,
} from '@ops/backend-deterministic-plan';
import { DeterministicPlanValidatorService } from './deterministic-plan-validator.service';
import {
  CapabilityContractCatalogService,
  ResolvedCapabilityContract,
} from './capability-contract-catalog.service';
import { LlmOperationAttestationClient } from './llm-operation-attestation.client';
import { ERROR_CODES } from '@ops/backend-error-codes';

/**
 * §10.4 — a producer→consumer edge whose producer schema is open
 * (`additionalProperties: true`): composition can only verify the declared
 * required fields and explicit properties, so the result is `required_only`,
 * never a full object-compatibility proof.
 */
export interface EdgeCompositionDetail {
  nodeId: string;
  field: string;
  producerNodeId: string;
  outputPath: string;
  severity: 'required_only';
}

@Injectable()
export class DeterministicPlanFreezeService {
  private readonly logger = new Logger(DeterministicPlanFreezeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: DeterministicPlanValidatorService,
    private readonly catalog: CapabilityContractCatalogService,
    private readonly attestationClient: LlmOperationAttestationClient,
  ) {}

  /**
   * Freezes a plan draft, validates it, computes its planHash, and saves ExecutionPlan + ExecutionSteps in a single DB transaction.
   */
  public async freezeAndPersistPlan(
    executionId: string,
    planDraft: DeterministicPlanDraftV1,
    txPrisma?: any,
  ): Promise<{ planId: string; planHash: string }> {
    const frozenAt = new Date();
    const client = txPrisma || this.prisma;

    // 1. Resolve AUTHORITATIVE input/output contracts for every node BEFORE
    //    any DB write, and attach contractRef/contractDigest to the nodes (§9.3).
    //    Fail-closed resolution (§17.1) aborts here, before partial persistence.
    const resolvedOutputSchemas: Record<string, Record<string, unknown>> = {};
    const resolvedInputSchemas: Record<string, Record<string, unknown> | null> = {};
    const contractCompatMap = new Map<string, 'backward' | 'none'>();
    for (const node of planDraft.nodes) {
      const contract = await this.catalog.resolveContract(client, node);
      resolvedOutputSchemas[node.nodeId] = contract.outputSchema as Record<string, unknown>;
      resolvedInputSchemas[node.nodeId] = contract.inputSchema;
      contractCompatMap.set(node.nodeId, contract.contractCompatibility ?? 'backward');
      this.applyAuthoritativeContract(node, contract);
      this.attachContractRefAndDigest(node, contract);

      // Phase 2-γ — freeze-time gates for llm_operation nodes
      if (node.kind === 'llm_operation') {
        // 4.2.1 Enforce operationVersion must exist
        const operationVersion = (node as any).operationVersion;
        if (!operationVersion) {
          throw new BadRequestException({
            code: ERROR_CODES.LLM_OPERATION_VERSION_NOT_FOUND,
            message: `LLM operation node '${node.nodeId}' has no authoritative operationVersion`,
            details: { nodeId: node.nodeId, operationId: (node as any).operationId },
          });
        }

        // 4.2.2 Enforce attestation check
        const operationId = (node as any).operationId;
        const version = operationVersion;
        try {
          const hasValidAttestation = await this.attestationClient.hasValidAttestationForVersion(
            operationId,
            version,
          );
          if (!hasValidAttestation) {
            throw new BadRequestException({
              code: ERROR_CODES.LLM_OPERATION_ATTESTATION_INVALID,
              message: `LLM operation '${operationId}' version '${version}' has no valid attestation — cannot freeze`,
              details: { nodeId: node.nodeId, operationId, version },
            });
          }
        } catch (error: any) {
          // Fail-closed: network errors reject the freeze
          throw new BadRequestException({
            code: ERROR_CODES.LLM_OPERATION_ATTESTATION_INVALID,
            message: `LLM operation '${operationId}' version '${version}' attestation check failed: ${error.message}`,
            details: { nodeId: node.nodeId, operationId, version, error: error.message },
          });
        }
      }
    }

    this.alignFinalOutputsToAuthoritativeContracts(planDraft);
    const validationResult = this.validator.validatePlan(planDraft);
    if (!validationResult.valid) {
      this.logger.error(`Plan validation failed for execution ${executionId}:`, validationResult.errors);
      throw new BadRequestException({
        code: validationResult.errors[0]?.code || ERROR_CODES.PLAN_SCHEMA_INVALID,
        message: `Deterministic plan validation failed: ${validationResult.errors[0]?.message}`,
        details: validationResult.errors,
      });
    }

    // 1.5 Edge contract composition validation (§10.4, §15.3 item 4) —
    //     authoritative JSON Schema from the catalog (not planner
    //     self-reported tags). Fail-closed here, before any DB write.
    const edgeValidation = this.validateEdgeContractCompatibility(
      planDraft,
      resolvedOutputSchemas,
      resolvedInputSchemas,
      contractCompatMap,
    );
    if (edgeValidation.errors.length > 0) {
      this.logger.error(`Edge contract compatibility failed for execution ${executionId}:`, edgeValidation.errors);
      throw new BadRequestException({
        code: ERROR_CODES.EDGE_TYPE_INCOMPATIBLE,
        message: `Deterministic plan edge type compatibility failed: ${edgeValidation.errors[0]?.message}`,
        details: edgeValidation.errors,
      });
    }

    // 2. Compute plan hash — canonicalizePlan folds contractRef/contractDigest
    //    into the hash, so a catalog contract change after freeze is detectable.
    const planHash = computePlanHash(planDraft);

    const planData = {
      executionId,
      schemaVersion: planDraft.schemaVersion,
      plannerVersion: planDraft.plannerVersion || 'v1',
      catalogVersion: planDraft.catalogVersion || 'v1',
      planType: planDraft.planType,
      status: 'frozen',
      objective: planDraft.objective,
      planJson: planDraft as any,
      validationJson: {
        ...(validationResult as any),
        // §10.4 — edges whose producer schema is open (additionalProperties:
        // true) could only be verified against declared required fields and
        // explicit properties, never as a full object-compatibility proof.
        composition: {
          requiredOnlyEdges: edgeValidation.requiredOnlyEdges,
        },
      } as any,
      planHash,
      frozenAt,
    };

    // Create execution_plan record
    const createdPlan = await client.executionPlan.create({
      data: planData,
    });

    // Create execution_steps records for each node in the frozen plan
    for (const node of planDraft.nodes) {
      const inputSchema = resolvedInputSchemas[node.nodeId];
      const frozenMeta = {
        contractRef: node.contractRef,
        contractDigest: node.contractDigest,
        inputSchemaRef: inputSchema
          ? `capability://${node.kind === 'skill' ? 'skill' : 'llm_operation'}/${
              node.kind === 'skill' ? (node as any).skillId : (node as any).operationId
            }/${node.kind === 'skill' ? (node as any).skillVersion || 'v1' : (node as any).operationVersion}/input`
          : null,
        legacy: false,
        contractCheckMode: 'schema' as const,
      };
      await client.executionStep.create({
        data: {
          executionId,
          stepIndex: node.sequence,
          name: node.title || node.nodeId,
          type: node.kind === 'skill' ? 'system' : 'system',
          status: 'pending',
          action: node.kind === 'skill' ? (node as any).runtimeType : (node as any).operationId,
          planNodeId: node.nodeId,
          nodeKind: node.kind,
          capabilityId: node.kind === 'skill' ? (node as any).skillId : (node as any).operationId,
          capabilityVersion: node.kind === 'skill'
          ? (node as any).skillVersion
          : ((node as any).operationVersion || (node as any).promptTemplateVersion || '1'),
          dependsOnJson: node.dependsOn as any,
          inputBindingsJson: ((node.inputBindings as any) || {}) as any,
          outputContractJson: {
            ...(node.outputContract || {}),
            ...(node.kind === 'llm_operation'
              ? {
                  promptTemplateId: (node as any).promptTemplateId,
                  promptTemplateVersion: (node as any).promptTemplateVersion,
                  operationVersion: (node as any).operationVersion || (node as any).promptTemplateVersion || '1',
                  operationDigest: (node as any).operationDigest,
                  contractDigest: node.contractDigest,
                  modelPolicyId: (node as any).modelPolicyId,
                  modelId: (node as any).modelId,
                  temperature: (node as any).temperature,
                  maxInputTokens: (node as any).maxInputTokens,
                  maxOutputTokens: (node as any).maxOutputTokens,
                }
              : {}),
            _frozenMetadata: frozenMeta,
          } as any,
          outputSchemaJson: resolvedOutputSchemas[node.nodeId] as any,
          inputSchemaJson: (inputSchema || null) as any,
          idempotencyKey: `${executionId}:${node.nodeId}:${node.kind}`,
        },
      });
    }

    this.logger.log(`Plan frozen & persisted for execution ${executionId} (planHash: ${planHash})`);

    return {
      planId: createdPlan.id,
      planHash,
    };
  }

  /**
   * Cross-checks every node_output edge against the AUTHORITATIVE catalog
   * schemas resolved at freeze time (§10.4, §15.3 item 4). Beyond primitive
   * type compatibility, deep composition checks cover enum subsets,
   * nullability, array item types, and object required-field coverage.
   * Missing/ambiguous schema data is skipped (fail-open) — only definite
   * conflicts reject.
   */
  private validateEdgeContractCompatibility(
    planDraft: DeterministicPlanDraftV1,
    resolvedOutputSchemas: Record<string, Record<string, unknown>>,
    resolvedInputSchemas: Record<string, Record<string, unknown> | null>,
    contractCompatMap: Map<string, 'backward' | 'none'>,
  ): { errors: PlanValidationErrorV1[]; requiredOnlyEdges: EdgeCompositionDetail[] } {
    const errors: PlanValidationErrorV1[] = [];
    const requiredOnlyEdges: EdgeCompositionDetail[] = [];
    const nodeMap = new Map(planDraft.nodes.map((n) => [n.nodeId, n]));

    for (const node of planDraft.nodes) {
      // A side that opts out of compatibility enforcement
      // (manifest.spec.migration.contractCompatibility: 'none') skips every
      // composition check — mirroring the schema-compatibility mode 'none'.
      if (contractCompatMap.get(node.nodeId) === 'none') continue;

      for (const [fieldName, binding] of Object.entries(node.inputBindings || {})) {
        if (!binding || binding.source !== 'node_output') continue;
        const targetNodeId = binding.nodeId || binding.fromNodeId || '';
        const fromNode = nodeMap.get(targetNodeId);
        if (!fromNode) continue; // structural validation already reports this
        if (contractCompatMap.get(targetNodeId) === 'none') continue;
        const outPath = binding.path || binding.outputPath || '';
        if (!outPath) continue;

        const upstreamSchema = resolvedOutputSchemas[targetNodeId] as any;
        const upstreamProperties = upstreamSchema?.properties;
        const propertySchema = upstreamProperties?.[outPath];

        // Fix ⑧ — a binding outputPath must be declared by the producer's
        // authoritative catalog schema. When the producer schema declares a
        // non-empty property set and the bound path is absent from it, the
        // plan binds a field the producer never emits — a definite conflict,
        // so reject. Only a producer schema with NO declared properties
        // (open/unknown shape) stays fail-open.
        if (!propertySchema) {
          if (
            upstreamProperties &&
            typeof upstreamProperties === 'object' &&
            Object.keys(upstreamProperties).length > 0
          ) {
            errors.push({
              code: ERROR_CODES.EDGE_TYPE_INCOMPATIBLE,
              message:
                `Node '${node.nodeId}' field '${fieldName}' binds outputPath '${outPath}' from node ` +
                `'${fromNode.nodeId}', but the catalog output schema of '${fromNode.nodeId}' declares no such ` +
                `property (declared: ${Object.keys(upstreamProperties).join(', ')})`,
              nodeId: node.nodeId,
              field: fieldName,
            });
          }
          continue;
        }

        // 1. Primitive type compatibility.
        const schemaType = this.jsonSchemaTypeToValueType(propertySchema.type);
        const fieldSchema = (resolvedInputSchemas[node.nodeId] as any)?.properties?.[fieldName];
        let expectedType: ValueTypeV1 | null = binding.expectedType || null;
        if (!expectedType) {
          // Infer from the downstream node's authoritative input schema.
          expectedType = fieldSchema ? this.jsonSchemaTypeToValueType(fieldSchema.type) : null;
        }
        if (schemaType && expectedType && !this.validator.isTypeCompatible(schemaType, expectedType)) {
          errors.push({
            code: ERROR_CODES.EDGE_TYPE_INCOMPATIBLE,
            message:
              `Node '${node.nodeId}' field '${fieldName}' expects type '${expectedType}', but catalog schema for node ` +
              `'${fromNode.nodeId}' output '${outPath}' declares JSON Schema type '${propertySchema.type}' (mapped to '${schemaType}')`,
            nodeId: node.nodeId,
            field: fieldName,
          });
        }

        // 2–6. Deep composition checks against the downstream field's
        // authoritative input schema.
        if (fieldSchema) {
          this.validateEnumSetCompatibility(node, fieldName, fromNode.nodeId, outPath, propertySchema, fieldSchema, errors);
          this.validateNullableCompatibility(node, fieldName, fromNode.nodeId, outPath, propertySchema, fieldSchema, errors);
          this.validateArrayItemsCompatibility(node, fieldName, fromNode.nodeId, outPath, propertySchema, fieldSchema, errors);
          this.validateRequiredFieldsCompatibility(node, fieldName, fromNode.nodeId, outPath, propertySchema, fieldSchema, errors);
          this.validateArtifactCompatibility(node, fieldName, fromNode.nodeId, outPath, propertySchema, fieldSchema, binding, errors);
        }

        // §10.4 — an open producer schema (additionalProperties: true) means
        // composition can only verify declared required fields and explicit
        // properties: the result is `required_only`, never a full
        // object-compatibility proof.
        if (upstreamSchema?.additionalProperties === true) {
          requiredOnlyEdges.push({
            nodeId: node.nodeId,
            field: fieldName,
            producerNodeId: targetNodeId,
            outputPath: outPath,
            severity: 'required_only',
          });
        }
      }
    }

    return { errors, requiredOnlyEdges };
  }

  /**
   * §10.4 — enum set compatibility: every value the producer can emit must be
   * accepted by the consumer (upstream.enum ⊆ downstream.enum). Only enforced
   * when BOTH sides declare a non-empty enum; an unconstrained side cannot
   * conflict, so the check is skipped (fail-open).
   */
  private validateEnumSetCompatibility(
    consumerNode: DeterministicPlanDraftV1['nodes'][number],
    fieldName: string,
    producerNodeId: string,
    outputPath: string,
    propertySchema: Record<string, unknown>,
    fieldSchema: Record<string, unknown>,
    errors: PlanValidationErrorV1[],
  ): void {
    const upstreamEnum = Array.isArray(propertySchema.enum) ? propertySchema.enum : undefined;
    const downstreamEnum = Array.isArray(fieldSchema.enum) ? fieldSchema.enum : undefined;
    if (!upstreamEnum || upstreamEnum.length === 0 || !downstreamEnum || downstreamEnum.length === 0) {
      return;
    }
    if (!this.areEnumSetsCompatible(upstreamEnum, downstreamEnum)) {
      errors.push({
        code: ERROR_CODES.EDGE_TYPE_INCOMPATIBLE,
        message:
          `Node '${consumerNode.nodeId}' field '${fieldName}' accepts enum values ${JSON.stringify(downstreamEnum)}, ` +
          `but catalog schema for node '${producerNodeId}' output '${outputPath}' can produce ` +
          `${JSON.stringify(upstreamEnum)} which is not a subset of the accepted values`,
        nodeId: consumerNode.nodeId,
        field: fieldName,
      });
    }
  }

  /**
   * §10.4 — nullable compatibility: a producer that can emit null requires a
   * consumer field that also accepts null. A producer that never emits null is
   * always compatible. Skipped when the consumer's type is unknown (fail-open).
   */
  private validateNullableCompatibility(
    consumerNode: DeterministicPlanDraftV1['nodes'][number],
    fieldName: string,
    producerNodeId: string,
    outputPath: string,
    propertySchema: Record<string, unknown>,
    fieldSchema: Record<string, unknown>,
    errors: PlanValidationErrorV1[],
  ): void {
    const verdict = this.isNullableCompatible(propertySchema.type, fieldSchema.type);
    if (verdict !== 'incompatible') return;
    errors.push({
      code: ERROR_CODES.EDGE_TYPE_INCOMPATIBLE,
      message:
        `Node '${consumerNode.nodeId}' field '${fieldName}' does not accept null, but catalog schema for node ` +
        `'${producerNodeId}' output '${outputPath}' can produce null (type ${JSON.stringify(propertySchema.type)})`,
      nodeId: consumerNode.nodeId,
      field: fieldName,
    });
  }

  /**
   * §10.4 — array item compatibility: when both sides declare `items`, the
   * item primitive types must be compatible. Skipped when either side omits
   * `items` or an item type is unmappable (fail-open).
   */
  private validateArrayItemsCompatibility(
    consumerNode: DeterministicPlanDraftV1['nodes'][number],
    fieldName: string,
    producerNodeId: string,
    outputPath: string,
    propertySchema: Record<string, unknown>,
    fieldSchema: Record<string, unknown>,
    errors: PlanValidationErrorV1[],
  ): void {
    const upstreamItems = propertySchema.items as Record<string, unknown> | undefined;
    const downstreamItems = fieldSchema.items as Record<string, unknown> | undefined;
    if (!upstreamItems || !downstreamItems) return;
    if (!this.areArrayItemTypesCompatible(upstreamItems, downstreamItems)) {
      errors.push({
        code: ERROR_CODES.EDGE_TYPE_INCOMPATIBLE,
        message:
          `Node '${consumerNode.nodeId}' field '${fieldName}' expects array items of type '${downstreamItems.type}', ` +
          `but catalog schema for node '${producerNodeId}' output '${outputPath}' declares array items of type '${upstreamItems.type}'`,
        nodeId: consumerNode.nodeId,
        field: fieldName,
      });
    }
  }

  /**
   * §10.4 — object required-field coverage: every field the consumer demands
   * as required must be produced as required upstream
   * (upstream.required ⊇ downstream.required). Skipped when the producer
   * declares no required list or the consumer demands none (fail-open).
   */
  private validateRequiredFieldsCompatibility(
    consumerNode: DeterministicPlanDraftV1['nodes'][number],
    fieldName: string,
    producerNodeId: string,
    outputPath: string,
    propertySchema: Record<string, unknown>,
    fieldSchema: Record<string, unknown>,
    errors: PlanValidationErrorV1[],
  ): void {
    const upstreamRequired = Array.isArray(propertySchema.required) ? propertySchema.required : undefined;
    const downstreamRequired = Array.isArray(fieldSchema.required) ? fieldSchema.required : undefined;
    if (!upstreamRequired || !downstreamRequired || downstreamRequired.length === 0) {
      return;
    }
    if (!this.areRequiredCompatible(upstreamRequired, downstreamRequired)) {
      const missing = downstreamRequired.filter((f: unknown) => !upstreamRequired.includes(f));
      errors.push({
        code: ERROR_CODES.EDGE_TYPE_INCOMPATIBLE,
        message:
          `Node '${consumerNode.nodeId}' field '${fieldName}' requires properties ${JSON.stringify(missing)}, ` +
          `but catalog schema for node '${producerNodeId}' output '${outputPath}' does not declare them as required`,
        nodeId: consumerNode.nodeId,
        field: fieldName,
      });
    }
  }

  /**
   * §10.4 — artifact type/mimeType compatibility. When an edge expects
   * `artifact_ref`, the producer's output schema must declare the artifact
   * download-reference fields the runtime enforces (url, mimeType — mirroring
   * legacy-output-adapter.service.ts), and any mimeType const/enum both sides
   * declare must be compatible (upstream ⊆ downstream). Skipped when the
   * producer declares no explicit properties — `{ type: 'object' }` can
   * neither prove nor disprove artifact shape (fail-open). A non-object
   * upstream type conflicting with `artifact_ref` is already rejected by the
   * primitive type check.
   */
  private validateArtifactCompatibility(
    consumerNode: DeterministicPlanDraftV1['nodes'][number],
    fieldName: string,
    producerNodeId: string,
    outputPath: string,
    propertySchema: Record<string, unknown>,
    fieldSchema: Record<string, unknown>,
    binding: ValueBindingV1,
    errors: PlanValidationErrorV1[],
  ): void {
    if (binding.source !== 'node_output' || binding.expectedType !== 'artifact_ref') return;

    const properties = propertySchema.properties as Record<string, unknown> | undefined;
    if (!properties || Object.keys(properties).length === 0) return; // fail-open

    const missing = ['url', 'mimeType'].filter((field) => !(field in properties));
    if (missing.length > 0) {
      errors.push({
        code: ERROR_CODES.EDGE_TYPE_INCOMPATIBLE,
        message:
          `Node '${consumerNode.nodeId}' field '${fieldName}' expects artifact_ref, but catalog schema for node ` +
          `'${producerNodeId}' output '${outputPath}' declares properties without artifact download-reference ` +
          `fields: ${missing.join(', ')}`,
        nodeId: consumerNode.nodeId,
        field: fieldName,
      });
      return;
    }

    const upstreamMimeTypes = this.declaredMimeTypes(propertySchema);
    const downstreamMimeTypes = this.declaredMimeTypes(fieldSchema);
    if (upstreamMimeTypes && downstreamMimeTypes && !this.areEnumSetsCompatible(upstreamMimeTypes, downstreamMimeTypes)) {
      errors.push({
        code: ERROR_CODES.EDGE_TYPE_INCOMPATIBLE,
        message:
          `Node '${consumerNode.nodeId}' field '${fieldName}' accepts mimeType values ${JSON.stringify(downstreamMimeTypes)}, ` +
          `but catalog schema for node '${producerNodeId}' output '${outputPath}' declares mimeType ` +
          `${JSON.stringify(upstreamMimeTypes)} which is not a subset of the accepted values`,
        nodeId: consumerNode.nodeId,
        field: fieldName,
      });
    }
  }

  /**
   * Declared mimeType allowed values (const or enum) from a schema's `mimeType`
   * property, or undefined when the schema declares none.
   */
  private declaredMimeTypes(schema: Record<string, unknown>): string[] | undefined {
    const properties = schema.properties as Record<string, unknown> | undefined;
    const mimeSchema = properties?.mimeType as Record<string, unknown> | undefined;
    if (!mimeSchema) return undefined;
    if (typeof mimeSchema.const === 'string') return [mimeSchema.const];
    if (Array.isArray(mimeSchema.enum) && mimeSchema.enum.length > 0) {
      return mimeSchema.enum.map(String);
    }
    return undefined;
  }

  /**
   * Deep-compatible: every upstream enum value must be accepted downstream
   * (compared structurally so object values work too).
   */
  private areEnumSetsCompatible(upstreamEnum: unknown[], downstreamEnum: unknown[]): boolean {
    return upstreamEnum.every((v) => downstreamEnum.some((d) => JSON.stringify(d) === JSON.stringify(v)));
  }

  /**
   * Nullable verdict: 'compatible' when the producer never emits null or the
   * consumer accepts null; 'incompatible' when the producer can emit null and
   * the consumer's non-null type is definite; 'skip' when the consumer type is
   * missing entirely (fail-open).
   */
  private isNullableCompatible(upstreamType: unknown, downstreamType: unknown): 'compatible' | 'incompatible' | 'skip' {
    const upstreamTypes = Array.isArray(upstreamType) ? upstreamType : [upstreamType];
    const downstreamTypes = Array.isArray(downstreamType) ? downstreamType : [downstreamType];
    if (!upstreamTypes.includes('null')) return 'compatible'; // producer never emits null
    if (downstreamTypes.includes('null')) return 'compatible';
    if (downstreamTypes.includes(undefined)) return 'skip'; // consumer type unknown
    return 'incompatible';
  }

  /** Array item types are primitive-compatible via the existing type lattice. */
  private areArrayItemTypesCompatible(
    upstreamItems: Record<string, unknown>,
    downstreamItems: Record<string, unknown>,
  ): boolean {
    const upstreamType = this.jsonSchemaTypeToValueType(upstreamItems.type);
    const downstreamType = this.jsonSchemaTypeToValueType(downstreamItems.type);
    if (!upstreamType || !downstreamType) return true; // ambiguous — fail-open
    return this.validator.isTypeCompatible(upstreamType, downstreamType);
  }

  /** Upstream required must cover every downstream-required field. */
  private areRequiredCompatible(upstreamRequired: unknown[], downstreamRequired: unknown[]): boolean {
    return downstreamRequired.every((field) => upstreamRequired.includes(field));
  }

  /** Maps a JSON Schema type keyword to a comparable ValueTypeV1 tag. */
  private jsonSchemaTypeToValueType(type: unknown): ValueTypeV1 | null {
    const t = Array.isArray(type) ? type.find((x) => x !== 'null') : type;
    switch (t) {
      case 'string':
        return 'string';
      case 'number':
      case 'integer':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'array':
      case 'object':
        // Structural containers map to the `json` escape hatch — a definite
        // conflict can only be asserted for primitives.
        return 'json';
      default:
        return null;
    }
  }

  /**
   * Attaches the authoritative contract reference and content digest to a plan
   * node (§9.3). The digest uses the SHARED contract-envelope semantics (fix
   * ④) — apiVersion / kind / metadata + input AND output contracts — so the
   * value is comparable with digests computed by the scheduler at step start
   * and by the publish pipeline, and input-contract drift is detectable.
   */
  private attachContractRefAndDigest(
    node: DeterministicPlanDraftV1['nodes'][number],
    contract: ResolvedCapabilityContract
  ): void {
    const ref =
      node.kind === 'skill'
        ? `capability://skill/${(node as any).skillId}/${(node as any).skillVersion || 'v1'}/output`
        : `capability://llm_operation/${(node as any).operationId}/${(node as any).operationVersion || (node as any).promptTemplateVersion || '1'}/output`;
    node.contractRef = ref;
    node.contractDigest = this.catalog.computeContractDigest(node, contract);
  }

  /**
   * Replaces every planner-authored contract field with catalog authority.
   * In particular, an LLM cannot pin a stale version/digest or invent an
   * output field that changes the scheduler's runtime validation.
   */
  private applyAuthoritativeContract(
    node: DeterministicPlanDraftV1['nodes'][number],
    contract: ResolvedCapabilityContract,
  ): void {
    node.outputContract = this.schemaToOutputContract(contract.outputSchema);

    if (node.kind !== 'llm_operation') return;
    const ref = contract.capabilityRef;
    if (!ref || ref.id !== node.operationId) {
      throw new BadRequestException({
        code: ERROR_CODES.CAPABILITY_CONTRACT_NOT_FOUND,
        message: `Catalog did not return an authoritative reference for LLM operation '${node.operationId}'`,
        details: { nodeId: node.nodeId, operationId: node.operationId },
      });
    }

    node.operationVersion = ref.version;
    node.operationDigest = ref.digest;
    // Kept only for V1 readers. It mirrors the operation version and is not
    // independently caller-controllable.
    node.promptTemplateVersion = ref.version;
  }

  private schemaToOutputContract(
    schema: Record<string, unknown> | null,
  ): Record<string, ValueTypeV1> {
    return projectOutputSchemaV1(schema).outputContract;
  }

  private alignFinalOutputsToAuthoritativeContracts(plan: DeterministicPlanDraftV1): void {
    const nodeById = new Map(plan.nodes.map((node) => [node.nodeId, node]));
    for (const finalOutput of plan.finalOutputs) {
      const producer = nodeById.get(finalOutput.fromNodeId);
      const authoritativeType = producer?.outputContract?.[finalOutput.fromNodeOutput];
      if (authoritativeType) {
        finalOutput.expectedType = authoritativeType;
      }
    }
  }
}
