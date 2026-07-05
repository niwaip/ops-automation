import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  HourglassOutlined,
  PlayCircleOutlined,
  SendOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { App, Button, Card, Empty, Input, Modal, Space, Tag, Typography, theme } from 'antd';
import { type CSSProperties, type ReactNode, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import type { PublishedSkillCatalogItem } from '../../../api/skill';
import { scheduleApi, skillApi } from '../../../api';

const deploymentColor = (status?: string | null): string => {
  switch (status) {
    case 'deployed':
    case 'succeeded':
      return 'success';
    case 'deploying':
      return 'processing';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
};

const formatDateTime = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString('zh-CN', { hour12: false });
};

interface ScheduleSummary {
  id: string;
  name: string;
  skillId: string;
  cronExpression: string;
  timezone?: string;
  isActive: boolean;
  nextRunAt?: string;
  updatedAt?: string;
}

const summarizeCronExpression = (cronExpression?: string) => {
  if (!cronExpression) {
    return '未设置';
  }

  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return cronExpression;
  }

  const [minute, hour, dayOfMonth, _month, dayOfWeek] = parts;
  const timeText = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  if (dayOfMonth === '*' && dayOfWeek === '1-5') {
    return `工作日 ${timeText}`;
  }

  if (dayOfMonth !== '*' && dayOfWeek === '*') {
    return `每月 ${dayOfMonth} 日 ${timeText}`;
  }

  if (dayOfMonth === '*' && dayOfWeek !== '*') {
    return `每周 ${dayOfWeek} ${timeText}`;
  }

  return cronExpression;
};

const sectionCardStyle: CSSProperties = {
  borderRadius: 16,
};

const skillCardStyle: CSSProperties = {
  height: '100%',
  borderRadius: 16,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
};

const descriptionStyle: CSSProperties = {
  minHeight: 44,
  marginBottom: 0,
};

const statCardStyle: CSSProperties = {
  borderRadius: 14,
  height: '100%',
  minHeight: 68,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-card)',
};

const statGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 8,
  marginBottom: 12,
};

const statCardBodyStyle: CSSProperties = {
  padding: '12px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const statIconStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 16,
  flex: 'none',
};

const statContentStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: 1,
  minWidth: 0,
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
};

const statTitleStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.2,
  color: 'var(--text-secondary)',
};

const statValueStyle: CSSProperties = {
  fontSize: 24,
  lineHeight: 1.1,
  fontWeight: 700,
};

const skillMetaSectionStyle: CSSProperties = {
  width: '100%',
  borderRadius: 12,
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background: 'rgba(248, 250, 252, 0.72)',
  padding: '10px 12px',
};

const skillMetaSectionTitleStyle: CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontSize: 12,
};

const skillMetaRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap',
};

const skillMetaValueStyle: CSSProperties = {
  fontSize: 12,
};

const skillGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 16,
};

const getAccessStatusTag = (skill: PublishedSkillCatalogItem) => {
  if (skill.accessStatus === 'authorized') {
    return <Tag color="success">已授权</Tag>;
  }

  if (skill.accessStatus === 'requested') {
    return <Tag color="processing">申请中</Tag>;
  }

  if (skill.accessRequest?.status === 'rejected') {
    return <Tag color="error">已拒绝</Tag>;
  }

  return <Tag>未授权</Tag>;
};

export function PublishedSkillListPage() {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [requestTarget, setRequestTarget] = useState<PublishedSkillCatalogItem | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [recentlyRequestedSkillId, setRecentlyRequestedSkillId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<'authorized' | 'unauthorized', boolean>>({
    authorized: false,
    unauthorized: false,
  });

  const catalogQuery = useQuery<{ skills: PublishedSkillCatalogItem[] }>(
    ['user-web-published-skills-catalog'],
    () => skillApi.listCatalog(),
    {
      staleTime: 15000,
    }
  );
  const schedulesQuery = useQuery(
    ['user-web-published-skill-schedules'],
    () => scheduleApi.list() as Promise<ScheduleSummary[]>,
    {
      staleTime: 60000,
      refetchOnWindowFocus: false,
    }
  );

  const requestAccessMutation = useMutation(
    async (payload: { skillId: string; reason?: string }) =>
      skillApi.requestAccess(payload.skillId, { reason: payload.reason }),
    {
      onSuccess: async (data, variables) => {
        queryClient.setQueryData<{ skills: PublishedSkillCatalogItem[] } | undefined>(
          ['user-web-published-skills-catalog'],
          (current) => {
            if (!current) {
              return current;
            }

            return {
              skills: current.skills.map((skill) =>
                skill.id === variables.skillId
                  ? {
                      ...skill,
                      accessStatus: 'requested',
                      accessRequest: data.request,
                    }
                  : skill
              ),
            };
          }
        );
        setRecentlyRequestedSkillId(variables.skillId);
        void message.success('授权申请已提交');
        setRequestTarget(null);
        setRequestReason('');
        await queryClient.invalidateQueries(['user-web-published-skills-catalog']);
      },
      onError: (error) => {
        void message.error(error instanceof Error ? error.message : '提交授权申请失败');
      },
    }
  );

  const skills = useMemo(
    () => (catalogQuery.data?.skills || []).sort((left, right) => left.name.localeCompare(right.name)),
    [catalogQuery.data?.skills]
  );

  const authorizedSkills = useMemo(
    () => skills.filter((skill) => skill.accessStatus === 'authorized'),
    [skills]
  );

  const unauthorizedSkills = useMemo(
    () => skills.filter((skill) => skill.accessStatus !== 'authorized'),
    [skills]
  );

  const requestedSkills = useMemo(
    () => unauthorizedSkills.filter((skill) => skill.accessStatus === 'requested'),
    [unauthorizedSkills]
  );

  const rejectedSkills = useMemo(
    () => unauthorizedSkills.filter((skill) => skill.accessRequest?.status === 'rejected'),
    [unauthorizedSkills]
  );

  const neverRequestedSkills = useMemo(
    () =>
      unauthorizedSkills.filter(
        (skill) => skill.accessStatus !== 'requested' && skill.accessRequest?.status !== 'rejected'
      ),
    [unauthorizedSkills]
  );

  const orderedUnauthorizedSkills = useMemo(
    () => [...requestedSkills, ...rejectedSkills, ...neverRequestedSkills],
    [neverRequestedSkills, rejectedSkills, requestedSkills]
  );
  const overviewItems = useMemo(
    () => [
      {
        key: 'total',
        label: '已发布技能总数',
        value: skills.length,
        icon: <AppstoreOutlined />,
        iconStyle: { color: '#4f46e5', background: 'rgba(99, 102, 241, 0.12)' },
      },
      {
        key: 'authorized',
        label: '已授权',
        value: authorizedSkills.length,
        icon: <CheckCircleOutlined />,
        iconStyle: { color: '#059669', background: 'rgba(16, 185, 129, 0.12)' },
      },
      {
        key: 'requested',
        label: '申请中',
        value: requestedSkills.length,
        icon: <HourglassOutlined />,
        iconStyle: { color: '#2563eb', background: 'rgba(59, 130, 246, 0.12)' },
      },
      {
        key: 'rejected',
        label: '最近被拒绝',
        value: rejectedSkills.length,
        icon: <CloseCircleOutlined />,
        iconStyle: { color: '#dc2626', background: 'rgba(239, 68, 68, 0.12)' },
      },
      {
        key: 'available',
        label: '可直接申请',
        value: neverRequestedSkills.length,
        icon: <SendOutlined />,
        iconStyle: { color: '#475569', background: 'rgba(148, 163, 184, 0.16)' },
      },
    ],
    [skills.length, authorizedSkills.length, requestedSkills.length, rejectedSkills.length, neverRequestedSkills.length]
  );
  const schedulesBySkillId = useMemo(() => {
    const grouped = new Map<string, ScheduleSummary[]>();

    (schedulesQuery.data || []).forEach((schedule) => {
      const current = grouped.get(schedule.skillId) || [];
      current.push(schedule);
      grouped.set(schedule.skillId, current);
    });

    grouped.forEach((items, skillId) => {
      grouped.set(
        skillId,
        [...items].sort((left, right) => {
          const leftTime = new Date(left.nextRunAt || left.updatedAt || left.id).getTime();
          const rightTime = new Date(right.nextRunAt || right.updatedAt || right.id).getTime();
          return leftTime - rightTime;
        })
      );
    });

    return grouped;
  }, [schedulesQuery.data]);
  const resolvedSkillMetaSectionStyle = useMemo<CSSProperties>(
    () => ({
      ...skillMetaSectionStyle,
      border: `1px solid ${token.colorBorderSecondary}`,
      background: token.colorFillTertiary,
    }),
    [token.colorBorderSecondary, token.colorFillTertiary]
  );

  const renderSkillGrid = (
    list: PublishedSkillCatalogItem[],
    options: { emptyText: string; authorized: boolean }
  ) => {
    if (catalogQuery.isLoading && skills.length === 0) {
      return (
        <div style={skillGridStyle}>
          {[0, 1, 2].map((index) => (
            <Card key={index} loading style={skillCardStyle} />
          ))}
        </div>
      );
    }

    if (list.length === 0) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={options.emptyText} />;
    }

    return (
      <div style={skillGridStyle}>
        {list.map((skill) => {
          const skillSchedules = schedulesBySkillId.get(skill.id) || [];
          const activeSchedules = skillSchedules.filter((schedule) => schedule.isActive);
          const nextSchedule = activeSchedules[0] || skillSchedules[0];

          return (
            <Card
              key={skill.id}
              style={{
                ...skillCardStyle,
                borderColor:
                  recentlyRequestedSkillId === skill.id && skill.accessStatus === 'requested'
                    ? token.colorInfoBorder
                    : undefined,
                background:
                  recentlyRequestedSkillId === skill.id && skill.accessStatus === 'requested'
                    ? token.colorInfoBg
                    : undefined,
              }}
              styles={{ body: { display: 'flex', flexDirection: 'column', gap: 16 } }}
            >
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                <Typography.Title
                  level={5}
                  ellipsis={{ tooltip: skill.name }}
                  style={{ margin: 0, flex: 1, minWidth: 0 }}
                >
                  {skill.name}
                </Typography.Title>
                {getAccessStatusTag(skill)}
              </Space>

                {options.authorized ? (
                  <>
                    <div style={resolvedSkillMetaSectionStyle}>
                      <Typography.Text type="secondary" style={skillMetaSectionTitleStyle}>
                        说明
                      </Typography.Text>
                      <Typography.Paragraph
                        type="secondary"
                        ellipsis={{ rows: 3 }}
                        style={{ ...descriptionStyle, minHeight: 'auto' }}
                      >
                        {skill.description || '暂无说明'}
                      </Typography.Paragraph>
                    </div>
                    <div style={resolvedSkillMetaSectionStyle}>
                      <Typography.Text type="secondary" style={skillMetaSectionTitleStyle}>
                        定期任务
                      </Typography.Text>
                      {skillSchedules.length === 0 ? (
                        <Typography.Text type="secondary" style={skillMetaValueStyle}>
                          当前没有关联的定期任务
                        </Typography.Text>
                      ) : (
                        <Space direction="vertical" size={6} style={{ width: '100%' }}>
                          <div style={skillMetaRowStyle}>
                            <Typography.Text type="secondary" style={skillMetaValueStyle}>
                              共 {skillSchedules.length} 个，启用中 {activeSchedules.length} 个
                            </Typography.Text>
                            {nextSchedule?.timezone ? (
                              <Tag bordered={false}>{nextSchedule.timezone}</Tag>
                            ) : null}
                          </div>
                          {nextSchedule ? (
                            <>
                              <Typography.Text style={skillMetaValueStyle}>
                                {summarizeCronExpression(nextSchedule.cronExpression)}
                              </Typography.Text>
                              <Typography.Text type="secondary" style={skillMetaValueStyle}>
                                {nextSchedule.isActive ? '下次执行' : '最近更新'}：
                                {formatDateTime(
                                  nextSchedule.isActive
                                    ? nextSchedule.nextRunAt
                                    : nextSchedule.updatedAt || nextSchedule.nextRunAt
                                ) || '-'}
                              </Typography.Text>
                            </>
                          ) : null}
                        </Space>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={descriptionStyle}>
                      {skill.description || '暂无说明'}
                    </Typography.Paragraph>
                    <Space size={[8, 8]} wrap>
                      <Tag>{skill.publishedSourceType || 'published'}</Tag>
                      <Tag color={deploymentColor(skill.publishedDeploymentStatus)}>
                        {skill.publishedDeploymentStatus || 'unknown'}
                      </Tag>
                      {skill.publishedReleaseVersion ? (
                        <Tag color="blue">v{skill.publishedReleaseVersion}</Tag>
                      ) : null}
                    </Space>
                  </>
                )}
              </Space>

              {skill.accessStatus === 'requested' ? (
              <Card
                size="small"
                variant="borderless"
                style={{
                  background:
                    recentlyRequestedSkillId === skill.id
                      ? token.colorInfoBg
                      : token.colorFillQuaternary,
                }}
                styles={{ body: { padding: 12 } }}
              >
                <Space direction="vertical" size={4}>
                  {recentlyRequestedSkillId === skill.id ? (
                    <Tag color="blue" style={{ width: 'fit-content', marginInlineEnd: 0 }}>
                      刚刚提交
                    </Tag>
                  ) : null}
                  <Typography.Text>
                    <ClockCircleOutlined style={{ marginRight: 6 }} />
                    已提交授权申请，等待管理员处理
                  </Typography.Text>
                  {skill.accessRequest?.reason ? (
                    <Typography.Text type="secondary">
                      申请原因：{skill.accessRequest.reason}
                    </Typography.Text>
                  ) : null}
                  {formatDateTime(skill.accessRequest?.createdAt) ? (
                    <Typography.Text type="secondary">
                      提交时间：{formatDateTime(skill.accessRequest?.createdAt)}
                    </Typography.Text>
                  ) : null}
                </Space>
              </Card>
              ) : null}

              {skill.accessStatus === 'unauthorized' && skill.accessRequest?.status === 'rejected' ? (
              <Card
                size="small"
                variant="borderless"
                style={{ background: token.colorErrorBg }}
                styles={{ body: { padding: 12 } }}
              >
                <Space direction="vertical" size={4}>
                  <Typography.Text>
                    <CloseCircleOutlined style={{ marginRight: 6 }} />
                    最近一次授权申请未通过
                  </Typography.Text>
                  {skill.accessRequest.reason ? (
                    <Typography.Text type="secondary">
                      申请原因：{skill.accessRequest.reason}
                    </Typography.Text>
                  ) : null}
                  {skill.accessRequest.responseNote ? (
                    <Typography.Text type="secondary">
                      管理员备注：{skill.accessRequest.responseNote}
                    </Typography.Text>
                  ) : null}
                  {formatDateTime(skill.accessRequest.processedAt || skill.accessRequest.updatedAt) ? (
                    <Typography.Text type="secondary">
                      处理时间：{formatDateTime(
                        skill.accessRequest.processedAt || skill.accessRequest.updatedAt
                      )}
                    </Typography.Text>
                  ) : null}
                </Space>
              </Card>
              ) : null}

              <Space direction="vertical" size={8} style={{ marginTop: 'auto', width: '100%' }}>
              <Button
                block
                type={options.authorized ? 'primary' : skill.accessStatus === 'requested' ? 'default' : 'primary'}
                ghost={!options.authorized && skill.accessStatus !== 'requested'}
                icon={options.authorized ? <PlayCircleOutlined /> : <SendOutlined />}
                disabled={!options.authorized && skill.accessStatus === 'requested'}
                onClick={() => {
                  if (options.authorized) {
                    navigate(`/executions/new?skillId=${skill.id}`);
                    return;
                  }

                  setRequestTarget(skill);
                  setRequestReason(skill.accessRequest?.reason || '');
                }}
              >
                {options.authorized
                  ? '确认配置'
                  : skill.accessStatus === 'requested'
                    ? '已提交申请'
                    : skill.accessRequest?.status === 'rejected'
                      ? '重新申请'
                      : '申请授权'}
              </Button>
              </Space>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderSectionCard = (
    key: 'authorized' | 'unauthorized',
    title: string,
    content: ReactNode
  ) => {
    const collapsed = collapsedSections[key];
    const toggleSection = () =>
      setCollapsedSections((current) => ({
        ...current,
        [key]: !current[key],
      }));

    return (
      <Card
        size="small"
        title={
          <button
            type="button"
            onClick={toggleSection}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              font: 'inherit',
            }}
          >
            <span>{title}</span>
            {collapsed ? <DownOutlined /> : <UpOutlined />}
          </button>
        }
        style={{ ...sectionCardStyle, marginBottom: key === 'authorized' ? 16 : 0 }}
        styles={{
          header: { cursor: 'pointer' },
          body: collapsed
            ? { display: 'none' }
            : { paddingTop: 8 },
        }}
      >
        {content}
      </Card>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={statGridStyle}>
        {overviewItems.map((item) => (
          <Card key={item.key} size="small" style={statCardStyle} styles={{ body: statCardBodyStyle }}>
            <div style={{ ...statIconStyle, ...item.iconStyle }}>{item.icon}</div>
            <div style={statContentStyle}>
              <span style={statTitleStyle}>{item.label}</span>
              <span style={statValueStyle}>{item.value}</span>
            </div>
          </Card>
        ))}
      </div>

      {renderSectionCard(
        'authorized',
        `已授权技能 (${authorizedSkills.length})`,
        renderSkillGrid(authorizedSkills, {
          emptyText: '当前没有已授权技能',
          authorized: true,
        })
      )}

      {renderSectionCard(
        'unauthorized',
        `未授权 / 申请记录 (${unauthorizedSkills.length})`,
        renderSkillGrid(orderedUnauthorizedSkills, {
          emptyText: '当前没有未授权技能或申请记录',
          authorized: false,
        })
      )}

      <Modal
        title={requestTarget ? `申请使用技能: ${requestTarget.name}` : '申请授权'}
        open={Boolean(requestTarget)}
        onCancel={() => {
          if (requestAccessMutation.isLoading) {
            return;
          }
          setRequestTarget(null);
          setRequestReason('');
        }}
        onOk={() => {
          if (!requestTarget) {
            return;
          }
          requestAccessMutation.mutate({
            skillId: requestTarget.id,
            reason: requestReason.trim() || undefined,
          });
        }}
        okText="提交申请"
        cancelText="取消"
        confirmLoading={requestAccessMutation.isLoading}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            请填写申请原因，便于管理员判断是否为你开通该技能。
          </Typography.Text>
          <Input.TextArea
            rows={4}
            maxLength={500}
            showCount
            placeholder="例如：需要用于日报生成、合同整理或日常审批处理。"
            value={requestReason}
            onChange={(event) => setRequestReason(event.target.value)}
          />
        </Space>
      </Modal>
    </div>
  );
}
