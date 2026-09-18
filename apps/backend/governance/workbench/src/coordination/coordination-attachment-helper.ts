import type { CoordinationAttachment } from './dto/workbench-coordination.dto';

export function sanitizeCoordinationAttachments(arr?: any): CoordinationAttachment[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter(
    (a) => Boolean(a && typeof a === 'object' && !Array.isArray(a) && (a.url?.trim() || a.name?.trim()))
  );
}

export function resolveEffectiveAndHistoricalAttachments(
  dtoAttachments?: any,
  payloadAttachments?: any,
  payloadParameters?: Record<string, any>
): {
  effectiveAttachments: CoordinationAttachment[];
  historicalAttachments: CoordinationAttachment[];
  primaryAttachment?: CoordinationAttachment;
  hasReplacedFile: boolean;
  parameterPatch: Record<string, any>;
} {
  const rawDtoAttachments = sanitizeCoordinationAttachments(dtoAttachments);
  const rawPayloadAttachments = sanitizeCoordinationAttachments(payloadAttachments);

  const historicalAttachments: CoordinationAttachment[] = [];
  const initialDraftUrl =
    payloadParameters?.originalDraftUrl ||
    payloadParameters?.downloadUrl ||
    payloadParameters?.fileUrl;
  const primaryUrl = rawDtoAttachments[0]?.url;

  if (initialDraftUrl && initialDraftUrl !== primaryUrl) {
    historicalAttachments.push({
      name: payloadParameters?.originalDraftFileName || payloadParameters?.fileName || '保密合同初稿_V1.docx',
      url: initialDraftUrl,
      size: payloadParameters?.originalDraftSize,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  const isReplacing = rawDtoAttachments.length > 0;
  for (const prev of rawPayloadAttachments) {
    const isHtml =
      prev.name?.toLowerCase().endsWith('.html') ||
      prev.name?.toLowerCase().endsWith('.htm') ||
      prev.mimeType === 'text/html';
    if (isReplacing && isHtml) {
      continue;
    }
    if (
      prev.url !== primaryUrl &&
      !historicalAttachments.some((h) => h.url === prev.url) &&
      !rawDtoAttachments.some((d) => d.url === prev.url)
    ) {
      historicalAttachments.push(prev);
    }
  }

  const effectiveAttachments = rawDtoAttachments.length > 0
    ? [
        ...rawDtoAttachments,
        ...historicalAttachments.filter((h) => !rawDtoAttachments.some((d) => d.url === h.url)),
      ]
    : rawPayloadAttachments.length > 0
    ? rawPayloadAttachments
    : historicalAttachments;
  const primaryAttachment = effectiveAttachments[0];
  const hasReplacedFile = Boolean(primaryAttachment?.url && rawDtoAttachments.length > 0);

  const parameterPatch: Record<string, any> = {};
  if (hasReplacedFile && primaryAttachment) {
    if (
      !payloadParameters?.originalDraftUrl &&
      payloadParameters?.downloadUrl &&
      payloadParameters.downloadUrl !== primaryAttachment.url
    ) {
      parameterPatch.originalDraftUrl = payloadParameters.downloadUrl;
      parameterPatch.originalDraftFileName = payloadParameters.fileName;
    }
    parameterPatch.downloadUrl = primaryAttachment.url;
    parameterPatch.fileUrl = primaryAttachment.url;
    parameterPatch.fileName = primaryAttachment.name;
    parameterPatch.isDraftReplaced = true;
  }

  return {
    effectiveAttachments,
    historicalAttachments,
    primaryAttachment,
    hasReplacedFile,
    parameterPatch,
  };
}
