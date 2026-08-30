import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LLM_OPERATION_TEMPLATES } from '../llm-operation.registry';
import {
  buildOperationManifest,
  computeOperationContractDigest,
  computeOperationDigestFromManifest,
} from '../operation-manifest.util';
import type { LlmOperationIdV1 } from '@ops/backend-deterministic-plan';
import type { Prisma } from '../../prisma/client';
import { buildSystemEvalFixtures } from './system-operation-eval-fixtures';
import { SYSTEM_OPERATION_DEFINITIONS } from '../system-operation-definitions';

export const SYSTEM_OPERATION_VERSION = '1.0.27';

export async function seedSystemLlmOperations(
  prisma: PrismaService,
  logger: Logger
): Promise<{ created: string[]; skipped: string[]; failed: string[] }> {
  const result = {
    created: [] as string[],
    skipped: [] as string[],
    failed: [] as string[],
  };

  const operationIds = Object.keys(LLM_OPERATION_TEMPLATES).sort() as LlmOperationIdV1[];

  for (const operationId of operationIds) {
    try {
      const template = LLM_OPERATION_TEMPLATES[operationId];
      const metadata = SYSTEM_OPERATION_DEFINITIONS[operationId];

      if (!metadata) {
        logger.warn(`No metadata found for operation ${operationId}, skipping`);
        result.skipped.push(operationId);
        continue;
      }

      let operation = await prisma.llmOperation.findUnique({
        where: { operationKey: operationId },
      });

      if (!operation) {
        operation = await prisma.llmOperation.create({
          data: {
            operationKey: operationId,
            displayName: metadata.displayName,
            description: metadata.description,
            owner: 'system',
            status: metadata.status,
            source: 'system_seed',
          },
        });
        logger.log(`Created operation: ${operationId}`);
      } else {
        if (
          operation.source === 'system_seed' &&
          (operation.displayName !== metadata.displayName ||
            operation.description !== metadata.description ||
            operation.status !== metadata.status)
        ) {
          operation = await prisma.llmOperation.update({
            where: { id: operation.id },
            data: {
              displayName: metadata.displayName,
              description: metadata.description,
              status: metadata.status,
            },
          });
          logger.log(`Updated system operation metadata: ${operationId}`);
        }
        logger.debug(`Operation already exists: ${operationId}`);
      }

      // Deprecated operations remain addressable by their historical exact
      // versions so frozen plans keep working, but they receive no new system
      // version and never return to the planning catalog.
      if (metadata.status !== 'active') {
        result.skipped.push(operationId);
        continue;
      }

      const versionNumber = SYSTEM_OPERATION_VERSION;
      const manifestJson = buildOperationManifest(operationId, template, versionNumber);
      const operationDigest = computeOperationDigestFromManifest(manifestJson, versionNumber);
      const contractDigest = computeOperationContractDigest(
        operationId,
        versionNumber,
        manifestJson
      );

      let version = await prisma.llmOperationVersion.findUnique({
        where: {
          operationId_version: {
            operationId: operation.id,
            version: versionNumber,
          },
        },
      });

      if (!version) {
        version = await prisma.llmOperationVersion.create({
          data: {
            operationId: operation.id,
            version: versionNumber,
            // System versions must pass the same validation/attestation gates as
            // admin-created versions before they can become approved.  The
            // bootstrap reconciler promotes and activates the version only after
            // a digest-bound attestation exists.
            state: 'candidate',
            manifestJson: manifestJson as Prisma.InputJsonValue,
            operationDigest: operationDigest,
            contractDigest,
            changeSummary: 'Separate plain business text generation from runtime protocol wrapping',
            source: 'system_seed',
            approvedBy: null,
            approvedAt: null,
            createdBy: 'system',
          },
        });
        logger.log(`Created version ${versionNumber} for operation: ${operationId}`);
      } else {
        if (version.operationDigest !== operationDigest) {
          const error = `Digest mismatch for ${operationId}@${versionNumber}: existing=${version.operationDigest}, new=${operationDigest}`;
          logger.error(error);
          throw new Error(error);
        }
        logger.debug(`Version already exists: ${operationId}@${versionNumber}`);
      }

      const fixtureBundle = buildSystemEvalFixtures(operationId, manifestJson);
      const existingSuite = await prisma.llmOperationEvalSuite.findFirst({
        where: {
          operationId: operation.id,
          versionId: null,
          name: 'system-baseline',
        },
      });
      if (!existingSuite) {
        await prisma.llmOperationEvalSuite.create({
          data: {
            operationId: operation.id,
            versionId: null,
            name: 'system-baseline',
            description: 'System baseline: positive schema case plus four negative guard cases',
            suiteDigest: fixtureBundle.digest,
            createdBy: 'system',
            cases: {
              create: fixtureBundle.cases.map((fixture) => ({
                ...fixture,
                inputJson: fixture.inputJson as Prisma.InputJsonValue,
                expectedJson:
                  fixture.expectedJson === null
                    ? undefined
                    : (fixture.expectedJson as Prisma.InputJsonValue),
              })),
            },
          },
        });
        logger.log(`Created system Eval Suite for: ${operationId}`);
      } else if (existingSuite.suiteDigest !== fixtureBundle.digest) {
        // The baseline suite is derived data generated from the current
        // templates — when the generation logic changes (e.g. an operation
        // switched to oversize 'truncate' drops its over-budget case), the
        // stored suite is reconciled to the new derivation instead of failing.
        await prisma.llmOperationEvalSuite.update({
          where: { id: existingSuite.id },
          data: {
            suiteDigest: fixtureBundle.digest,
            cases: {
              deleteMany: {},
              create: fixtureBundle.cases.map((fixture) => ({
                ...fixture,
                inputJson: fixture.inputJson as Prisma.InputJsonValue,
                expectedJson:
                  fixture.expectedJson === null
                    ? undefined
                    : (fixture.expectedJson as Prisma.InputJsonValue),
              })),
            },
          },
        });
        logger.log(`Reconciled system Eval Suite for: ${operationId}`);
      }

      result.created.push(operationId);
    } catch (error) {
      logger.error(
        `Failed to seed operation ${operationId}: ${error instanceof Error ? error.message : String(error)}`
      );
      result.failed.push(operationId);
      throw error;
    }
  }

  return result;
}
