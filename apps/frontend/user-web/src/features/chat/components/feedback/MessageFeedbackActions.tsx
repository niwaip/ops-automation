import { DislikeOutlined, LikeOutlined } from '@ant-design/icons';
import { App, Button, Input, Popover, Radio, Space, Tooltip } from 'antd';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { assistantFeedbackApi } from '../../../../api/assistantFeedback';
import { feedbackReasonOptions } from './feedbackReasonOptions';

type AssistantFeedbackRating = 'positive' | 'negative';
type NegativeFeedbackReasonCode =
  | 'answer_incorrect'
  | 'wrong_skill_or_workflow'
  | 'missing_step'
  | 'wrong_parameters'
  | 'wrong_output_format'
  | 'execution_failed'
  | 'unsafe_or_unexpected_side_effect'
  | 'other';

interface FeedbackItem {
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

interface FeedbackResponse {
  feedback: FeedbackItem | null;
}

interface FeedbackInput {
  eventId?: string;
  rating: AssistantFeedbackRating;
  reasonCode?: NegativeFeedbackReasonCode;
  comment?: string;
  executionId?: string;
}

interface FeedbackApiClient {
  get(sessionId: string, messageId: string, executionId?: string): Promise<FeedbackResponse>;
  set(
    sessionId: string,
    messageId: string,
    input: FeedbackInput & { eventId: string }
  ): Promise<FeedbackResponse>;
  clear(sessionId: string, messageId: string, executionId?: string): Promise<FeedbackResponse>;
}

const typedFeedbackApi = assistantFeedbackApi as unknown as FeedbackApiClient;
const typedFeedbackReasonOptions = feedbackReasonOptions as unknown as Array<{
  value: NegativeFeedbackReasonCode;
  label: string;
}>;

interface MessageFeedbackActionsProps {
  sessionId: string;
  messageId: string;
  executionId?: string;
  enabled?: boolean;
}

const createEventId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `feedback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function MessageFeedbackActions({
  sessionId,
  messageId,
  executionId,
  enabled = true,
}: MessageFeedbackActionsProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [negativeOpen, setNegativeOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<NegativeFeedbackReasonCode>();
  const [comment, setComment] = useState('');
  const queryKey = useMemo(
    () => ['assistant-feedback', sessionId, messageId, executionId],
    [executionId, messageId, sessionId]
  );
  const feedbackQuery = useQuery<FeedbackResponse>(
    queryKey,
    () => typedFeedbackApi.get(sessionId, messageId, executionId),
    { enabled: enabled && Boolean(sessionId && messageId), retry: false, staleTime: 30_000 }
  );
  const feedback = feedbackQuery.data?.feedback;

  const mutation = useMutation<FeedbackResponse, Error, FeedbackInput>(
    (input: FeedbackInput) =>
      typedFeedbackApi.set(sessionId, messageId, {
        ...input,
        eventId: createEventId(),
        executionId,
      }),
    {
      onSuccess: (result) => {
        setNegativeOpen(false);
        setReasonCode(undefined);
        setComment('');
        queryClient.setQueryData(queryKey, result);
        void message.success('评价已记录');
      },
      onError: () => {
        void message.error('评价提交失败，请稍后重试');
      },
    }
  );
  const clearMutation = useMutation<FeedbackResponse, Error, void>(
    () => typedFeedbackApi.clear(sessionId, messageId, executionId),
    {
      onSuccess: (result) => {
        queryClient.setQueryData(queryKey, result);
        void message.success('评价已取消');
      },
      onError: () => {
        void message.error('取消评价失败，请稍后重试');
      },
    }
  );

  if (!enabled) return null;

  const submitNegative = () => {
    if (!reasonCode) {
      void message.warning('请选择不满意的原因');
      return;
    }
    mutation.mutate({
      rating: 'negative',
      reasonCode,
      comment: comment.trim() || undefined,
    });
  };

  const negativeContent = (
    <Space direction="vertical" size="small" style={{ width: 280 }}>
      <Radio.Group
        value={reasonCode}
        onChange={(event) => setReasonCode(event.target.value as NegativeFeedbackReasonCode)}
      >
        <Space direction="vertical">
          {typedFeedbackReasonOptions.map((option) => (
            <Radio key={option.value} value={option.value}>
              {option.label}
            </Radio>
          ))}
        </Space>
      </Radio.Group>
      <Input.TextArea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={2000}
        autoSize={{ minRows: 2, maxRows: 4 }}
        placeholder="补充说明（可选）"
      />
      <Space>
        <Button size="small" onClick={() => setNegativeOpen(false)}>
          取消
        </Button>
        <Button size="small" type="primary" loading={mutation.isLoading} onClick={submitNegative}>
          提交
        </Button>
      </Space>
    </Space>
  );

  const isBusy = mutation.isLoading || clearMutation.isLoading;
  return (
    <div className="chat-message-feedback-actions" aria-label="评价回答">
      <Tooltip title={feedback?.rating === 'positive' ? '取消赞' : '回答有帮助'}>
        <Button
          type={feedback?.rating === 'positive' ? 'primary' : 'text'}
          size="small"
          icon={<LikeOutlined />}
          disabled={isBusy}
          onClick={() => {
            if (feedback?.rating === 'positive') {
              clearMutation.mutate();
            } else {
              mutation.mutate({ rating: 'positive' });
            }
          }}
          aria-label="回答有帮助"
        />
      </Tooltip>
      <Popover
        open={negativeOpen}
        onOpenChange={setNegativeOpen}
        trigger="click"
        title="告诉我们哪里需要改进"
        content={negativeContent}
      >
        <Tooltip title={feedback?.rating === 'negative' ? '修改差评原因' : '回答需要改进'}>
          <Button
            type={feedback?.rating === 'negative' ? 'primary' : 'text'}
            danger={feedback?.rating === 'negative'}
            size="small"
            icon={<DislikeOutlined />}
            disabled={isBusy}
            aria-label="回答需要改进"
          />
        </Tooltip>
      </Popover>
    </div>
  );
}
