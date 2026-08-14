import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CAPABILITY_RELEASE_ERROR_CODE } from '../capability-release.constants';
import type { ReleaseManagerPrismaPort } from '../platform-runtime.ports';
import { RELEASE_MANAGER_PRISMA } from '../platform-runtime.tokens';
import { ContractLintResult } from '../validator/contract-lint.service';

export type GateStatus = 'passed' | 'failed' | 'skipped';

export interface GateResults {
  contractLint: GateStatus;
  staticAnalysis: GateStatus;
  sandbox: GateStatus;
  composition: GateStatus;
  temporalReplay: GateStatus;
}

export interface AttestationPayload {
  sourceDigest: string;
  contractDigest: string;
  generatedCodeDigest: string;
  fixtureDigest?: string;
  validatorVersion: string;
  tests: GateResults;
}

export interface StoredAttestation extends AttestationPayload {
  id: string;
  releaseId: string;
  buildId: string;
  createdAt: Date;
}

const VALIDATOR_VERSION = '2.0.0';

/**
 * Gate 5 — Release validation attestation (§10.6).
 *
 * Every published artifact carries a cryptographic attestation binding the
 * source, the contract, the generated code, the fixtures and the gate
 * results. Activation must only point to versions with a valid attestation
 * (enforced by the activation gate in the platform service).
 */
@Injectable()
export class CapabilityAttestationService {
  private readonly logger = new Logger(CapabilityAttestationService.name);

  constructor(
    @Inject(RELEASE_MANAGER_PRISMA)
    private readonly prisma: ReleaseManagerPrismaPort
  ) {}

  /** `sha256:<hex>` digest over canonicalized content */
  public computeDigest(content: string): string {
    return `sha256:${createHash('sha256').update(content).digest('hex')}`;
  }

  /**
   * Build and persist the attestation for a release/build.
   *
   * - sourceDigest: canonicalized source payload → SHA-256
   * - contractDigest: canonicalized contract section of the source payload
   * - generatedCodeDigest: SHA-256 over the generated code
   * - fixtureDigest: when fixtures exist, from `computeFixtureDigest`
   * - tests: mapped from CapabilityValidation rows; gates with no recorded
   *   validation are marked `skipped`, never silently `passed`
   */
  public async buildAttestation(
    releaseId: string,
    buildId: string,
    lint?: ContractLintResult
  ): Promise<StoredAttestation> {
    const [snapshotRows, buildRows, validationRows, fixtureRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ source_payload_json: unknown; source_type: string }>>(
        `SELECT source_payload_json, source_type FROM capability_source_snapshots
         WHERE release_id = $1::uuid ORDER BY snapshot_version DESC LIMIT 1`,
        releaseId
      ),
      this.prisma.$queryRawUnsafe<Array<{ generated_code: string | null }>>(
        `SELECT generated_code FROM capability_builds WHERE id = $1::uuid LIMIT 1`,
        buildId
      ),
      this.prisma.$queryRawUnsafe<Array<{ validation_type: string; success: boolean }>>(
        `SELECT validation_type, success FROM capability_validations
         WHERE build_id = $1::uuid ORDER BY created_at DESC`,
        buildId
      ),
      this.prisma.$queryRawUnsafe<Array<{ input_json: unknown; expected_output_json: unknown | null; is_negative: boolean; name: string | null }>>(
        `SELECT input_json, expected_output_json, is_negative, name FROM capability_fixtures
         WHERE release_id = $1::uuid AND build_id = $2::uuid`,
        releaseId,
        buildId
      ),
    ]);

    const sourcePayload = snapshotRows?.[0]?.source_payload_json ?? {};
    const sourceDigest = this.computeDigest(JSON.stringify(this.canonicalize(sourcePayload)));
    const contractDigest = lint?.contractDigest ?? this.computeDigest(JSON.stringify(this.canonicalize(sourcePayload)));

    const generatedCode = buildRows?.[0]?.generated_code ?? '';
    const generatedCodeDigest = this.computeDigest(generatedCode);

    const fixtureDigest = fixtureRows.length > 0
      ? this.computeDigest(JSON.stringify(this.canonicalize(fixtureRows)))
      : undefined;

    const tests = this.deriveGateResults(validationRows, lint);

    const payload: AttestationPayload = {
      sourceDigest,
      contractDigest,
      generatedCodeDigest,
      ...(fixtureDigest ? { fixtureDigest } : {}),
      validatorVersion: VALIDATOR_VERSION,
      tests,
    };

    const stored = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `INSERT INTO capability_attestations
         (id, release_id, build_id, source_digest, contract_digest,
          generated_code_digest, fixture_digest, validator_version,
          gate_results_json, created_at)
       VALUES
         (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6, $7,
          $8::jsonb, now())
       RETURNING id, release_id, build_id, source_digest, contract_digest,
                 generated_code_digest, fixture_digest, validator_version,
                 gate_results_json, created_at`,
      releaseId,
      buildId,
      payload.sourceDigest,
      payload.contractDigest,
      payload.generatedCodeDigest,
      payload.fixtureDigest ?? null,
      payload.validatorVersion,
      JSON.stringify({ tests: payload.tests })
    );

    this.logger.log(
      `Attestation created for release ${releaseId} build ${buildId} — ` +
        `contractLint=${tests.contractLint} sandbox=${tests.sandbox}`
    );
    return this.mapAttestationRow(stored[0]);
  }

  /** Latest attestation for a release (or undefined when none exists) */
  public async getLatestAttestation(releaseId: string): Promise<StoredAttestation | undefined> {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, release_id, build_id, source_digest, contract_digest,
              generated_code_digest, fixture_digest, validator_version,
              gate_results_json, created_at
       FROM capability_attestations
       WHERE release_id = $1::uuid
       ORDER BY created_at DESC LIMIT 1`,
      releaseId
    );
    return rows?.[0] ? this.mapAttestationRow(rows[0]) : undefined;
  }

  public get errorCode(): string {
    return CAPABILITY_RELEASE_ERROR_CODE.ATTESTATION_FAILED;
  }

  /** Map raw snake_case DB rows ($queryRawUnsafe) into the typed shape */
  private mapAttestationRow(row: Record<string, unknown>): StoredAttestation {
    return {
      id: String(row.id),
      releaseId: String(row.release_id),
      buildId: String(row.build_id),
      sourceDigest: String(row.source_digest),
      contractDigest: String(row.contract_digest),
      generatedCodeDigest: String(row.generated_code_digest),
      fixtureDigest: row.fixture_digest ? String(row.fixture_digest) : undefined,
      validatorVersion: String(row.validator_version),
      tests: this.gateResultsFromJson(row.gate_results_json),
      createdAt: new Date(row.created_at as string),
    };
  }

  private gateResultsFromJson(value: unknown): GateResults {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const raw = (parsed as { tests?: Partial<GateResults> } | undefined) ?? {};
    const tests = raw.tests ?? {};
    return {
      contractLint: tests.contractLint ?? 'skipped',
      staticAnalysis: tests.staticAnalysis ?? 'skipped',
      sandbox: tests.sandbox ?? 'skipped',
      composition: tests.composition ?? 'skipped',
      temporalReplay: tests.temporalReplay ?? 'skipped',
    };
  }

  private deriveGateResults(
    validations: Array<{ validation_type: string; success: boolean }>,
    lint?: ContractLintResult
  ): GateResults {
    const byType = new Map<string, boolean>();
    for (const v of validations) byType.set(v.validation_type, v.success);

    const fromValidation = (type: string): GateStatus => {
      if (!byType.has(type)) return 'skipped';
      return byType.get(type) ? 'passed' : 'failed';
    };

    return {
      contractLint: lint ? (lint.passed ? 'passed' : 'failed') : 'skipped',
      staticAnalysis: fromValidation('static'),
      sandbox: fromValidation('sandbox'),
      // composition (Gate 3, §10.4) is a PLAN-FREEZE-time check: it validates
      // producer→consumer edges inside a frozen plan, so there is no plan to
      // validate at publish time. The attestation therefore records it as
      // 'skipped' — the actual proof lives in each frozen plan's
      // validationJson.composition. This is a documented architectural stance,
      // not an unimplemented gate.
      composition: 'skipped',
      // temporal replay (Gate 4, §10.5) depends on the validation agent
      // exposing workflow history — external dependency. Until the agent
      // records replay validations, no `temporal_replay` rows exist and the
      // gate stays 'skipped'; once recorded, the status is derived from the
      // actual validation rows instead of being hardcoded.
      temporalReplay: fromValidation('temporal_replay'),
    };
  }

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
}
