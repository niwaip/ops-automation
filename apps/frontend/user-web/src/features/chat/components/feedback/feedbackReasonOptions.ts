import type { NegativeFeedbackReasonCode } from '../../../../api/assistantFeedback';

export const feedbackReasonOptions: Array<{
  value: NegativeFeedbackReasonCode;
  label: string;
}> = [
  { value: 'answer_incorrect', label: '回答内容不正确' },
  { value: 'wrong_skill_or_workflow', label: '匹配错了技能或工作流' },
  { value: 'missing_step', label: '缺少执行步骤' },
  { value: 'wrong_parameters', label: '参数或默认值错误' },
  { value: 'wrong_output_format', label: '输出格式不符合预期' },
  { value: 'execution_failed', label: '执行失败' },
  { value: 'unsafe_or_unexpected_side_effect', label: '出现不安全或意外副作用' },
  { value: 'other', label: '其他原因' },
];
