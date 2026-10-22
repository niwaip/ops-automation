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

export function isSameCoordinationAttachment(a: any, b: any): boolean {
  if (!a || !b) return false;
  const aUrls = [a.url, a.downloadUrl].filter(Boolean).map((u: string) => String(u).trim());
  const bUrls = [b.url, b.downloadUrl].filter(Boolean).map((u: string) => String(u).trim());
  if (aUrls.length > 0 && bUrls.length > 0 && aUrls.some((u) => bUrls.includes(u))) {
    return true;
  }

  const aId = (a.id || a.attachmentId)?.trim();
  const bId = (b.id || b.attachmentId)?.trim();
  if (aId && bId && aId === bId) {
    return true;
  }

  // Fallback: If both lack URL and ID, compare by non-empty file name
  if (aUrls.length === 0 && bUrls.length === 0 && !aId && !bId) {
    const aName = a.name?.trim();
    const bName = b.name?.trim();
    if (aName && bName && aName === bName) return true;
  }

  return false;
}

export function deduplicateCoordinationAttachments<T extends Record<string, any>>(items?: T[]): T[] {
  if (!Array.isArray(items)) return [];
  const result: T[] = [];

  const getScore = (item: any): number => {
    let score = 0;
    if (item?.sha256 || item?.metadata?.sha256) score += 10;
    if (item?.metadata && typeof item.metadata === 'object' && Object.keys(item.metadata).length > 0) score += 10;
    if (item?.sizeBytes || item?.size) score += 5;
    if (item?.id || item?.attachmentId) score += 5;
    if (item?.downloadUrl) score += 2;
    if (item?.mimeType) score += 1;
    return score;
  };

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const existingIndex = result.findIndex((existing) => isSameCoordinationAttachment(existing, item));
    if (existingIndex === -1) {
      result.push(item);
    } else {
      const existing = result[existingIndex];
      const existingScore = getScore(existing);
      const currentScore = getScore(item);
      if (currentScore > existingScore) {
        result[existingIndex] = { ...existing, ...item };
      } else {
        result[existingIndex] = { ...item, ...existing };
      }
    }
  }

  return result;
}
