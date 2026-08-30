export type CaptureProfileName = 'article' | 'application' | 'audit' | 'raw';
export interface BrowserPageReadinessV1 {
    waitUntil?: 'domcontentloaded' | 'networkidle';
    timeoutMs?: number;
    stableMs?: number;
    selector?: string;
    minCount?: number;
    /** Total navigation attempts when requested content is not yet usable. */
    maxAttempts?: number;
    /** Delay before repeating a failed navigation attempt. */
    retryDelayMs?: number;
}
export interface BrowserContentQualityV1 {
    minChars?: number;
    minConfidence?: number;
}
export interface CaptureProfileV1 {
    schemaVersion: 'capture-profile/v1';
    profile: CaptureProfileName;
    capture: {
        screenshot: boolean;
        html: boolean;
        snapshot: boolean;
        mainContent: boolean;
    };
    limits: {
        htmlBytes: number;
        contentChars: number;
        tableCells: number;
    };
    content?: {
        preserveHeadings: boolean;
        preserveLinks: boolean;
        preserveTables: boolean;
        preserveCodeBlocks: boolean;
    };
    /** Generic post-action readiness. Selectors belong to templates, never the runtime. */
    readiness?: BrowserPageReadinessV1;
    /** Minimum deterministic extraction quality required before downstream processing. */
    quality?: BrowserContentQualityV1;
}
//# sourceMappingURL=capture-profile-v1.types.d.ts.map