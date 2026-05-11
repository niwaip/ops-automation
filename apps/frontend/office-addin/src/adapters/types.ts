import { AISuggestion, OfficeAppType } from '../taskpane/store';
import { HostCapabilities } from './capabilities';
import { DocumentIR, DocumentSelection, TemplateSource } from './document-ir';

export interface HostAdapter {
  host: OfficeAppType;
  getCapabilities(): Promise<HostCapabilities>;
  extractDocument(): Promise<DocumentIR>;
  extractSelection(): Promise<DocumentSelection | null>;
  previewSuggestion(suggestion: AISuggestion): Promise<void>;
  applySuggestion(suggestion: AISuggestion): Promise<void>;
  clearPreview?(): Promise<void>;
  exportTemplateSource(): Promise<TemplateSource>;
  validateEnvironment?(): Promise<{ ok: boolean; warnings: string[] }>;
}
