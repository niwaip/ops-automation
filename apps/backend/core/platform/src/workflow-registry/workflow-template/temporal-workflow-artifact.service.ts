import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma, TemporalWorkflow } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseJson } from '../../modules/temporal-workflow/temporal-workflow-json.utils';
import type { TemporalWorkflowValidationStatus } from '../../modules/temporal-workflow/temporal-workflow.types';

@Injectable()
export class TemporalWorkflowArtifactService {
  private readonly logger = new Logger(TemporalWorkflowArtifactService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureArtifactInfrastructure(): Promise<void> {
    const statements = [
      `ALTER TABLE temporal_workflows
       ADD COLUMN IF NOT EXISTS artifact_version integer NOT NULL DEFAULT 0`,
      `ALTER TABLE temporal_workflows
       ADD COLUMN IF NOT EXISTS artifact_hash varchar(128) NULL`,
      `ALTER TABLE temporal_workflows
       ADD COLUMN IF NOT EXISTS validation_status varchar(32) NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE temporal_workflows
       ADD COLUMN IF NOT EXISTS validation_score integer NOT NULL DEFAULT 0`,
      `ALTER TABLE temporal_workflows
       ADD COLUMN IF NOT EXISTS validation_result_json jsonb NULL`,
      `ALTER TABLE temporal_workflows
       ADD COLUMN IF NOT EXISTS validated_at timestamptz NULL`,
      `CREATE INDEX IF NOT EXISTS idx_temporal_workflows_validation_status
       ON temporal_workflows(validation_status)`,
      `CREATE INDEX IF NOT EXISTS idx_temporal_workflows_validated_at
       ON temporal_workflows(validated_at DESC)`,
    ];

    for (const statement of statements) {
      await this.prisma.$executeRawUnsafe(statement);
    }
  }

  async repairLegacyArtifactMetadataOnStartup(): Promise<void> {
    const workflows = await this.prisma.temporalWorkflow.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    let repairedCount = 0;

    for (const workflow of workflows) {
      const repaired = await this.repairWorkflowArtifactMetadataIfNeeded(workflow);
      if (repaired !== workflow) {
        repairedCount += 1;
      }
    }

    if (repairedCount > 0) {
      this.logger.log(`Repaired ${repairedCount} temporal workflow artifact metadata record(s)`);
    }
  }

  async repairWorkflowArtifactMetadataIfNeeded(
    workflow: TemporalWorkflow
  ): Promise<TemporalWorkflow> {
    const patch = this.buildLegacyArtifactMetadataPatch(workflow);
    if (!patch) {
      return workflow;
    }

    return this.prisma.temporalWorkflow.update({
      where: { id: workflow.id },
      data: patch,
    });
  }

  getCurrentArtifactVersion(workflow: { artifactVersion?: number | null } | null | undefined): number {
    return Number(workflow?.artifactVersion || 0);
  }

  computeArtifactHash(code: string): string {
    return `sha256:${createHash('sha256').update(code).digest('hex')}`;
  }

  private buildLegacyArtifactMetadataPatch(
    workflow: TemporalWorkflow
  ): Prisma.TemporalWorkflowUpdateInput | null {
    const generatedCode =
      typeof workflow.generatedCode === 'string' ? workflow.generatedCode.trim() : '';
    const validationResult =
      parseJson<Record<string, unknown>>(workflow.validationResultJson) || {};
    const validationSuccess =
      typeof validationResult.success === 'boolean' ? validationResult.success : undefined;
    const validationScore =
      typeof validationResult.score === 'number' ? validationResult.score : undefined;
    const persistedArtifactVersion = Number((workflow as any).artifactVersion || 0);
    const persistedValidationScore = Number((workflow as any).validationScore || 0);
    const persistedValidationStatus =
      typeof (workflow as any).validationStatus === 'string'
        ? String((workflow as any).validationStatus).trim()
        : '';
    const hasValidatedAt = Boolean((workflow as any).validatedAt);

    const derivedArtifactVersion = generatedCode ? Math.max(persistedArtifactVersion, 1) : 0;
    const derivedArtifactHash = generatedCode ? this.computeArtifactHash(generatedCode) : null;
    const derivedValidationStatus: TemporalWorkflowValidationStatus =
      validationSuccess === true || hasValidatedAt
        ? 'validated'
        : validationSuccess === false
          ? 'failed'
          : generatedCode
            ? 'generated'
            : 'draft';
    const derivedValidationScore =
      validationScore !== undefined
        ? validationScore
        : validationSuccess === true
          ? 100
          : generatedCode
            ? persistedValidationScore
            : 0;

    const patch: Prisma.TemporalWorkflowUpdateInput = {};

    if (generatedCode && persistedArtifactVersion <= 0) {
      patch.artifactVersion = derivedArtifactVersion as any;
    }
    if (
      generatedCode &&
      (!workflow.artifactHash || workflow.artifactHash !== derivedArtifactHash)
    ) {
      patch.artifactHash = derivedArtifactHash as any;
    }
    if (persistedValidationStatus !== derivedValidationStatus) {
      patch.validationStatus = derivedValidationStatus as any;
    }
    if (persistedValidationScore !== derivedValidationScore) {
      patch.validationScore = derivedValidationScore as any;
    }
    if (derivedValidationStatus === 'validated' && !hasValidatedAt) {
      patch.validatedAt = workflow.updatedAt || new Date();
    }

    return Object.keys(patch).length > 0 ? patch : null;
  }
}
