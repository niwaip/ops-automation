import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Collapse,
  Descriptions,
  Drawer,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  BugOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { templateApi, type Template, type TemplateStatus } from '@/api/template';
import { sessionApi } from '@/api/session';
import { readTemplateWorkflowComposition } from '../lib/templateWorkflowComposition';

const { Option } = Select;
const { Text, Title } = Typography;

type TemplateRow = Template & {
  created_by_username?: string;
};

const TemplateListPage: React.FC = () => {
  const { t } = useTranslation(['common', 'template']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | undefined>();
  const [searchText, setSearchText] = useState('');
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRow | null>(null);
  const [openingHistoryTemplateId, setOpeningHistoryTemplateId] = useState<string | null>(null);

  const templatesQuery = useQuery(
    ['templates', { page, pageSize, status: statusFilter, search: searchText }],
    async () => {
      const result = await templateApi.list({
        page,
        pageSize,
        status: statusFilter,
        search: searchText,
      });
      const enrichedTemplates: TemplateRow[] = (result.templates || []).map((template) => ({
        ...template,
        // `created_by` in browser-template is a free-form provenance string, not a user FK.
        created_by_username: template.created_by?.trim() || '-',
      }));

      return {
        ...result,
        templates: enrichedTemplates,
      };
    }
  );

  const deleteMutation = useMutation(templateApi.delete, {
    onSuccess: () => {
      void message.success(t('common:success'));
      void queryClient.invalidateQueries(['templates']);
    },
    onError: () => {
      void message.error(t('common:error'));
    },
  });

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const handleOpenLatestSession = async (templateId: string) => {
    try {
      setOpeningHistoryTemplateId(templateId);
      const result = await sessionApi.list({ page: 1, pageSize: 500 });
      const sessions = (result.sessions || [])
        .filter((session) => session.template_id === templateId)
        .sort(
          (a, b) =>
            Number(b.last_activity || b.created_at || 0) -
            Number(a.last_activity || a.created_at || 0)
        );

      if (!sessions.length) {
        void message.info('该模板暂无会话历史');
        return;
      }

      navigate(`/sessions/${sessions[0].id}`);
    } catch {
      void message.error('获取最新会话失败');
    } finally {
      setOpeningHistoryTemplateId(null);
    }
  };

  const stepItems = useMemo(() => {
    const steps = selectedTemplate?.steps || [];
    const browserItems = steps.map((step, index) => ({
      key: `${step.step_id || index}`,
      label: (
        <Space>
          <Tag color="blue">浏览器</Tag>
          <Text>{`${index + 1}. ${step.action}`}</Text>
        </Space>
      ),
      children: (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {step.locator ? (
            <Text type="secondary">locator: {JSON.stringify(step.locator)}</Text>
          ) : null}
          {step.params ? <Text type="secondary">params: {JSON.stringify(step.params)}</Text> : null}
          {step.wait ? <Text type="secondary">wait: {JSON.stringify(step.wait)}</Text> : null}
          {step.retry ? <Text type="secondary">retry: {JSON.stringify(step.retry)}</Text> : null}
        </Space>
      ),
    }));
    const composition = readTemplateWorkflowComposition(selectedTemplate?.config || {});
    const processingItems = (composition?.postProcessingSteps || []).map((step, index) => ({
      key: `post:${step.id || index}`,
      label: (
        <Space>
          <Tag color={step.type === 'llm_operation' ? 'purple' : 'cyan'}>
            {step.type === 'llm_operation' ? 'LLM 后处理' : '工作流后处理'}
          </Tag>
          <Text>{`${browserItems.length + index + 1}. ${
            step.type === 'llm_operation'
              ? step.processingMode === 'summary'
                ? '内容总结'
                : step.operationId || step.id
              : step.skillId || step.id
          }`}</Text>
        </Space>
      ),
      children: (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Text type="secondary">步骤 ID: {step.id}</Text>
          {step.sourceStepId ? (
            <Text type="secondary">来源浏览器步骤: {step.sourceStepId}</Text>
          ) : null}
          <Text type="secondary">
            执行位置: {step.type === 'llm_operation' ? '控制面 LLM Operation' : '控制面工作流'}
          </Text>
        </Space>
      ),
    }));
    return [...browserItems, ...processingItems];
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
      title: '流程节点',
      key: 'logicalStepCount',
      width: 92,
      render: (_, record) => {
        const processingCount =
          readTemplateWorkflowComposition(record.config || {})?.postProcessingSteps?.length || 0;
        return (
          <Space size={4}>
            <Tag color="blue">{record.steps?.length || 0}</Tag>
            {processingCount > 0 ? <Tag color="purple">+{processingCount}</Tag> : null}
          </Space>
        );
      },
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
      width: 420,
      render: (_, record) => (
        <Space wrap onClick={(event) => event.stopPropagation()}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/templates/${record.id}`)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<BugOutlined />}
            onClick={() => navigate(`/templates/${record.id}?test=true`)}
          >
            测试
          </Button>
          <Button
            type="link"
            size="small"
            icon={<ClockCircleOutlined />}
            loading={openingHistoryTemplateId === record.id}
            onClick={() => {
              void handleOpenLatestSession(record.id);
            }}
          >
            最新会话
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            删除
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
              onChange={(event) => setSearchText(event.target.value)}
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
              onClick={() => {
                void templatesQuery.refetch();
              }}
            >
              {t('common:refresh')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/recorder')}>
              {t('template:createTemplate')}
            </Button>
          </Space>
        </Space>

        <Table
          columns={columns}
          dataSource={templatesQuery.data?.templates || []}
          rowKey="id"
          loading={templatesQuery.isLoading}
          onRow={(record) => ({
            onClick: () => {
              setSelectedTemplate(record);
              setDetailDrawerVisible(true);
            },
            style: { cursor: 'pointer' },
          })}
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
              <Descriptions.Item label="描述">
                {selectedTemplate.description || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="模版编辑状态">
                <Space>
                  <Tag color={selectedTemplate.status === 'DRAFT' ? 'gold' : 'green'}>
                    {selectedTemplate.status}
                  </Tag>
                  {selectedTemplate.status === 'DRAFT' ? (
                    <Text type="secondary">当前可编辑版本；不等同于能力 Release 发布状态</Text>
                  ) : null}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="创建者">
                {selectedTemplate.created_by_username || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {selectedTemplate.created_at
                  ? new Date(selectedTemplate.created_at).toLocaleString()
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {selectedTemplate.updated_at
                  ? new Date(selectedTemplate.updated_at).toLocaleString()
                  : '-'}
              </Descriptions.Item>
            </Descriptions>
            <Card title={`流程节点（${stepItems.length}）`} size="small">
              {stepItems.length > 0 ? (
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
