interface BuildChatRequestParams<TFile = unknown> {
  message: string;
  sessionId?: string;
  executionId?: string;
  userId?: string;
  userRoles?: string[];
  modelId?: string;
  mode: 'chat' | 'task';
  thinking?: boolean;
  reasoning?: boolean;
  webSearch?: boolean;
  files?: TFile[];
}

export const buildChatRequest = <TFile = unknown>({
  message,
  sessionId,
  executionId,
  userId,
  userRoles,
  modelId,
  mode,
  thinking,
  reasoning,
  webSearch,
  files,
}: BuildChatRequestParams<TFile>) => ({
  message,
  sessionId,
  executionId,
  userId,
  userRoles,
  modelId,
  files,
  config: {
    mode,
    thinking,
    reasoning,
    webSearch,
  },
});

export const buildResumeExecutionRequest = <TFile = unknown>(
  params: Omit<BuildChatRequestParams<TFile>, 'message'>
) =>
  buildChatRequest({
    ...params,
    message: '继续执行',
  });
