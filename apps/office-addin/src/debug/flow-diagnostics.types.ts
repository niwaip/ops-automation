import type { FlowLogEntry } from '../app/store';

export type FlowDiagnosticsLevel = FlowLogEntry['level'];

export interface FlowDiagnosticsSink {
  emit(level: FlowDiagnosticsLevel, message: string, details?: string): void;
  clear(): void;
}
