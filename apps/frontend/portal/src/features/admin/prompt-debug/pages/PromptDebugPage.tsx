import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Empty,
  Input,
  List,
  Space,
  Switch,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CopyOutlined,
  DownOutlined,
  InfoCircleOutlined,
  SearchOutlined,
  MessageOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '@/features/chat/ChatMessage.css';
import { useChatStore } from '@/features/chat';
import type { PromptDebugRecord } from '@/features/chat/types';
import { executionApi, ExecutionDto, ExecutionStepDto } from '@/api/execution';
import { aiModelApi, AIModel } from '@/api/ai';
import {
  extractBrowserExecutionResult,
  hasBrowserExecutionEvidence,
} from '@/features/executions/lib/browser';

const { Title, Text } = Typography;

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
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const renderTag = (label: string, color?: string) => (
  <Tag color={color} style={{ marginInlineEnd: 0 }}>
    {label}
  </Tag>
);

const stringifyPretty = (value: unknown) => JSON.stringify(value, null, 2);

// 美化文本内容，处理连续换行
const beautifyText = (text: string, useDivider = true): string => {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n') // 统一换行符
    .replace(/[ \t]+\n/g, '\n') // 去除行尾空格
    .replace(/\n\s*\n\s*\n+/g, useDivider ? '\n\n---\n\n' : '\n\n') // 将3个及以上的连续换行替换为分割线
    .replace(/^[\s\n]+|[\s\n]+$/g, ''); // 去除首尾空白
};

const hasDetailedLlmCalls = (promptDebug?: PromptDebugRecord['promptDebug'] | null) =>
  Boolean(promptDebug?.llmCalls?.length);

const getDebugSourceLabel = (source?: 'planner' | 'react-engine') => {
  if (source === 'planner') {
    return 'planner';
  }
  if (source === 'react-engine') {
    return 'react-engine';
  }
  return '-';
};

const previewText = (value: unknown, maxLength = 240) => {
  const text = typeof value === 'string' ? value : stringifyPretty(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const getModelDisplayName = (modelId: string | undefined, models: AIModel[]) => {
  if (!modelId) {
    return '-';
  }
  const matched = models.find((model) => model.id === modelId);
  if (!matched) {
    return modelId;
  }
  return matched.name || modelId;
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
    if (section.value === undefined || section.value === null) {
      return false;
    }
    if (typeof section.value === 'string') {
      return section.value.trim().length > 0;
    }
    if (Array.isArray(section.value)) {
      return section.value.length > 0;
    }
    if (typeof section.value === 'object') {
      return Object.keys(section.value as Record<string, unknown>).length > 0;
    }
    return true;
  });

  if (visibleSections.length === 0) {
    return null;
  }

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

const renderSummaryChips = (
  items: Array<{ label: string; value: React.ReactNode; color?: string }>
) => {
  const visibleItems = items.filter((item) => {
    if (item.value === undefined || item.value === null) {
      return false;
    }
    if (typeof item.value === 'string') {
      return item.value.trim().length > 0;
    }
    return true;
  });

  if (!visibleItems.length) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'flex-start',
      }}
    >
      {visibleItems.map((item) => (
        <Tag
          key={`${item.label}-${String(item.value)}`}
          color={item.color}
          style={{
            marginInlineEnd: 0,
            paddingInline: 10,
            paddingBlock: 4,
            borderRadius: 999,
          }}
        >
          <Space size={4}>
            <Text type="secondary">{item.label}</Text>
            <Text strong>{item.value}</Text>
          </Space>
        </Tag>
      ))}
    </div>
  );
};

const getTimelineCardTone = (color?: string) => {
  switch (color) {
    case 'green':
      return {
        borderColor: 'rgba(16, 185, 129, 0.28)',
        background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, var(--bg-card) 100%)',
        accent: 'var(--success-color)',
      };
    case 'red':
      return {
        borderColor: 'rgba(239, 68, 68, 0.28)',
        background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.12) 0%, var(--bg-card) 100%)',
        accent: 'var(--error-color)',
      };
    case 'processing':
      return {
        borderColor: 'rgba(59, 130, 246, 0.28)',
        background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.12) 0%, var(--bg-card) 100%)',
        accent: 'var(--info-color)',
      };
    case 'gray':
      return {
        borderColor: 'var(--border-color)',
        background: 'linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-card) 100%)',
        accent: 'var(--text-light)',
      };
    case 'blue':
    default:
      return {
        borderColor: 'rgba(99, 102, 241, 0.28)',
        background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.12) 0%, var(--bg-card) 100%)',
        accent: 'var(--primary-color)',
      };
  }
};

const TimelineNodeCard: React.FC<{
  title: string;
  subtitle?: string;
  preview?: React.ReactNode;
  color?: string;
  details?: React.ReactNode;
}> = ({ title, subtitle, preview, color, details }) => {
  const [expanded, setExpanded] = useState(false);
  const canToggle = Boolean(details);
  const tone = getTimelineCardTone(color);
  const toggleExpanded = () => {
    if (!canToggle) {
      return;
    }
    setExpanded((value) => !value);
  };

  return (
    <Card
      size="small"
      styles={{ body: { padding: 12 } }}
      style={{
        borderRadius: 12,
        borderColor: tone.borderColor,
        background: tone.background,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <div
          onClick={toggleExpanded}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && canToggle) {
              event.preventDefault();
              toggleExpanded();
            }
          }}
          role={canToggle ? 'button' : undefined}
          tabIndex={canToggle ? 0 : undefined}
          style={{
            width: '100%',
            cursor: canToggle ? 'pointer' : 'default',
            borderRadius: 10,
            padding: 6,
          }}
        >
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
            <Space
              direction="vertical"
              size={2}
              style={{ minWidth: 0, flex: 1, alignItems: 'flex-start', textAlign: 'left' }}
            >
              <div
                style={{
                  width: '100%',
                  height: 3,
                  borderRadius: 999,
                  background: tone.accent,
                  opacity: 0.18,
                  marginBottom: 6,
                }}
              />
              <Text strong style={{ width: '100%', textAlign: 'left' }}>
                {title}
              </Text>
              {subtitle ? (
                <Text type="secondary" style={{ width: '100%', textAlign: 'left' }}>
                  {subtitle}
                </Text>
              ) : null}
            </Space>
            {details ? (
              <Button
                type="text"
                size="small"
                icon={expanded ? <DownOutlined /> : <RightOutlined />}
                style={{
                  color: tone.accent,
                  background: 'var(--bg-card)',
                  borderRadius: 999,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleExpanded();
                }}
              />
            ) : null}
          </Space>
        </div>
        {preview ? <div style={{ paddingTop: 4 }}>{preview}</div> : null}
        {expanded && details ? <div style={{ paddingTop: 4 }}>{details}</div> : null}
      </Space>
    </Card>
  );
};

const buildTimelineItems = (
  promptDebug: PromptDebugRecord['promptDebug'] | null,
  models: AIModel[],
  execution?: ExecutionDto,
  steps?: ExecutionStepDto[],
  recordUpdatedAt?: string,
  displayRuntimeType?: string
) => {
  const items: Array<{
    color?: string;
    children: React.ReactNode;
  }> = [];

  if (promptDebug?.llmCalls?.length) {
    promptDebug.llmCalls.forEach((call, index) => {
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
                  {
                    label: '模型',
                    value: getModelDisplayName(call.modelId, models),
                    color: 'blue',
                  },
                  {
                    label: '请求',
                    value: `${call.requestMessages?.length || 0} 条`,
                    color: 'purple',
                  },
                ])}
                <Text
                  type="secondary"
                  style={{
                    display: 'block',
                    textAlign: 'left',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.6,
                  }}
                >
                  {previewText(call.responseText || call.note || '无', 160)}
                </Text>
              </Space>
            }
            details={renderLlmCallDetails(call, models)}
          />
        ),
      });
    });
  } else if (promptDebug) {
    items.push({
      color: 'blue',
      children: (
        <TimelineNodeCard
          title={`${getDebugSourceLabel(promptDebug.debugSource)} 调试快照`}
          subtitle={formatDateTime(recordUpdatedAt)}
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
          preview={renderSummaryChips([
            { label: '状态', value: execution.status, color: 'default' },
          ])}
          details={renderTimelineDetails([
            { label: 'Execution', value: execution },
            { label: 'Normalized Input', value: execution.normalizedInput || {} },
          ])}
        />
      ),
    });

    if (execution.startedAt) {
      items.push({
        color: 'processing',
        children: (
          <TimelineNodeCard
            title="开始执行"
            subtitle={formatDateTime(execution.startedAt)}
            color="processing"
            preview={renderSummaryChips([
              { label: '运行类型', value: displayRuntimeType || execution.runtimeType || '-', color: 'processing' },
              { label: '风险等级', value: execution.riskLevel || '-', color: 'orange' },
            ])}
            details={renderTimelineDetails([
              {
                label: 'Execution Runtime',
                value: {
                  runtimeType: displayRuntimeType || execution.runtimeType,
                  riskLevel: execution.riskLevel,
                  currentStepId: execution.currentStepId,
                },
              },
            ])}
          />
        ),
      });
    }
  }

  (steps || [])
    .slice()
    .sort((left, right) => left.stepIndex - right.stepIndex)
    .forEach((step) => {
      items.push({
        color: step.status === 'failed' ? 'red' : step.status === 'succeeded' ? 'green' : 'blue',
        children: (
          <TimelineNodeCard
            title={`步骤 ${step.stepIndex + 1}: ${step.name || step.type}`}
            subtitle={`类型: ${step.type} | 状态: ${step.status}`}
            color={
              step.status === 'failed'
                ? 'red'
                : step.status === 'succeeded'
                  ? 'green'
                  : 'processing'
            }
            preview={
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {renderSummaryChips([
                  { label: '开始', value: formatDateTime(step.startedAt), color: 'blue' },
                  { label: '结束', value: formatDateTime(step.endedAt), color: 'default' },
                ])}
                {step.errorMessage ? (
                  <Text
                    type="danger"
                    style={{
                      display: 'block',
                      textAlign: 'left',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      lineHeight: 1.6,
                    }}
                  >
                    {previewText(step.errorMessage, 120)}
                  </Text>
                ) : null}
              </Space>
            }
            details={renderTimelineDetails([
              { label: 'Step', value: step },
              { label: 'Input', value: step.input || {} },
              { label: 'Output', value: step.output || {} },
              { label: 'Target', value: step.target || {} },
              { label: 'Error', value: step.errorMessage || '' },
            ])}
          />
        ),
      });
    });

  if (execution?.status) {
    const isSucceeded = execution.status === 'succeeded';
    const isFailed = execution.status === 'failed';
    items.push({
      color: isFailed ? 'red' : isSucceeded ? 'green' : 'blue',
      children: (
        <TimelineNodeCard
          title={isSucceeded ? '执行完成' : isFailed ? '执行失败' : `当前状态: ${execution.status}`}
          subtitle={formatDateTime(execution.endedAt || execution.updatedAt)}
          color={isFailed ? 'red' : isSucceeded ? 'green' : 'processing'}
          preview={
            execution.failureReason ? (
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {renderSummaryChips([{ label: '状态', value: execution.status, color: 'red' }])}
                <Text
                  type="danger"
                  style={{
                    display: 'block',
                    textAlign: 'left',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.6,
                  }}
                >
                  {previewText(execution.failureReason, 160)}
                </Text>
              </Space>
            ) : execution.result ? (
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {renderSummaryChips([
                  { label: '状态', value: execution.status, color: isSucceeded ? 'green' : 'blue' },
                ])}
                <Text
                  type="secondary"
                  style={{
                    display: 'block',
                    textAlign: 'left',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.6,
                  }}
                >
                  {previewText(execution.result, 160)}
                </Text>
              </Space>
            ) : (
              renderSummaryChips([
                { label: '状态', value: execution.status, color: isSucceeded ? 'green' : 'blue' },
              ])
            )
          }
          details={renderTimelineDetails([
            { label: 'Execution', value: execution },
            { label: 'Result', value: execution.result || {} },
            { label: 'Failure Reason', value: execution.failureReason || '' },
          ])}
        />
      ),
    });
  }

  return items;
};

const PromptDebugPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const promptDebugHistory = useChatStore((state) => state.promptDebugHistory);
  const setOpen = useChatStore((state) => state.setOpen);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [executionIdInput, setExecutionIdInput] = useState(searchParams.get('executionId') || '');

  useEffect(() => {
    if (!promptDebugHistory.length) {
      setSelectedRecordId(null);
      return;
    }
    if (!selectedRecordId || !promptDebugHistory.some((item) => item.id === selectedRecordId)) {
      setSelectedRecordId(promptDebugHistory[0].id);
    }
  }, [promptDebugHistory, selectedRecordId]);

  const selectedRecord = useMemo(
    () =>
      promptDebugHistory.find((item) => item.id === selectedRecordId) ||
      promptDebugHistory[0] ||
      null,
    [promptDebugHistory, selectedRecordId]
  );
  const selectedExecutionId =
    searchParams.get('executionId') || selectedRecord?.executionId || undefined;

  const executionQuery = useQuery(
    ['prompt-debug-execution', selectedExecutionId],
    () => executionApi.getById(selectedExecutionId!),
    {
      enabled: Boolean(selectedExecutionId),
      retry: false,
    }
  );

  const executionStepsQuery = useQuery(
    ['prompt-debug-execution-steps', selectedExecutionId],
    () => executionApi.getSteps(selectedExecutionId!),
    {
      enabled: Boolean(selectedExecutionId),
      retry: false,
    }
  );

  const debugSettingsQuery = useQuery(
    ['prompt-debug-settings'],
    () => aiModelApi.getDebugSettings(),
    {
      retry: false,
    }
  );

  const modelsQuery = useQuery(['prompt-debug-models'], () => aiModelApi.listForAdmin(), {
    retry: false,
  });

  const updateDebugSettingsMutation = useMutation(
    (promptDebugEnabled: boolean) => aiModelApi.updateDebugSettings({ promptDebugEnabled }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['prompt-debug-settings']);
        message.success('调试开关已更新');
      },
      onError: () => {
        message.error('调试开关更新失败');
      },
    }
  );

  const executionPromptDebug = useMemo(() => {
    const normalizedInput = executionQuery.data?.normalizedInput as
      | Record<string, unknown>
      | undefined;
    const promptDebug = normalizedInput?.promptDebug;
    if (promptDebug && typeof promptDebug === 'object' && !Array.isArray(promptDebug)) {
      return promptDebug as PromptDebugRecord['promptDebug'];
    }
    return null;
  }, [executionQuery.data]);
  const promptDebugBrowserExecutionResult = useMemo(
    () => extractBrowserExecutionResult(executionQuery.data?.resultJson),
    [executionQuery.data?.resultJson]
  );
  const promptDebugRuntimeSessionId =
    executionQuery.data?.runtimeSessionId || promptDebugBrowserExecutionResult?.runtimeSessionId;
  const promptDebugDisplayRuntimeType = useMemo(
    () =>
      hasBrowserExecutionEvidence({
        runtimeType: executionQuery.data?.runtimeType,
        runtimeSessionId: promptDebugRuntimeSessionId,
        browserExecutionResult: promptDebugBrowserExecutionResult,
        phases: executionQuery.data?.phases || [],
      })
        ? 'browser'
        : executionQuery.data?.runtimeType || '-',
    [
      executionQuery.data?.phases,
      executionQuery.data?.runtimeType,
      promptDebugBrowserExecutionResult,
      promptDebugRuntimeSessionId,
    ]
  );

  const executionTimelineItems = useMemo(
    () =>
      buildTimelineItems(
        executionPromptDebug || selectedRecord?.promptDebug || null,
        modelsQuery.data?.models || [],
        executionQuery.data,
        executionStepsQuery.data,
        selectedRecord?.updatedAt,
        promptDebugDisplayRuntimeType
      ),
    [
      executionPromptDebug,
      modelsQuery.data?.models,
      promptDebugDisplayRuntimeType,
      executionQuery.data,
      executionStepsQuery.data,
      selectedRecord,
    ]
  );
  const activePromptDebug = executionPromptDebug || selectedRecord?.promptDebug || null;
  const activeUpdatedAt = executionQuery.data?.updatedAt || selectedRecord?.updatedAt;

  const handleCopyPrompt = async (record: PromptDebugRecord) => {
    const content = [
      '## Debug Source',
      record.promptDebug.debugSource || '',
      '',
      '## System Prompt',
      record.promptDebug.systemPrompt || '',
      '',
      '## User Prompt',
      record.promptDebug.userPrompt || '',
      '',
      '## Notes',
      (record.promptDebug.notes || []).join('\n'),
      '',
      '## LLM Request Messages',
      stringifyPretty(record.promptDebug.llmRequestMessages || []),
      '',
      '## LLM Raw Response',
      record.promptDebug.llmResponseText || '',
      '',
      '## LLM Calls',
      stringifyPretty(record.promptDebug.llmCalls || []),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(content);
      message.success('Prompt 已复制');
    } catch {
      message.error('复制失败');
    }
  };

  const handleCopyExecutionPrompt = async () => {
    if (!executionPromptDebug) {
      return;
    }
    const content = [
      '## Debug Source',
      executionPromptDebug.debugSource || '',
      '',
      '## System Prompt',
      executionPromptDebug.systemPrompt || '',
      '',
      '## User Prompt',
      executionPromptDebug.userPrompt || '',
      '',
      '## Notes',
      (executionPromptDebug.notes || []).join('\n'),
      '',
      '## LLM Request Messages',
      stringifyPretty(executionPromptDebug.llmRequestMessages || []),
      '',
      '## LLM Raw Response',
      executionPromptDebug.llmResponseText || '',
      '',
      '## LLM Calls',
      stringifyPretty(executionPromptDebug.llmCalls || []),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(content);
      message.success('执行单 Prompt 已复制');
    } catch {
      message.error('复制失败');
    }
  };

  const handleSearchExecution = () => {
    const nextId = executionIdInput.trim();
    if (!nextId) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('executionId');
      setSearchParams(nextParams);
      return;
    }
    setSearchParams({ executionId: nextId });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <div>
              <Space size={8} align="center">
                <Title level={3} style={{ margin: 0 }}>
                  Prompt 调试台
                </Title>
                <Tooltip
                  title={`当前页面展示前端内存中的最近 20 条 Prompt 调试记录。请使用管理员账号，在聊天窗口切到 task 模式执行一轮任务；有了新记录后，这里会自动出现。也可以直接输入 executionId 查询执行单里落库的调试快照。当前系统调试开关：${debugSettingsQuery.data?.promptDebugEnabled === false ? '关闭' : '开启'}`}
                >
                  <InfoCircleOutlined style={{ color: 'var(--text-light)', fontSize: 16 }} />
                </Tooltip>
              </Space>
            </div>
            <Space wrap>
              <Space size={8}>
                <Text type="secondary">系统调试</Text>
                <Switch
                  checked={Boolean(debugSettingsQuery.data?.promptDebugEnabled)}
                  loading={debugSettingsQuery.isLoading || updateDebugSettingsMutation.isLoading}
                  onChange={(checked) => updateDebugSettingsMutation.mutate(checked)}
                />
              </Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setSelectedRecordId(promptDebugHistory[0]?.id || null)}
              >
                定位最新一轮
              </Button>
              <Button type="primary" icon={<MessageOutlined />} onClick={() => setOpen(true)}>
                打开聊天窗口
              </Button>
            </Space>
          </Space>
          <Space wrap style={{ width: '100%' }}>
            <Input
              value={executionIdInput}
              onChange={(e) => setExecutionIdInput(e.target.value)}
              placeholder="输入 executionId，例如 6605130a-3080-4b5f-8f44-e51081c02981"
              style={{ width: 420, maxWidth: '100%' }}
              onPressEnter={handleSearchExecution}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearchExecution}>
              查询执行单
            </Button>
          </Space>
        </Space>
      </Card>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 8fr) minmax(280px, 2fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <Card
          title={selectedExecutionId ? `执行单调试快照: ${selectedExecutionId}` : 'Prompt 调试总览'}
          extra={
            activePromptDebug ? (
              <Button
                icon={<CopyOutlined />}
                onClick={() =>
                  executionPromptDebug
                    ? handleCopyExecutionPrompt()
                    : selectedRecord
                      ? handleCopyPrompt(selectedRecord)
                      : undefined
                }
              >
                复制调试内容
              </Button>
            ) : null
          }
        >
          {selectedExecutionId && executionQuery.isLoading ? (
            <Text type="secondary">正在加载执行单详情...</Text>
          ) : selectedExecutionId && executionQuery.isError ? (
            <Alert
              type="error"
              showIcon
              message="执行单详情加载失败"
              description="请确认 executionId 是否正确，且 control-plane 服务可访问。"
            />
          ) : activePromptDebug || executionQuery.data || selectedRecord ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {executionQuery.data && !executionPromptDebug ? (
                <Alert
                  type="warning"
                  showIcon
                  message="这条执行单还没有落库的 Prompt 调试快照"
                  description="如果是本次改造之前创建的执行单，无法自动补回历史 Prompt。后续新创建的执行单会把规划阶段调试快照写入 execution.normalizedInput.promptDebug。"
                />
              ) : null}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                <Card size="small" styles={{ body: { textAlign: 'center' } }}>
                  <Text type="secondary">执行状态</Text>
                  <div style={{ marginTop: 6, fontWeight: 600 }}>
                    {executionQuery.data?.status || selectedRecord?.taskStatus || '-'}
                  </div>
                </Card>
                <Card size="small" styles={{ body: { textAlign: 'center' } }}>
                  <Text type="secondary">调试链路</Text>
                  <div style={{ marginTop: 6, fontWeight: 600 }}>
                    {getDebugSourceLabel(activePromptDebug?.debugSource)}
                  </div>
                </Card>
                <Card size="small" styles={{ body: { textAlign: 'center' } }}>
                  <Text type="secondary">模型</Text>
                  <div style={{ marginTop: 6, fontWeight: 600, wordBreak: 'break-word' }}>
                    {getModelDisplayName(
                      activePromptDebug?.modelId,
                      modelsQuery.data?.models || []
                    )}
                  </div>
                </Card>
                <Card size="small" styles={{ body: { textAlign: 'center' } }}>
                  <Text type="secondary">LLM 节点数</Text>
                  <div style={{ marginTop: 6, fontWeight: 600 }}>
                    {activePromptDebug?.llmCalls?.length || 0}
                  </div>
                </Card>
              </div>

              {(activePromptDebug?.notes || []).length ? (
                <Alert
                  type="info"
                  showIcon
                  message="当前链路说明"
                  description={(activePromptDebug?.notes || []).join('\n')}
                />
              ) : null}

              {executionTimelineItems.length ? (
                <Card size="small" title="端到端 Timeline">
                  <Timeline items={executionTimelineItems} />
                </Card>
              ) : (
                <Empty description="当前没有可展示的 Timeline 数据" />
              )}

              {activePromptDebug ? (
                <Collapse
                  size="small"
                  items={[
                    {
                      key: 'context',
                      label: '补充上下文',
                      children: (
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                          <div>
                            <Text strong>Prompt Sections</Text>
                            <div
                              style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}
                            >
                              {(activePromptDebug.systemPromptSectionKeys || []).map((key) => (
                                <Tag key={`summary-system-${key}`}>{key}</Tag>
                              ))}
                              {(activePromptDebug.userPromptSectionKeys || []).map((key) => (
                                <Tag key={`summary-user-${key}`}>{key}</Tag>
                              ))}
                              {!(
                                activePromptDebug.systemPromptSectionKeys?.length ||
                                activePromptDebug.userPromptSectionKeys?.length
                              ) ? (
                                <Text type="secondary">无</Text>
                              ) : null}
                            </div>
                          </div>
                          <div>
                            <Text strong>System Prompt</Text>
                            <pre style={promptPreviewPreStyle}>
                              {activePromptDebug.systemPrompt || ''}
                            </pre>
                          </div>
                          <div>
                            <Text strong>User Prompt</Text>
                            <pre style={promptPreviewPreStyle}>
                              {activePromptDebug.userPrompt || ''}
                            </pre>
                          </div>
                          {!hasDetailedLlmCalls(activePromptDebug) ? (
                            <>
                              <div>
                                <Text strong>LLM Request Messages</Text>
                                <pre style={promptPreviewPreStyle}>
                                  {stringifyPretty(activePromptDebug.llmRequestMessages || [])}
                                </pre>
                              </div>
                              <div>
                                <Text strong>LLM Raw Response</Text>
                                <pre style={promptPreviewPreStyle}>
                                  {activePromptDebug.llmResponseText ||
                                    '当前仅记录了 Prompt，尚未保存模型原始回复。'}
                                </pre>
                              </div>
                            </>
                          ) : null}
                        </Space>
                      ),
                    },
                  ]}
                />
              ) : null}

              <Collapse
                size="small"
                items={[
                  {
                    key: 'execution-meta',
                    label: '执行单元信息',
                    children: (
                      <Descriptions column={2} size="small" bordered>
                        <Descriptions.Item label="执行单 ID">
                          {selectedExecutionId || selectedRecord?.executionId || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Session ID">
                          {selectedRecord?.sessionId || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="运行类型">
                          {promptDebugDisplayRuntimeType}
                        </Descriptions.Item>
                        <Descriptions.Item label="技能 ID">
                          {executionQuery.data?.skillId || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="创建时间">
                          {formatDateTime(
                            selectedRecord?.createdAt || executionQuery.data?.createdAt
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label="更新时间">
                          {formatDateTime(activeUpdatedAt)}
                        </Descriptions.Item>
                      </Descriptions>
                    ),
                  },
                ]}
              />
            </Space>
          ) : (
            <Empty description="请选择一条 Prompt 记录" />
          )}
        </Card>

        <Card title={`历史记录 (${promptDebugHistory.length})`} styles={{ body: { padding: 0 } }}>
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
                      borderLeft: isActive
                        ? '3px solid var(--primary-color)'
                        : '3px solid transparent',
                    }}
                    onClick={() => setSelectedRecordId(item.id)}
                  >
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Space wrap>
                        {renderTag(
                          item.taskStatus || 'unknown',
                          item.taskStatus === 'failed' ? 'error' : 'processing'
                        )}
                        {item.promptDebug.debugSource
                          ? renderTag(getDebugSourceLabel(item.promptDebug.debugSource))
                          : null}
                      </Space>
                      <Text strong style={{ wordBreak: 'break-all' }}>
                        {item.executionId || item.messageId}
                      </Text>
                      <Text type="secondary">{formatDateTime(item.updatedAt)}</Text>
                      <Text type="secondary" ellipsis>
                        {previewText(
                          item.promptDebug.userPrompt || item.promptDebug.systemPrompt || '-',
                          60
                        )}
                      </Text>
                    </Space>
                  </List.Item>
                );
              }}
            />
          ) : (
            <div style={{ padding: 32 }}>
              <Empty description="还没有 Prompt 调试记录" />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default PromptDebugPage;
