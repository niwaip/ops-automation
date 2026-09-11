import React, { useState, useEffect, useCallback } from 'react';
import {
  Typography,
  Card,
  Row,
  Col,
  Statistic,
  Tag,
  Space,
  Button,
  Alert,
  Divider,
  Drawer,
  Spin,
  message,
  theme,
} from 'antd';
import {
  DashboardOutlined,
  SyncOutlined,
  FieldTimeOutlined,
  CheckCircleOutlined,
  BranchesOutlined,
  CopyOutlined,
  ExportOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

interface ParsedMetrics {
  uptimeSeconds: number;
  heapBytes: number;
  activeExecutions: number;
  succeededExecutions: number;
  failedExecutions: number;
  totalHttpRequests: number;
  rawText: string;
}

const parsePrometheusText = (text: string): ParsedMetrics => {
  const lines = text.split('\n');
  let uptimeSeconds = 0;
  let heapBytes = 0;
  let activeExecutions = 0;
  let succeededExecutions = 0;
  let failedExecutions = 0;
  let totalHttpRequests = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('process_uptime_seconds ')) {
      uptimeSeconds = parseFloat(trimmed.replace('process_uptime_seconds ', '')) || 0;
    } else if (trimmed.startsWith('nodejs_heap_bytes ')) {
      heapBytes = parseFloat(trimmed.replace('nodejs_heap_bytes ', '')) || 0;
    } else if (trimmed.startsWith('execution_active_count ')) {
      activeExecutions = parseFloat(trimmed.replace('execution_active_count ', '')) || 0;
    } else if (trimmed.includes('execution_total{status="succeeded"}')) {
      succeededExecutions = parseFloat(trimmed.split(' ').pop() || '0') || 0;
    } else if (trimmed.includes('execution_total{status="failed"}')) {
      failedExecutions = parseFloat(trimmed.split(' ').pop() || '0') || 0;
    } else if (trimmed.startsWith('http_requests_total{')) {
      totalHttpRequests += parseFloat(trimmed.split(' ').pop() || '0') || 0;
    }
  }

  return {
    uptimeSeconds,
    heapBytes,
    activeExecutions,
    succeededExecutions,
    failedExecutions,
    totalHttpRequests,
    rawText: text,
  };
};

const formatUptime = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}小时 ${m}分 ${s}秒`;
  if (m > 0) return `${m}分 ${s}秒`;
  return `${s}秒`;
};

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
};

export const ObservabilityAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState<boolean>(true);
  const [controlPlaneMetrics, setControlPlaneMetrics] = useState<ParsedMetrics | null>(null);
  const [aiOrchestratorMetrics, setAiOrchestratorMetrics] = useState<ParsedMetrics | null>(null);
  const [rawDrawerVisible, setRawDrawerVisible] = useState<boolean>(false);
  const [drawerTitle, setDrawerTitle] = useState<string>('');
  const [drawerContent, setDrawerContent] = useState<string>('');

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Control Plane metrics
      try {
        const cpRes = await fetch('/api/metrics');
        if (cpRes.ok) {
          const cpText = await cpRes.text();
          setControlPlaneMetrics(parsePrometheusText(cpText));
        }
      } catch (e) {
        console.warn('Failed to fetch control-plane metrics', e);
      }

      // 2. Fetch AI Orchestrator metrics
      try {
        const aiRes = await fetch('/api/ai/metrics');
        if (aiRes.ok) {
          const aiText = await aiRes.text();
          setAiOrchestratorMetrics(parsePrometheusText(aiText));
        }
      } catch (e) {
        console.warn('Failed to fetch ai-orchestrator metrics', e);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const timer = setInterval(fetchMetrics, 10000);
    return () => clearInterval(timer);
  }, [fetchMetrics]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    message.success(`${label} 已复制到剪贴板`);
  };

  const showRawMetrics = (title: string, content: string) => {
    setDrawerTitle(title);
    setDrawerContent(content);
    setRawDrawerVisible(true);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      {/* 头部标题与操作 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            <LineChartOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            系统监控与全链路可观测性 (Observability)
          </Title>
          <Text type="secondary">
            集成 W3C 分布式追踪标准、微服务 Prometheus 指标导出与执行生命周期耗时分析。
          </Text>
        </div>
        <Space>
          <Button icon={<SyncOutlined spin={loading} />} onClick={fetchMetrics}>
            刷新指标
          </Button>
          <Button type="primary" icon={<BranchesOutlined />} onClick={() => navigate('/executions')}>
            前往执行历史 (查看任务瀑布流)
          </Button>
        </Space>
      </div>

      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        {/* 指引提示 Alert */}
        <Alert
          type="info"
          showIcon
          message="可观测性体系全景视图说明"
          description={
            <div>
              <p style={{ margin: '4px 0' }}>
                <strong>1. 微服务指标监控 (Prometheus /metrics)</strong>：后端各服务均内置 Prometheus Exporter 端点，支持 Prometheus / Grafana 定时刮取与告警。
              </p>
              <p style={{ margin: '4px 0' }}>
                <strong>2. 执行链路瀑布流 (Execution Waterfall)</strong>：点击左侧「执行历史」进入任意执行任务详情，在「链路追踪与耗时」标签页中可查看 W3C Trace ID 及全生命周期耗时甘特图。
              </p>
              <p style={{ margin: '4px 0' }}>
                <strong>3. 服务间 Trace 透传 (W3C TraceContext)</strong>：微服务间调用自动生成并透传标准 <code>traceparent</code> 与 <code>x-trace-id</code>。
              </p>
            </div>
          }
        />

        {/* 核心监控卡片 (Control Plane) */}
        <Card
          title={
            <Space>
              <DashboardOutlined style={{ color: '#1677ff' }} />
              <span>调度控制面 (Control Plane) 运行指标</span>
              <Tag color="green">运行中</Tag>
            </Space>
          }
          extra={
            <Space>
              <Button
                size="small"
                icon={<FileTextOutlined />}
                onClick={() => showRawMetrics('Control Plane Prometheus 原始指标 (/api/metrics)', controlPlaneMetrics?.rawText || '暂无数据')}
              >
                查看原始指标
              </Button>
              <Button
                size="small"
                icon={<ExportOutlined />}
                onClick={() => window.open('/api/metrics', '_blank')}
              >
                打开端点
              </Button>
            </Space>
          }
        >
          {loading && !controlPlaneMetrics ? (
            <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
          ) : (
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={8} md={4}>
                <Statistic
                  title="进程存活时间"
                  value={formatUptime(controlPlaneMetrics?.uptimeSeconds || 0)}
                  prefix={<FieldTimeOutlined />}
                />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Statistic
                  title="堆内存占用"
                  value={formatBytes(controlPlaneMetrics?.heapBytes || 0)}
                  prefix={<ThunderboltOutlined />}
                />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Statistic
                  title="当前活跃执行"
                  value={controlPlaneMetrics?.activeExecutions || 0}
                  valueStyle={{ color: '#1677ff', fontWeight: 'bold' }}
                />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Statistic
                  title="累计成功任务"
                  value={controlPlaneMetrics?.succeededExecutions || 0}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Statistic
                  title="累计失败任务"
                  value={controlPlaneMetrics?.failedExecutions || 0}
                  valueStyle={{ color: controlPlaneMetrics?.failedExecutions ? '#ff4d4f' : '#8c8c8c' }}
                />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Statistic
                  title="总计 HTTP 请求"
                  value={controlPlaneMetrics?.totalHttpRequests || 0}
                  prefix={<ApiOutlined />}
                />
              </Col>
            </Row>
          )}
        </Card>

        {/* AI Orchestrator 监控卡片 */}
        <Card
          title={
            <Space>
              <ThunderboltOutlined style={{ color: '#722ed1' }} />
              <span>AI 编排引擎 (AI Orchestrator) 运行指标</span>
              <Tag color="purple">智能规划</Tag>
            </Space>
          }
          extra={
            <Space>
              <Button
                size="small"
                icon={<FileTextOutlined />}
                onClick={() => showRawMetrics('AI Orchestrator Prometheus 原始指标 (/api/ai/metrics)', aiOrchestratorMetrics?.rawText || '暂无数据')}
              >
                查看原始指标
              </Button>
              <Button
                size="small"
                icon={<ExportOutlined />}
                onClick={() => window.open('/api/ai/metrics', '_blank')}
              >
                打开端点
              </Button>
            </Space>
          }
        >
          {loading && !aiOrchestratorMetrics ? (
            <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
          ) : (
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={8} md={6}>
                <Statistic
                  title="进程存活时间"
                  value={formatUptime(aiOrchestratorMetrics?.uptimeSeconds || 0)}
                  prefix={<FieldTimeOutlined />}
                />
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Statistic
                  title="堆内存占用"
                  value={formatBytes(aiOrchestratorMetrics?.heapBytes || 0)}
                  prefix={<ThunderboltOutlined />}
                />
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Statistic
                  title="HTTP 服务吞吐"
                  value={aiOrchestratorMetrics?.totalHttpRequests || 0}
                  prefix={<ApiOutlined />}
                />
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Statistic
                  title="服务运行状态"
                  value="正常"
                  valueStyle={{ color: '#52c41a' }}
                  prefix={<CheckCircleOutlined />}
                />
              </Col>
            </Row>
          )}
        </Card>

        {/* 采集端点与链路追踪实操指引 */}
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card title="Prometheus 采集配置 (Scrape Target)" size="small">
              <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
                在企业 Prometheus、VictoriaMetrics 或 Datadog Agent 中配置以下 Scrape Job：
              </Paragraph>
              <div
                style={{
                  background: token.colorFillAlter,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  padding: '10px 14px',
                  borderRadius: 6,
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text strong>1. Control Plane 采集端点</Text>
                  <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard('http://<host>:3003/api/metrics', 'Control Plane 端点')} />
                </div>
                <Text code>GET /api/metrics (Port: 3003)</Text>
              </div>

              <div
                style={{
                  background: token.colorFillAlter,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  padding: '10px 14px',
                  borderRadius: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text strong>2. AI Orchestrator 采集端点</Text>
                  <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard('http://<host>:3007/ai/metrics', 'AI Orchestrator 端点')} />
                </div>
                <Text code>GET /ai/metrics (Port: 3007)</Text>
              </div>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card title="单次执行全生命周期追踪 (Waterfall)" size="small">
              <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
                每个调度任务均具备完整的微秒级时间戳打点与分布式 Trace ID。
              </Paragraph>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Tag color="blue" style={{ padding: '4px 8px' }}>步骤 1</Tag>
                  <Text>前往左侧菜单 <strong>「运行与审计」 -&gt; 「执行历史」</strong></Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Tag color="blue" style={{ padding: '4px 8px' }}>步骤 2</Tag>
                  <Text>点击任意执行记录进入 <strong>「执行详情」或右侧抽屉</strong></Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Tag color="blue" style={{ padding: '4px 8px' }}>步骤 3</Tag>
                  <Text>查看 <strong>「链路追踪与耗时」</strong> 即可查看 Trace ID 与瀑布流甘特图</Text>
                </div>
              </div>
              <Divider style={{ margin: '14px 0' }} />
              <Button type="primary" ghost block icon={<BranchesOutlined />} onClick={() => navigate('/executions')}>
                立即前往执行历史查看
              </Button>
            </Card>
          </Col>
        </Row>
      </Space>

      {/* 原始 Prometheus 指标预览 Drawer */}
      <Drawer
        title={drawerTitle}
        placement="right"
        width={720}
        onClose={() => setRawDrawerVisible(false)}
        open={rawDrawerVisible}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text type="secondary">Prometheus 文本格式指标 (OpenMetrics)</Text>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={() => copyToClipboard(drawerContent, 'Prometheus 指标文本')}
          >
            复制全部指标
          </Button>
        </div>
        <pre
          style={{
            background: '#282c34',
            color: '#abb2bf',
            padding: 16,
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.5,
            maxHeight: 'calc(100vh - 160px)',
            overflowY: 'auto',
          }}
        >
          {drawerContent}
        </pre>
      </Drawer>
    </div>
  );
};

export default ObservabilityAdminPage;
