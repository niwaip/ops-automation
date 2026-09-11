import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

const DEFAULT_RETENTION_HOURS = 48;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class BrowserArtifactCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserArtifactCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly artifactDir =
    process.env.PLAYWRIGHT_CLI_ARTIFACT_DIR?.trim() ||
    path.join(process.cwd(), 'temp', 'playwright-cli-artifacts');

  onModuleInit(): void {
    const retentionHours = parseInt(process.env.ARTIFACT_RETENTION_HOURS || '', 10) || DEFAULT_RETENTION_HOURS;
    this.logger.log(
      `BrowserArtifactCleanupService initialized. Artifact retention: ${retentionHours}h, target dir: ${this.artifactDir}`
    );

    // Initial pass on startup
    this.cleanupOldArtifacts().catch((err) => {
      this.logger.warn(`Initial artifact cleanup failed: ${err.message}`);
    });

    // Scheduled periodic pass
    this.timer = setInterval(() => {
      this.cleanupOldArtifacts().catch((err) => {
        this.logger.warn(`Periodic artifact cleanup failed: ${err.message}`);
      });
    }, DEFAULT_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Scan artifact directory and remove files older than retention threshold.
   */
  async cleanupOldArtifacts(): Promise<{ removedCount: number; scannedCount: number }> {
    const retentionHours = parseInt(process.env.ARTIFACT_RETENTION_HOURS || '', 10) || DEFAULT_RETENTION_HOURS;
    const maxAgeMs = retentionHours * 3600 * 1000;
    const now = Date.now();

    let removedCount = 0;
    let scannedCount = 0;

    try {
      await fs.access(this.artifactDir);
    } catch {
      // Directory doesn't exist yet, nothing to clean
      return { removedCount: 0, scannedCount: 0 };
    }

    try {
      const entries = await fs.readdir(this.artifactDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        scannedCount++;

        const filePath = path.join(this.artifactDir, entry.name);
        try {
          const stats = await fs.stat(filePath);
          const ageMs = now - stats.mtimeMs;

          if (ageMs > maxAgeMs) {
            await fs.unlink(filePath);
            removedCount++;
          }
        } catch {
          // File might have been removed concurrently
        }
      }

      if (removedCount > 0) {
        this.logger.log(`Pruned ${removedCount} expired artifacts (scanned: ${scannedCount}, retention: ${retentionHours}h)`);
      }
    } catch (err: any) {
      this.logger.warn(`Failed during artifact cleanup: ${err.message}`);
    }

    return { removedCount, scannedCount };
  }
}
