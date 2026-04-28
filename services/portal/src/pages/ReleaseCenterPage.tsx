import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Steps,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeploymentUnitOutlined, ReloadOutlined, RocketOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from 'react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CapabilityRelease, CapabilityReleaseDetail, capabilityReleaseApi } from '../api/capability-release';

const { Title, Text } = Typography;

type DeploymentEnvironment = 'staging' | 'prod';

const DEPLOY_ENV_OPTIONS: { label: string; value: DeploymentEnvironment }[] = [
  { label: 'staging（预发布）', value: 'staging' },
  { label: 'prod（生产）', value: 'prod' },
];

const statusColor = (status: string) => {
  switch (status) {
    case 'published':
    case 'deployed':
    case 'succeeded':
      return 'green';
    case 'rolled_back':
      return 'orange';
    case 'approved':
      return 'blue';
    case 'deploying':
    case 'building':
    case 'validating':
      return 'processing';
    case 'failed':
    case 'build_failed':
    case 'validation_failed':
    case 'deploy_failed':
      return 'red';
    case 'pending_approval':
      return 'gold';
    default:
      return 'default';
  }
};

const parseJsonDraft = <T,>(raw: string, fallbackLabel: string): { valid: true; value: T } | { valid: false; error: string } => {
  try {
    return { valid: true, value: JSON.parse(raw) as T };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? `${fallbackLabel}: ${error.message}` : `${fallbackLabel}: JSON 解析失败`,
    };
  }
};

const getNextStepHint = (release: CapabilityRelease): { label: string; color: string } => {
  if (release.deploymentStatus === 'succeeded' || release.deploymentStatus === 'deployed' || release.status === 'deployed') return { label: '观察运行/回滚', color: 'green' };
  if (release.status === 'deploying' || release.deploymentStatus === 'deploying') return { label: '正在部署...', color: 'processing' };
  if (release.status === 'build_failed') return { label: '重新构建', color: 'red' };
  if (release.status === 'validation_failed') return { label: '重新校验', color: 'volcano' };
  if (release.status === 'deploy_failed') return { label: '重新部署', color: 'magenta' };
  if (release.status === 'rolled_back') return { label: '确认回滚结果', color: 'orange' };

  if (!release.currentBuildId && !release.latestSuccessfulBuildId) return { label: '去 Release 页构建', color: 'blue' };
  if (!release.latestSuccessfulValidationId) return { label: '去 Release 页校验', color: 'cyan' };
  if (!release.currentSkillDraftId) return { label: '去 Release 页生成草案', color: 'geekblue' };
  if (release.approvalStatus === 'pending' || release.status === 'pending_approval') return { label: '执行审批', color: 'gold' };
  if (!release.publishedSkillId) return { label: '发布为 Skill', color: 'purple' };
  
  return { label: '部署到环境', color: 'blue' };
};

const getReleaseCurrentStep = (release: CapabilityRelease): { current: number; status: 'wait' | 'process' | 'finish' | 'error' } => {
  if (release.status.includes('failed')) {
    let step = 0;
    if (release.status === 'build_failed') step = 1;
    else if (release.status === 'validation_failed') step = 2;
    else if (release.status === 'deploy_failed') step = 6;
    return { current: step, status: 'error' };
  }

  if (release.deploymentStatus === 'succeeded' || release.deploymentStatus === 'deployed' || release.status === 'deployed') return { current: 6, status: 'finish' };
  if (release.status === 'deploying' || release.deploymentStatus === 'deploying') return { current: 6, status: 'process' };
  if (release.publishedSkillId) return { current: 5, status: 'finish' };
  if (release.approvalStatus === 'approved') return { current: 4, status: 'finish' };
  if (release.approvalStatus === 'pending' || release.status === 'pending_approval') return { current: 4, status: 'process' };
  if (release.currentSkillDraftId) return { current: 3, status: 'finish' };
  if (release.latestSuccessfulValidationId) return { current: 2, status: 'finish' };
  if (release.currentBuildId || release.latestSuccessfulBuildId) return { current: 1, status: 'finish' };

  return { current: 0, status: 'process' };
};

const ReleaseCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deployVisible, setDeployVisible] = useState(false);
  const [deployTargetReleaseId, setDeployTargetReleaseId] = useState<string | null>(null);
  const [deployEnvironment, setDeployEnvironment] = useState<DeploymentEnvironment>('staging');
  const [deployStrategy, setDeployStrategy] = useState<'hot_reload' | 'rolling_restart' | 'full_restart'>(
    'rolling_restart',
  );
  const [deployOverridesDraft, setDeployOverridesDraft] = useState('{}');
  const releasesQuery = useQuery(['release-center'], capabilityReleaseApi.listReleaseCenter);
  const detailQuery = useQuery(
    ['release-center-detail', selectedReleaseId],
    () => capabilityReleaseApi.getReleaseCenterById(selectedReleaseId as string),
    { enabled: Boolean(selectedReleaseId) },
  );

  const releases = releasesQuery.data?.releases || [];
  const selectedDetail: CapabilityReleaseDetail | undefined = detailQuery.data?.release;
  const deploymentProfiles = useMemo(() => {
    const raw = selectedDetail?.currentSourceSnapshot?.sourcePayload?.deploymentProfiles;
    return raw && typeof raw === 'object' ? (raw as Record<string, Record<string, unknown>>) : {};
  }, [selectedDetail?.currentSourceSnapshot?.id]);
  const activeDeployProfile =
    (deployVisible && deployTargetReleaseId === selectedDetail?.release.id
      ? deploymentProfiles[deployEnvironment]
      : undefined) || {};
  const deployOverridesState = useMemo(
    () => parseJsonDraft<Record<string, unknown>>(deployOverridesDraft || '{}', '部署覆盖参数 JSON'),
    [deployOverridesDraft],
  );
  const latestDeployment = selectedDetail?.deployments?.[0];
  const latestSmokeValidation =
    selectedDetail?.validations?.find(
      (item) =>
        item.validationType === 'post_deploy_smoke' &&
        item.id === latestDeployment?.smokeValidationId,
    ) ||
    selectedDetail?.validations?.find((item) => item.validationType === 'post_deploy_smoke');
  const hasSuccessfulStagingDeployment = useMemo(
    () =>
      Boolean(
        selectedDetail?.deployments?.some(
          (deployment) => deployment.environment === 'staging' && deployment.status === 'succeeded',
        ),
      ),
    [selectedDetail?.deployments],
  );
  const deployedCount = useMemo(
    () => releases.filter((release) => release.deploymentStatus === 'succeeded' || release.status === 'deployed').length,
    [releases],
  );
  const publishedCount = useMemo(
    () => releases.filter((release) => Boolean(release.publishedSkillId)).length,
    [releases],
  );
  const refreshReleaseCenter = async (releaseId?: string) => {
    await releasesQuery.refetch();
    if (releaseId && selectedReleaseId === releaseId) {
      await detailQuery.refetch();
    }
  };

  const approveMutation = useMutation(
    ({ id }: { id: string }) =>
      capabilityReleaseApi.approveRelease(id, { decision: 'approved', comment: 'Release Center 审批通过' }),
    {
      onSuccess: async (_, variables) => {
        message.success('审批通过');
        await refreshReleaseCenter(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '审批失败');
      },
    },
  );

  const publishMutation = useMutation(
    ({ id }: { id: string }) => capabilityReleaseApi.publishSkill(id),
    {
      onSuccess: async (result, variables) => {
        message.success(`Skill 发布成功: ${result.publishedSkillId}`);
        await refreshReleaseCenter(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '发布失败');
      },
    },
  );

  const deployMutation = useMutation(
    ({
      id,
      environment,
      strategy,
      configOverrides,
    }: {
      id: string;
      environment: DeploymentEnvironment;
      strategy: 'hot_reload' | 'rolling_restart' | 'full_restart';
      configOverrides?: Record<string, unknown>;
    }) => capabilityReleaseApi.deploy(id, { environment, strategy, configOverrides }),
    {
      onSuccess: async (_, variables) => {
        message.success('部署完成');
        setDeployVisible(false);
        setDeployTargetReleaseId(null);
        setDeployOverridesDraft('{}');
        await refreshReleaseCenter(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '部署失败');
      },
    },
  );

  const rollbackMutation = useMutation(
    ({ id }: { id: string }) => capabilityReleaseApi.rollback(id, { reason: 'Release Center 手工触发回滚' }),
    {
      onSuccess: async (result, variables) => {
        message.success(`已回滚到 Release: ${result.targetReleaseId.slice(0, 8)}`);
        await refreshReleaseCenter(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '回滚失败');
      },
    },
  );

  const filteredReleases = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return releases.filter((release) => {
      const hint = getNextStepHint(release);
      const matchesKeyword =
        !keyword ||
        release.id.toLowerCase().includes(keyword) ||
        String(release.sourceName || '').toLowerCase().includes(keyword) ||
        String(release.publishedSkillId || '').toLowerCase().includes(keyword) ||
        hint.label.toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === 'all' ||
        release.status === statusFilter ||
        release.deploymentStatus === statusFilter;

      return matchesKeyword && matchesStatus;
    });
  }, [releases, searchText, statusFilter]);

  useEffect(() => {
    const releaseIdFromQuery = searchParams.get('releaseId');
    if (releaseIdFromQuery && releaseIdFromQuery !== selectedReleaseId) {
      setSelectedReleaseId(releaseIdFromQuery);
    }
    if (!releaseIdFromQuery && selectedReleaseId) {
      setSelectedReleaseId(null);
    }
  }, [searchParams, selectedReleaseId]);

  const openDeployModal = (releaseId: string) => {
    setSelectedReleaseId(releaseId);
    setSearchParams({ releaseId });
    setDeployTargetReleaseId(releaseId);
    setDeployEnvironment('staging');
    setDeployStrategy('rolling_restart');
    setDeployOverridesDraft('{}');
    setDeployVisible(true);
  };

  const handleDeploy = async () => {
    if (!deployTargetReleaseId) {
      return;
    }
    if (deployEnvironment === 'prod' && !hasSuccessfulStagingDeployment) {
      message.warning('请先完成一次 staging 成功部署，再发布到 prod');
      return;
    }
    if (!deployOverridesState.valid) {
      message.error(deployOverridesState.error);
      return;
    }
    deployMutation.mutate({
      id: deployTargetReleaseId,
      environment: deployEnvironment,
      strategy: deployStrategy,
      configOverrides: deployOverridesState.value,
    });
  };

  const getReleaseActionHint = (release: CapabilityRelease) => {
    if (release.status === 'pending_approval' || release.approvalStatus === 'pending') {
      return '当前处于待审批，可执行审批。';
    }
    if (!release.publishedSkillId) {
      return '审批通过后可发布 Skill。';
    }
    if (release.status === 'deploying') {
      return '当前正在部署，建议只读查看日志。';
    }
    if (release.status === 'deployed' || release.deploymentStatus === 'succeeded') {
      return '已部署，可查看 smoke test 或执行回滚。';
    }
    return '可继续执行发布、部署与回滚操作。';
  };

  const columns: ColumnsType<CapabilityRelease> = [
    {
      title: '能力名称',
      dataIndex: 'sourceName',
      key: 'sourceName',
      render: (value: string | null | undefined, record) => value || record.sourceId || '未命名能力',
    },
    {
      title: '类型',
      dataIndex: 'sourceType',
      key: 'sourceType',
      width: 140,
      render: (value: string) => (
        <Tag color={value === 'temporal_workflow' ? 'purple' : 'blue'}>
          {value === 'temporal_workflow' ? 'Temporal' : 'Template'}
        </Tag>
      ),
    },
    {
      title: '发布状态',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>,
    },
    {
      title: '部署状态',
      dataIndex: 'deploymentStatus',
      key: 'deploymentStatus',
      width: 150,
      render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>,
    },
    {
      title: '下一步建议',
      key: 'nextStep',
      width: 150,
      render: (_, record) => {
        const hint = getNextStepHint(record);
        return <Tag color={hint.color}>{hint.label}</Tag>;
      },
    },
    {
      title: 'Skill',
      dataIndex: 'publishedSkillId',
      key: 'publishedSkillId',
      width: 130,
      render: (value: string | null | undefined) => (value ? <Text code>{value.slice(0, 8)}</Text> : <Text type="secondary">未发布</Text>),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={() => {
              setSelectedReleaseId(record.id);
              setSearchParams({ releaseId: record.id });
            }}
          >
            查看
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => navigate(`/admin/capability-studio?releaseId=${record.id}`)}
          >
            Studio
          </Button>
          {record.publishedSkillId ? (
            <Button
              type="link"
              size="small"
              onClick={() => navigate(`/published-skills/${record.publishedSkillId}?releaseId=${record.id}`)}
            >
              Skill
            </Button>
          ) : null}
          <Button
            type="link"
            size="small"
            onClick={() => navigate(`/admin/capability-releases?releaseId=${record.id}`)}
          >
            打开 Release
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Title level={4} style={{ margin: 0 }}>
          Release Center
        </Title>
        <Button icon={<ReloadOutlined />} onClick={() => releasesQuery.refetch()}>
          刷新
        </Button>
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="面向业务与交付的发布中心"
        description="这里聚合已经发布或已部署的能力版本，方便查看技能可用性、发布时间和最近一次部署状态。"
      />

      <Card style={{ marginBottom: 16 }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Input
            allowClear
            style={{ width: 320 }}
            placeholder="搜索能力名称 / Release ID / Skill ID"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Select
            style={{ width: 220 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: '全部状态', value: 'all' },
              { label: 'published', value: 'published' },
              { label: 'deployed', value: 'deployed' },
              { label: 'rolled_back', value: 'rolled_back' },
              { label: 'succeeded', value: 'succeeded' },
              { label: 'running', value: 'running' },
            ]}
          />
        </Space>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card>
            <Space>
              <RocketOutlined style={{ color: '#1677ff' }} />
              <Text>已进入发布中心</Text>
            </Space>
            <Title level={3} style={{ margin: '12px 0 0' }}>
              {releases.length}
            </Title>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Space>
              <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
              <Text>已发布 Skill</Text>
            </Space>
            <Title level={3} style={{ margin: '12px 0 0' }}>
              {publishedCount}
            </Title>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Space>
              <DeploymentUnitOutlined style={{ color: '#722ed1' }} />
              <Text>已部署版本</Text>
            </Space>
            <Title level={3} style={{ margin: '12px 0 0' }}>
              {deployedCount}
            </Title>
          </Card>
        </Col>
      </Row>

      <Card>
        {filteredReleases.length > 0 ? (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredReleases}
            loading={releasesQuery.isLoading}
            pagination={{ showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
          />
        ) : (
          <Empty description={releases.length > 0 ? '没有符合当前筛选条件的能力版本' : '当前还没有进入发布中心的能力版本'} />
        )}
      </Card>

      <Drawer
        title="发布详情"
        width={960}
        open={Boolean(selectedReleaseId)}
        onClose={() => {
          setSelectedReleaseId(null);
          setSearchParams({});
        }}
      >
        {selectedDetail ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message="发布流程操作建议"
              description={getReleaseActionHint(selectedDetail.release)}
            />

            <Card size="small" title="发布链路进度">
              <Steps
                size="small"
                {...getReleaseCurrentStep(selectedDetail.release)}
                items={[
                  { title: '源定义', description: '已同步' },
                  { title: '构建', description: '产出制品' },
                  { title: '校验', description: 'Sandbox 运行' },
                  { title: '草案', description: '生成 Skill' },
                  { title: '审批', description: '管理确认' },
                  { title: '发布', description: '注册能力' },
                  { title: '部署', description: '环境生效' },
                ]}
              />
            </Card>

            <Card size="small">
              <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
                <Descriptions bordered column={2} size="small" style={{ flex: 1 }}>
                <Descriptions.Item label="能力名称">
                  {selectedDetail.release.sourceName || '未命名能力'}
                </Descriptions.Item>
                <Descriptions.Item label="类型">
                  {selectedDetail.release.sourceType}
                </Descriptions.Item>
                <Descriptions.Item label="发布状态">
                  <Tag color={statusColor(selectedDetail.release.status)}>{selectedDetail.release.status}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="部署状态">
                  <Tag color={statusColor(selectedDetail.release.deploymentStatus)}>
                    {selectedDetail.release.deploymentStatus}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="已发布 Skill">
                  {selectedDetail.release.publishedSkillId || '无'}
                </Descriptions.Item>
                <Descriptions.Item label="当前 Build">
                  {selectedDetail.release.currentBuildId || '无'}
                </Descriptions.Item>
                <Descriptions.Item label="Smoke Test">
                  {latestSmokeValidation
                    ? `${latestSmokeValidation.success ? '通过' : '失败'} / ${latestSmokeValidation.score}`
                    : '暂无'}
                </Descriptions.Item>
                </Descriptions>
                <Button
                  type="primary"
                  onClick={() => navigate(`/admin/capability-releases?releaseId=${selectedDetail.release.id}`)}
                >
                  打开 Capability Release
                </Button>
              </Space>
            </Card>

            <Card size="small" title="发布动作">
              <Space wrap>
                <Button
                  onClick={() => approveMutation.mutate({ id: selectedDetail.release.id })}
                  loading={approveMutation.isLoading}
                  disabled={
                    selectedDetail.release.approvalStatus !== 'pending' &&
                    selectedDetail.release.status !== 'pending_approval'
                  }
                >
                  审批通过
                </Button>
                <Button
                  type="primary"
                  onClick={() => publishMutation.mutate({ id: selectedDetail.release.id })}
                  loading={publishMutation.isLoading}
                  disabled={
                    !selectedDetail.currentSkillDraft ||
                    selectedDetail.release.approvalStatus === 'pending' ||
                    selectedDetail.release.status === 'pending_approval' ||
                    selectedDetail.release.status === 'draft_ready'
                  }
                >
                  发布 Skill
                </Button>
                <Button
                  icon={<RocketOutlined />}
                  onClick={() => openDeployModal(selectedDetail.release.id)}
                  disabled={!selectedDetail.release.publishedSkillId || selectedDetail.release.status === 'deploying'}
                >
                  部署到环境
                </Button>
                <Button
                  danger
                  onClick={() => rollbackMutation.mutate({ id: selectedDetail.release.id })}
                  loading={rollbackMutation.isLoading}
                  disabled={
                    !selectedDetail.release.publishedSkillId &&
                    selectedDetail.release.deploymentStatus !== 'succeeded' &&
                    selectedDetail.release.status !== 'deployed'
                  }
                >
                  回滚
                </Button>
                <Button onClick={() => navigate(`/admin/capability-studio?releaseId=${selectedDetail.release.id}`)}>
                  打开 Studio
                </Button>
                {selectedDetail.release.currentBuildId ? (
                  <Button
                    onClick={() =>
                      navigate(
                        `/admin/capability-builds/${selectedDetail.release.currentBuildId}?releaseId=${selectedDetail.release.id}`,
                      )
                    }
                  >
                    查看 Build 详情
                  </Button>
                ) : null}
                {selectedDetail.release.currentBuildId && latestSmokeValidation ? (
                  <Button
                    onClick={() =>
                      navigate(
                        `/admin/capability-builds/${selectedDetail.release.currentBuildId}?releaseId=${selectedDetail.release.id}&validationId=${latestSmokeValidation.id}`,
                      )
                    }
                  >
                    查看验证详情
                  </Button>
                ) : null}
                {selectedDetail.release.publishedSkillId ? (
                  <Button
                    onClick={() =>
                      navigate(
                        `/published-skills/${selectedDetail.release.publishedSkillId}?releaseId=${selectedDetail.release.id}`,
                      )
                    }
                  >
                    查看 Published Skill
                  </Button>
                ) : null}
              </Space>
            </Card>

            <Row gutter={16}>
              <Col span={12}>
                <Card size="small" title="最近一次部署">
                  {latestDeployment ? (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Text>环境：{latestDeployment.environment}</Text>
                      <Text>运行时：{latestDeployment.runtimeType}</Text>
                      <Text>策略：{latestDeployment.reloadStrategy || '无'}</Text>
                      <Text>状态：{latestDeployment.status}</Text>
                      {latestSmokeValidation && (
                        <Text>
                          Smoke Test：{latestSmokeValidation.success ? '通过' : '失败'} / 分数 {latestSmokeValidation.score}
                        </Text>
                      )}
                      <pre style={{ margin: 0, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                        {latestDeployment.logs.join('\n') || '暂无日志'}
                      </pre>
                      {latestSmokeValidation && (
                        <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                          {latestSmokeValidation.logs.join('\n') || '暂无 smoke test 日志'}
                        </pre>
                      )}
                    </Space>
                  ) : (
                    <Text type="secondary">暂无部署记录</Text>
                  )}
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" title="当前 Skill 信息">
                  {selectedDetail.currentSkillDraft ? (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Text strong>{selectedDetail.currentSkillDraft.name}</Text>
                      <Text>{selectedDetail.currentSkillDraft.description}</Text>
                      <Text>触发词：{selectedDetail.currentSkillDraft.triggerKeywords.join(', ') || '无'}</Text>
                      <pre style={{ margin: 0, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(selectedDetail.currentSkillDraft.paramsSchema || {}, null, 2)}
                      </pre>
                    </Space>
                  ) : (
                    <Text type="secondary">暂无 Skill 草案信息</Text>
                  )}
                </Card>
              </Col>
            </Row>
          </Space>
        ) : (
          <Text type="secondary">正在加载...</Text>
        )}
      </Drawer>

      <Modal
        title="部署到环境"
        open={deployVisible}
        onCancel={() => setDeployVisible(false)}
        onOk={handleDeploy}
        okText="开始部署"
        confirmLoading={deployMutation.isLoading}
        okButtonProps={{
          disabled:
            !deployOverridesState.valid
            || (deployEnvironment === 'prod' && !hasSuccessfulStagingDeployment),
        }}
        width={760}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap style={{ width: '100%' }}>
            <Select
              style={{ width: 180 }}
              value={deployEnvironment}
              onChange={(value) => setDeployEnvironment(value as DeploymentEnvironment)}
              options={DEPLOY_ENV_OPTIONS}
            />
            <Select
              style={{ width: 220 }}
              value={deployStrategy}
              onChange={(value) =>
                setDeployStrategy(value as 'hot_reload' | 'rolling_restart' | 'full_restart')
              }
              options={[
                { label: 'hot_reload', value: 'hot_reload' },
                { label: 'rolling_restart', value: 'rolling_restart' },
                { label: 'full_restart', value: 'full_restart' },
              ]}
            />
          </Space>

          <Card size="small" title={`环境 Profile 预览: ${deployEnvironment}`}>
            <pre style={{ margin: 0, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(activeDeployProfile, null, 2)}
            </pre>
          </Card>
          <Alert
            type="info"
            showIcon
            message="推荐发布顺序"
            description="建议先发布到 staging 做最终验证，再晋升到 prod。"
          />
          {deployEnvironment === 'prod' ? (
            <Alert
              type="warning"
              showIcon
              message="当前为生产环境发布"
              description="生产建议 rolling_restart + 灰度放量，并保留回滚路径。"
            />
          ) : null}
          {deployEnvironment === 'prod' && !hasSuccessfulStagingDeployment ? (
            <Alert
              type="error"
              showIcon
              message="prod 发布门禁"
              description="当前 Release 尚无 staging 成功部署记录，不能直接发布到 prod。"
            />
          ) : null}

          <Input.TextArea
            rows={8}
            value={deployOverridesDraft}
            onChange={(event) => setDeployOverridesDraft(event.target.value)}
            placeholder='部署覆盖参数 JSON，例如 {"taskQueue":"SKILL_STAGING_QUEUE","workerReload":true}'
            spellCheck={false}
            style={{ fontFamily: 'monospace' }}
          />
          {!deployOverridesState.valid && (
            <Alert type="error" showIcon message={deployOverridesState.error} />
          )}
          <Text type="secondary">
            最终部署参数 = 当前环境 profile + 本次覆盖参数。profile 推荐放在
            `sourcePayload.deploymentProfiles` 下维护。
          </Text>
        </Space>
      </Modal>
    </div>
  );
};

export default ReleaseCenterPage;
