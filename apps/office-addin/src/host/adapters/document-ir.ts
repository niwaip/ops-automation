import { OfficeAppType } from '../../app/store';

export type HostType = OfficeAppType;

export type AnchorType =
  | 'word-range'
  | 'word-content-control'
  | 'excel-sheet-pair'
  | 'excel-range'
  | 'excel-table'
  | 'excel-named-range'
  | 'ppt-shape'
  | 'ppt-text-range';

export type DocumentElementType =
  | 'sheet'
  | 'paragraph'
  | 'table'
  | 'cell'
  | 'slide'
  | 'shape'
  | 'named-range';

export interface Anchor {
  id: string;
  type: AnchorType;
  text?: string;
  ref: Record<string, unknown>;
}

export interface DocumentElement {
  id: string;
  type: DocumentElementType;
  text?: string;
  anchorIds?: string[];
  hostData?: Record<string, unknown>;
}

export interface DocumentIR {
  host: HostType;
  metadata: {
    title?: string;
    templateTypeHint?: string;
    language?: string;
    sourceAppVersion?: string;
  };
  elements: DocumentElement[];
  anchors: Anchor[];
  stats: {
    sheetCount?: number;
    sheetPairCount?: number;
    paragraphCount?: number;
    tableCount?: number;
    rowCount?: number;
    cellCount?: number;
    namedRangeCount?: number;
    slideCount?: number;
    shapeCount?: number;
  };
}

export interface DocumentSelection {
  text: string;
  anchorId?: string;
  hostData?: Record<string, unknown>;
}

export interface TemplateSource {
  format: 'docx' | 'xlsx' | 'pptx';
  content: string;
  mode: 'base64' | 'text' | 'json';
  isBinaryFile: boolean;
  warnings?: string[];
}
