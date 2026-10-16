import {
  FilterOutlined,
  RobotOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Progress, Radio, Row, Space, Tag, Typography } from 'antd';
import type { WorkspaceDigestStats } from '@/api/workspace';

const { Text } = Typography;

export type DigestFilterType = 'tree' | 'all' | 'ai_cleaned' | 'uncleaned';

interface WorkspaceKnowledgeStatsBarProps {
  stats: WorkspaceDigestStats | null;
  isLoading?: boolean;
  filterType: DigestFilterType;
  onFilterChange: (type: DigestFilterType) => void;
  onOpenFullCleanModal: (scope: 'all' | 'uncleaned') => void;
}

export function WorkspaceKnowledgeStatsBar({
  stats,
  isLoading: _isLoading,
  filterType,
  onFilterChange,
  onOpenFullCleanModal,
}: WorkspaceKnowledgeStatsBarProps) {
  if (!stats) return null;

  const { totalFiles, aiCleanedFiles, ruleDigestFiles, noDigestFiles, coveragePercent } = stats;
  const uncleanedCount = ruleDigestFiles + noDigestFiles;

  return (
    <Card
      size="small"
      style={{
        background: 'var(--bg-card, #1e293b)',
        borderColor: 'var(--border-color, #334155)',
        borderRadius: 8,
        margin: '8px 0',
      }}
      bodyStyle={{ padding: '12px 16px' }}
    >
      <Row gutter={[16, 12]} align="middle" justify="space-between">
        {/* 左侧：就绪度指标与覆盖率进度条 */}
        <Col xs={24} md={14}>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Space size={4}>
                <RobotOutlined style={{ color: '#1677ff', fontSize: 16 }} />
                <Text strong style={{ fontSize: 14, color: 'var(--text-primary, #f8fafc)' }}>
                  知识库 AI 治理与 RAG 就绪度
                </Text>
              </Space>

              <Tag
                color={coveragePercent >= 80 ? 'success' : coveragePercent >= 40 ? 'warning' : 'default'}
                style={{ fontWeight: 600, fontSize: 12, margin: 0 }}
              >
                覆盖率 {coveragePercent}%
              </Tag>

              <Text type="secondary" style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)' }}>
                共 {totalFiles} 篇文档 · 已 AI 深度提炼{' '}
                <Text strong style={{ color: '#52c41a' }}>
                  {aiCleanedFiles}
                </Text>{' '}
                篇 · 未清洗{' '}
                <Text strong style={{ color: uncleanedCount > 0 ? '#fa8c16' : '#94a3b8' }}>
                  {uncleanedCount}
                </Text>{' '}
                篇
              </Text>
            </div>

            <Progress
              percent={coveragePercent}
              size="small"
              strokeColor={{
                '0%': '#1677ff',
                '100%': '#52c41a',
              }}
              status={coveragePercent >= 100 ? 'success' : 'active'}
              style={{ margin: 0, maxWidth: 520 }}
            />
          </Space>
        </Col>

        {/* 右侧：快捷治理与全量清洗操作 */}
        <Col xs={24} md={10} style={{ textAlign: 'right' }}>
          <Space wrap size="small">
            {uncleanedCount > 0 && (
              <Button
                size="small"
                type="primary"
                ghost
                icon={<SyncOutlined />}
                onClick={() => onOpenFullCleanModal('uncleaned')}
              >
                仅清洗未清洗文档 ({uncleanedCount})
              </Button>
            )}

            <Button
              size="small"
              type="primary"
              icon={<RobotOutlined />}
              onClick={() => onOpenFullCleanModal('all')}
              style={{
                background: 'linear-gradient(90deg, #1677ff 0%, #722ed1 100%)',
                borderColor: '#1677ff',
              }}
            >
              一键全量 AI 清洗
            </Button>
          </Space>
        </Col>
      </Row>

      {/* 底部过滤标签栏 */}
      <div
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px dashed var(--border-color, #334155)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Space size={8} align="center">
          <FilterOutlined style={{ color: 'var(--text-light, #64748b)', fontSize: 12 }} />
          <Text type="secondary" style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)' }}>
            一览视图过滤：
          </Text>
          <Radio.Group
            size="small"
            value={filterType}
            onChange={(e) => onFilterChange(e.target.value)}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="tree">📁 目录层级</Radio.Button>
            <Radio.Button value="all">全部文档 ({totalFiles})</Radio.Button>
            <Radio.Button value="ai_cleaned">
              已 AI 提炼 ({aiCleanedFiles})
            </Radio.Button>
            <Radio.Button value="uncleaned">
              未清洗 ({uncleanedCount})
            </Radio.Button>
          </Radio.Group>
        </Space>

        <Text type="secondary" style={{ fontSize: 11, color: 'var(--text-light, #64748b)' }}>
          💡 提示：一览已精简；点击表格左侧 [+] 可展开查看 AI 提炼全文、大纲与提取数据实体
        </Text>
      </div>
    </Card>
  );
}
