import React, { useState } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select,
  Divider, Alert, Collapse, Badge, Popconfirm, Tooltip, Statistic, Row, Col, Switch
} from 'antd';
import {
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined,
  ReloadOutlined, ApiOutlined, CodeOutlined, FileTextOutlined, ChromeOutlined,
  CheckCircleOutlined, ThunderboltOutlined, SettingOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { activityApi, ActivityDTO, CreateActivityDto, ActivityValidationResult } from '../../api/activity';
import type { ColumnsType } from 'antd/es/table';

const { Text, Paragraph } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const { TextArea } = Input;

const HANDLER_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  api: { label: 'API 调用', color: 'green', icon: <ApiOutlined />, description: '通过 HTTP API 调用外部服务' },
  carbone: { label: 'Carbone 渲染', color: 'blue', icon: <FileTextOutlined />, description: '使用 Carbone 引擎渲染文档' },
  browser: { label: '浏览器操作', color: 'purple', icon: <ChromeOutlined />, description: '自动化浏览器操作' },
  script: { label: '脚本执行', color: 'orange', icon: <CodeOutlined />, description: '执行自定义 JavaScript 脚本' },
};

interface ActivityFormData {
  name: string;
  fn: string;
  timeout: string;
  handler: 'api' | 'carbone' | 'browser' | 'script';
  retryPolicy?: { maxRetries: number };
  config: Record<string, any>;
}

const ActivityPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [validateModalVisible, setValidateModalVisible] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityDTO | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityDTO | null>(null);
  const [validationResult, setValidationResult] = useState<ActivityValidationResult | null>(null);
  const [activityForm, setActivityForm] = useState<ActivityFormData>({
    name: '',
    fn: '',
    timeout: '30s',
    handler: 'api',
    config: {},
  });

  const activitiesQuery = useQuery(['activities', searchText], () => activityApi.list());

  const createMutation = useMutation(activityApi.create, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['activities']);
      setEditModalVisible(false);
      form.resetFields();
      resetForm();
    },
    onError: () => message.error(t('common:error')),
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CreateActivityDto> }) => activityApi.update(id, data),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['activities']);
        setEditModalVisible(false);
      },
      onError: () => message.error(t('common:error')),
    }
  );

  const deleteMutation = useMutation(activityApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['activities']);
    },
    onError: () => message.error(t('common:error')),
  });

  const validateMutation = useMutation(activityApi.validate, {
    onSuccess: (result) => {
      setValidationResult(result);
      message.success('验证完成');
    },
    onError: () => message.error('验证失败'),
  });

  const resetForm = () => {
    setActivityForm({ name: '', fn: '', timeout: '30s', handler: 'api', config: {} });
  };

  const handleCreate = () => {
    setEditingActivity(null);
    resetForm();
    setEditModalVisible(true);
  };

  const handleEdit = (activity: ActivityDTO) => {
    setEditingActivity(activity);
    setActivityForm({
      name: activity.name,
      fn: activity.fn,
      timeout: activity.timeout,
      handler: activity.handler as 'api' | 'carbone' | 'browser' | 'script',
      retryPolicy: activity.retryPolicy || undefined,
      config: activity.config || {},
    });
    form.setFieldsValue({ name: activity.name, fn: activity.fn, timeout: activity.timeout, handler: activity.handler });
    setEditModalVisible(true);
  };

  const handleViewDetail = (activity: ActivityDTO) => {
    setSelectedActivity(activity);
    setDetailModalVisible(true);
  };

  const handleValidate = () => {
    setValidationResult(null);
    setValidateModalVisible(true);
    validateMutation.mutate(activityForm as CreateActivityDto);
  };

  const handleSave = () => {
    const data: CreateActivityDto = {
      name: activityForm.name,
      fn: activityForm.fn,
      timeout: activityForm.timeout,
      handler: activityForm.handler,
      retryPolicy: activityForm.retryPolicy,
      config: activityForm.config,
    };

    if (editingActivity) {
      updateMutation.mutate({ id: editingActivity.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      content: '删除后无法恢复，是否继续？',
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const updateActivityForm = (field: string, value: any) => {
    setActivityForm((prev) => ({ ...prev, [field]: value }));
  };

  const columns: ColumnsType<ActivityDTO> = [
    { title: '活动名称', dataIndex: 'name', key: 'name', width: 200, render: (name, r) => <a onClick={() => handleViewDetail(r)}><Text strong>{name}</Text></a> },
    { title: '函数名', dataIndex: 'fn', key: 'fn', width: 180, render: fn => <Tag color="cyan">{fn}</Tag> },
    { title: '处理器', dataIndex: 'handler', key: 'handler', width: 120, render: handler => <Tag color={HANDLER_CONFIG[handler]?.color}>{HANDLER_CONFIG[handler]?.label}</Tag> },
    { title: '超时', dataIndex: 'timeout', key: 'timeout', width: 80 },
    { title: '重试策略', key: 'retryPolicy', width: 100, render: (_, r) => r.retryPolicy ? <Tag color="orange">已配置</Tag> : <Tag color="default">无</Tag> },
    { title: '状态', key: 'status', width: 80, render: (_, r) => <Tag color={r.isActive ? 'green' : 'default'}>{r.isActive ? '已启用' : '已禁用'}</Tag> },
    { title: t('common:actions'), key: 'actions', width: 180, render: (_, r) => (
      <Space size="small">
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
        <Popconfirm title="确认删除" onConfirm={() => handleDelete(r.id)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
          <Button type="link" size="small" icon={<DeleteOutlined />} danger />
        </Popconfirm>
      </Space>
    )},
  ];

  const filteredActivities = (activitiesQuery.data || []).filter(a =>
    a.name.toLowerCase().includes(searchText.toLowerCase()) || a.fn.toLowerCase().includes(searchText.toLowerCase())
  );

  const stats = {
    total: activitiesQuery.data?.length || 0,
    api: activitiesQuery.data?.filter(a => a.handler === 'api').length || 0,
    script: activitiesQuery.data?.filter(a => a.handler === 'script').length || 0,
    active: activitiesQuery.data?.filter(a => a.isActive).length || 0,
  };

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="总 Activity 数" value={stats.total} prefix={<ThunderboltOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="API 类型" value={stats.api} prefix={<ApiOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="脚本类型" value={stats.script} prefix={<CodeOutlined />} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="已启用" value={stats.active} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#1890ff' }} /></Card></Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Input placeholder="搜索活动..." prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 200 }} allowClear />
          <Space>
            <Button icon={<PlusOutlined />} type="primary" onClick={handleCreate}>创建 Activity</Button>
            <Button icon={<ReloadOutlined />} onClick={() => activitiesQuery.refetch()}>{t('common:refresh')}</Button>
          </Space>
        </Space>
      </Card>

      <Card>
        <Table columns={columns} dataSource={filteredActivities} rowKey="id" loading={activitiesQuery.isLoading} pagination={{ showSizeChanger: true, showTotal: total => `共 ${total} 条` }} />
      </Card>

      <Modal title={editingActivity ? '编辑 Activity' : '创建 Activity'} open={editModalVisible} onOk={handleSave} onCancel={() => setEditModalVisible(false)}
        footer={[<Button key="validate" icon={<PlayCircleOutlined />} onClick={handleValidate}>验证</Button>, <Button key="cancel" onClick={() => setEditModalVisible(false)}>取消</Button>, <Button key="save" type="primary" loading={createMutation.isLoading || updateMutation.isLoading} onClick={handleSave}>保存</Button>]}
        width={700}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}><Form.Item label="活动名称" name="name" rules={[{ required: true, message: '请输入活动名称' }]}><Input placeholder="例如：生成合同参数" value={activityForm.name} onChange={e => updateActivityForm('name', e.target.value)} /></Form.Item></Col>
            <Col span={12}><Form.Item label="函数名" name="fn" rules={[{ required: true, message: '请输入函数名' }]}><Input placeholder="例如：generateContractParams" value={activityForm.fn} onChange={e => updateActivityForm('fn', e.target.value)} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item label="超时时间"><Select value={activityForm.timeout} onChange={v => updateActivityForm('timeout', v)}><Option value="10s">10s</Option><Option value="30s">30s</Option><Option value="60s">60s</Option><Option value="120s">120s</Option></Select></Form.Item></Col>
            <Col span={8}><Form.Item label="处理器类型"><Select value={activityForm.handler} onChange={v => updateActivityForm('handler', v)}><Option value="api">API 调用</Option><Option value="carbone">Carbone 渲染</Option><Option value="browser">浏览器操作</Option><Option value="script">脚本执行</Option></Select></Form.Item></Col>
            <Col span={8}><Form.Item label="重试策略"><Space><Switch checked={!!activityForm.retryPolicy} onChange={checked => updateActivityForm('retryPolicy', checked ? { maxRetries: 3 } : undefined)} />{activityForm.retryPolicy && <Input type="number" value={activityForm.retryPolicy.maxRetries} onChange={e => updateActivityForm('retryPolicy', { maxRetries: parseInt(e.target.value) || 0 })} style={{ width: 80 }} />}</Space></Form.Item></Col>
          </Row>
          <Divider>配置详情</Divider>
          <Card size="small" style={{ background: activityForm.handler === 'api' ? 'linear-gradient(135deg, #f6ffed 0%, #fff 100%)' : activityForm.handler === 'script' ? 'linear-gradient(135deg, #fff7e6 0%, #fff 100%)' : 'linear-gradient(135deg, #e6f7ff 0%, #fff 100%)', border: `1px solid ${activityForm.handler === 'api' ? '#b7eb8f' : activityForm.handler === 'script' ? '#ffd591' : '#91d5ff'}` }}>
            <Space align="start">{HANDLER_CONFIG[activityForm.handler]?.icon}<div><Text strong>{HANDLER_CONFIG[activityForm.handler]?.label}</Text><Paragraph type="secondary" style={{ marginBottom: 0 }}>{HANDLER_CONFIG[activityForm.handler]?.description}</Paragraph></div></Space>
          </Card>
          {activityForm.handler === 'api' && (
            <Card size="small" style={{ marginTop: 16 }}>
              <Form.Item label="API 端点"><Input placeholder="https://api.example.com/v1/resource" value={activityForm.config.endpoint || ''} onChange={e => updateActivityForm('config', { ...activityForm.config, endpoint: e.target.value })} /></Form.Item>
              <Row gutter={16}>
                <Col span={12}><Form.Item label="HTTP 方法"><Select value={activityForm.config.method || 'POST'} onChange={v => updateActivityForm('config', { ...activityForm.config, method: v })}><Option value="GET">GET</Option><Option value="POST">POST</Option><Option value="PUT">PUT</Option><Option value="DELETE">DELETE</Option></Select></Form.Item></Col>
                <Col span={12}><Form.Item label="超时 (ms)"><Input type="number" value={activityForm.config.timeout || 30000} onChange={e => updateActivityForm('config', { ...activityForm.config, timeout: parseInt(e.target.value) || 30000 })} /></Form.Item></Col>
              </Row>
            </Card>
          )}
          {activityForm.handler === 'script' && (
            <Card size="small" style={{ marginTop: 16 }}>
              <Alert message="脚本说明" description="编写自定义 JavaScript/TypeScript 脚本，脚本应返回 Promise" type="info" showIcon style={{ marginBottom: 16 }} />
              <Form.Item label="脚本内容"><TextArea rows={8} placeholder="async function execute(params, context) { return { status: 'success' }; }" value={activityForm.config.script || ''} onChange={e => updateActivityForm('config', { ...activityForm.config, script: e.target.value })} style={{ fontFamily: 'monospace' }} /></Form.Item>
            </Card>
          )}
        </Form>
      </Modal>

      <Modal title="Activity 详情" open={detailModalVisible} onCancel={() => setDetailModalVisible(false)} footer={null} width={600}>
        {selectedActivity && (
          <Collapse defaultActiveKey={['basic', 'config']}>
            <Panel header={<Text><ThunderboltOutlined /> 基本信息</Text>} key="basic">
              <Row gutter={16}>
                <Col span={12}><Text><strong>名称:</strong> {selectedActivity.name}</Text></Col>
                <Col span={12}><Text><strong>函数名:</strong> <Tag color="cyan">{selectedActivity.fn}</Tag></Text></Col>
                <Col span={12}><Text><strong>处理器:</strong> <Tag color={HANDLER_CONFIG[selectedActivity.handler]?.color}>{HANDLER_CONFIG[selectedActivity.handler]?.label}</Tag></Text></Col>
                <Col span={12}><Text><strong>超时:</strong> {selectedActivity.timeout}</Text></Col>
              </Row>
            </Panel>
            <Panel header={<Text><SettingOutlined /> 配置详情</Text>} key="config"><pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, maxHeight: 300, overflow: 'auto', fontSize: 12 }}>{JSON.stringify(selectedActivity.config, null, 2)}</pre></Panel>
          </Collapse>
        )}
      </Modal>

      <Modal title="验证 Activity" open={validateModalVisible} onCancel={() => setValidateModalVisible(false)} footer={[<Button onClick={() => setValidateModalVisible(false)}>关闭</Button>]} width={500}>
        {validationResult ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type={validationResult.isValid ? 'success' : 'error'} message={validationResult.isValid ? '验证通过' : '验证失败'} showIcon />
            <Card><Text><strong>评分:</strong> {validationResult.score}/100</Text></Card>
            {validationResult.errors.length > 0 && <Alert type="error" message="错误" description={<ul>{validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>} />}
          </Space>
        ) : <Alert type="info" message="点击验证按钮开始验证" />}
      </Modal>
    </div>
  );
};

export default ActivityPage;