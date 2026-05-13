import { HostAdapter } from '../adapters';
import { TemplateSource } from '../adapters/document-ir';

export async function exportTemplateSource(adapter: HostAdapter): Promise<TemplateSource> {
  return adapter.exportTemplateSource();
}
