import { PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Space, Table, Tag, Typography } from 'antd';
import { useMemo } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import type { SkillConfig } from '@ops/user-core';
import { skillApi } from '../../../api';

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

export function PublishedSkillListPage() {
  const navigate = useNavigate();
  const { data, isLoading, isFetching, refetch } = useQuery(
    ['user-web-published-skills-list'],
    () => skillApi.list()
  );

  const skills = useMemo(
    () =>
      (data?.skills || [])
        .filter((skill) => skill.isPublished)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [data?.skills]
  );

  return (
    <Card>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            已发布技能
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            面向普通用户只展示可执行的公开技能，不展示管理员配置、调试和 Prompt 细节。
          </Typography.Paragraph>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void refetch()} loading={isFetching}>
          刷新
        </Button>
      </Space>
      <Table<SkillConfig>
        rowKey="id"
        loading={isLoading}
        dataSource={skills}
        pagination={false}
        columns={[
          {
            title: '技能',
            dataIndex: 'name',
            key: 'name',
            render: (value: string, record) => (
              <Space direction="vertical" size={2}>
                <Typography.Text strong>{value}</Typography.Text>
                <Typography.Text type="secondary">
                  {record.description || '暂无说明'}
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: '来源',
            dataIndex: 'publishedSourceType',
            key: 'publishedSourceType',
            render: (value?: string | null) => <Tag>{value || 'published'}</Tag>,
          },
          {
            title: '部署状态',
            dataIndex: 'publishedDeploymentStatus',
            key: 'publishedDeploymentStatus',
            render: (value?: string | null) => (
              <Tag color={deploymentColor(value)}>{value || 'unknown'}</Tag>
            ),
          },
          {
            title: '操作',
            key: 'actions',
            render: (_, record) => (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => navigate(`/executions/new?skillId=${record.id}`)}
              >
                发起执行
              </Button>
            ),
          },
        ]}
      />
    </Card>
  );
}
