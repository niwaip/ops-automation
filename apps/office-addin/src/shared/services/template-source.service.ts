import { HostAdapter } from '../../host/adapters';
import { TemplateSource } from '../../host/adapters/document-ir';

export async function exportTemplateSource(adapter: HostAdapter): Promise<TemplateSource> {
  return adapter.exportTemplateSource();
}
