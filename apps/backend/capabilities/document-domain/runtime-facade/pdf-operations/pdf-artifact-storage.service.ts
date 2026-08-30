import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { ArtifactRef } from '@ops/backend-runtime-capability-contract';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const MAX_PDF_OUTPUT_BYTES = 40 * 1024 * 1024;
const ARTIFACT_LOCK_TIMEOUT_MS = 5_000;
const STALE_ARTIFACT_LOCK_MS = 60_000;

interface PdfArtifactSidecar {
  requestDigest: string;
  sha256: string;
  name: string;
  sizeBytes: number;
  metadata: Record<string, unknown>;
}

export interface StorePdfArtifactInput {
  bytes: Uint8Array | Buffer;
  fileName: string;
  idempotencyKey: string;
  requestDigest: string;
  artifactSuffix?: string;
  metadata: Record<string, unknown>;
}

export interface StoredPdfArtifact {
  artifact: ArtifactRef;
  sha256: string;
  sizeBytes: number;
}

@Injectable()
export class PdfArtifactStorageService {
  async store(input: StorePdfArtifactInput): Promise<StoredPdfArtifact> {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException('idempotencyKey is required for PDF artifact creation');
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(input.requestDigest)) {
      throw new BadRequestException('requestDigest must be a canonical SHA-256 digest');
    }

    const bytes = Buffer.from(input.bytes);
    if (bytes.length === 0 || bytes.toString('ascii', 0, 5) !== '%PDF-') {
      throw new BadRequestException('Generated artifact is not a valid PDF document');
    }
    if (bytes.length > MAX_PDF_OUTPUT_BYTES) {
      throw new BadRequestException('Generated PDF exceeds the 40MB artifact limit');
    }

    const rendersDir = this.resolveRendersDirectory();
    await fs.promises.mkdir(rendersDir, { recursive: true });

    const suffix = input.artifactSuffix?.trim() || 'primary';
    const fileId = crypto
      .createHash('sha256')
      .update(`${input.idempotencyKey}:${suffix}`)
      .digest('hex')
      .substring(0, 32);
    const diskFileName = `${fileId}.pdf`;
    const filePath = path.join(rendersDir, diskFileName);
    const sidecarPath = `${filePath}.meta.json`;
    const lockPath = `${filePath}.lock`;
    const finalName = this.sanitizePdfFileName(input.fileName);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

    if (fs.existsSync(filePath) || fs.existsSync(sidecarPath)) {
      return this.readExisting({
        filePath,
        sidecarPath,
        fileId,
        expectedRequestDigest: input.requestDigest,
      });
    }

    const releaseLock = await this.acquireArtifactLock(lockPath);
    let createdFile = false;
    let createdSidecar = false;
    try {
      if (fs.existsSync(filePath) || fs.existsSync(sidecarPath)) {
        return await this.readExisting({
          filePath,
          sidecarPath,
          fileId,
          expectedRequestDigest: input.requestDigest,
        });
      }
      const sidecar: PdfArtifactSidecar = {
        requestDigest: input.requestDigest,
        sha256,
        name: finalName,
        sizeBytes: bytes.length,
        metadata: { ...input.metadata, format: 'pdf', sha256 },
      };
      await this.writeAtomically(filePath, bytes);
      createdFile = true;
      await this.writeAtomically(sidecarPath, Buffer.from(JSON.stringify(sidecar), 'utf8'));
      createdSidecar = true;
      return {
        artifact: this.buildArtifact(fileId, sidecar),
        sha256,
        sizeBytes: bytes.length,
      };
    } catch (error) {
      if (createdFile) await fs.promises.unlink(filePath).catch(() => undefined);
      if (createdSidecar) await fs.promises.unlink(sidecarPath).catch(() => undefined);
      if (error instanceof ConflictException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to persist PDF artifact: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      await releaseLock();
    }
  }

  private async readExisting(input: {
    filePath: string;
    sidecarPath: string;
    fileId: string;
    expectedRequestDigest: string;
  }): Promise<StoredPdfArtifact> {
    if (!fs.existsSync(input.filePath) || !fs.existsSync(input.sidecarPath)) {
      throw new InternalServerErrorException(
        `Incomplete PDF artifact state for id '${input.fileId}'`
      );
    }

    let sidecar: PdfArtifactSidecar;
    let bytes: Buffer;
    try {
      sidecar = JSON.parse(await fs.promises.readFile(input.sidecarPath, 'utf8'));
      bytes = await fs.promises.readFile(input.filePath);
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to read existing PDF artifact: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (sidecar.requestDigest !== input.expectedRequestDigest) {
      throw new ConflictException('Idempotency key was already used with a different PDF request');
    }

    const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actualSha256 !== sidecar.sha256 || bytes.length !== sidecar.sizeBytes) {
      throw new InternalServerErrorException(
        `Stored PDF artifact '${input.fileId}' failed integrity verification`
      );
    }
    return {
      artifact: this.buildArtifact(input.fileId, sidecar),
      sha256: sidecar.sha256,
      sizeBytes: sidecar.sizeBytes,
    };
  }

  private buildArtifact(fileId: string, sidecar: PdfArtifactSidecar): ArtifactRef {
    const externalBase = (process.env.CARBONE_EXTERNAL_URL || '').replace(/\/+$/, '');
    return {
      type: 'document',
      id: fileId,
      name: sidecar.name,
      url: externalBase ? `${externalBase}/renders/${fileId}.pdf` : `/renders/${fileId}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: sidecar.sizeBytes,
      metadata: sidecar.metadata,
    };
  }

  private sanitizePdfFileName(value: string): string {
    const baseName = path.basename(value || 'document.pdf').replace(/[^a-zA-Z0-9._\-\u3400-\u9fff]/g, '_');
    const withoutExtension = baseName.replace(/\.pdf$/i, '').substring(0, 100) || 'document';
    return `${withoutExtension}.pdf`;
  }

  private resolveRendersDirectory(): string {
    if (process.env.STORAGE_RENDER_DIR) return process.env.STORAGE_RENDER_DIR;
    if (process.env.MEDIA_STORAGE_PATH) return process.env.MEDIA_STORAGE_PATH;
    if (process.env.NODE_ENV === 'test') return path.join(process.cwd(), '.tmp', 'renders');
    const projectRoot = process.env.PROJECT_ROOT || process.cwd();
    return path.join(
      projectRoot,
      'apps',
      'backend',
      'var',
      'outputs',
      'document-engine',
      'renders'
    );
  }

  private async writeAtomically(filePath: string, bytes: Buffer): Promise<void> {
    const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(tempPath, bytes, { flag: 'wx' });
      await fs.promises.rename(tempPath, filePath);
    } finally {
      await fs.promises.unlink(tempPath).catch(() => undefined);
    }
  }

  private async acquireArtifactLock(lockPath: string): Promise<() => Promise<void>> {
    const deadline = Date.now() + ARTIFACT_LOCK_TIMEOUT_MS;
    while (true) {
      try {
        const handle = await fs.promises.open(lockPath, 'wx');
        await handle.writeFile(`${process.pid}:${Date.now()}`, 'utf8');
        return async () => {
          await handle.close().catch(() => undefined);
          await fs.promises.unlink(lockPath).catch(() => undefined);
        };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST') throw error;

        const stat = await fs.promises.stat(lockPath).catch(() => undefined);
        if (stat && Date.now() - stat.mtimeMs > STALE_ARTIFACT_LOCK_MS) {
          await fs.promises.unlink(lockPath).catch(() => undefined);
          continue;
        }
        if (Date.now() >= deadline) {
          throw new ConflictException('PDF artifact is already being created for this idempotency key');
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
  }
}
