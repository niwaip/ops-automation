import { OfficeAppType } from '../../app/store';
import { ExcelAdapter } from './excel-adapter';
import { PowerPointAdapter } from './powerpoint-adapter';
import { HostAdapter } from './types';
import { WordAdapter } from './word-adapter';

export * from './capabilities';
export * from './document-ir';
export * from './types';
export * from './excel-adapter';
export * from './powerpoint-adapter';
export * from './word-adapter';

export function createHostAdapter(host: OfficeAppType): HostAdapter {
  switch (host) {
    case 'excel':
      return new ExcelAdapter();
    case 'ppt':
      return new PowerPointAdapter();
    case 'word':
    default:
      return new WordAdapter();
  }
}
