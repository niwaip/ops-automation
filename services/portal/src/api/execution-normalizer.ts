type AnyRecord = Record<string, any>;

export interface NormalizedExecutionResult {
  success: boolean;
  score: number;
  error?: string;
  statusCode?: number;
}

interface NormalizeOptions {
  defaultSuccessScore?: number;
  defaultFailureScore?: number;
}

export const normalizeExecutionResult = (
  input: unknown,
  options: NormalizeOptions = {}
): NormalizedExecutionResult => {
  const defaultSuccessScore = options.defaultSuccessScore ?? 100;
  const defaultFailureScore = options.defaultFailureScore ?? 0;

  const source = (input ?? {}) as AnyRecord;
  const nested = (source.result && typeof source.result === 'object' ? source.result : {}) as AnyRecord;

  const statusCode =
    (typeof source.status_code === 'number' ? source.status_code : undefined) ??
    (typeof nested.status_code === 'number' ? nested.status_code : undefined);

  const explicitSuccess =
    typeof source.success === 'boolean'
      ? source.success
      : typeof nested.success === 'boolean'
      ? nested.success
      : undefined;

  const statusSuccess =
    source.status === 'success' || nested.status === 'success';

  const errorMessage =
    source.error ??
    nested.error ??
    (statusCode && statusCode >= 400 ? `HTTP ${statusCode}` : undefined);

  const success =
    explicitSuccess !== undefined
      ? explicitSuccess
      : errorMessage
      ? false
      : statusSuccess;

  const score =
    (typeof source.score === 'number' ? source.score : undefined) ??
    (typeof nested.score === 'number' ? nested.score : undefined) ??
    (success ? defaultSuccessScore : defaultFailureScore);

  return {
    success,
    score,
    error: errorMessage,
    statusCode,
  };
};
