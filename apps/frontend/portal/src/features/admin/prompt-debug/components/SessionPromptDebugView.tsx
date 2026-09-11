import React, { useMemo } from 'react';
import {
  Card,
  Space,
  Tag,
  Typography,
  Button,
  Collapse,
  Empty,
  Descriptions,
  Timeline,
  List,
} from 'antd';
import {
  CopyOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '@/features/chat/ChatMessage.css';
import type { PromptDebugRecord } from '@/features/chat/types';
import { ExecutionDto, ExecutionStepDto } from '@/api/execution';
import { AIModel } from '@/api/ai';
import { TimelineNodeCard, renderSummaryChips } from './TimelineNodeCard';

const { Text } = Typography;

const promptPreviewPreStyle: React.CSSProperties = {
  margin: '8px 0 0',
  padding: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 240,
  overflow: 'auto',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: 10,
  color: 'var(--text-primary)',
};

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const renderTag = (label: string, color?: string) => (
  <Tag color={color} style={{ marginInlineEnd: 0 }}>
    {label}
  </Tag>
);

const stringifyPretty = (value: unknown) => JSON.stringify(value, null, 2);

const beautifyText = (text: string, useDivider = true): string => {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n\s*\n\s*\n+/g, useDivider ? '\n\n---\n\n' : '\n\n')
    .replace(/^[\s\n]+|[\s\n]+$/g, '');
};

const getDebugSourceLabel = (source?: 'planner' | 'react-engine') => {
  if (source === 'planner') return 'planner';
  if (source === 'react-engine') return 'react-engine';
  return '-';
};

const previewText = (value: unknown, maxLength = 240) => {
  const text = typeof value === 'string' ? value : stringifyPretty(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const getModelDisplayName = (modelId: string | undefined, models: AIModel[]) => {
  if (!modelId) return '-';
  const matched = models.find((model) => model.id === modelId);
  return matched ? matched.name || modelId : modelId;
};

const renderMessageBubble = (role: string, content: string) => (
  <Card
    size="small"
    styles={{ body: { padding: 12 } }}
    title={
      <Space size={8}>
        <Tag color={role === 'system' ? 'purple' : role === 'assistant' ? 'green' : 'blue'}>
          {role}
        </Tag>
      </Space>
    }
  >
    <div className="chat-message-markdown" style={{ maxHeight: 240, overflow: 'auto' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{beautifyText(content)}</ReactMarkdown>
    </div>
  </Card>
);

const renderTimelineDetails = (sections: Array<{ label: string; value: unknown }>) => {
  const visibleSections = sections.filter((section) => {
    if (section.value === undefined || section.value === null) return false;
    if (typeof section.value === 'string') return section.value.trim().length > 0;
    if (Array.isArray(section.value)) return section.value.length > 0;
    if (typeof section.value === 'object') return Object.keys(section.value as Record<string, unknown>).length > 0;
    return true;
  });

  if (visibleSections.length === 0) return null;

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {visibleSections.map((section) => (
        <div key={section.label}>
          <Text strong>{section.label}</Text>
          <pre
            style={{
              margin: '8px 0 0',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 320,
              overflow: 'auto',
            }}
          >
            {typeof section.value === 'string' ? section.value : stringifyPretty(section.value)}
          </pre>
        </div>
      ))}
    </Space>
  );
};

const renderLlmCallDetails = (
  call: NonNullable<PromptDebugRecord['promptDebug']['llmCalls']>[number],
  models: AIModel[]
) => (
  <Space direction="vertical" size={12} style={{ width: '100%' }}>
    <Descriptions column={1} size="small" bordered>
      <Descriptions.Item label="模型">
        {getModelDisplayName(call.modelId, models)}
      </Descriptions.Item>
      <Descriptions.Item label="请求消息数">{call.requestMessages?.length || 0}</Descriptions.Item>
    </Descriptions>
    {(call.requestMessages || []).length ? (
      <div>
        <Text strong>LLM 请求</Text>
        <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 8 }}>
          {(call.requestMessages || []).map((message, index) => (
            <div key={`${message.role}-${index}`}>
              {renderMessageBubble(message.role, message.content)}
            </div>
          ))}
        </Space>
      </div>
    ) : null}
    {call.responseText || call.note ? (
      <div>
        <Text strong>LLM 回复</Text>
        <Card size="small" styles={{ body: { padding: 12 } }} style={{ marginTop: 8 }}>
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 320,
              overflow: 'auto',
            }}
          >
            {call.responseText || call.note || ''}
          </pre>
        </Card>
      </div>
    ) : null}
    {renderTimelineDetails([{ label: '原始节点 JSON', value: call }])}
  </Space>
);

export interface SessionPromptDebugViewProps {
  promptDebugHistory: PromptDebugRecord[];
  selectedRecord: PromptDebugRecord | null;
  onSelectRecord: (id: string) => void;
  models: AIModel[];
  execution?: ExecutionDto;
  steps?: ExecutionStepDto[];
  onCopyPrompt: (record: PromptDebugRecord) => void;
}

export const SessionPromptDebugView: React.FC<SessionPromptDebugViewProps> = ({
  promptDebugHistory,
  selectedRecord,
  onSelectRecord,
  models,
  execution,
  steps,
  onCopyPrompt,
}) => {
  const activePromptDebug = selectedRecord?.promptDebug || null;

  const timelineItems = useMemo(() => {
    const items: Array<{ color?: string; children: React.ReactNode }> = [];

    if (activePromptDebug?.llmCalls?.length) {
      activePromptDebug.llmCalls.forEach((call, index) => {
        items.push({
          color: 'blue',
          children: (
            <TimelineNodeCard
              title={`${index + 1}. ${call.label}`}
              subtitle={call.stage}
              color="blue"
              preview={
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  {renderSummaryChips([
                    { label: '模型', value: getModelDisplayName(call.modelId, models), color: 'blue' },
                    { label: '请求', value: `${call.requestMessages?.length || 0} 条`, color: 'purple' },
                  ])}
                  <Text type="secondary" style={{ display: 'block', textAlign: 'left', lineHeight: 1.6 }}>
                    {previewText(call.responseText || call.note || '无', 160)}
                  </Text>
                </Space>
              }
              details={renderLlmCallDetails(call, models)}
            />
          ),
        });
      });
    } else if (activePromptDebug) {
      items.push({
        color: 'blue',
        children: (
          <TimelineNodeCard
            title={`${getDebugSourceLabel(activePromptDebug.debugSource)} 调试快照`}
            subtitle={formatDateTime(selectedRecord?.updatedAt)}
            color="blue"
          />
        ),
      });
    }

    if (execution) {
      items.push({
        color: 'gray',
        children: (
          <TimelineNodeCard
            title="执行单已创建"
            subtitle={formatDateTime(execution.createdAt)}
            color="gray"
            preview={renderSummaryChips([{ label: '状态', value: execution.status, color: 'default' }])}
            details={renderTimelineDetails([{ label: 'Execution', value: execution }])}
          />
        ),
      });
    }

    (steps || [])
      .slice()
      .sort((a, b) => a.stepIndex - b.stepIndex)
      .forEach((step) => {
        items.push({
          color: step.status === 'failed' ? 'red' : step.status === 'succeeded' ? 'green' : 'blue',
          children: (
            <TimelineNodeCard
              title={`步骤 ${step.stepIndex + 1}: ${step.name || step.type}`}
              subtitle={`类型: ${step.type} | 状态: ${step.status}`}
              color={step.status === 'failed' ? 'red' : step.status === 'succeeded' ? 'green' : 'processing'}
              preview={
                step.errorMessage ? (
                  <Text type="danger" style={{ display: 'block', whiteSpace: 'pre-wrap' }}>
                    {previewText(step.errorMessage, 120)}
                  </Text>
                ) : null
              }
              details={renderTimelineDetails([{ label: 'Step', value: step }, { label: 'Error', value: step.errorMessage || '' }])}
            />
          ),
        });
      });

    return items;
  }, [activePromptDebug, selectedRecord, execution, steps, models]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 8fr) minmax(280px, 2fr)',
        gap: 16,
        alignItems: 'start',
      }}
    >
      <Card
        title={selectedRecord ? `会话调试记录: ${selectedRecord.id.slice(0, 16)}...` : 'Prompt 调试总览'}
        extra={
          selectedRecord ? (
            <Button icon={<CopyOutlined />} onClick={() => onCopyPrompt(selectedRecord)}>
              复制调试内容
            </Button>
          ) : null
        }
      >
        {selectedRecord && activePromptDebug ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
              <Card size="small" styles={{ body: { textAlign: 'center' } }}>
                <Text type="secondary">任务状态</Text>
                <div style={{ marginTop: 6, fontWeight: 600 }}>{selectedRecord.taskStatus || '-'}</div>
              </Card>
              <Card size="small" styles={{ body: { textAlign: 'center' } }}>
                <Text type="secondary">调试链路</Text>
                <div style={{ marginTop: 6, fontWeight: 600 }}>{getDebugSourceLabel(activePromptDebug.debugSource)}</div>
              </Card>
              <Card size="small" styles={{ body: { textAlign: 'center' } }}>
                <Text type="secondary">模型</Text>
                <div style={{ marginTop: 6, fontWeight: 600 }}>{getModelDisplayName(activePromptDebug.modelId, models)}</div>
              </Card>
              <Card size="small" styles={{ body: { textAlign: 'center' } }}>
                <Text type="secondary">LLM 节点数</Text>
                <div style={{ marginTop: 6, fontWeight: 600 }}>{activePromptDebug.llmCalls?.length || 0}</div>
              </Card>
            </div>

            {timelineItems.length ? (
              <Card size="small" title="端到端 Timeline">
                <Timeline items={timelineItems} />
              </Card>
            ) : null}

            <Collapse
              size="small"
              items={[
                {
                  key: 'prompts',
                  label: 'Prompt 提示词与决策上下文',
                  children: (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <div>
                        <Space size={6} style={{ marginBottom: 4 }}>
                          <Tag color="cyan">User Prompt / 任务现场</Tag>
                        </Space>
                        <pre style={promptPreviewPreStyle}>
                          {activePromptDebug.userPrompt || activePromptDebug.rawUserMessage || '（无用户提示词输入）'}
                        </pre>
                      </div>
                      <div>
                        <Space size={6} style={{ marginBottom: 4 }}>
                          <Tag color="purple">System Prompt / 策略约束 (真实大模型全局指令)</Tag>
                        </Space>
                        <pre style={promptPreviewPreStyle}>
                          {activePromptDebug.systemPrompt || (
                            (activePromptDebug.llmCalls?.length ?? 0) === 0
                              ? '（未发起大模型调用，由确定性规则/别名引擎直接匹配，无 System Prompt 消耗）'
                              : '（无独立系统提示词）'
                          )}
                        </pre>
                      </div>
                      {activePromptDebug.plannerSnapshot && (
                        <div>
                          <Space size={6} style={{ marginBottom: 4 }}>
                            <Tag color="orange">编排器决策推演快照 (Planner Flow Summary，非 LLM 提示词)</Tag>
                          </Space>
                          <pre
                            style={{
                              ...promptPreviewPreStyle,
                              borderColor: 'rgba(250, 140, 22, 0.35)',
                              background: 'rgba(250, 140, 22, 0.04)',
                            }}
                          >
                            {activePromptDebug.plannerSnapshot}
                          </pre>
                        </div>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          </Space>
        ) : (
          <Empty description="请从右侧列表选择一条 Prompt 记录" />
        )}
      </Card>

      <Card title={`会话记录 (${promptDebugHistory.length})`} styles={{ body: { padding: 0 } }}>
        {promptDebugHistory.length ? (
          <List
            dataSource={promptDebugHistory}
            renderItem={(item) => {
              const isActive = item.id === selectedRecord?.id;
              return (
                <List.Item
                  style={{
                    padding: 12,
                    cursor: 'pointer',
                    background: isActive ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--primary-color)' : '3px solid transparent',
                  }}
                  onClick={() => onSelectRecord(item.id)}
                >
                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    <Space wrap>
                      {renderTag(item.taskStatus || 'unknown', item.taskStatus === 'failed' ? 'error' : 'processing')}
                      {item.promptDebug.debugSource ? renderTag(getDebugSourceLabel(item.promptDebug.debugSource)) : null}
                    </Space>
                    <Text strong style={{ wordBreak: 'break-all', fontSize: 12 }}>
                      {item.executionId || item.messageId}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{formatDateTime(item.updatedAt)}</Text>
                  </Space>
                </List.Item>
              );
            }}
          />
        ) : (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Empty description="当前浏览器会话暂无 Prompt 记录" />
          </div>
        )}
      </Card>
    </div>
  );
};
