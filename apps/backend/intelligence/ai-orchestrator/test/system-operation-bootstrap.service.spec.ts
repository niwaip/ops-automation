import { Logger } from '@nestjs/common';
import { SystemOperationBootstrapService } from '../src/modules/llm-operation/seed/system-operation-bootstrap.service';
import { SYSTEM_OPERATION_VERSION } from '../src/modules/llm-operation/seed/system-operations.seed';
import { listActiveSystemOperationIds } from '../src/modules/llm-operation/system-operation-definitions';

describe('SystemOperationBootstrapService', () => {
  const operationIds = listActiveSystemOperationIds();

  function buildHarness(options: { attested?: boolean; activated?: boolean } = {}) {
    const attestedVersionIds = new Set<string>();
    if (options.attested) {
      operationIds.forEach((operationId) => attestedVersionIds.add(`version-${operationId}`));
    }

    const repository = {
      findOperationByKey: jest.fn(async (operationId: string) => ({
        id: `operation-${operationId}`,
        operationKey: operationId,
        displayName: operationId,
        description: operationId,
        owner: 'system',
        status: 'active',
        source: 'system_seed',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findVersionByOperationIdAndVersion: jest.fn(async (operationDbId: string) => {
        const operationId = operationDbId.replace(/^operation-/, '');
        return {
          id: `version-${operationId}`,
          operationId: operationDbId,
          version: SYSTEM_OPERATION_VERSION,
          state: options.attested ? 'approved' : 'candidate',
          manifestJson: {},
          operationDigest: `sha256:${operationId}`,
          contractDigest: `sha256:contract-${operationId}`,
          changeSummary: 'Initial system seed',
          source: 'system_seed',
          approvedBy: options.attested ? 'system-bootstrap' : null,
          approvedAt: options.attested ? new Date() : null,
          createdBy: 'system',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }),
      updateVersionState: jest.fn(async (versionId: string) => ({
        id: versionId,
        operationId: versionId.replace(/^version-/, 'operation-'),
        version: SYSTEM_OPERATION_VERSION,
        state: 'approved',
        source: 'system_seed',
      })),
      findActivationByOperationAndEnv: jest.fn(async (operationDbId: string) =>
        options.activated
          ? {
              id: `activation-${operationDbId}`,
              operationId: operationDbId,
              versionId: operationDbId.replace(/^operation-/, 'version-'),
              environment: 'production',
            }
          : null,
      ),
    } as any;
    const attestation = {
      hasValidAttestation: jest.fn(async (versionId: string) =>
        attestedVersionIds.has(versionId),
      ),
    } as any;
    const validation = {
      validate: jest.fn(async ({ version }: any) => {
        attestedVersionIds.add(version.id);
        return {};
      }),
    } as any;
    const activation = { activate: jest.fn().mockResolvedValue({}) } as any;
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as Logger;
    const service = new SystemOperationBootstrapService(
      {} as any,
      attestation,
      validation,
      activation,
      repository,
      logger,
    );
    return { service, repository, attestation, validation, activation };
  }

  it('validates, attests, approves, and activates every missing system baseline', async () => {
    const harness = buildHarness();

    const result = await harness.service.reconcileSeededOperations();

    expect(result.failed).toEqual([]);
    expect(result.ready).toEqual(operationIds);
    expect(harness.validation.validate).toHaveBeenCalledTimes(operationIds.length);
    expect(harness.repository.updateVersionState).toHaveBeenCalledTimes(operationIds.length);
    expect(harness.activation.activate).toHaveBeenCalledTimes(operationIds.length);
  });

  it('is idempotent when all baselines are already attested and activated', async () => {
    const harness = buildHarness({ attested: true, activated: true });

    const result = await harness.service.reconcileSeededOperations();

    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual(operationIds);
    expect(harness.validation.validate).not.toHaveBeenCalled();
    expect(harness.repository.updateVersionState).not.toHaveBeenCalled();
    expect(harness.activation.activate).not.toHaveBeenCalled();
  });

  it('keeps a failed operation unavailable while continuing other operations', async () => {
    const harness = buildHarness();
    harness.validation.validate.mockImplementation(async ({ operation, version }: any) => {
      if (operation.operationKey === 'summarize_list') {
        throw new Error('provider unavailable');
      }
      (harness.attestation.hasValidAttestation as jest.Mock).mockImplementation(
        async (versionId: string) => versionId !== 'version-summarize_list',
      );
      return { version };
    });

    const result = await harness.service.reconcileSeededOperations();

    expect(result.failed).toContainEqual({
      operationId: 'summarize_list',
      error: 'provider unavailable',
    });
    expect(harness.activation.activate).toHaveBeenCalledTimes(operationIds.length - 1);
  });
});
