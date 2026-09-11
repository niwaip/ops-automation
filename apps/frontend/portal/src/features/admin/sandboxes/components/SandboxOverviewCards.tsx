import React from 'react';
import { Row, Col, Card, Statistic, Space, Tag, Typography } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import { UserSandboxStatus } from '../types';

const { Text } = Typography;

interface SandboxOverviewCardsProps {
  sandboxes: UserSandboxStatus[];
  loading?: boolean;
}

export const SandboxOverviewCards: React.FC<SandboxOverviewCardsProps> = ({
  sandboxes,
  loading,
}) => {
  const runningCount = sandboxes.filter((s) => s.status === 'running').length;
  const stoppedCount = sandboxes.filter((s) => s.status !== 'running').length;

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
      {/* 1. 运行中沙箱 */}
      <Col xs={24} sm={12} lg={6}>
        <Card
          size="small"
          style={{
            borderRadius: 12,
            border: '1px solid rgba(82, 196, 26, 0.25)',
            background: 'rgba(82, 196, 26, 0.05)',
            boxShadow: '0 2px 8px rgba(82, 196, 26, 0.04)',
          }}
        >
          <Statistic
            title={
              <Space align="center" size={6}>
                <CheckCircleFilled style={{ color: '#52c41a', fontSize: 13 }} />
                <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
                  运行中沙箱 (Running)
                </Text>
              </Space>
            }
            value={runningCount}
            loading={loading}
            valueStyle={{
              color: '#52c41a',
              fontWeight: 700,
              fontSize: 26,
            }}
            prefix={<PlayCircleOutlined style={{ fontSize: 20, marginRight: 4 }} />}
            suffix={
              <Tag color="success" style={{ marginLeft: 8, fontSize: 11, borderRadius: 10 }}>
                就绪静默
              </Tag>
            }
          />
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary, #8c8c8c)' }}>
            实时进程已就绪，无交互 30m 自动休眠
          </div>
        </Card>
      </Col>

      {/* 2. 休眠 / 挂起沙箱 */}
      <Col xs={24} sm={12} lg={6}>
        <Card
          size="small"
          style={{
            borderRadius: 12,
            border: '1px solid rgba(140, 140, 140, 0.2)',
            background: 'rgba(140, 140, 140, 0.04)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
          }}
        >
          <Statistic
            title={
              <Space align="center" size={6}>
                <PauseCircleOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />
                <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
                  休眠与停止沙箱
                </Text>
              </Space>
            }
            value={stoppedCount}
            loading={loading}
            valueStyle={{
              color: 'var(--text-color, #595959)',
              fontWeight: 700,
              fontSize: 26,
            }}
            prefix={<PauseCircleOutlined style={{ fontSize: 20, marginRight: 4 }} />}
            suffix={
              <Tag style={{ marginLeft: 8, fontSize: 11, borderRadius: 10 }}>
                1s 极速唤醒
              </Tag>
            }
          />
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary, #8c8c8c)' }}>
            已释放 CPU/内存，用户发起对话自动唤醒
          </div>
        </Card>
      </Col>

      {/* 3. 基础资源配额 */}
      <Col xs={24} sm={12} lg={6}>
        <Card
          size="small"
          style={{
            borderRadius: 12,
            border: '1px solid rgba(22, 119, 255, 0.25)',
            background: 'rgba(22, 119, 255, 0.05)',
            boxShadow: '0 2px 8px rgba(22, 119, 255, 0.04)',
          }}
        >
          <Statistic
            title={
              <Space align="center" size={6}>
                <SafetyCertificateOutlined style={{ color: '#1677ff', fontSize: 13 }} />
                <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
                  基准资源弹性配额
                </Text>
              </Space>
            }
            value="1 核 / 2.0 GB"
            valueStyle={{
              fontSize: 20,
              color: '#1677ff',
              fontWeight: 700,
            }}
            suffix={
              <Tag color="processing" style={{ marginLeft: 6, fontSize: 11, borderRadius: 10 }}>
                cgroup 热调
              </Tag>
            }
          />
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary, #8c8c8c)' }}>
            上限弹性隔离，支持在线热升降配无感生效
          </div>
        </Card>
      </Col>

      {/* 4. 插件与底座体系 */}
      <Col xs={24} sm={12} lg={6}>
        <Card
          size="small"
          style={{
            borderRadius: 12,
            border: '1px solid rgba(114, 46, 209, 0.25)',
            background: 'rgba(114, 46, 209, 0.05)',
            boxShadow: '0 2px 8px rgba(114, 46, 209, 0.04)',
          }}
        >
          <Statistic
            title={
              <Space align="center" size={6}>
                <ThunderboltOutlined style={{ color: '#722ed1', fontSize: 13 }} />
                <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
                  集中插件体系
                </Text>
              </Space>
            }
            value="/opt/dsh/plugins"
            valueStyle={{
              fontSize: 16,
              color: '#722ed1',
              fontFamily: 'monospace',
              fontWeight: 600,
            }}
            suffix={
              <Tag color="purple" style={{ marginLeft: 6, fontSize: 11, borderRadius: 10 }}>
                ro 只读挂载
              </Tag>
            }
          />
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary, #8c8c8c)' }}>
            宿主机统一注入工具集，热生效免容器重启
          </div>
        </Card>
      </Col>
    </Row>
  );
};
