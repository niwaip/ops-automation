import { HostAdapter } from '../../../../host/adapters';
import { DocumentIR } from '../../../../host/adapters/document-ir';
import {
  ChatAnalysisError,
  StructuredAnalyzeRequest,
} from '../analysis-executor';
import { buildDocumentContext, serializeDocument } from '../identify/common/document-serialize';
import type { AnalyzeDocumentOptions } from '../identify/common/identify.types';

export function toErrorInfo(error: unknown): Record<string, unknown> | undefined {
  if (error instanceof ChatAnalysisError) {
    return {
      message: error.message,
      stage: error.details.stage,
      pairLabel: error.details.pairLabel,
      url: error.details.url,
      status: error.details.status,
      reason: error.details.reason,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      reason: 'unknown_error',
    };
  }

  return undefined;
}

function extractWordUnderlineInfo(documentIR: DocumentIR): Array<Record<string, unknown>> {
  return documentIR.anchors
    .filter((anchor) => anchor.type === 'word-range')
    .map((anchor) => ({
      text: anchor.text,
      paragraphIndex: anchor.ref.paragraphIndex,
      paragraphText: anchor.ref.paragraphText,
      underlineType: anchor.ref.underlineType,
      position: {
        start: anchor.ref.start,
        end: anchor.ref.end,
      },
    }));
}

function extractWordParagraphFormats(documentIR: DocumentIR): Array<Record<string, unknown>> {
  return documentIR.elements
    .filter((element) => element.type === 'paragraph' && element.hostData?.format)
    .map((element) => ({
      text: element.text || '',
      index: element.hostData?.index,
      format: element.hostData?.format,
    }));
}

export function buildAnalyzeRequestPayload(
  adapter: HostAdapter,
  options: AnalyzeDocumentOptions,
  documentIR: DocumentIR,
): StructuredAnalyzeRequest {
  const documentContent = serializeDocument(documentIR);
  const documentType: 'docx' | 'xlsx' | 'pptx' =
    adapter.host === 'word' ? 'docx' : adapter.host === 'excel' ? 'xlsx' : 'pptx';

  return {
    host: adapter.host,
    documentIR,
    documentContent,
    documentType,
    templateType: options.templateType,
    skill: options.skill,
    context: buildDocumentContext(documentIR, options.templateType),
    underlineInfo: adapter.host === 'word' ? extractWordUnderlineInfo(documentIR) : undefined,
    paragraphFormats: adapter.host === 'word' ? extractWordParagraphFormats(documentIR) : undefined,
  } satisfies StructuredAnalyzeRequest;
}
