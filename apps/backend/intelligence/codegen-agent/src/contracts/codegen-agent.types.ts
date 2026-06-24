import type { AgentProfile } from '@ops/backend-agent-profile';

export type CodegenAgentProfile = AgentProfile & {
  supportedOutputs: Array<'code_bundle' | 'activity_code' | 'workflow_code'>;
  sandboxBindingMode: 'required' | 'optional' | 'forbidden';
  allowedLanguages: string[];
};

export type GeneratedWorkUnitArtifact = {
  path: string;
  kind: 'source' | 'manifest' | 'dependency_lock' | 'test' | 'report';
  language?: string;
};

export type GeneratedWorkUnit = {
  workUnitId: string;
  title: string;
  objective: string;
  outputType: 'code_bundle' | 'activity_code' | 'workflow_code';
  entrypoints: string[];
  artifacts: GeneratedWorkUnitArtifact[];
  metadata?: Record<string, unknown>;
};

export type SandboxRuntimeBinding = {
  runtime: 'sandbox-worker';
  executionMode: 'dry_run' | 'verification' | 'package_validation';
  taskQueue?: string;
  timeoutSeconds?: number;
  environment?: Record<string, string>;
};

export type SecurityLintIssue = {
  ruleId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  filePath?: string;
  symbol?: string;
  line?: number;
  blocking: boolean;
};

export type SecurityLintResult = {
  status: 'passed' | 'failed' | 'needs_review';
  score?: number;
  issues: SecurityLintIssue[];
  summary?: string;
};
