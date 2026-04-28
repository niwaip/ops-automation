import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, RocketOutlined } from '@ant-design/icons';
import { useQuery } from 'react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { capabilityReleaseApi, CapabilityRelease } from '../api/capability-release';
import { skillApi, SkillConfigDTO } from '../api/skill';

const { Title, Text } = Typography;

const statusColor = (status?: string) => {
  switch (status) {
    case 'published':
    case 'deployed':
      return 'green';
    case 'approved':
      return 'blue';
    case 'deploying':
      return 'processing';
    case 'rolled_back':
      return 'orange';
    default:
      return 'default';
  }
};

const PublishedSkillDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { skillId: skillIdFromPath } = useParams<{ skillId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchText, setSearchText] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(skillIdFromPath || null);

  const releasesQuery = useQuery(['published-skills'], capabilityReleaseApi.listReleaseCenter);
  const releases = releasesQuery.data?.releases || [];

  const publishedSkillItems = useMemo(() => {
    const map = new Map<
      string,
      {
        skillId: string;
        skillName: string;
        release: CapabilityRelease;
      }
    >();

    releases.forEach((release) => {
      if (!release.publishedSkillId) {
        return;
      }

      if (!map.has(release.publishedSkillId)) {
        map.set(release.publishedSkillId, {
          skillId: release.publishedSkillId,
          skillName: release.sourceName || release.sourceId || release.publishedSkillId,
          release,
        });
      }
    });

    return Array.from(map.values());
  }, [releases]);

  const selectedRelease =
    publishedSkillItems.find((item) => item.skillId === selectedSkillId)?.release ||
    (searchParams.get('releaseId')
      ? releases.find((item) => item.id === searchParams.get('releaseId'))
      : undefined);

  const skillDetailQuery = useQuery(
    ['published-skill-detail', selectedSkillId],
    () => skillApi.getById(selectedSkillId as string),
    { enabled: Boolean(selectedSkillId) },
  );

  useEffect(() => {
    if (skillIdFromPath && skillIdFromPath !== selectedSkillId) {
      setSelectedSkillId(skillIdFromPath);
      return;
    }

    if (!skillIdFromPath && !selectedSkillId && publishedSkillItems.length > 0) {
      const nextSkillId = publishedSkillItems[0].skillId;
      setSelectedSkillId(nextSkillId);
      navigate(`/published-skills/${nextSkillId}`, { replace: true });
    }
  }, [skillIdFromPath, selectedSkillId, publishedSkillItems, navigate]);

  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) {
      return publishedSkillItems;
    }

    return publishedSkillItems.filter((item) => {
      return (
        item.skillId.toLowerCase().includes(keyword) ||
        item.skillName.toLowerCase().includes(keyword) ||
        item.release.status.toLowerCase().includes(keyword) ||
        String(item.release.sourceType).toLowerCase().includes(keyword)
      );
    });
  }, [publishedSkillItems, searchText]);

  const columns: ColumnsType<(typeof publishedSkillItems)[number]> = [
    {
      title: 'Skill',
      dataIndex: 'skillName',
      key: 'skillName',
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary" code>
            {record.skillId.slice(0, 8)}
          </Text>
        </Space>
      ),
    },
    {
      title: '发布状态',
      key: 'status',
      width: 120,
      render: (_, record) => <Tag color={statusColor(record.release.status)}>{record.release.status}</Tag>,
    },
    {
      title: '部署状态',
      key: 'deploymentStatus',
      width: 120,
      render: (_, record) => (
        <Tag color={statusColor(record.release.deploymentStatus)}>{record.release.deploymentStatus}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={() => {
              setSelectedSkillId(record.skillId);
              setSearchParams(record.release.id ? { releaseId: record.release.id } : {});
              navigate(`/published-skills/${record.skillId}`);
            }}
          >
            查看
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => navigate(`/admin/capability-releases?releaseId=${record.release.id}&mode=view`)}
          >
            发布详情
          </Button>
        </Space>
      ),
    },
  ];

  const selectedSkill = skillDetailQuery.data as SkillConfigDTO | undefined;

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Space direction="vertical" size={4}>
          <Title level={4} style={{ margin: 0 }}>
            Published Skills
          </Title>
          <Text type="secondary">
            查看已发布技能的当前配置、关联 release、部署状态和后续操作入口。
          </Text>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={() => releasesQuery.refetch()}>
          刷新
        </Button>
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="已发布 Skill 管理"
        description="这里聚合已经完成发布的 Skill，支持追溯关联 Release，并从当前 Skill 继续发起下一轮发布。"
      />

      <Row gutter={16} align="top">
        <Col span={9}>
          <Card>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Input
                allowClear
                placeholder="搜索 Skill / 状态 / 类型"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />

              {filteredItems.length > 0 ? (
                <Table
                  rowKey="skillId"
                  columns={columns}
                  dataSource={filteredItems}
                  loading={releasesQuery.isLoading}
                  pagination={{ pageSize: 8, showSizeChanger: false }}
                />
              ) : (
                <Empty description="暂无已发布 Skill" />
              )}
            </Space>
          </Card>
        </Col>

        <Col span={15}>
          {selectedSkillId ? (
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              {selectedRelease ? (
                <Card size="small" title="关联 Release">
                  <Descriptions bordered size="small" column={2}>
                    <Descriptions.Item label="能力名称">
                      {selectedRelease.sourceName || '未命名能力'}
                    </Descriptions.Item>
                    <Descriptions.Item label="能力类型">
                      {selectedRelease.sourceType}
                    </Descriptions.Item>
                    <Descriptions.Item label="发布状态">
                      <Tag color={statusColor(selectedRelease.status)}>{selectedRelease.status}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="部署状态">
                      <Tag color={statusColor(selectedRelease.deploymentStatus)}>
                        {selectedRelease.deploymentStatus}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Release ID">
                      <Text code>{selectedRelease.id}</Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="更新时间">
                      {new Date(selectedRelease.updatedAt).toLocaleString()}
                    </Descriptions.Item>
                  </Descriptions>
                  <Space wrap style={{ marginTop: 12 }}>
                    <Button onClick={() => navigate(`/admin/capability-releases?releaseId=${selectedRelease.id}&mode=view`)}>
                      打开发布详情
                    </Button>
                    <Button onClick={() => navigate(`/admin/capability-releases?releaseId=${selectedRelease.id}`)}>
                      打开 Capability Release
                    </Button>
                    {selectedRelease.currentBuildId ? (
                      <Button
                        onClick={() =>
                          navigate(
                            `/admin/capability-builds/${selectedRelease.currentBuildId}?releaseId=${selectedRelease.id}`,
                          )
                        }
                      >
                        打开 Build Detail
                      </Button>
                    ) : null}
                    <Button
                      type="primary"
                      icon={<RocketOutlined />}
                      onClick={() => navigate(`/admin/capability-studio?releaseId=${selectedRelease.id}`)}
                    >
                      发起下一轮 Release
                    </Button>
                  </Space>
                </Card>
              ) : null}

              <Card size="small" title="Skill 详情" loading={skillDetailQuery.isLoading}>
                {selectedSkill ? (
                  <Space direction="vertical" size="large" style={{ width: '100%' }}>
                    <Descriptions bordered size="small" column={2}>
                      <Descriptions.Item label="Skill ID">{selectedSkill.id}</Descriptions.Item>
                      <Descriptions.Item label="状态">
                        <Tag color={selectedSkill.isActive ? 'green' : 'red'}>
                          {selectedSkill.isActive ? 'active' : 'inactive'}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="名称">{selectedSkill.name}</Descriptions.Item>
                      <Descriptions.Item label="描述">{selectedSkill.description}</Descriptions.Item>
                      <Descriptions.Item label="关联 Flow Template" span={2}>
                        <Space wrap>
                          {(selectedSkill.executionFlowTemplateIds || []).length > 0 ? (
                            selectedSkill.executionFlowTemplateIds.map((item) => <Tag key={item}>{item}</Tag>)
                          ) : (
                            <Text type="secondary">无</Text>
                          )}
                        </Space>
                      </Descriptions.Item>
                      <Descriptions.Item label="Tools" span={2}>
                        <Space wrap>
                          {(selectedSkill.tools || []).length > 0 ? (
                            selectedSkill.tools.map((item) => <Tag key={item} color="purple">{item}</Tag>)
                          ) : (
                            <Text type="secondary">无</Text>
                          )}
                        </Space>
                      </Descriptions.Item>
                      <Descriptions.Item label="触发词" span={2}>
                        <Space wrap>
                          {(selectedSkill.triggerKeywords || []).length > 0 ? (
                            selectedSkill.triggerKeywords.map((item) => <Tag key={item} color="orange">{item}</Tag>)
                          ) : (
                            <Text type="secondary">无</Text>
                          )}
                        </Space>
                      </Descriptions.Item>
                    </Descriptions>

                    <Card size="small" type="inner" title="参数 Schema">
                      <pre style={{ margin: 0, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(selectedSkill.paramsSchema || {}, null, 2)}
                      </pre>
                    </Card>

                    <Card size="small" type="inner" title="API Endpoints">
                      <pre style={{ margin: 0, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(selectedSkill.apiEndpoints || {}, null, 2)}
                      </pre>
                    </Card>
                  </Space>
                ) : (
                  <Empty description="未找到该 Skill，或当前账号无访问权限" />
                )}
              </Card>
            </Space>
          ) : (
            <Card>
              <Empty description="请选择一个已发布 Skill 查看详情" />
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default PublishedSkillDetailPage;
