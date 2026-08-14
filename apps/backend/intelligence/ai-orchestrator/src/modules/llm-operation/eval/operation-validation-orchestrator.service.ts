import { Inject, Injectable } from '@nestjs/common';
import {
  LLM_OPERATION_REPOSITORY,
  type LlmOperationRepository,
} from '../registry/llm-operation.repository';
import type {
  LlmOperationRecord,
  LlmOperationVersionRecord,
} from '../registry/types';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from '../registry/errors';
import {
  OperationManifestValidatorService,
  type ManifestValidationReport,
} from './operation-manifest-validator.service';
import { FixtureRunnerService } from './fixture-runner.service';
import { EvalRunnerService } from './eval-runner.service';
import { AttestationService } from './attestation.service';
import type {
  EvalRunResult,
  FixtureBundle,
  FixtureRunSummary,
  OperationAttestation,
} from './types';

export interface OperationValidationResult {
  manifest: ManifestValidationReport;
  fixture: FixtureRunSummary;
  eval: EvalRunResult;
  attestation: OperationAttestation;
  suite: {
    id: string;
    digest: string;
    name: string;
  };
}

@Injectable()
export class OperationValidationOrchestratorService {
  constructor(
    @Inject(LLM_OPERATION_REPOSITORY)
    private readonly repository: LlmOperationRepository,
    private readonly manifestValidator: OperationManifestValidatorService,
    private readonly fixtureRunner: FixtureRunnerService,
    private readonly evalRunner: EvalRunnerService,
    private readonly attestationService: AttestationService,
  ) {}

  public async validate(params: {
    operation: LlmOperationRecord;
    version: LlmOperationVersionRecord;
    actor: string;
  }): Promise<OperationValidationResult> {
    const manifest = this.manifestValidator.validate(params.version.manifestJson);
    const suite = await this.repository.findEvalSuiteForVersion(
      params.operation.id,
      params.version.id,
    );
    if (!suite) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.VALIDATION_FAILED,
        `No Eval Suite is configured for ${params.operation.operationKey}@${params.version.version}`,
        { operationKey: params.operation.operationKey, version: params.version.version },
      );
    }

    const cases = await this.repository.findEvalCasesBySuiteId(suite.id);
    const bundle: FixtureBundle = {
      operationId: params.operation.operationKey,
      cases: cases.map((testCase) => ({
        name: testCase.name,
        input: testCase.inputJson,
        expectedOutput: testCase.expectedJson || undefined,
        isNegative: testCase.isNegative,
        errorContains: testCase.errorContains || undefined,
      })),
    };
    const coverage = this.fixtureRunner.validateBundleCoverage(bundle);
    if (!coverage.ok) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.VALIDATION_FAILED,
        `Eval Suite coverage is incomplete: ${coverage.missingCategories.join(', ')}`,
        { suiteId: suite.id, missingCategories: coverage.missingCategories },
      );
    }

    const fixture = await this.fixtureRunner.runFixturesForExactVersion(
      bundle,
      params.operation.operationKey,
      params.version.version,
    );
    if (fixture.failed > 0) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.VALIDATION_FAILED,
        `Fixture validation failed: ${fixture.failed}/${fixture.totalCases} cases failed`,
        { suiteId: suite.id, fixture },
      );
    }

    const evalResult = await this.evalRunner.runEvalAndWait({
      operationKey: params.operation.operationKey,
      version: params.version.version,
      suiteId: suite.id,
      actor: params.actor,
    });

    const attestation = await this.attestationService.generateAttestation({
      operationId: params.operation.id,
      versionId: params.version.id,
      fixtureResult: fixture,
      evalResult,
      evalSuiteDigest: suite.suiteDigest,
      actor: params.actor,
    });

    return {
      manifest,
      fixture,
      eval: evalResult,
      attestation,
      suite: { id: suite.id, digest: suite.suiteDigest, name: suite.name },
    };
  }
}
