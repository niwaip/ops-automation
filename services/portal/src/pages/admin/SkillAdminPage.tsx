import React, { useState, useMemo } from 'react';
import { Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select, Descriptions, Tabs, Tooltip, Collapse, Steps, Divider, Badge, Empty } from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  KeyOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  RocketOutlined,
  FileTextOutlined,
  OrderedListOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { skillApi, roleApi, SkillConfigDTO, SkillPermissionDTO, RoleDTO, CreateSkillDTO, SkillValidationResult } from '../../api/skill';
import { carboneApi, CarboneTemplateDTO } from '../../api/carbone';
import { executionFlowApi, ExecutionFlowTemplateDTO, EXECUTION_FLOW_CATEGORIES } from '../../api/execution-flow';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;
const { Panel } = Collapse;

// Default categories (will be merged with flow template categories)
const DEFAULT_CATEGORIES: Record<string, { label: string; color: string; desc: string }> = {
  template: { label: '文档模板', color: 'blue', desc: '基于模板生成文档（Word/PDF等）' },
  analysis: { label: '数据分析', color: 'green', desc: '数据统计、报表分析' },
  automation: { label: '自动化', color: 'purple', desc: '自动化流程执行' },
  query: { label: '查询', color: 'cyan', desc: '数据查询、信息检索' },
  notification: { label: '通知', color: 'orange', desc: '消息通知、邮件发送' },
};

// Available execution flow steps
const EXECUTION_FLOW_STEPS: Record<string, { label: string; description: string }> = {
  skill_match: { label: 'AI语义匹配', description: '根据用户输入自动识别意图并匹配最佳技能' },
  collect_params: { label: '收集参数', description: '通过对话收集用户需要的参数' },
  generate_parameters: { label: 'AI生成参数', description: 'AI从用户描述自动提取参数' },
  confirm: { label: '用户确认', description: '展示参数并等待用户确认' },
  document_render: { label: '文档渲染', description: '使用Carbone引擎渲染Word/PDF文档' },
  render: { label: '渲染输出', description: '渲染最终输出内容' },
  send_email: { label: '发送邮件', description: '发送邮件通知' },
  save_database: { label: '保存数据', description: '保存数据到数据库' },
};

const SkillAdminPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [validationModalVisible, setValidationModalVisible] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillConfigDTO | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillConfigDTO | null>(null);
  const [validationResult, setValidationResult] = useState<SkillValidationResult | null>(null);
  const [form] = Form.useForm();

  // Queries
  const skillsQuery = useQuery(['skills'], skillApi.list);
  const rolesQuery = useQuery(['roles'], roleApi.list);
  const templatesQuery = useQuery(['carbone-templates'], carboneApi.list);
  const executionFlowTemplatesQuery = useQuery(['execution-flow-templates'], () => executionFlowApi.list({ isActive: true }));
  const flowCategoriesQuery = useQuery(['execution-flow-categories'], executionFlowApi.getCategories);

  // Merge flow template categories with default categories (flow template categories as source)
  const mergedCategories = useMemo(() => {
    const categories = { ...DEFAULT_CATEGORIES };
    // Add flow template categories as primary options
    if (flowCategoriesQuery.data?.categories) {
      flowCategoriesQuery.data.categories.forEach(cat => {
        // Use flow template category as Skills category option
        categories[cat.key] = {
          label: cat.label,
          color: cat.color,
          desc: EXECUTION_FLOW_CATEGORIES[cat.key]?.desc || cat.label,
        };
      });
    }
    return categories;
  }, [flowCategoriesQuery.data]);

  const permissionsQuery = useQuery(
    ['skill-permissions', selectedSkill?.id],
    () => skillApi.getPermissions(selectedSkill!.id),
    { enabled: !!selectedSkill }
  );

  // Mutations
  const createMutation = useMutation(skillApi.create, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['skills']);
      setEditModalVisible(false);
      form.resetFields();
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CreateSkillDTO> }) => skillApi.update(id, data),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['skills']);
        setEditModalVisible(false);
        setEditingSkill(null);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const deleteMutation = useMutation(skillApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['skills']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const grantMutation = useMutation(
    ({ skillId, roleId }: { skillId: string; roleId: string }) => skillApi.grant(skillId, roleId),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['skill-permissions', selectedSkill?.id]);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const revokeMutation = useMutation(
    ({ skillId, roleId }: { skillId: string; roleId: string }) => skillApi.revoke(skillId, roleId),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['skill-permissions', selectedSkill?.id]);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const validateMutation = useMutation(
    (skillId: string) => skillApi.validate(skillId),
    {
      onSuccess: (data) => {
        setValidationResult(data.validation);
        setValidationModalVisible(true);
        message.success('验证完成');
      },
      onError: () => {
        message.error('验证失败');
      },
    }
  );

  // Handlers
  const handleCreate = () => {
    setEditingSkill(null);
    form.resetFields();
    form.setFieldsValue({
      category: 'template',
      triggerKeywords: [],
      executionFlow: ['skill_match', 'generate_parameters', 'document_render'],
      tools: [],
    });
    setEditModalVisible(true);
  };

  const handleEdit = (skill: SkillConfigDTO) => {
    setEditingSkill(skill);
    form.setFieldsValue({
      name: skill.name,
      description: skill.description,
      category: skill.category,
      triggerKeywords: skill.triggerKeywords,
      executionFlow: skill.executionFlow || [],
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateId: skill.executionFlowTemplateId,
    });
    setEditModalVisible(true);
  };

  const handleViewDetail = (skill: SkillConfigDTO) => {
    setSelectedSkill(skill);
    setDetailModalVisible(true);
  };

  const handleSave = () => {
    form.validateFields().then((values) => {
      const data: CreateSkillDTO = {
        name: values.name,
        description: values.description,
        category: values.category || 'template',
        triggerKeywords: values.triggerKeywords || [],
        executionFlow: values.executionFlow || [],
        paramsSchema: {
          properties: {},
          required: [],
        },
        templateId: values.templateId,
        carboneTemplateId: values.carboneTemplateId,
        carboneSkillId: values.carboneSkillId,
        executionFlowTemplateId: values.executionFlowTemplateId,
      };

      if (editingSkill) {
        updateMutation.mutate({ id: editingSkill.id, data });
      } else {
        createMutation.mutate(data);
      }
    });
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const handleManagePermissions = (skill: SkillConfigDTO) => {
    setSelectedSkill(skill);
    setPermissionModalVisible(true);
  };

  const handleGrantRole = (roleId: string) => {
    if (selectedSkill) {
      grantMutation.mutate({ skillId: selectedSkill.id, roleId });
    }
  };

  const handleRevokeRole = (roleId: string) => {
    if (selectedSkill) {
      revokeMutation.mutate({ skillId: selectedSkill.id, roleId });
    }
  };

  const handleValidate = (skill: SkillConfigDTO) => {
    setSelectedSkill(skill);
    setValidationResult(null);
    validateMutation.mutate(skill.id);
  };

  // Filter skills by search text
  const filteredSkills = skillsQuery.data?.skills?.filter(
    (skill) =>
      skill.name.toLowerCase().includes(searchText.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchText.toLowerCase()) ||
      skill.category.toLowerCase().includes(searchText.toLowerCase())
  );

  // Render execution flow steps
  const renderExecutionFlow = (flow: string[]) => {
    if (!flow || flow.length === 0) return <Text type="secondary">未配置</Text>;

    const stepLabels: Record<string, string> = {
      skill_match: 'AI语义匹配',
      collect_params: '收集参数',
      generate_parameters: 'AI生成参数',
      confirm: '用户确认',
      document_render: '文档渲染',
      render: '渲染文档',
    };

    return (
      <Steps
        size="small"
        current={-1}
        items={flow.map((step, idx) => ({
          title: stepLabels[step] || step,
          status: 'wait',
          icon: idx === 0 ? <ThunderboltOutlined /> :
                step.includes('generate') || step.includes('ai') ? <RocketOutlined /> :
                step.includes('render') ? <ApiOutlined /> : undefined,
        }))}
      />
    );
  };

  // Render API endpoints
  const renderApiEndpoints = (endpoints: SkillConfigDTO['apiEndpoints']) => {
    if (!endpoints) return <Text type="secondary">未配置</Text>;

    return (
      <Space direction="vertical" size="small">
        {endpoints.generateParameters && (
          <Tag color="green" icon={<RocketOutlined />}>
            AI生成参数: {endpoints.generateParameters.url}
          </Tag>
        )}
        {endpoints.render && (
          <Tag color="blue" icon={<ApiOutlined />}>
            文档渲染: {endpoints.render.url}
          </Tag>
        )}
        {endpoints.getSkill && (
          <Tag color="purple" icon={<InfoCircleOutlined />}>
            获取技能: {endpoints.getSkill.url}
          </Tag>
        )}
      </Space>
    );
  };

  // Columns
  const columns: ColumnsType<SkillConfigDTO> = [
    {
      title: t('admin:skillName'),
      dataIndex: 'name',
      key: 'name',
      width: 150,
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: t('admin:skillCategory'),
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category: string) => {
        const info = mergedCategories[category] || { label: category, color: 'default', desc: '自定义分类' };
        return (
          <Tooltip title={info.desc}>
            <Tag color={info.color}>{info.label}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: t('admin:skillDescription'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '模板配置',
      key: 'templateConfig',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size="small">
          {record.carboneTemplateId && (
            <Tooltip title="Carbone模板ID">
              <Tag color="processing">模板: {record.carboneTemplateId.slice(0, 8)}...</Tag>
            </Tooltip>
          )}
          {record.carboneSkillId && (
            <Tooltip title="Carbone技能ID">
              <Tag color="cyan">Skill: {record.carboneSkillId.slice(0, 8)}...</Tag>
            </Tooltip>
          )}
          {!record.carboneTemplateId && !record.carboneSkillId && (
            <Text type="secondary">无模板</Text>
          )}
        </Space>
      ),
    },
    {
      title: '执行流程',
      key: 'executionFlow',
      width: 200,
      render: (_, record) => {
        if (!record.executionFlow || record.executionFlow.length === 0) {
          return <Text type="secondary">默认流程</Text>;
        }
        return (
          <Tooltip title={`步骤: ${record.executionFlow.join(' → ')}`}>
            <Space>
              {record.executionFlow.map((step, idx) => (
                <Tag key={idx} color={idx === 0 ? 'gold' : 'default'}>
                  {step}
                </Tag>
              ))}
            </Space>
          </Tooltip>
        );
      },
    },
    {
      title: t('admin:triggerKeywords'),
      dataIndex: 'triggerKeywords',
      key: 'triggerKeywords',
      width: 150,
      render: (keywords: string[]) => (
        <Tooltip title="AI匹配失败时的回退方案">
          <Space size="small" wrap>
            {keywords?.slice(0, 3).map((kw) => (
              <Tag key={kw} color="orange">{kw}</Tag>
            ))}
            {keywords?.length > 3 && <Tag>+{keywords.length - 3}</Tag>}
          </Space>
        </Tooltip>
      ),
    },
    {
      title: t('admin:skillStatus'),
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'error'}>
          {isActive ? '启用' : '禁用'}
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
            icon={<InfoCircleOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CheckCircleOutlined />}
            onClick={() => handleValidate(record)}
            loading={validateMutation.isLoading && selectedSkill?.id === record.id}
          >
            验证
          </Button>
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
            icon={<KeyOutlined />}
            onClick={() => handleManagePermissions(record)}
          >
            权限
          </Button>
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

  // Permission columns
  const permissionColumns: ColumnsType<SkillPermissionDTO> = [
    {
      title: t('admin:roleName'),
      dataIndex: 'roleName',
      key: 'roleName',
    },
    {
      title: t('admin:grantedAt'),
      dataIndex: 'grantedAt',
      key: 'grantedAt',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          danger
          onClick={() => handleRevokeRole(record.roleId)}
        >
          {t('admin:revoke')}
        </Button>
      ),
    },
  ];

  // Available roles not yet granted
  const grantedRoleIds = permissionsQuery.data?.permissions?.map((p) => p.roleId) || [];
  const availableRoles = rolesQuery.data?.roles?.filter(
    (r) => !grantedRoleIds.includes(r.id)
  );

  // Available templates for selection
  const templateOptions = templatesQuery.data?.templates?.map((t: CarboneTemplateDTO) => ({
    value: t.id,
    label: `${t.name} (${t.id.slice(0, 8)}...)`,
  }));

  return (
    <div>
      <Title level={4}>{t('admin:skillManagement')}</Title>

      <Card style={{ marginTop: 8, marginBottom: 16 }}>
        <Space direction="vertical" size="small">
          <Text strong>Skills管理说明：</Text>
          <Text>• Skills定义了系统能执行的操作，包括文档生成、数据分析、自动化流程等</Text>
          <Text>• 每个Skill可配置<strong>模板</strong>、<strong>触发关键字</strong>、<strong>权限</strong>等属性</Text>
          <Divider style={{ margin: '8px 0' }} />
          <Text strong>匹配机制：</Text>
          <Text>• <Badge status="success">AI语义匹配</Badge> - 主要方式，自动识别用户意图</Text>
          <Text>• <Badge status="warning">触发关键字</Badge> - 回退方案。AI服务不可用时使用</Text>
          <Divider style={{ margin: '8px 0' }} />
          <Text strong>模板配置：</Text>
          <Text>• 配置<strong>Carbone模板ID</strong>后，可调用AI生成参数并渲染文档</Text>
          <Text>• 可在下方表格中查看已有的Carbone模板，或前往<Text type="link">模板管理</Text>页面创建新模板</Text>
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
            <Button
              icon={<FileTextOutlined />}
              onClick={() => window.location.href = '/carbone-templates'}
            >
              模板管理
            </Button>
            <Button
              icon={<OrderedListOutlined />}
              onClick={() => window.location.href = '/admin/execution-flows'}
            >
              流程模板
            </Button>
          </Space>
          <Space>
            <Button
              icon={<PlusOutlined />}
              type="primary"
              onClick={handleCreate}
            >
              {t('common:create')}
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => skillsQuery.refetch()}
            >
              {t('common:refresh')}
            </Button>
          </Space>
        </Space>

        <Table
          columns={columns}
          dataSource={filteredSkills || []}
          rowKey="id"
          loading={skillsQuery.isLoading}
          scroll={{ x: 1200 }}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => t('common:pagination.total', { total }),
          }}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title={`技能详情 - ${selectedSkill?.name}`}
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false);
          setSelectedSkill(null);
        }}
        footer={null}
        width={800}
      >
        {selectedSkill && (
          <Collapse defaultActiveKey={['basic', 'flow', 'api']}>
            <Panel header="基本信息" key="basic">
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="技能ID">{selectedSkill.id}</Descriptions.Item>
                <Descriptions.Item label="分类">
                  <Tag color={mergedCategories[selectedSkill.category]?.color || 'default'}>
                    {mergedCategories[selectedSkill.category]?.label || selectedSkill.category}
                  </Tag>
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    {mergedCategories[selectedSkill.category]?.desc || '自定义分类'}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>{selectedSkill.description}</Descriptions.Item>
                <Descriptions.Item label="触发关键字" span={2}>
                  <Space wrap>
                    {selectedSkill.triggerKeywords?.map((kw) => (
                      <Tag key={kw} color="orange">{kw}</Tag>
                    ))}
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      (AI匹配失败时的回退方案)
                    </Text>
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            </Panel>

            <Panel header="模板配置" key="template">
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Carbone模板ID">
                  {selectedSkill.carboneTemplateId || <Text type="secondary">未配置</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="Carbone技能ID">
                  {selectedSkill.carboneSkillId || <Text type="secondary">未配置</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="内部模板ID">
                  {selectedSkill.templateId || <Text type="secondary">未配置</Text>}
                </Descriptions.Item>
              </Descriptions>
            </Panel>

            <Panel header="执行流程" key="flow">
              <div style={{ padding: 16 }}>
                {renderExecutionFlow(selectedSkill.executionFlow)}
              </div>
            </Panel>

            <Panel header="API端点" key="api">
              <div style={{ padding: 16 }}>
                {renderApiEndpoints(selectedSkill.apiEndpoints)}
              </div>
            </Panel>

            <Panel header="参数Schema" key="params">
              <div style={{ padding: 16 }}>
                {selectedSkill.paramsSchema?.required?.length > 0 ? (
                  <Space direction="vertical" size="small">
                    <Text strong>必填参数：</Text>
                    {selectedSkill.paramsSchema.required.map((param) => (
                      <Tag key={param} color="red">{param}</Tag>
                    ))}
                    <Divider style={{ margin: '8px 0' }} />
                    <Text strong>所有参数：</Text>
                    {Object.entries(selectedSkill.paramsSchema.properties || {}).map(([key, value]) => (
                      <Descriptions key={key} size="small" bordered column={1}>
                        <Descriptions.Item label={key}>
                          <Space>
                            <Tag color={value.required ? 'red' : 'default'}>
                              {value.required ? '必填' : '可选'}
                            </Tag>
                            <Text>{value.description}</Text>
                            {value.default && <Text type="secondary">默认: {String(value.default)}</Text>}
                          </Space>
                        </Descriptions.Item>
                      </Descriptions>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary">未配置参数Schema</Text>
                )}
              </div>
            </Panel>
          </Collapse>
        )}
      </Modal>

      {/* Edit/Create Modal */}
      <Modal
        title={editingSkill ? t('admin:editSkill') : t('admin:createSkill')}
        open={editModalVisible}
        onOk={handleSave}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingSkill(null);
        }}
        confirmLoading={createMutation.isLoading || updateMutation.isLoading}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('admin:skillName')}
            rules={[{ required: true, message: '请输入技能名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('admin:skillDescription')}
            rules={[{ required: true, message: '请输入描述' }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item
            name="category"
            label={t('admin:skillCategory')}
            extra="选择或输入自定义分类名称"
          >
            <Select mode="tags" placeholder="选择或输入分类">
              {Object.entries(mergedCategories).map(([key, value]) => (
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
            name="executionFlowTemplateId"
            label="流程模板"
            extra="选择预设流程模板，自动填充执行步骤"
          >
            <Select
              placeholder="选择流程模板"
              allowClear
              showSearch
              loading={executionFlowTemplatesQuery.isLoading}
              onChange={(value) => {
                if (value) {
                  const template = executionFlowTemplatesQuery.data?.templates?.find(t => t.id === value);
                  if (template && template.executionFlowKeys) {
                    form.setFieldsValue({ executionFlow: template.executionFlowKeys });
                    message.success(`已应用模板 "${template.name}" 的执行步骤`);
                  }
                }
              }}
            >
              {executionFlowTemplatesQuery.data?.templates?.map((template) => (
                <Option key={template.id} value={template.id}>
                  <Space>
                    <OrderedListOutlined />
                    <Text>{template.name}</Text>
                    <Badge count={template.steps?.length || 0} showZero style={{ marginLeft: 8 }} />
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="executionFlow"
            label="执行流程"
            extra="选择执行步骤顺序（从上到下执行），或先选择流程模板自动填充"
          >
            <Select
              mode="multiple"
              placeholder="选择执行步骤"
              optionLabelProp="label"
            >
              {Object.entries(EXECUTION_FLOW_STEPS).map(([key, value]) => (
                <Option key={key} value={key} label={value.label}>
                  <Space direction="vertical" size="small">
                    <Text strong>{value.label}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{value.description}</Text>
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="triggerKeywords"
            label={t('admin:triggerKeywords')}
            extra="AI语义匹配失败时的回退方案，输入关键词后按回车添加"
          >
            <Select mode="tags" placeholder="输入关键词">
            </Select>
          </Form.Item>
          <Form.Item
            name="carboneTemplateId"
            label={t('admin:carboneTemplateId')}
            extra="选择已有的Carbone模板.用于文档渲染"
          >
            <Select
              placeholder="选择模板"
              allowClear
              showSearch
              loading={templatesQuery.isLoading}
              options={templateOptions}
            />
          </Form.Item>
          <Form.Item
            name="carboneSkillId"
            label={t('admin:carboneSkillId')}
            extra="Carbone引擎的技能配置ID.用于AI参数生成"
          >
            <Input placeholder="UUID格式（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Permission Modal */}
      <Modal
        title={`${t('admin:permissionManagement')} - ${selectedSkill?.name}`}
        open={permissionModalVisible}
        onCancel={() => {
          setPermissionModalVisible(false);
          setSelectedSkill(null);
        }}
        footer={null}
        width={700}
      >
        <Tabs defaultActiveKey="granted">
          <TabPane tab={t('admin:grantedRoles')} key="granted">
            <Table
              columns={permissionColumns}
              dataSource={permissionsQuery.data?.permissions || []}
              rowKey="roleId"
              loading={permissionsQuery.isLoading}
              pagination={false}
            />
          </TabPane>
          <TabPane tab={t('admin:availableRoles')} key="available">
            <Space direction="vertical" style={{ width: '100%' }}>
              {availableRoles?.map((role) => (
                <Card
                  key={role.id}
                  size="small"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span>{role.name}</span>
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => handleGrantRole(role.id)}
                    loading={grantMutation.isLoading}
                  >
                    {t('admin:grant')}
                  </Button>
                </Card>
              ))}
              {availableRoles?.length === 0 && (
                <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>
                  {t('admin:noAvailableRoles')}
                </div>
              )}
            </Space>
          </TabPane>
        </Tabs>
      </Modal>

      {/* Validation Modal */}
      <Modal
        title={`验证结果 - ${selectedSkill?.name}`}
        open={validationModalVisible}
        onCancel={() => {
          setValidationModalVisible(false);
          setValidationResult(null);
          setSelectedSkill(null);
        }}
        footer={<Button onClick={() => setValidationModalVisible(false)}>关闭</Button>}
        width={700}
      >
        {validationResult && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Overall Result */}
            <Card>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  {validationResult.isValid ? (
                    <CheckCircleOutlined style={{ fontSize: 32, color: '#52c41a' }} />
                  ) : (
                    <ExclamationCircleOutlined style={{ fontSize: 32, color: '#ff4d4f' }} />
                  )}
                  <Text strong style={{ fontSize: 18 }}>
                    {validationResult.isValid ? '验证通过' : '验证失败'}
                  </Text>
                </Space>
                <Tag color={validationResult.isValid ? 'success' : 'error'}>
                  得分: {validationResult.score}/100
                </Tag>
              </Space>
            </Card>

            {/* Config Analysis */}
            {validationResult.details?.configAnalysis && (
              <Card title="配置分析" size="small">
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="触发关键词">
                    <Tag color={validationResult.details.configAnalysis.hasTriggerKeywords ? 'success' : 'error'}>
                      {validationResult.details.configAnalysis.hasTriggerKeywords ? '已配置' : '缺失'}
                    </Tag>
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      质量: {validationResult.details.configAnalysis.triggerKeywordQuality}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="参数Schema">
                    <Tag color={validationResult.details.configAnalysis.hasParamsSchema ? 'success' : 'error'}>
                      {validationResult.details.configAnalysis.hasParamsSchema ? '已配置' : '缺失'}
                    </Tag>
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      完整度: {validationResult.details.configAnalysis.paramsSchemaCompleteness}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="文档模板">
                    <Tag color={validationResult.details.configAnalysis.hasTemplate ? 'success' : 'warning'}>
                      {validationResult.details.configAnalysis.hasTemplate ? '已配置' : '未配置'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="流程模板">
                    <Tag color={validationResult.details.configAnalysis.hasFlowTemplate ? 'success' : 'warning'}>
                      {validationResult.details.configAnalysis.hasFlowTemplate ? '已关联' : '未关联'}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            {/* Flow Analysis */}
            {validationResult.details?.flowAnalysis && (
              <Card title={`流程模板验证 (${validationResult.details.flowAnalysis.templateName})`} size="small">
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Descriptions size="small" column={3}>
                    <Descriptions.Item label="步骤数">
                      {validationResult.details.flowAnalysis.stepCount}
                    </Descriptions.Item>
                    <Descriptions.Item label="可执行步骤">
                      {validationResult.details.flowAnalysis.executableSteps}
                    </Descriptions.Item>
                    <Descriptions.Item label="验证得分">
                      <Tag color={validationResult.details.flowAnalysis.validationScore >= 80 ? 'success' :
                        validationResult.details.flowAnalysis.validationScore >= 60 ? 'warning' : 'error'}>
                        {validationResult.details.flowAnalysis.validationScore}%
                      </Tag>
                    </Descriptions.Item>
                  </Descriptions>

                  <Divider style={{ margin: '8px 0' }} />
                  <Text strong>执行模拟结果:</Text>
                  {validationResult.details.flowAnalysis.executionSimulations.map((sim) => (
                    <Card key={sim.stepId} size="small" style={{ marginBottom: 8 }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Space>
                          {sim.success ? (
                            <CheckCircleOutlined style={{ color: '#52c41a' }} />
                          ) : (
                            <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                          )}
                          <Text strong>{sim.stepName}</Text>
                          <Tag>{sim.type}</Tag>
                        </Space>
                        <Tag color={sim.success ? 'success' : 'error'}>
                          {sim.success ? '成功' : '失败'}
                        </Tag>
                      </Space>
                      {sim.output && (
                        <Text type="secondary" style={{ marginTop: 8, display: 'block' }}>
                          {sim.output}
                        </Text>
                      )}
                      {sim.error && (
                        <Text type="danger" style={{ marginTop: 8, display: 'block' }}>
                          错误: {sim.error}
                        </Text>
                      )}
                    </Card>
                  ))}
                </Space>
              </Card>
            )}

            {/* Warnings and Suggestions */}
            {validationResult.warnings.length > 0 && (
              <Card title="警告" size="small">
                <Space direction="vertical" size="small">
                  {validationResult.warnings.map((w, idx) => (
                    <Text key={idx} type="warning">
                      ⚠️ {w}
                    </Text>
                  ))}
                </Space>
              </Card>
            )}
            {validationResult.suggestions.length > 0 && (
              <Card title="建议" size="small">
                <Space direction="vertical" size="small">
                  {validationResult.suggestions.map((s, idx) => (
                    <Text key={idx} type="secondary">
                      💡 {s}
                    </Text>
                  ))}
                </Space>
              </Card>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default SkillAdminPage;