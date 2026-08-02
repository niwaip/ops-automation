import { CapabilityAttestationService } from '../../../registry-release/release-manager/src/attestation/capability-attestation.service';
import { ContractLintService } from '../../../registry-release/release-manager/src/validator/contract-lint.service';

describe('CapabilityAttestationService (Gate 5, §10.6)', () => {
  const prismaRows = (over: {
    snapshots?: unknown[];
    builds?: unknown[];
    validations?: unknown[];
    fixtures?: unknown[];
    attestations?: unknown[];
  } = {}) => ({
    $queryRawUnsafe: jest.fn(async (sql: string, ...params: unknown[]): Promise<unknown[]> => {
      if (sql.includes('INSERT INTO capability_attestations')) {
        // RETURNING row: params are [releaseId, buildId, sourceDigest, contractDigest,
        // generatedCodeDigest, fixtureDigest, validatorVersion, gateResultsJson]
        return [{
          id: 'att-new',
          release_id: params[0],
          build_id: params[1],
          source_digest: params[2],
          contract_digest: params[3],
          generated_code_digest: params[4],
          fixture_digest: params[5],
          validator_version: params[6],
          gate_results_json: params[7],
          created_at: new Date('2026-08-01T12:00:00Z'),
        }];
      }
      if (sql.includes('capability_source_snapshots')) return over.snapshots ?? [];
      if (sql.includes('capability_builds')) return over.builds ?? [];
      if (sql.includes('capability_validations')) return over.validations ?? [];
      if (sql.includes('capability_fixtures')) return over.fixtures ?? [];
      if (sql.includes('capability_attestations')) return over.attestations ?? [];
      return [];
    }),
  });

  const createService = (over = {}) =>
    new CapabilityAttestationService(prismaRows(over) as never);

  it('computes sha256 digests with the sha256: prefix', () => {
    const service = createService();
    expect(service.computeDigest('hello')).toBe(
      'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
    expect(service.computeDigest('hello')).not.toBe(service.computeDigest('world'));
  });

  it('builds an attestation with all gates passed when validations exist', async () => {
    const service = createService({
      snapshots: [{ source_payload_json: { contracts: { output: { schema: { type: 'object' } } } }, source_type: 'builtin_skill' }],
      builds: [{ generated_code: 'def main():\n  pass\n' }],
      validations: [
        { validation_type: 'static', success: true },
        { validation_type: 'sandbox', success: true },
      ],
      fixtures: [
        { input_json: { query: 'a' }, expected_output_json: null, is_negative: false, name: 'in' },
        { input_json: { query: 'a' }, expected_output_json: null, is_negative: true, name: 'neg' },
      ],
    });

    const lint = new ContractLintService().lintContract({ type: 'object', properties: {} });
    const attestation = await service.buildAttestation('release-1', 'build-1', lint);

    expect(attestation.sourceDigest).toMatch(/^sha256:/);
    expect(attestation.contractDigest).toBe(lint.contractDigest);
    expect(attestation.generatedCodeDigest).toMatch(/^sha256:/);
    expect(attestation.fixtureDigest).toMatch(/^sha256:/);
    expect(attestation.validatorVersion).toBe('2.0.0');
    expect(attestation.tests).toEqual({
      contractLint: 'passed',
      staticAnalysis: 'passed',
      sandbox: 'passed',
      composition: 'skipped',
      temporalReplay: 'skipped',
    });
  });

  it('marks gates without recorded validations as skipped, never assumed passed', async () => {
    const service = createService({
      snapshots: [{ source_payload_json: {}, source_type: 'builtin_skill' }],
      builds: [{ generated_code: 'x' }],
      validations: [],
    });

    const attestation = await service.buildAttestation('release-1', 'build-1');
    expect(attestation.tests.contractLint).toBe('skipped');
    expect(attestation.tests.staticAnalysis).toBe('skipped');
    expect(attestation.tests.sandbox).toBe('skipped');
    expect(attestation.fixtureDigest).toBeUndefined();
  });

  it('derives temporalReplay from recorded replay validations instead of hardcoding skipped', async () => {
    const service = createService({
      snapshots: [{ source_payload_json: {}, source_type: 'builtin_skill' }],
      builds: [{ generated_code: 'x' }],
      validations: [{ validation_type: 'temporal_replay', success: true }],
    });

    const attestation = await service.buildAttestation('release-1', 'build-1');
    expect(attestation.tests.temporalReplay).toBe('passed');
  });

  it('records temporalReplay as failed when the replay validation row failed', async () => {
    const service = createService({
      snapshots: [{ source_payload_json: {}, source_type: 'builtin_skill' }],
      builds: [{ generated_code: 'x' }],
      validations: [{ validation_type: 'temporal_replay', success: false }],
    });

    const attestation = await service.buildAttestation('release-1', 'build-1');
    expect(attestation.tests.temporalReplay).toBe('failed');
  });

  it('marks gates as failed when a validation row recorded success=false', async () => {
    const service = createService({
      snapshots: [{ source_payload_json: {}, source_type: 'builtin_skill' }],
      builds: [{ generated_code: 'x' }],
      validations: [{ validation_type: 'sandbox', success: false }],
    });

    const attestation = await service.buildAttestation('release-1', 'build-1');
    expect(attestation.tests.sandbox).toBe('failed');
    expect(attestation.tests.contractLint).toBe('skipped');
  });

  it('returns the latest attestation for a release', async () => {
    const latest = {
      id: 'att-2',
      release_id: 'release-1',
      build_id: 'build-2',
      source_digest: 'sha256:a',
      contract_digest: 'sha256:b',
      generated_code_digest: 'sha256:c',
      fixture_digest: null,
      validator_version: '2.0.0',
      gate_results_json: {},
      created_at: new Date('2026-08-01T12:00:00Z'),
    };
    const service = createService({ attestations: [latest] });
    const result = await service.getLatestAttestation('release-1');
    expect(result?.id).toBe('att-2');
    expect(result?.releaseId).toBe('release-1');
  });

  it('returns undefined when no attestation exists for the release', async () => {
    const service = createService({ attestations: [] });
    expect(await service.getLatestAttestation('release-1')).toBeUndefined();
  });
});
