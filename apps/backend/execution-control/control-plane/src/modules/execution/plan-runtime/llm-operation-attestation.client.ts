import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../../../config/service-endpoints';

/**
 * Control Plane client for querying LLM operation attestations from AI Orchestrator.
 *
 * Phase 2-γ — freeze-time attestation gate:
 * - Before freezing an llm_operation node, Control Plane must verify the version
 *   has passed eval gates and carries a valid attestation.
 * - Fail-closed: network errors, timeouts, or missing attestations reject the freeze.
 */
@Injectable()
export class LlmOperationAttestationClient {
  private readonly logger = new Logger(LlmOperationAttestationClient.name);

  /**
   * Query whether a version has a valid attestation (by versionId).
   */
  public async hasValidAttestation(versionId: string): Promise<boolean> {
    const baseUrl = getAiOrchestratorUrl();
    const url = `${baseUrl}/ai/internal/operations/attestations/${encodeURIComponent(versionId)}`;

    try {
      const response = await axios.get(url, {
        timeout: 5000,
        headers: { 'X-Internal-Service': 'control-plane' },
      });

      const data = response.data as { valid?: boolean };
      return data.valid === true;
    } catch (error: any) {
      this.logger.error(
        `Failed to query attestation for version ${versionId}: ${error.message}`,
      );
      // Fail-closed: treat errors as invalid
      throw new Error(
        `LLM_OPERATION_ATTESTATION_INVALID: Attestation check failed for version ${versionId}`,
      );
    }
  }

  /**
   * Query whether an operation+version has a valid attestation.
   */
  public async hasValidAttestationForVersion(
    operationId: string,
    version: string,
  ): Promise<boolean> {
    const baseUrl = getAiOrchestratorUrl();
    const url = `${baseUrl}/ai/internal/operations/attestations/${encodeURIComponent(operationId)}/${encodeURIComponent(version)}`;

    try {
      const response = await axios.get(url, {
        timeout: 5000,
        headers: { 'X-Internal-Service': 'control-plane' },
      });

      const data = response.data as { valid?: boolean };
      return data.valid === true;
    } catch (error: any) {
      this.logger.error(
        `Failed to query attestation for operation ${operationId} version ${version}: ${error.message}`,
      );
      // Fail-closed: treat errors as invalid
      throw new Error(
        `LLM_OPERATION_ATTESTATION_INVALID: Attestation check failed for operation ${operationId} version ${version}`,
      );
    }
  }
}