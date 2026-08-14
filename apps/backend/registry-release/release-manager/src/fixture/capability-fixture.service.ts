import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CapabilityTestFixtureV2,
  canonicalizeValue,
  jsonSchemaValidator,
} from '@ops/backend-runtime-capability-contract';
import { CAPABILITY_RELEASE_ERROR_CODE } from '../capability-release.constants';
import type { ReleaseManagerPrismaPort } from '../platform-runtime.ports';
import { RELEASE_MANAGER_PRISMA } from '../platform-runtime.tokens';

export type CapabilityFixtureType = 'input' | 'output' | 'negative';

export interface StoredCapabilityFixture {
  id: string;
  releaseId: string;
  buildId?: string | null;
  name?: string | null;
  fixtureType: CapabilityFixtureType;
  inputJson: Record<string, unknown>;
  expectedOutputJson?: Record<string, unknown> | null;
  isNegative: boolean;
  errorContains?: string | null;
  createdAt: Date;
}

export interface FixtureValidationResult {
  valid: boolean;
  errors: string[];
}

export interface FixtureMaterializationResult extends FixtureValidationResult {
  created: boolean;
}

type ValidationEvidenceRow = {
  input_snapshot_json: unknown;
  result_snapshot_json: unknown;
};

/**
 * §10.3 — Fixture infrastructure.
 *
 * Every capability version must carry at least:
 * 1. a valid input fixture,
 * 2. a valid runtime output fixture,
 * 3. a negative fixture that intentionally violates the output schema (proves
 *    the validator / publish gate rejects wrong results).
 *
 * Fixtures are proposed by the author or an AI generator, but are NOT an
 * authoritative contract source — they must pass Contract Lint (Gate 0) and
 * are versioned with the capability bundle via `fixtureDigest`.
 */
@Injectable()
export class CapabilityFixtureService {
  private readonly logger = new Logger(CapabilityFixtureService.name);

  constructor(
    @Inject(RELEASE_MANAGER_PRISMA)
    private readonly prisma: ReleaseManagerPrismaPort
  ) {}

  /** Persist a set of fixtures against a release (optionally pinned to a build) */
  public async storeFixtures(
    releaseId: string,
    fixtures: CapabilityTestFixtureV2[],
    buildId?: string
  ): Promise<StoredCapabilityFixture[]> {
    const stored: StoredCapabilityFixture[] = [];
    for (const fixture of fixtures) {
      const row = await this.prisma.$queryRawUnsafe<Array<StoredCapabilityFixture>>(
        `INSERT INTO capability_fixtures
           (id, release_id, build_id, name, fixture_type, input_json,
            expected_output_json, is_negative, error_contains, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5::jsonb,
                 $6::jsonb, $7, $8, now())
         RETURNING id, release_id, build_id, name, fixture_type, input_json,
                   expected_output_json, is_negative, error_contains, created_at`,
        releaseId,
        buildId ?? null,
        fixture.name ?? null,
        fixture.isNegativeFixture
          ? 'negative'
          : fixture.expectedOutput !== undefined
            ? 'output'
            : 'input',
        JSON.stringify(fixture.input ?? {}),
        fixture.expectedOutput ? JSON.stringify(fixture.expectedOutput) : null,
        fixture.isNegativeFixture === true,
        null
      );
      stored.push(...(row as StoredCapabilityFixture[]));
    }
    this.logger.log(
      `Stored ${stored.length} fixture(s) for release ${releaseId}`
    );
    return stored;
  }

  /**
   * Replace the Fixture Bundle for one immutable build. Release-wide fixture
   * accumulation is unsafe because samples from an older contract could make a
   * newer build appear publishable.
   */
  public async replaceFixturesForBuild(
    releaseId: string,
    buildId: string,
    fixtures: CapabilityTestFixtureV2[]
  ): Promise<StoredCapabilityFixture[]> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM capability_fixtures
       WHERE release_id = $1::uuid AND build_id = $2::uuid`,
      releaseId,
      buildId
    );
    return this.storeFixtures(releaseId, fixtures, buildId);
  }

  /**
   * Deterministic digest over the whole fixture set (canonicalized JSON →
   * SHA-256). Reuses `canonicalizeValue` from the contracts package so the
   * digest is stable across field ordering.
   */
  public computeFixtureDigest(fixtures: CapabilityTestFixtureV2[]): string {
    const canonical = JSON.stringify(canonicalizeValue(fixtures));
    return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
  }

  /**
   * §10.3 gate: a release is fixture-complete only when it has at least one
   * input fixture, one output fixture and one negative fixture.
   */
  public async validateFixturesExist(
    releaseId: string,
    buildId?: string
  ): Promise<FixtureValidationResult> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ fixture_type: string; count: number }>>(
      `SELECT fixture_type, COUNT(*)::int AS count
       FROM capability_fixtures
       WHERE release_id = $1::uuid
         AND ($2::uuid IS NULL OR build_id = $2::uuid)
       GROUP BY fixture_type`,
      releaseId,
      buildId ?? null
    );
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.fixture_type] = row.count;

    const errors: string[] = [];
    if ((counts.input ?? 0) < 1) {
      errors.push('缺少有效输入 Fixture（§10.3 要求至少 1 个）');
    }
    if ((counts.output ?? 0) < 1) {
      errors.push('缺少有效运行时输出 Fixture（§10.3 要求至少 1 个）');
    }
    if ((counts.negative ?? 0) < 1) {
      errors.push('缺少负例 Fixture（§10.3 要求至少 1 个故意违反 output schema 的负例）');
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Materialize the §10.3 three-piece Fixture Bundle from the latest successful
   * runtime validation of the exact build. The contract stays authoritative:
   * validation evidence proposes samples, but samples are persisted only when
   * both input and runtime output conform to the draft schemas.
   */
  public async ensureFixturesForBuild(args: {
    releaseId: string;
    buildId: string;
    draftPayload: Record<string, unknown>;
  }): Promise<FixtureMaterializationResult> {
    const existing = await this.validateFixturesExist(args.releaseId, args.buildId);
    if (existing.valid) {
      return { ...existing, created: false };
    }

    const rows = await this.prisma.$queryRawUnsafe<ValidationEvidenceRow[]>(
      `SELECT input_snapshot_json, result_snapshot_json
       FROM capability_validations
       WHERE release_id = $1::uuid
         AND build_id = $2::uuid
         AND success = true
         AND result_snapshot_json IS NOT NULL
       ORDER BY
         CASE validation_type WHEN 'sandbox' THEN 0 WHEN 'post_deploy_smoke' THEN 1 ELSE 2 END,
         created_at DESC
       LIMIT 1`,
      args.releaseId,
      args.buildId
    );
    const evidence = rows[0];
    if (!evidence) {
      return {
        valid: false,
        created: false,
        errors: ['当前 Build 没有成功的运行时验证证据，无法生成 Fixture Bundle'],
      };
    }

    const inputSchema = this.extractInputSchema(args.draftPayload);
    const outputSchema = this.extractOutputSchema(args.draftPayload);
    if (!inputSchema || !outputSchema) {
      return {
        valid: false,
        created: false,
        errors: ['当前 Skill 草案缺少 input/output Schema，无法校验并生成 Fixture Bundle'],
      };
    }

    const resultSnapshot = this.asRecord(evidence.result_snapshot_json) || {};
    const rawInput =
      this.findNestedRecord(resultSnapshot, 'input') ||
      this.asRecord(evidence.input_snapshot_json) ||
      {};
    const input = this.normalizeFixtureInput(
      this.projectToSchemaProperties(rawInput, inputSchema),
      inputSchema
    );
    const rawOutput = this.extractRuntimeOutput(resultSnapshot);
    if (!rawOutput) {
      return {
        valid: false,
        created: false,
        errors: ['成功验证记录中没有可识别的运行时业务输出，无法生成输出 Fixture'],
      };
    }
    // Output contracts are closed and authoritative. Validate the exact runtime
    // business payload instead of projecting away undeclared fields; otherwise
    // `additionalProperties: false` can never detect producer drift.
    const expectedOutput = rawOutput;

    const inputValidation = jsonSchemaValidator.validateInput(input, inputSchema);
    const outputValidation = jsonSchemaValidator.validateOutput(expectedOutput, outputSchema);
    const errors: string[] = [];
    if (!inputValidation.valid) {
      errors.push(`有效输入 Fixture 不符合 input schema: ${this.firstValidationError(inputValidation)}`);
    }
    if (!outputValidation.valid) {
      errors.push(
        `有效运行时输出 Fixture 不符合 output schema: ${this.firstValidationError(outputValidation)}`
      );
    }
    if (errors.length > 0) {
      return { valid: false, created: false, errors };
    }

    const negativeSuggestion = this.generateNegativeFixtureSuggestion(outputSchema);
    const negativeValidation = jsonSchemaValidator.validateOutput(
      negativeSuggestion.expectedOutput,
      outputSchema
    );
    if (negativeValidation.valid) {
      return {
        valid: false,
        created: false,
        errors: ['当前 output schema 没有可用于证明 Validator 拒绝行为的约束，无法生成有效负例 Fixture'],
      };
    }
    const fixtures: CapabilityTestFixtureV2[] = [
      { name: 'valid-input: runtime-validation', input },
      {
        name: 'valid-output: runtime-validation',
        input,
        expectedOutput,
      },
      {
        ...negativeSuggestion,
        input,
      },
    ];
    await this.replaceFixturesForBuild(args.releaseId, args.buildId, fixtures);
    return { valid: true, created: true, errors: [] };
  }

  /**
   * Suggest a negative fixture from the output schema: a payload that removes
   * a required field (or sets a wrong type) so the output validator must
   * reject it. Used to seed the authoring flow — the author still confirms it.
   */
  public generateNegativeFixtureSuggestion(
    outputSchema: Record<string, unknown> | null | undefined
  ): CapabilityTestFixtureV2 {
    const schema = outputSchema ?? {};
    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    const required = (schema.required ?? []) as string[];

    let invalidOutput: Record<string, unknown> = {};
    if (required.length > 0) {
      // drop the first required field → guaranteed invalid
      const kept = required.slice(1);
      invalidOutput = Object.fromEntries(
        kept.map((name) => [name, this.sampleValue(properties[name])])
      );
    } else if (Object.keys(properties).length > 0) {
      // no required fields: use a wrong type for the first property
      const firstName = Object.keys(properties)[0];
      const prop = properties[firstName] as Record<string, unknown>;
      invalidOutput = { [firstName]: this.wrongTypeValue(prop) };
    }

    return {
      name: `negative: violates ${required.length > 0 ? `required ${required[0]}` : 'output schema'}`,
      input: {},
      expectedOutput: invalidOutput,
      isNegativeFixture: true,
    };
  }

  /** The error code release-manager surfaces when fixtures are incomplete */
  public readonly errorCode = CAPABILITY_RELEASE_ERROR_CODE.FIXTURE_VALIDATION_FAILED;

  private extractInputSchema(payload: Record<string, unknown>): Record<string, unknown> | null {
    const contracts = this.asRecord(payload.contracts) || {};
    const inputContract = this.asRecord(contracts.input) || {};
    return (
      this.asRecord(inputContract.schema) ||
      this.asRecord(payload.paramsSchema) ||
      null
    );
  }

  private extractOutputSchema(payload: Record<string, unknown>): Record<string, unknown> | null {
    const contracts = this.asRecord(payload.contracts) || {};
    const outputContract = this.asRecord(contracts.output) || {};
    return (
      this.asRecord(outputContract.schema) ||
      this.asRecord(payload.outputSchema) ||
      null
    );
  }

  private extractRuntimeOutput(snapshot: Record<string, unknown>): Record<string, unknown> | null {
    let current: unknown = snapshot;
    for (let depth = 0; depth < 8; depth += 1) {
      const record = this.asRecord(current);
      if (!record) return null;
      const businessData = this.asRecord(record.businessData);
      if (businessData) return businessData;
      const data = this.asRecord(record.data);
      if (data) return data;
      if (record.result === undefined) return record;
      current = record.result;
    }
    return this.asRecord(current);
  }

  private findNestedRecord(
    snapshot: Record<string, unknown>,
    key: string
  ): Record<string, unknown> | null {
    let current: unknown = snapshot;
    for (let depth = 0; depth < 5; depth += 1) {
      const record = this.asRecord(current);
      if (!record) return null;
      const candidate = this.asRecord(record[key]);
      if (candidate) return candidate;
      if (record.result === undefined) return null;
      current = record.result;
    }
    return null;
  }

  private projectToSchemaProperties(
    value: Record<string, unknown>,
    schema: Record<string, unknown>
  ): Record<string, unknown> {
    const properties = this.asRecord(schema.properties);
    if (!properties || Object.keys(properties).length === 0) return { ...value };
    return Object.keys(properties).reduce<Record<string, unknown>>((acc, key) => {
      if (value[key] !== undefined) acc[key] = value[key];
      return acc;
    }, {});
  }

  private normalizeFixtureInput(
    input: Record<string, unknown>,
    schema: Record<string, unknown>
  ): Record<string, unknown> {
    const properties = this.asRecord(schema.properties) || {};
    return Object.entries(input).reduce<Record<string, unknown>>((acc, [key, value]) => {
      const propertySchema = this.asRecord(properties[key]) || {};
      const type = propertySchema.type;
      let normalized = value;
      if ((type === 'number' || type === 'integer') && typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) normalized = parsed;
      } else if (type === 'boolean' && typeof value === 'string') {
        if (value.toLowerCase() === 'true') normalized = true;
        if (value.toLowerCase() === 'false') normalized = false;
      }
      if (/(api[-_]?key|token|secret|password|authorization|cookie)/i.test(key)) {
        normalized = /api[-_]?key/i.test(key) ? 'fixture-api-key-redacted' : 'fixture-secret-redacted';
      }
      acc[key] = normalized;
      return acc;
    }, {});
  }

  private firstValidationError(result: {
    errors?: Array<{ path?: string; message?: string }>;
  }): string {
    const error = result.errors?.[0];
    return error ? `${error.path || '/'}: ${error.message || 'invalid value'}` : 'unknown';
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private sampleValue(propSchema: unknown): unknown {
    if (typeof propSchema !== 'object' || propSchema === null) return null;
    const p = propSchema as Record<string, unknown>;
    if ('default' in p) return p.default;
    switch (p.type) {
      case 'string':
        return '';
      case 'number':
      case 'integer':
        return 0;
      case 'boolean':
        return false;
      case 'array':
        return [];
      case 'object':
        return {};
      default:
        return null;
    }
  }

  private wrongTypeValue(propSchema: unknown): unknown {
    if (typeof propSchema !== 'object' || propSchema === null) return 0;
    const p = propSchema as Record<string, unknown>;
    switch (p.type) {
      case 'string':
        return 0; // number where string expected
      case 'number':
      case 'integer':
        return 'not-a-number';
      case 'boolean':
        return 'not-a-boolean';
      case 'array':
        return {};
      case 'object':
        return [];
      default:
        return 0;
    }
  }
}
