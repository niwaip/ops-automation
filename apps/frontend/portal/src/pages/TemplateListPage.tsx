import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Card, Button, Input, Space, Select, Typography, Modal, message, Drawer, Descriptions, Collapse } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  EyeOutlined,
  DeleteOutlined,
  CloudUploadOutlined,
  CloudDownloadOutlined,
  PlayCircleOutlined,
  BugOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { templateApi, Template, TemplateStatus } from '../api/template';
import { userApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const { Option } = Select;
const { Text } = Typography;

type TemplateRow = Template & {
  created_by_username?: string;
};

const TemplateListPage: React.FC = () => {
  const { t } = useTranslation(['common', 'template']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | undefined>();
  const [searchText, setSearchText] = useState('');
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRow | null>(null);

  const templatesQuery = useQuery(
    ['templates', { page, pageSize, status: statusFilter, search: searchText }],
    async () => {
      const result = await templateApi.list({ page, pageSize, status: statusFilter, search: searchText });
      const templates = result.templates || [];
      const creatorIds = Array.from(
        new Set(templates.map((template) => template.created_by).filter(Boolean)),
      );

      const userNamePairs = await Promise.all(
        creatorIds.map(async (userId) => {
          try {
            const user = await userApi.getById(userId);
            return [userId, user.username] as const;
          } catch {
            return [userId, userId] as const;
          }
        }),
      );
      const userNameMap = new Map<string, string>(userNamePairs);
      const enrichedTemplates: TemplateRow[] = templates.map((template) => ({
        ...template,
        created_by_username: userNameMap.get(template.created_by) || template.created_by,
      }));

      return {
        ...result,
        templates: enrichedTemplates,
      };
    }
  );

  const publishMutation = useMutation(
    (id: string) => templateApi.publish(id, user?.id || ''),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['templates']);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const deprecateMutation = useMutation(templateApi.deprecate, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['templates']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const deleteMutation = useMutation(templateApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['templates']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const handlePublish = (id: string) => {
    Modal.confirm({
      title: t('template:publishTemplate'),
      onOk: () => publishMutation.mutate(id),
    });
  };

  const handleDeprecate = (id: string) => {
    Modal.confirm({
      title: t('template:deprecateTemplate'),
      onOk: () => deprecateMutation.mutate(id),
    });
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const stepItems = useMemo(() => {
    const steps = selectedTemplate?.steps || [];
    return steps.map((step, index) => ({
      key: `${step.step_id || index}`,
      label: `${index + 1}. ${step.action}`,
      children: (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {step.locator ? <Text type="secondary">locator: {JSON.stringify(step.locator)}</Text> : null}
          {step.params ? <Text type="secondary">params: {JSON.stringify(step.params)}</Text> : null}
          {step.wait ? <Text type="secondary">wait: {JSON.stringify(step.wait)}</Text> : null}
          {step.retry ? <Text type="secondary">retry: {JSON.stringify(step.retry)}</Text> : null}
        </Space>
      ),
    }));
  }, [selectedTemplate]);

  const columns: ColumnsType<TemplateRow> = [
    {
      title: t('template:templateName'),
      dataIndex: 'name',
      key: 'name',
      sorter: true,
    },
    {
      title: t('common:description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc: string) => desc || '-',
    },
    {
      title: t('template:createdBy'),
      dataIndex: 'created_by_username',
      key: 'created_by_username',
      width: 100,
      ellipsis: true,
    },
    {
      title: t('common:createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 400,
      render: (_, record) => (
        <Space wrap>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedTemplate(record);
              setDetailDrawerVisible(true);
            }}
          >
            查看详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<BugOutlined />}
            onClick={() => navigate(`/templates/${record.id}?test=true`)}
          >
            {t('template:testTemplate')}
          </Button>
          {record.status === 'PUBLISHED' && (
            <Button
              type="link"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => navigate(`/templates/${record.id}?execute=true`)}
            >
              {t('template:executeTemplate')}
            </Button>
          )}
          {record.status === 'REVIEW' && user?.role === 'admin' && (
            <Button
              type="link"
              size="small"
              icon={<CloudUploadOutlined />}
              onClick={() => handlePublish(record.id)}
            >
              {t('template:publishTemplate')}
            </Button>
          )}
          {record.status === 'PUBLISHED' && user?.role === 'admin' && (
            <Button
              type="link"
              size="small"
              danger
              icon={<CloudDownloadOutlined />}
              onClick={() => handleDeprecate(record.id)}
            >
              {t('template:deprecateTemplate')}
            </Button>
          )}
          {/* Allow delete for all statuses */}
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

  const statusOptions: TemplateStatus[] = ['DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED', 'REVOKED'];

  return (
    <div>
      <Title level={4}>{t('template:templateList')}</Title>

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
            <Select
              placeholder={t('template:filterByStatus')}
              style={{ width: 150 }}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              allowClear
            >
              {statusOptions.map((status) => (
                <Option key={status} value={status}>
                  {t(`template:status${status}`)}
                </Option>
              ))}
            </Select>
          </Space>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => templatesQuery.refetch()}
            >
              {t('common:refresh')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/recorder')}
            >
              {t('template:createTemplate')}
            </Button>
          </Space>
        </Space>

        <Table
          columns={columns}
          dataSource={templatesQuery.data?.templates || []}
          rowKey="id"
          loading={templatesQuery.isLoading}
          pagination={{
            current: page,
            pageSize,
            total: templatesQuery.data?.total || 0,
            showSizeChanger: true,
            showTotal: (total) => t('common:pagination.total', { total }),
            onChange: (newPage, newPageSize) => {
              setPage(newPage);
              setPageSize(newPageSize);
            },
          }}
        />
      </Card>

      <Drawer
        title="模板详情"
        placement="right"
        width={720}
        open={detailDrawerVisible}
        onClose={() => setDetailDrawerVisible(false)}
      >
        {selectedTemplate ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="模板名称">{selectedTemplate.name}</Descriptions.Item>
              <Descriptions.Item label="描述">{selectedTemplate.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建者">{selectedTemplate.created_by_username || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {selectedTemplate.created_at ? new Date(selectedTemplate.created_at).toLocaleString() : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {selectedTemplate.updated_at ? new Date(selectedTemplate.updated_at).toLocaleString() : '-'}
              </Descriptions.Item>
            </Descriptions>
            <Card title="步骤详情" size="small">
              {(selectedTemplate.steps || []).length > 0 ? (
                <Collapse items={stepItems} defaultActiveKey={[]} />
              ) : (
                <Text type="secondary">暂无步骤</Text>
              )}
            </Card>
          </Space>
        ) : null}
      </Drawer>
    </div>
  );
};

export default TemplateListPage;
