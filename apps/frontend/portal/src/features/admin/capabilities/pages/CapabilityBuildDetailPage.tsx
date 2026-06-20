import React, { useMemo } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LeftOutlined, ReloadOutlined, RocketOutlined } from '@ant-design/icons';
import { useQuery } from 'react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CapabilityValidation, capabilityReleaseApi } from '@/api/capabilities';

const { Title, Text } = Typography;

const codeBlockStyle: React.CSSProperties = {
  margin: 0,
  maxHeight: 320,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
};

const statusColor = (status?: string) => {
  switch (status) {
    case 'succeeded':
    case 'approved':
    case 'published':
    case 'deployed':
      return 'green';
    case 'failed':
    case 'build_failed':
    case 'validation_failed':
    case 'deploy_failed':
      return 'red';
    case 'running':
    case 'building':
    case 'validating':
    case 'deploying':
      return 'processing';
    case 'pending_approval':
      return 'gold';
    default:
      return 'default';
  }
};

const sortByCreatedAtDesc = <T extends { createdAt: string }>(items: T[]) =>
  [...items].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );

const CapabilityBuildDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { buildId } = useParams<{ buildId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const releaseIdFromQuery = searchParams.get('releaseId');
  const validationIdFromQuery = searchParams.get('validationId');

  const releasesQuery = useQuery(['capabilities'], capabilityReleaseApi.list);

  const resolvedReleaseId = useMemo(() => {
    if (releaseIdFromQuery) {
      return releaseIdFromQuery;
    }

    if (!buildId) {
      return null;
    }

    const matchedRelease = (releasesQuery.data?.releases || []).find((release) => {
      return (
        release.currentBuildId === buildId ||
        release.latestSuccessfulBuildId === buildId ||
        release.latestValidationId === validationIdFromQuery ||
        release.latestSuccessfulValidationId === validationIdFromQuery
      );
    });

    return matchedRelease?.id || null;
  }, [buildId, releaseIdFromQuery, releasesQuery.data?.releases, validationIdFromQuery]);

  const detailQuery = useQuery(
    ['capability-build-detail', resolvedReleaseId],
    () => capabilityReleaseApi.getById(resolvedReleaseId as string),
    { enabled: Boolean(resolvedReleaseId) }
  );

  const detail = detailQuery.data?.release;
  const build = useMemo(
    () => detail?.builds.find((item) => item.id === buildId),
    [buildId, detail?.builds]
  );
  const relatedValidations = useMemo(
    () =>
      sortByCreatedAtDesc((detail?.validations || []).filter((item) => item.buildId === build?.id)),
    [build?.id, detail?.validations]
  );
  const selectedValidation =
    relatedValidations.find((item) => item.id === validationIdFromQuery) ||
    relatedValidations[0] ||
    null;
  const currentSnapshot =
    detail?.sourceSnapshots?.find((item) => item.id === build?.sourceSnapshotId) ||
    detail?.currentSourceSnapshot ||
    null;

  const updateSelection = (validationId?: string | null) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (resolvedReleaseId) {
      nextSearchParams.set('releaseId', resolvedReleaseId);
    }
    if (validationId) {
      nextSearchParams.set('validationId', validationId);
    } else {
      nextSearchParams.delete('validationId');
    }
    setSearchParams(nextSearchParams);
  };

  const validationColumns: ColumnsType<CapabilityValidation> = [
    {
      title: '验证类型',
      dataIndex: 'validationType',
      key: 'validationType',
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary" code>
            {record.id.slice(0, 8)}
          </Text>
        </Space>
      ),
    },
    {
      title: '结果',
      key: 'success',
      width: 120,
      render: (_, record) => (
        <Tag color={record.success ? 'green' : 'red'}>{record.success ? '通过' : '失败'}</Tag>
      ),
    },
    {
      title: '分数',
      dataIndex: 'score',
      key: 'score',
      width: 100,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => updateSelection(record.id)}>
          查看
        </Button>
      ),
    },
  ];

  if (!buildId) {
    return (
      <Card>
        <Empty description="缺少 buildId，无法打开构建详情" />
      </Card>
    );
  }

  const isLocatingRelease = !resolvedReleaseId && releasesQuery.isLoading;
  const isLoading = isLocatingRelease || detailQuery.isLoading;

  return (
    <div>
      <Space
        style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
        align="start"
        wrap
      >
        <Space direction="vertical" size={4}>
          <Title level={4} style={{ margin: 0 }}>
            Capability Build Detail
          </Title>
          <Text type="secondary">
            独立查看单次构建产物、关联快照、相关验证记录，以及跳转回 Studio 和 Release Center。
          </Text>
        </Space>
        <Space wrap>
          <Button
            icon={<LeftOutlined />}
            onClick={() =>
              resolvedReleaseId
                ? navigate(
                    `/admin/capabilities?releaseId=${resolvedReleaseId}&mode=view&tab=studio`
                  )
                : navigate('/admin/capabilities')
            }
          >
            返回设计详情
          </Button>
          <Button
            onClick={() =>
              resolvedReleaseId
                ? navigate(`/admin/capabilities?releaseId=${resolvedReleaseId}`)
                : navigate('/admin/capabilities')
            }
          >
            打开 Release
          </Button>
          <Button
            icon={<RocketOutlined />}
            disabled={!resolvedReleaseId}
            onClick={() =>
              resolvedReleaseId
                ? navigate(`/admin/capabilities?releaseId=${resolvedReleaseId}&mode=view`)
                : undefined
            }
          >
            打开发布详情
          </Button>
          <Button
            disabled={!detail?.release.publishedSkillId}
            onClick={() =>
              detail?.release.publishedSkillId
                ? navigate(
                    `/published-skills/${detail.release.publishedSkillId}?releaseId=${detail.release.id}`
                  )
                : undefined
            }
          >
            查看 Published Skill
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void releasesQuery.refetch();
              if (resolvedReleaseId) {
                void detailQuery.refetch();
              }
            }}
          >
            刷新
          </Button>
        </Space>
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Build 详情页已独立"
        description="支持按 buildId 直达；若未显式传 releaseId，会先从 Release 列表自动定位所属版本。"
      />

      {isLoading ? (
        <Card loading />
      ) : !resolvedReleaseId ? (
        <Card>
          <Empty description="未能定位到该 Build 所属的 Release" />
        </Card>
      ) : !detail ? (
        <Card>
          <Empty description="未能加载 Release 详情" />
        </Card>
      ) : !build ? (
        <Card>
          <Empty description="当前 Release 下未找到该 Build" />
        </Card>
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card size="small">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="能力名称">
                {detail.release.sourceName || detail.release.sourceId || '未命名能力'}
              </Descriptions.Item>
              <Descriptions.Item label="Release ID">
                <Text code>{detail.release.id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Build ID">
                <Text code>{build.id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="构建状态">
                <Tag color={statusColor(build.status)}>{build.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="构建类型">{build.buildType}</Descriptions.Item>
              <Descriptions.Item label="模型">{build.modelId || '未记录'}</Descriptions.Item>
              <Descriptions.Item label="关联快照">
                {currentSnapshot ? `v${currentSnapshot.snapshotVersion}` : build.sourceSnapshotId}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {new Date(build.createdAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Release 状态">
                <Tag color={statusColor(detail.release.status)}>{detail.release.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="部署状态">
                <Tag color={statusColor(detail.release.deploymentStatus)}>
                  {detail.release.deploymentStatus}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
            {build.errorSummary ? (
              <Alert
                type="error"
                showIcon
                style={{ marginTop: 12 }}
                message="构建报错摘要"
                description={build.errorSummary}
              />
            ) : null}
            {build.diffSummary ? (
              <Alert
                type="success"
                showIcon
                style={{ marginTop: 12 }}
                message="Diff Summary"
                description={build.diffSummary}
              />
            ) : null}
          </Card>

          <Row gutter={16} align="top">
            <Col span={12}>
              <Card size="small" title="输入快照">
                <pre style={codeBlockStyle}>
                  {JSON.stringify(build.inputSnapshot || {}, null, 2)}
                </pre>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title="Source Snapshot">
                <pre style={codeBlockStyle}>
                  {JSON.stringify(currentSnapshot?.sourcePayload || {}, null, 2)}
                </pre>
              </Card>
            </Col>
          </Row>

          <Row gutter={16} align="top">
            <Col span={12}>
              <Card size="small" title="Generated Config">
                <pre style={codeBlockStyle}>
                  {JSON.stringify(build.generatedConfig || {}, null, 2)}
                </pre>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title="Generated Code">
                <pre style={codeBlockStyle}>{build.generatedCode || '当前没有生成代码产物'}</pre>
              </Card>
            </Col>
          </Row>

          <Card size="small" title="构建日志">
            <pre style={{ ...codeBlockStyle, maxHeight: 420 }}>
              {build.logs.join('\n') || '暂无日志'}
            </pre>
          </Card>

          <Card size="small" title="关联验证记录">
            {relatedValidations.length > 0 ? (
              <Table
                rowKey="id"
                columns={validationColumns}
                dataSource={relatedValidations}
                rowSelection={{
                  type: 'radio',
                  selectedRowKeys: selectedValidation ? [selectedValidation.id] : [],
                  onChange: (selectedRowKeys) => {
                    const nextValidationId =
                      selectedRowKeys.length > 0 ? String(selectedRowKeys[0]) : null;
                    updateSelection(nextValidationId);
                  },
                }}
                onRow={(record) => ({
                  onClick: () => updateSelection(record.id),
                })}
                pagination={false}
              />
            ) : (
              <Empty description="当前 Build 还没有关联验证记录" />
            )}
          </Card>

          <Card
            size="small"
            title={
              selectedValidation ? `验证详情 · ${selectedValidation.validationType}` : '验证详情'
            }
            extra={
              selectedValidation ? (
                <Button size="small" onClick={() => updateSelection(null)}>
                  清除选择
                </Button>
              ) : null
            }
          >
            {selectedValidation ? (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="Validation ID">
                    <Text code>{selectedValidation.id}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="结果">
                    <Tag color={selectedValidation.success ? 'green' : 'red'}>
                      {selectedValidation.success ? '通过' : '失败'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="类型">
                    {selectedValidation.validationType}
                  </Descriptions.Item>
                  <Descriptions.Item label="分数">{selectedValidation.score}</Descriptions.Item>
                  <Descriptions.Item label="创建时间">
                    {new Date(selectedValidation.createdAt).toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item label="关联 Build">
                    <Text code>{selectedValidation.buildId}</Text>
                  </Descriptions.Item>
                </Descriptions>
                {selectedValidation.errorSummary ? (
                  <Alert
                    type="error"
                    showIcon
                    message="验证报错摘要"
                    description={selectedValidation.errorSummary}
                  />
                ) : null}
                <Row gutter={16} align="top">
                  <Col span={12}>
                    <Card size="small" type="inner" title="验证输入">
                      <pre style={codeBlockStyle}>
                        {JSON.stringify(selectedValidation.inputSnapshot || {}, null, 2)}
                      </pre>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" type="inner" title="验证结果">
                      <pre style={codeBlockStyle}>
                        {JSON.stringify(selectedValidation.resultSnapshot || {}, null, 2)}
                      </pre>
                    </Card>
                  </Col>
                </Row>
                <Card size="small" type="inner" title="验证日志">
                  <pre style={{ ...codeBlockStyle, maxHeight: 320 }}>
                    {selectedValidation.logs.join('\n') || '暂无日志'}
                  </pre>
                </Card>
              </Space>
            ) : (
              <Empty description="请选择一条验证记录查看详情" />
            )}
          </Card>
        </Space>
      )}
    </div>
  );
};

export default CapabilityBuildDetailPage;
