import { Injectable } from '@nestjs/common';
import { ArtifactRefDto, ExecuteStepDto, ExecuteStepResultDto } from '../../../dto/worker.dto';
import { BrowserArtifactRefFactory } from './browser-artifact-ref.factory';

@Injectable()
export class BrowserStepEvidenceCollectorService {
  constructor(private readonly artifactFactory: BrowserArtifactRefFactory) {}

  async collect(input: {
    dto: ExecuteStepDto;
    result: ExecuteStepResultDto;
    pageUrl?: string;
  }): Promise<{ artifacts: ArtifactRefDto[]; warningCodes: string[] }> {
    const warnings: string[] = [];
    const capture = asRecord(asRecord(input.dto.captureProfile)?.capture);
    const selectiveCapture = Boolean(capture);
    const collectScreenshot = !selectiveCapture || capture?.screenshot === true;
    const collectHtml = !selectiveCapture || capture?.html === true;
    const collectSnapshot = !selectiveCapture || capture?.snapshot === true;
    const artifacts = selectiveCapture
      ? []
      : [...(input.result.artifacts || [])];
    const output = asRecord(input.result.output);
    const data = asRecord(output?.data);
    const attempt = Number.isFinite(input.dto.attempt) && (input.dto.attempt || 0) > 0 ? input.dto.attempt! : 1;
    const screenshotPath = firstString(data?.screenshotPath, output?.screenshotPath);
    const html = firstString(output?.html, data?.html);
    const snapshotPath = firstString(asRecord(output?.snapshot)?.path, asRecord(input.result.snapshot?.metadata)?.path);

    if (screenshotPath && collectScreenshot) {
      try {
        artifacts.push(await this.artifactFactory.fromExistingFile({
          executionId: input.dto.executionId,
          runtimeSessionId: input.dto.runtimeSessionId,
          stepId: input.dto.stepId,
          attempt,
          kind: 'screenshot',
          sourcePath: screenshotPath,
          pageUrl: input.pageUrl,
        }));
      } catch {
        warnings.push('SCREENSHOT_CAPTURE_FAILED');
      }
    }
    if (html !== undefined && collectHtml) {
      try {
        artifacts.push(await this.artifactFactory.fromHtml({
          executionId: input.dto.executionId,
          runtimeSessionId: input.dto.runtimeSessionId,
          stepId: input.dto.stepId,
          attempt,
          html,
          pageUrl: input.pageUrl,
          truncated: html.length >= Number(process.env.PLAYWRIGHT_CLI_MAX_HTML_CHARS || 200000),
        }));
      } catch {
        warnings.push('HTML_CAPTURE_FAILED');
      }
    }
    if (snapshotPath && collectSnapshot) {
      try {
        artifacts.push(await this.artifactFactory.fromExistingFile({
          executionId: input.dto.executionId,
          runtimeSessionId: input.dto.runtimeSessionId,
          stepId: input.dto.stepId,
          attempt,
          kind: 'snapshot',
          sourcePath: snapshotPath,
          pageUrl: input.pageUrl,
        }));
      } catch {
        warnings.push('SNAPSHOT_CAPTURE_FAILED');
      }
    }
    return { artifacts: deduplicateArtifacts(artifacts), warningCodes: warnings };
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function deduplicateArtifacts(artifacts: ArtifactRefDto[]): ArtifactRefDto[] {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    const key = artifact.id || `${artifact.type}:${artifact.name || artifact.url || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
