type SharedChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'markdown'; markdown: string }
  | { type: 'structured_result'; schemaType: string; data: unknown }
  | { type: 'task_card'; taskStatus: string; executionId: string }
  | { type: 'approval_card'; executionId: string; riskLevel?: string }
  | { type: 'file_ref'; fileId: string; fileName: string; mimeType?: string }
  | { type: 'deeplink'; url: string; label: string };

interface ResolvedTaskParts {
  taskStatus?: string;
  executionId?: string;
  riskLevel?: string;
  structuredResultData?: unknown;
  deeplinks: Array<{ url: string; label: string }>;
}

export const resolveTaskParts = (
  parts?: SharedChatContentPart[]
): ResolvedTaskParts => {
  const taskCard = parts?.find(
    (part): part is Extract<SharedChatContentPart, { type: 'task_card' }> => part.type === 'task_card'
  );
  const approvalCard = parts?.find(
    (part): part is Extract<SharedChatContentPart, { type: 'approval_card' }> =>
      part.type === 'approval_card'
  );
  const structuredResult = parts?.find(
    (part): part is Extract<SharedChatContentPart, { type: 'structured_result' }> =>
      part.type === 'structured_result'
  );
  const deeplinks = (parts || []).filter(
    (part): part is Extract<SharedChatContentPart, { type: 'deeplink' }> => part.type === 'deeplink'
  );

  return {
    taskStatus: taskCard?.taskStatus,
    executionId: taskCard?.executionId || approvalCard?.executionId,
    riskLevel: approvalCard?.riskLevel,
    structuredResultData: structuredResult?.data,
    deeplinks: deeplinks.map((item) => ({ url: item.url, label: item.label })),
  };
};

export const findDeeplinkByLabel = (
  deeplinks: Array<{ url: string; label: string }>,
  matcher: RegExp
): string | undefined => deeplinks.find((item) => matcher.test(item.label))?.url;
