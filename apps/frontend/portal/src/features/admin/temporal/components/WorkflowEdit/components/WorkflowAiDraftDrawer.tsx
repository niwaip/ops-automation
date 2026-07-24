import React from 'react';
import { Drawer, Space, Button, Typography, Card, Form, Input, Alert, Popconfirm, Collapse } from 'antd';
import { RobotOutlined, ThunderboltOutlined, ReloadOutlined, DeleteOutlined, SendOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const { Text, Title } = Typography;
const { Panel } = Collapse;

export interface WorkflowAiDraftDrawerProps {
  visible: boolean;
  onClose: () => void;
  currentAiDraft: any;
  handleApplyCurrentDraft: () => void;
  aiDraftMessages: any[];
  aiDraftDescription: string;
  setAiDraftDescription: (desc: string) => void;
  aiDraftReferenceUrl: string;
  setAiDraftReferenceUrl: (url: string) => void;
  generateAiDraftMutationLoading: boolean;
  handleGenerateAiDraft: () => void;
  aiDraftSessionsQuery: any;
  resolveApiErrorMessage: (err: any, fallback: string) => string;
  deleteAiDraftSessionMutation: any;
  handleDeleteAiDraftSession: (id: string) => void;
  handleResumeAiDraftSession: (id: string) => void;
  latestDraftMessageIndex: number;
  beautifyText: (str: string) => string;
  renderDraftDiffSummary: (draft: any, prev: any) => React.ReactNode;
  renderDraftContractCard: (draft: any) => React.ReactNode;
  renderDraftInputParamSummary: (draft: any) => React.ReactNode;
  renderDraftOutputParamSummary: (draft: any) => React.ReactNode;
  renderDraftStepSummary: (draft: any) => React.ReactNode;
  refineAiDraftMutationLoading: boolean;
  aiDraftInput: string;
  setAiDraftInput: (val: string) => void;
  handleRefineAiDraft: () => void;
}

export const WorkflowAiDraftDrawer: React.FC<WorkflowAiDraftDrawerProps> = ({
  visible,
  onClose,
  currentAiDraft,
  handleApplyCurrentDraft,
  aiDraftMessages,
  aiDraftDescription,
  setAiDraftDescription,
  aiDraftReferenceUrl,
  setAiDraftReferenceUrl,
  generateAiDraftMutationLoading,
  handleGenerateAiDraft,
  aiDraftSessionsQuery,
  resolveApiErrorMessage,
  deleteAiDraftSessionMutation,
  handleDeleteAiDraftSession,
  handleResumeAiDraftSession,
  latestDraftMessageIndex,
  beautifyText,
  renderDraftDiffSummary,
  renderDraftContractCard,
  renderDraftInputParamSummary,
  renderDraftOutputParamSummary,
  renderDraftStepSummary,
  refineAiDraftMutationLoading,
  aiDraftInput,
  setAiDraftInput,
  handleRefineAiDraft,
}) => {
  return (
    <Drawer
      title={
        <Space>
          <RobotOutlined />
          <span>AI 辅助工作流编排</span>
        </Space>
      }
      open={visible}
      onClose={onClose}
      width={720}
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" disabled={!currentAiDraft} onClick={handleApplyCurrentDraft}>
            应用草稿
          </Button>
        </Space>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 20 }}>
          {aiDraftMessages.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <RobotOutlined
                style={{
                  fontSize: 48,
                  color: 'var(--primary-color)',
                  opacity: 0.2,
                  marginBottom: 16,
                }}
              />
              <Title level={4}>开始起草工作流</Title>
              <Text type="secondary">
                您可以输入业务需求说明，或者提供参考 URL（如 API 文档），AI 将为您生成初步的 Temporal 工作流 DSL。
              </Text>

              <Card style={{ marginTop: 24, textAlign: 'left' }} size="small">
                <Form layout="vertical">
                  <Form.Item label="业务需求说明" required>
                    <Input.TextArea
                      rows={4}
                      value={aiDraftDescription}
                      onChange={(e) => setAiDraftDescription(e.target.value)}
                      placeholder="例如：创建一个查询天气并发送通知的流程。"
                    />
                  </Form.Item>
                  <Form.Item label="参考 URL (可选)">
                    <Input
                      value={aiDraftReferenceUrl}
                      onChange={(e) => setAiDraftReferenceUrl(e.target.value)}
                      placeholder="例如：https://wttr.in/beijing?format=j1"
                    />
                  </Form.Item>
                  <Button
                    type="primary"
                    block
                    icon={<ThunderboltOutlined />}
                    loading={generateAiDraftMutationLoading}
                    onClick={handleGenerateAiDraft}
                  >
                    生成初始草稿
                  </Button>
                </Form>
              </Card>

              <Card style={{ marginTop: 16, textAlign: 'left' }} size="small">
                <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text strong>继续上次草稿会话</Text>
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={aiDraftSessionsQuery.isFetching}
                    onClick={() => {
                      void aiDraftSessionsQuery.refetch();
                    }}
                  >
                    刷新
                  </Button>
                </Space>
                {aiDraftSessionsQuery.isLoading ? (
                  <Alert type="info" showIcon message="正在加载最近草稿会话..." />
                ) : aiDraftSessionsQuery.isError ? (
                  <Alert
                    type="error"
                    showIcon
                    message="加载历史草稿会话失败"
                    description={resolveApiErrorMessage(
                      aiDraftSessionsQuery.error,
                      '请检查登录状态；如果登录已过期，请重新登录后再试。'
                    )}
                  />
                ) : (aiDraftSessionsQuery.data || []).length === 0 ? (
                  <Alert type="info" showIcon message="暂无历史草稿会话，可直接创建新的草稿。" />
                ) : (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    {(aiDraftSessionsQuery.data || []).map((session: any) => (
                      <Card key={session.sessionId} size="small">
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Text strong>{session.title || session.currentDraftName || '未命名会话'}</Text>
                          <Space>
                            <Popconfirm
                              title="删除草稿会话"
                              onConfirm={() => handleDeleteAiDraftSession(session.sessionId)}
                            >
                              <Button
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                loading={
                                  deleteAiDraftSessionMutation.isLoading &&
                                  deleteAiDraftSessionMutation.variables === session.sessionId
                                }
                              >
                                删除
                              </Button>
                            </Popconfirm>
                            <Button
                              size="small"
                              type="primary"
                              onClick={() => handleResumeAiDraftSession(session.sessionId)}
                            >
                              继续
                            </Button>
                          </Space>
                        </Space>
                      </Card>
                    ))}
                  </Space>
                )}
              </Card>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {aiDraftMessages.map((msg, i) => {
                const isLatestDraft = Boolean(msg.draft) && i === latestDraftMessageIndex;
                const previousDraft = msg.draft
                  ? [...aiDraftMessages.slice(0, i)].reverse().find((item) => Boolean(item.draft))?.draft
                  : undefined;
                return (
                  <div
                    key={i}
                    style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      background: msg.role === 'user' ? 'var(--primary-color)' : 'var(--bg-secondary)',
                      color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                      padding: '10px 14px',
                      borderRadius: 12,
                    }}
                  >
                    <div>
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{beautifyText(msg.content)}</ReactMarkdown>
                      ) : (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                      )}
                    </div>
                    {msg.draft && (
                      <div style={{ marginTop: 10, borderTop: '1px solid var(--border-color)', paddingTop: 10 }}>
                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                          {renderDraftDiffSummary(msg.draft, previousDraft)}
                          {isLatestDraft ? (
                            <>
                              {renderDraftContractCard(msg.draft)}
                              {renderDraftInputParamSummary(msg.draft)}
                              {renderDraftOutputParamSummary(msg.draft)}
                              {renderDraftStepSummary(msg.draft)}
                            </>
                          ) : (
                            <Collapse size="small" ghost>
                              <Panel header="展开查看历史草稿" key={`draft-${i}`}>
                                {renderDraftStepSummary(msg.draft)}
                              </Panel>
                            </Collapse>
                          )}
                        </Space>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {aiDraftMessages.length > 0 && (
          <div style={{ paddingTop: 16, borderTop: '1px solid var(--bg-secondary)' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input.TextArea
                rows={2}
                value={aiDraftInput}
                onChange={(e) => setAiDraftInput(e.target.value)}
                placeholder="提出修改建议..."
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={refineAiDraftMutationLoading}
                onClick={handleRefineAiDraft}
              />
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
};
