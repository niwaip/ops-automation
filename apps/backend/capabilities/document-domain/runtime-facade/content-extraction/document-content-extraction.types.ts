export interface DocumentContentExtractionPage {
  pageNumber: number;
  text: string;
  characterCount: number;
}

export interface DocumentContentExtractionResult {
  text: string;
  pages: DocumentContentExtractionPage[];
  metadata: Record<string, string | number | boolean | null>;
  pageCount: number;
  extractedPageCount: number;
  characterCount: number;
  truncated: boolean;
  warnings: string[];
  extraction: {
    format: string;
    method: 'embedded_text';
    ocrUsed: false;
  };
}

export interface PdfContentExtractionInput {
  fileBase64: string;
  fileName?: string;
  password?: string;
  maxPages?: number;
  maxCharacters?: number;
  includePages?: boolean;
}
