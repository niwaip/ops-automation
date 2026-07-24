import React from 'react';
import { Row, Col, Card, Alert, Button, Space, Table, Tag, Typography } from 'antd';
import { RocketOutlined } from '@ant-design/icons';
import type { CapabilityReleaseDetail } from '@/api/capabilities';

const { Text } = Typography;

export interface CapabilityOpsTabContentProps {
  selectedDetail: CapabilityReleaseDetail;
  hasExecutableCode: boolean;
  onOpenDeployModal: (id: string) => void;
}

export const CapabilityOpsTabContent: React.FC<CapabilityOpsTabContentProps> = ({
  selectedDetail,
  hasExecutableCode,
  onOpenDeployModal,
}) => {
  const release = selectedDetail.release;
  const auditEvents = selectedDetail.auditEvents || [];
  const deployments = selectedDetail.deployments || [];
  const validations = selectedDetail.validations || [];
  const snapshots = selectedDetail.sourceSnapshots || [];

  return (
    <Row gutter={[16, 16]} align="top">
      {['draft_ready', 'approved', 'published'].includes(release.status) && (
        <Col span={24}>
          <Alert
            type="success"
            message="推荐操作：代码部署"
            description={
              <Space direction="vertical" size="small">
                <Text>当前 Release 已准备就绪，建议将其部署到测试或预发布环境进行验证。</Text>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<RocketOutlined />}
                  disabled={!hasExecutableCode}
                  onClick={() => onOpenDeployModal(release.id)}
                >
                  前往部署配置
                </Button>
              </Space>
            }
            showIcon
          />
        </Col>
      )}

      <Col span={12}>
        <Card size="small" title="审计事件日志" style={{ borderRadius: 10 }}>
          <Table
            size="small"
            rowKey="id"
            dataSource={auditEvents}
            pagination={{ pageSize: 5 }}
            columns={[
              { title: '事件类型', dataIndex: 'eventType', key: 'eventType' },
              { title: '概要说明', dataIndex: 'summary', key: 'summary', ellipsis: true },
              {
                title: '时间',
                dataIndex: 'createdAt',
                key: 'createdAt',
                render: (val) => (val ? new Date(val).toLocaleString() : '-'),
              },
            ]}
          />
        </Card>
      </Col>

      <Col span={12}>
        <Card size="small" title="部署记录History" style={{ borderRadius: 10 }}>
          <Table
            size="small"
            rowKey="id"
            dataSource={deployments}
            pagination={{ pageSize: 5 }}
            columns={[
              { title: '环境', dataIndex: 'environment', key: 'environment' },
              {
                title: '状态',
                dataIndex: 'status',
                key: 'status',
                render: (val) => <Tag color={val === 'success' ? 'green' : 'red'}>{val}</Tag>,
              },
              {
                title: '部署时间',
                dataIndex: 'createdAt',
                key: 'createdAt',
                render: (val) => (val ? new Date(val).toLocaleString() : '-'),
              },
            ]}
          />
        </Card>
      </Col>

      <Col span={12}>
        <Card size="small" title="静态/真实验证记录" style={{ borderRadius: 10 }}>
          <Table
            size="small"
            rowKey="id"
            dataSource={validations}
            pagination={{ pageSize: 5 }}
            columns={[
              { title: '验证类型', dataIndex: 'validationType', key: 'validationType' },
              {
                title: '结果',
                dataIndex: 'success',
                key: 'success',
                render: (val) => <Tag color={val ? 'green' : 'red'}>{val ? '通过' : '未通过'}</Tag>,
              },
              {
                title: '时间',
                dataIndex: 'createdAt',
                key: 'createdAt',
                render: (val) => (val ? new Date(val).toLocaleString() : '-'),
              },
            ]}
          />
        </Card>
      </Col>

      <Col span={12}>
        <Card size="small" title="源快照版本历史 (Snapshots)" style={{ borderRadius: 10 }}>
          <Table
            size="small"
            rowKey="id"
            dataSource={snapshots}
            pagination={{ pageSize: 5 }}
            columns={[
              { title: '快照版本', dataIndex: 'snapshotVersion', key: 'snapshotVersion' },
              { title: '快照 Hash', dataIndex: 'snapshotHash', key: 'snapshotHash', ellipsis: true },
              {
                title: '生成时间',
                dataIndex: 'createdAt',
                key: 'createdAt',
                render: (val) => (val ? new Date(val).toLocaleString() : '-'),
              },
            ]}
          />
        </Card>
      </Col>
    </Row>
  );
};
