import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Card, Button, Input, Space, Tag, Select, Modal, message, Form, Drawer, Descriptions, Timeline, Typography, Collapse } from 'antd';
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
import { sessionApi, Session, StepResult } from '../api/session';
import { reportApi, ReportTemplate } from '../api/report';
import { templateApi } from '../api/template';
import { userApi } from '../api/auth';
import type { ColumnsType } from 'antd/es/table';

const { Option } = Select;
const { Text } = Typography;

// Session state type matching backend
type SessionState = 'IDLE' | 'RUNNING' | 'HUMAN_CONTROL' | 'CLOSED' | 'ERROR';
type SessionRow = Session & {
  template_name?: string;
  username?: string;
};

const cleanInlineValue = (value?: string): string => (value || '').replace(/`/g, '').trim();

const parseCliHtmlSummary = (rawHtml?: string): {
  result?: unknown;
  code?: string;
  pageUrl?: string;
  pageTitle?: string;
  events: string[];
} => {
  if (!rawHtml) {
    return { events: [] };
  }

  const section = (title: string): string | undefined => {
    const regex = new RegExp(`### ${title}\\s*([\\s\\S]*?)(?=\\n### |$)`, 'i');
    const match = rawHtml.match(regex);
    return match?.[1]?.trim();
  };

  const parseMaybeJson = (value?: string): unknown => {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    try {
      const firstPass = JSON.parse(trimmed);
      if (typeof firstPass === 'string') {
        try {
          return JSON.parse(firstPass);
        } catch {
          return firstPass;
        }
      }
      return firstPass;
    } catch {
      return cleanInlineValue(trimmed);
    }
  };

  const resultSection = section('Result');
  const codeMatch = rawHtml.match(/```(?:js|javascript)?\s*([\s\S]*?)```/i);
  const pageUrlMatch = rawHtml.match(/- Page URL:\s*`([^`]+)`/i);
  const pageTitleMatch = rawHtml.match(/- Page Title:\s*(.+)/i);
  const eventsSection = section('Events');

  return {
    result: parseMaybeJson(resultSection),
    code: codeMatch?.[1]?.trim(),
    pageUrl: cleanInlineValue(pageUrlMatch?.[1]),
    pageTitle: cleanInlineValue(pageTitleMatch?.[1]),
    events: (eventsSection || '')
      .split('\n')
      .map((line) => line.replace(/^-+\s*/, '').trim())
      .filter(Boolean),
  };
};

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
  const [dialogDrawerVisible, setDialogDrawerVisible] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const sessionsQuery = useQuery(
    ['sessions', { page, pageSize, status: statusFilter, search: searchText }],
    async () => {
      const listResult = await sessionApi.list({ page, pageSize, status: statusFilter, search: searchText });
      const sessions = listResult.sessions || [];

      const [templateNameMap, userNameMap] = await Promise.all([
        (async () => {
          const templateIds = Array.from(
            new Set(sessions.map((session) => session.template_id).filter(Boolean) as string[]),
          );
          if (templateIds.length === 0) {
            return new Map<string, string>();
          }

          const templatePairs = await Promise.all(
            templateIds.map(async (templateId) => {
              try {
                const template = await templateApi.getById(templateId);
                return [templateId, template.name] as const;
              } catch {
                return [templateId, '-'] as const;
              }
            }),
          );

          return new Map<string, string>(templatePairs);
        })(),
        (async () => {
          const userIds = Array.from(
            new Set(sessions.map((session) => session.user_id).filter(Boolean) as string[]),
          );
          if (userIds.length === 0) {
            return new Map<string, string>();
          }

          const userPairs = await Promise.all(
            userIds.map(async (userId) => {
              try {
                const user = await userApi.getById(userId);
                return [userId, user.username] as const;
              } catch {
                return [userId, userId] as const;
              }
            }),
          );

          return new Map<string, string>(userPairs);
        })(),
      ]);

      const enrichedSessions: SessionRow[] = sessions.map((session) => ({
        ...session,
        template_name: session.template_id ? templateNameMap.get(session.template_id) || '-' : '-',
        username: session.user_id ? userNameMap.get(session.user_id) || session.user_id : '-',
      }));

      return {
        ...listResult,
        sessions: enrichedSessions,
      };
    }
  );

  const sessionStepsQuery = useQuery(
    ['sessionSteps', selectedSession?.id],
    () => sessionApi.getStepResults(selectedSession!.id),
    {
      enabled: dialogDrawerVisible && !!selectedSession?.id,
    },
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

  const dialogTimelineItems = useMemo(() => {
    const steps = sessionStepsQuery.data || [];
    return steps.map((step: StepResult) => {
      const hasError = !step.success;
      const textPreview = step.text?.slice(0, 120);
      const action = (step.action || '').toLowerCase();
      const isWaitStep = action.includes('wait');
      const isScreenshotStep = action.includes('screenshot');
      const parsedHtml = parseCliHtmlSummary(step.html);

      const detailContent = isWaitStep ? (
        <Text type="secondary">wait 步骤不展示详细内容</Text>
      ) : isScreenshotStep ? (
        step.screenshot ? (
          <img
            src={step.screenshot.startsWith('data:') ? step.screenshot : `data:image/png;base64,${step.screenshot}`}
            alt={`step-${step.step_index}-screenshot`}
            style={{ width: '100%', borderRadius: 8, border: '1px solid var(--bg-secondary)' }}
          />
        ) : (
          <Text type="secondary">暂无截图</Text>
        )
      ) : (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {step.screenshot ? (
            <div>
              <Text strong>截图</Text>
              <div style={{ marginTop: 6 }}>
                <img
                  src={step.screenshot.startsWith('data:') ? step.screenshot : `data:image/png;base64,${step.screenshot}`}
                  alt={`step-${step.step_index}-screenshot`}
                  style={{ width: '100%', borderRadius: 8, border: '1px solid var(--bg-secondary)' }}
                />
              </div>
            </div>
          ) : null}
          {step.text ? (
            <div>
              <Text strong>文本输出</Text>
              <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{step.text}</div>
            </div>
          ) : null}
          {parsedHtml.result !== undefined ? (
            <div>
              <Text strong>结果</Text>
              <pre
                style={{
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 8,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--bg-secondary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 12,
                }}
              >
                {typeof parsedHtml.result === 'string'
                  ? parsedHtml.result
                  : JSON.stringify(parsedHtml.result, null, 2)}
              </pre>
            </div>
          ) : null}
          {parsedHtml.pageUrl || parsedHtml.pageTitle ? (
            <div>
              <Text strong>页面信息</Text>
              <div style={{ marginTop: 6 }}>
                {parsedHtml.pageUrl ? <div>URL: {parsedHtml.pageUrl}</div> : null}
                {parsedHtml.pageTitle ? <div>Title: {parsedHtml.pageTitle}</div> : null}
              </div>
            </div>
          ) : null}
          {parsedHtml.events.length > 0 ? (
            <div>
              <Text strong>事件</Text>
              <div style={{ marginTop: 6 }}>
                {parsedHtml.events.map((eventText, idx) => (
                  <div key={`${step.step_id}-event-${idx}`}>- {eventText}</div>
                ))}
              </div>
            </div>
          ) : null}
          {parsedHtml.code ? (
            <div>
              <Text strong>执行代码</Text>
              <pre
                style={{
                  marginTop: 6,
                  maxHeight: 220,
                  overflow: 'auto',
                  padding: 10,
                  borderRadius: 8,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--bg-secondary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 12,
                }}
              >
                {parsedHtml.code}
              </pre>
            </div>
          ) : null}
        </Space>
      );
      const detailNode = isWaitStep ? (
        <Text type="secondary">wait 不展示详细内容</Text>
      ) : (
        <Collapse
          ghost
          items={[
            {
              key: `detail-${step.step_id}`,
              label: '查看详情',
              children: detailContent,
            },
          ]}
          defaultActiveKey={[]}
        />
      );

      return {
        color: hasError ? 'red' : 'green',
        children: (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Text strong>{`${step.step_index}. ${step.action}`}</Text>
            <Text type={hasError ? 'danger' : 'secondary'}>
              {hasError ? (step.error || step.message || '执行失败') : '执行成功'}
            </Text>
            {textPreview ? <Text type="secondary">{textPreview}</Text> : null}
            {detailNode}
          </Space>
        ),
      };
    });
  }, [sessionStepsQuery.data]);

  const columns: ColumnsType<SessionRow> = [
    {
      title: '模板名称',
      dataIndex: 'template_name',
      key: 'template_name',
      width: 220,
      ellipsis: true,
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
      dataIndex: 'username',
      key: 'username',
      width: 120,
      ellipsis: true,
      render: (username: string) => <span>{username || '-'}</span>,
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
            onClick={() => {
              setSelectedSession(record);
              setDialogDrawerVisible(true);
            }}
          >
            查看对话
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

      <Drawer
        title="会话对话详情"
        placement="right"
        width={680}
        open={dialogDrawerVisible}
        onClose={() => setDialogDrawerVisible(false)}
      >
        {selectedSession ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="模板名称">{selectedSession.template_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="所属用户">{selectedSession.username || '-'}</Descriptions.Item>
              <Descriptions.Item label="会话状态">
                <Tag color={getStateColor(selectedSession.state)}>{selectedSession.state}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="开始时间">
                {selectedSession.created_at ? new Date(selectedSession.created_at).toLocaleString() : '-'}
              </Descriptions.Item>
            </Descriptions>

            <Card title="执行步骤" size="small">
              {sessionStepsQuery.isLoading ? (
                <Text type="secondary">加载中...</Text>
              ) : (sessionStepsQuery.data || []).length === 0 ? (
                <Text type="secondary">暂无对话/步骤记录</Text>
              ) : (
                <Timeline items={dialogTimelineItems} />
              )}
            </Card>
          </Space>
        ) : null}
      </Drawer>

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
              <Button type="link" onClick={() => navigate('/carbone-templates')}>
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
