export type TemplateRegistryStatus =
  | 'draft'
  | 'published'
  | 'archived'
  | 'disabled';

export interface TemplateReleaseBinding {
  releaseId: string;
  releaseVersion?: string;
  publishedAt?: string;
}

export interface BrowserTemplateCatalogRecord {
  templateId: string;
  name: string;
  capabilityDomain: 'browser';
  description?: string;
  tags: string[];
  status: TemplateRegistryStatus;
  recorderProfileId?: string;
  semanticsProfileIds: string[];
  releaseBinding?: TemplateReleaseBinding;
  metadata?: Record<string, unknown>;
}

export interface BrowserTemplateCatalogFilter {
  keyword?: string;
  status?: TemplateRegistryStatus;
  tags?: string[];
  releaseId?: string;
}

export function normalizeBrowserTemplateCatalogRecord(
  record: BrowserTemplateCatalogRecord,
): BrowserTemplateCatalogRecord {
  return {
    ...record,
    tags: [...new Set(record.tags)].sort(),
    semanticsProfileIds: [...new Set(record.semanticsProfileIds)].sort(),
  };
}
