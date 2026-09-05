import React, { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Modal,
  Radio,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  RedoOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ModelBatchHealthCheckResponse, ModelHealthCheckItem } from '@/api/ai';

const { Text, Paragraph } = Typography;

export interface ModelBatchHealthCheckModalProps {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  data: ModelBatchHealthCheckResponse | null;
  onRecheckAll: () => void;
  onRecheckSingle?: (modelId: string) => Promise<void>;
  providerNames: Record<string, string>;
}

export const ModelBatchHealthCheckModal: React.FC<ModelBatchHealthCheckModalProps> = ({
  open,
  onClose,
  loading,
  data,
  onRecheckAll,
  onRecheckSingle,
  providerNames,
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'passed' | 'failed'>('all');
  const [searchText, setSearchText] = useState<string>('');
  const [singleTestingId, setSingleTestingId] = useState<string | null>(null);

  const results = data?.results || [];

  const filteredResults = results.filter((item) => {
    if (filterStatus === 'passed' && !item.success) return false;
    if (filterStatus === 'failed' && item.success) return false;

    if (!searchText.trim()) return true;
    const kw = searchText.trim().toLowerCase();
    const matchName = item.modelName.toLowerCase().includes(kw);
    const matchDisplayName = (item.displayName || '').toLowerCase().includes(kw);
    const matchProvider = (providerNames[item.provider] || item.provider)
      .toLowerCase()
      .includes(kw);
    const matchError = (item.error || '').toLowerCase().includes(kw);
    return matchName || matchDisplayName || matchProvider || matchError;
  });

  const handleSingleTest = async (modelId: string) => {
    if (!onRecheckSingle) return;
    setSingleTestingId(modelId);
    try {
      await onRecheckSingle(modelId);
    } finally {
      setSingleTestingId(null);
    }
  };

  const columns: ColumnsType<ModelHealthCheckItem> = [
    {
      title: '模型',
      key: 'model',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.displayName || record.modelName}</Text>
          {record.displayName && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.modelName}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '供应商',
      dataIndex: 'provider',
      key: 'provider',
      width: 130,
      align: 'center',
      render: (provider: string) => (
        <Tag color={provider.startsWith('alibaba') ? 'orange' : 'blue'}>
          {providerNames[provider] || provider}
        </Tag>
      ),
    },
    {
      title: '有效性状态',
      key: 'status',
      width: 160,
      align: 'center',
      render: (_, record) =>
        record.success ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            正常可用 ({record.latencyMs}ms)
          </Tag>
        ) : (
          <Tag color="error" icon={<CloseCircleOutlined />}>
            调用失败
          </Tag>
        ),
    },
    {
      title: '详细信息 / 诊断输出',
      key: 'detail',
      render: (_, record) => {
        if (record.success) {
          return (
            <Paragraph
              type="secondary"
              ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
              style={{ margin: 0, fontSize: 12 }}
            >
              <Text type="success">✓ 响应正常：</Text>
              {record.response || 'OK'}
            </Paragraph>
          );
        }

        return (
          <Paragraph
            type="danger"
            ellipsis={{ rows: 2, expandable: true, symbol: '查看完整错误' }}
            style={{ margin: 0, fontSize: 12 }}
          >
            <ExclamationCircleOutlined style={{ marginRight: 4 }} />
            {record.error || '未知错误'}
          </Paragraph>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          loading={singleTestingId === record.modelId}
          onClick={() => handleSingleTest(record.modelId)}
        >
          单独重测
        </Button>
      ),
    },
  ];

  return (
    <Modal
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#6366f1' }} />
          <span>全量模型有效性检测结果</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={900}
      footer={
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            共检测 {data?.total || 0} 个模型，其中 {data?.passed || 0} 个可用，{data?.failed || 0} 个异常
          </Text>
          <Space>
            <Button icon={<RedoOutlined />} loading={loading} onClick={onRecheckAll}>
              重新全部检测
            </Button>
            <Button type="primary" onClick={onClose}>
              关闭
            </Button>
          </Space>
        </Space>
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 8 }}>
        {/* 顶部统计卡片 */}
        <Row gutter={[12, 12]}>
          <Col span={8}>
            <Card size="small" styles={{ body: { padding: '10px 16px' } }}>
              <Statistic
                title="已检测模型总数"
                value={data?.total || 0}
                valueStyle={{ color: '#1677ff', fontSize: 22 }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" styles={{ body: { padding: '10px 16px' } }}>
              <Statistic
                title="正常可用"
                value={data?.passed || 0}
                valueStyle={{ color: '#52c41a', fontSize: 22 }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" styles={{ body: { padding: '10px 16px' } }}>
              <Statistic
                title="异常 / 不可用"
                value={data?.failed || 0}
                valueStyle={{ color: (data?.failed || 0) > 0 ? '#ff4d4f' : '#8c8c8c', fontSize: 22 }}
                prefix={<CloseCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>

        {data?.failed && data.failed > 0 ? (
          <Alert
            type="warning"
            showIcon
            message={`检测到 ${data.failed} 个模型调用异常`}
            description="请根据下表详细报错检查对应 Provider 的 API Key、网络连通性、出口 IP 是否受限（如 403）或接口配额。"
          />
        ) : null}

        {/* 筛选与搜索 */}
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Radio.Group
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size="small"
          >
            <Radio.Button value="all">全部 ({results.length})</Radio.Button>
            <Radio.Button value="passed">正常 ({data?.passed || 0})</Radio.Button>
            <Radio.Button value="failed">异常 ({data?.failed || 0})</Radio.Button>
          </Radio.Group>

          <Input
            placeholder="搜索模型名称或报错关键字"
            prefix={<SearchOutlined />}
            size="small"
            style={{ width: 220 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
        </Space>

        {/* 检测表格 */}
        <Table<ModelHealthCheckItem>
          columns={columns}
          dataSource={filteredResults}
          rowKey="modelId"
          loading={loading}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          size="small"
          locale={{ emptyText: loading ? '正在检测全部模型有效性...' : '暂无检测结果' }}
        />
      </Space>
    </Modal>
  );
};
