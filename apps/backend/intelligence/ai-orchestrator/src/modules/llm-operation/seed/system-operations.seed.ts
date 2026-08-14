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

export const SYSTEM_OPERATION_VERSION = '1.0.4';

const OPERATION_METADATA = {
  summarize_list: {
    displayName: '列表摘要',
    description: '对列表文本、搜索结果或文章项集合做精炼要点总结',
    owner: 'system',
  },
  rewrite_to_markdown: {
    displayName: 'Markdown 格式化',
    description: '将结构化或非结构化内容重写格式化为干净规范的 Markdown 文本',
    owner: 'system',
  },
  summarize_text: {
    displayName: '文本摘要',
    description: '对长文本段落做关键摘要提取',
    owner: 'system',
  },
  extract_structured_fields: {
    displayName: '结构化字段提取',
    description: '从非结构化文本中提取结构化 JSON 字段',
    owner: 'system',
  },
  classify_intent_label: {
    displayName: '意图标签分类',
    description: '对短文本做意图分类标签,返回标签与置信度',
    owner: 'system',
  },
  merge_multi_source_notes: {
    displayName: '多源笔记合并',
    description: '将多个来源的笔记内容合并为一份 Markdown 文档',
    owner: 'system',
  },
};

export async function seedSystemLlmOperations(
  prisma: PrismaService,
  logger: Logger,
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
      const metadata = OPERATION_METADATA[operationId];

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
            owner: metadata.owner,
            status: 'active',
            source: 'system_seed',
          },
        });
        logger.log(`Created operation: ${operationId}`);
      } else {
        logger.debug(`Operation already exists: ${operationId}`);
      }

      const versionNumber = SYSTEM_OPERATION_VERSION;
      const manifestJson = buildOperationManifest(operationId, template, versionNumber);
      const operationDigest = computeOperationDigestFromManifest(manifestJson, versionNumber);
      const contractDigest = computeOperationContractDigest(
        operationId,
        versionNumber,
        manifestJson,
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
            changeSummary: 'Initial system seed',
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
                expectedJson: fixture.expectedJson === null
                  ? undefined
                  : fixture.expectedJson as Prisma.InputJsonValue,
              })),
            },
          },
        });
        logger.log(`Created system Eval Suite for: ${operationId}`);
      } else if (existingSuite.suiteDigest !== fixtureBundle.digest) {
        throw new Error(
          `Eval Suite digest mismatch for ${operationId}: existing=${existingSuite.suiteDigest}, expected=${fixtureBundle.digest}`,
        );
      }

      result.created.push(operationId);
    } catch (error) {
      logger.error(`Failed to seed operation ${operationId}: ${error instanceof Error ? error.message : String(error)}`);
      result.failed.push(operationId);
      throw error;
    }
  }

  return result;
}
