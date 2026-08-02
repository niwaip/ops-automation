import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CapabilityTestFixtureV2, canonicalizeValue } from '@ops/backend-runtime-capability-contract';
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
        fixture.isNegativeFixture ? 'negative' : fixture.expectedOutput ? 'output' : 'input',
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
  public async validateFixturesExist(releaseId: string): Promise<FixtureValidationResult> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ fixture_type: string; count: number }>>(
      `SELECT fixture_type, COUNT(*)::int AS count
       FROM capability_fixtures WHERE release_id = $1::uuid
       GROUP BY fixture_type`,
      releaseId
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

    let input: Record<string, unknown> = {};
    if (required.length > 0) {
      // drop the first required field → guaranteed invalid
      const kept = required.slice(1);
      input = Object.fromEntries(kept.map((name) => [name, this.sampleValue(properties[name])]));
    } else if (Object.keys(properties).length > 0) {
      // no required fields: use a wrong type for the first property
      const firstName = Object.keys(properties)[0];
      const prop = properties[firstName] as Record<string, unknown>;
      input = { [firstName]: this.wrongTypeValue(prop) };
    }

    return {
      name: `negative: violates ${required.length > 0 ? `required ${required[0]}` : 'output schema'}`,
      input,
      isNegativeFixture: true,
    };
  }

  /** The error code release-manager surfaces when fixtures are incomplete */
  public readonly errorCode = CAPABILITY_RELEASE_ERROR_CODE.FIXTURE_VALIDATION_FAILED;

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
