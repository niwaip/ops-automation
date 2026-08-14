import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma, TemporalWorkflow } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseJson } from '../../modules/temporal-workflow/temporal-workflow-json.utils';
import type { TemporalWorkflowValidationStatus } from '../../modules/temporal-workflow/temporal-workflow.types';

export type TemporalWorkflowArtifactValidationBinding = {
  artifactHash: string | null;
  artifactVersion: number;
  evidenceArtifactHash: string | null;
  evidenceArtifactVersion: number | null;
  hasGeneratedCode: boolean;
  isCurrent: boolean;
  validationSuccess: boolean | undefined;
};

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

  inspectValidationBinding(
    workflow: Pick<
      TemporalWorkflow,
      | 'artifactHash'
      | 'artifactVersion'
      | 'generatedCode'
      | 'validatedAt'
      | 'validationResultJson'
      | 'validationStatus'
    >
  ): TemporalWorkflowArtifactValidationBinding {
    const generatedCode = typeof workflow.generatedCode === 'string' ? workflow.generatedCode : '';
    const hasGeneratedCode = generatedCode.trim().length > 0;
    const artifactHash = hasGeneratedCode ? this.computeArtifactHash(generatedCode) : null;
    const artifactVersion = this.getCurrentArtifactVersion(workflow);
    const validationResult =
      parseJson<Record<string, unknown>>(workflow.validationResultJson) || {};
    const validationSuccess =
      typeof validationResult.success === 'boolean' ? validationResult.success : undefined;
    const evidenceArtifactHash =
      typeof validationResult.artifactHash === 'string'
        ? validationResult.artifactHash
        : null;
    const evidenceArtifactVersion =
      typeof validationResult.artifactVersion === 'number' &&
      Number.isInteger(validationResult.artifactVersion)
        ? validationResult.artifactVersion
        : null;

    return {
      artifactHash,
      artifactVersion,
      evidenceArtifactHash,
      evidenceArtifactVersion,
      hasGeneratedCode,
      isCurrent: Boolean(
        hasGeneratedCode &&
          artifactVersion > 0 &&
          workflow.artifactHash === artifactHash &&
          workflow.validationStatus === 'validated' &&
          workflow.validatedAt &&
          validationSuccess === true &&
          evidenceArtifactHash === artifactHash &&
          evidenceArtifactVersion === artifactVersion
      ),
      validationSuccess,
    };
  }

  private buildLegacyArtifactMetadataPatch(
    workflow: TemporalWorkflow
  ): Prisma.TemporalWorkflowUpdateInput | null {
    const generatedCode =
      typeof workflow.generatedCode === 'string' ? workflow.generatedCode : '';
    const hasGeneratedCode = generatedCode.trim().length > 0;
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

    const derivedArtifactVersion = hasGeneratedCode ? Math.max(persistedArtifactVersion, 1) : 0;
    // Artifact identity is always computed from the exact persisted bytes. Trimming here makes
    // validation evidence describe a different artifact whenever generated code ends in a newline.
    const derivedArtifactHash = hasGeneratedCode ? this.computeArtifactHash(generatedCode) : null;
    const evidenceArtifactHash =
      typeof validationResult.artifactHash === 'string'
        ? validationResult.artifactHash
        : null;
    const evidenceArtifactVersion =
      typeof validationResult.artifactVersion === 'number' &&
      Number.isInteger(validationResult.artifactVersion)
        ? validationResult.artifactVersion
        : null;
    const isLegacySuccessfulEvidence =
      validationSuccess === true &&
      evidenceArtifactHash === null &&
      evidenceArtifactVersion === null;
    const isCurrentSuccessfulEvidence =
      validationSuccess === true &&
      (isLegacySuccessfulEvidence ||
        (evidenceArtifactHash === derivedArtifactHash &&
          evidenceArtifactVersion === derivedArtifactVersion));
    const derivedValidationStatus: TemporalWorkflowValidationStatus =
      isCurrentSuccessfulEvidence
        ? 'validated'
        : validationSuccess === false
          ? 'failed'
          : hasGeneratedCode
            ? 'generated'
            : 'draft';
    const derivedValidationScore =
      derivedValidationStatus === 'validated' && validationScore !== undefined
        ? validationScore
        : derivedValidationStatus === 'validated'
          ? 100
          : derivedValidationStatus === 'failed' && validationScore !== undefined
            ? validationScore
            : 0;

    const patch: Prisma.TemporalWorkflowUpdateInput = {};

    if (hasGeneratedCode && persistedArtifactVersion <= 0) {
      patch.artifactVersion = derivedArtifactVersion as any;
    }
    if (
      hasGeneratedCode &&
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
    if (derivedValidationStatus !== 'validated' && hasValidatedAt) {
      patch.validatedAt = null;
    }
    if (isLegacySuccessfulEvidence && derivedArtifactHash) {
      patch.validationResultJson = {
        ...validationResult,
        artifactHash: derivedArtifactHash,
        artifactVersion: derivedArtifactVersion,
      } as any;
    }
    if (!(workflow as any).deployedAt && Boolean((workflow as any).isActive)) {
      patch.isActive = false;
    }

    return Object.keys(patch).length > 0 ? patch : null;
  }
}
