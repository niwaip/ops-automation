import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Card, Button, Input, Space, Tag, Select, Modal, message, Form } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  EyeOutlined,
  DeleteOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { sessionApi, Session } from '../api/session';
import { reportApi, ReportTemplate } from '../api/report';
import type { ColumnsType } from 'antd/es/table';

const { Option } = Select;

// Session state type matching backend
type SessionState = 'IDLE' | 'RUNNING' | 'HUMAN_CONTROL' | 'CLOSED' | 'ERROR';

const SessionListPage: React.FC = () => {
  const { t } = useTranslation(['common', 'session']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<SessionState | undefined>();
  const [searchText, setSearchText] = useState('');
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const sessionsQuery = useQuery(
    ['sessions', { page, pageSize, status: statusFilter, search: searchText }],
    () => sessionApi.list({ page, pageSize, status: statusFilter, search: searchText })
  );

  const templatesQuery = useQuery(
    ['reportTemplates'],
    () => reportApi.getTemplates(),
    { enabled: reportModalVisible }
  );

  const deleteMutation = useMutation(sessionApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['sessions']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const openReportModal = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setSelectedTemplateId(null);
    setReportModalVisible(true);
  };

  const handleGenerateReport = async () => {
    if (!selectedSessionId || !selectedTemplateId) {
      message.warning('Please select a template');
      return;
    }

    setGeneratingReport(true);
    try {
      const result = await reportApi.createReport({
        template_id: selectedTemplateId,
        session_id: selectedSessionId,
      });
      message.success('Report generation started');
      setReportModalVisible(false);
      // Navigate to report detail page
      navigate(`/reports/${result.report_id}`);
    } catch (error) {
      message.error('Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  };

  const getStateColor = (state: SessionState) => {
    const colorMap: Record<SessionState, string> = {
      IDLE: 'default',
      RUNNING: 'processing',
      HUMAN_CONTROL: 'warning',
      CLOSED: 'default',
      ERROR: 'error',
    };
    return colorMap[state] || 'default';
  };

  const columns: ColumnsType<Session> = [
    {
      title: t('session:sessionId'),
      dataIndex: 'id',
      key: 'id',
      width: 120,
      ellipsis: true,
      render: (id: string) => <span style={{ fontSize: 11 }}>{id.substring(0, 8)}...</span>,
    },
    {
      title: t('session:template'),
      dataIndex: 'template_id',
      key: 'template_id',
      width: 120,
      ellipsis: true,
      render: (templateId: string) => templateId ? <span style={{ fontSize: 11 }}>{templateId.substring(0, 8)}...</span> : '-',
    },
    {
      title: t('session:sessionStatus'),
      dataIndex: 'state',
      key: 'state',
      render: (state: SessionState) => (
        <Tag color={getStateColor(state)}>{state}</Tag>
      ),
    },
    {
      title: t('session:owner'),
      dataIndex: 'user_id',
      key: 'user_id',
      width: 120,
      ellipsis: true,
      render: (userId: string) => <span style={{ fontSize: 11 }}>{userId ? userId.substring(0, 8) + '...' : '-'}</span>,
    },
    {
      title: t('session:startTime'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (createdAt: number) => createdAt ? new Date(createdAt).toLocaleString() : '-',
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 300,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/sessions/${record.id}`)}
          >
            {t('session:viewSession')}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<FilePdfOutlined />}
            onClick={() => openReportModal(record.id)}
          >
            {t('session:generateReport', 'Generate Report')}
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

  const stateOptions: SessionState[] = ['IDLE', 'RUNNING', 'HUMAN_CONTROL', 'CLOSED', 'ERROR'];

  return (
    <div>
      <div className="page-title">{t('session:sessionList')}</div>

      <Card variant="borderless">
        <Space style={{ marginBottom: 20, width: '100%', justifyContent: 'space-between' }}>
          <Space size={12}>
            <Input
              placeholder={t('common:search')}
              prefix={<SearchOutlined style={{ color: 'var(--text-light)' }} />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 240 }}
              allowClear
            />
            <Select
              placeholder={t('template:filterByStatus')}
              style={{ width: 160 }}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              allowClear
            >
              {stateOptions.map((state) => (
                <Option key={state} value={state}>
                  {state}
                </Option>
              ))}
            </Select>
          </Space>
          <Space size={12}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => sessionsQuery.refetch()}
            >
              {t('common:refresh')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/sessions/new')}
            >
              {t('session:startSession')}
            </Button>
          </Space>
        </Space>

        <Table
          columns={columns}
          dataSource={sessionsQuery.data?.sessions || []}
          rowKey="id"
          loading={sessionsQuery.isLoading}
          pagination={{
            current: page,
            pageSize,
            total: sessionsQuery.data?.total || 0,
            showSizeChanger: true,
            showTotal: (total) => t('common:pagination.total', { total }),
            onChange: (newPage, newPageSize) => {
              setPage(newPage);
              setPageSize(newPageSize);
            },
          }}
        />
      </Card>

      {/* Generate Report Modal */}
      <Modal
        title={t('session:generateReport', 'Generate Report')}
        open={reportModalVisible}
        onCancel={() => setReportModalVisible(false)}
        onOk={handleGenerateReport}
        confirmLoading={generatingReport}
        okText={t('common:create')}
        cancelText={t('common:cancel')}
      >
        <Form layout="vertical">
          <Form.Item label={t('session:selectTemplate', 'Select Report Template')}>
            <Select
              placeholder={t('session:selectTemplatePlaceholder', 'Choose a report template')}
              value={selectedTemplateId}
              onChange={(value) => setSelectedTemplateId(value)}
              loading={templatesQuery.isLoading}
              style={{ width: '100%' }}
            >
              {templatesQuery.data?.templates?.map((template: ReportTemplate) => (
                <Option key={template.id} value={template.id}>
                  <Space>
                    <Tag color={template.format === 'word' ? 'blue' : template.format === 'pdf' ? 'red' : 'green'}>
                      {template.format.toUpperCase()}
                    </Tag>
                    {template.name}
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          {templatesQuery.data?.templates?.length === 0 && (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>
              <p>{t('session:noTemplates', 'No report templates available')}</p>
              <Button type="link" onClick={() => navigate('/report-templates/new')}>
                {t('session:createTemplate', 'Create a template')}
              </Button>
            </div>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default SessionListPage;
