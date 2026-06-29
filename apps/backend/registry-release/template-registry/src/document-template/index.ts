import type { TemplateReleaseBinding, TemplateRegistryStatus } from '../browser-template';

export interface DocumentTemplateCatalogRecord {
  templateId: string;
  name: string;
  capabilityDomain: 'document';
  description?: string;
  tags: string[];
  status: TemplateRegistryStatus;
  renderProfileId?: string;
  reportProfileIds: string[];
  releaseBinding?: TemplateReleaseBinding;
  metadata?: Record<string, unknown>;
}

export interface DocumentTemplateCatalogFilter {
  keyword?: string;
  status?: TemplateRegistryStatus;
  tags?: string[];
  releaseId?: string;
}

export function normalizeDocumentTemplateCatalogRecord(
  record: DocumentTemplateCatalogRecord,
): DocumentTemplateCatalogRecord {
  return {
    ...record,
    tags: [...new Set(record.tags)].sort(),
    reportProfileIds: [...new Set(record.reportProfileIds)].sort(),
  };
}
