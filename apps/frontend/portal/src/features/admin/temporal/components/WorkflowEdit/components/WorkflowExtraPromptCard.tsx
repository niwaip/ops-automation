import React from 'react';
import { Card, Form, Input } from 'antd';

export interface WorkflowExtraPromptCardProps {
  workflowDsl: any;
  setWorkflowDsl: React.Dispatch<React.SetStateAction<any>>;
  SECTION_CARD_STYLE: React.CSSProperties;
  SECTION_CARD_BODY_STYLE: React.CSSProperties;
  renderTipLabel: (title: string, tip: string) => React.ReactNode;
}

export const WorkflowExtraPromptCard: React.FC<WorkflowExtraPromptCardProps> = ({
  workflowDsl,
  setWorkflowDsl,
  SECTION_CARD_STYLE,
  SECTION_CARD_BODY_STYLE,
  renderTipLabel,
}) => {
  return (
    <Card
      title="补足情报（指导 AI artifact 生成）"
      size="small"
      style={SECTION_CARD_STYLE}
      styles={{ body: SECTION_CARD_BODY_STYLE }}
    >
      <Form.Item
        label={renderTipLabel('额外提示词', '补充上下文给 AI，帮助生成更准确的工作流代码。')}
        style={{ marginBottom: 0 }}
      >
        <Input.TextArea
          rows={3}
          placeholder="例如：&#10;- 该工作流需要处理中文内容，请使用 utf-8 编码&#10;- 返回结果需要包含完整的错误处理逻辑&#10;- 第三方 API 调用需要添加重试机制"
          value={workflowDsl.extraPrompt || ''}
          onChange={(e) =>
            setWorkflowDsl({ ...workflowDsl, extraPrompt: e.target.value || undefined })
          }
        />
      </Form.Item>
    </Card>
  );
};
