export interface HostCapabilities {
  canExtractDocument: boolean;
  canExtractSelection: boolean;
  canPreviewSuggestion: boolean;
  canApplySuggestion: boolean;
  canExportTemplateSource: boolean;
  warnings: string[];
}
