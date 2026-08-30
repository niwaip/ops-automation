import type { ArtifactRef } from '@ops/backend-runtime-capability-contract';

export interface InlinePdfInput {
  fileBase64: string;
  fileName?: string;
}

export interface PdfMergeInput {
  files: InlinePdfInput[];
  fileName?: string;
}

export interface PdfSplitInput extends InlinePdfInput {
  pages?: string;
  fileNamePrefix?: string;
}

export interface PdfContentBlock {
  type: 'heading' | 'h2' | 'h3' | 'paragraph' | 'table' | 'list' | 'code';
  text?: string;
  headers?: string[];
  rows?: Array<Array<string | number | boolean | null>>;
  items?: string[];
  ordered?: boolean;
}

export interface PdfCreateInput {
  fileName?: string;
  title?: string;
  content: PdfContentBlock[];
  pageNumbers?: boolean;
}

export interface PdfOperationOutput {
  operation: 'merge' | 'split' | 'create';
  artifact: ArtifactRef;
  artifacts: ArtifactRef[];
  pageCount: number;
  inputCount?: number;
  selectedPages?: number[];
}

export interface BuiltinPdfOperationInvokeDto {
  executionId: string;
  stepId: string;
  capabilityKey: string;
  definitionVersion: string;
  idempotencyKey: string;
  input: Record<string, unknown>;
}
