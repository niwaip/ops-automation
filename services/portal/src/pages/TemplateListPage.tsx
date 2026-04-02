import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Card, Button, Input, Space, Tag, Select, Typography, Modal, message } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  EyeOutlined,
  DeleteOutlined,
  CloudUploadOutlined,
  CloudDownloadOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { templateApi, Template, TemplateStatus } from '../api/template';
import { useAuthStore } from '../store/authStore';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const { Option } = Select;

const TemplateListPage: React.FC = () => {
  const { t } = useTranslation(['common', 'template']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | undefined>();
  const [searchText, setSearchText] = useState('');

  const templatesQuery = useQuery(
    ['templates', { page, pageSize, status: statusFilter, search: searchText }],
    () => templateApi.list({ page, pageSize, status: statusFilter, search: searchText })
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

  const submitForReviewMutation = useMutation(templateApi.submitForReview, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['templates']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

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

  const handleSubmitForReview = (id: string) => {
    Modal.confirm({
      title: t('template:submitForReview'),
      onOk: () => submitForReviewMutation.mutate(id),
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

  const columns: ColumnsType<Template> = [
    {
      title: t('template:templateName'),
      dataIndex: 'name',
      key: 'name',
      sorter: true,
    },
    {
      title: t('template:templateVersion'),
      dataIndex: 'version',
      key: 'version',
      width: 100,
    },
    {
      title: t('template:templateStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (status: TemplateStatus) => {
        const colorMap: Record<TemplateStatus, string> = {
          DRAFT: 'default',
          REVIEW: 'processing',
          PUBLISHED: 'success',
          DEPRECATED: 'warning',
          REVOKED: 'error',
        };
        return (
          <Tag color={colorMap[status]}>
            {t(`template:status${status}`)}
          </Tag>
        );
      },
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
      dataIndex: 'created_by',
      key: 'created_by',
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
      width: 250,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/templates/${record.id}`)}
          >
            {t('common:edit')}
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
          {record.status === 'DRAFT' && (
            <Button
              type="link"
              size="small"
              icon={<CloudUploadOutlined />}
              onClick={() => handleSubmitForReview(record.id)}
            >
              {t('template:submitForReview')}
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
          {record.status === 'DRAFT' && (
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record.id)}
            >
              {t('common:delete')}
            </Button>
          )}
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
    </div>
  );
};

export default TemplateListPage;