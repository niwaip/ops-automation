import { getOfficeType } from './host';
import { WordAPI } from './word/api';
import { ExcelAPI } from './excel/api';
import { PPTAPI } from './powerpoint/api';

export { getOfficeType } from './host';
export { DocumentFileAPI, hasZipHeader } from './shared/document-file';
export { WordAPI } from './word/api';
export { ExcelAPI } from './excel/api';
export { PPTAPI } from './powerpoint/api';
export * from './word';
export * from './excel/api';
export * from './powerpoint/api';
export * from './shared/document-file';

export const OfficeHelper = {
  getOfficeType,
  Word: WordAPI,
  Excel: ExcelAPI,
  PowerPoint: PPTAPI,
};
