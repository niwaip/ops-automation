import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Col, Row, Statistic, Table, Tag, Space, Button, Typography, Tooltip } from 'antd';
import {
  FileTextOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  PlayCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { executionApi, ExecutionDto, ExecutionStatus } from '@/api/execution';
import { skillApi } from '@/api/skill';
import { capabilityReleaseApi } from '@/api/capabilities';
import { templateApi } from '@/api/template';
import {
  buildExecutionStatusLabels,
  EXECUTION_STATUS_COLORS,
} from '@/shared/lib/executionStatusMeta';

const summarizeText = (value?: string, maxLength = 38) => {
  if (!value) return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const summarizeExecutionInput = (execution: ExecutionDto) => {
  const prompt = typeof execution.input?.prompt === 'string' ? execution.input.prompt : undefined;
  const objective =
    typeof execution.normalizedInput?.objective === 'string'
      ? execution.normalizedInput.objective
      : undefined;
  const summary = summarizeText(prompt || objective, 42);

  if (summary) {
    return summary;
  }

  if (execution.input && Object.keys(execution.input).length > 0) {
    const keys = Object.keys(execution.input);
    const preview = keys.slice(0, 2).join('、');
    return keys.length > 2 ? `${preview} 等 ${keys.length} 项` : preview;
  }

  return '暂无输入';
};

const DashboardPage: React.FC = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { Text } = Typography;
  const recentExecutionPageSize = 6;

  const recentExecutionsQuery = useQuery(
    ['dashboard-executions-recent', recentExecutionPageSize],
    () => executionApi.list({ page: 1, pageSize: recentExecutionPageSize })
  );
  const skillsQuery = useQuery(['dashboard-skills-name-map'], () => skillApi.list());
  const releasesQuery = useQuery(['dashboard-published-skills-name-map'], () =>
    capabilityReleaseApi.listReleaseCenter()
  );

  const executionsTotalQuery = useQuery(['dashboard-executions-total'], () =>
    executionApi.list({ page: 1, pageSize: 1 })
  );
  const runningExecutionsQuery = useQuery(['dashboard-executions-running'], () =>
    executionApi.list({ page: 1, pageSize: 1, status: 'running' })
  );
  const pendingApprovalExecutionsQuery = useQuery(['dashboard-executions-pending-approval'], () =>
    executionApi.list({ page: 1, pageSize: 1, status: 'pending_approval' })
  );
  const templatesStatsQuery = useQuery(['templates-stats'], () => templateApi.list());

  const statusColors = EXECUTION_STATUS_COLORS;
  const statusLabels = buildExecutionStatusLabels({
    draft: t('executionStatusDraft'),
    queued: t('executionStatusQueued'),
    running: t('executionStatusRunning'),
    waiting_input: t('executionStatusWaitingInput'),
    pending_approval: t('executionStatusPendingApproval'),
    human_control: t('executionStatusHumanControl'),
    paused: t('executionStatusPaused'),
    succeeded: t('executionStatusSucceeded'),
    failed: t('executionStatusFailed'),
    cancelled: t('executionStatusCancelled'),
    rolled_back: t('executionStatusRolledBack'),
  });

  const skillNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (releasesQuery.data?.releases || []).forEach((release) => {
      if (release.publishedSkillId) {
        map.set(
          release.publishedSkillId,
          release.sourceName || release.sourceId || release.publishedSkillId
        );
      }
    });
    (skillsQuery.data?.skills || []).forEach((skill) => {
      if (!map.has(skill.id)) {
        map.set(skill.id, skill.name);
      }
    });
    return map;
  }, [releasesQuery.data?.releases, skillsQuery.data?.skills]);

  const getSkillDisplayName = (skillId?: string) => {
    if (!skillId) return '-';
    return skillNameMap.get(skillId) || skillId;
  };

  const executionColumns = [
    {
      title: '技能',
      dataIndex: 'skillId',
      key: 'skill',
      width: '20%',
      ellipsis: true,
      render: (skillId: string) => (
        <Space direction="vertical" size={2}>
          <Text strong>{getSkillDisplayName(skillId)}</Text>
        </Space>
      ),
    },
    {
      title: '输入摘要',
      key: 'inputSummary',
      width: '36%',
      render: (_: unknown, record: ExecutionDto) => (
        <Tooltip title={JSON.stringify(record.input || {}, null, 2)}>
          <Text
            style={{
              display: 'block',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {summarizeExecutionInput(record)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: t('status'),
      dataIndex: 'status',
      key: 'status',
      width: '14%',
      render: (status: ExecutionStatus) => (
        <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
      ),
    },
    {
      title: '风险',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: '10%',
      render: (riskLevel?: string) => riskLevel || '-',
    },
    {
      title: t('createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: '20%',
      render: (createdAt: string) => new Date(createdAt).toLocaleString(),
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginTop: 0 }}>
        <Col xs={24} sm={12} md={6}>
          <Card
            className="stat-card dashboard-stat-card card-gradient-1 animate-fade-in-up"
            variant="borderless"
            styles={{ body: { padding: '14px 16px' } }}
          >
            <Statistic
              title={t('executions')}
              value={executionsTotalQuery.data?.total || 0}
              prefix={<PlayCircleOutlined style={{ opacity: 0.9 }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card
            className="stat-card dashboard-stat-card card-gradient-2 animate-fade-in-up"
            variant="borderless"
            styles={{ body: { padding: '14px 16px' } }}
          >
            <Statistic
              title={t('executionStatusRunning')}
              value={runningExecutionsQuery.data?.total || 0}
              prefix={<ThunderboltOutlined style={{ opacity: 0.9 }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card
            className="stat-card dashboard-stat-card card-gradient-3 animate-fade-in-up"
            variant="borderless"
            styles={{ body: { padding: '14px 16px' } }}
          >
            <Statistic
              title={t('executionStatusPendingApproval')}
              value={pendingApprovalExecutionsQuery.data?.total || 0}
              prefix={<ClockCircleOutlined style={{ opacity: 0.9 }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card
            className="stat-card dashboard-stat-card card-gradient-4 animate-fade-in-up"
            variant="borderless"
            styles={{ body: { padding: '14px 16px' } }}
          >
            <Statistic
              title={t('templates')}
              value={templatesStatsQuery.data?.total || 0}
              prefix={<FileTextOutlined style={{ opacity: 0.9 }} />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('recentExecutions')}
            </span>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  void recentExecutionsQuery.refetch();
                }}
                className="btn-pill"
              >
                {t('refresh')}
              </Button>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => navigate('/executions/new')}
                className="btn-pill"
              >
                {t('newExecution')}
              </Button>
            </Space>
          </Space>
        }
        style={{ marginTop: 16 }}
      >
        <Table
          columns={executionColumns}
          dataSource={recentExecutionsQuery.data?.data || []}
          rowKey="id"
          loading={recentExecutionsQuery.isLoading}
          pagination={false}
          size="middle"
          tableLayout="fixed"
          onRow={(record: ExecutionDto) => ({
            style: { cursor: 'pointer' },
            onClick: () => navigate(`/executions/${record.id}`),
          })}
        />
      </Card>
    </div>
  );
};

export default DashboardPage;
