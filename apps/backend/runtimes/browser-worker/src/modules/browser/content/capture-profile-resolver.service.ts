import { Injectable } from '@nestjs/common';
import {
  type CaptureProfileName,
  type CaptureProfileV1,
  validateCaptureProfileV1,
} from '@ops/backend-browser-execution-contract';

@Injectable()
export class CaptureProfileResolverService {
  resolve(value: unknown): CaptureProfileV1 {
    if (validateCaptureProfileV1(value).valid) return value as CaptureProfileV1;
    const profileName =
      typeof value === 'string'
        ? value
        : typeof value === 'object' && value && 'profile' in value && typeof (value as any).profile === 'string'
          ? (value as any).profile
          : 'article';
    return this.defaultProfile(
      ['article', 'application', 'audit', 'raw'].includes(profileName)
        ? (profileName as CaptureProfileName)
        : 'article'
    );
  }

  defaultProfile(profile: CaptureProfileName): CaptureProfileV1 {
    const mainContent = profile !== 'raw';
    return {
      schemaVersion: 'capture-profile/v1', profile,
      capture: { screenshot: true, html: true, snapshot: profile === 'audit' || profile === 'application', mainContent },
      limits: { htmlBytes: 1_000_000, contentChars: profile === 'audit' ? 60_000 : 30_000, tableCells: profile === 'audit' ? 2_000 : 500 },
      ...(mainContent ? { content: { preserveHeadings: true, preserveLinks: false, preserveTables: profile === 'audit', preserveCodeBlocks: true } } : {}),
    };
  }

  /**
   * A recorder can declare several page aliases.  Resolve only the profile
   * matching the observed page; an unmatched page deliberately produces no
   * extracted body instead of silently applying an arbitrary profile.
   */
  resolveForPage(
    value: unknown,
    page: { url?: string; title?: string },
  ): CaptureProfileV1 | undefined {
    const record = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
    const profiles = Array.isArray(record?.profiles) ? record?.profiles : undefined;
    if (!profiles) return this.resolve(value);
    for (const item of profiles) {
      const candidate = item && typeof item === 'object' && !Array.isArray(item)
        ? item as Record<string, unknown>
        : undefined;
      const profile = candidate?.captureProfile;
      if (!profile || !this.matches(candidate?.match, page)) continue;
      return this.resolve(profile);
    }
    return undefined;
  }

  private matches(value: unknown, page: { url?: string; title?: string }): boolean {
    const match = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    const urlPattern = typeof match.urlPattern === 'string' ? match.urlPattern : undefined;
    const titlePattern = typeof match.titlePattern === 'string' ? match.titlePattern : undefined;
    if (!urlPattern && !titlePattern) return true;
    return this.matchesPattern(urlPattern, page.url) && this.matchesPattern(titlePattern, page.title);
  }

  private matchesPattern(pattern: string | undefined, value: string | undefined): boolean {
    if (!pattern) return true;
    if (!value) return false;
    try { return new RegExp(pattern, 'u').test(value); } catch { return false; }
  }
}
