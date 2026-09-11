import React, { useMemo } from 'react';
import { Card, Row, Col, Statistic, Tag, Typography, Space, Button, Empty, Tooltip, message, theme } from 'antd';
import { CopyOutlined, FieldTimeOutlined, BranchesOutlined, CheckCircleOutlined, ExclamationCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { useQuery } from 'react-query';
import { executionApi, type ExecutionDto, type ExecutionStepDto, type ExecutionPhaseDto } from '@/api/execution';

const { Text } = Typography;

export interface ExecutionTraceTabProps {
  execution: ExecutionDto;
  steps?: ExecutionStepDto[];
}

interface WaterfallItem {
  id: string;
  name: string;
  type: string;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs: number;
  offsetPercent: number;
  widthPercent: number;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export const ExecutionTraceTab: React.FC<ExecutionTraceTabProps> = ({ execution, steps = [] }) => {
  const { token } = theme.useToken();
  const traceId = useMemo(() => {
    return (execution as any).traceId || (execution as any).metadata?.traceId || execution.id;
  }, [execution]);

  const { data: phases = [] } = useQuery(
    ['execution-phases', execution.id],
    () => executionApi.getPhases(execution.id),
    {
      staleTime: 5000,
      enabled: Boolean(execution.id),
    }
  );

  const { waterfallItems, totalDurationMs } = useMemo(() => {
    const rawItems = phases.length > 0
      ? phases.map((p: ExecutionPhaseDto) => ({
          id: p.id,
          name: p.phaseName || p.phaseKey,
          type: p.phaseType || 'phase',
          status: p.status,
          startedAt: p.startedAt || p.createdAt,
          completedAt: p.completedAt,
        }))
      : steps.map((s: ExecutionStepDto) => ({
          id: s.id,
          name: s.name || `步骤 ${s.stepIndex}`,
          type: 'step',
          status: s.status,
          startedAt: s.startedAt || s.createdAt,
          completedAt: s.endedAt || s.updatedAt,
        }));

    if (rawItems.length === 0) {
      return { waterfallItems: [], totalDurationMs: 0 };
    }

    const startTimes = rawItems
      .map((item) => (item.startedAt ? new Date(item.startedAt).getTime() : NaN))
      .filter((t) => !isNaN(t));

    const endTimes = rawItems
      .map((item) => (item.completedAt ? new Date(item.completedAt).getTime() : NaN))
      .filter((t) => !isNaN(t));

    const globalStart = startTimes.length > 0 ? Math.min(...startTimes) : new Date(execution.createdAt).getTime();
    const globalEnd = endTimes.length > 0 ? Math.max(...endTimes) : Date.now();
    const totalDuration = Math.max(globalEnd - globalStart, 1);

    const items: WaterfallItem[] = rawItems.map((item) => {
      const itemStart = item.startedAt ? new Date(item.startedAt).getTime() : globalStart;
      const itemEnd = item.completedAt ? new Date(item.completedAt).getTime() : itemStart;
      const durationMs = Math.max(itemEnd - itemStart, 10);
      const offsetPercent = Math.max(0, Math.min(100, ((itemStart - globalStart) / totalDuration) * 100));
      const widthPercent = Math.max(2, Math.min(100 - offsetPercent, (durationMs / totalDuration) * 100));

      return {
        id: item.id,
        name: item.name,
        type: item.type,
        status: item.status,
        startedAt: item.startedAt,
        completedAt: item.completedAt,
        durationMs,
        offsetPercent,
        widthPercent,
      };
    });

    return { waterfallItems: items, totalDurationMs: totalDuration };
  }, [phases, steps, execution]);

  const handleCopyTraceId = () => {
    navigator.clipboard.writeText(traceId);
    message.success('Trace ID 已复制到剪贴板');
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'completed':
      case 'succeeded':
        return <Tag color="success" icon={<CheckCircleOutlined />}>成功</Tag>;
      case 'running':
        return <Tag color="processing" icon={<SyncOutlined spin />}>执行中</Tag>;
      case 'failed':
        return <Tag color="error" icon={<ExclamationCircleOutlined />}>失败</Tag>;
      case 'waiting_input':
        return <Tag color="warning">等待输入</Tag>;
      default:
        return <Tag color="default">{status}</Tag>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Trace Header & Metrics Bar */}
      <Card size="small">
        <Row gutter={16} align="middle">
          <Col xs={24} md={10}>
            <Space direction="vertical" size={2}>
              <Text type="secondary" style={{ fontSize: 12 }}>分布式追踪标识 (Trace ID)</Text>
              <Space>
                <Text code style={{ fontSize: 13, fontWeight: 600 }}>{traceId}</Text>
                <Button size="small" type="text" icon={<CopyOutlined />} onClick={handleCopyTraceId} />
              </Space>
              <Space size={4} style={{ marginTop: 4 }}>
                <Tag color="blue">W3C TraceContext</Tag>
                <Tag color="geekblue">端到端链路贯通</Tag>
              </Space>
            </Space>
          </Col>
          <Col xs={8} md={4}>
            <Statistic
              title="总计耗时"
              value={formatDuration(totalDurationMs)}
              prefix={<FieldTimeOutlined style={{ color: token.colorPrimary }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={8} md={5}>
            <Statistic
              title="执行阶段数"
              value={phases.length > 0 ? phases.length : steps.length}
              suffix={phases.length > 0 ? 'Phases' : 'Steps'}
              prefix={<BranchesOutlined style={{ color: token.colorSuccess }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={8} md={5}>
            <Statistic
              title="总体状态"
              value={execution.status}
              formatter={() => getStatusTag(execution.status)}
            />
          </Col>
        </Row>
      </Card>

      {/* Execution Waterfall / Gantt View */}
      <Card title="执行链路耗时瀑布流 (Execution Lifecycle Waterfall)" size="small">
        {waterfallItems.length === 0 ? (
          <Empty description="暂无阶段耗时打点数据" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingBottom: 6,
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                fontSize: 12,
                color: token.colorTextSecondary,
              }}
            >
              <span style={{ width: 220 }}>阶段 / 动作名称</span>
              <span style={{ width: 80 }}>状态</span>
              <span style={{ flex: 1, textAlign: 'center' }}>全周期时间占比甘特条 (0% ~ 100%)</span>
              <span style={{ width: 90, textAlign: 'right' }}>耗时</span>
            </div>

            {waterfallItems.map((item, idx) => (
              <div
                key={item.id || idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: `1px dashed ${token.colorBorderSecondary}`,
                }}
              >
                <div style={{ width: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <Text strong style={{ fontSize: 13 }}>{item.name}</Text>
                  <div style={{ fontSize: 11, color: token.colorTextTertiary }}>{item.type}</div>
                </div>

                <div style={{ width: 80 }}>
                  {getStatusTag(item.status)}
                </div>

                <div style={{ flex: 1, padding: '0 16px', position: 'relative', height: 24, display: 'flex', alignItems: 'center' }}>
                  {/* Timeline Background Track */}
                  <div
                    style={{
                      width: '100%',
                      height: 10,
                      background: token.colorFillAlter,
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: 5,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <Tooltip
                      title={`${item.name}: ${formatDuration(item.durationMs)} (起始: ${item.startedAt ? new Date(item.startedAt).toLocaleTimeString() : 'N/A'})`}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: `${item.offsetPercent}%`,
                          width: `${item.widthPercent}%`,
                          height: '100%',
                          background: item.status === 'failed' ? '#ff4d4f' : item.status === 'running' ? token.colorPrimary : '#52c41a',
                          borderRadius: 5,
                          transition: 'all 0.3s',
                        }}
                      />
                    </Tooltip>
                  </div>
                </div>

                <div style={{ width: 90, textAlign: 'right', fontWeight: 600, color: token.colorTextSecondary, fontSize: 12 }}>
                  {formatDuration(item.durationMs)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
