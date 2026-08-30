import { apiClient } from '@/shared/api/http/client';

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
    aiModels?: any;
    skills?: any;
    temporalWorkflows?: any;
    capabilityReleases?: any;
    browserTemplates?: any;
    executionFlowTemplates?: any;
    userOrganizations?: any;
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

export const systemBackupApi = {
  getSummary: async (): Promise<SystemAssetSummary> => {
    return apiClient.get('/system/backup/summary');
  },

  exportBackup: async (modules?: BackupModuleKey[]): Promise<SystemBackupArchive> => {
    return apiClient.post('/system/backup/export', { modules });
  },

  previewBackup: async (payload: SystemBackupArchive): Promise<BackupPreviewResult> => {
    return apiClient.post('/system/backup/preview', { payload });
  },

  importBackup: async (
    payload: SystemBackupArchive,
    strategy: BackupImportStrategy,
    modules?: BackupModuleKey[]
  ): Promise<BackupImportResult> => {
    return apiClient.post('/system/backup/import', { payload, strategy, modules });
  },

  downloadBackupFile: (archive: SystemBackupArchive) => {
    const jsonStr = JSON.stringify(archive, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.href = url;
    link.download = `ops-system-backup-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
};
