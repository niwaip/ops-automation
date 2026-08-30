import React, { useState } from 'react';
import {
  Modal,
  Typography,
  Radio,
  Space,
  Tag,
  Divider,
  Alert,
  Card,
  Row,
  Col,
  Statistic,
  Collapse,
  Table,
  Button,
  message,
} from 'antd';
import {
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  SafetyCertificateOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import {
  BackupImportStrategy,
  BackupPreviewResult,
  SystemBackupArchive,
  systemBackupApi,
  BackupImportResult,
} from '@/api/system-backup';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface BackupPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  previewData: BackupPreviewResult | null;
  archivePayload: SystemBackupArchive | null;
  onImportSuccess: (result: BackupImportResult) => void;
}

export const BackupPreviewModal: React.FC<BackupPreviewModalProps> = ({
  visible,
  onClose,
  previewData,
  archivePayload,
  onImportSuccess,
}) => {
  const [strategy, setStrategy] = useState<BackupImportStrategy>('merge_override');
  const [importing, setImporting] = useState(false);

  if (!previewData || !archivePayload) return null;

  const handleConfirmImport = () => {
    Modal.confirm({
      title: '确认执行系统数据还原？',
      icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
      content: (
        <div>
          <Paragraph style={{ marginBottom: 8 }}>
            您选择了策略：
            <Text strong style={{ color: strategy === 'merge_override' ? '#fa541c' : '#1677ff' }}>
              {strategy === 'merge_override'
                ? '【覆盖更新已存在数据】'
                : '【跳过已存在数据，仅导入新增】'}
            </Text>
          </Paragraph>
          <Paragraph type="secondary" style={{ fontSize: 12 }}>
            还原过程将向数据库及 AI 模型存储区写入数据。建议在操作前确认已完成前置备份。
          </Paragraph>
        </div>
      ),
      okText: '确认立即导入',
      okType: strategy === 'merge_override' ? 'danger' : 'primary',
      cancelText: '取消',
      onOk: async () => {
        try {
          setImporting(true);
          const result = await systemBackupApi.importBackup(archivePayload, strategy);
          if (result.success) {
            message.success(result.message);
            onImportSuccess(result);
            onClose();
          } else {
            message.warning(`部分还原完成，存在 ${result.errors.length} 项错误`);
            onImportSuccess(result);
          }
        } catch (err: any) {
          message.error(`导入还原失败: ${err.message || '网络异常'}`);
        } finally {
          setImporting(false);
        }
      },
    });
  };

  const itemColumns = [
    {
      title: '资产标识 / 名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '当前环境状态',
      dataIndex: 'existsInTarget',
      key: 'existsInTarget',
      width: 140,
      render: (exists: boolean) =>
        exists ? (
          <Tag color="orange" icon={<SyncOutlined spin={false} />}>
            目标环境已存在
          </Tag>
        ) : (
          <Tag color="green" icon={<CheckCircleOutlined />}>
            全新增量资产
          </Tag>
        ),
    },
    {
      title: '执行动作预估',
      key: 'action',
      width: 140,
      render: (_: any, record: any) => {
        if (!record.existsInTarget) {
          return <Tag color="blue">创建新增</Tag>;
        }
        return strategy === 'merge_override' ? (
          <Tag color="volcano">覆盖更新</Tag>
        ) : (
          <Tag color="default">跳过保留</Tag>
        );
      },
    },
  ];

  return (
    <Modal
      title={
        <Space>
          <SafetyCertificateOutlined style={{ color: '#52c41a', fontSize: 20 }} />
          <Title level={4} style={{ margin: 0 }}>
            备份归档校验与冲突分析预览
          </Title>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={860}
      style={{ top: 30 }}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={importing}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={importing}
          onClick={handleConfirmImport}
          style={{ minWidth: 140 }}
        >
          确认开始数据还原
        </Button>,
      ]}
    >
      {/* Manifest Meta Alert */}
      <Alert
        message={
          <Space size={16} wrap>
            <Text type="secondary">
              导出时间: <Text>{new Date(previewData.manifest.exportedAt).toLocaleString()}</Text>
            </Text>
            <Text type="secondary">
              归档版本: <Text code>{previewData.manifest.version}</Text>
            </Text>
            <Text type="secondary">
              校验签名: <Text code>{previewData.manifest.checksum.slice(0, 18)}...</Text>
            </Text>
          </Space>
        }
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        style={{ marginBottom: 16, borderRadius: 8 }}
      />

      {/* Summary Cards */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small" style={{ borderRadius: 8, background: '#f6ffed', borderColor: '#b7eb8f' }}>
            <Statistic
              title="待导入资产总量"
              value={previewData.summary.totalItems}
              valueStyle={{ color: '#389e0d', fontWeight: 'bold' }}
              suffix="项"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ borderRadius: 8, background: '#e6f4ff', borderColor: '#91caff' }}>
            <Statistic
              title="全新增量资产"
              value={previewData.summary.newItems}
              valueStyle={{ color: '#0958d9', fontWeight: 'bold' }}
              suffix="项"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ borderRadius: 8, background: '#fffbe6', borderColor: '#ffe58f' }}>
            <Statistic
              title="重名 / 已存在冲突"
              value={previewData.summary.conflictItems}
              valueStyle={{ color: '#d46b08', fontWeight: 'bold' }}
              suffix="项"
            />
          </Card>
        </Col>
      </Row>

      {/* Strategy Selection */}
      <Card
        size="small"
        title={<Text strong>导入还原冲突策略</Text>}
        style={{ marginBottom: 16, borderRadius: 8 }}
      >
        <Radio.Group
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          style={{ width: '100%' }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Radio value="merge_override">
              <Space direction="vertical" size={2}>
                <Text strong>覆盖更新已存在数据 (Merge & Override) - 【推荐迁移使用】</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  当目标环境已存在相同 ID / 名称的资产时，使用备份文件中的最新数据进行覆盖更新；不存在时直接新建。
                </Text>
              </Space>
            </Radio>
            <Divider style={{ margin: '4px 0' }} />
            <Radio value="skip_existing">
              <Space direction="vertical" size={2}>
                <Text strong>跳过已有数据，仅导入新增项 (Skip Existing)</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  当目标环境已存在相同资产时予以跳过并保留现状，仅将目标环境中缺失的新增资产导入。
                </Text>
              </Space>
            </Radio>
          </Space>
        </Radio.Group>
      </Card>

      {/* Module Previews Details */}
      <Collapse defaultActiveKey={['0']} style={{ borderRadius: 8 }}>
        {previewData.modulePreviews.map((module, idx) => (
          <Panel
            key={String(idx)}
            header={
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '95%' }}>
                <Text strong>模块: {module.moduleKey}</Text>
                <Space size={8}>
                  <Tag color="blue">包含: {module.totalInBackup}</Tag>
                  <Tag color="green">新增: {module.newCount}</Tag>
                  {module.conflictCount > 0 && <Tag color="orange">已存在: {module.conflictCount}</Tag>}
                </Space>
              </div>
            }
          >
            <Table
              dataSource={module.items}
              columns={itemColumns}
              rowKey="key"
              size="small"
              pagination={{ pageSize: 5, size: 'small' }}
            />
          </Panel>
        ))}
      </Collapse>
    </Modal>
  );
};
