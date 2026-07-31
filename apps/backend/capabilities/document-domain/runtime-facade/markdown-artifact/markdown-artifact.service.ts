import { Injectable, Logger, BadRequestException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { ArtifactRef } from '@ops/backend-runtime-capability-contract';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Find the workspace root by traversing upward from startDir.
 * Checks for common monorepo root markers: pnpm-lock.yaml, .git directory, or docker-compose.yml.
 */
function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(current, 'pnpm-lock.yaml'))) {
      return current;
    }
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    if (fs.existsSync(path.join(current, 'docker-compose.yml'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
}

// Path configuration - prefer explicit env vars over computed defaults
const WORKSPACE_ROOT = process.env.PROJECT_ROOT || findWorkspaceRoot(process.cwd());
const BASE_OUTPUT_DIR = process.env.STORAGE_RENDER_DIR 
  || process.env.MEDIA_STORAGE_PATH 
  || path.join(WORKSPACE_ROOT, 'apps', 'backend', 'var', 'outputs', 'document-engine', 'renders');

/**
 * RENDERS_DIR: Primary and only storage location for markdown artifacts.
 * - Production/Docker: Set via STORAGE_RENDER_DIR env var
 * - Test: Uses .tmp/renders relative to cwd
 */
const RENDERS_DIR = process.env.NODE_ENV === 'test'
  ? path.join(process.cwd(), '.tmp', 'renders')
  : BASE_OUTPUT_DIR;

@Injectable()
export class MarkdownArtifactService {
  private readonly logger = new Logger(MarkdownArtifactService.name);
  private readonly idempotencyCache = new Map<string, ArtifactRef>();

  constructor() {
    try {
      if (!fs.existsSync(RENDERS_DIR)) {
        fs.mkdirSync(RENDERS_DIR, { recursive: true });
        this.logger.log(`Created renders directory: ${RENDERS_DIR}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to create renders directory: ${RENDERS_DIR}`, error.stack);
      throw new InternalServerErrorException(`Failed to initialize renders directory: ${error.message}`);
    }
  }

  /**
   * Create or retrieve a markdown artifact with idempotency support.
   * 
   * Idempotency behavior:
   * - If idempotencyKey is provided and file exists with matching sha256 → returns existing artifact
   * - If idempotencyKey is provided and file exists with different sha256 → throws ConflictException
   * - If idempotencyKey is provided but file missing (cache-only entry) → throws error (stale cache)
   * - If no idempotencyKey → creates new artifact with uuid-based filename
   * 
   * @throws BadRequestException - empty content or size limit exceeded
   * @throws ConflictException - idempotency key collision with different content
   * @throws InternalServerErrorException - I/O errors or stale cache entries
   */
  public async createMarkdownArtifact(input: {
    content: string;
    fileName?: string;
    skillId?: string;
    publishedSkillId?: string;
    idempotencyKey?: string;
  }): Promise<{
    artifact: ArtifactRef;
    sizeBytes: number;
    sha256: string;
  }> {
    if (!input.content || typeof input.content !== 'string' || input.content.trim().length === 0) {
      throw new BadRequestException('Markdown content cannot be empty');
    }

    const contentBuffer = Buffer.from(input.content, 'utf8');
    if (contentBuffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Markdown content exceeds maximum size limit of 5MB (${contentBuffer.length} bytes)`
      );
    }

    const newSha256 = crypto.createHash('sha256').update(contentBuffer).digest('hex');

    // Use uuid-based filename for stability across restarts (not Date.now())
    const rawFileName = input.fileName || `summary_${uuidv4().substring(0, 8)}`;
    const baseName = path.basename(rawFileName).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const nameWithoutExt = baseName.replace(/\.[^/.]+$/, '').substring(0, 100);
    const finalFileName = `${nameWithoutExt || 'summary'}.md`;

    const fileId = input.idempotencyKey
      ? crypto.createHash('sha256').update(input.idempotencyKey).digest('hex').substring(0, 32)
      : uuidv4();

    const diskFileName = `${fileId}.md`;
    const filePath = path.join(RENDERS_DIR, diskFileName);

    const fileExists = fs.existsSync(filePath);
    const cacheHasEntry = input.idempotencyKey ? this.idempotencyCache.has(input.idempotencyKey) : false;

    if (fileExists || cacheHasEntry) {
      return this.handleExistingArtifact(input, contentBuffer, newSha256, filePath, fileId, finalFileName);
    }

    return this.createNewArtifact(input, contentBuffer, newSha256, filePath, fileId, finalFileName);
  }

  /**
   * Handle existing artifact lookup for idempotency.
   * Throws error on stale cache entries (cache hit but file missing).
   */
  private async handleExistingArtifact(
    input: { content: string; fileName?: string; skillId?: string; publishedSkillId?: string; idempotencyKey?: string },
    contentBuffer: Buffer,
    newSha256: string,
    filePath: string,
    fileId: string,
    finalFileName: string
  ): Promise<{ artifact: ArtifactRef; sizeBytes: number; sha256: string }> {
    const fileExists = fs.existsSync(filePath);
    const cacheHasEntry = input.idempotencyKey ? this.idempotencyCache.has(input.idempotencyKey) : false;

    // Stale cache state: cache has entry but file doesn't exist - must not silently use new content
    if (!fileExists && cacheHasEntry) {
      const cachedEntry = this.idempotencyCache.get(input.idempotencyKey!);
      this.logger.error(
        `Stale idempotency cache entry: key='${input.idempotencyKey}', ` +
        `file='${filePath}' missing, cache has artifact id='${cachedEntry?.id}'`
      );
      throw new InternalServerErrorException(
        `Idempotency cache inconsistency: key '${input.idempotencyKey}' references missing file. ` +
        `Please retry with a new idempotency key or contact support.`
      );
    }

    // Read existing file content
    let existingBuffer: Buffer;
    try {
      existingBuffer = fs.readFileSync(filePath);
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to read existing artifact file: ${filePath}`, error.stack);
      throw new InternalServerErrorException(`Failed to read existing artifact: ${error.message}`);
    }

    const existingSha256 = crypto.createHash('sha256').update(existingBuffer).digest('hex');

    // Idempotency check: content hash must match
    if (existingSha256 !== newSha256) {
      this.logger.warn(
        `Idempotency key collision: key='${input.idempotencyKey}', ` +
        `existingSha256='${existingSha256}', newSha256='${newSha256}'`
      );
      throw new ConflictException(
        `Idempotency key collision for '${input.idempotencyKey}': ` +
        `new payload sha256 (${newSha256}) does not match existing artifact sha256 (${existingSha256})`
      );
    }

    // Content matches - return existing artifact
    const stat = fs.statSync(filePath);
    const externalBase = (process.env.CARBONE_EXTERNAL_URL || '').replace(/\/+$/, '');
    const downloadUrl = externalBase
      ? `${externalBase}/renders/${fileId}.md`
      : `/renders/${fileId}.md`;

    const artifact: ArtifactRef = {
      type: 'document',
      id: fileId,
      name: finalFileName,
      url: downloadUrl,
      mimeType: 'text/markdown; charset=utf-8',
      sizeBytes: stat.size,
      metadata: {
        format: 'md',
        sha256: existingSha256,
        ...(input.skillId ? { skillId: input.skillId } : {}),
        ...(input.publishedSkillId ? { publishedSkillId: input.publishedSkillId } : {}),
      },
    };

    if (input.idempotencyKey) {
      this.idempotencyCache.set(input.idempotencyKey, artifact);
    }

    this.logger.log(
      `Idempotent hit: returning existing artifact for key='${input.idempotencyKey}' ` +
      `at ${filePath} (${stat.size} bytes)`
    );

    return { artifact, sizeBytes: stat.size, sha256: existingSha256 };
  }

  /**
   * Create a new markdown artifact on disk.
   */
  private async createNewArtifact(
    input: { content: string; fileName?: string; skillId?: string; publishedSkillId?: string; idempotencyKey?: string },
    contentBuffer: Buffer,
    newSha256: string,
    filePath: string,
    fileId: string,
    finalFileName: string
  ): Promise<{ artifact: ArtifactRef; sizeBytes: number; sha256: string }> {
    try {
      await fs.promises.writeFile(filePath, contentBuffer);
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to write artifact file: ${filePath}`, error.stack);
      throw new InternalServerErrorException(`Failed to write artifact: ${error.message}`);
    }

    const externalBase = (process.env.CARBONE_EXTERNAL_URL || '').replace(/\/+$/, '');
    const downloadUrl = externalBase
      ? `${externalBase}/renders/${fileId}.md`
      : `/renders/${fileId}.md`;
    const sizeBytes = contentBuffer.length;

    this.logger.log(
      `Created new markdown artifact '${finalFileName}' (${sizeBytes} bytes) at ${filePath}`
    );

    const artifact: ArtifactRef = {
      type: 'document',
      id: fileId,
      name: finalFileName,
      url: downloadUrl,
      mimeType: 'text/markdown; charset=utf-8',
      sizeBytes,
      metadata: {
        format: 'md',
        sha256: newSha256,
        ...(input.skillId ? { skillId: input.skillId } : {}),
        ...(input.publishedSkillId ? { publishedSkillId: input.publishedSkillId } : {}),
      },
    };

    if (input.idempotencyKey) {
      this.idempotencyCache.set(input.idempotencyKey, artifact);
    }

    return { artifact, sizeBytes, sha256: newSha256 };
  }
}