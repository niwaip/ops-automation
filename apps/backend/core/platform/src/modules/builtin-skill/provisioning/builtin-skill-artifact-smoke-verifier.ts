import axios from 'axios';
import * as crypto from 'crypto';
import { getCarboneServiceUrl } from '../../../config/service-endpoints';

export const ARTIFACT_SMOKE_HANDLER_KEYS = new Set([
  'document.markdown-artifact-writer',
  'document.pdf.merge',
  'document.pdf.split',
  'document.pdf.create',
]);

interface SmokeArtifact {
  id?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
}

export async function verifyBuiltinArtifactSmoke(input: {
  handlerKey: string;
  smokeResult: any;
  rerun: () => Promise<any>;
}): Promise<void> {
  const output = input.smokeResult?.output || input.smokeResult;
  const artifacts = normalizeArtifacts(output);
  verifyOperationContract(input.handlerKey, output, artifacts);

  for (const artifact of artifacts) {
    await verifyDownloadedArtifact(artifact);
  }

  const secondResult = await input.rerun();
  const secondOutput = secondResult?.output || secondResult;
  const secondArtifacts = normalizeArtifacts(secondOutput);
  const firstIdentity = artifacts.map((artifact) => [
    artifact.id,
    artifact.url,
    artifact.metadata?.sha256,
  ]);
  const secondIdentity = secondArtifacts.map((artifact) => [
    artifact.id,
    artifact.url,
    artifact.metadata?.sha256,
  ]);
  if (JSON.stringify(firstIdentity) !== JSON.stringify(secondIdentity)) {
    throw new Error('Smoke test idempotency verification produced different artifacts');
  }
}

function normalizeArtifacts(output: any): SmokeArtifact[] {
  const artifacts = Array.isArray(output?.artifacts)
    ? output.artifacts
    : output?.artifact
      ? [output.artifact]
      : [];
  if (artifacts.length === 0) {
    throw new Error('Smoke test output contract is missing artifacts');
  }
  for (const artifact of artifacts) {
    if (
      !artifact ||
      typeof artifact.url !== 'string' ||
      typeof artifact.sizeBytes !== 'number' ||
      artifact.sizeBytes <= 0 ||
      typeof artifact.metadata?.sha256 !== 'string'
    ) {
      throw new Error('Smoke test output contains an invalid ArtifactRef');
    }
  }
  return artifacts;
}

function verifyOperationContract(handlerKey: string, output: any, artifacts: SmokeArtifact[]): void {
  if (
    handlerKey.startsWith('document.pdf.') &&
    artifacts.some((artifact) => artifact.mimeType !== 'application/pdf')
  ) {
    throw new Error('PDF smoke output must contain only application/pdf artifacts');
  }
  switch (handlerKey) {
    case 'document.pdf.merge':
      if (output.operation !== 'merge' || output.pageCount !== 4 || output.inputCount !== 2) {
        throw new Error('PDF merge smoke output does not match the expected four-page result');
      }
      if (artifacts.length !== 1) throw new Error('PDF merge smoke must produce one artifact');
      break;
    case 'document.pdf.split':
      if (
        output.operation !== 'split' ||
        output.pageCount !== 2 ||
        JSON.stringify(output.selectedPages) !== JSON.stringify([1, 2]) ||
        artifacts.length !== 2
      ) {
        throw new Error('PDF split smoke output does not match the expected two-page selection');
      }
      break;
    case 'document.pdf.create':
      if (output.operation !== 'create' || !Number.isInteger(output.pageCount) || output.pageCount < 1) {
        throw new Error('PDF create smoke output does not contain a generated page');
      }
      if (artifacts.length !== 1) throw new Error('PDF create smoke must produce one artifact');
      break;
  }
}

async function verifyDownloadedArtifact(artifact: SmokeArtifact): Promise<void> {
  const baseUrl = getCarboneServiceUrl().replace(/\/+$/, '');
  const artifactUrl = new URL(artifact.url as string, `${baseUrl}/`);
  if (!/^\/((api\/)?renders)\/[a-zA-Z0-9._-]+$/.test(artifactUrl.pathname)) {
    throw new Error('Smoke test artifact URL is outside the controlled renders path');
  }
  const downloadUrl = `${baseUrl}${artifactUrl.pathname}`;
  try {
    const response = await axios.get<ArrayBuffer>(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 15_000,
    });
    const bytes = Buffer.from(response.data);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== artifact.metadata?.sha256) {
      throw new Error('SHA-256 mismatch for ' + downloadUrl);
    }
    if (bytes.length !== artifact.sizeBytes) {
      throw new Error('size mismatch for ' + downloadUrl);
    }
  } catch (error) {
    throw new Error(
      'Smoke test artifact download/verification failed: ' +
        (error instanceof Error ? error.message : String(error))
    );
  }
}
