import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  EditOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import type { ColumnsType } from 'antd/es/table';
import {
  ToolCatalogFilters,
  ToolCatalogItem,
  ToolCatalogStatus,
  ToolPromptExposure,
  ToolRiskLevel,
  toolCatalogApi,
} from '@/api/tool-catalog';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

const STATUS_META: Record<ToolCatalogStatus, { color: string; label: string }> = {
  active: { color: 'success', label: '启用' },
  disabled: { color: 'error', label: '禁用' },
  deprecated: { color: 'warning', label: '废弃' },
};

const RISK_META: Record<ToolRiskLevel, { color: string; label: string }> = {
  L0: { color: 'default', label: 'L0' },
  L1: { color: 'processing', label: 'L1' },
  L2: { color: 'warning', label: 'L2' },
  L3: { color: 'error', label: 'L3' },
};

const PROMPT_EXPOSURE_OPTIONS: Array<{ value: ToolPromptExposure; label: string }> = [
  { value: 'hidden', label: '隐藏' },
  { value: 'prompt_only', label: '仅 Prompt' },
  { value: 'runtime_only', label: '仅 Runtime' },
  { value: 'prompt_and_runtime', label: 'Prompt + Runtime' },
];

const TOOL_STATUS_OPTIONS: Array<{ value: ToolCatalogStatus; label: string }> = [
  { value: 'active', label: '启用' },
  { value: 'disabled', label: '禁用' },
  { value: 'deprecated', label: '废弃' },
];

const TOOL_RISK_OPTIONS: Array<{ value: ToolRiskLevel; label: string }> = [
  { value: 'L0', label: 'L0' },
  { value: 'L1', label: 'L1' },
  { value: 'L2', label: 'L2' },
  { value: 'L3', label: 'L3' },
];

const promptExposureLabel = (value: ToolPromptExposure) =>
  PROMPT_EXPOSURE_OPTIONS.find((option) => option.value === value)?.label || value;

const releaseStatusLabel = (value?: string | null) => {
  if (!value) {
    return '未发布';
  }
  return value;
};

const buildMetadataJson = (value?: string): Record<string, unknown> => {
  if (!value?.trim()) {
    return {};
  }

  const parsed = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('metadataJson 必须是 JSON 对象');
  }

  return parsed as Record<string, unknown>;
};

type BoundSkillItem = NonNullable<
  NonNullable<ToolCatalogItem['usageSummary']>['boundSkills']
>[number];

const renderConfirmContent = (lines: string[]) => (
  <div
    style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--bg-secondary)',
      borderRadius: 10,
      padding: 12,
      color: 'var(--text-primary)',
    }}
  >
    {lines.map((line) => (
      <Paragraph key={line} style={{ marginBottom: 8, color: 'var(--text-primary)' }}>
        {line}
      </Paragraph>
    ))}
  </div>
);

const SystemToolAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modal, contextHolder] = Modal.useModal();
  const [filters, setFilters] = useState<ToolCatalogFilters>({});
  const [searchInput, setSearchInput] = useState('');
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [form] = Form.useForm();

  const listQuery = useQuery(['tool-catalog', filters], () => toolCatalogApi.list(filters));
  const detailQuery = useQuery(
    ['tool-catalog-detail', selectedToolName],
    () => toolCatalogApi.getByName(selectedToolName!),
    { enabled: detailVisible && !!selectedToolName }
  );

  const syncUpdatedToolToCache = (updatedTool: ToolCatalogItem) => {
    queryClient.setQueriesData<{ tools: ToolCatalogItem[] } | undefined>(
      ['tool-catalog'],
      (previous) => {
        if (!previous?.tools) {
          return previous;
        }
        return {
          ...previous,
          tools: previous.tools.map((tool) =>
            tool.name === updatedTool.name ? updatedTool : tool
          ),
        };
      }
    );
    queryClient.setQueryData(['tool-catalog-detail', updatedTool.name], updatedTool);
  };

  const updateMutation = useMutation(
    ({
      name,
      payload,
    }: {
      name: string;
      payload: Partial<ToolCatalogItem> & { metadataJson?: Record<string, unknown> };
    }) => toolCatalogApi.update(name, payload),
    {
      onSuccess: (updatedTool) => {
        syncUpdatedToolToCache(updatedTool);
        message.success(`工具「${updatedTool.displayName || updatedTool.name}」已更新`);
        queryClient.invalidateQueries(['tool-catalog']);
        queryClient.invalidateQueries(['tool-catalog-detail', updatedTool.name]);
      },
      onError: (error: any) => {
        const errorMessage = error?.response?.data?.message || error?.message || '更新失败';
        message.error(typeof errorMessage === 'string' ? errorMessage : '更新失败');
      },
    }
  );

  useEffect(() => {
    if (!detailQuery.data) {
      return;
    }

    form.setFieldsValue({
      displayName: detailQuery.data.displayName,
      description: detailQuery.data.description,
      status: detailQuery.data.status,
      riskLevel: detailQuery.data.riskLevel,
      allowSkillBinding: detailQuery.data.allowSkillBinding,
      promptExposure: detailQuery.data.promptExposure,
      defaultRequiresConfirmation: detailQuery.data.defaultRequiresConfirmation,
      defaultRequiresApproval: detailQuery.data.defaultRequiresApproval,
      metadataJson: JSON.stringify(detailQuery.data.metadataJson || {}, null, 2),
    });
  }, [detailQuery.data, form]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set((listQuery.data?.tools || []).map((tool) => tool.category).filter(Boolean))
      ).sort(),
    [listQuery.data?.tools]
  );

  const runtimeTypes = useMemo(
    () =>
      Array.from(
        new Set((listQuery.data?.tools || []).map((tool) => tool.runtimeType).filter(Boolean))
      ).sort(),
    [listQuery.data?.tools]
  );

  const openDetail = (toolName: string) => {
    setSelectedToolName(toolName);
    setDetailVisible(true);
  };

  const closeDetail = () => {
    setDetailVisible(false);
    setSelectedToolName(null);
    form.resetFields();
  };

  const applyFilters = (next: Partial<ToolCatalogFilters>) => {
    setFilters((current) => ({
      ...current,
      ...next,
    }));
  };

  const runQuickUpdate = (
    tool: ToolCatalogItem,
    payload: Partial<ToolCatalogItem>,
    confirmTitle?: string,
    confirmContent?: string
  ) => {
    const execute = () => updateMutation.mutateAsync({ name: tool.name, payload });

    if (confirmTitle) {
      modal.confirm({
        title: confirmTitle,
        content: confirmContent ? renderConfirmContent([confirmContent]) : null,
        okText: '确认',
        cancelText: '取消',
        onOk: execute,
      });
      return;
    }

    execute();
  };

  const handleSave = async () => {
    if (!selectedToolName || !detailQuery.data) {
      return;
    }

    try {
      const values = await form.validateFields();
      const payload = {
        displayName: values.displayName,
        description: values.description,
        status: values.status,
        riskLevel: values.riskLevel,
        allowSkillBinding: values.allowSkillBinding,
        promptExposure: values.promptExposure,
        defaultRequiresConfirmation: values.defaultRequiresConfirmation,
        defaultRequiresApproval: values.defaultRequiresApproval,
        metadataJson: buildMetadataJson(values.metadataJson),
      };

      const warnings: string[] = [];
      if (detailQuery.data.status !== payload.status && payload.status === 'disabled') {
        warnings.push(
          `禁用后新快照不再暴露该工具，当前已绑定的 ${detailQuery.data.usageSummary?.boundSkillCount || 0} 个 Skill 的后续发布也会受影响。`
        );
      }
      if (
        detailQuery.data.allowSkillBinding !== payload.allowSkillBinding &&
        payload.allowSkillBinding === false
      ) {
        warnings.push(
          `关闭 Skill 绑定后，将阻断该工具的新绑定；当前已有 ${detailQuery.data.usageSummary?.boundSkillCount || 0} 个 Skill 使用该工具。`
        );
      }
      if (
        detailQuery.data.promptExposure !== payload.promptExposure &&
        payload.promptExposure === 'hidden'
      ) {
        warnings.push('隐藏后模型侧将看不到该工具，调用链路可能发生变化。');
      }

      const commit = () => updateMutation.mutate({ name: selectedToolName, payload });
      const confirmCommit = () => updateMutation.mutateAsync({ name: selectedToolName, payload });

      if (warnings.length > 0) {
        modal.confirm({
          title: '确认保存高影响变更？',
          content: renderConfirmContent(warnings),
          okText: '确认保存',
          cancelText: '取消',
          onOk: confirmCommit,
        });
        return;
      }

      commit();
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      }
    }
  };

  const columns: ColumnsType<ToolCatalogItem> = [
    {
      title: '工具名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (name: string, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(record.name)}>
          {name}
        </Button>
      ),
    },
    {
      title: '显示名称',
      dataIndex: 'displayName',
      key: 'displayName',
      width: 180,
      ellipsis: true,
    },
    {
      title: '类别',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (value?: string) => value || <Text type="secondary">-</Text>,
    },
    {
      title: '运行类型',
      dataIndex: 'runtimeType',
      key: 'runtimeType',
      width: 120,
      render: (value?: string) => value || <Text type="secondary">-</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: ToolCatalogStatus) => (
        <Tag color={STATUS_META[status].color}>{STATUS_META[status].label}</Tag>
      ),
    },
    {
      title: '风险',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 90,
      render: (riskLevel: ToolRiskLevel) => (
        <Tag color={RISK_META[riskLevel].color}>{RISK_META[riskLevel].label}</Tag>
      ),
    },
    {
      title: 'Skill 绑定',
      dataIndex: 'allowSkillBinding',
      key: 'allowSkillBinding',
      width: 110,
      render: (allowSkillBinding: boolean) => (
        <Tag color={allowSkillBinding ? 'success' : 'default'}>
          {allowSkillBinding ? '允许' : '禁止'}
        </Tag>
      ),
    },
    {
      title: '影响 Skill',
      key: 'usageSummary',
      width: 110,
      render: (_, record) =>
        record.usageSummary?.boundSkillCount ? (
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => navigate(`/admin/skills?q=${encodeURIComponent(record.name)}`)}
          >
            {record.usageSummary.boundSkillCount}
          </Button>
        ) : (
          <Tag color="default">0</Tag>
        ),
    },
    {
      title: 'Prompt 暴露',
      dataIndex: 'promptExposure',
      key: 'promptExposure',
      width: 150,
      render: (value: ToolPromptExposure) => promptExposureLabel(value),
    },
    {
      title: '需确认/审批',
      key: 'policy',
      width: 130,
      render: (_, record) => (
        <Space size="small" wrap>
          {record.defaultRequiresConfirmation ? <Tag color="warning">确认</Tag> : null}
          {record.defaultRequiresApproval ? <Tag color="error">审批</Tag> : null}
          {!record.defaultRequiresConfirmation && !record.defaultRequiresApproval ? (
            <Text type="secondary">无</Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (value?: string) => (value ? new Date(value).toLocaleString() : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openDetail(record.name)}
          >
            详情
          </Button>
          {record.status === 'active' ? (
            <Button
              type="link"
              size="small"
              danger
              onClick={() =>
                runQuickUpdate(
                  record,
                  { status: 'disabled' },
                  `确认禁用工具「${record.displayName || record.name}」？`,
                  `禁用后新快照不再暴露该工具，当前已绑定的 ${record.usageSummary?.boundSkillCount || 0} 个 Skill 后续保存/发布可能受影响。`
                )
              }
            >
              禁用
            </Button>
          ) : (
            <Button
              type="link"
              size="small"
              onClick={() => runQuickUpdate(record, { status: 'active' })}
            >
              启用
            </Button>
          )}
          <Button
            type="link"
            size="small"
            onClick={() =>
              runQuickUpdate(
                record,
                { allowSkillBinding: !record.allowSkillBinding },
                record.allowSkillBinding ? `确认禁止 Skill 绑定「${record.name}」？` : undefined,
                record.allowSkillBinding
                  ? `后续保存、验证和发布将不再允许新绑定该工具；当前已有 ${record.usageSummary?.boundSkillCount || 0} 个 Skill 正在使用。`
                  : undefined
              )
            }
          >
            {record.allowSkillBinding ? '禁止绑定' : '允许绑定'}
          </Button>
        </Space>
      ),
    },
  ];

  const boundSkillColumns: ColumnsType<BoundSkillItem> = [
    {
      title: 'Skill',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0 }}
          onClick={() => navigate(`/admin/skills?q=${encodeURIComponent(record.name)}`)}
        >
          {name}
        </Button>
      ),
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'error'}>{isActive ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '配置状态',
      dataIndex: 'configStatus',
      key: 'configStatus',
      width: 110,
      render: (configStatus?: string) => (
        <Tag
          color={
            configStatus === 'valid' ? 'success' : configStatus === 'invalid' ? 'error' : 'default'
          }
        >
          {configStatus || 'draft'}
        </Tag>
      ),
    },
    {
      title: '公开状态',
      dataIndex: 'isPublished',
      key: 'isPublished',
      width: 110,
      render: (isPublished: boolean) => (
        <Tag color={isPublished ? 'processing' : 'default'}>
          {isPublished ? '已公开' : '未公开'}
        </Tag>
      ),
    },
    {
      title: '发布状态',
      dataIndex: 'publishedReleaseStatus',
      key: 'publishedReleaseStatus',
      width: 140,
      render: (value?: string | null) => (
        <Tag color={value ? 'blue' : 'default'}>{releaseStatusLabel(value)}</Tag>
      ),
    },
    {
      title: '部署状态',
      dataIndex: 'publishedDeploymentStatus',
      key: 'publishedDeploymentStatus',
      width: 140,
      render: (value?: string | null) => (
        <Tag color={value ? 'purple' : 'default'}>{value || '未部署'}</Tag>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <div>
        <Title level={4}>系统工具管理</Title>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="页面用途"
          description="这里管理系统 Tool Catalog。修改工具状态、Prompt 暴露或 Skill 绑定策略后，会直接影响后续快照生成、Skill 验证与发布阻断。"
        />

        <Card>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {listQuery.isError ? (
              <Alert
                type="error"
                showIcon
                message="工具目录加载失败"
                description={
                  (listQuery.error as any)?.response?.data?.message ||
                  (listQuery.error as Error)?.message ||
                  '请检查 auth 服务和 /api/tools 代理是否正常。'
                }
              />
            ) : null}

            <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
              <Space wrap>
                <Input
                  placeholder="搜索名称 / 显示名称 / 描述"
                  prefix={<SearchOutlined />}
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onPressEnter={() => applyFilters({ keyword: searchInput || undefined })}
                  allowClear
                  style={{ width: 260 }}
                />
                <Button onClick={() => applyFilters({ keyword: searchInput || undefined })}>
                  搜索
                </Button>
                <Select
                  allowClear
                  placeholder="状态"
                  style={{ width: 140 }}
                  value={filters.status}
                  onChange={(value) => applyFilters({ status: value })}
                >
                  {TOOL_STATUS_OPTIONS.map((option) => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Select>
                <Select
                  allowClear
                  placeholder="类别"
                  style={{ width: 140 }}
                  value={filters.category}
                  onChange={(value) => applyFilters({ category: value })}
                >
                  {categories.map((category) => (
                    <Option key={category} value={category}>
                      {category}
                    </Option>
                  ))}
                </Select>
                <Select
                  allowClear
                  placeholder="运行类型"
                  style={{ width: 140 }}
                  value={filters.runtimeType}
                  onChange={(value) => applyFilters({ runtimeType: value })}
                >
                  {runtimeTypes.map((runtimeType) => (
                    <Option key={runtimeType} value={runtimeType}>
                      {runtimeType}
                    </Option>
                  ))}
                </Select>
                <Select
                  allowClear
                  placeholder="Skill 绑定"
                  style={{ width: 150 }}
                  value={filters.allowSkillBinding}
                  onChange={(value) => applyFilters({ allowSkillBinding: value })}
                >
                  <Option value>允许绑定</Option>
                  <Option value={false}>禁止绑定</Option>
                </Select>
              </Space>

              <Space>
                <Button
                  onClick={() => {
                    setSearchInput('');
                    setFilters({});
                  }}
                >
                  重置
                </Button>
                <Button icon={<ReloadOutlined />} onClick={() => listQuery.refetch()}>
                  刷新
                </Button>
              </Space>
            </Space>

            <Divider style={{ margin: 0 }} />

            <Table
              rowKey="name"
              loading={listQuery.isLoading}
              columns={columns}
              dataSource={listQuery.data?.tools || []}
              scroll={{ x: 1500 }}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 个工具`,
              }}
            />
          </Space>
        </Card>

        <Drawer
          title={
            <Space>
              <ToolOutlined />
              <span>工具详情</span>
            </Space>
          }
          width={920}
          open={detailVisible}
          onClose={closeDetail}
          destroyOnHidden
          styles={{
            body: {
              background: 'var(--bg-primary)',
              overflowY: 'auto',
            },
          }}
          extra={
            <Space>
              <Button onClick={closeDetail}>关闭</Button>
              <Button type="primary" onClick={handleSave} loading={updateMutation.isLoading}>
                保存
              </Button>
            </Space>
          }
        >
          {detailQuery.isError ? (
            <Alert
              type="error"
              showIcon
              message="工具详情加载失败"
              description={
                (detailQuery.error as any)?.response?.data?.message ||
                (detailQuery.error as Error)?.message ||
                '请稍后重试。'
              }
            />
          ) : detailQuery.data ? (
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <Card size="small">
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="工具名称">{detailQuery.data.name}</Descriptions.Item>
                  <Descriptions.Item label="显示名称">
                    {detailQuery.data.displayName}
                  </Descriptions.Item>
                  <Descriptions.Item label="类别">
                    {detailQuery.data.category || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="运行类型">
                    {detailQuery.data.runtimeType || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="创建时间">
                    {detailQuery.data.createdAt
                      ? new Date(detailQuery.data.createdAt).toLocaleString()
                      : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="更新时间">
                    {detailQuery.data.updatedAt
                      ? new Date(detailQuery.data.updatedAt).toLocaleString()
                      : '-'}
                  </Descriptions.Item>
                </Descriptions>
              </Card>

              <Alert
                type="warning"
                showIcon
                icon={<SafetyCertificateOutlined />}
                message="高影响字段"
                description="`status`、`allowSkillBinding`、`promptExposure` 的修改会影响运行时快照、Skill 验证与后续发布。保存时会再次确认。"
              />

              <Card size="small" title="影响面">
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Descriptions size="small" column={1}>
                    <Descriptions.Item label="当前绑定 Skill 数量">
                      <Space wrap>
                        <Tag
                          color={
                            detailQuery.data.usageSummary?.boundSkillCount
                              ? 'processing'
                              : 'default'
                          }
                        >
                          {detailQuery.data.usageSummary?.boundSkillCount || 0}
                        </Tag>
                        {detailQuery.data.usageSummary?.boundSkillCount ? (
                          <Button
                            type="link"
                            size="small"
                            style={{ padding: 0 }}
                            onClick={() =>
                              navigate(
                                `/admin/skills?q=${encodeURIComponent(detailQuery.data!.name)}`
                              )
                            }
                          >
                            查看全部受影响 Skill
                          </Button>
                        ) : null}
                      </Space>
                    </Descriptions.Item>
                  </Descriptions>

                  {detailQuery.data.usageSummary?.boundSkills?.length ? (
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      columns={boundSkillColumns}
                      dataSource={detailQuery.data.usageSummary.boundSkills}
                      scroll={{ x: 760 }}
                    />
                  ) : (
                    <Text type="secondary">暂无绑定 Skill</Text>
                  )}
                </Space>
              </Card>

              <Form form={form} layout="vertical">
                <Card size="small" title="基础信息">
                  <Form.Item
                    name="displayName"
                    label="显示名称"
                    rules={[{ required: true, message: '请输入显示名称' }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item name="description" label="描述">
                    <Input.TextArea rows={3} placeholder="描述该工具的职责和使用边界" />
                  </Form.Item>
                </Card>

                <Card size="small" title="治理策略" style={{ marginTop: 16 }}>
                  <Form.Item name="status" label="状态" rules={[{ required: true }]}>
                    <Select>
                      {TOOL_STATUS_OPTIONS.map((option) => (
                        <Option key={option.value} value={option.value}>
                          {option.label}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item name="riskLevel" label="风险等级" rules={[{ required: true }]}>
                    <Select>
                      {TOOL_RISK_OPTIONS.map((option) => (
                        <Option key={option.value} value={option.value}>
                          {option.label}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item
                    name="promptExposure"
                    label="Prompt 暴露策略"
                    rules={[{ required: true }]}
                  >
                    <Select>
                      {PROMPT_EXPOSURE_OPTIONS.map((option) => (
                        <Option key={option.value} value={option.value}>
                          {option.label}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item
                    name="allowSkillBinding"
                    label="允许 Skill 绑定"
                    valuePropName="checked"
                  >
                    <Switch checkedChildren="允许" unCheckedChildren="禁止" />
                  </Form.Item>

                  <Form.Item
                    name="defaultRequiresConfirmation"
                    label="默认需要确认"
                    valuePropName="checked"
                  >
                    <Switch checkedChildren="需要" unCheckedChildren="不需要" />
                  </Form.Item>

                  <Form.Item
                    name="defaultRequiresApproval"
                    label="默认需要审批"
                    valuePropName="checked"
                  >
                    <Switch checkedChildren="需要" unCheckedChildren="不需要" />
                  </Form.Item>
                </Card>

                <Card size="small" title="扩展元数据" style={{ marginTop: 16 }}>
                  <Form.Item
                    name="metadataJson"
                    label="metadataJson"
                    extra='请输入 JSON 对象，例如 {"owner":"platform-team"}'
                    rules={[
                      {
                        validator: async (_rule, value: string) => {
                          if (!value?.trim()) {
                            return;
                          }
                          buildMetadataJson(value);
                        },
                      },
                    ]}
                  >
                    <Input.TextArea rows={8} style={{ fontFamily: 'monospace' }} />
                  </Form.Item>
                </Card>
              </Form>
            </Space>
          ) : (
            <Card loading={detailQuery.isLoading} />
          )}
        </Drawer>
      </div>
    </>
  );
};

export default SystemToolAdminPage;
