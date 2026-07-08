import type { ChatMessage } from '@ops/user-core';
import { resolveTaskParts } from '@chat-web/lib/contentParts';
import {
  hasTerminalTaskOutcome,
  resolveMessageTaskStatus,
  terminalTaskStatuses,
} from './taskStatus';

export const normalizeComparableMessageText = (value: string): string =>
  value
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

export const dedupeThoughtTexts = (thoughts: string[]): string[] => {
  const deduped: string[] = [];
  const seen = new Set<string>();

  thoughts.forEach((item) => {
    const normalized = item.trim();
    if (!normalized) {
      return;
    }
    const key = normalizeComparableMessageText(normalized);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(normalized);
  });

  return deduped;
};

export const mergeDefinedMetadata = (
  currentMetadata: ChatMessage['metadata'],
  patchMetadata: ChatMessage['metadata']
): ChatMessage['metadata'] => {
  if (!patchMetadata) {
    return currentMetadata;
  }

  const definedEntries = Object.entries(patchMetadata).filter(([, value]) => value !== undefined);
  if (definedEntries.length === 0) {
    return currentMetadata;
  }

  return {
    ...(currentMetadata || {}),
    ...Object.fromEntries(definedEntries),
  };
};

export const mergeContentParts = (
  currentParts: ChatMessage['contentParts'],
  nextParts: ChatMessage['contentParts']
): ChatMessage['contentParts'] => {
  if (!nextParts || nextParts.length === 0) {
    return currentParts;
  }

  const currentTaskParts = resolveTaskParts(currentParts);
  const nextTaskParts = resolveTaskParts(nextParts);
  if (!currentTaskParts.executionId || nextTaskParts.executionId || nextTaskParts.deeplinks.length > 0) {
    return nextParts;
  }

  const preservedParts = (currentParts || []).filter(
    (part) => part.type === 'task_card' || part.type === 'approval_card' || part.type === 'deeplink'
  );
  if (preservedParts.length === 0) {
    return nextParts;
  }

  const nextPartKeys = new Set(
    nextParts.map((part) => {
      switch (part.type) {
        case 'task_card':
          return `${part.type}:${part.executionId}:${part.taskStatus}`;
        case 'approval_card':
          return `${part.type}:${part.executionId}:${part.riskLevel || ''}`;
        case 'deeplink':
          return `${part.type}:${part.label}:${part.url}`;
        default:
          return `${part.type}`;
      }
    })
  );

  return [
    ...nextParts,
    ...preservedParts.filter((part) => {
      switch (part.type) {
        case 'task_card':
          return !nextPartKeys.has(`${part.type}:${part.executionId}:${part.taskStatus}`);
        case 'approval_card':
          return !nextPartKeys.has(`${part.type}:${part.executionId}:${part.riskLevel || ''}`);
        case 'deeplink':
          return !nextPartKeys.has(`${part.type}:${part.label}:${part.url}`);
        default:
          return false;
      }
    }),
  ];
};

export const buildPatchedMessage = (
  message: ChatMessage,
  patch: Partial<ChatMessage>
): ChatMessage => ({
  ...message,
  ...patch,
  contentParts: mergeContentParts(message.contentParts, patch.contentParts),
  metadata: (() => {
    if (!patch.metadata) {
      return message.metadata;
    }

    const nextMetadata = mergeDefinedMetadata(message.metadata, patch.metadata) || {};
    const nextTaskStatus = nextMetadata.taskStatus;
    if (!nextTaskStatus || !terminalTaskStatuses.has(nextTaskStatus)) {
      return nextMetadata;
    }

    const progressThoughtLogs = (message.metadata?.progressLogs || [])
      .filter((log) => log.stage === 'thought')
      .map((log) => log.text.trim())
      .filter(Boolean);
    const persistedThoughtLogs = message.metadata?.thoughtLogsSnapshot || [];
    const mergedThoughtLogs = dedupeThoughtTexts([
      ...persistedThoughtLogs,
      ...progressThoughtLogs,
    ]);

    if (mergedThoughtLogs.length === 0) {
      return nextMetadata;
    }

    return {
      ...nextMetadata,
      thoughtLogsSnapshot: mergedThoughtLogs,
    };
  })(),
});

export const upsertMessage = (messages: ChatMessage[], nextMessage: ChatMessage): ChatMessage[] => {
  const hasExisting = messages.some((message) => message.id === nextMessage.id);
  if (hasExisting) {
    return messages.map((message) => (message.id === nextMessage.id ? nextMessage : message));
  }
  return [...messages, nextMessage];
};

export const isEphemeralAssistantMessage = (message: ChatMessage): boolean => {
  if (message.role !== 'assistant') {
    return false;
  }

  if (message.isStreaming === true) {
    return true;
  }

  const hasStructuredState =
    Boolean(resolveMessageTaskStatus(message)) ||
    hasTerminalTaskOutcome(message) ||
    Boolean(message.metadata?.progressLogs?.length) ||
    Boolean(message.metadata?.thoughtLogsSnapshot?.length) ||
    Boolean(message.contentParts?.length) ||
    Boolean(message.metadata?.finalSummary?.trim()) ||
    Boolean(message.metadata?.finalResult?.trim()) ||
    Boolean(message.metadata?.errorMessage?.trim()) ||
    Boolean(message.metadata?.failureReason?.trim()) ||
    Boolean(message.metadata?.normalizedResult);

  return !hasStructuredState && normalizeComparableMessageText(message.content).length === 0;
};

export const areMessagesEquivalent = (
  localMessage: ChatMessage,
  remoteMessage: ChatMessage
): boolean => {
  if (localMessage.role !== remoteMessage.role) {
    return false;
  }

  const localTime = new Date(localMessage.timestamp).getTime();
  const remoteTime = new Date(remoteMessage.timestamp).getTime();
  if (
    Number.isFinite(localTime) &&
    Number.isFinite(remoteTime) &&
    Math.abs(localTime - remoteTime) > 15_000
  ) {
    return false;
  }

  if (localMessage.role === 'user') {
    return (
      normalizeComparableMessageText(localMessage.content) ===
      normalizeComparableMessageText(remoteMessage.content)
    );
  }

  if (isEphemeralAssistantMessage(localMessage)) {
    return true;
  }

  const localText = normalizeComparableMessageText(localMessage.content);
  const remoteText = normalizeComparableMessageText(remoteMessage.content);
  if (!localText || !remoteText) {
    return false;
  }

  return localText === remoteText || localText.includes(remoteText) || remoteText.includes(localText);
};

export const mergeHistoryMessages = (
  remoteMessages: ChatMessage[],
  localMessages: ChatMessage[]
): ChatMessage[] => {
  const merged = new Map<string, ChatMessage>();
  const matchedLocalIds = new Set<string>();

  localMessages.forEach((message) => {
    merged.set(message.id, message);
  });
  remoteMessages.forEach((message) => {
    const exactMatch = merged.get(message.id);
    if (exactMatch) {
      merged.set(message.id, {
        ...exactMatch,
        ...message,
        isStreaming: false,
        metadata: {
          ...(exactMatch.metadata || {}),
          ...(message.metadata || {}),
        },
      });
      matchedLocalIds.add(message.id);
      return;
    }

    const localMatch = localMessages.find(
      (localMessage) =>
        !matchedLocalIds.has(localMessage.id) && areMessagesEquivalent(localMessage, message)
    );

    if (!localMatch) {
      merged.set(message.id, {
        ...(merged.get(message.id) || {}),
        ...message,
        isStreaming: false,
        metadata: {
          ...(merged.get(message.id)?.metadata || {}),
          ...(message.metadata || {}),
        },
      });
      return;
    }

    matchedLocalIds.add(localMatch.id);
    const current = merged.get(localMatch.id) || localMatch;
    const preserveLocalContent =
      localMatch.role === 'assistant' &&
      !isEphemeralAssistantMessage(localMatch) &&
      normalizeComparableMessageText(current.content).includes(
        normalizeComparableMessageText(message.content)
      );

    merged.set(localMatch.id, {
      ...current,
      ...message,
      id: localMatch.id,
      content: preserveLocalContent ? current.content : message.content,
      isStreaming: false,
      metadata: {
        ...(current.metadata || {}),
        ...(message.metadata || {}),
      },
    });
  });

  return [...merged.values()].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
  );
};
