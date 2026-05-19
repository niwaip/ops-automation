import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Input,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  InfoCircleOutlined,
  ReloadOutlined,
  RocketOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { capabilityReleaseApi } from '@/api/capabilities';
import { skillApi } from '@/api/skill';
import { ListSectionHeader } from '@/components/page/PageScaffold';
import SkillAdminPage from '@/features/admin/skills/pages/SkillAdminPage';

const { Text } = Typography;

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
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const releasesQuery = useQuery(['published-skills'], capabilityReleaseApi.listReleaseCenter);
  const skillsQuery = useQuery(['authorized-skills'], skillApi.list);
  const skills = skillsQuery.data?.skills || [];

  const handleOpenDetail = (skillId: string) => {
    setSelectedSkillId(skillId);
    setDrawerVisible(true);
  };

  const publishedSkillItems = useMemo(() => (
    skills
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
      }))
  ), [skills]);

  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) {
      return publishedSkillItems;
    }

    return publishedSkillItems.filter((item) => (
      item.skillId.toLowerCase().includes(keyword)
      || item.skillName.toLowerCase().includes(keyword)
      || item.skillDescription.toLowerCase().includes(keyword)
      || String(item.publishedReleaseStatus || '').toLowerCase().includes(keyword)
      || String(item.publishedDeploymentStatus || '').toLowerCase().includes(keyword)
      || String(item.publishedSourceType || '').toLowerCase().includes(keyword)
    ));
  }, [publishedSkillItems, searchText]);

  const stats = {
    total: publishedSkillItems.length,
    deployed: publishedSkillItems.filter((item) => item.publishedDeploymentStatus === 'deployed' || item.publishedDeploymentStatus === 'succeeded').length,
    temporal: publishedSkillItems.filter((item) => item.publishedSourceType === 'temporal_workflow').length,
    template: publishedSkillItems.filter((item) => item.publishedSourceType === 'execution_flow_template').length,
  };

  const skillOverviewStats = [
    {
      key: 'total',
      label: '公开 Skills 总数',
      value: stats.total,
      color: 'var(--text-primary)',
      icon: <RocketOutlined style={{ color: '#1677ff' }} />,
    },
    {
      key: 'deployed',
      label: '已部署版本',
      value: stats.deployed,
      color: 'var(--success-color)',
      icon: <ThunderboltOutlined style={{ color: '#52c41a' }} />,
    },
    {
      key: 'temporal',
      label: '编排型能力',
      value: stats.temporal,
      color: 'var(--warning-color)',
      icon: <RocketOutlined style={{ color: '#722ed1' }} />,
    },
    {
      key: 'template',
      label: '模版型能力',
      value: stats.template,
      color: 'var(--info-color)',
      icon: <SearchOutlined style={{ color: 'var(--info-color)' }} />,
    },
  ];

  const columns: ColumnsType<(typeof publishedSkillItems)[number]> = [
    {
      title: <div style={{ textAlign: 'center' }}>Skill 名称</div>,
      dataIndex: 'skillName',
      key: 'skillName',
      width: 220,
      align: 'center',
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary" code style={{ fontSize: 11 }}>
            {record.skillId.slice(0, 8)}
          </Text>
        </Space>
      ),
    },
    {
      title: <div style={{ textAlign: 'center' }}>技能说明</div>,
      dataIndex: 'skillDescription',
      key: 'skillDescription',
      width: 320,
      align: 'center',
      render: (value: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {value || '暂无说明'}
        </Text>
      ),
    },
    {
      title: <div style={{ textAlign: 'center' }}>发布状态</div>,
      key: 'status',
      width: 120,
      align: 'center',
      render: (_, record) => (
        <Tag color={statusColor(record.publishedReleaseStatus || undefined)} style={{ marginRight: 0 }}>
          {record.publishedReleaseStatus || 'published'}
        </Tag>
      ),
    },
    {
      title: <div style={{ textAlign: 'center' }}>操作</div>,
      key: 'actions',
      width: 150,
      align: 'center',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={() => navigate(`/executions/new?skillId=${record.skillId}`)}
          >
            发起执行
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => handleOpenDetail(record.skillId)}
          >
            详情
          </Button>
        </Space>
      ),
    },
  ];

  const selectedSkillForDrawer = useMemo(
    () => skills.find((skill) => skill.id === selectedSkillId),
    [skills, selectedSkillId]
  );

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {skillOverviewStats.map((item) => (
          <Card
            key={item.key}
            size="small"
            style={{ borderRadius: 14, border: '1px solid var(--bg-secondary)', boxShadow: 'var(--shadow-md)' }}
            styles={{ body: { padding: '12px 16px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Space size={10} align="center">
                <span style={{ display: 'inline-flex', fontSize: 16 }}>{item.icon}</span>
                <Text type="secondary" style={{ fontSize: 13 }}>{item.label}</Text>
              </Space>
              <Text style={{ fontSize: 24, fontWeight: 700, color: item.color, lineHeight: 1 }}>
                {item.value}
              </Text>
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ borderRadius: 16, border: '1px solid var(--bg-secondary)', boxShadow: 'var(--shadow-md)' }}>
        <ListSectionHeader
          title={(
            <Space wrap size={12}>
              <Text strong style={{ fontSize: 16 }}>公开 Skills 列表</Text>
              <Input
                size="large"
                placeholder="搜索 Skill / 说明 / 状态 / 类型"
                prefix={<SearchOutlined />}
                variant="borderless"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                allowClear
                style={{
                  width: 360,
                  height: 44,
                  background: 'var(--bg-secondary)',
                  borderRadius: 12,
                }}
              />
              <Tooltip title="这里展示已公开发布、可被执行的 Skill 对象，可查看其 Release 溯源与最新部署状态。">
                <InfoCircleOutlined style={{ color: 'var(--text-secondary)', fontSize: 14, cursor: 'help' }} />
              </Tooltip>
            </Space>
          )}
          extra={(
            <Space wrap size={12}>
              <Text type="secondary">当前显示 {filteredItems.length} 条</Text>
              <Button
                size="large"
                icon={<ReloadOutlined />}
                onClick={() => {
                  void releasesQuery.refetch();
                  void skillsQuery.refetch();
                }}
                className="btn-pill"
              >
                刷新
              </Button>
            </Space>
          )}
        />
        <Table
          rowKey="skillId"
          columns={columns}
          dataSource={filteredItems}
          loading={releasesQuery.isLoading || skillsQuery.isLoading}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        />
      </Card>

      <Drawer
        title={(
          <Space>
            <RocketOutlined style={{ color: 'var(--primary-color)' }} />
            <span>技能配置详情</span>
            {selectedSkillForDrawer && (
              <Tag color="blue">{selectedSkillForDrawer.name}</Tag>
            )}
          </Space>
        )}
        placement="right"
        width={800}
        onClose={() => {
          setDrawerVisible(false);
          setSelectedSkillId(null);
        }}
        open={drawerVisible}
        styles={{ body: { padding: 0 } }}
        extra={(
          <Space>
            {selectedSkillForDrawer?.publishedReleaseId && (
              <Button
                icon={<InfoCircleOutlined />}
                onClick={() => navigate(`/admin/capabilities?releaseId=${selectedSkillForDrawer.publishedReleaseId}&mode=view`)}
              >
                发布溯源
              </Button>
            )}
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={() => navigate(`/executions/new?skillId=${selectedSkillId}`)}
            >
              立即执行
            </Button>
          </Space>
        )}
      >
        {selectedSkillId && (
          <div className="skill-drawer-content">
            <SkillAdminPage embedded initialSkillId={selectedSkillId} />
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default PublishedSkillDetailPage;
