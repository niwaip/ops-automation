import React, { useState } from 'react';
import { Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select, Descriptions, Tabs, Transfer } from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { skillApi, roleApi, SkillConfigDTO, SkillPermissionDTO, RoleDTO, CreateSkillDTO } from '../../api/skill';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

const SkillAdminPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillConfigDTO | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillConfigDTO | null>(null);
  const [form] = Form.useForm();

  // Queries
  const skillsQuery = useQuery(['skills'], skillApi.list);
  const rolesQuery = useQuery(['roles'], roleApi.list);
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

  // Handlers
  const handleCreate = () => {
    setEditingSkill(null);
    form.resetFields();
    form.setFieldsValue({
      category: 'document',
      triggerKeywords: [],
      executionFlow: [],
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
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
    });
    setEditModalVisible(true);
  };

  const handleSave = () => {
    form.validateFields().then((values) => {
      const data: CreateSkillDTO = {
        name: values.name,
        description: values.description,
        category: values.category || 'document',
        triggerKeywords: values.triggerKeywords || [],
        paramsSchema: {
          properties: {},
          required: [],
        },
        templateId: values.templateId,
        carboneTemplateId: values.carboneTemplateId,
        carboneSkillId: values.carboneSkillId,
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

  // Filter skills by search text
  const filteredSkills = skillsQuery.data?.skills?.filter(
    (skill) =>
      skill.name.toLowerCase().includes(searchText.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchText.toLowerCase()) ||
      skill.category.toLowerCase().includes(searchText.toLowerCase())
  );

  // Columns
  const columns: ColumnsType<SkillConfigDTO> = [
    {
      title: t('admin:skillName'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: t('admin:skillCategory'),
      dataIndex: 'category',
      key: 'category',
      render: (category: string) => <Tag color="blue">{category}</Tag>,
    },
    {
      title: t('admin:skillDescription'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: t('admin:triggerKeywords'),
      dataIndex: 'triggerKeywords',
      key: 'triggerKeywords',
      render: (keywords: string[]) => (
        <Space size="small">
          {keywords?.slice(0, 3).map((kw) => (
            <Tag key={kw} color="orange">{kw}</Tag>
          ))}
          {keywords?.length > 3 && <Tag>+{keywords.length - 3}</Tag>}
        </Space>
      ),
    },
    {
      title: t('admin:skillStatus'),
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'error'}>
          {isActive ? t('admin:skillActive') : t('admin:skillInactive')}
        </Tag>
      ),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 200,
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
            icon={<KeyOutlined />}
            onClick={() => handleManagePermissions(record)}
          >
            {t('admin:permissions')}
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

  return (
    <div>
      <Title level={4}>{t('admin:skillManagement')}</Title>

      <Card style={{ marginTop: 16 }}>
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
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => t('common:pagination.total', { total }),
          }}
        />
      </Card>

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
            rules={[{ required: true, message: 'Please input skill name' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('admin:skillDescription')}
            rules={[{ required: true, message: 'Please input description' }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item
            name="category"
            label={t('admin:skillCategory')}
          >
            <Select>
              <Option value="document">{t('admin:categoryDocument')}</Option>
              <Option value="analysis">{t('admin:categoryAnalysis')}</Option>
              <Option value="automation">{t('admin:categoryAutomation')}</Option>
              <Option value="other">{t('admin:categoryOther')}</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="triggerKeywords"
            label={t('admin:triggerKeywords')}
          >
            <Select mode="tags" placeholder="Input keywords">
            </Select>
          </Form.Item>
          <Form.Item
            name="templateId"
            label={t('admin:templateId')}
          >
            <Input placeholder="Template ID (optional)" />
          </Form.Item>
          <Form.Item
            name="carboneTemplateId"
            label={t('admin:carboneTemplateId')}
          >
            <Input placeholder="Carbone Template ID" />
          </Form.Item>
          <Form.Item
            name="carboneSkillId"
            label={t('admin:carboneSkillId')}
          >
            <Input placeholder="Carbone Skill ID" />
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

        {selectedSkill && (
          <Descriptions title={t('admin:skillInfo')} bordered size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label={t('admin:skillId')}>{selectedSkill.id}</Descriptions.Item>
            <Descriptions.Item label={t('admin:carboneTemplateId')}>{selectedSkill.carboneTemplateId || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('admin:carboneSkillId')}>{selectedSkill.carboneSkillId || '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default SkillAdminPage;