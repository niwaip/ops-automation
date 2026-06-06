export type ScopedOfficeHost = 'word' | 'excel' | 'ppt';

export function getHostScopedStorageKey(host: ScopedOfficeHost, key: string): string {
  return `office-addin:${host}:${key}`;
}

export function getDefaultTemplateFormatForHost(host: ScopedOfficeHost): 'docx' | 'xlsx' | 'pptx' {
  switch (host) {
    case 'excel':
      return 'xlsx';
    case 'ppt':
      return 'pptx';
    case 'word':
    default:
      return 'docx';
  }
}
