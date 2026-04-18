import React, { useState, useEffect } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select,
  Descriptions, Tabs, Tooltip, Collapse, Steps, Divider, Badge, Empty, Progress,
  InputNumber, Switch, Alert, Popconfirm, Upload, Dropdown, Menu, Timeline
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, PlusOutlined,
  InfoCircleOutlined, ThunderboltOutlined, ApiOutlined, RocketOutlined,
  FileTextOutlined, CodeOutlined, ToolOutlined, CheckCircleOutlined, WarningOutlined,
  CopyOutlined, ExportOutlined, ImportOutlined, DownloadOutlined, UploadOutlined,
  PlayCircleOutlined, EyeOutlined, SettingOutlined, ArrowUpOutlined, ArrowDownOutlined, OrderedListOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  executionFlowApi,
  ExecutionFlowTemplateDTO,
  CreateExecutionFlowTemplateDTO,
  ExecutionFlowStep,
  ValidationResult,
  EXECUTION_FLOW_CATEGORIES,
  STEP_TYPE_LABELS,
  StepType,
} from '../../api/execution-flow';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;
const { Panel } = Collapse;
const { TextArea } = Input;

// Default step templates for quick creation
const DEFAULT_STEP_TEMPLATES: Record<string, ExecutionFlowStep> = {
  ai_match: {
    type: 'text',
    name: 'AI语义匹配',
    content: '根据用户输入自动识别意图并匹配最佳技能',
    expectedOutput: '匹配到的技能ID和参数',
  },
  collect_params: {
    type: 'text',
    name: '收集参数',
    content: '通过对话收集用户需要的参数',
    expectedOutput: '完整的参数集合',
  },
  generate_params: {
    type: 'api',
    name: 'AI生成参数',
    api: {
      endpoint: '/api/ai/generate-params',
      method: 'POST',
    },
    expectedOutput: 'AI提取的参数JSON',
  },
  user_confirm: {
    type: 'text',
    name: '用户确认',
    content: '展示参数并等待用户确认',
    expectedOutput: '用户确认结果',
  },
  render_document: {
    type: 'api',
    name: '文档渲染',
    api: {
      endpoint: '/api/carbone/render',
      method: 'POST',
    },
    expectedOutput: '渲染后的文档URL',
  },
};

const ExecutionFlowTemplatePage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [validateModalVisible, setValidateModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ExecutionFlowTemplateDTO | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ExecutionFlowTemplateDTO | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [form] = Form.useForm();
  const [stepsForm] = Form.useForm();
  const [currentSteps, setCurrentSteps] = useState<ExecutionFlowStep[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importJson, setImportJson] = useState('');

  // Queries
  const templatesQuery = useQuery(
    ['execution-flow-templates', selectedCategory, searchText],
    () => executionFlowApi.list({
      category: selectedCategory,
      search: searchText,
      isActive: true,
    })
  );

  const categoriesQuery = useQuery(['execution-flow-categories'], executionFlowApi.getCategories);

  // Mutations
  const createMutation = useMutation(executionFlowApi.create, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['execution-flow-templates']);
      setEditModalVisible(false);
      form.resetFields();
      setCurrentSteps([]);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CreateExecutionFlowTemplateDTO> }) =>
      executionFlowApi.update(id, data),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['execution-flow-templates']);
        setEditModalVisible(false);
        setEditingTemplate(null);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const deleteMutation = useMutation(executionFlowApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['execution-flow-templates']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const validateMutation = useMutation(executionFlowApi.validate, {
    onSuccess: (result) => {
      setValidationResult(result.validationResult);
      message.success('验证完成');
    },
    onError: () => {
      message.error('验证失败');
    },
  });

  const cloneMutation = useMutation(
    ({ id, name }: { id: string; name: string }) => executionFlowApi.clone(id, name),
    {
      onSuccess: () => {
        message.success('复制成功');
        queryClient.invalidateQueries(['execution-flow-templates']);
      },
      onError: () => {
        message.error('复制失败');
      },
    }
  );

  const importMutation = useMutation(executionFlowApi.import, {
    onSuccess: () => {
      message.success('导入成功');
      queryClient.invalidateQueries(['execution-flow-templates']);
      setImportModalVisible(false);
      setImportJson('');
    },
    onError: () => {
      message.error('导入失败，请检查JSON格式');
    },
  });

  // Handlers
  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    setCurrentSteps([]);
    form.setFieldsValue({
      category: 'document',
      isPublic: true,
    });
    setEditModalVisible(true);
  };

  const handleEdit = (template: ExecutionFlowTemplateDTO) => {
    setEditingTemplate(template);
    form.setFieldsValue({
      name: template.name,
      description: template.description,
      category: template.category,
      isPublic: template.isPublic,
    });
    setCurrentSteps(template.steps as ExecutionFlowStep[]);
    setEditModalVisible(true);
  };

  const handleViewDetail = (template: ExecutionFlowTemplateDTO) => {
    setSelectedTemplate(template);
    setDetailModalVisible(true);
  };

  const handleValidate = (template: ExecutionFlowTemplateDTO) => {
    setSelectedTemplate(template);
    setValidationResult(template.validation);
    setValidateModalVisible(true);
    validateMutation.mutate(template.id);
  };

  const handleAddStep = (stepTemplate?: string) => {
    if (stepTemplate && DEFAULT_STEP_TEMPLATES[stepTemplate]) {
      const newStep = { ...DEFAULT_STEP_TEMPLATES[stepTemplate], id: Date.now().toString() };
      setCurrentSteps([...currentSteps, newStep]);
    } else {
      setCurrentSteps([...currentSteps, {
        id: Date.now().toString(),
        type: 'text',
        name: `步骤 ${currentSteps.length + 1}`,
        content: '',
      }]);
    }
  };

  const handleRemoveStep = (index: number) => {
    setCurrentSteps(currentSteps.filter((_, i) => i !== index));
  };

  const handleUpdateStep = (index: number, field: string, value: any) => {
    const updatedSteps = [...currentSteps];
    updatedSteps[index] = { ...updatedSteps[index], [field]: value };
    setCurrentSteps(updatedSteps);
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const newSteps = [...currentSteps];
      [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
      setCurrentSteps(newSteps);
    } else if (direction === 'down' && index < currentSteps.length - 1) {
      const newSteps = [...currentSteps];
      [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
      setCurrentSteps(newSteps);
    }
  };

  const handleSave = () => {
    form.validateFields().then((values) => {
      const data: CreateExecutionFlowTemplateDTO = {
        name: values.name,
        description: values.description,
        category: values.category || 'document',
        steps: currentSteps,
        executionFlowKeys: currentSteps.map(s => s.name),
        isPublic: values.isPublic,
      };

      if (editingTemplate) {
        updateMutation.mutate({ id: editingTemplate.id, data });
      } else {
        createMutation.mutate(data);
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

  const handleClone = (template: ExecutionFlowTemplateDTO) => {
    cloneMutation.mutate({ id: template.id, name: `${template.name} (副本)` });
  };

  const handleExport = async (template: ExecutionFlowTemplateDTO) => {
    const result = await executionFlowApi.export(template.id);
    const blob = new Blob([result.data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    if (importJson) {
      importMutation.mutate(importJson);
    }
  };

  // Render step type badge
  const renderStepTypeBadge = (type: StepType) => {
    const info = STEP_TYPE_LABELS[type];
    const icons: Record<StepType, React.ReactNode> = {
      text: <FileTextOutlined />,
      script: <CodeOutlined />,
      tool: <ToolOutlined />,
      api: <ApiOutlined />,
    };
    return (
      <Tag color={info.color} icon={icons[type]}>
        {info.label}
      </Tag>
    );
  };

  // Render validation score
  const renderValidationScore = (validation: ValidationResult | null) => {
    if (!validation) {
      return <Tag color="default">未验证</Tag>;
    }
    const score = validation.score || 0;
    const color = score >= 80 ? 'success' : score >= 60 ? 'warning' : 'error';
    return (
      <Tooltip title={`评分: ${score}分`}>
        <Badge status={color} text={`${score}分`} />
      </Tooltip>
    );
  };

  // Columns
  const columns: ColumnsType<ExecutionFlowTemplateDTO> = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category: string) => {
        const info = EXECUTION_FLOW_CATEGORIES[category] || { label: category, color: 'default', desc: '' };
        return (
          <Tooltip title={info.desc}>
            <Tag color={info.color}>{info.label}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc: string) => desc || <Text type="secondary">无描述</Text>,
    },
    {
      title: '步骤数',
      key: 'stepCount',
      width: 80,
      render: (_, record) => (
        <Badge count={record.steps?.length || 0} showZero color="blue" />
      ),
    },
    {
      title: '验证状态',
      key: 'validation',
      width: 100,
      render: (_, record) => renderValidationScore(record.validation),
    },
    {
      title: '使用次数',
      dataIndex: 'usageCount',
      key: 'usageCount',
      width: 80,
      render: (count: number) => (
        <Text type="secondary">{count || 0}</Text>
      ),
    },
    {
      title: '公开',
      dataIndex: 'isPublic',
      key: 'isPublic',
      width: 80,
      render: (isPublic: boolean) => (
        <Tag color={isPublic ? 'green' : 'default'}>
          {isPublic ? '公开' : '私有'}
        </Tag>
      ),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => handleValidate(record)}
          >
            验证
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'edit', icon: <EditOutlined />, label: '编辑', onClick: () => handleEdit(record) },
                { key: 'clone', icon: <CopyOutlined />, label: '复制', onClick: () => handleClone(record) },
                { key: 'export', icon: <ExportOutlined />, label: '导出', onClick: () => handleExport(record) },
                { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: () => handleDelete(record.id) },
              ],
            }}
          >
            <Button type="link" size="small" icon={<SettingOutlined />}>
              更多
            </Button>
          </Dropdown>
        </Space>
      ),
    },
  ];

  // Render step editor
  const renderStepEditor = () => (
    <div style={{ marginTop: 16 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<PlusOutlined />} onClick={() => handleAddStep()}>
          添加空白步骤
        </Button>
        <Dropdown
          menu={{
            items: Object.entries(DEFAULT_STEP_TEMPLATES).map(([key, step]) => ({
              key,
              icon: renderStepTypeBadge(step.type),
              label: step.name,
              onClick: () => handleAddStep(key),
            })),
          }}
        >
          <Button icon={<OrderedListOutlined />}>
            添加预设步骤
          </Button>
        </Dropdown>
      </Space>

      {currentSteps.length === 0 ? (
        <Empty description="暂无步骤，请添加" />
      ) : (
        <Timeline>
          {currentSteps.map((step, index) => (
            <Timeline.Item
              key={step.id || index}
              dot={renderStepTypeBadge(step.type)}
              color={step.optional ? 'gray' : 'blue'}
            >
              <Card size="small" style={{ marginBottom: 8 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Input
                      value={step.name}
                      onChange={(e) => handleUpdateStep(index, 'name', e.target.value)}
                      placeholder="步骤名称"
                      style={{ width: 200 }}
                    />
                    <Space>
                      <Select
                        value={step.type}
                        onChange={(v) => handleUpdateStep(index, 'type', v)}
                        style={{ width: 120 }}
                      >
                        {Object.entries(STEP_TYPE_LABELS).map(([key, value]) => (
                          <Option key={key} value={key}>
                            <Tag color={value.color}>{value.label}</Tag>
                          </Option>
                        ))}
                      </Select>
                      <Switch
                        checked={step.optional}
                        onChange={(v) => handleUpdateStep(index, 'optional', v)}
                        checkedChildren="可选"
                        unCheckedChildren="必选"
                      />
                      <Button
                        icon={<ArrowUpOutlined />}
                        onClick={() => handleMoveStep(index, 'up')}
                        disabled={index === 0}
                      />
                      <Button
                        icon={<ArrowDownOutlined />}
                        onClick={() => handleMoveStep(index, 'down')}
                        disabled={index === currentSteps.length - 1}
                      />
                      <Button
                        icon={<DeleteOutlined />}
                        danger
                        onClick={() => handleRemoveStep(index)}
                      />
                    </Space>
                  </Space>

                  {step.type === 'text' && (
                    <TextArea
                      value={step.content}
                      onChange={(e) => handleUpdateStep(index, 'content', e.target.value)}
                      placeholder="步骤指导内容（纯文本）"
                      rows={3}
                    />
                  )}

                  {step.type === 'script' && (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Select
                        value={step.script?.language}
                        onChange={(v) => handleUpdateStep(index, 'script', { ...step.script, language: v })}
                        style={{ width: 150 }}
                      >
                        <Option value="bash">Bash</Option>
                        <Option value="python">Python</Option>
                        <Option value="javascript">JavaScript</Option>
                      </Select>
                      <TextArea
                        value={step.script?.code}
                        onChange={(e) => handleUpdateStep(index, 'script', { ...step.script, code: e.target.value })}
                        placeholder="脚本代码"
                        rows={4}
                      />
                    </Space>
                  )}

                  {step.type === 'tool' && (
                    <Space>
                      <Input
                        value={step.tool?.name}
                        onChange={(e) => handleUpdateStep(index, 'tool', { ...step.tool, name: e.target.value })}
                        placeholder="工具名称（如 Read, Write, Bash）"
                        style={{ width: 200 }}
                      />
                      <Input
                        value={JSON.stringify(step.tool?.params || {})}
                        onChange={(e) => {
                          try {
                            const params = JSON.parse(e.target.value);
                            handleUpdateStep(index, 'tool', { ...step.tool, params });
                          } catch {}
                        }}
                        placeholder="参数JSON"
                        style={{ width: 200 }}
                      />
                    </Space>
                  )}

                  {step.type === 'api' && (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Space>
                        <Select
                          value={step.api?.method}
                          onChange={(v) => handleUpdateStep(index, 'api', { ...step.api, method: v })}
                          style={{ width: 100 }}
                        >
                          <Option value="GET">GET</Option>
                          <Option value="POST">POST</Option>
                          <Option value="PUT">PUT</Option>
                          <Option value="DELETE">DELETE</Option>
                        </Select>
                        <Input
                          value={step.api?.endpoint}
                          onChange={(e) => handleUpdateStep(index, 'api', { ...step.api, endpoint: e.target.value })}
                          placeholder="API端点URL"
                          style={{ width: 300 }}
                        />
                      </Space>
                    </Space>
                  )}

                  <Input
                    value={step.expectedOutput}
                    onChange={(e) => handleUpdateStep(index, 'expectedOutput', e.target.value)}
                    placeholder="预期输出描述（可选）"
                    style={{ width: '100%' }}
                  />
                </Space>
              </Card>
            </Timeline.Item>
          ))}
        </Timeline>
      )}
    </div>
  );

  return (
    <div>
      <Title level={4}>执行流程模板管理</Title>

      <Card style={{ marginTop: 8, marginBottom: 16 }}>
        <Space direction="vertical" size="small">
          <Text strong>流程模板说明：</Text>
          <Text>• 流程模板定义了AI执行的步骤序列，类似Claude Code Skills</Text>
          <Text>• 每个步骤可以是<strong>纯文本指导</strong>、<strong>脚本执行</strong>、<strong>系统工具</strong>或<strong>API调用</strong></Text>
          <Divider style={{ margin: '8px 0' }} />
          <Text strong>步骤类型：</Text>
          <Space wrap>
            {Object.entries(STEP_TYPE_LABELS).map(([key, value]) => (
              <Tag key={key} color={value.color} icon={
                key === 'text' ? <FileTextOutlined /> :
                key === 'script' ? <CodeOutlined /> :
                key === 'tool' ? <ToolOutlined /> :
                <ApiOutlined />
              }>
                {value.label}
              </Tag>
            ))}
          </Space>
          <Divider style={{ margin: '8px 0' }} />
          <Text strong>AI验证：</Text>
          <Text>• 点击"验证"按钮，AI会检查流程是否可执行、步骤是否合理</Text>
          <Text>• 验证结果包括评分、建议和警告</Text>
        </Space>
      </Card>

      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Input
              placeholder={t('common:search')}
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Select
              placeholder="选择分类"
              value={selectedCategory}
              onChange={setSelectedCategory}
              style={{ width: 150 }}
              allowClear
            >
              {Object.entries(EXECUTION_FLOW_CATEGORIES).map(([key, value]) => (
                <Option key={key} value={key}>
                  <Tag color={value.color}>{value.label}</Tag>
                </Option>
              ))}
            </Select>
          </Space>
          <Space>
            <Button
              icon={<ImportOutlined />}
              onClick={() => setImportModalVisible(true)}
            >
              导入
            </Button>
            <Button
              icon={<PlusOutlined />}
              type="primary"
              onClick={handleCreate}
            >
              创建模板
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => templatesQuery.refetch()}
            >
              {t('common:refresh')}
            </Button>
          </Space>
        </Space>

        <Table
          columns={columns}
          dataSource={templatesQuery.data?.templates || []}
          rowKey="id"
          loading={templatesQuery.isLoading}
          scroll={{ x: 1200 }}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => t('common:pagination.total', { total }),
          }}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title={`模板详情 - ${selectedTemplate?.name}`}
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false);
          setSelectedTemplate(null);
        }}
        footer={null}
        width={900}
      >
        {selectedTemplate && (
          <Collapse defaultActiveKey={['basic', 'steps', 'validation']}>
            <Panel header="基本信息" key="basic">
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="模板ID">{selectedTemplate.id}</Descriptions.Item>
                <Descriptions.Item label="分类">
                  <Tag color={EXECUTION_FLOW_CATEGORIES[selectedTemplate.category]?.color}>
                    {EXECUTION_FLOW_CATEGORIES[selectedTemplate.category]?.label}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>{selectedTemplate.description}</Descriptions.Item>
                <Descriptions.Item label="使用次数">{selectedTemplate.usageCount}</Descriptions.Item>
                <Descriptions.Item label="公开状态">
                  {selectedTemplate.isPublic ? '公开' : '私有'}
                </Descriptions.Item>
              </Descriptions>
            </Panel>

            <Panel header="执行步骤" key="steps">
              <Steps
                current={-1}
                direction="vertical"
                items={selectedTemplate.steps?.map((step: ExecutionFlowStep, idx: number) => ({
                  title: step.name,
                  description: (
                    <Space direction="vertical" size="small">
                      {renderStepTypeBadge(step.type)}
                      {step.type === 'text' && <Text>{step.content}</Text>}
                      {step.type === 'script' && (
                        <Text code>{step.script?.language}: {step.script?.code?.slice(0, 50)}...</Text>
                      )}
                      {step.type === 'tool' && <Text>工具: {step.tool?.name}</Text>}
                      {step.type === 'api' && (
                        <Text>API: {step.api?.method} {step.api?.endpoint}</Text>
                      )}
                      {step.expectedOutput && (
                        <Text type="secondary">预期输出: {step.expectedOutput}</Text>
                      )}
                    </Space>
                  ),
                  status: 'wait',
                  icon: idx === 0 ? <ThunderboltOutlined /> : undefined,
                })) || []}
              />
            </Panel>

            <Panel header="验证结果" key="validation">
              {selectedTemplate.validation ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Progress
                    percent={selectedTemplate.validation.score || 0}
                    status={selectedTemplate.validation.isValid ? 'success' : 'exception'}
                    format={(percent) => `${percent}分`}
                  />
                  {selectedTemplate.validation.warnings?.length > 0 && (
                    <Alert
                      type="warning"
                      message="警告"
                      description={
                        <ul>
                          {selectedTemplate.validation.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      }
                    />
                  )}
                  {selectedTemplate.validation.suggestions?.length > 0 && (
                    <Alert
                      type="info"
                      message="建议"
                      description={
                        <ul>
                          {selectedTemplate.validation.suggestions.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      }
                    />
                  )}
                  <Text type="secondary">
                    验证时间: {new Date(selectedTemplate.validation.validatedAt).toLocaleString()}
                  </Text>
                </Space>
              ) : (
                <Empty description="尚未验证" />
              )}
            </Panel>
          </Collapse>
        )}
      </Modal>

      {/* Edit/Create Modal */}
      <Modal
        title={editingTemplate ? '编辑模板' : '创建模板'}
        open={editModalVisible}
        onOk={handleSave}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingTemplate(null);
          setCurrentSteps([]);
        }}
        confirmLoading={createMutation.isLoading || updateMutation.isLoading}
        width={800}
        style={{ top: 20 }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="category"
            label="分类"
          >
            <Select>
              {Object.entries(EXECUTION_FLOW_CATEGORIES).map(([key, value]) => (
                <Option key={key} value={key}>
                  <Space>
                    <Tag color={value.color}>{value.label}</Tag>
                    <Text type="secondary">{value.desc}</Text>
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="isPublic"
            label="公开状态"
            valuePropName="checked"
          >
            <Switch checkedChildren="公开" unCheckedChildren="私有" />
          </Form.Item>
        </Form>

        <Divider>执行步骤配置</Divider>
        {renderStepEditor()}
      </Modal>

      {/* Validate Modal */}
      <Modal
        title={`验证模板 - ${selectedTemplate?.name}`}
        open={validateModalVisible}
        onCancel={() => {
          setValidateModalVisible(false);
          setSelectedTemplate(null);
          setValidationResult(null);
        }}
        footer={[
          <Button key="close" onClick={() => setValidateModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={600}
      >
        {validateMutation.isLoading ? (
          <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
            <Progress type="circle" percent={50} status="active" />
            <Text>正在验证流程...</Text>
          </Space>
        ) : validationResult ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert
              type={validationResult.isValid ? 'success' : 'error'}
              message={validationResult.isValid ? '验证通过' : '验证失败'}
              icon={validationResult.isValid ? <CheckCircleOutlined /> : <WarningOutlined />}
              showIcon
            />
            <Progress
              percent={validationResult.score || 0}
              status={validationResult.isValid ? 'success' : 'exception'}
              format={(percent) => `${percent}分`}
            />
            {validationResult.warnings?.length > 0 && (
              <Alert
                type="warning"
                message="警告"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {validationResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                }
              />
            )}
            {validationResult.suggestions?.length > 0 && (
              <Alert
                type="info"
                message="优化建议"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {validationResult.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                }
              />
            )}
            {validationResult.details?.stepAnalysis && (
              <Collapse ghost>
                <Panel header="步骤分析详情" key="details">
                  <Table
                    size="small"
                    dataSource={validationResult.details.stepAnalysis}
                    columns={[
                      { title: '步骤', dataIndex: 'stepName', key: 'stepName' },
                      {
                        title: '可执行',
                        dataIndex: 'isExecutable',
                        key: 'isExecutable',
                        render: (v: boolean) => (
                          <Tag color={v ? 'green' : 'red'}>
                            {v ? '是' : '否'}
                          </Tag>
                        ),
                      },
                      {
                        title: '建议',
                        dataIndex: 'suggestion',
                        key: 'suggestion',
                        render: (v: string) => v || '-',
                      },
                    ]}
                    pagination={false}
                  />
                </Panel>
              </Collapse>
            )}
          </Space>
        ) : (
          <Empty description="等待验证" />
        )}
      </Modal>

      {/* Import Modal */}
      <Modal
        title="导入模板"
        open={importModalVisible}
        onOk={handleImport}
        onCancel={() => {
          setImportModalVisible(false);
          setImportJson('');
        }}
        confirmLoading={importMutation.isLoading}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            message="请粘贴导出的JSON模板数据"
            showIcon
          />
          <TextArea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder="粘贴JSON..."
            rows={10}
          />
        </Space>
      </Modal>
    </div>
  );
};

export default ExecutionFlowTemplatePage;