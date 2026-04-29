import React, { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { capabilityReleaseApi, CapabilityRelease } from '../api/capability-release';
import { skillApi } from '../api/skill';
import { useAuthStore } from '../store/authStore';

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
  const [searchText, setSearchText] = useState('');
  const { user } = useAuthStore();

  const releasesQuery = useQuery(['published-skills'], capabilityReleaseApi.listReleaseCenter);
  const skillsQuery = useQuery(['authorized-skills'], skillApi.list);
  const releases = releasesQuery.data?.releases || [];
  const authorizedSkills = skillsQuery.data?.skills || [];
  const authorizedSkillIds = useMemo(
    () => new Set(authorizedSkills.map((skill) => skill.id)),
    [authorizedSkills],
  );
  const authorizedSkillMap = useMemo(
    () => new Map(authorizedSkills.map((skill) => [skill.id, skill])),
    [authorizedSkills],
  );

  const publishedSkillItems = useMemo(() => {
    const map = new Map<
      string,
      {
        skillId: string;
        skillName: string;
        skillDescription: string;
        release: CapabilityRelease;
      }
    >();

    releases.forEach((release) => {
      if (!release.publishedSkillId) {
        return;
      }
      if (user?.role !== 'admin' && !authorizedSkillIds.has(release.publishedSkillId)) {
        return;
      }

      const sourceKey = [
        release.sourceType,
        release.sourceId || release.sourceName || release.publishedSkillId,
      ].join('::');
      const current = map.get(sourceKey);
      const currentVersion = current?.release.releaseVersion || 0;
      const nextVersion = release.releaseVersion || 0;
      const shouldReplace =
        !current ||
        nextVersion > currentVersion ||
        (
          nextVersion === currentVersion &&
          new Date(release.updatedAt).getTime() > new Date(current.release.updatedAt).getTime()
        );

      if (shouldReplace) {
        const skillMeta = authorizedSkillMap.get(release.publishedSkillId);
        map.set(sourceKey, {
          skillId: release.publishedSkillId,
          skillName: skillMeta?.name || release.sourceName || release.sourceId || release.publishedSkillId,
          skillDescription: skillMeta?.description || '',
          release,
        });
      }
    });

    return Array.from(map.values());
  }, [authorizedSkillIds, authorizedSkillMap, releases, user?.role]);

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
          {record.skillDescription ? (
            <Text type="secondary">
              {record.skillDescription}
            </Text>
          ) : null}
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
            onClick={() => navigate(`/published-skills/${record.skillId}`)}
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

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Space direction="vertical" size={4}>
          <Title level={4} style={{ margin: 0 }}>
            公开 Skills
          </Title>
          <Text type="secondary">
            这里只展示已公开发布、可被执行的 Skill 对象，并可继续查看其 Release 与部署状态。
          </Text>
        </Space>
        <Space>
          <Button onClick={() => navigate('/admin/skills')}>
            系统 Skills
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => releasesQuery.refetch()}>
            刷新
          </Button>
        </Space>
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="公开 Skill 管理"
        description="一览仅展示已公开可执行的 Skill，并包含 Skill 说明。系统定义请到“系统 Skills”页维护。"
      />
      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Input
            allowClear
            placeholder="搜索 Skill / 说明 / 状态 / 类型"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />

          {filteredItems.length > 0 ? (
            <Table
              rowKey="skillId"
              columns={columns}
              dataSource={filteredItems}
              loading={releasesQuery.isLoading || skillsQuery.isLoading}
              pagination={{ pageSize: 10, showSizeChanger: false }}
            />
          ) : (
            <Empty description="暂无已发布 Skill" />
          )}
        </Space>
      </Card>
    </div>
  );
};

export default PublishedSkillDetailPage;
