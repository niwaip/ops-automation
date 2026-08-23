import { Card, Col, Row, Statistic, Table, Tag } from 'antd';
import React from 'react';
import type { RoutingDiagnostics } from '@/api/habitLearning';

export const RoutingDiagnosticsPanel: React.FC<{
  diagnostics?: RoutingDiagnostics;
  loading: boolean;
}> = ({ diagnostics, loading }) => (
  <>
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      <Col span={6}><Card><Statistic title="路由决策" value={diagnostics?.total ?? 0} /></Card></Col>
      <Col span={6}><Card><Statistic title="固定流程复用" value={diagnostics?.savedWorkflowReuse ?? 0} /></Card></Col>
      <Col span={6}><Card><Statistic title="Planner 调用" value={diagnostics?.plannerInvocations ?? 0} /></Card></Col>
      <Col span={6}><Card><Statistic title="Planner 输入 Token" value={diagnostics?.plannerInputTokens ?? 0} /></Card></Col>
    </Row>
    <Table
      rowKey="id"
      loading={loading}
      dataSource={diagnostics?.recent || []}
      pagination={{ pageSize: 20 }}
      columns={[
        { title: '时间', dataIndex: 'createdAt', render: (value: string) => new Date(value).toLocaleString() },
        { title: '匿名用户', dataIndex: 'userKey' },
        { title: '来源', dataIndex: 'routeSource', render: (value: string) => <Tag>{value}</Tag> },
        { title: '匹配方式', dataIndex: 'matchMethod', render: (value?: string) => value || '-' },
        { title: '路由策略', dataIndex: 'routingPolicyVersion', render: (value?: string) => value || '-' },
        { title: '候选数', dataIndex: 'candidateCount' },
        { title: '分数', dataIndex: 'matchScore', render: (value?: number) => value === undefined || value === null ? '-' : value.toFixed(3) },
        { title: '调用 Planner', dataIndex: 'plannerInvoked', render: (value: boolean) => value ? '是' : '否' },
      ]}
    />
  </>
);
