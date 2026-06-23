export type WordReadDebugLogLevel = 'info' | 'warn' | 'error' | 'debug';

export type WordReadDebugLogger = (
  level: WordReadDebugLogLevel,
  message: string,
  details?: string
) => void;

let lastUnderlineDebugReport = '';
let debugLogger: WordReadDebugLogger | null = null;

export function getLastUnderlineDebugReport(): string {
  return lastUnderlineDebugReport;
}

export function setLastUnderlineDebugReport(report: string): void {
  lastUnderlineDebugReport = report;
}

export function clearLastUnderlineDebugReport(): void {
  lastUnderlineDebugReport = '';
}

export function setDebugLogger(logger: WordReadDebugLogger | null): void {
  debugLogger = logger;
}

export function clearDebugLogger(): void {
  debugLogger = null;
}

export function emitDebugLog(
  level: WordReadDebugLogLevel,
  message: string,
  details?: string
): void {
  debugLogger?.(level, message, details);
  const consoleMethod =
    level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'debug' ? 'debug' : 'log';
  console[consoleMethod](`[WORD LOOP] ${message}`, details || '');
}
