import { Logger } from '@nestjs/common';
import { AttestationService } from '../src/modules/llm-operation/eval/attestation.service';
import { GateEvaluatorService } from '../src/modules/llm-operation/eval/gate-evaluator.service';
import type { LlmOperationRepository } from '../src/modules/llm-operation/registry/llm-operation.repository';
import type { LlmOperationAttestationRecord } from '../src/modules/llm-operation/registry/types';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from '../src/modules/llm-operation/registry/errors';

describe('AttestationService', () => {
  let service: AttestationService;
  let repository: jest.Mocked<LlmOperationRepository>;
  let gateEvaluator: jest.Mocked<GateEvaluatorService>;

  beforeEach(() => {
    repository = {
      findVersionById: jest.fn(),
      findOperationById: jest.fn(),
      findOperationByKey: jest.fn(),
      findApprovedVersionByOperationKeyAndVersion: jest.fn(),
      listVersionsByOperationId: jest.fn(),
      insertAttestation: jest.fn(),
      findLatestAttestationForVersion: jest.fn(),
      listAttestationsByVersionId: jest.fn(),
    } as any;

    gateEvaluator = {
      evaluate: jest.fn(),
    } as any;

    const logger = new Logger();
    service = new AttestationService(repository, gateEvaluator, logger);
  });

  describe('generateAttestation', () => {
    it('should write to llm_operation_attestations table when all gates pass', async () => {
      repository.findVersionById.mockResolvedValue({
        id: 'v1',
        operationId: 'op1',
        version: '1.0.0',
        state: 'approved',
        manifestJson: {},
        operationDigest: 'odigest',
        contractDigest: 'cdigest',
        changeSummary: '',
        source: 'admin_created',
        approvedBy: null,
        approvedAt: null,
        createdBy: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      gateEvaluator.evaluate.mockReturnValue({
        gateResults: {
          schemaTests: 'passed',
          offlineEvals: 'passed',
          liveEvals: 'passed',
          securityEvals: 'passed',
        },
        violations: [],
      });

      const mockAttestation: LlmOperationAttestationRecord = {
        id: 'att-123',
        operationId: 'op1',
        versionId: 'v1',
        operationDigest: 'odigest',
        contractDigest: 'cdigest',
        evalSuiteDigest: null,
        validatorVersion: '1.0.0',
        schemaTests: 'passed',
        offlineEvals: 'passed',
        liveEvals: 'passed',
        securityEvals: 'passed',
        gateResultsJson: {},
        createdBy: 'system',
        createdAt: new Date(),
      };

      repository.insertAttestation.mockResolvedValue(mockAttestation);

      const result = await service.generateAttestation({
        operationId: 'op1',
        versionId: 'v1',
        fixtureResult: {
          totalCases: 5,
          passed: 5,
          failed: 0,
          results: [],
        },
      });

      expect(repository.insertAttestation).toHaveBeenCalledWith({
        operationId: 'op1',
        versionId: 'v1',
        operationDigest: 'odigest',
        contractDigest: 'cdigest',
        evalSuiteDigest: null,
        validatorVersion: '1.0.0',
        schemaTests: 'passed',
        offlineEvals: 'passed',
        liveEvals: 'passed',
        securityEvals: 'passed',
        gateResultsJson: expect.any(Object),
        createdBy: 'system',
      });

      expect(result.id).toBe('att-123');
      expect(result.operationId).toBe('op1');
      expect(result.versionId).toBe('v1');
    });

    it('should reject skipped gates', async () => {
      repository.findVersionById.mockResolvedValue({
        id: 'v1',
        operationId: 'op1',
        version: '1.0.0',
        state: 'approved',
        manifestJson: {},
        operationDigest: 'odigest',
        contractDigest: 'cdigest',
        changeSummary: '',
        source: 'admin_created',
        approvedBy: null,
        approvedAt: null,
        createdBy: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      gateEvaluator.evaluate.mockReturnValue({
        gateResults: {
          schemaTests: 'passed',
          offlineEvals: 'skipped',
          liveEvals: 'passed',
          securityEvals: 'skipped',
        },
        violations: ['Gate skipped'],
      });

      await expect(
        service.generateAttestation({
          operationId: 'op1',
          versionId: 'v1',
          fixtureResult: {
            totalCases: 5,
            passed: 5,
            failed: 0,
            results: [],
          },
        }),
      ).rejects.toThrow(LlmOperationError);

      await expect(
        service.generateAttestation({
          operationId: 'op1',
          versionId: 'v1',
          fixtureResult: {
            totalCases: 5,
            passed: 5,
            failed: 0,
            results: [],
          },
        }),
      ).rejects.toHaveProperty('code', LLM_OPERATION_ERROR_CODES.ATTESTATION_INVALID);

      expect(repository.insertAttestation).not.toHaveBeenCalled();
    });

    it('should throw error when gate evaluation fails', async () => {
      repository.findVersionById.mockResolvedValue({
        id: 'v1',
        operationId: 'op1',
        version: '1.0.0',
        state: 'approved',
        manifestJson: {},
        operationDigest: 'odigest',
        contractDigest: 'cdigest',
        changeSummary: '',
        source: 'admin_created',
        approvedBy: null,
        approvedAt: null,
        createdBy: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      gateEvaluator.evaluate.mockReturnValue({
        gateResults: {
          schemaTests: 'failed',
          offlineEvals: 'passed',
          liveEvals: 'skipped',
          securityEvals: 'skipped',
        },
        violations: ['Schema tests failed'],
      });

      await expect(
        service.generateAttestation({
          operationId: 'op1',
          versionId: 'v1',
          fixtureResult: {
            totalCases: 5,
            passed: 3,
            failed: 2,
            results: [],
          },
        }),
      ).rejects.toThrow(LlmOperationError);

      await expect(
        service.generateAttestation({
          operationId: 'op1',
          versionId: 'v1',
          fixtureResult: {
            totalCases: 5,
            passed: 3,
            failed: 2,
            results: [],
          },
        }),
      ).rejects.toHaveProperty('code', LLM_OPERATION_ERROR_CODES.ATTESTATION_INVALID);

      expect(repository.insertAttestation).not.toHaveBeenCalled();
    });

    it('should throw error when version not found', async () => {
      repository.findVersionById.mockResolvedValue(null);

      await expect(
        service.generateAttestation({
          operationId: 'op1',
          versionId: 'v-nonexistent',
          fixtureResult: {
            totalCases: 5,
            passed: 5,
            failed: 0,
            results: [],
          },
        }),
      ).rejects.toThrow(LlmOperationError);

      expect(repository.insertAttestation).not.toHaveBeenCalled();
    });
  });

  describe('hasValidAttestation', () => {
    it('should return true when all gates passed', async () => {
      repository.findVersionById.mockResolvedValue({
        id: 'v1',
        operationId: 'op1',
        operationDigest: 'odigest',
        contractDigest: 'cdigest',
      } as any);
      repository.findLatestAttestationForVersion.mockResolvedValue({
        id: 'att-1',
        versionId: 'v1',
        operationId: 'op1',
        operationDigest: 'odigest',
        contractDigest: 'cdigest',
        evalSuiteDigest: null,
        validatorVersion: '1.0.0',
        schemaTests: 'passed',
        offlineEvals: 'passed',
        liveEvals: 'passed',
        securityEvals: 'passed',
        gateResultsJson: {},
        createdBy: 'system',
        createdAt: new Date(),
      });

      const result = await service.hasValidAttestation('v1');

      expect(result).toBe(true);
    });

    it('should return false when no attestation exists', async () => {
      repository.findLatestAttestationForVersion.mockResolvedValue(null);

      const result = await service.hasValidAttestation('v1');

      expect(result).toBe(false);
    });

    it('should return false when any gate failed', async () => {
      repository.findLatestAttestationForVersion.mockResolvedValue({
        id: 'att-1',
        versionId: 'v1',
        operationId: 'op1',
        operationDigest: 'odigest',
        contractDigest: 'cdigest',
        evalSuiteDigest: null,
        validatorVersion: '1.0.0',
        schemaTests: 'passed',
        offlineEvals: 'failed',
        liveEvals: 'passed',
        securityEvals: 'passed',
        gateResultsJson: {},
        createdBy: 'system',
        createdAt: new Date(),
      });

      const result = await service.hasValidAttestation('v1');

      expect(result).toBe(false);
    });
  });

  describe('listAttestations', () => {
    it('should return attestation array for operation', async () => {
      repository.findOperationById.mockResolvedValue({
        id: 'op1',
      } as any);

      repository.listVersionsByOperationId.mockResolvedValue([
        { id: 'v1' } as any,
        { id: 'v2' } as any,
      ]);

      repository.listAttestationsByVersionId.mockImplementation(async (versionId: string) => {
        if (versionId === 'v1') {
          return [
            {
              id: 'att-1',
              versionId: 'v1',
              operationId: 'op1',
              operationDigest: 'odigest1',
              contractDigest: 'cdigest1',
              evalSuiteDigest: null,
              validatorVersion: '1.0.0',
              schemaTests: 'passed',
              offlineEvals: 'passed',
              liveEvals: 'passed',
              securityEvals: 'passed',
              gateResultsJson: {},
              createdBy: 'system',
              createdAt: new Date('2024-01-01'),
            },
          ];
        }
        if (versionId === 'v2') {
          return [
            {
              id: 'att-2',
              versionId: 'v2',
              operationId: 'op1',
              operationDigest: 'odigest2',
              contractDigest: 'cdigest2',
              evalSuiteDigest: null,
              validatorVersion: '1.0.0',
              schemaTests: 'passed',
              offlineEvals: 'passed',
              liveEvals: 'passed',
              securityEvals: 'passed',
              gateResultsJson: {},
              createdBy: 'system',
              createdAt: new Date('2024-02-01'),
            },
          ];
        }
        return [];
      });

      const result = await service.listAttestations('op1');

      expect(result.length).toBe(2);
      expect(result[0].versionId).toBe('v2');
      expect(result[1].versionId).toBe('v1');
    });

    it('should return empty array when operation not found', async () => {
      repository.findOperationById.mockResolvedValue(null);

      const result = await service.listAttestations('nonexistent');

      expect(result).toEqual([]);
    });
  });
});
