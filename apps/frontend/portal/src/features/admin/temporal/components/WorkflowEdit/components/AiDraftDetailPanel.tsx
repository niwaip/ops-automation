import React from 'react';
import { Button, Collapse, Input, Space, Tag, Typography, Alert } from 'antd';
import { SendOutlined, CheckOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AiWorkflowDraft, AiWorkflowDraftSessionMessage } from '@/api/temporal';
import {
  renderDraftContractCard,
  renderDraftInputParamSummary,
  renderDraftOutputParamSummary,
  renderDraftStepSummary,
} from '../utils/aiDraftRenderers';

const { Text, Title } = Typography;
const { Panel } = Collapse;
const { TextArea } = Input;

export interface AiDraftDetailPanelProps {
  currentDraft: AiWorkflowDraft | null;
  messages: AiWorkflowDraftSessionMessage[];
  aiDraftInput: string;
  setAiDraftInput: (val: string) => void;
  onRefineDraft: () => void;
  onApplyDraft: () => void;
  refineLoading: boolean;
}

export const AiDraftDetailPanel: React.FC<AiDraftDetailPanelProps> = ({
  currentDraft,
  messages,
  aiDraftInput,
  setAiDraftInput,
  onRefineDraft,
  onApplyDraft,
  refineLoading,
}) => {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 顶部 Header 操作栏 */}
      {currentDraft && (
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-card)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <Space size="small">
              <Title level={5} style={{ margin: 0 }}>
                {currentDraft.name}
              </Title>
              <Tag color="blue">{currentDraft.taskQueue || 'SKILL_TASK_QUEUE'}</Tag>
            </Space>
            {currentDraft.description && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                {currentDraft.description}
              </Text>
            )}
          </div>

          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={onApplyDraft}
          >
            应用此草稿至画布
          </Button>
        </div>
      )}

      {/* 中间 Message 时间轴 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id || i}
              style={{
                display: 'flex',
                flexDirection: isUser ? 'row-reverse' : 'row',
                marginBottom: 20,
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  background: isUser ? 'var(--primary-color)' : 'var(--bg-card)',
                  color: isUser ? '#fff' : 'var(--text-primary)',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: isUser ? 'none' : '1px solid var(--border-color)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>

                {msg.draft && (
                  <div style={{ marginTop: 12 }}>
                    <Collapse defaultActiveKey={[`draft-${i}`]} size="small">
                      <Panel header="展开查看草稿结构与声明" key={`draft-${i}`}>
                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                          {renderDraftContractCard(msg.draft)}
                          <div>
                            <Text strong style={{ fontSize: 12 }}>输入参数声明:</Text>
                            <div style={{ marginTop: 4 }}>
                              {renderDraftInputParamSummary(msg.draft)}
                            </div>
                          </div>
                          <div>
                            <Text strong style={{ fontSize: 12 }}>输出结构:</Text>
                            <div style={{ marginTop: 4 }}>
                              {renderDraftOutputParamSummary(msg.draft)}
                            </div>
                          </div>
                          <div>
                            <Text strong style={{ fontSize: 12 }}>工作流步骤详情:</Text>
                            <div style={{ marginTop: 4 }}>
                              {renderDraftStepSummary(msg.draft)}
                            </div>
                          </div>
                          {msg.draft.warnings && msg.draft.warnings.length > 0 && (
                            <Alert
                              type="warning"
                              showIcon
                              message="草稿优化建议与警告"
                              description={msg.draft.warnings.join('；')}
                              style={{ marginTop: 8 }}
                            />
                          )}
                        </Space>
                      </Panel>
                    </Collapse>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {refineLoading && (
          <div style={{ display: 'flex', marginBottom: 16 }}>
            <Alert type="info" showIcon message="AI 正在思考并优化草稿中..." />
          </div>
        )}
      </div>

      {/* 底部 Input 输入框 */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-card)',
        }}
      >
        <div style={{ display: 'flex', gap: 10 }}>
          <TextArea
            value={aiDraftInput}
            onChange={(e) => setAiDraftInput(e.target.value)}
            placeholder="告诉 AI 如何修改当前草稿...（如: 添加重试机制、增加入参 email）"
            autoSize={{ minRows: 2, maxRows: 4 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onRefineDraft();
              }
            }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={onRefineDraft}
            loading={refineLoading}
            disabled={!aiDraftInput.trim()}
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  );
};
