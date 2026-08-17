import { LlmOperationAttestationClient } from '../src/modules/execution/plan-runtime/llm-operation-attestation.client';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../src/config/service-endpoints';

jest.mock('axios');
jest.mock('../src/config/service-endpoints');

describe('LlmOperationAttestationClient', () => {
  let client: LlmOperationAttestationClient;
  const mockAxios = axios as jest.Mocked<typeof axios>;
  const mockGetAiOrchestratorUrl = getAiOrchestratorUrl as jest.Mock;

  beforeEach(() => {
    client = new LlmOperationAttestationClient();
    mockGetAiOrchestratorUrl.mockReturnValue('http://ai-orchestrator:3007');
    jest.clearAllMocks();
  });

  describe('hasValidAttestation', () => {
    it('returns true when attestation is valid', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { valid: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await client.hasValidAttestation('version-123');

      expect(result).toBe(true);
      expect(mockAxios.get).toHaveBeenCalledWith(
        'http://ai-orchestrator:3007/ai/internal/operations/attestations/version-123',
        {
          timeout: 5000,
          headers: { 'X-Internal-Service': 'control-plane' },
        },
      );
    });

    it('returns false when attestation is invalid', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { valid: false },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await client.hasValidAttestation('version-123');

      expect(result).toBe(false);
    });

    it('throws error on HTTP timeout (fail-closed)', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('timeout of 5000ms exceeded'));

      await expect(client.hasValidAttestation('version-123')).rejects.toThrow(
        'LLM_OPERATION_ATTESTATION_INVALID',
      );
    });

    it('throws error on HTTP 5xx (fail-closed)', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Request failed with status code 500'));

      await expect(client.hasValidAttestation('version-123')).rejects.toThrow(
        'LLM_OPERATION_ATTESTATION_INVALID',
      );
    });

    it('constructs correct URL with encodeURIComponent', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { valid: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      await client.hasValidAttestation('version/with/slashes');

      expect(mockAxios.get).toHaveBeenCalledWith(
        'http://ai-orchestrator:3007/ai/internal/operations/attestations/version%2Fwith%2Fslashes',
        expect.any(Object),
      );
    });
  });

  describe('hasValidAttestationForVersion', () => {
    it('returns true when attestation is valid', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { valid: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await client.hasValidAttestationForVersion('summarize_text', '1');

      expect(result).toBe(true);
      expect(mockAxios.get).toHaveBeenCalledWith(
        'http://ai-orchestrator:3007/ai/internal/operations/attestations/summarize_text/1',
        {
          timeout: 5000,
          headers: { 'X-Internal-Service': 'control-plane' },
        },
      );
    });

    it('returns false when attestation is invalid', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { valid: false },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await client.hasValidAttestationForVersion('summarize_text', '1');

      expect(result).toBe(false);
    });

    it('throws error on network failure (fail-closed)', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Network Error'));

      await expect(
        client.hasValidAttestationForVersion('summarize_text', '1'),
      ).rejects.toThrow('LLM_OPERATION_ATTESTATION_INVALID');
    });

    it('constructs correct URL with encodeURIComponent', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { valid: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      await client.hasValidAttestationForVersion('operation/id', 'v1.0');

      expect(mockAxios.get).toHaveBeenCalledWith(
        'http://ai-orchestrator:3007/ai/internal/operations/attestations/operation%2Fid/v1.0',
        expect.any(Object),
      );
    });
  });
});