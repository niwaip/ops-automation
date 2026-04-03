import React, { useState } from 'react';
import { Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select, Divider, Alert, Row, Col } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckOutlined,
  StopOutlined,
  ExperimentOutlined,
  CloudServerOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { aiModelApi, AIModel, ModelProvider } from '../../api/ai';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { Option } = Select;

// Provider display names
const PROVIDER_NAMES: Record<string, string> = {
  'alibaba-coding': '阿里云 Coding',
  'alibaba-bailian': '阿里云百炼',
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'azure': 'Azure OpenAI',
  'deepseek': 'DeepSeek',
  'local': '本地模型',
};

const AIModelAdminPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [testPrompt, setTestPrompt] = useState('');

  const modelsQuery = useQuery(['ai-models'], () => aiModelApi.list());
  const presetsQuery = useQuery(['ai-model-presets'], () => aiModelApi.listPresets());

  const enableMutation = useMutation(aiModelApi.enable, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['ai-models']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const disableMutation = useMutation(aiModelApi.disable, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['ai-models']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const createMutation = useMutation(aiModelApi.create, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['ai-models']);
      setCreateModalVisible(false);
      createForm.resetFields();
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<AIModel> }) => aiModelApi.update(id, data),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['ai-models']);
        setEditModalVisible(false);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const deleteMutation = useMutation(aiModelApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['ai-models']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const testMutation = useMutation(
    ({ id, prompt }: { id: string; prompt: string }) => aiModelApi.test(id, prompt),
    {
      onSuccess: (result: { success: boolean; response?: string; error?: string }) => {
        if (result.success) {
          message.success(`Test successful: ${result.response}`);
        } else {
          message.error(`Test failed: ${result.error}`);
        }
        setTestModalVisible(false);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const handleEnable = (id: string) => {
    enableMutation.mutate(id);
  };

  const handleDisable = (id: string) => {
    disableMutation.mutate(id);
  };

  const handleEdit = (model: AIModel) => {
    setEditingModel(model);
    editForm.setFieldsValue(model);
    setEditModalVisible(true);
  };

  const handleSaveEdit = () => {
    editForm.validateFields().then((values) => {
      if (editingModel) {
        updateMutation.mutate({ id: editingModel.id, data: values });
      }
    });
  };

  const handleCreate = () => {
    createForm.validateFields().then((values) => {
      createMutation.mutate(values);
    });
  };

  const handleTest = (model: AIModel) => {
    setEditingModel(model);
    setTestPrompt('');
    setTestModalVisible(true);
  };

  const handleRunTest = () => {
    if (editingModel && testPrompt) {
      testMutation.mutate({ id: editingModel.id, prompt: testPrompt });
    }
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const columns: ColumnsType<AIModel> = [
    {
      title: t('admin:modelName'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('admin:modelProvider'),
      dataIndex: 'provider',
      key: 'provider',
      render: (provider: ModelProvider) => (
        <Tag color={provider.startsWith('alibaba') ? 'orange' : 'blue'}>
          {PROVIDER_NAMES[provider] || provider}
        </Tag>
      ),
    },
    {
      title: t('admin:modelType'),
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => <Tag color="green">{type}</Tag>,
    },
    {
      title: t('admin:modelEndpoint'),
      dataIndex: 'endpoint',
      key: 'endpoint',
      ellipsis: true,
    },
    {
      title: t('admin:userStatus'),
      dataIndex: 'isEnabled',
      key: 'isEnabled',
      render: (isEnabled: boolean) => (
        <Tag color={isEnabled ? 'success' : 'error'}>
          {isEnabled ? t('admin:modelEnabled') : t('admin:modelDisabled')}
        </Tag>
      ),
    },
    {
      title: t('common:createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 250,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            {t('common:edit')}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<ExperimentOutlined />}
            onClick={() => handleTest(record)}
          >
            {t('admin:testModel')}
          </Button>
          {record.isEnabled ? (
            <Button
              type="link"
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => handleDisable(record.id)}
            >
              {t('admin:disableModel')}
            </Button>
          ) : (
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleEnable(record.id)}
            >
              {t('admin:enableModel')}
            </Button>
          )}
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            {t('common:delete')}
          </Button>
        </Space>
      ),
    },
  ];

  const providerOptions: ModelProvider[] = ['alibaba-coding', 'alibaba-bailian', 'openai', 'anthropic', 'azure', 'deepseek', 'local'];
  const typeOptions = ['chat', 'embedding', 'image'];

  // Group presets by provider
  const groupedPresets = presetsQuery.data?.presets?.reduce((acc, preset) => {
    if (!acc[preset.provider]) {
      acc[preset.provider] = [];
    }
    acc[preset.provider].push(preset);
    return acc;
  }, {} as Record<string, typeof presetsQuery.data.presets>) || {};

  return (
    <div>
      <Title level={4}>{t('admin:modelManagement')}</Title>

      {/* Preset Models Status Card */}
      <Card
        style={{ marginTop: 16 }}
        title={
          <Space>
            <CloudServerOutlined />
            <span>预设模型状态</span>
          </Space>
        }
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => presetsQuery.refetch()}
            loading={presetsQuery.isLoading}
          >
            {t('common:refresh')}
          </Button>
        }
      >
        <Alert
          type="info"
          showIcon
          message="配置 API Key 后，预设模型会在服务启动时自动初始化"
          style={{ marginBottom: 16 }}
        />

        {Object.entries(groupedPresets).map(([provider, presets]) => (
          <div key={provider} style={{ marginBottom: 16 }}>
            <Title level={5} style={{ marginBottom: 8 }}>
              {PROVIDER_NAMES[provider] || provider}
            </Title>
            <Row gutter={[8, 8]}>
              {(presets as typeof presetsQuery.data.presets).map((preset) => (
                <Col key={preset.name}>
                  <Tag
                    icon={preset.configured ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                    color={preset.configured ? 'success' : 'default'}
                    style={{ padding: '4px 8px' }}
                  >
                    {preset.name}
                    {preset.configured ? ' (已配置)' : ' (未配置)'}
                  </Tag>
                </Col>
              ))}
            </Row>
          </div>
        ))}
      </Card>

      {/* Registered Models Card */}
      <Card style={{ marginTop: 16 }}>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Input
            placeholder={t('common:search')}
            prefix={<SearchOutlined />}
            style={{ width: 200 }}
            allowClear
          />
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => modelsQuery.refetch()}
            >
              {t('common:refresh')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
            >
              {t('admin:createModel')}
            </Button>
          </Space>
        </Space>

        <Table
          columns={columns}
          dataSource={modelsQuery.data?.models || []}
          rowKey="id"
          loading={modelsQuery.isLoading}
          pagination={false}
        />
      </Card>

      <Modal
        title={t('admin:createModel')}
        open={createModalVisible}
        onOk={handleCreate}
        onCancel={() => setCreateModalVisible(false)}
        confirmLoading={createMutation.isLoading}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="name"
            label={t('admin:modelName')}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="provider"
            label={t('admin:modelProvider')}
            rules={[{ required: true }]}
          >
            <Select>
              {providerOptions.map((p) => (
                <Option key={p} value={p}>{PROVIDER_NAMES[p] || p}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="type"
            label={t('admin:modelType')}
            rules={[{ required: true }]}
          >
            <Select>
              {typeOptions.map((t) => (
                <Option key={t} value={t}>{t}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="endpoint"
            label={t('admin:modelEndpoint')}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label={t('admin:modelApiKey')}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('admin:editModel')}
        open={editModalVisible}
        onOk={handleSaveEdit}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={updateMutation.isLoading}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="name"
            label={t('admin:modelName')}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="endpoint"
            label={t('admin:modelEndpoint')}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label={t('admin:modelApiKey')}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('admin:testModel')}
        open={testModalVisible}
        onOk={handleRunTest}
        onCancel={() => setTestModalVisible(false)}
        confirmLoading={testMutation.isLoading}
      >
        <Form.Item label="Test Prompt">
          <Input.TextArea
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            placeholder="Enter a test prompt..."
            rows={4}
          />
        </Form.Item>
      </Modal>
    </div>
  );
};

export default AIModelAdminPage;