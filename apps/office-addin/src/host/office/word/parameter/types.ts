export type WordGapParamMatch = {
  anchorText: string;
  start: number;
  end: number;
};

export type WordParagraphLike = {
  id?: string;
  index: number;
  text: string;
  format?: Record<string, unknown>;
};

export type WordUnderlineLike = {
  text: string;
  underlineType: string;
  paragraphIndex: number;
  paragraphText: string;
  position: {
    start: number;
    end: number;
  };
};

export type WordTableCellLike = {
  sourceBlockId?: string;
  tableIndex: number;
  rowIndex: number;
  cellIndex: number;
  text: string;
};

export type WordDetectedParam = {
  id: string;
  sourceType: 'underline' | 'label-only' | 'table-cell';
  paragraphIndex: number;
  start: number;
  end: number;
  rawText: string;
  underlineType: string;
  anchorText: string;
  localAnchorText?: string;
  parameterSlot?: string;
  paramName: string;
  paragraphText: string;
  sourceBlockId?: string;
  tableIndex?: number;
  rowIndex?: number;
  cellIndex?: number;
  sampleValue?: string;
  sampleMatchText?: string;
  languageHint?: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
};
