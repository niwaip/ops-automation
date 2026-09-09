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
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  GlobalOutlined,
  HistoryOutlined,
  ReloadOutlined,
  RocketOutlined,
  SearchOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { templateApi, type Template, type TemplateStatus } from '@/api/template';
import { sessionApi } from '@/api/session';
import { readTemplateWorkflowComposition } from '../lib/templateWorkflowComposition';
import { TemplateOverviewCards } from '../components/TemplateOverviewCards';

const { Option } = Select;
const { Text, Title } = Typography;

type TemplateRow = Template & {
  created_by_username?: string;
};

const renderStatusTag = (status: string) => {
  switch (status) {
    case 'PUBLISHED':
      return <Tag color="success">已发布</Tag>;
    case 'DRAFT':
      return <Tag color="gold">草稿</Tag>;
    case 'REVIEW':
      return <Tag color="blue">待审核</Tag>;
    case 'DEPRECATED':
      return <Tag color="default">已废弃</Tag>;
    case 'REVOKED':
      return <Tag color="volcano">已撤销</Tag>;
    default:
      return <Tag>{status}</Tag>;
  }
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
      title: '确认删除执行模版？',
      content: '删除后该执行模版将无法恢复，关联的快捷执行入口将失效。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
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
        void message.info('该模版暂无执行会话历史');
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
          <Tag color="blue" icon={<GlobalOutlined />}>浏览器步骤</Tag>
          <Text strong>{`${index + 1}. ${step.action}`}</Text>
          {step.locator?.value ? (
            <Text type="secondary" style={{ fontSize: 12 }}>({step.locator.value})</Text>
          ) : step.description ? (
            <Text type="secondary" style={{ fontSize: 12 }}>({step.description})</Text>
          ) : null}
        </Space>
      ),
      children: (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {step.locator ? (
            <Text type="secondary">定位器 (locator): {JSON.stringify(step.locator)}</Text>
          ) : null}
          {step.params ? <Text type="secondary">执行参数 (params): {JSON.stringify(step.params)}</Text> : null}
          {step.wait ? <Text type="secondary">等待条件 (wait): {JSON.stringify(step.wait)}</Text> : null}
          {step.retry ? <Text type="secondary">重试机制 (retry): {JSON.stringify(step.retry)}</Text> : null}
        </Space>
      ),
    }));
    const composition = readTemplateWorkflowComposition(selectedTemplate?.config || {});
    const processingItems = (composition?.postProcessingSteps || []).map((step, index) => ({
      key: `post:${step.id || index}`,
      label: (
        <Space>
          <Tag color={step.type === 'llm_operation' ? 'purple' : 'cyan'} icon={<RocketOutlined />}>
            {step.type === 'llm_operation' ? 'LLM 后处理' : '工作流后处理'}
          </Tag>
          <Text strong>{`${browserItems.length + index + 1}. ${
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
            <Text type="secondary">关联浏览器步骤: {step.sourceStepId}</Text>
          ) : null}
          <Text type="secondary">
            执行运行时: {step.type === 'llm_operation' ? '控制面 LLM Operation' : '控制面工作流'}
          </Text>
        </Space>
      ),
    }));
    return [...browserItems, ...processingItems];
  }, [selectedTemplate]);

  const columns: ColumnsType<TemplateRow> = [
    {
      title: '模版名称',
      dataIndex: 'name',
      key: 'name',
      sorter: true,
      render: (name: string, record) => (
        <Space direction="vertical" size={2}>
          <Space size={6} align="center">
            <FileTextOutlined style={{ color: '#1677ff', fontSize: 15 }} />
            <Text
              strong
              style={{ fontSize: 14, color: 'var(--text-primary)' }}
            >
              {name}
            </Text>
            {renderStatusTag(record.status)}
          </Space>
          {record.description ? (
            <Text
              type="secondary"
              ellipsis={{ tooltip: record.description }}
              style={{ fontSize: 12, maxWidth: 360 }}
            >
              {record.description}
            </Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: '流程节点',
      key: 'logicalStepCount',
      width: 170,
      render: (_, record) => {
        const processingCount =
          readTemplateWorkflowComposition(record.config || {})?.postProcessingSteps?.length || 0;
        return (
          <Space size={6} wrap>
            <Tag color="blue" icon={<GlobalOutlined />}>
              {record.steps?.length || 0} 步骤
            </Tag>
            {processingCount > 0 ? (
              <Tag color="purple" icon={<RocketOutlined />}>
                +{processingCount} 后处理
              </Tag>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      render: (_: any, record) => {
        const dateStr = record.updated_at || record.created_at;
        return dateStr ? (
          <Space size={4} style={{ color: 'var(--text-secondary)' }}>
            <ClockCircleOutlined style={{ fontSize: 12 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {new Date(dateStr).toLocaleString()}
            </Text>
          </Space>
        ) : (
          '-'
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 320,
      render: (_, record) => (
        <Space wrap onClick={(event) => event.stopPropagation()}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/templates/${record.id}`)}
          >
            详细
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
            icon={<HistoryOutlined />}
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

  return (
    <div>
      {/* 顶部标题区 */}
      <div style={{ marginBottom: 16 }}>
        <Space align="center" style={{ marginBottom: 4 }}>
          <Title level={4} style={{ margin: 0 }}>
            执行模版
          </Title>
          <Tag color="blue">RPA / 浏览器自动化</Tag>
        </Space>
        <div>
          <Text type="secondary" style={{ fontSize: 13 }}>
            基于浏览器自动化录制与编排的执行模版库，支持步骤参数配置、动态变量插值、LLM 智能后处理与会话执行回放
          </Text>
        </div>
      </div>

      {/* 统计指标卡片 */}
      <TemplateOverviewCards
        templates={templatesQuery.data?.templates || []}
        total={templatesQuery.data?.total}
        selectedStatus={statusFilter}
        onFilterStatus={(status) => {
          setStatusFilter(status);
          setPage(1);
        }}
      />

      {/* 模版数据表格卡片 */}
      <Card style={{ borderRadius: 14, boxShadow: 'var(--shadow-sm)' }}>
        <Space
          style={{
            marginBottom: 16,
            width: '100%',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Space wrap size={10}>
            <Input
              placeholder="搜索模版名称或描述..."
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                setPage(1);
              }}
              style={{ width: 240, borderRadius: 8 }}
              allowClear
            />
            <Select
              placeholder="全部状态"
              style={{ width: 140 }}
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
              allowClear
            >
              <Option value="PUBLISHED"><Tag color="success">已发布</Tag></Option>
              <Option value="DRAFT"><Tag color="gold">草稿</Tag></Option>
              <Option value="REVIEW"><Tag color="blue">待审核</Tag></Option>
              <Option value="DEPRECATED"><Tag color="default">已废弃</Tag></Option>
              <Option value="REVOKED"><Tag color="volcano">已撤销</Tag></Option>
            </Select>
            {(searchText || statusFilter) && (
              <Button
                type="text"
                onClick={() => {
                  setSearchText('');
                  setStatusFilter(undefined);
                  setPage(1);
                }}
              >
                重置筛选
              </Button>
            )}
          </Space>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                void templatesQuery.refetch();
              }}
              loading={templatesQuery.isFetching}
              style={{ borderRadius: 8 }}
            >
              {t('common:refresh')}
            </Button>
            <Button
              type="primary"
              icon={<VideoCameraOutlined />}
              onClick={() => navigate('/recorder')}
              style={{ borderRadius: 8 }}
            >
              录制新建模版
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
            showTotal: (total) => `共 ${total} 个执行模版`,
            onChange: (newPage, newPageSize) => {
              setPage(newPage);
              setPageSize(newPageSize);
            },
          }}
        />
      </Card>

      {/* 详细抽屉 */}
      <Drawer
        title={
          <Space>
            <FileTextOutlined style={{ color: '#1677ff' }} />
            <span>执行模版详细 - {selectedTemplate?.name}</span>
          </Space>
        }
        extra={
          selectedTemplate ? (
            <Button
              type="primary"
              size="small"
              icon={<EditOutlined />}
              onClick={() => navigate(`/templates/${selectedTemplate.id}`)}
            >
              进入配置详情
            </Button>
          ) : null
        }
        placement="right"
        width={720}
        open={detailDrawerVisible}
        onClose={() => setDetailDrawerVisible(false)}
      >
        {selectedTemplate ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="模版名称">
                <Text strong>{selectedTemplate.name}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="模版描述">
                {selectedTemplate.description || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="运行状态">
                <Space>
                  {renderStatusTag(selectedTemplate.status)}
                  {selectedTemplate.status === 'DRAFT' ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      当前为草稿可编辑版本；不等同于能力 Release 发布状态
                    </Text>
                  ) : null}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="流程节点数">
                <Space size={6}>
                  <Tag color="blue" icon={<GlobalOutlined />}>
                    {selectedTemplate.steps?.length || 0} 个浏览器动作
                  </Tag>
                  {readTemplateWorkflowComposition(selectedTemplate.config || {})
                    ?.postProcessingSteps?.length ? (
                    <Tag color="purple" icon={<RocketOutlined />}>
                      {
                        readTemplateWorkflowComposition(selectedTemplate.config || {})
                          ?.postProcessingSteps?.length
                      }{' '}
                      个后处理步骤
                    </Tag>
                  ) : null}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="创建者">
                <Tag icon={<UserOutlined />}>{selectedTemplate.created_by_username || '-'}</Tag>
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

            <Card
              title={
                <Space>
                  <span>流程步骤清单</span>
                  <Tag color="blue">{stepItems.length}</Tag>
                </Space>
              }
              size="small"
              style={{ borderRadius: 10 }}
            >
              {stepItems.length > 0 ? (
                <Collapse items={stepItems} defaultActiveKey={[]} />
              ) : (
                <Text type="secondary">暂无配置步骤</Text>
              )}
            </Card>
          </Space>
        ) : null}
      </Drawer>
    </div>
  );
};

export default TemplateListPage;
