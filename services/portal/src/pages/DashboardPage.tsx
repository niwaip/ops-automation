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
import { executionApi, ExecutionDto, ExecutionStatus } from '../api/execution';
import { skillApi } from '../api/skill';
import { capabilityReleaseApi } from '../api/capability-release';
import { templateApi } from '../api/template';

const summarizeText = (value?: string, maxLength = 38) => {
  if (!value) return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const summarizeExecutionInput = (execution: ExecutionDto) => {
  const prompt = typeof execution.input?.prompt === 'string' ? execution.input.prompt : undefined;
  const objective = typeof execution.normalizedInput?.objective === 'string'
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

const extractResultFileName = (value?: Record<string, unknown>): string | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  if (typeof value.fileName === 'string' && value.fileName.trim()) return value.fileName;

  const raw = value.raw;
  if (raw && typeof raw === 'object' && raw !== null) {
    const rawFileName = (raw as Record<string, unknown>).fileName;
    if (typeof rawFileName === 'string' && rawFileName.trim()) return rawFileName;
  }

  const nestedResult = value.result;
  if (nestedResult && typeof nestedResult === 'object') {
    return extractResultFileName(nestedResult as Record<string, unknown>);
  }

  return undefined;
};

const extractDownloadUrl = (result?: Record<string, unknown>): string | undefined => {
  if (!result || typeof result !== 'object') return undefined;
  if (typeof result.downloadUrl === 'string' && result.downloadUrl.trim()) return result.downloadUrl;

  const raw = result.raw;
  if (raw && typeof raw === 'object' && raw !== null && 'downloadUrl' in raw) {
    const rawDownloadUrl = (raw as Record<string, unknown>).downloadUrl;
    if (typeof rawDownloadUrl === 'string' && rawDownloadUrl.trim()) return rawDownloadUrl;
  }

  const nestedResult = result.result;
  if (nestedResult && typeof nestedResult === 'object') {
    return extractDownloadUrl(nestedResult as Record<string, unknown>);
  }

  return undefined;
};

const summarizeExecutionResult = (result?: Record<string, unknown>) => {
  if (!result || Object.keys(result).length === 0) {
    return { title: '暂无结果', detail: '执行尚未生成可展示结果' };
  }

  const fileName = extractResultFileName(result);
  if (fileName) {
    return { title: fileName, detail: '已生成文件结果' };
  }

  const downloadUrl = extractDownloadUrl(result);
  if (downloadUrl) {
    return { title: '可下载结果', detail: '存在下载链接，可在详情中查看' };
  }

  if (typeof result.status === 'string' && result.status.trim()) {
    return { title: `状态: ${result.status}`, detail: '结果对象包含状态字段' };
  }

  const keys = Object.keys(result);
  const preview = keys.slice(0, 3).join('、');
  return {
    title: keys.length > 3 ? `${preview} 等 ${keys.length} 项` : preview,
    detail: `结果字段: ${keys.join('、')}`,
  };
};

const DashboardPage: React.FC = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { Text } = Typography;

  const recentExecutionsQuery = useQuery(
    ['dashboard-executions-recent'],
    () => executionApi.list({ page: 1, pageSize: 5 })
  );
  const skillsQuery = useQuery(['dashboard-skills-name-map'], () => skillApi.list());
  const releasesQuery = useQuery(['dashboard-published-skills-name-map'], () => capabilityReleaseApi.listReleaseCenter());

  const executionsTotalQuery = useQuery(
    ['dashboard-executions-total'],
    () => executionApi.list({ page: 1, pageSize: 1 })
  );
  const runningExecutionsQuery = useQuery(
    ['dashboard-executions-running'],
    () => executionApi.list({ page: 1, pageSize: 1, status: 'running' })
  );
  const pendingApprovalExecutionsQuery = useQuery(
    ['dashboard-executions-pending-approval'],
    () => executionApi.list({ page: 1, pageSize: 1, status: 'pending_approval' })
  );
  const templatesStatsQuery = useQuery(['templates-stats'], () => templateApi.list());

  const statusColors: Record<ExecutionStatus, string> = {
    draft: 'default',
    queued: 'default',
    running: 'processing',
    waiting_input: 'warning',
    pending_approval: 'warning',
    human_control: 'error',
    paused: 'default',
    succeeded: 'success',
    failed: 'error',
    cancelled: 'default',
    rolled_back: 'default',
  };

  const statusLabels: Record<ExecutionStatus, string> = {
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
  };

  const skillNameMap = useMemo(() => {
    const map = new Map<string, string>();
    // 优先映射 published 的来源名称
    (releasesQuery.data?.releases || []).forEach((release) => {
      if (release.publishedSkillId) {
        map.set(release.publishedSkillId, release.sourceName || release.sourceId || release.publishedSkillId);
      }
    });
    // 兜底基础技能名称
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
      width: 220,
      render: (skillId: string) => (
        <Space direction="vertical" size={2}>
          <Text strong>{getSkillDisplayName(skillId)}</Text>
        </Space>
      ),
    },
    {
      title: '输入摘要',
      key: 'inputSummary',
      width: 260,
      render: (_: unknown, record: ExecutionDto) => (
        <Tooltip title={JSON.stringify(record.input || {}, null, 2)}>
          <Space direction="vertical" size={2}>
            <Text>{summarizeExecutionInput(record)}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.input && Object.keys(record.input).length > 0
                ? `${Object.keys(record.input).length} 个字段`
                : '无结构化参数'}
            </Text>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: '执行结果',
      key: 'resultSummary',
      width: 260,
      render: (_: unknown, record: ExecutionDto) => {
        const resultSummary = summarizeExecutionResult(record.result);
        return (
          <Tooltip title={JSON.stringify(record.result || {}, null, 2)}>
            <Space direction="vertical" size={2}>
              <Text>{resultSummary.title}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {resultSummary.detail}
              </Text>
            </Space>
          </Tooltip>
        );
      },
    },
    {
      title: t('status'),
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status: ExecutionStatus) => (
        <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
      ),
    },
    {
      title: '风险',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 100,
      render: (riskLevel?: string) => riskLevel || '-',
    },
    {
      title: t('createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (createdAt: string) => new Date(createdAt).toLocaleString(),
    },
  ];

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="page-title" style={{ marginBottom: 0 }}>
          {t('dashboard')}
        </div>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={() => navigate('/executions/new')}
        >
          {t('newExecution')}
        </Button>
      </Space>

      <Row gutter={[24, 24]} style={{ marginTop: 0 }}>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card dashboard-stat-card card-gradient-1 animate-fade-in-up" variant="borderless">
            <Statistic
              title={t('executions')}
              value={executionsTotalQuery.data?.total || 0}
              prefix={<PlayCircleOutlined style={{ opacity: 0.9 }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card dashboard-stat-card card-gradient-2 animate-fade-in-up" variant="borderless">
            <Statistic
              title={t('executionStatusRunning')}
              value={runningExecutionsQuery.data?.total || 0}
              prefix={<ThunderboltOutlined style={{ opacity: 0.9 }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card dashboard-stat-card card-gradient-3 animate-fade-in-up" variant="borderless">
            <Statistic
              title={t('executionStatusPendingApproval')}
              value={pendingApprovalExecutionsQuery.data?.total || 0}
              prefix={<ClockCircleOutlined style={{ opacity: 0.9 }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card dashboard-stat-card card-gradient-4 animate-fade-in-up" variant="borderless">
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
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t('recentExecutions')}</span>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                void recentExecutionsQuery.refetch();
              }}
              style={{
                borderRadius: 8,
                fontWeight: 500,
              }}
            >
              {t('refresh')}
            </Button>
          </Space>
        }
        style={{ marginTop: 24 }}
        variant="borderless"
      >
        <Table
          columns={executionColumns}
          dataSource={recentExecutionsQuery.data?.data || []}
          rowKey="id"
          loading={recentExecutionsQuery.isLoading}
          pagination={false}
          size="middle"
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
