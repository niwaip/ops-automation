import type { CapabilityPackManifest } from './manifest';
import { digestCapabilityContract, validateCapabilityPackManifest } from './manifest';
import { runCapabilityFixtures } from './test-kit';

function fixture(): CapabilityPackManifest {
  const contract = {
    apiVersion: 'ops-automation/v2',
    kind: 'Capability' as const,
    metadata: { id: 'example.echo', version: '1.0.0', sourceType: 'published_skill' as const },
    contracts: {
      input: {
        schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
      },
      output: {
        schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
      },
    },
    runtime: { type: 'api' },
  };
  return {
    apiVersion: 'ops-automation/capability-pack/v1',
    kind: 'CapabilityPack',
    metadata: {
      id: 'example.echo',
      version: '1.0.0',
      owner: 'team-platform',
      lifecycle: 'certified',
      contractDigest: digestCapabilityContract(contract),
    },
    contract,
    routing: {
      displayName: 'Echo',
      summary: 'Echo text',
      aliases: ['echo'],
      goals: ['echo'],
      positiveExamples: ['echo hello'],
      negativeExamples: ['send an email'],
    },
    runtime: {
      routeKey: 'api:echo',
      adapterVersion: '1.0.0',
      protocolVersion: '1',
      probe: '/health',
    },
    governance: {
      riskLevel: 'L0',
      sideEffectClass: 'none',
      idempotency: 'naturally_idempotent',
      permissions: [],
      runbook: 'https://runbooks.local/echo',
    },
  };
}

describe('capability pack SDK', () => {
  it('accepts a certified pack with deterministic governance metadata', () => {
    expect(validateCapabilityPackManifest(fixture())).toEqual({ valid: true, errors: [] });
  });

  it('rejects digest drift and non-idempotent certified packs', () => {
    const manifest = fixture();
    manifest.metadata.contractDigest = 'stale';
    manifest.governance.idempotency = 'none';
    expect(validateCapabilityPackManifest(manifest).errors).toEqual(
      expect.arrayContaining([
        'metadata.contractDigest does not match contract',
        'certified capability must declare idempotent behavior',
      ])
    );
  });

  it('runs positive and negative contract fixtures', () => {
    const result = runCapabilityFixtures(fixture(), [
      { name: 'valid', input: { text: 'hi' }, output: { text: 'hi' } },
      { name: 'invalid', input: {}, expectInputValid: false },
    ]);
    expect(result.failures).toEqual([]);
  });

  it('rejects aliases that do not map to canonical enum values', () => {
    const manifest = fixture();
    manifest.contract.contracts.input.schema = {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          enum: ['east'],
          'x-enum-aliases': { west: ['西部'] },
        },
      },
    };
    manifest.metadata.contractDigest = digestCapabilityContract(manifest.contract);

    expect(validateCapabilityPackManifest(manifest).errors).toContain(
      'contract input region.x-enum-aliases key west is not in enum'
    );
  });
});
