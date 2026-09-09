import {
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  BarsOutlined,
  FileTextOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import React, { useMemo, useState } from 'react';
import type { HabitCandidate } from '@/api/habitLearning';
import {
  formatHabitStatus,
  formatRiskLevel,
  HabitCandidateCard,
} from './HabitCandidateCard';
import { HabitDetailModal } from './HabitDetailModal';

export { formatHabitStatus, formatRiskLevel };

const { Text } = Typography;

interface Props {
  candidates: HabitCandidate[];
  loading: boolean;
  actingId?: string;
  onAction: (candidate: HabitCandidate, action: 'hold' | 'reject' | 'rollback') => void;
}

export const HabitCandidatesPanel: React.FC<Props> = ({
  candidates,
  loading,
  actingId,
  onAction,
}) => {
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [detailCandidate, setDetailCandidate] = useState<HabitCandidate | null>(null);

  // 筛选过滤
  const filtered = useMemo(() => {
    return candidates.filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.workflowName?.toLowerCase().includes(q);
        const matchesIntent = item.intentKey?.toLowerCase().includes(q);
        const matchesUser = item.userKey?.toLowerCase().includes(q);
        if (!matchesName && !matchesIntent && !matchesUser) return false;
      }
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (riskFilter !== 'all' && item.riskLevel !== riskFilter) return false;
      return true;
    });
  }, [candidates, searchQuery, statusFilter, riskFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部工具栏：筛选、搜索与视图切换 */}
      <Card
        size="small"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
        }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col xs={24} sm={16} md={18}>
            <Space wrap size="middle">
              <Input
                placeholder="搜索工作流名称 / 触发意图 / 用户"
                prefix={<SearchOutlined style={{ color: 'var(--text-light)' }} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                allowClear
                style={{ width: 260 }}
              />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 140 }}
                options={[
                  { label: '全部状态', value: 'all' },
                  { label: '🟢 已生效', value: 'active' },
                  { label: '⏳ 待生效候选', value: 'candidate' },
                  { label: '⏸️ 已挂起', value: 'held' },
                  { label: '👁️ 观察期', value: 'shadow' },
                ]}
              />
              <Select
                value={riskFilter}
                onChange={setRiskFilter}
                style={{ width: 150 }}
                options={[
                  { label: '全部风险等级', value: 'all' },
                  { label: '⚠️ 外部写操作/提交', value: 'external_commit' },
                  { label: '🛡️ 纯只读查询', value: 'read' },
                ]}
              />
              <Text type="secondary" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                共 <b>{filtered.length}</b> 个习惯
              </Text>
            </Space>
          </Col>
          <Col xs={24} sm={8} md={6} style={{ textAlign: 'right' }}>
            <Segmented
              value={viewMode}
              onChange={(val) => setViewMode(val as 'card' | 'table')}
              options={[
                { label: '卡片视图', value: 'card', icon: <AppstoreOutlined /> },
                { label: '表格视图', value: 'table', icon: <BarsOutlined /> },
              ]}
            />
          </Col>
        </Row>
      </Card>

      {/* 视图主体 */}
      {filtered.length === 0 ? (
        <Card
          size="small"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          <Empty description="暂无符合条件的习惯候选" />
        </Card>
      ) : viewMode === 'card' ? (
        /* ===== 卡片视图 (重点突出、主次分明) ===== */
        <Row gutter={[16, 16]}>
          {filtered.map((item) => (
            <Col xs={24} sm={24} md={12} xl={8} key={item.id}>
              <HabitCandidateCard
                candidate={item}
                actingId={actingId}
                onAction={onAction}
                onViewDetail={setDetailCandidate}
              />
            </Col>
          ))}
        </Row>
      ) : (
        /* ===== 表格视图 (备选精简模式) ===== */
        <Card
          size="small"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          <Table
            rowKey="id"
            loading={loading}
            dataSource={filtered}
            pagination={{ pageSize: 15 }}
            columns={[
              {
                title: '工作流名称',
                dataIndex: 'workflowName',
                render: (val, row) => (
                  <div>
                    <Text strong style={{ color: 'var(--text-primary)' }}>
                      {val || row.intentKey || '-'}
                    </Text>
                    {row.savedVersion && <Tag style={{ marginLeft: 6 }}>v{row.savedVersion}</Tag>}
                  </div>
                ),
              },
              {
                title: '触发口令 (intentKey)',
                dataIndex: 'intentKey',
                render: (key) => <Tag color="geekblue">{key || '-'}</Tag>,
              },
              {
                title: '风险等级',
                dataIndex: 'riskLevel',
                width: 150,
                render: (level) => {
                  const risk = formatRiskLevel(level);
                  return <Tag color={risk.color}>{risk.text}</Tag>;
                },
              },
              {
                title: '运行状态',
                dataIndex: 'status',
                width: 150,
                render: (status) => {
                  const s = formatHabitStatus(status);
                  return <Tag color={s.color}>{s.badgeText}</Tag>;
                },
              },
              {
                title: '匿名用户',
                dataIndex: 'userKey',
                width: 110,
                render: (key) => <code>{key}</code>,
              },
              {
                title: '创建时间',
                dataIndex: 'createdAt',
                width: 130,
                render: (val) => new Date(val).toLocaleDateString(),
              },
              {
                title: '治理操作',
                width: 180,
                render: (_, row) => (
                  <Space size="small">
                    <Button
                      size="small"
                      type="link"
                      icon={<FileTextOutlined />}
                      onClick={() => setDetailCandidate(row)}
                    >
                      详情
                    </Button>
                    <Button
                      size="small"
                      loading={actingId === row.id}
                      onClick={() => onAction(row, 'hold')}
                    >
                      {row.status === 'active' ? '暂停' : row.status === 'held' ? '恢复' : '搁置'}
                    </Button>
                    <Button size="small" danger onClick={() => onAction(row, 'reject')}>
                      拒绝
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* 习惯结构化详情模态弹窗 (包含 AI 审查报告、执行流拓扑与证据链) */}
      <HabitDetailModal
        candidate={detailCandidate}
        open={Boolean(detailCandidate)}
        onClose={() => setDetailCandidate(null)}
      />
    </div>
  );
};
