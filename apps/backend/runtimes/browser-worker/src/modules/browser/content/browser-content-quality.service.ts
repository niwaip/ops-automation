import { Injectable } from '@nestjs/common';
import type { CaptureProfileV1 } from '@ops/backend-browser-execution-contract';
import type { ExtractedBrowserContent } from './content-extraction.types';

export type BrowserContentQualityResult = {
  passed: boolean;
  minChars: number;
  minConfidence: number;
  actualChars: number;
  actualConfidence: number;
};

@Injectable()
export class BrowserContentQualityService {
  evaluate(
    extracted: ExtractedBrowserContent,
    profile: CaptureProfileV1
  ): BrowserContentQualityResult {
    if (!profile.capture.mainContent) {
      return {
        passed: true,
        minChars: 0,
        minConfidence: 0,
        actualChars: 0,
        actualConfidence: extracted.confidence,
      };
    }

    const quality = (
      profile as CaptureProfileV1 & {
        quality?: { minChars?: number; minConfidence?: number };
      }
    ).quality;
    const minChars = boundedNumber(
      quality?.minChars,
      profile.profile === 'application' ? 20 : 80,
      0,
      profile.limits.contentChars
    );
    const minConfidence = boundedNumber(quality?.minConfidence, 0.35, 0, 1);
    const actualChars = extracted.text.trim().length;
    return {
      passed: actualChars >= minChars && extracted.confidence >= minConfidence,
      minChars,
      minConfidence,
      actualChars,
      actualConfidence: extracted.confidence,
    };
  }
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? Math.max(minimum, Math.min(maximum, candidate)) : fallback;
}
