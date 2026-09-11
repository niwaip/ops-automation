import React, { useState, useEffect } from 'react';
import {
  Card,
  Space,
  Button,
  Input,
  Typography,
  Switch,
  Segmented,
  Tooltip,
  List,
  Tag,
  Empty,
  Badge,
  Select,
  message,
} from 'antd';
import {
  BugOutlined,
  ReloadOutlined,
  MessageOutlined,
  SearchOutlined,
  InfoCircleOutlined,
  BranchesOutlined,
  HistoryOutlined,
  AuditOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import { useChatStore } from '@/features/chat';
import { executionApi, ExecutionDto } from '@/api/execution';
import { aiModelApi } from '@/api/ai';
import { useFailedExecutions } from '../hooks/useFailedExecutions';
import { PromptTraceFlowView } from '../components/PromptTraceFlowView';
import { SessionPromptDebugView } from '../components/SessionPromptDebugView';

const { Title, Text } = Typography;

export const PromptDebugPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const promptDebugHistory = useChatStore((state) => state.promptDebugHistory);
  const setOpen = useChatStore((state) => state.setOpen);
  const setDraftMessage = useChatStore((state) => state.setDraftMessage);

  // Tab mode: 'audit' (工单调用链与故障审计) vs 'session' (即时会话调试)
  const [activeTab, setActiveTab] = useState<'audit' | 'session'>('audit');

  // Audit Mode hook
  const {
    executions,
    loading: loadingExecutions,
    refreshing: refreshingExecutions,
    refetch: refetchExecutions,
    statusFilter,
    setStatusFilter,
    keyword,
    setKeyword,
    page,
    setPage,
    total,
  } = useFailedExecutions({ initialStatus: 'all', pageSize: 25 });

  // Selected execution for Audit mode
  const [selectedExecution, setSelectedExecution] = useState<ExecutionDto | null>(null);

  // Direct executionId search
  const [executionIdInput, setExecutionIdInput] = useState(searchParams.get('executionId') || '');

  // Session Debug State
  const [selectedSessionRecordId, setSelectedSessionRecordId] = useState<string | null>(null);

  // Fetch Steps for the selected execution
  const executionIdToTrace = selectedExecution?.id || searchParams.get('executionId') || undefined;

  const stepsQuery = useQuery(
    ['prompt-debug-execution-steps', executionIdToTrace],
    () => executionApi.getSteps(executionIdToTrace!),
    {
      enabled: Boolean(executionIdToTrace),
      staleTime: 10000,
    }
  );

  const directExecutionQuery = useQuery(
    ['prompt-debug-direct-execution', searchParams.get('executionId')],
    () => executionApi.getById(searchParams.get('executionId')!),
    {
      enabled: Boolean(searchParams.get('executionId')),
      onSuccess: (data) => {
        setSelectedExecution(data);
        setActiveTab('audit');
      },
    }
  );

  // Debug settings
  const debugSettingsQuery = useQuery(['prompt-debug-settings'], () => aiModelApi.getDebugSettings(), {
    retry: false,
  });

  const modelsQuery = useQuery(['prompt-debug-models'], () => aiModelApi.listForAdmin(), {
    retry: false,
  });

  const updateDebugSettingsMutation = useMutation(
    (promptDebugEnabled: boolean) => aiModelApi.updateDebugSettings({ promptDebugEnabled }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['prompt-debug-settings']);
        message.success('系统调试快照记录开关已更新');
      },
      onError: () => {
        message.error('更新系统调试快照开关失败');
      },
    }
  );

  // Auto-select first execution when list loads if none selected
  useEffect(() => {
    if (!selectedExecution && executions.length > 0 && !searchParams.get('executionId')) {
      setSelectedExecution(executions[0]);
    }
  }, [executions, selectedExecution, searchParams]);

  // Session record selection
  const selectedSessionRecord =
    promptDebugHistory.find((item) => item.id === selectedSessionRecordId) ||
    promptDebugHistory[0] ||
    null;

  const handleSearchDirectExecution = () => {
    const nextId = executionIdInput.trim();
    if (!nextId) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('executionId');
      setSearchParams(nextParams);
      return;
    }
    setSearchParams({ executionId: nextId });
  };

  const handleSelectExecution = (item: ExecutionDto) => {
    setSelectedExecution(item);
    setSearchParams({ executionId: item.id });
  };

  const handleSelectPromptForTest = (promptText: string) => {
    setDraftMessage(promptText);
    setOpen(true);
    message.success('已将此提示词填入聊天对话窗口，可直接微调重测');
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Header Card */}
      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <Space align="center" size={10}>
              <BugOutlined style={{ fontSize: 24, color: '#1677ff' }} />
              <Title level={3} style={{ margin: 0 }}>
                Prompt 调试与调用链全流程审计
              </Title>
              <Tooltip title="记录并还原所有工单与任务的提示词生成、模型路由、步骤链执行现场及最终报错细节。">
                <InfoCircleOutlined style={{ color: 'var(--text-secondary, #8c8c8c)', fontSize: 16 }} />
              </Tooltip>
            </Space>
            <div style={{ marginTop: 6, color: 'var(--text-secondary, #8c8c8c)', fontSize: 13 }}>
              支持端到端追踪【提示词 Prompt ➔ 工单执行 Steps ➔ 结果与报错现场 Result】，提供 1 键复制完整排障报告与重测复现。
            </div>
          </div>

          <Space size={12} wrap>
            <Space size={8}>
              <Text type="secondary" style={{ fontSize: 13 }}>调试快照落库</Text>
              <Switch
                checked={Boolean(debugSettingsQuery.data?.promptDebugEnabled)}
                loading={debugSettingsQuery.isLoading || updateDebugSettingsMutation.isLoading}
                onChange={(checked) => updateDebugSettingsMutation.mutate(checked)}
              />
            </Space>
            <Button type="primary" icon={<MessageOutlined />} onClick={() => setOpen(true)} style={{ borderRadius: 8 }}>
              打开交互调试窗口
            </Button>
          </Space>
        </div>

        {/* Tab switcher & Search Bar */}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Segmented
            value={activeTab}
            onChange={(val) => setActiveTab(val as 'audit' | 'session')}
            options={[
              {
                label: (
                  <Space size={6}>
                    <AuditOutlined />
                    <span>工单调用链与故障审计</span>
                    <Badge count={executions.filter((e) => e.status === 'failed').length} style={{ backgroundColor: '#ff4d4f' }} />
                  </Space>
                ),
                value: 'audit',
              },
              {
                label: (
                  <Space size={6}>
                    <HistoryOutlined />
                    <span>即时会话调试</span>
                    <Badge count={promptDebugHistory.length} style={{ backgroundColor: '#1677ff' }} />
                  </Space>
                ),
                value: 'session',
              },
            ]}
          />

          <Space size={8}>
            <Input
              placeholder="输入执行单 ID (executionId) 精确定位"
              value={executionIdInput}
              onChange={(e) => setExecutionIdInput(e.target.value)}
              onPressEnter={handleSearchDirectExecution}
              style={{ width: 340, borderRadius: 8 }}
              allowClear
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleSearchDirectExecution}
              loading={directExecutionQuery.isLoading}
              style={{ borderRadius: 8 }}
            >
              查询
            </Button>
          </Space>
        </div>
      </Card>

      {/* Mode 1: 工单调用链与故障审计 */}
      {activeTab === 'audit' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 3.5fr) minmax(0, 8.5fr)',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* Left: Execution List Card */}
          <Card
            title={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space size={6}>
                    <BranchesOutlined style={{ color: '#1677ff' }} />
                    <Text strong>工单执行记录</Text>
                  </Space>
                  <Button
                    type="text"
                    size="small"
                    icon={<ReloadOutlined spin={refreshingExecutions} />}
                    onClick={() => refetchExecutions()}
                  >
                    刷新
                  </Button>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Select
                    size="small"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    style={{ width: 120 }}
                    options={[
                      { label: '全部状态', value: 'all' },
                      { label: '仅失败', value: 'failed' },
                      { label: '仅部分成功', value: 'partial_success' },
                      { label: '已成功', value: 'succeeded' },
                      { label: '运行中', value: 'running' },
                    ]}
                  />
                  <Input
                    size="small"
                    placeholder="过滤关键词/ID"
                    prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    allowClear
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            }
            styles={{ body: { padding: 0 } }}
            style={{ borderRadius: 12 }}
          >
            {executions.length > 0 ? (
              <List
                dataSource={executions}
                loading={loadingExecutions}
                pagination={{
                  pageSize: 10,
                  size: 'small',
                  total,
                  current: page,
                  onChange: (p) => setPage(p),
                  style: { padding: '8px 12px', margin: 0, textAlign: 'right' },
                }}
                renderItem={(item) => {
                  const isSelected = selectedExecution?.id === item.id;
                  const itemFailed = item.status === 'failed';
                  const itemSucceeded = item.status === 'succeeded';

                  const promptSnippet =
                    (typeof item.input === 'string' ? item.input : '') ||
                    (item.input as any)?.prompt ||
                    (item.input as any)?.instruction ||
                    item.failureReason ||
                    item.skillId ||
                    '无文本摘要';

                  return (
                    <List.Item
                      key={item.id}
                      onClick={() => handleSelectExecution(item)}
                      style={{
                        padding: '12px 14px',
                        cursor: 'pointer',
                        background: isSelected
                          ? 'rgba(22, 119, 255, 0.08)'
                          : itemFailed
                            ? 'rgba(255, 77, 79, 0.02)'
                            : 'transparent',
                        borderLeft: isSelected
                          ? '3px solid #1677ff'
                          : itemFailed
                            ? '3px solid #ff4d4f'
                            : '3px solid transparent',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Tag
                            color={itemFailed ? 'red' : itemSucceeded ? 'green' : 'blue'}
                            style={{ margin: 0, fontSize: 11, borderRadius: 6 }}
                          >
                            {item.status.toUpperCase()}
                          </Tag>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary, #8c8c8c)' }}>
                            {item.startedAt ? new Date(item.startedAt).toLocaleTimeString() : '-'}
                          </span>
                        </div>

                        <Text strong style={{ fontSize: 12, wordBreak: 'break-all' }}>
                          {item.id}
                        </Text>

                        <Text
                          type="secondary"
                          ellipsis
                          style={{
                            fontSize: 12,
                            color: itemFailed ? '#cf1322' : undefined,
                          }}
                        >
                          {promptSnippet}
                        </Text>
                      </Space>
                    </List.Item>
                  );
                }}
              />
            ) : (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <Empty description="暂无符合条件的工单记录" />
              </div>
            )}
          </Card>

          {/* Right: Full 3-Stage Call Flow Viewer */}
          <div>
            {selectedExecution ? (
              <PromptTraceFlowView
                execution={selectedExecution}
                steps={stepsQuery.data || []}
                loadingSteps={stepsQuery.isLoading}
                models={modelsQuery.data?.models || []}
                onSelectPromptForTest={handleSelectPromptForTest}
              />
            ) : (
              <Card style={{ borderRadius: 12, textAlign: 'center', padding: '60px 0' }}>
                <Empty description="请从左侧列表选择一个工单实例以展开全流程调用链路" />
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Mode 2: 即时会话调试 */}
      {activeTab === 'session' && (
        <SessionPromptDebugView
          promptDebugHistory={promptDebugHistory}
          selectedRecord={selectedSessionRecord}
          onSelectRecord={setSelectedSessionRecordId}
          models={modelsQuery.data?.models || []}
          execution={selectedExecution || undefined}
          steps={stepsQuery.data}
          onCopyPrompt={(record) => {
            navigator.clipboard.writeText(
              JSON.stringify(record.promptDebug, null, 2)
            );
            message.success('调试内容已复制');
          }}
        />
      )}
    </div>
  );
};

export default PromptDebugPage;
