import React, { useState } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select,
  Divider, Alert, Empty, Collapse, Switch, Tooltip, Badge, Timeline, Tabs, Descriptions, Popconfirm
} from 'antd';
import {
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined,
  ReloadOutlined, ApiOutlined, CodeOutlined, FileTextOutlined, ChromeOutlined,
  CheckCircleOutlined, WarningOutlined, ThunderboltOutlined, CopyOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { activityApi, ActivityDTO, CreateActivityDto, ActivityValidationResult } from '../../api/activity';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const { TextArea } = Input;
const { TabPane } = Tabs;

// Handler type configuration
const HANDLER_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  api: {
    label: 'API 调用',
    color: 'green',
    icon: <ApiOutlined />,
    description: '通过 HTTP API 调用外部服务',
  },
  carbone: {
    label: 'Carbone 渲染',
    color: 'blue',
    icon: <FileTextOutlined />,
    description: '使用 Carbone 引擎渲染文档',
  },
  browser: {
    label: '浏览器操作',
    color: 'purple',
    icon: <ChromeOutlined />,
    description: '自动化浏览器操作',
  },
  script: {
    label: '脚本执行',
    color: 'orange',
    icon: <CodeOutlined />,
    description: '执行自定义脚本',
  },
};

interface ActivityFormData {
  name: string;
  fn: string;
  timeout: string;
  retryPolicy?: { maxRetries: number };
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
}

const DEFAULT_ACTIVITY: ActivityFormData = {
  name: '',
  fn: '',
  timeout: '30s',
  retryPolicy: { maxRetries: 3 },
  handler: 'api',
  config: {},
};

const ActivityPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [validateModalVisible, setValidateModalVisible] = useState(false);
  const [handlerFilter, setHandlerFilter] = useState<string | undefined>();
  const [editingActivity, setEditingActivity] = useState<ActivityDTO | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityDTO | null>(null);
  const [validationResult, setValidationResult] = useState<ActivityValidationResult | null>(null);
  const [form] = Form.useForm();
  const [activityForm, setActivityForm] = useState<ActivityFormData>(DEFAULT_ACTIVITY);

  // Queries
  const activitiesQuery = useQuery(
    ['activities', handlerFilter],
    () => activityApi.list(handlerFilter)
  );

  // Mutations
  const createMutation = useMutation(activityApi.create, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['activities']);
      setEditModalVisible(false);
      form.resetFields();
      setActivityForm(DEFAULT_ACTIVITY);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: CreateActivityDto }) => activityApi.update(id, data),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['activities']);
        setEditModalVisible(false);
        setEditingActivity(null);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const deleteMutation = useMutation(activityApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['activities']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const validateMutation = useMutation(activityApi.validate, {
    onSuccess: (result) => {
      setValidationResult(result);
      message.success('验证完成');
    },
    onError: () => {
      message.error('验证失败');
    },
  });

  // Handlers
  const handleCreate = () => {
    setEditingActivity(null);
    form.resetFields();
    setActivityForm(DEFAULT_ACTIVITY);
    setEditModalVisible(true);
  };

  const handleEdit = (activity: ActivityDTO) => {
    setEditingActivity(activity);
    form.setFieldsValue({
      name: activity.name,
      fn: activity.fn,
      timeout: activity.timeout,
      handler: activity.handler,
    });
    setActivityForm({
      name: activity.name,
      fn: activity.fn,
      timeout: activity.timeout,
      retryPolicy: activity.retryPolicy,
      handler: activity.handler as any,
      config: activity.config || {},
    });
    setEditModalVisible(true);
  };

  const handleViewDetail = (activity: ActivityDTO) => {
    setSelectedActivity(activity);
    setDetailModalVisible(true);
  };

  const handleValidate = () => {
    validateMutation.mutate(activityForm as any);
    setValidateModalVisible(true);
  };

  const handleSave = () => {
    form.validateFields().then(() => {
      if (editingActivity) {
        updateMutation.mutate({ id: editingActivity.id, data: activityForm as any });
      } else {
        createMutation.mutate(activityForm as any);
      }
    });
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      content: '删除后无法恢复，是否继续？',
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const updateActivityForm = (field: string, value: any) => {
    setActivityForm(prev => ({ ...prev, [field]: value }));
  };

  // Render handler badge
  const renderHandlerBadge = (handler: string) => {
    const info = HANDLER_CONFIG[handler] || { label: handler, color: 'default' };
    return <Tag color={info.color}>{info.label}</Tag>;
  };

  // Render config fields based on handler type
  const renderConfigFields = () => {
    switch (activityForm.handler) {
      case 'api':
        return (
          <Card size="small" style={{ background: '#fafafa' }}>
            <Paragraph type="secondary">
              API 活动通过 HTTP 请求调用外部服务。配置端点、方法、 Headers 和请求体。
            </Paragraph>
            <Form.Item label="端点 URL">
              <Input
                value={activityForm.config.endpoint || ''}
                onChange={(e) => updateActivityForm('config', { ...activityForm.config, endpoint: e.target.value })}
                placeholder="https://api.example.com/v1/resource"
              />
            </Form.Item>
            <Space>
              <Form.Item label="HTTP 方法">
                <Select
                  value={activityForm.config.method || 'POST'}
                  onChange={(v) => updateActivityForm('config', { ...activityForm.config, method: v })}
                  style={{ width: 120 }}
                >
                  <Option value="GET">GET</Option>
                  <Option value="POST">POST</Option>
                  <Option value="PUT">PUT</Option>
                  <Option value="DELETE">DELETE</Option>
                  <Option value="PATCH">PATCH</Option>
                </Select>
              </Form.Item>
              <Form.Item label="超时 (ms)">
                <Input
                  type="number"
                  value={activityForm.config.timeoutMs || 30000}
                  onChange={(e) => updateActivityForm('config', { ...activityForm.config, timeoutMs: parseInt(e.target.value) })}
                  style={{ width: 100 }}
                />
              </Form.Item>
            </Space>
            <Form.Item label="Headers (JSON)">
              <TextArea
                value={JSON.stringify(activityForm.config.headers || {}, null, 2)}
                onChange={(e) => {
                  try {
                    updateActivityForm('config', { ...activityForm.config, headers: JSON.parse(e.target.value) });
                  } catch {}
                }}
                rows={3}
                placeholder='{"Authorization": "Bearer {{token}}"}'
                style={{ fontFamily: 'monospace' }}
              />
            </Form.Item>
            <Form.Item label="请求体模板 (JSON)">
              <TextArea
                value={JSON.stringify(activityForm.config.body || {}, null, 2)}
                onChange={(e) => {
                  try {
                    updateActivityForm('config', { ...activityForm.config, body: JSON.parse(e.target.value) });
                  } catch {}
                }}
                rows={4}
                placeholder='{"templateId": "{{params.templateId}}"}'
                style={{ fontFamily: 'monospace' }}
              />
            </Form.Item>
          </Card>
        );

      case 'carbone':
        return (
          <Card size="small" style={{ background: '#fafafa' }}>
            <Paragraph type="secondary">
              Carbone 活动使用 Carbone 引擎渲染文档。配置模板 ID 和数据映射。
            </Paragraph>
            <Form.Item label="模板 ID">
              <Input
                value={activityForm.config.templateId || ''}
                onChange={(e) => updateActivityForm('config', { ...activityForm.config, templateId: e.target.value })}
                placeholder="template-invoice-001"
              />
            </Form.Item>
            <Form.Item label="输出格式">
              <Select
                value={activityForm.config.outputFormat || 'docx'}
                onChange={(v) => updateActivityForm('config', { ...activityForm.config, outputFormat: v })}
                style={{ width: 150 }}
              >
                <Option value="docx">DOCX</Option>
                <Option value="xlsx">XLSX</Option>
                <Option value="pptx">PPTX</Option>
                <Option value="pdf">PDF</Option>
              </Select>
            </Form.Item>
            <Form.Item label="数据映射 (JSON)">
              <TextArea
                value={JSON.stringify(activityForm.config.dataMapping || {}, null, 2)}
                onChange={(e) => {
                  try {
                    updateActivityForm('config', { ...activityForm.config, dataMapping: JSON.parse(e.target.value) });
                  } catch {}
                }}
                rows={4}
                placeholder='{"company": "{{params.companyName}}", "amount": "{{params.amount}}"}'
                style={{ fontFamily: 'monospace' }}
              />
            </Form.Item>
          </Card>
        );

      case 'browser':
        return (
          <Card size="small" style={{ background: '#fafafa' }}>
            <Paragraph type="secondary">
              Browser 活动执行浏览器自动化操作。配置操作类型和目标元素。
            </Paragraph>
            <Form.Item label="操作类型">
              <Select
                value={activityForm.config.action || 'click'}
                onChange={(v) => updateActivityForm('config', { ...activityForm.config, action: v })}
                style={{ width: 150 }}
              >
                <Option value="click">点击</Option>
                <Option value="fill">填写</Option>
                <Option value="select">选择</Option>
                <Option value="hover">悬停</Option>
                <Option value="screenshot">截图</Option>
                <Option value="evaluate">执行脚本</Option>
              </Select>
            </Form.Item>
            <Form.Item label="CSS 选择器">
              <Input
                value={activityForm.config.selector || ''}
                onChange={(e) => updateActivityForm('config', { ...activityForm.config, selector: e.target.value })}
                placeholder="#submit-button"
              />
            </Form.Item>
            <Form.Item label="输入值">
              <TextArea
                value={activityForm.config.value || ''}
                onChange={(e) => updateActivityForm('config', { ...activityForm.config, value: e.target.value })}
                rows={2}
                placeholder="要填写或选择的值"
              />
            </Form.Item>
          </Card>
        );

      case 'script':
        return (
          <Card size="small" style={{ background: '#fafafa' }}>
            <Paragraph type="secondary">
              Script 活动执行自定义 JavaScript/TypeScript 脚本。脚本应返回 Promise。
            </Paragraph>
            <Form.Item label="脚本内容">
              <TextArea
                value={activityForm.config.script || ''}
                onChange={(e) => updateActivityForm('config', { ...activityForm.config, script: e.target.value })}
                rows={8}
                placeholder={'async function execute(params) {\n  // your code here\n  return { result: "success" };\n}'}
                style={{ fontFamily: 'monospace' }}
              />
            </Form.Item>
          </Card>
        );

      default:
        return null;
    }
  };

  // Render config display in detail modal
  const renderConfigDisplay = (config: Record<string, any>, handler: string) => {
    switch (handler) {
      case 'api':
        return (
          <Descriptions size="small" bordered column={1}>
            <Descriptions.Item label="端点">{config.endpoint || '-'}</Descriptions.Item>
            <Descriptions.Item label="方法">{config.method || 'POST'}</Descriptions.Item>
            <Descriptions.Item label="超时">{config.timeoutMs || 30000}ms</Descriptions.Item>
            <Descriptions.Item label="Headers">
              <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(config.headers || {}, null, 2)}</pre>
            </Descriptions.Item>
            <Descriptions.Item label="请求体">
              <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(config.body || {}, null, 2)}</pre>
            </Descriptions.Item>
          </Descriptions>
        );

      case 'carbone':
        return (
          <Descriptions size="small" bordered column={1}>
            <Descriptions.Item label="模板 ID">{config.templateId || '-'}</Descriptions.Item>
            <Descriptions.Item label="输出格式">{config.outputFormat || 'docx'}</Descriptions.Item>
            <Descriptions.Item label="数据映射">
              <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(config.dataMapping || {}, null, 2)}</pre>
            </Descriptions.Item>
          </Descriptions>
        );

      case 'browser':
        return (
          <Descriptions size="small" bordered column={1}>
            <Descriptions.Item label="操作">{config.action || '-'}</Descriptions.Item>
            <Descriptions.Item label="选择器">{config.selector || '-'}</Descriptions.Item>
            <Descriptions.Item label="值">{config.value || '-'}</Descriptions.Item>
          </Descriptions>
        );

      case 'script':
        return (
          <Descriptions size="small" bordered column={1}>
            <Descriptions.Item label="脚本">
              <pre style={{ margin: 0, fontSize: 12, maxHeight: 200, overflow: 'auto' }}>
                {config.script || '// 无脚本内容'}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        );

      default:
        return <Text>配置详情不可用</Text>;
    }
  };

  // Columns
  const columns: ColumnsType<ActivityDTO> = [
    {
      title: '活动名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record: ActivityDTO) => (
        <a onClick={() => handleViewDetail(record)} style={{ cursor: 'pointer' }}>
          <strong>{name}</strong>
        </a>
      ),
    },
    {
      title: '函数名',
      dataIndex: 'fn',
      key: 'fn',
      width: 150,
      render: (fn: string) => <Tag>{fn}</Tag>,
    },
    {
      title: '处理器',
      dataIndex: 'handler',
      key: 'handler',
      width: 120,
      render: (handler: string) => renderHandlerBadge(handler),
    },
    {
      title: '超时',
      dataIndex: 'timeout',
      key: 'timeout',
      width: 80,
      render: (timeout: string) => <Tag color="blue">{timeout}</Tag>,
    },
    {
      title: '重试策略',
      key: 'retryPolicy',
      width: 100,
      render: (_, record) => (
        record.retryPolicy ? (
          <Tag color="orange">最多 {record.retryPolicy.maxRetries} 次</Tag>
        ) : (
          <Text type="secondary">无</Text>
        )
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: (_, record) => (
        <Tag color={record.isActive ? 'green' : 'default'}>
          {record.isActive ? '已启用' : '已禁用'}
        </Tag>
      ),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="删除后无法恢复"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="link"
              size="small"
              icon={<DeleteOutlined />}
              danger
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4}>Activity 管理</Title>

      <Card style={{ marginTop: 8, marginBottom: 16 }}>
        <Space direction="vertical" size="small">
          <Text strong>Activity 说明：</Text>
          <Text>• Activity 是 Temporal 工作流中的非确定性副作用操作</Text>
          <Text>• 每个 Activity 可以调用 API、渲染文档、执行浏览器操作或运行脚本</Text>
          <Text>• Activity 支持重试策略和超时配置</Text>
          <Divider style={{ margin: '8px 0' }} />
          <Text strong>处理器类型：</Text>
          <Space wrap>
            {Object.entries(HANDLER_CONFIG).map(([key, info]) => (
              <Tag key={key} color={info.color} icon={info.icon as any}>
                {info.label}
              </Tag>
            ))}
          </Space>
        </Space>
      </Card>

      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Input
              placeholder="搜索活动..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Select
              placeholder="筛选处理器"
              value={handlerFilter}
              onChange={setHandlerFilter}
              allowClear
              style={{ width: 150 }}
            >
              {Object.entries(HANDLER_CONFIG).map(([key, info]) => (
                <Option key={key} value={key}>{info.label}</Option>
              ))}
            </Select>
          </Space>
          <Space>
            <Button
              icon={<PlusOutlined />}
              type="primary"
              onClick={handleCreate}
            >
              创建 Activity
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => activitiesQuery.refetch()}
            >
              {t('common:refresh')}
            </Button>
          </Space>
        </Space>

        <Table
          columns={columns}
          dataSource={activitiesQuery.data || []}
          rowKey="id"
          loading={activitiesQuery.isLoading}
          scroll={{ x: 1000 }}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => t('common:pagination.total', { total }),
          }}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title={`Activity 详情 - ${selectedActivity?.name}`}
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false);
          setSelectedActivity(null);
        }}
        footer={null}
        width={700}
      >
        {selectedActivity && (
          <Collapse defaultActiveKey={['basic', 'config']}>
            <Panel header="基本信息" key="basic">
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="ID">{selectedActivity.id}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  {selectedActivity.isActive ? <Tag color="green">已启用</Tag> : <Tag>已禁用</Tag>}
                </Descriptions.Item>
                <Descriptions.Item label="名称">{selectedActivity.name}</Descriptions.Item>
                <Descriptions.Item label="函数名">{selectedActivity.fn}</Descriptions.Item>
                <Descriptions.Item label="超时">{selectedActivity.timeout}</Descriptions.Item>
                <Descriptions.Item label="处理器">{renderHandlerBadge(selectedActivity.handler)}</Descriptions.Item>
                <Descriptions.Item label="重试策略">
                  {selectedActivity.retryPolicy ? (
                    <Tag color="orange">最多 {selectedActivity.retryPolicy.maxRetries} 次</Tag>
                  ) : (
                    <Text type="secondary">无</Text>
                  )}
                </Descriptions.Item>
              </Descriptions>
            </Panel>
            <Panel header="配置详情" key="config">
              {renderConfigDisplay(selectedActivity.config || {}, selectedActivity.handler)}
            </Panel>
          </Collapse>
        )}
      </Modal>

      {/* Edit/Create Modal */}
      <Modal
        title={editingActivity ? '编辑 Activity' : '创建 Activity'}
        open={editModalVisible}
        onOk={handleSave}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingActivity(null);
        }}
        footer={[
          <Button
            key="validate"
            icon={<PlayCircleOutlined />}
            onClick={handleValidate}
            style={{ marginRight: 8 }}
          >
            验证
          </Button>,
          <Button
            key="cancel"
            onClick={() => setEditModalVisible(false)}
          >
            取消
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={createMutation.isLoading || updateMutation.isLoading}
            onClick={handleSave}
          >
            保存
          </Button>,
        ]}
        confirmLoading={createMutation.isLoading || updateMutation.isLoading}
        width={800}
        style={{ top: 20 }}
      >
        <Form form={form} layout="vertical">
          <Space style={{ width: '100%' }} direction="vertical">
            <Form.Item
              name="name"
              label="活动名称"
              rules={[{ required: true, message: '请输入活动名称' }]}
            >
              <Input placeholder="例如：生成合同参数" />
            </Form.Item>
            <Form.Item
              name="fn"
              label="函数名"
              rules={[{ required: true, message: '请输入函数名' }]}
            >
              <Input placeholder="例如：generateContractParams" />
            </Form.Item>
            <Space>
              <Form.Item
                name="timeout"
                label="超时时间"
                rules={[{ required: true, message: '请输入超时时间' }]}
              >
                <Select
                  value={activityForm.timeout}
                  onChange={(v) => updateActivityForm('timeout', v)}
                  style={{ width: 120 }}
                >
                  <Option value="10s">10s</Option>
                  <Option value="30s">30s</Option>
                  <Option value="1m">1m</Option>
                  <Option value="5m">5m</Option>
                  <Option value="10m">10m</Option>
                </Select>
              </Form.Item>
              <Form.Item
                name="handler"
                label="处理器类型"
                rules={[{ required: true, message: '请选择处理器类型' }]}
              >
                <Select
                  value={activityForm.handler}
                  onChange={(v) => updateActivityForm('handler', v)}
                  style={{ width: 150 }}
                >
                  {Object.entries(HANDLER_CONFIG).map(([key, info]) => (
                    <Option key={key} value={key}>
                      <Space>{info.icon} {info.label}</Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Space>
            <Form.Item label="重试策略">
              <Space>
                <Switch
                  checked={!!activityForm.retryPolicy}
                  onChange={(checked) => {
                    if (checked) {
                      updateActivityForm('retryPolicy', { maxRetries: 3 });
                    } else {
                      updateActivityForm('retryPolicy', undefined);
                    }
                  }}
                />
                {activityForm.retryPolicy && (
                  <Input
                    type="number"
                    value={activityForm.retryPolicy.maxRetries}
                    onChange={(e) => updateActivityForm('retryPolicy', { maxRetries: parseInt(e.target.value) || 0 })}
                    style={{ width: 80 }}
                    placeholder="重试次数"
                  />
                )}
              </Space>
            </Form.Item>
          </Space>

          <Divider orientation="left">
            <Space>
              {HANDLER_CONFIG[activityForm.handler]?.icon}
              <Text strong>配置详情</Text>
              <Tag color={HANDLER_CONFIG[activityForm.handler]?.color}>
                {HANDLER_CONFIG[activityForm.handler]?.description}
              </Tag>
            </Space>
          </Divider>

          {renderConfigFields()}
        </Form>
      </Modal>

      {/* Validate Modal */}
      <Modal
        title="验证 Activity 配置"
        open={validateModalVisible}
        onCancel={() => {
          setValidateModalVisible(false);
          setValidationResult(null);
        }}
        footer={[
          <Button
            key="close"
            onClick={() => {
              setValidateModalVisible(false);
              setValidationResult(null);
            }}
          >
            关闭
          </Button>,
        ]}
        width={600}
      >
        {validationResult ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert
              type={validationResult.isValid ? 'success' : 'error'}
              message={validationResult.isValid ? '验证通过' : '验证失败'}
              icon={validationResult.isValid ? <CheckCircleOutlined /> : <WarningOutlined />}
              showIcon
            />
            <Card size="small">
              <Space direction="vertical">
                <Text>
                  <strong>评分:</strong> {validationResult.score}/100
                </Text>
              </Space>
            </Card>
            {validationResult.errors.length > 0 && (
              <Alert
                type="error"
                message="错误"
                description={
                  <ul>
                    {validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                }
              />
            )}
            {validationResult.warnings.length > 0 && (
              <Alert
                type="warning"
                message="警告"
                description={
                  <ul>
                    {validationResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                }
              />
            )}
            {validationResult.suggestions && validationResult.suggestions.length > 0 && (
              <Alert
                type="info"
                message="建议"
                description={
                  <ul>
                    {validationResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                }
              />
            )}
          </Space>
        ) : (
          <Alert type="info" message="点击验证按钮开始验证" />
        )}
      </Modal>
    </div>
  );
};

export default ActivityPage;