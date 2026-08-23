import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AttestationService } from '../eval/attestation.service';
import { OperationValidationOrchestratorService } from '../eval/operation-validation-orchestrator.service';
import { OperationActivationService } from '../registry/operation-activation.service';
import {
  LLM_OPERATION_REPOSITORY,
  type LlmOperationRepository,
} from '../registry/llm-operation.repository';
import {
  seedSystemLlmOperations,
  SYSTEM_OPERATION_VERSION,
} from './system-operations.seed';
import { listActiveSystemOperationIds } from '../system-operation-definitions';

export interface SystemOperationBootstrapResult {
  ready: string[];
  skipped: string[];
  failed: Array<{ operationId: string; error: string }>;
}

/**
 * Closes the bootstrap gap between system seeding and the freeze-time
 * attestation gate.  Seeding creates immutable manifests and fixture suites;
 * this reconciler runs the normal validation pipeline, then approves and
 * activates only versions carrying a valid digest-bound attestation.
 */
@Injectable()
export class SystemOperationBootstrapService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attestation: AttestationService,
    private readonly validation: OperationValidationOrchestratorService,
    private readonly activation: OperationActivationService,
    @Inject(LLM_OPERATION_REPOSITORY)
    private readonly repository: LlmOperationRepository,
    private readonly logger: Logger,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (process.env.LLM_OPERATION_SYSTEM_BOOTSTRAP_ENABLED !== 'true') {
      this.logger.warn(
        'System LLM Operation bootstrap is disabled; unattested operations remain unavailable',
        'SystemOperationBootstrapService',
      );
      return;
    }

    try {
      await seedSystemLlmOperations(this.prisma, this.logger);
      const result = await this.reconcileSeededOperations();
      if (result.failed.length > 0) {
        this.logger.error(
          `System LLM Operation bootstrap incomplete: ${result.failed
            .map((item) => `${item.operationId}: ${item.error}`)
            .join('; ')}`,
          'SystemOperationBootstrapService',
        );
      } else {
        this.logger.log(
          `System LLM Operation bootstrap ready (${result.ready.length}), unchanged (${result.skipped.length})`,
          'SystemOperationBootstrapService',
        );
      }
    } catch (error) {
      // Keep the service available for administrators to repair provider/model
      // configuration. Planner/catalog and freeze gates remain fail-closed.
      this.logger.error(
        `System LLM Operation bootstrap failed: ${this.readError(error)}`,
        'SystemOperationBootstrapService',
      );
    }
  }

  public async reconcileSeededOperations(): Promise<SystemOperationBootstrapResult> {
    const result: SystemOperationBootstrapResult = {
      ready: [],
      skipped: [],
      failed: [],
    };
    const operationIds = listActiveSystemOperationIds();

    for (const operationId of operationIds) {
      try {
        const operation = await this.repository.findOperationByKey(operationId);
        if (!operation || operation.source !== 'system_seed') {
          throw new Error('system-seeded operation record is missing');
        }
        let version = await this.repository.findVersionByOperationIdAndVersion(
          operation.id,
          SYSTEM_OPERATION_VERSION,
        );
        if (!version || version.source !== 'system_seed') {
          throw new Error(`system-seeded version ${SYSTEM_OPERATION_VERSION} is missing`);
        }

        const alreadyAttested = await this.attestation.hasValidAttestation(version.id);
        if (!alreadyAttested) {
          await this.validation.validate({
            operation,
            version,
            actor: 'system-bootstrap',
          });
          if (!(await this.attestation.hasValidAttestation(version.id))) {
            throw new Error('validation completed without a valid attestation');
          }
        }

        if (version.state !== 'approved') {
          version = await this.repository.updateVersionState(
            version.id,
            'approved',
            'system-bootstrap',
          );
        }

        const currentActivation = await this.repository.findActivationByOperationAndEnv(
          operation.id,
          'production',
        );
        if (!currentActivation || currentActivation.versionId !== version.id) {
          await this.activation.activate({
            operationKey: operationId,
            version: version.version,
            environment: 'production',
            actor: 'system-bootstrap',
            reason: 'System baseline validated and attested',
            label: 'production',
          });
        }

        (alreadyAttested ? result.skipped : result.ready).push(operationId);
      } catch (error) {
        result.failed.push({ operationId, error: this.readError(error) });
      }
    }

    return result;
  }

  private readError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
