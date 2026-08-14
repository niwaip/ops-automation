import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { jsonSchemaValidator } from '@ops/backend-runtime-capability-contract';

export type ContractLintSeverity = 'error' | 'warning';

export interface ContractLintIssue {
  rule: string;
  message: string;
  path: string;
  severity: ContractLintSeverity;
}

export interface ContractLintResult {
  passed: boolean;
  errors: ContractLintIssue[];
  warnings: ContractLintIssue[];
  /** Stable digest of the canonicalized contract (Gate 0: summary stability) */
  contractDigest: string;
}

/**
 * Gate 0 — Contract Lint (§10.1).
 *
 * Static, deterministic validation of a capability contract (input/output JSON
 * Schema + dataPath + fixtures) BEFORE code generation:
 * - JSON Schema subset check (reject oneOf/anyOf/allOf/if-then-else and
 *   external $refs — undecidable features are not allowed)
 * - `required` fields must exist in `properties`
 * - `default` values must match the field type / enum
 * - `$ref` must resolve inside the schema ($defs / definitions)
 * - circular `$ref` detection
 * - `dataPath` must be reachable in the output schema
 * - canonicalized contract digest must be stable across lint runs
 *
 * Failure means the publish pipeline must NOT proceed to code generation.
 */
@Injectable()
export class ContractLintService {
  /** JSON Schema features that are outside the supported decidable subset */
  private static readonly UNSUPPORTED_KEYS = ['oneOf', 'anyOf', 'allOf', 'if', 'then', 'else', 'not'];

  private static readonly JSON_SCHEMA_TYPES = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'];

  public lintContract(contract: unknown): ContractLintResult {
    const errors: ContractLintIssue[] = [];
    const warnings: ContractLintIssue[] = [];

    if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
      return {
        passed: false,
        errors: [
          {
            rule: 'contract_not_object',
            message: '契约必须是 JSON object',
            path: '#',
            severity: 'error',
          },
        ],
        warnings: [],
        contractDigest: this.computeContractDigest(contract),
      };
    }

    const root = contract as Record<string, unknown>;

    // Lint both the root and any schemas wrapped inside the contract envelope
    // (`contracts.{input,output}.schema`, `manifest.spec.contracts.*` — fix ⑥).
    // Without this, unsupported keywords / broken required / unresolved refs
    // hidden inside a contracts wrapper would pass Gate 0 silently.
    const schemasToLint = [{ schema: root, path: '#' }, ...this.collectWrappedSchemas(root)];

    for (const { schema, path } of schemasToLint) {
      this.checkUnsupportedKeywords(schema, errors, path);
    }
    const refs = new Map<string, string>(); // ref target -> node path (for cycle detection)
    const definitions = this.collectDefinitions(root);
    for (const { schema, path } of schemasToLint) {
      this.walkSchema(schema, path, root, refs, definitions, errors, warnings);
    }
    this.checkDataPaths(root, errors);
    this.checkFixtureBindings(root, errors, warnings);

    return {
      passed: errors.length === 0,
      errors,
      warnings,
      contractDigest: this.computeContractDigest(contract),
    };
  }

  /** Deterministic digest of the canonicalized contract (stable across runs) */
  public computeContractDigest(contract: unknown): string {
    const canonical = JSON.stringify(this.canonicalize(contract));
    return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
  }

  // --------------------------------------------------------------------------
  // Schema subset + structural checks
  // --------------------------------------------------------------------------

  private checkUnsupportedKeywords(node: Record<string, unknown>, errors: ContractLintIssue[], path = '#'): void {
    for (const key of ContractLintService.UNSUPPORTED_KEYS) {
      if (key in node) {
        errors.push({
          rule: 'schema_unsupported_feature',
          message: `JSON Schema 特性 "${key}" 不在平台支持的确定性子集内`,
          path,
          severity: 'error',
        });
      }
    }

    if (typeof node.$ref === 'string' && !node.$ref.startsWith('#/')) {
      errors.push({
        rule: 'external_ref_not_allowed',
        message: `外部 \$ref "${node.$ref}" 不允许；只能引用 schema 内部 \$defs/definitions`,
        path,
        severity: 'error',
      });
    }

    for (const [key, value] of Object.entries(node)) {
      if ((key === 'properties' || key === '$defs' || key === 'definitions') && typeof value === 'object' && value !== null) {
        for (const [propName, propValue] of Object.entries(value as Record<string, unknown>)) {
          if (typeof propValue === 'object' && propValue !== null && !Array.isArray(propValue)) {
            this.checkUnsupportedKeywords(propValue as Record<string, unknown>, errors, `${path}.${key}.${propName}`);
          }
        }
      }
    }
  }

  private collectDefinitions(schema: Record<string, unknown>): Map<string, unknown> {
    const definitions = new Map<string, unknown>();
    const collect = (node: Record<string, unknown>): void => {
      const root = node.$defs ?? node.definitions;
      if (typeof root === 'object' && root !== null) {
        for (const [name, def] of Object.entries(root as Record<string, unknown>)) {
          definitions.set(`#/$defs/${name}`, def);
          definitions.set(`#/definitions/${name}`, def);
        }
      }
    };
    collect(schema);
    // $defs declared inside contracts-wrapped schemas must also be resolvable
    // (fix ⑥) — otherwise their $refs would be flagged unresolved.
    for (const { schema: wrapped } of this.collectWrappedSchemas(schema)) {
      collect(wrapped);
    }
    return definitions;
  }

  /**
   * Schemas wrapped inside the contract envelope (fix ⑥). Same locations as
   * the fixture/schema extraction: `contracts.{input,output}.schema` and
   * `manifest.spec.contracts.{input,output}.schema` (entry itself acts as the
   * schema when the `schema` key is absent).
   */
  private collectWrappedSchemas(root: Record<string, unknown>): Array<{ schema: Record<string, unknown>; path: string }> {
    const out: Array<{ schema: Record<string, unknown>; path: string }> = [];
    const visitSide = (contracts: Record<string, unknown>, basePath: string): void => {
      for (const side of ['input', 'output'] as const) {
        const entry = contracts[side];
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
        const schema = (entry as Record<string, unknown>).schema ?? entry;
        if (typeof schema === 'object' && !Array.isArray(schema) && Object.keys(schema).length > 0) {
          out.push({ schema: schema as Record<string, unknown>, path: `${basePath}.${side}.schema` });
        }
      }
    };

    const contracts = root.contracts;
    if (typeof contracts === 'object' && contracts !== null && !Array.isArray(contracts)) {
      visitSide(contracts as Record<string, unknown>, '#.contracts');
    }
    const manifest = ((root.manifest as Record<string, unknown> | undefined) as any)?.spec?.contracts;
    if (typeof manifest === 'object' && manifest !== null && !Array.isArray(manifest)) {
      visitSide(manifest as Record<string, unknown>, '#.manifest.spec.contracts');
    }
    return out;
  }

  private walkSchema(
    node: unknown,
    path: string,
    root: Record<string, unknown>,
    refs: Map<string, string>,
    definitions: Map<string, unknown>,
    errors: ContractLintIssue[],
    warnings: ContractLintIssue[]
  ): void {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
    const schema = node as Record<string, unknown>;

    // $ref: verify resolvable + detect cycles
    if (typeof schema.$ref === 'string') {
      const target = schema.$ref;
      if (definitions.has(target)) {
        if (refs.has(target)) {
          errors.push({
            rule: 'circular_ref',
            message: `检测到循环 \$ref 引用链: ${refs.get(target)} → ${path} → ${target}`,
            path,
            severity: 'error',
          });
        } else {
          refs.set(target, path);
          this.walkSchema(definitions.get(target), path, root, refs, definitions, errors, warnings);
          refs.delete(target);
        }
      } else {
        errors.push({
          rule: 'unresolved_ref',
          message: `\$ref "${target}" 无法解析到 \$defs/definitions`,
          path,
          severity: 'error',
        });
      }
      return;
    }

    // required ⊆ properties
    if (Array.isArray(schema.required)) {
      const properties = schema.properties as Record<string, unknown> | undefined;
      for (const requiredName of schema.required) {
        if (typeof requiredName !== 'string') {
          errors.push({
            rule: 'required_not_string',
            message: 'required 数组只能包含字符串',
            path,
            severity: 'error',
          });
          continue;
        }
        if (!properties || !(requiredName in properties)) {
          errors.push({
            rule: 'required_not_in_properties',
            message: `required 字段 "${requiredName}" 不存在于 properties`,
            path,
            severity: 'error',
          });
        }
      }
    }

    // default must match type / enum
    if ('default' in schema) {
      this.checkDefault(schema, path, errors, warnings);
    }

    // recursive descent into properties / items / $defs / definitions
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [name, prop] of Object.entries(schema.properties as Record<string, unknown>)) {
        this.walkSchema(prop, `${path}.properties.${name}`, root, refs, definitions, errors, warnings);
      }
    }
    if (schema.items && typeof schema.items === 'object') {
      this.walkSchema(schema.items, `${path}.items`, root, refs, definitions, errors, warnings);
    }
    for (const defKey of ['$defs', 'definitions'] as const) {
      if (schema[defKey] && typeof schema[defKey] === 'object') {
        for (const [name, def] of Object.entries(schema[defKey] as Record<string, unknown>)) {
          this.walkSchema(def, `${path}.${defKey}.${name}`, root, refs, definitions, errors, warnings);
        }
      }
    }
  }

  private checkDefault(
    schema: Record<string, unknown>,
    path: string,
    errors: ContractLintIssue[],
    warnings: ContractLintIssue[]
  ): void {
    const defaultValue = schema.default;
    const expectedType = schema.type;

    if (typeof expectedType === 'string' && !this.valueMatchesType(defaultValue, expectedType)) {
      errors.push({
        rule: 'default_type_mismatch',
        message: `default 值类型与 type "${expectedType}" 不匹配`,
        path,
        severity: 'error',
      });
      return;
    }

    if (Array.isArray(schema.enum) && !schema.enum.some((v) => JSON.stringify(v) === JSON.stringify(defaultValue))) {
      errors.push({
        rule: 'default_not_in_enum',
        message: `default 值不在 enum 枚举中`,
        path,
        severity: 'error',
      });
    }

    if (typeof expectedType === 'string' && expectedType === 'object' && typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
      // default object with required sub-properties missing → suspicious but non-blocking
      const required = (schema.required ?? []) as string[];
      const properties = (schema.properties ?? {}) as Record<string, unknown>;
      for (const requiredName of required) {
        if (!(requiredName in (defaultValue as Record<string, unknown>))) {
          warnings.push({
            rule: 'default_missing_required_subfield',
            message: `default 对象缺少 required 子字段 "${requiredName}"`,
            path,
            severity: 'warning',
          });
        }
        void properties;
      }
    }
  }

  private valueMatchesType(value: unknown, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      case 'null':
        return value === null;
      default:
        return true; // unknown type — let schema subset check handle it
    }
  }

  // --------------------------------------------------------------------------
  // dataPath reachability + fixture bindings
  // --------------------------------------------------------------------------

  private checkDataPaths(contract: Record<string, unknown>, errors: ContractLintIssue[]): void {
    const dataPaths = this.collectDataPaths(contract);
    for (const { dataPath, path } of dataPaths) {
      if (!this.isPathReachable(contract, dataPath)) {
        errors.push({
          rule: 'data_path_not_reachable',
          message: `dataPath "${dataPath}" 在 output schema 中不可达`,
          path,
          severity: 'error',
        });
      }
    }
  }

  private collectDataPaths(node: unknown, base = ''): Array<{ dataPath: string; path: string }> {
    const found: Array<{ dataPath: string; path: string }> = [];
    if (typeof node !== 'object' || node === null) return found;

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const current = base ? `${base}.${key}` : key;
      if (key === 'dataPath' && typeof value === 'string') {
        found.push({ dataPath: value, path: `#.${current}` });
      } else if (typeof value === 'object' && value !== null) {
        found.push(...this.collectDataPaths(value, current));
      }
    }
    return found;
  }

  /**
   * Known runtime Envelope prefixes (§7.1): the business output sits at
   * `$.result.businessData` during the migration phase and `$.data` in the
   * target shape. A dataPath starting with either is valid when its remainder
   * resolves inside the output schema (empty remainder = the whole business
   * output).
   */
  private static readonly ENVELOPE_PREFIXES = ['$.result.businessData', '$.data'];

  /**
   * Resolve a dataPath like `$.results.items[].id` against the output schema.
   * Fix ⑥: runtime-envelope paths (`$.result.businessData…` / `$.data…`)
   * resolve by stripping the envelope prefix first — they must NOT be flagged
   * unreachable just because the envelope wrapper is not part of the schema.
   */
  private isPathReachable(contract: Record<string, unknown>, dataPath: string): boolean {
    if (this.walkSchemaPath(contract, this.pathSegments(dataPath))) return true;

    for (const prefix of ContractLintService.ENVELOPE_PREFIXES) {
      if (dataPath === prefix) return true; // whole business output at the envelope root
      if (dataPath.startsWith(`${prefix}.`)) {
        if (this.walkSchemaPath(contract, this.pathSegments(dataPath.slice(prefix.length)))) {
          return true;
        }
      }
    }
    return false;
  }

  private pathSegments(dataPath: string): string[] {
    return dataPath
      .replace(/^\$\./, '')
      .split('.')
      .map((seg) => seg.replace(/\[\]$/, '').replace(/\[\d+\]$/, ''))
      .filter((seg) => seg.length > 0);
  }

  private walkSchemaPath(contract: Record<string, unknown>, segments: string[]): boolean {
    let node: unknown = contract;
    for (const segment of segments) {
      if (typeof node !== 'object' || node === null) return false;
      const obj = node as Record<string, unknown>;
      const properties = obj.properties as Record<string, unknown> | undefined;
      if (properties && segment in properties) {
        node = properties[segment];
        continue;
      }
      // `[...]` segments denote array elements: the segment must resolve in
      // the element schema (JSON Schema `items`).
      if (obj.type === 'array' && obj.items && typeof obj.items === 'object' && !Array.isArray(obj.items)) {
        const items = obj.items as Record<string, unknown>;
        const itemProps = items.properties as Record<string, unknown> | undefined;
        if (itemProps && segment in itemProps) {
          node = itemProps[segment];
          continue;
        }
      }
      return false;
    }
    return true;
  }

  /**
   * §10.3: fixtures bound to the contract must declare input/output/negative,
   * and their content must conform to the declared input/output schemas
   * (§10.1 — "Fixture 是否符合输入或输出 Schema").
   *
   * - A valid input fixture's `input` must conform to the input schema.
   * - A valid output fixture's `expectedOutput` must conform to the output schema.
   * - A negative fixture's `expectedOutput` must actually VIOLATE the output
   *   schema — otherwise it cannot prove the validator would reject it.
   *
   * Missing fixtures are flagged as warnings (non-blocking); content that
   * violates the schemas is blocking (error). Any side without a declared
   * schema is skipped (fail-open).
   */
  private checkFixtureBindings(
    contract: Record<string, unknown>,
    errors: ContractLintIssue[],
    warnings: ContractLintIssue[],
  ): void {
    const tests = (contract.tests as Record<string, unknown> | undefined) ?? {};
    const fixtures = contract.fixtures ?? tests.fixtures;
    if (fixtures === undefined) return;
    if (!Array.isArray(fixtures)) {
      warnings.push({
        rule: 'fixtures_not_array',
        message: '契约声明的 fixtures 必须是数组',
        path: '#.fixtures',
        severity: 'warning',
      });
      return;
    }

    const inputSchema = this.extractInputSchema(contract);
    const outputSchema = this.extractOutputSchema(contract);
    const outputSchemaStrict = outputSchema && this.hasMeaningfulConstraints(outputSchema);

    const hasInput = fixtures.some((f) => f && typeof f === 'object' && !f.isNegativeFixture);
    const hasNegative = fixtures.some((f) => f && typeof f === 'object' && f.isNegativeFixture === true);
    if (!hasInput) {
      warnings.push({
        rule: 'fixture_missing_valid_input',
        message: '缺少有效输入 fixture（§10.3 要求至少 1 个）',
        path: '#.fixtures',
        severity: 'warning',
      });
    }
    if (!hasNegative) {
      warnings.push({
        rule: 'fixture_missing_negative',
        message: '缺少负例 fixture（§10.3 要求至少 1 个故意违反 output schema 的负例）',
        path: '#.fixtures',
        severity: 'warning',
      });
    }

    fixtures.forEach((fixture, index) => {
      if (!fixture || typeof fixture !== 'object') return;
      const f = fixture as Record<string, unknown>;
      const path = `#.fixtures[${index}]`;
      const isNegative = f.isNegativeFixture === true;

      if (!isNegative && inputSchema && f.input !== undefined && !Array.isArray(f.input)) {
        const inputResult = jsonSchemaValidator.validateInput(f.input, inputSchema);
        if (!inputResult.valid) {
          errors.push({
            rule: 'fixture_input_violates_input_schema',
            message: `输入 fixture 不符合 input schema: ${this.firstErrorMessage(inputResult)}`,
            path: `${path}.input`,
            severity: 'error',
          });
        }
      }

      if (f.expectedOutput === undefined) return;
      if (!outputSchema) return;
      const outputResult = jsonSchemaValidator.validateOutput(f.expectedOutput, outputSchema);
      if (isNegative) {
        // A negative fixture must actually violate the schema; only checkable
        // when the schema carries enough constraints to be violable.
        if (outputSchemaStrict && outputResult.valid) {
          errors.push({
            rule: 'negative_fixture_not_negative',
            message: '负例 fixture 的 expectedOutput 实际符合 output schema，无法证明 Validator 会拒绝',
            path: `${path}.expectedOutput`,
            severity: 'error',
          });
        }
      } else if (!outputResult.valid) {
        errors.push({
          rule: 'fixture_output_violates_output_schema',
          message: `输出 fixture 不符合 output schema: ${this.firstErrorMessage(outputResult)}`,
          path: `${path}.expectedOutput`,
          severity: 'error',
        });
      }
    });
  }

  private firstErrorMessage(result: { errors?: Array<{ path?: string; message?: string }> }): string {
    return result.errors?.[0] ? `${result.errors[0].path || '/'}: ${result.errors[0].message}` : 'unknown';
  }

  /** Declared input schema (same locations as output schema extraction) */
  private extractInputSchema(contract: Record<string, unknown>): Record<string, unknown> | null {
    const contracts = (contract.contracts as Record<string, unknown>) || (contract.manifest as any)?.spec?.contracts || {};
    const input = (contracts?.input as Record<string, unknown>) || null;
    const schema = input ? (input.schema as Record<string, unknown> | undefined) ?? input : null;
    if (schema && typeof schema === 'object' && !Array.isArray(schema) && Object.keys(schema).length > 0) {
      return schema;
    }
    return null;
  }

  /** Declared output schema (same locations as schema-compatibility.service) */
  private extractOutputSchema(contract: Record<string, unknown>): Record<string, unknown> | null {
    const contracts = (contract.contracts as Record<string, unknown>) || (contract.manifest as any)?.spec?.contracts || {};
    const output = (contracts?.output as Record<string, unknown>) || (contract.outputSchema as Record<string, unknown> | undefined);
    const schema = output ? (output.schema as Record<string, unknown> | undefined) ?? output : null;
    if (schema && typeof schema === 'object' && !Array.isArray(schema) && Object.keys(schema).length > 0) {
      return schema;
    }
    const outputParams =
      (contract.outputParams as Record<string, unknown>) ||
      (contract.apiEndpoints as any)?.runtimeMetadata?.outputParams ||
      (contract.runtimeMetadata as any)?.outputParams;
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
    return null;
  }

  /**
   * Whether a schema carries constraints beyond its type keyword — i.e.
   * whether a negative fixture can actually violate it. A bare
   * `{ type: 'object' }` cannot be violated by any object, so negative-fixture
   * checks are skipped for it (fail-open).
   */
  private hasMeaningfulConstraints(schema: Record<string, unknown>): boolean {
    return Object.keys(schema).some((key) => key !== 'type' && schema[key] !== undefined);
  }

  // --------------------------------------------------------------------------
  // Canonicalization for stable digest
  // --------------------------------------------------------------------------

  private canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.canonicalize(item));
    if (typeof value === 'object' && value !== null) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[key] = this.canonicalize((value as Record<string, unknown>)[key]);
      }
      return sorted;
    }
    return value;
  }

  /** Static helper: does the schema pass the supported-subset gate? */
  public static isSupportedSchema(schema: unknown): boolean {
    if (typeof schema !== 'object' || schema === null) return false;
    const s = schema as Record<string, unknown>;
    return !ContractLintService.UNSUPPORTED_KEYS.some((key) => key in s);
  }

  /** Static helper for JSON Schema type validation */
  public static isValidTypeName(type: unknown): boolean {
    return typeof type === 'string' && ContractLintService.JSON_SCHEMA_TYPES.includes(type);
  }
}
