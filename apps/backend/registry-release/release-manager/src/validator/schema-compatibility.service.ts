import { Injectable } from '@nestjs/common';
import { buildBrowserCapabilityOutputSchema } from '@ops/backend-browser-execution-contract';

export type ContractCompatibilityMode = 'backward' | 'none';

export type SchemaChangeKind =
  | 'property_removed'
  | 'property_added'
  | 'property_added_strict'
  | 'type_changed'
  | 'required_added'
  | 'required_removed'
  | 'enum_value_removed'
  | 'enum_value_added'
  | 'constraint_tightened'
  | 'constraint_loosened';

export interface SchemaChange {
  path: string;
  kind: SchemaChangeKind;
  breaking: boolean;
  message: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export type SchemaDiffClassification =
  | 'compatible'
  | 'breaking'
  | 'identical'
  | 'first_publish'
  | 'unknown';

export interface SchemaDiffResult {
  compatible: boolean;
  classification: SchemaDiffClassification;
  mode: ContractCompatibilityMode;
  changes: SchemaChange[];
}

const MAX_COMPARE_DEPTH = 5;

/**
 * Output-schema compatibility diff tool (design doc §15.4 P3 item 5).
 *
 * Backward compatibility semantics: a new schema version is compatible when
 * every output that validated against the OLD schema still validates against
 * the NEW schema. Concretely:
 * - adding an optional property is compatible (unless the old schema was
 *   closed with `additionalProperties: false` — then it breaks old validators)
 * - removing a property, changing a type, tightening required, deleting enum
 *   values and tightening max/min constraints are all breaking
 * - loosening (dropping required, widening enums, relaxing constraints) is
 *   compatible
 *
 * `mode: 'none'` (manifest `spec.migration.contractCompatibility: none`)
 * explicitly opts out of compatibility enforcement (§15.4 item 5).
 */
@Injectable()
export class SchemaCompatibilityService {
  /**
   * Compares two output schemas. `mode` controls enforcement:
   * - 'backward' (default): structural diff with breaking-change detection
   * - 'none': no enforcement — returns `unknown` classification
   */
  public compareOutputSchemas(
    oldSchema: Record<string, unknown> | null | undefined,
    newSchema: Record<string, unknown> | null | undefined,
    mode: ContractCompatibilityMode = 'backward'
  ): SchemaDiffResult {
    if (mode === 'none') {
      return { compatible: true, classification: 'unknown', mode, changes: [] };
    }

    const oldEmpty = this.isEmptySchema(oldSchema);
    const newEmpty = this.isEmptySchema(newSchema);
    if (oldEmpty && newEmpty) {
      return { compatible: true, classification: 'identical', mode, changes: [] };
    }
    if (oldEmpty) {
      return { compatible: true, classification: 'first_publish', mode, changes: [] };
    }

    if (this.deepEqual(oldSchema, newSchema)) {
      return { compatible: true, classification: 'identical', mode, changes: [] };
    }

    const changes: SchemaChange[] = [];
    this.walkCompare(
      oldSchema ?? {},
      newSchema ?? {},
      '#',
      changes,
      0,
      (oldSchema?.additionalProperties ?? true) === false
    );

    const breaking = changes.filter((c) => c.breaking);
    return {
      compatible: breaking.length === 0,
      classification: breaking.length > 0 ? 'breaking' : 'compatible',
      mode,
      changes,
    };
  }

  /**
   * Resolves the compatibility mode from a release source payload
   * (`manifest.spec.migration.contractCompatibility`). Defaults to 'backward'.
   */
  public resolveCompatibility(
    sourcePayload?: Record<string, unknown> | null
  ): ContractCompatibilityMode {
    const manifest = (sourcePayload as any)?.manifest as any;
    const mode = manifest?.spec?.migration?.contractCompatibility;
    return mode === 'none' ? 'none' : 'backward';
  }

  /**
   * Extracts the declarative output schema from a release payload. Same lookup
   * order as Gate 2 in capability-release-build-validation.service.ts:
   * `contracts.output.schema` → `manifest.spec.contracts.output.schema` → top-level `outputSchema`.
   */
  public extractOutputSchema(
    payload?: Record<string, unknown> | null
  ): Record<string, unknown> | null {
    if (!payload || typeof payload !== 'object') return null;
    const contracts =
      (payload.contracts as Record<string, unknown>) ||
      (payload.manifest as any)?.spec?.contracts ||
      {};
    const output =
      (contracts?.output as Record<string, unknown>) ||
      (payload.outputSchema as Record<string, unknown>);
    const schema = (output as any)?.schema ?? output;
    if (schema && typeof schema === 'object' && Object.keys(schema as Record<string, unknown>).length > 0) {
      return schema as Record<string, unknown>;
    }
    const outputParams =
      (payload.outputParams as Record<string, unknown>) ||
      (payload.apiEndpoints as any)?.runtimeMetadata?.outputParams ||
      (payload.runtimeMetadata as any)?.outputParams;
    if (outputParams && typeof outputParams === 'object' && Object.keys(outputParams).length > 0) {
      const properties: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(outputParams)) {
        const paramDef =
          typeof val === 'object' && val !== null ? (val as Record<string, unknown>) : {};
        properties[key] = {
          type: typeof paramDef.type === 'string' ? paramDef.type : 'string',
          description: typeof paramDef.description === 'string' ? paramDef.description : `Output field ${key}`,
        };
      }
      return {
        type: 'object',
        properties,
      };
    }
    if (payload.executionPlan || payload.browserRecording || payload.executionFlow || payload.steps) {
      return buildBrowserCapabilityOutputSchema({
        runtimeMetadata: payload.runtimeMetadata,
        executionPlan: payload.executionPlan,
        composition: payload.workflowComposition || payload.composition,
      });
    }
    return null;
  }

  private walkCompare(
    oldSchema: Record<string, unknown>,
    newSchema: Record<string, unknown>,
    path: string,
    changes: SchemaChange[],
    depth: number,
    oldIsStrict: boolean
  ): void {
    if (depth > MAX_COMPARE_DEPTH) return;

    const oldProps = (oldSchema.properties as Record<string, unknown>) ?? {};
    const newProps = (newSchema.properties as Record<string, unknown>) ?? {};
    const oldRequired = new Set<string>((oldSchema.required as string[]) ?? []);
    const newRequired = new Set<string>((newSchema.required as string[]) ?? []);

    for (const key of newRequired) {
      if (!oldRequired.has(key)) {
        changes.push({
          path: `${path}.${key}`,
          kind: 'required_added',
          breaking: true,
          message: `Field '${key}' became required`,
        });
      }
    }
    for (const key of oldRequired) {
      if (!newRequired.has(key)) {
        changes.push({
          path: `${path}.${key}`,
          kind: 'required_removed',
          breaking: false,
          message: `Field '${key}' is no longer required`,
        });
      }
    }

    for (const key of Object.keys(oldProps)) {
      if (!(key in newProps)) {
        changes.push({
          path: `${path}.${key}`,
          kind: 'property_removed',
          breaking: true,
          message: `Property '${key}' removed from the output schema`,
          oldValue: oldProps[key],
        });
      }
    }
    for (const key of Object.keys(newProps)) {
      if (!(key in oldProps)) {
        if (oldIsStrict) {
          changes.push({
            path: `${path}.${key}`,
            kind: 'property_added_strict',
            breaking: true,
            message: `New property '${key}' violates the old schema's additionalProperties: false`,
            newValue: newProps[key],
          });
        } else {
          changes.push({
            path: `${path}.${key}`,
            kind: 'property_added',
            breaking: false,
            message: `New optional property '${key}' added`,
            newValue: newProps[key],
          });
        }
      }
    }

    for (const key of Object.keys(oldProps)) {
      const oldValue = (oldProps[key] as Record<string, unknown>) ?? {};
      const newValue = (newProps[key] as Record<string, unknown>) ?? {};
      if (Object.keys(newValue).length === 0) continue;

      const oldType = oldValue.type;
      const newType = newValue.type;
      if (oldType && newType && oldType !== newType) {
        changes.push({
          path: `${path}.${key}`,
          kind: 'type_changed',
          breaking: true,
          message: `Type of '${key}' changed from ${String(oldType)} to ${String(newType)}`,
          oldValue: oldType,
          newValue: newType,
        });
        continue;
      }

      const oldEnum = oldValue.enum;
      const newEnum = newValue.enum;
      if (Array.isArray(oldEnum) && Array.isArray(newEnum)) {
        for (const value of oldEnum) {
          if (!newEnum.includes(value)) {
            changes.push({
              path: `${path}.${key}`,
              kind: 'enum_value_removed',
              breaking: true,
              message: `Enum value ${JSON.stringify(value)} removed from '${key}'`,
              oldValue: value,
            });
          }
        }
        for (const value of newEnum) {
          if (!oldEnum.includes(value)) {
            changes.push({
              path: `${path}.${key}`,
              kind: 'enum_value_added',
              breaking: false,
              message: `Enum value ${JSON.stringify(value)} added to '${key}'`,
              newValue: value,
            });
          }
        }
      }

      for (const constraint of [
        'maxLength',
        'maxItems',
        'maximum',
        'exclusiveMaximum',
        'minLength',
        'minItems',
        'minimum',
        'exclusiveMinimum',
      ] as const) {
        const oldBound = oldValue[constraint];
        const newBound = newValue[constraint];
        if (typeof oldBound !== 'number' || typeof newBound !== 'number' || oldBound === newBound) {
          continue;
        }
        const isMax = constraint.startsWith('max') || constraint === 'exclusiveMaximum';
        const tightened = isMax ? newBound < oldBound : newBound > oldBound;
        changes.push({
          path: `${path}.${key}`,
          kind: tightened ? 'constraint_tightened' : 'constraint_loosened',
          breaking: tightened,
          message: `${constraint} of '${key}' ${tightened ? 'tightened' : 'loosened'} from ${oldBound} to ${newBound}`,
          oldValue: oldBound,
          newValue: newBound,
        });
      }

      if (oldType === 'object' && newType === 'object') {
        this.walkCompare(oldValue, newValue, `${path}.${key}`, changes, depth + 1, oldIsStrict);
      } else if (oldType === 'array' && newType === 'array') {
        const oldItems = oldValue.items;
        const newItems = newValue.items;
        if (oldItems && newItems && typeof oldItems === 'object' && typeof newItems === 'object') {
          this.walkCompare(
            oldItems as Record<string, unknown>,
            newItems as Record<string, unknown>,
            `${path}.${key}[]`,
            changes,
            depth + 1,
            oldIsStrict
          );
        }
      }
    }
  }

  private isEmptySchema(schema?: Record<string, unknown> | null): boolean {
    return !schema || typeof schema !== 'object' || Object.keys(schema).length === 0;
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    const keysA = Object.keys(a as Record<string, unknown>).sort();
    const keysB = Object.keys(b as Record<string, unknown>).sort();
    if (keysA.length !== keysB.length || keysA.some((k, i) => k !== keysB[i])) return false;
    return keysA.every((k) => this.deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
}
