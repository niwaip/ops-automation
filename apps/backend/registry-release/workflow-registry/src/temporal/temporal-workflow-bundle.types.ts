import type { TemporalValidationResult, TemporalWorkflowDTO } from './temporal-workflow.types';

export const TEMPORAL_WORKFLOW_BUNDLE_FORMAT = 'ops-temporal-workflow-bundle';
export const TEMPORAL_WORKFLOW_BUNDLE_VERSION = '1.0';

export interface TemporalWorkflowBundleFileDigest {
  sha256: string;
  size: number;
  mediaType: string;
}

export interface TemporalWorkflowBundleManifest {
  format: typeof TEMPORAL_WORKFLOW_BUNDLE_FORMAT;
  formatVersion: typeof TEMPORAL_WORKFLOW_BUNDLE_VERSION;
  exportedAt: string;
  contractDigest: string;
  source: {
    workflowId: string;
    artifactVersion: number;
    artifactHash: string;
    validationStatus: string;
    deployedAt: string | null;
  };
  workflow: {
    name: string;
    description: string | null;
    taskQueue: string;
  };
  files: {
    workflowDsl: string;
    activityDsl: string;
    workflowCode: string;
    metadata: string;
    activityCodeFiles: Array<{ activityIndex: number; fn: string; path: string }>;
  };
  dependencies: Array<{
    activityRef: string | null;
    fn: string;
    handler: string;
  }>;
  digests: Record<string, TemporalWorkflowBundleFileDigest>;
}

export interface TemporalWorkflowBundleImportResult {
  workflow: TemporalWorkflowDTO;
  manifest: TemporalWorkflowBundleManifest;
  staticValidation: TemporalValidationResult;
  requiresRuntimeValidation: true;
  nextAction: 'validate_saved_artifact';
}
