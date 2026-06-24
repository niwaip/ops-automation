export interface BrowserPhaseCommand {
  stepId: string;
  capabilityType: string;
  action: string;
  input: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
