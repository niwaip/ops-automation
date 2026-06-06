import {
  clearDebugLogger,
  clearLastUnderlineDebugReport,
  emitDebugLog,
  getLastUnderlineDebugReport,
  setDebugLogger,
} from './word-read.debug';
import {
  getDocumentAsBase64,
  getDocumentFileBase64,
  getDocumentFileBase64WithFallback,
  getDocumentFileViaWordRun,
  getFileContentBase64,
  utf8ToBase64,
} from './word-read.file';
import {
  getContentControls,
  getDocumentContent,
  getDocumentOoxml,
  getDocumentStructure,
  getImagesBase64,
  getParagraphsWithFormat,
  getTableCells,
} from './word-read.structure';
import { getUnderlinedTexts } from './word-read.underline';

export const WordReadAPI = {
  getLastUnderlineDebugReport,
  clearLastUnderlineDebugReport,
  setDebugLogger,
  clearDebugLogger,
  emitDebugLog,
  getDocumentContent,
  getDocumentFileViaWordRun,
  getDocumentFileBase64,
  getDocumentAsBase64,
  getFileContentBase64,
  getDocumentOoxml,
  getDocumentFileBase64WithFallback: () => getDocumentFileBase64WithFallback(getDocumentContent),
  utf8ToBase64,
  getDocumentStructure,
  getContentControls,
  getTableCells,
  getParagraphsWithFormat,
  getImagesBase64,
  getUnderlinedTexts,
};
