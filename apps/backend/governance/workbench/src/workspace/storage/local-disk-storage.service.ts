import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { StorageDriver } from './storage-driver.interface';

@Injectable()
export class LocalDiskStorageService implements StorageDriver {
  private readonly logger = new Logger(LocalDiskStorageService.name);
  private readonly rootDir: string;

  constructor() {
    // When running in container, process.cwd() is /workspace/apps/backend/core/platform or /workspace.
    // Try multiple possible paths to locate /workspace/data/storage/workspaces or host-mounted path.
    const candidates = [
      process.env.WORKSPACE_STORAGE_ROOT,
      '/workspace/data/storage/workspaces',
      path.resolve(process.cwd(), '../../../../data/storage/workspaces'),
      path.resolve(process.cwd(), 'data/storage/workspaces'),
    ].filter(Boolean) as string[];

    let resolved = candidates[0];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        resolved = cand;
        break;
      }
    }

    this.rootDir = resolved;
    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
    }
    this.logger.log(`LocalDiskStorageService initialized at: ${this.rootDir}`);
  }

  public getAbsolutePath(storageKey: string): string {
    const safeKey = path.normalize(storageKey).replace(/^(\.\.[\/\\])+/, '');
    return path.join(this.rootDir, safeKey);
  }

  public async putFile(storageKey: string, data: Buffer): Promise<void> {
    const fullPath = this.getAbsolutePath(storageKey);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(fullPath, data);
  }

  public async getFile(storageKey: string): Promise<Buffer> {
    const fullPath = this.getAbsolutePath(storageKey);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException(`File not found at: ${storageKey}`);
    }
    return await fs.promises.readFile(fullPath);
  }

  public async deleteFile(storageKey: string): Promise<void> {
    const fullPath = this.getAbsolutePath(storageKey);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath).catch((err) => {
        this.logger.warn(`Failed to unlink file ${fullPath}: ${err.message}`);
      });
    }
  }

  public async exists(storageKey: string): Promise<boolean> {
    const fullPath = this.getAbsolutePath(storageKey);
    return fs.existsSync(fullPath);
  }
}
