import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ValueBindingV1 } from '@ops/backend-deterministic-plan';
import { ERROR_CODES } from '@ops/backend-error-codes';

interface SkillParamSchemaField {
  enum?: Array<string | number>;
  defaultValue?: unknown;
  required?: boolean;
}

@Injectable()
export class DeterministicNodeInputResolverService {
  private readonly logger = new Logger(DeterministicNodeInputResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves all input bindings for a specific execution step against user input & upstream completed steps.
   *
   * When `capabilityId` is provided, loads the skill's paramsSchema and applies enum + default
   * constraints to the resolved values. This prevents LLM-generated literal bindings from carrying
   * illegal enum values into the skill runtime (e.g. `topic: "AI"` for an enum of
   * `['general','news','finance']`). Illegal enum values are replaced with the schema default when
   * the default is itself a valid enum member; otherwise the field is dropped so the skill runtime
   * can handle the missing value per its own required/default logic.
   */
  public async resolveInputs(
    executionId: string,
    inputBindings: Record<string, ValueBindingV1>,
    executionInputJson: Record<string, any> = {},
    capabilityId?: string,
  ): Promise<Record<string, any>> {
    const resolvedInput: Record<string, any> = {};
    // Per-field binding source, so §9.2 enum handling can distinguish
    // planner-generated literals (rewritable) from user-direct input
    // (never rewritten — INPUT_SCHEMA_VIOLATION) and upstream data
    // (never rewritten — the contract validator decides).
    const valueSources: Record<string, string> = {};

    if (!inputBindings) {
      return resolvedInput;
    }

    // Pre-fetch upstream completed steps for this execution
    const upstreamSteps = await this.prisma.executionStep.findMany({
      where: {
        executionId,
        status: 'succeeded',
        planNodeId: { not: null },
      },
    });

    const stepOutputMap = new Map<string, any>();
    for (const step of upstreamSteps) {
      if (step.planNodeId && step.outputJson) {
        stepOutputMap.set(step.planNodeId, step.outputJson);
      }
    }

    for (const [field, binding] of Object.entries(inputBindings)) {
      if (!binding) continue;

      switch (binding.source) {
        case 'literal':
          if (typeof binding.value === 'string' && /\$\{[^}]+\}/.test(binding.value)) {
            const err: any = new Error(
              `Input binding for field '${field}' contains unresolved runtime placeholder`,
            );
            err.code = 'INPUT_BINDING_MISSING';
            throw err;
          }
          resolvedInput[field] = binding.value;
          valueSources[field] = 'literal';
          break;

        case 'user_input':
          resolvedInput[field] = this.getValueByPath(executionInputJson, binding.path);
          valueSources[field] = 'user_input';
          break;

        case 'node_output': {
          const targetNodeId = binding.nodeId || binding.fromNodeId || '';
          const upstreamOutput = stepOutputMap.get(targetNodeId);
          if (upstreamOutput) {
            const outPath = binding.path || binding.outputPath || '';
            const upstreamValue = this.getValueByPath(upstreamOutput, outPath);
            resolvedInput[field] =
              binding.transform === 'extract_unique_array'
                ? this.extractUniqueArray(upstreamValue, field, targetNodeId)
                : upstreamValue;
            valueSources[field] = 'node_output';
          } else {
            this.logger.warn(
              `Upstream node '${targetNodeId}' output not found for step in execution ${executionId}`,
            );
          }
          break;
        }

        case 'runtime_default':
          this.logger.debug(`Runtime default binding for field '${field}' is left to capability runtime defaults`);
          break;

        default:
          this.logger.warn(`Unknown input binding source '${(binding as any).source}' for field '${field}'`);
      }
    }

    if (capabilityId) {
      await this.applySkillSchemaConstraints(resolvedInput, capabilityId, valueSources);
    }

    return resolvedInput;
  }

  private extractUniqueArray(value: unknown, field: string, producerNodeId: string): unknown[] {
    if (Array.isArray(value)) return value;

    const matches: Array<{ path: string; value: unknown[] }> = [];
    const visit = (current: unknown, path: string, depth: number): void => {
      if (depth > 12 || current === null || current === undefined) return;
      if (Array.isArray(current)) {
        matches.push({ path, value: current });
        return;
      }
      if (typeof current !== 'object') return;
      for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
        visit(child, path ? `${path}.${key}` : key, depth + 1);
      }
    };
    visit(value, '', 0);

    if (matches.length === 1) return matches[0]!.value;

    const err: any = new Error(
      matches.length === 0
        ? `INPUT_SCHEMA_VIOLATION: binding for field '${field}' could not find an array in output from node '${producerNodeId}'`
        : `INPUT_SCHEMA_VIOLATION: binding for field '${field}' found multiple arrays in output from node '${producerNodeId}' (${matches.map((match) => match.path).join(', ')})`,
    );
    err.code = ERROR_CODES.INPUT_SCHEMA_VIOLATION;
    throw err;
  }

  /**
   * Loads the skill's paramsSchema and applies enum + default constraints to resolvedInput.
   * Mutates resolvedInput in place. §9.2 decision tree:
   *
   * - `literal` (planner-generated): illegal enum + valid default → default;
   *   illegal + no default → drop the field (rule 2 degrade semantics).
   * - `user_input` (user-direct): NEVER rewritten. An illegal value the user
   *   typed surfaces as INPUT_SCHEMA_VIOLATION at beforeCapabilityCall
   *   (rule 4). A merely absent value is left alone — `required` enforcement
   *   is the JSON Schema validator's job.
   * - `node_output` (upstream runtime data): never rewritten — the unified
   *   input contract validator decides schema conformance.
   *
   * Schema load failures fall back to warn + skip (fail-open on infra).
   */
  private async applySkillSchemaConstraints(
    resolvedInput: Record<string, any>,
    capabilityId: string,
    sources: Record<string, string> = {},
  ): Promise<void> {
    let schema: Record<string, SkillParamSchemaField> | undefined;
    try {
      schema = await this.loadSkillParamSchema(capabilityId);
    } catch (error) {
      this.logger.warn(
        `Failed to load paramsSchema for capability '${capabilityId}'; skipping enum/default enforcement: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    if (!schema || Object.keys(schema).length === 0) {
      return;
    }

    for (const fieldName of Object.keys(resolvedInput)) {
      const fieldSchema = schema[fieldName];
      if (!fieldSchema) {
        continue;
      }
      const enumValues = this.normalizeEnumValues(fieldSchema.enum);
      if (!enumValues || enumValues.length === 0) {
        continue;
      }

      const currentValue = resolvedInput[fieldName];
      if (this.isEnumValueAllowed(currentValue, enumValues)) {
        continue;
      }

      const source = sources[fieldName];
      if (source === 'user_input') {
        // §9.2 rule 4: never rewrite user-direct input. A present-but-illegal
        // value is a hard violation; an absent value is not (required is the
        // JSON Schema validator's concern).
        if (currentValue === undefined) {
          continue;
        }
        this.throwInputSchemaViolation(fieldName, currentValue, capabilityId);
      }
      if (source === 'node_output') {
        // Upstream runtime data is not a planner literal — no rewrite. The
        // unified input contract validator decides conformance.
        continue;
      }

      const defaultValue = this.normalizeScalarDefault(fieldSchema.defaultValue);
      if (this.isEnumValueAllowed(defaultValue, enumValues)) {
        resolvedInput[fieldName] = defaultValue;
        this.logger.warn(
          `Field '${fieldName}' had illegal enum value ${JSON.stringify(currentValue)} for capability '${capabilityId}'; replaced with schema default ${JSON.stringify(defaultValue)}`,
        );
      } else {
        delete resolvedInput[fieldName];
        this.logger.warn(
          `Field '${fieldName}' had illegal enum value ${JSON.stringify(currentValue)} for capability '${capabilityId}' and no valid default; dropping the field`,
        );
      }
    }
  }

  private throwInputSchemaViolation(fieldName: string, value: unknown, capabilityId: string): never {
    const err: any = new Error(
      `INPUT_SCHEMA_VIOLATION: user-supplied value for field '${fieldName}' is not among the allowed enum values of capability '${capabilityId}' (got ${JSON.stringify(value)})`,
    );
    err.code = ERROR_CODES.INPUT_SCHEMA_VIOLATION;
    throw err;
  }

  /**
   * Loads the paramsSchema for a published skill. Tries the snapshot's paramsSchema first,
   * then falls back to the temporal workflow's inputParams. Returns a normalized
   * `{ fieldName: { enum?, defaultValue?, required? } }` map.
   */
  private async loadSkillParamSchema(
    capabilityId: string,
  ): Promise<Record<string, SkillParamSchemaField> | undefined> {
    if (!capabilityId || typeof this.prisma.$queryRawUnsafe !== 'function') {
      return undefined;
    }

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        source_type?: string;
        params_schema_json?: unknown;
        workflow_dsl_json?: unknown;
        input_params_json?: unknown;
      }>
    >(
      `
        SELECT
          cr.source_type,
          css.source_payload_json #>> '{paramsSchema,properties}' AS params_schema_json,
          tw.workflow_dsl -> 'inputParams' AS input_params_json
        FROM capability_releases cr
        LEFT JOIN capability_source_snapshots css
          ON css.id = cr.current_source_snapshot_id
        LEFT JOIN temporal_workflows tw
          ON tw.id = cr.source_id
        WHERE cr.published_skill_id::text = $1
        ORDER BY
          CASE WHEN cr.archived_at IS NULL THEN 0 ELSE 1 END,
          cr.updated_at DESC
        LIMIT 1
      `,
      capabilityId,
    );

    const row = rows[0];
    if (!row) {
      return undefined;
    }

    const fromParamsSchema = this.parseRecord(row.params_schema_json);
    if (fromParamsSchema) {
      return this.extractSchemaFields(fromParamsSchema);
    }

    const inputParams = this.parseRecord(row.input_params_json);
    if (inputParams) {
      return this.extractSchemaFields(inputParams);
    }

    return undefined;
  }

  private extractSchemaFields(
    properties: Record<string, unknown>,
  ): Record<string, SkillParamSchemaField> | undefined {
    const result: Record<string, SkillParamSchemaField> = {};
    for (const [key, rawValue] of Object.entries(properties)) {
      const definition = this.parseRecord(rawValue);
      if (!definition) {
        continue;
      }
      const field: SkillParamSchemaField = {};
      const enumValues = this.normalizeEnumValues(definition.enum);
      if (enumValues && enumValues.length > 0) {
        field.enum = enumValues;
      }
      if (definition.defaultValue !== undefined && definition.defaultValue !== '') {
        field.defaultValue = definition.defaultValue;
      } else if (definition.default !== undefined && definition.default !== '') {
        field.defaultValue = definition.default;
      }
      if (definition.required === true || definition.required === 'true') {
        field.required = true;
      }
      if (Object.keys(field).length > 0) {
        result[key] = field;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  private normalizeEnumValues(value: unknown): Array<string | number> | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const seen = new Set<string>();
    const normalized: Array<string | number> = [];
    value.forEach((item) => {
      const candidate =
        typeof item === 'string'
          ? item.trim()
          : typeof item === 'number' && Number.isFinite(item)
            ? item
            : undefined;
      if (candidate === undefined || candidate === '') {
        return;
      }
      const identity = `${typeof candidate}:${String(candidate)}`;
      if (seen.has(identity)) {
        return;
      }
      seen.add(identity);
      normalized.push(candidate);
    });
    return normalized.length > 0 ? normalized : undefined;
  }

  private normalizeScalarDefault(value: unknown): unknown {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return value;
  }

  private isEnumValueAllowed(
    value: unknown,
    allowedValues: Array<string | number>,
  ): boolean {
    if (!allowedValues || allowedValues.length === 0) {
      return true;
    }
    return (
      (typeof value === 'string' || typeof value === 'number') &&
      allowedValues.some((allowed) => allowed === value)
    );
  }

  private parseRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      try {
        const parsed = JSON.parse(trimmed);
        return this.parseRecord(parsed);
      } catch {
        return null;
      }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private getValueByPath(obj: any, path: string): any {
    if (!obj || !path) return obj;
    if (path === '$' || path === '') return obj;

    const parts = path.replace(/^\$\.?/, '').split('.');
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }
}
