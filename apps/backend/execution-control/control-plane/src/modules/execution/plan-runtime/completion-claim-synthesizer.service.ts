import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface PlannedCompletionClaim {
  claim: string;
  producerNodeId: string;
  evidenceType: 'schema' | 'provider_receipt' | 'artifact';
}

@Injectable()
export class CompletionClaimSynthesizerService {
  constructor(private readonly prisma: PrismaService) {}

  async synthesizeForStep(input: {
    executionId: string;
    step: { id: string; planNodeId?: string | null; outputSchemaJson?: unknown };
    output: Record<string, unknown>;
    plan: unknown;
  }) {
    const planNodeId = input.step.planNodeId || input.step.id;
    const planned = this.readPlannedClaims(input.plan).filter(
      (claim) => claim.producerNodeId === planNodeId
    );
    const satisfied: string[] = [];
    for (const claim of planned) {
      const evidence = await this.buildEvidence(claim, input);
      if (!evidence) continue;
      await this.prisma.executionCompletionClaim.upsert({
        where: {
          executionId_claim_planNodeId: {
            executionId: input.executionId,
            claim: claim.claim,
            planNodeId,
          },
        },
        create: {
          executionId: input.executionId,
          stepId: input.step.id,
          planNodeId,
          claim: claim.claim,
          evidenceType: claim.evidenceType,
          evidenceJson: evidence as any,
          status: 'satisfied',
        },
        update: {
          stepId: input.step.id,
          evidenceType: claim.evidenceType,
          evidenceJson: evidence as any,
          status: 'satisfied',
        },
      });
      satisfied.push(claim.claim);
    }
    return satisfied;
  }

  async assertRequiredClaims(executionId: string, plan: unknown) {
    const required = this.readPlannedClaims(plan);
    if (!required.length) return { satisfied: true, missing: [] as string[] };
    const claims = await this.prisma.executionCompletionClaim.findMany({
      where: { executionId, status: 'satisfied' },
      select: { claim: true, planNodeId: true },
    });
    const satisfiedKeys = new Set(claims.map((item) => `${item.planNodeId}:${item.claim}`));
    const missing = required
      .filter((item) => !satisfiedKeys.has(`${item.producerNodeId}:${item.claim}`))
      .map((item) => item.claim);
    return { satisfied: missing.length === 0, missing };
  }

  private async buildEvidence(
    claim: PlannedCompletionClaim,
    input: {
      executionId: string;
      step: { id: string; outputSchemaJson?: unknown };
      output: Record<string, unknown>;
    }
  ): Promise<Record<string, unknown> | null> {
    if (claim.evidenceType === 'artifact') {
      const artifact = await this.prisma.executionArtifact.findFirst({
        where: { executionId: input.executionId, producerStepId: input.step.id },
        select: { id: true, sha256: true, url: true, mimeType: true },
      });
      return artifact ? { artifact } : null;
    }
    if (claim.evidenceType === 'provider_receipt') {
      const receipt = this.findProviderReceipt(input.output);
      return receipt ? { receipt } : null;
    }
    if (!input.step.outputSchemaJson || !this.hasMeaningfulOutput(input.output)) return null;
    return {
      contractCheck: 'authoritative_output_schema',
      outputFields: Object.keys(input.output).sort(),
    };
  }

  private readPlannedClaims(plan: unknown): PlannedCompletionClaim[] {
    const value = plan && typeof plan === 'object' ? (plan as any).completionClaims : undefined;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is PlannedCompletionClaim =>
        item &&
        typeof item.claim === 'string' &&
        typeof item.producerNodeId === 'string' &&
        ['schema', 'provider_receipt', 'artifact'].includes(item.evidenceType)
    );
  }

  private findProviderReceipt(value: unknown, depth = 0): Record<string, unknown> | null {
    if (depth > 4 || !value || typeof value !== 'object') return null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const receipt = this.findProviderReceipt(item, depth + 1);
        if (receipt) return receipt;
      }
      return null;
    }
    const record = value as Record<string, unknown>;
    const requestId = record.requestId || record.messageId || record.providerRequestId;
    const status = record.providerStatus || record.deliveryStatus || record.status;
    const idempotencyKey = record.idempotencyKey;
    if (requestId && status && idempotencyKey) {
      return { requestId, status, idempotencyKey, provider: record.provider || 'unknown' };
    }
    for (const child of Object.values(record)) {
      const receipt = this.findProviderReceipt(child, depth + 1);
      if (receipt) return receipt;
    }
    return null;
  }

  private hasMeaningfulOutput(output: Record<string, unknown>) {
    return Object.values(output).some((value) => {
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== undefined;
    });
  }
}
