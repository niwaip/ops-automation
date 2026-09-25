export declare const trimTrailingSlash: (value: string) => string;
export declare const stripWrappingQuotes: (value: string) => string;
export declare const sanitizeHost: (value?: string) => string | undefined;
export declare const isContainerRuntime: () => boolean;
export declare const readConfiguredUrl: (...candidates: Array<string | undefined>) => string | undefined;
export declare const getPublicHost: () => string;
export declare const getStandardServiceUrl: (envUrlVar: string, containerHost: string, port: number, fallbackEnvVars?: string[]) => string;
//# sourceMappingURL=service-endpoints.d.ts.map