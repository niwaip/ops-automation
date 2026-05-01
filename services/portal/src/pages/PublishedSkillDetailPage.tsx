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
import { capabilityReleaseApi } from '../api/capability-release';
import { skillApi } from '../api/skill';

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

  const releasesQuery = useQuery(['published-skills'], capabilityReleaseApi.listReleaseCenter);
  const skillsQuery = useQuery(['authorized-skills'], skillApi.list);
  const skills = skillsQuery.data?.skills || [];

  const publishedSkillItems = useMemo(() => {
    return skills
      .filter((skill) => skill.isPublished)
      .map((skill) => ({
        skillId: skill.id,
        skillName: skill.name,
        skillDescription: skill.description,
        publishedSourceType: skill.publishedSourceType,
        publishedReleaseId: skill.publishedReleaseId,
        publishedReleaseVersion: skill.publishedReleaseVersion,
        publishedReleaseStatus: skill.publishedReleaseStatus,
        publishedDeploymentStatus: skill.publishedDeploymentStatus,
        skill,
      }));
  }, [skills]);

  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) {
      return publishedSkillItems;
    }

    return publishedSkillItems.filter((item) => {
      return (
        item.skillId.toLowerCase().includes(keyword) ||
        item.skillName.toLowerCase().includes(keyword) ||
        item.skillDescription.toLowerCase().includes(keyword) ||
        String(item.publishedReleaseStatus || '').toLowerCase().includes(keyword) ||
        String(item.publishedDeploymentStatus || '').toLowerCase().includes(keyword) ||
        String(item.publishedSourceType || '').toLowerCase().includes(keyword)
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
      render: (_, record) => (
        <Tag color={statusColor(record.publishedReleaseStatus || undefined)}>
          {record.publishedReleaseStatus || 'published'}
        </Tag>
      ),
    },
    {
      title: '部署状态',
      key: 'deploymentStatus',
      width: 120,
      render: (_, record) => (
        <Tag color={statusColor(record.publishedDeploymentStatus || undefined)}>
          {record.publishedDeploymentStatus || '未部署'}
        </Tag>
      ),
    },
    {
      title: '来源',
      key: 'sourceType',
      width: 140,
      render: (_, record) => (
        <Tag>{record.publishedSourceType || '未知'}</Tag>
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
            disabled={!record.publishedReleaseId}
            onClick={() => record.publishedReleaseId && navigate(`/admin/capability-releases?releaseId=${record.publishedReleaseId}&mode=view`)}
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
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              releasesQuery.refetch();
              skillsQuery.refetch();
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
        message="公开 Skill 管理"
        description="当前页直接展示已公开的 Skill 对象本身，并补充其关联 Release / 部署状态；对象口径与“系统 Skills”页保持一致。"
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
