import { Controller, Get, Param } from '@nestjs/common';
import { AttestationService } from './attestation.service';
import type { OperationAttestation } from './types';

@Controller('ai/internal/operations/attestations')
export class AttestationController {
  constructor(private readonly attestationService: AttestationService) {}

  @Get(':versionId')
  async getAttestation(
    @Param('versionId') versionId: string,
  ): Promise<{ valid: boolean; attestation?: OperationAttestation | null }> {
    const valid = await this.attestationService.hasValidAttestation(versionId);
    return { valid };
  }

  @Get(':operationKey/:version')
  async getAttestationForVersion(
    @Param('operationKey') operationKey: string,
    @Param('version') version: string,
  ): Promise<{ valid: boolean; attestation?: OperationAttestation | null }> {
    const valid = await this.attestationService.hasValidAttestationForVersion(operationKey, version);
    if (!valid) return { valid: false };

    const attestation = await this.attestationService.getLatestAttestation(operationKey, version);
    return { valid: true, attestation };
  }
}