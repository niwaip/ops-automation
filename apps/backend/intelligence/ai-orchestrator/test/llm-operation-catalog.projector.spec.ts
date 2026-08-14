import { LlmOperationCatalogProjector } from '../src/modules/llm-operation/llm-operation-catalog.projector';
import { LLM_OPERATION_TEMPLATES } from '../src/modules/llm-operation/llm-operation.registry';
import {
  buildOperationManifest,
  computeOperationContractDigest,
  computeOperationDigestFromManifest,
} from '../src/modules/llm-operation/operation-manifest.util';

describe('LlmOperationCatalogProjector', () => {
  const operationKey = 'summarize_list';
  const manifest = buildOperationManifest(
    operationKey,
    LLM_OPERATION_TEMPLATES[operationKey],
    '1.0.0',
  );
  const version = {
    id: 'version-1',
    operationId: 'operation-1',
    version: '1.0.0',
    state: 'approved',
    manifestJson: manifest,
    operationDigest: computeOperationDigestFromManifest(manifest, '1.0.0'),
    contractDigest: computeOperationContractDigest(operationKey, '1.0.0', manifest),
    approvedAt: new Date('2026-08-09T00:00:00.000Z'),
  };
  const activeOperation = {
    operation: {
      id: 'operation-1',
      operationKey,
      displayName: '列表摘要',
      description: '列表摘要',
      status: 'active',
    },
    currentVersion: version,
    activation: { environment: 'production', versionId: version.id },
  };
  const proof = {
    id: 'attestation-1',
    operationId: 'operation-1',
    versionId: version.id,
    operationDigest: version.operationDigest,
    contractDigest: version.contractDigest,
    evalSuiteDigest: 'sha256:suite',
    validatorVersion: '1.0.0',
    gateResults: {
      schemaTests: 'passed',
      offlineEvals: 'passed',
      liveEvals: 'passed',
      securityEvals: 'passed',
    },
    createdAt: new Date('2026-08-09T01:00:00.000Z'),
  };

  let registry: any;
  let attestation: any;
  let projector: LlmOperationCatalogProjector;

  beforeEach(() => {
    registry = {
      listActiveOperations: jest.fn().mockResolvedValue([activeOperation]),
      resolveActiveVersion: jest.fn().mockResolvedValue({ version }),
    };
    attestation = {
      hasValidAttestation: jest.fn().mockResolvedValue(true),
      getLatestAttestation: jest.fn().mockResolvedValue(proof),
    };
    projector = new LlmOperationCatalogProjector(registry, attestation);
  });

  it('projects only attested active versions with governance provenance', async () => {
    const projections = await projector.projectAll();

    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({
      capabilityRef: {
        id: operationKey,
        version: '1.0.0',
        digest: version.operationDigest,
        contractDigest: version.contractDigest,
      },
      capabilityKind: 'llm_operation',
      runtime: { type: 'llm_operation' },
      lifecycle: { status: 'active', environment: 'production' },
      governance: {
        attestationId: proof.id,
        evaluatedAt: proof.createdAt.toISOString(),
        approvedAt: version.approvedAt.toISOString(),
      },
    });
    expect(projections[0]!.inputSchema).toEqual(manifest.inputSchema);
    expect(projections[0]!.outputSchema).toEqual(manifest.outputSchema);
    expect(projections[0]).not.toHaveProperty('systemPrompt');
    expect(projections[0]).not.toHaveProperty('userPrompt');
  });

  it('excludes versions without a valid attestation', async () => {
    attestation.hasValidAttestation.mockResolvedValue(false);

    await expect(projector.projectAll()).resolves.toEqual([]);
    await expect(projector.projectOne(operationKey)).resolves.toBeNull();
    expect(attestation.getLatestAttestation).not.toHaveBeenCalled();
  });

  it('fails closed when registry lookup fails', async () => {
    registry.listActiveOperations.mockRejectedValue(new Error('database unavailable'));
    registry.resolveActiveVersion.mockRejectedValue(new Error('database unavailable'));

    await expect(projector.projectAll()).resolves.toEqual([]);
    await expect(projector.projectOne(operationKey)).resolves.toBeNull();
  });

  it('projects one exact active and attested operation', async () => {
    const projection = await projector.projectOne(operationKey);

    expect(projection).not.toBeNull();
    expect(projection!.capabilityRef.id).toBe(operationKey);
    expect(projection!.displayName).toBe('列表摘要');
    expect(projection!.goals).toEqual(['summarize', 'news_summary', 'list_summary']);
    expect(projection!.governance.attestationId).toBe(proof.id);
  });

  it('returns null when the active version cannot be resolved', async () => {
    registry.resolveActiveVersion.mockResolvedValue(null);

    await expect(projector.projectOne('not_exists')).resolves.toBeNull();
  });
});
