import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';
import { ERROR_CODES } from '@ops/backend-error-codes';
import { computeContractDigest as computeSharedContractDigest } from '@ops/backend-runtime-capability-contract';
import { getAiOrchestratorUrl } from '../../../config/service-endpoints';

export interface ResolvedCapabilityContract {
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  /**
   * Migration compatibility stance declared by the builtin skill manifest
   * (`spec.migration.contractCompatibility`, design doc §15.4 item 5).
   * Defaults to 'backward'; 'none' opts out of schema compatibility
   * enforcement for that capability.
   */
  contractCompatibility?: 'backward' | 'none';
  /**
   * Which catalog source produced the contract — carried into the contract
   * digest envelope (fix ④) so the digest reflects the resolved origin.
   */
  sourceType?: 'builtin_skill' | 'custom_skill' | 'llm_operation';
}

/**
 * Authoritative capability contract catalog (design doc §6.3 / §9.3 / §17.1).
 *
 * The ONLY trusted source for input/output schemas at plan freeze time and for
 * runtime contract re-checks. Planner self-reported schemas never enter here.
 *
 * Sources:
 * - skill (builtin): builtin skill manifest `spec.contracts.{input,output}.schema`,
 *   resolved by the EXACT immutable version pinned on the node
 *   (`node.skillVersion` = `builtin_skill_versions.definition_version`) —
 *   never the active version when the node pins one (§9.3 strict resolution)
 * - skill (custom):  `skill_configs.output_schema` as output contract;
 *   input contract derived from `skill_configs.params_schema`
 * - llm_operation:   operation Registry machine-readable definition (§6.4),
 *   version-verified against `node.promptTemplateVersion`
 */
@Injectable()
export class CapabilityContractCatalogService {
  private readonly logger = new Logger(CapabilityContractCatalogService.name);

  /**
   * Freeze-time resolution. Fail-closed (§17.1): when no trusted output schema
   * resolves, throws CAPABILITY_CONTRACT_NOT_FOUND and the node never enters
   * the plan.
   */
  public async resolveContract(client: any, node: any): Promise<ResolvedCapabilityContract> {
    let contract: ResolvedCapabilityContract;
    try {
      contract = await this.lookupContract(client, node);
    } catch (err: any) {
      this.logger.error(`Failed to resolve authoritative contract for ${node.kind} node '${node.nodeId}': ${err.message}`);
      throw new BadRequestException({
        code: ERROR_CODES.CAPABILITY_CONTRACT_NOT_FOUND,
        message: `No authoritative output schema resolvable for node '${node.nodeId}' (${node.kind})`,
        details: { nodeId: node.nodeId, kind: node.kind, reason: err.message },
      });
    }
    if (!contract.outputSchema) {
      this.logger.error(`No authoritative output schema found for ${node.kind} node '${node.nodeId}'`);
      throw new BadRequestException({
        code: ERROR_CODES.CAPABILITY_CONTRACT_NOT_FOUND,
        message: `No authoritative output schema resolvable for node '${node.nodeId}' (${node.kind})`,
        details: { nodeId: node.nodeId, kind: node.kind },
      });
    }
    return contract;
  }

  /**
   * Runtime re-check resolution (design doc §15.3-5). Never throws: transient
   * lookup failure or a missing output schema yield null, and the caller
   * decides whether to treat the step as legacy.
   */
  public async tryResolveContract(client: any, node: any): Promise<ResolvedCapabilityContract | null> {
    let contract: ResolvedCapabilityContract;
    try {
      contract = await this.lookupContract(client, node);
    } catch (err: any) {
      this.logger.warn(`Transient contract lookup failure for ${node.kind} node '${node.nodeId}': ${err.message}`);
      return null;
    }
    if (!contract.outputSchema) {
      return null;
    }
    return contract;
  }

  private async lookupContract(client: any, node: any): Promise<ResolvedCapabilityContract> {
    if (node.kind === 'skill') {
      const capabilityKey = node.skillId || node.capabilityKey;
      if (capabilityKey) {
        // 1. BuiltinSkill manifest contract (input + output).
        //    Strict version resolution (§9.3): when the node pins a
        //    definitionVersion (node.skillVersion), the frozen plan binds the
        //    contract of THAT immutable version — never a silent fallback to
        //    the active version. A pinned version that no longer exists is a
        //    broken plan and rejects (fail-closed). An unpinned node is
        //    semantically "latest" and resolves the active version.
        const builtinSkill = await client.builtinSkill
          .findUnique({ where: { capabilityKey } })
          .catch(() => null);
        if (builtinSkill) {
          const pinnedVersion = (node as any).skillVersion as string | undefined;
          let version: any = null;
          if (pinnedVersion) {
            version = await client.builtinSkillVersion
              .findUnique({
                where: {
                  builtinSkillId_definitionVersion: {
                    builtinSkillId: builtinSkill.id,
                    definitionVersion: String(pinnedVersion),
                  },
                },
              })
              .catch(() => null);
            if (!version) {
              throw new Error(
                `Builtin skill '${capabilityKey}' version '${pinnedVersion}' does not exist — ` +
                  `frozen plan cannot bind a contract to a missing version (active version ${builtinSkill.activeVersionId ?? 'none'} is NOT substituted)`
              );
            }
          } else if (builtinSkill.activeVersionId) {
            version = await client.builtinSkillVersion
              .findUnique({ where: { id: builtinSkill.activeVersionId } })
              .catch(() => null);
          }
          if (version) {
            const contracts = (version.manifestJson as any)?.spec?.contracts as any;
            const output = contracts?.output?.schema;
            const input = contracts?.input?.schema;
            const migrationMode = (version.manifestJson as any)?.spec?.migration?.contractCompatibility;
            return {
              inputSchema: input && typeof input === 'object' && Object.keys(input).length > 0 ? input : null,
              outputSchema: output && typeof output === 'object' && Object.keys(output).length > 0 ? output : null,
              contractCompatibility:
                migrationMode === 'backward' || migrationMode === 'none' ? migrationMode : 'backward',
              sourceType: 'builtin_skill',
            };
          }
        }

        // 2. Custom skills — version-precise resolution (§9.3). The planner
        //    writes node.skillVersion = card.executableVersion =
        //    publishedReleaseVersion (the integer release_version of the
        //    published CapabilityRelease). A pinned node MUST bind the contract
        //    of THAT exact release's source snapshot — never the live
        //    skill_configs (which tracks the current config, not an immutable
        //    release). A pinned version with no release row, or a release whose
        //    snapshot carries no output contract, fails closed with distinct
        //    diagnostics — exactly the semantics of the builtin branch.
        const pinnedCustomVersion = (node as any).skillVersion as string | undefined;
        if (pinnedCustomVersion) {
          const releasedPayload = await this.resolvePublishedReleaseSnapshot(
            client,
            capabilityKey,
            pinnedCustomVersion
          );
          if (releasedPayload === null) {
            throw new Error(
              `Custom skill '${capabilityKey}' version '${pinnedCustomVersion}' does not exist in capability_releases — ` +
                `frozen plan cannot bind a contract to a missing version (live config is NOT substituted)`
            );
          }
          const releasedParams = releasedPayload.paramsSchema;
          let releasedOutput = releasedPayload.outputSchema;
          if (
            !releasedOutput ||
            typeof releasedOutput !== 'object' ||
            Array.isArray(releasedOutput) ||
            Object.keys(releasedOutput).length === 0
          ) {
            // Legacy releases predate the declarative outputSchema contract
            // (design doc §3.2): their snapshot carries WorkflowDsl.outputParams
            // (or a recorder-style top-level outputParams) as the authoritative
            // output declaration — field name + description, no types. Derive
            // the lenient output contract from it instead of failing closed, so
            // previously published temporal/recorder skills keep resolving.
            releasedOutput = this.deriveLegacyOutputSchema(releasedPayload);
            if (releasedOutput === null) {
              throw new Error(
                `Published release of custom skill '${capabilityKey}' version '${pinnedCustomVersion}' carries no output schema — ` +
                  `schema-less capability cannot bind a contract (P0 §15.1)`
              );
            }
          }
          return {
            inputSchema: this.paramsSchemaToJsonSchema(releasedParams ?? null),
            outputSchema: releasedOutput as Record<string, unknown>,
            sourceType: 'custom_skill',
          };
        }

        // Unpinned node is semantically "latest": resolve the live config.
        const skillConfig =
          (await client.skillConfig.findFirst({ where: { name: capabilityKey } }).catch(() => null)) ||
          (await client.skillConfig.findFirst({ where: { id: capabilityKey } }).catch(() => null));
        if (skillConfig?.outputSchema && typeof skillConfig.outputSchema === 'object' && Object.keys(skillConfig.outputSchema).length > 0) {
          const inputSchema = this.paramsSchemaToJsonSchema(skillConfig.paramsSchema);
          return {
            inputSchema,
            outputSchema: skillConfig.outputSchema as Record<string, unknown>,
            sourceType: 'custom_skill',
          };
        }
      }
    } else if (node.kind === 'llm_operation') {
      // 3. LLM Operation Registry authoritative definition (§6.4).
      //    Version-precise: the registry exposes a single current `version`;
      //    when the node pins a promptTemplateVersion (or promptTemplateId)
      //    that differs, the frozen plan would bind a stale contract → reject
      //    (fail-closed) instead of silently re-binding to the newer template.
      const operationId = (node as any).operationId;
      const definition = await axios
        .get(`${getAiOrchestratorUrl()}/ai/operations/${encodeURIComponent(operationId)}`, {
          timeout: 8000,
          headers: { 'X-Internal-Service': 'control-plane' },
        })
        .then((res) => res.data as {
          inputSchema?: Record<string, unknown> | null;
          outputSchema?: Record<string, unknown> | null;
          version?: string;
          promptTemplateId?: string;
        });
      const pinnedVersion = (node as any).promptTemplateVersion as string | undefined;
      if (pinnedVersion && String(pinnedVersion) !== String(definition?.version)) {
        throw new Error(
          `LLM operation '${operationId}' version mismatch: node pins promptTemplateVersion '${pinnedVersion}', ` +
            `registry serves '${definition?.version ?? 'unknown'}' — frozen plan cannot bind a stale contract`
        );
      }
      const pinnedTemplateId = (node as any).promptTemplateId as string | undefined;
      if (pinnedTemplateId && String(pinnedTemplateId) !== String(definition?.promptTemplateId)) {
        throw new Error(
          `LLM operation '${operationId}' promptTemplateId mismatch: node pins '${pinnedTemplateId}', ` +
            `registry serves '${definition?.promptTemplateId ?? 'unknown'}'`
        );
      }
      const input = definition?.inputSchema;
      const output = definition?.outputSchema;
      return {
        inputSchema: input && typeof input === 'object' && Object.keys(input).length > 0 ? input : null,
        outputSchema: output && typeof output === 'object' && Object.keys(output).length > 0 ? output : null,
        sourceType: 'llm_operation',
      };
    }

    throw new Error(`No catalog contract resolvable for node '${node.nodeId}' (${node.kind})`);
  }

  /**
   * Resolve the source snapshot payload of the published release pinned by the
   * node (`published_skill_id` + `release_version`, §9.3 strict resolution for
   * custom skills).
   *
   * Returns:
   * - `null`          — the pinned release does not exist (broken plan)
   * - `Record`        — the release exists; the payload may still lack an
   *                     output contract (schema-less release, P0 §15.1)
   *
   * The live `skill_configs` row is touched only to translate a NAME into its
   * UUID when the node carries a name instead of the published id — the
   * contract itself always comes from the release snapshot.
   */
  private async resolvePublishedReleaseSnapshot(
    client: any,
    capabilityKey: string,
    pinnedVersion: string,
  ): Promise<Record<string, unknown> | null> {
    const releaseVersion = Number(pinnedVersion);
    if (!Number.isFinite(releaseVersion)) {
      return null;
    }

    let skillUuid: string | null = capabilityKey;
    if (!this.isValidUuid(capabilityKey)) {
      const cfg = await client.skillConfig.findFirst({ where: { name: capabilityKey } }).catch(() => null);
      skillUuid = cfg?.id ?? null;
    }
    if (!skillUuid) {
      return null;
    }

    const release = await client.capabilityRelease
      .findFirst({
        where: { publishedSkillId: skillUuid, releaseVersion, archivedAt: null },
      })
      .catch(() => null);
    if (!release) {
      return null;
    }

    const snapshotId = release.currentSourceSnapshotId as string | null;
    if (!snapshotId) {
      return {};
    }

    const snapshot = await client.capabilitySourceSnapshot
      .findUnique({ where: { id: snapshotId } })
      .catch(() => null);
    const payload = snapshot?.sourcePayloadJson;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }
    return payload as Record<string, unknown>;
  }

  /**
   * Legacy output-contract derivation for releases that predate the
   * declarative `outputSchema` contract (design doc §3.2/§3.4): a
   * temporal-workflow DSL declares its outputs as
   * `workflowDsl.outputParams: Record<field, {description, sourceStep}>` —
   * no types, no required markers, no dataPath. Recorder exports may carry an
   * equivalent top-level `outputParams` (or under
   * `apiEndpoints.runtimeMetadata.outputParams`).
   *
   * Derives the weakest contract that still binds the declared output fields:
   * an open object (`additionalProperties: true`, so the workflow's extra
   * envelope keys such as businessData `query`/`topic` never false-trip) whose
   * properties carry the field descriptions and whose `required` lists every
   * declared output field — the DSL promises those fields; a workflow that
   * omits one violates its own contract, and the runtime failure names the
   * missing field precisely. Type constraints are intentionally NOT invented:
   * the DSL carries no type information worth trusting (design doc §3.2).
   *
   * Returns null when the payload declares no outputParams anywhere — a
   * genuinely schema-less release stays fail-closed (P0 §15.1).
   */
  private deriveLegacyOutputSchema(payload: Record<string, unknown>): Record<string, unknown> | null {
    const workflowDsl =
      payload.workflowDsl && typeof payload.workflowDsl === 'object'
        ? (payload.workflowDsl as Record<string, unknown>)
        : null;
    const runtimeMetadata =
      payload.apiEndpoints && typeof payload.apiEndpoints === 'object'
        ? (payload.apiEndpoints as Record<string, unknown>).runtimeMetadata
        : undefined;
    const outputParams =
      (workflowDsl?.outputParams as Record<string, unknown> | undefined) ??
      (payload.outputParams as Record<string, unknown> | undefined) ??
      (runtimeMetadata && typeof runtimeMetadata === 'object'
        ? (runtimeMetadata as Record<string, unknown>).outputParams
        : undefined);
    if (!outputParams || typeof outputParams !== 'object' || Array.isArray(outputParams)) {
      return null;
    }
    const fields = Object.entries(outputParams).filter(
      ([key, meta]) => !!key && meta !== null && typeof meta === 'object'
    );
    if (fields.length === 0) {
      return null;
    }
    const properties: Record<string, unknown> = {};
    for (const [key, meta] of fields) {
      const description = (meta as Record<string, unknown>).description;
      properties[key] =
        typeof description === 'string' && description.length > 0 ? { description } : {};
    }
    return {
      type: 'object',
      properties,
      required: fields.map(([key]) => key),
      additionalProperties: true,
    };
  }

  private static readonly UUID_REGEX =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

  private isValidUuid(value: string): boolean {
    return CapabilityContractCatalogService.UUID_REGEX.test(value);
  }

  /**
   * Convert a custom-skill ParamsSchema (`{ properties: { name: { type,
   * description, required?, default? } }, required: [...] }`) into a JSON
   * Schema input contract.
   *
   * Constraint preservation (fix ②): every recognized JSON Schema keyword
   * declared on a field passes through — `enum`, `default`/`defaultValue`,
   * `items` (array), `properties` (object), `format`, numeric/string bounds —
   * so the frozen input contract and the unified runtime validator see the
   * SAME constraints the Planner sees. `date` maps to `string` (no native
   * JSON Schema date type). `additionalProperties` is passed through when
   * declared and omitted otherwise (JSON Schema default `true`); it is never
   * forced into the contract, so closed-object params (`additionalProperties:
   * false`) stay closed.
   *
   * Empty / malformed schemas yield null (fail-open: no input validation for
   * schemaless params).
   */
  private static readonly PARAMS_JSON_SCHEMA_KEYWORDS = [
    'enum',
    'description',
    'format',
    'minLength',
    'maxLength',
    'pattern',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'minItems',
    'maxItems',
    'uniqueItems',
    'items',
    'properties',
    'additionalProperties',
  ] as const;

  private paramsSchemaToJsonSchema(paramsSchema: unknown): Record<string, unknown> | null {
    if (typeof paramsSchema !== 'object' || paramsSchema === null || Array.isArray(paramsSchema)) return null;
    const raw = paramsSchema as Record<string, unknown>;
    const props = raw.properties;
    if (typeof props !== 'object' || props === null || Array.isArray(props)) return null;

    const properties: Record<string, unknown> = {};
    const derivedRequired: string[] = [];
    for (const [name, def] of Object.entries(props as Record<string, unknown>)) {
      if (typeof def !== 'object' || def === null || Array.isArray(def)) continue;
      const d = def as Record<string, unknown>;
      const rawType = d.type;
      const jsonType =
        typeof rawType === 'string'
          ? rawType === 'date'
            ? 'string'
            : rawType === 'string' ||
                rawType === 'number' ||
                rawType === 'boolean' ||
                rawType === 'integer' ||
                rawType === 'array' ||
                rawType === 'object' ||
                rawType === 'null'
              ? rawType
              : undefined
          : undefined;
      const hasEnum = Array.isArray(d.enum) && d.enum.length > 0;
      if (!jsonType && !hasEnum) continue;

      const prop: Record<string, unknown> = {};
      if (jsonType) prop.type = jsonType;
      for (const keyword of CapabilityContractCatalogService.PARAMS_JSON_SCHEMA_KEYWORDS) {
        if (keyword === 'description') {
          if (typeof d.description === 'string' && d.description.trim()) {
            prop.description = d.description.trim();
          }
          continue;
        }
        if (keyword === 'additionalProperties' && typeof d.additionalProperties !== 'object') {
          if (typeof d.additionalProperties === 'boolean') {
            prop.additionalProperties = d.additionalProperties;
          }
          continue;
        }
        if (keyword === 'enum' || keyword === 'format' || keyword === 'items' || keyword === 'properties') {
          if (d[keyword] !== undefined) prop[keyword] = d[keyword];
          continue;
        }
        if (d[keyword] !== undefined) prop[keyword] = d[keyword];
      }
      // default 双别名：paramsSchema 用 `default`，workflowInputPolicy 用 `defaultValue`
      if (d.defaultValue !== undefined) {
        prop.default = d.defaultValue;
      } else if (d.default !== undefined) {
        prop.default = d.default;
      }
      // 字段级 required（过渡兼容字段）并入对象级 required 列表
      if (d.required === true || d.required === 'true') {
        derivedRequired.push(name);
      }
      properties[name] = prop;
    }
    if (Object.keys(properties).length === 0) return null;

    const schema: Record<string, unknown> = {
      type: 'object',
      properties,
    };
    if (typeof raw.additionalProperties === 'boolean') {
      schema.additionalProperties = raw.additionalProperties;
    } else if (raw.additionalProperties !== undefined) {
      schema.additionalProperties = raw.additionalProperties;
    }
    const topLevelRequired = Array.isArray(raw.required)
      ? raw.required.filter((r): r is string => typeof r === 'string' && r in properties)
      : [];
    const required = Array.from(new Set([...topLevelRequired, ...derivedRequired]));
    if (required.length > 0) schema.required = required;
    return schema;
  }

  /**
   * Content digest over the canonical (key-sorted) schema JSON — stable
   * regardless of property insertion order.
   */
  public schemaDigest(schema: Record<string, unknown>): string {
    return crypto.createHash('sha256').update(JSON.stringify(this.canonicalizeJson(schema))).digest('hex');
  }

  /**
   * Contract digest with the SHARED envelope semantics (fix ④). Delegates to
   * `computeContractDigest` from @ops/backend-runtime-capability-contract, so
   * freeze-time, schedule-time and publish-time digests share one canonical
   * shape: apiVersion / kind / metadata(id, version, sourceType) + BOTH the
   * input and output contracts. The old output-schema-only digest could not
   * detect input-contract drift — a changed input schema produced the same
   * frozen digest.
   */
  public computeContractDigest(
    node: any,
    contract: Pick<ResolvedCapabilityContract, 'inputSchema' | 'outputSchema' | 'sourceType'>
  ): string {
    const isSkill = node.kind === 'skill';
    return computeSharedContractDigest({
      apiVersion: 'ops-automation/v2',
      kind: 'Capability',
      metadata: {
        id: String(isSkill ? node.skillId || node.capabilityKey || '' : node.operationId || ''),
        version: isSkill
          ? String(node.skillVersion || 'v1')
          : String(node.promptTemplateVersion || '1'),
        sourceType: (contract.sourceType ?? 'llm_operation') as any,
      },
      contracts: {
        input: { schema: contract.inputSchema ?? {} },
        output: { schema: contract.outputSchema ?? {} },
      },
      runtime: { type: isSkill ? 'builtin_handler' : 'llm_operation' },
    });
  }

  private canonicalizeJson(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalizeJson(item));
    }
    if (value !== null && typeof value === 'object') {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[key] = this.canonicalizeJson((value as Record<string, unknown>)[key]);
      }
      return sorted;
    }
    return value;
  }
}
