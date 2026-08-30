export type BackupModuleKey =
  | 'aiModels'
  | 'skills'
  | 'temporalWorkflows'
  | 'capabilityReleases'
  | 'browserTemplates'
  | 'executionFlowTemplates'
  | 'userOrganizations';

export type BackupImportStrategy = 'merge_override' | 'skip_existing';

export interface SystemBackupManifest {
  version: string;
  exportedAt: string;
  systemVersion: string;
  checksum: string;
  counts: Record<BackupModuleKey, number>;
}

export interface SystemBackupArchive {
  manifest: SystemBackupManifest;
  modules: {
    aiModels?: {
      models?: any[];
      providers?: any[];
      apiKeys?: any[];
      providerApiKeys?: any[];
    };
    skills?: {
      skills?: any[];
      skillConfigs?: any[];
      toolCatalogs?: any[];
      skillToolBindings?: any[];
      skillPermissions?: any[];
      skillSchedules?: any[];
    };
    temporalWorkflows?: {
      temporalWorkflows?: any[];
      activities?: any[];
    };
    capabilityReleases?: {
      capabilityReleases?: any[];
      capabilitySourceSnapshots?: any[];
      capabilityBuilds?: any[];
      skillDrafts?: any[];
    };
    browserTemplates?: {
      templates?: any[];
      templateVersions?: any[];
    };
    executionFlowTemplates?: {
      executionFlowTemplates?: any[];
      llmOperations?: any[];
    };
    userOrganizations?: {
      users?: any[];
      roles?: any[];
      userRoles?: any[];
      organizations?: any[];
      departments?: any[];
      teams?: any[];
      orgMemberships?: any[];
      orgRoleBindings?: any[];
    };
  };
}

export interface SystemAssetSummary {
  counts: Record<BackupModuleKey, number>;
  totalAssets: number;
}

export interface BackupConflictItem {
  key: string;
  name: string;
  existsInTarget: boolean;
  action: 'create' | 'update' | 'skip';
}

export interface BackupModulePreview {
  moduleKey: BackupModuleKey;
  totalInBackup: number;
  newCount: number;
  conflictCount: number;
  items: BackupConflictItem[];
}

export interface BackupPreviewResult {
  valid: boolean;
  manifest: SystemBackupManifest;
  modulePreviews: BackupModulePreview[];
  summary: {
    totalItems: number;
    newItems: number;
    conflictItems: number;
  };
}

export interface BackupImportResult {
  success: boolean;
  strategy: BackupImportStrategy;
  importedCounts: Record<BackupModuleKey, { created: number; updated: number; skipped: number }>;
  message: string;
  errors: string[];
}

export interface ExportBackupRequestDTO {
  modules?: BackupModuleKey[];
}

export interface PreviewBackupRequestDTO {
  payload: SystemBackupArchive;
}

export interface ImportBackupRequestDTO {
  payload: SystemBackupArchive;
  strategy: BackupImportStrategy;
  modules?: BackupModuleKey[];
}
