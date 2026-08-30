import { Injectable, Logger } from '@nestjs/common';
import { ExecuteStepDto, ExecuteStepResultDto } from '../../../dto/worker.dto';
import { BrowserPostActionStateService } from './browser-post-action-state.service';
import { BrowserStepEvidenceCollectorService } from './browser-step-evidence-collector.service';
import { BrowserContentExtractionService } from '../content/browser-content-extraction.service';
import { CaptureProfileResolverService } from '../content/capture-profile-resolver.service';
import { BrowserContentQualityService } from '../content/browser-content-quality.service';

@Injectable()
export class BrowserStepResultEnricherService {
  private readonly logger = new Logger(BrowserStepResultEnricherService.name);

  constructor(
    private readonly postActionState: BrowserPostActionStateService,
    private readonly evidenceCollector: BrowserStepEvidenceCollectorService,
    private readonly contentExtraction: BrowserContentExtractionService,
    private readonly captureProfiles: CaptureProfileResolverService,
    private readonly contentQuality: BrowserContentQualityService
  ) {}

  async enrich(input: {
    dto: ExecuteStepDto;
    result: ExecuteStepResultDto;
    inspect: () => Promise<import('../../../dto/worker.dto').BrowserPageStateDto>;
  }): Promise<ExecuteStepResultDto> {
    const postAction = await this.postActionState.observe(input);
    const evidence = await this.evidenceCollector.collect({
      dto: input.dto,
      result: input.result,
      pageUrl: postAction.pageState?.pageUrl,
    });
    const output = { ...(input.result.output || {}) } as Record<string, any>;
    let contentQuality: ReturnType<BrowserContentQualityService['evaluate']> | undefined;
    if (
      (process.env.BROWSER_CONTENT_EXTRACTION_ENABLED !== 'false' ||
        (input.dto.captureProfile as any)?.capture?.mainContent === true) &&
      input.dto.captureProfile
    ) {
      const html =
        typeof output.html === 'string'
          ? output.html
          : typeof output.data?.html === 'string'
            ? output.data.html
            : undefined;
      const captureProfile = this.captureProfiles.resolveForPage(input.dto.captureProfile, {
        url: postAction.pageState?.pageUrl,
        title: postAction.pageState?.pageTitle,
      });
      if (captureProfile) {
        const extracted = html
          ? this.contentExtraction.extract(html, captureProfile)
          : {
              text: '',
              profile: captureProfile.profile,
              method: 'visible-text' as const,
              confidence: 0,
              fallbackLevel: 3,
              truncated: false,
              activeContentRemoved: false,
              suspectedPromptInjection: false,
            };
        contentQuality = this.contentQuality.evaluate(extracted, captureProfile);
        this.logger.log(
          `Enrich step ${input.dto.stepId}: htmlLen=${html?.length || 0}, profile=${captureProfile.profile}, extractedLen=${extracted.text.length}, method=${extracted.method}, confidence=${extracted.confidence}, qualityPassed=${contentQuality.passed}, qualityDetails=${JSON.stringify(contentQuality)}, extractedTextSample=${JSON.stringify(extracted.text.slice(0, 300))}`
        );
        try {
          if (html) {
            require('fs').writeFileSync('/tmp/last-enrich-html.html', html);
          }
        } catch {}
        output.contentQuality = contentQuality;
        if (extracted.text && postAction.pageState?.pageUrl) {
          output.text = extracted.text;
          output.contentCandidate = {
            sourceStepId: input.dto.stepId,
            sourceUrl: postAction.pageState.pageUrl,
            finalUrl: postAction.pageState.pageUrl,
            title: postAction.pageState.pageTitle,
            captureProfile,
            ...extracted,
          };
        }
      }
    }
    this.removeUnselectedInlineResults(output, input.dto.captureProfile);
    const contentQualityFailed = contentQuality?.passed === false;
    const postCheck = contentQuality
      ? {
          ...(postAction.postCheck || { inspected: true, evidence: [] }),
          evidence: [
            ...(postAction.postCheck?.evidence || []),
            {
              code: 'main_content_chars',
              passed: contentQuality.actualChars >= contentQuality.minChars,
              expected: contentQuality.minChars,
              actual: contentQuality.actualChars,
            },
            {
              code: 'main_content_confidence',
              passed: contentQuality.actualConfidence >= contentQuality.minConfidence,
              expected: contentQuality.minConfidence,
              actual: contentQuality.actualConfidence,
            },
          ],
        }
      : postAction.postCheck;
    return {
      ...input.result,
      ...postAction,
      ...(contentQualityFailed && input.result.success
        ? {
            success: false,
            executionState: 'failed' as const,
            errorCode: 'CONTENT_NOT_READY',
            errorMessage: '页面正文未达到步骤的内容质量契约',
          }
        : {}),
      ...(postCheck ? { postCheck } : {}),
      output,
      artifacts: evidence.artifacts,
      warningCodes: [
        ...(input.result.warningCodes || []),
        ...(postAction.warningCodes || []),
        ...evidence.warningCodes,
        ...(contentQualityFailed ? ['CONTENT_QUALITY_FAILED'] : []),
      ],
    };
  }

  private removeUnselectedInlineResults(
    output: Record<string, any>,
    captureProfile: Record<string, unknown> | undefined
  ): void {
    const profile =
      captureProfile && typeof captureProfile === 'object'
        ? (captureProfile as Record<string, any>)
        : undefined;
    const capture = profile?.capture;
    if (!capture || typeof capture !== 'object') return;
    const data = output.data && typeof output.data === 'object' ? output.data : undefined;
    if (capture.screenshot !== true) {
      delete output.screenshot;
      delete output.screenshotPath;
      if (data) delete data.screenshotPath;
    }
    if (capture.html !== true) {
      delete output.html;
      if (data) delete data.html;
    }
    if (capture.snapshot !== true) delete output.snapshot;
  }
}
