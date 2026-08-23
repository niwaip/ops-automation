import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const ASSISTANT_FEEDBACK_RATINGS = ['positive', 'negative'] as const;
export type AssistantFeedbackRating = (typeof ASSISTANT_FEEDBACK_RATINGS)[number];

export const NEGATIVE_FEEDBACK_REASON_CODES = [
  'answer_incorrect',
  'wrong_skill_or_workflow',
  'missing_step',
  'wrong_parameters',
  'wrong_output_format',
  'execution_failed',
  'unsafe_or_unexpected_side_effect',
  'other',
] as const;
export type NegativeFeedbackReasonCode = (typeof NEGATIVE_FEEDBACK_REASON_CODES)[number];

export class SetAssistantFeedbackDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  eventId?: string;

  @IsString()
  @IsIn(ASSISTANT_FEEDBACK_RATINGS)
  rating!: AssistantFeedbackRating;

  @IsOptional()
  @IsString()
  @IsIn(NEGATIVE_FEEDBACK_REASON_CODES)
  reasonCode?: NegativeFeedbackReasonCode;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsOptional()
  @IsUUID()
  executionId?: string;
}

export interface AssistantFeedbackResponse {
  feedback: {
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
  } | null;
}
