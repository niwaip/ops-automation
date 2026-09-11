import { Card, Col, Progress, Row, Statistic, Table, Tag, Typography } from 'antd';
import { CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import React from 'react';
import type { RoutingDiagnostics } from '@/api/habitLearning';

const { Text } = Typography;

const formatRouteSourceTag = (source: string) => {
  switch (source) {
    case 'saved_workflow':
      return <Tag color="success" icon={<ThunderboltOutlined />}>0-Token 流程复用</Tag>;
    case 'habit_fast_gate':
      return <Tag color="purple" icon={<ThunderboltOutlined />}>习惯快门直通</Tag>;
    case 'full_planner':
    case 'generated_plan':
    case 'llm_topology':
      return <Tag color="blue">大模型重新规划</Tag>;
    case 'single_capability':
    case 'deterministic_match':
      return <Tag color="cyan">单技能匹配</Tag>;
    case 'no_match':
      return <Tag color="default">未匹配到能力</Tag>;
    default:
      return <Tag color="default">{source}</Tag>;
  }
};

const formatMatchMethod = (method?: string) => {
  if (!method) return '-';
  switch (method) {
    case 'name':
      return <Tag color="geekblue">名称直通</Tag>;
    case 'alias':
      return <Tag color="geekblue">别名命中</Tag>;
    case 'habit':
      return <Tag color="purple">习惯相似度</Tag>;
    case 'lexical':
      return <Tag color="default">词法匹配</Tag>;
    default:
      return <Tag>{method}</Tag>;
  }
};

export const RoutingDiagnosticsPanel: React.FC<{
  diagnostics?: RoutingDiagnostics;
  loading: boolean;
}> = ({ diagnostics, loading }) => {
  const total = diagnostics?.total || 0;
  const savedReuse = diagnostics?.savedWorkflowReuse || 0;
  const reuseRate = total > 0 ? Math.round((savedReuse / total) * 100) : 0;
  const plannerInvocations = diagnostics?.plannerInvocations || 0;
  const plannerTokens = diagnostics?.plannerInputTokens || 0;

  // 估算节省的 Token（每次 0-Token 复用按常规拓扑平均节省约 1,200 Tokens 计算）
  const estimatedTokensSaved = savedReuse * 1200;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部宏观效益指标 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" hoverable>
            <Statistic title="总路由决策次数" value={total} suffix="次" />
            <Text type="secondary" style={{ fontSize: 12 }}>30 天内全系统请求调度总计</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" hoverable>
            <Statistic
              title="0-Token 流程复用"
              value={savedReuse}
              valueStyle={{ color: '#3f8600' }}
              suffix={`(${reuseRate}%)`}
              prefix={<ThunderboltOutlined />}
            />
            <Progress percent={reuseRate} size="small" strokeColor="#52c41a" showInfo={false} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" hoverable>
            <Statistic
              title="大模型重新规划"
              value={plannerInvocations}
              valueStyle={{ color: '#1677ff' }}
              suffix={`(${total > 0 ? 100 - reuseRate : 0}%)`}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>累计输入消耗 {plannerTokens} Tokens</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" hoverable>
            <Statistic
              title="预计已节约 Tokens"
              value={estimatedTokensSaved > 10000 ? `${(estimatedTokensSaved / 1000).toFixed(1)}k` : estimatedTokensSaved}
              valueStyle={{ color: '#eb2f96' }}
              prefix={<CheckCircleOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>复用快照避免的大模型开销</Text>
          </Card>
        </Col>
      </Row>

      {/* 实时路由流水明细表格 */}
      <Card
        size="small"
        title="近期路由决策流水明细"
        extra={<Text type="secondary" style={{ fontSize: 12 }}>展示最近 50 条生产真实调度追踪</Text>}
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={diagnostics?.recent || []}
          pagination={{ pageSize: 15 }}
          size="small"
          columns={[
            {
              title: '调度时间',
              dataIndex: 'createdAt',
              width: 160,
              render: (value: string) => new Date(value).toLocaleString(),
            },
            {
              title: '目标工作流 / 技能',
              dataIndex: 'selectedWorkflowName',
              render: (value?: string, row?: any) => {
                if (value) {
                  return <Text strong style={{ color: '#1677ff' }}>{value}</Text>;
                }
                return row?.routeSource === 'saved_workflow' ? '已保存工作流' : <Text type="secondary">通用意图规划</Text>;
              },
            },
            {
              title: '路由来源',
              dataIndex: 'routeSource',
              width: 170,
              render: (value: string) => formatRouteSourceTag(value),
            },
            {
              title: '匹配方式',
              dataIndex: 'matchMethod',
              width: 120,
              render: (value?: string) => formatMatchMethod(value),
            },
            {
              title: 'Tokens 消耗',
              dataIndex: 'plannerInputTokens',
              width: 130,
              render: (tokens?: number | null, row?: any) => {
                if (row?.routeSource === 'saved_workflow' || row?.routeSource === 'habit_fast_gate') {
                  return <Tag color="green">0 Token (直通)</Tag>;
                }
                if (tokens && tokens > 0) {
                  return <Tag color="blue">{tokens} Tokens</Tag>;
                }
                return row?.plannerInvoked ? <Tag color="blue">模型调用</Tag> : <Tag color="green">0 Token</Tag>;
              },
            },
            {
              title: '置信分数',
              dataIndex: 'matchScore',
              width: 100,
              render: (value?: number) => {
                if (value === undefined || value === null) return '-';
                const score = (value * 100).toFixed(0);
                return <Text style={{ color: value >= 0.8 ? '#3f8600' : '#faad14' }}>{score}%</Text>;
              },
            },
            {
              title: '用户',
              dataIndex: 'userKey',
              width: 100,
              render: (user: string) => <code>{user}</code>,
            },
            {
              title: '状态',
              dataIndex: 'contractStatus',
              width: 100,
              render: (status?: string, row?: any) => {
                if (row?.errorCode) return <Tag color="red">异常</Tag>;
                if (status === 'accepted') return <Tag color="green">已通过</Tag>;
                return <Tag color="default">正常</Tag>;
              },
            },
          ]}
        />
      </Card>
    </div>
  );
};
