import { apiClient } from './index';

export type AssistantFeedbackRating = 'positive' | 'negative';
export type NegativeFeedbackReasonCode =
  | 'answer_incorrect'
  | 'wrong_skill_or_workflow'
  | 'missing_step'
  | 'wrong_parameters'
  | 'wrong_output_format'
  | 'execution_failed'
  | 'unsafe_or_unexpected_side_effect'
  | 'other';

export interface AssistantFeedback {
  eventId: string;
  sessionId: string;
  messageId: string;
  executionId?: string;
  revision: number;
  eventType: 'set' | 'clear';
  rating?: AssistantFeedbackRating;
  reasonCode?: NegativeFeedbackReasonCode;
  comment?: string;
  occurredAt: string;
}

interface AssistantFeedbackResponse {
  feedback: AssistantFeedback | null;
}

interface AssistantFeedbackApiClient {
  get<T>(url: string): Promise<T>;
  put<T>(url: string, data: unknown): Promise<T>;
  delete<T>(url: string): Promise<T>;
}

const feedbackApiClient = apiClient as unknown as AssistantFeedbackApiClient;

const feedbackPath = (sessionId: string, messageId: string): string =>
  `/ai/chat/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/feedback`;

const feedbackQuery = (executionId?: string): string =>
  executionId ? `?executionId=${encodeURIComponent(executionId)}` : '';

export const assistantFeedbackApi = {
  get: (
    sessionId: string,
    messageId: string,
    executionId?: string
  ): Promise<AssistantFeedbackResponse> =>
    feedbackApiClient.get<AssistantFeedbackResponse>(
      `${feedbackPath(sessionId, messageId)}${feedbackQuery(executionId)}`
    ),
  set: (
    sessionId: string,
    messageId: string,
    input: {
      eventId: string;
      rating: AssistantFeedbackRating;
      reasonCode?: NegativeFeedbackReasonCode;
      comment?: string;
      executionId?: string;
    }
  ): Promise<AssistantFeedbackResponse> =>
    feedbackApiClient.put<AssistantFeedbackResponse>(feedbackPath(sessionId, messageId), input),
  clear: (
    sessionId: string,
    messageId: string,
    executionId?: string
  ): Promise<AssistantFeedbackResponse> =>
    feedbackApiClient.delete<AssistantFeedbackResponse>(
      `${feedbackPath(sessionId, messageId)}${feedbackQuery(executionId)}`
    ),
};
