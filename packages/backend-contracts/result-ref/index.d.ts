export interface ResultRefV1 {
    schemaVersion: 'result-ref/v1';
    id: string;
    executionId: string;
    producerStepId?: string;
    schemaDigest: string;
    sizeBytes: number;
    preview?: unknown;
}
export declare function projectResultFields(payload: unknown, paths: string[], maxPaths?: number): Record<string, unknown>;
export declare function isResultRefV1(value: unknown): value is ResultRefV1;
//# sourceMappingURL=index.d.ts.map