import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { ArtifactRefDto } from '../../../dto/worker.dto';

export class BrowserArtifactRefFactory {
  private readonly artifactDir = path.resolve(
    process.env.PLAYWRIGHT_CLI_ARTIFACT_DIR ||
      path.join(process.cwd(), 'temp', 'playwright-cli-artifacts')
  );

  async fromExistingFile(input: {
    executionId: string;
    runtimeSessionId: string;
    stepId: string;
    attempt: number;
    kind: 'screenshot' | 'snapshot';
    sourcePath: string;
    pageUrl?: string;
  }): Promise<ArtifactRefDto> {
    const sourcePath = path.resolve(input.sourcePath || '');
    const name = path.basename(sourcePath);
    if (!name || path.dirname(sourcePath) !== this.artifactDir) {
      throw new Error('Artifact source path must resolve inside the browser artifact directory');
    }
    const resolvedPath = path.resolve(this.artifactDir, name);
    if (path.dirname(resolvedPath) !== this.artifactDir) throw new Error('Invalid artifact source path');
    const content = await fs.readFile(resolvedPath);
    const sha256 = createHash('sha256').update(content).digest('hex');
    return this.buildRef({ ...input, name, sha256, sizeBytes: content.byteLength });
  }

  async fromHtml(input: {
    executionId: string;
    runtimeSessionId: string;
    stepId: string;
    attempt: number;
    html: string;
    pageUrl?: string;
    truncated?: boolean;
  }): Promise<ArtifactRefDto> {
    await fs.mkdir(this.artifactDir, { recursive: true });
    const content = Buffer.from(input.html, 'utf8');
    const sha256 = createHash('sha256').update(content).digest('hex');
    const id = this.stableId(input.executionId, input.stepId, input.attempt, 'html', sha256);
    const name = `${id}.html`;
    await fs.writeFile(path.join(this.artifactDir, name), content);
    return this.buildRef({
      ...input,
      kind: 'html',
      name,
      sha256,
      sizeBytes: content.byteLength,
    });
  }

  private buildRef(input: {
    executionId: string;
    runtimeSessionId: string;
    stepId: string;
    attempt: number;
    kind: 'screenshot' | 'snapshot' | 'html';
    name: string;
    sha256: string;
    sizeBytes: number;
    pageUrl?: string;
    truncated?: boolean;
  }): ArtifactRefDto {
    const id = this.stableId(input.executionId, input.stepId, input.attempt, input.kind, input.sha256);
    return {
      id,
      type: input.kind === 'screenshot' ? 'browser_page_screenshot' : input.kind === 'html' ? 'browser_page_html' : 'browser_snapshot',
      name: input.name,
      url: this.publicArtifactUrl(input.name),
      mimeType: input.kind === 'screenshot' ? 'image/png' : input.kind === 'html' ? 'text/html' : 'application/yaml',
      sizeBytes: input.sizeBytes,
      metadata: {
        runtimeSessionId: input.runtimeSessionId,
        executionId: input.executionId,
        stepId: input.stepId,
        attempt: input.attempt,
        kind: input.kind,
        sha256: input.sha256,
        ...(input.pageUrl ? { pageUrl: input.pageUrl } : {}),
        ...(input.truncated !== undefined ? { truncated: input.truncated } : {}),
      },
    };
  }

  private stableId(executionId: string, stepId: string, attempt: number, kind: string, contentHash: string): string {
    return createHash('sha256')
      .update(`${executionId}|${stepId}|${attempt}|${kind}|${contentHash}`)
      .digest('hex')
      .slice(0, 32);
  }

  private publicArtifactUrl(name: string): string {
    const base = (process.env.BROWSER_WORKER_PUBLIC_BASE_URL || '').replace(/\/$/u, '');
    const resource = `/browser/artifacts/${encodeURIComponent(name)}`;
    return base ? `${base}${resource}` : resource;
  }
}
