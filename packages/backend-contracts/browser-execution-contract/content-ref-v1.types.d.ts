import type { CaptureProfileName } from './capture-profile-v1.types';
export interface ContentRefV1 {
    schemaVersion: 'content-ref/v1';
    contentId: string;
    resultRefId: string;
    artifactId?: string;
    pageId: string;
    sourceUrl: string;
    finalUrl: string;
    title?: string;
    language?: string;
    mediaType: 'text/markdown' | 'text/plain' | 'application/json';
    extraction: {
        profile: CaptureProfileName;
        method: 'readability' | 'semantic-main' | 'density' | 'visible-text' | 'none';
        confidence: number;
        fallbackLevel: number;
        extractedAt: string;
    };
    integrity: {
        sha256: string;
        chars: number;
        bytes: number;
        truncated: boolean;
    };
    safety: {
        activeContentRemoved: boolean;
        suspectedPromptInjection: boolean;
        untrustedExternalContent: true;
    };
    preview: string;
}
//# sourceMappingURL=content-ref-v1.types.d.ts.map