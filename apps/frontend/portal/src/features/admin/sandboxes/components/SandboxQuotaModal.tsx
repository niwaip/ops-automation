import React, { useEffect } from 'react';
import { Modal, Form, Select, Alert, Typography, Space, Tag, Row, Col, Card } from 'antd';
import { SlidersOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface SandboxQuotaModalProps {
  visible: boolean;
  onClose: () => void;
  targetUser: string;
  loading: boolean;
  onSave: (values: { cpuLimit: number; memoryLimitMb: number }) => Promise<void>;
  initialCpuLimit?: number;
  initialMemoryLimitMb?: number;
}

const PRESETS = [
  { label: '超轻量型', cpu: 0.5, mem: 512, desc: '0.5 核 / 512 MB 极小开销' },
  { label: '标准基准', cpu: 1, mem: 2048, desc: '1 核 / 2.0 GB 日常问答基准', recommended: true },
  { label: '深度分析', cpu: 2, mem: 4096, desc: '2 核 / 4.0 GB 复杂代码与脚本' },
  { label: '极限高载', cpu: 4, mem: 8192, desc: '4 核 / 8.0 GB 极限并发负载' },
];

export const SandboxQuotaModal: React.FC<SandboxQuotaModalProps> = ({
  visible,
  onClose,
  targetUser,
  loading,
  onSave,
  initialCpuLimit = 1,
  initialMemoryLimitMb = 2048,
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (visible) {
      form.setFieldsValue({
        cpuLimit: initialCpuLimit,
        memoryLimitMb: initialMemoryLimitMb,
      });
    }
  }, [visible, initialCpuLimit, initialMemoryLimitMb, form]);

  const handleApplyPreset = (cpu: number, mem: number) => {
    form.setFieldsValue({
      cpuLimit: cpu,
      memoryLimitMb: mem,
    });
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      await onSave(values);
    } catch {
      // form validation error
    }
  };

  return (
    <Modal
      title={
        <Space size={8}>
          <SlidersOutlined style={{ color: '#1677ff' }} />
          <Text strong>调整沙箱资源配额 (Resource Quota)</Text>
          <Tag color="blue">{targetUser}</Tag>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={loading}
      okText="保存并即时生效"
      cancelText="取消"
      width={560}
    >
      <Alert
        type="info"
        showIcon
        icon={<ThunderboltOutlined />}
        style={{ marginBottom: 16, borderRadius: 8 }}
        message="Docker cgroup 动态热更新"
        description="系统通过 Linux cgroup 接口实时刷新容器限额。即便用户当前正在运行容器，也无需重启即可秒级生效。"
      />

      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>
          快速套用推荐规格模板：
        </Text>
        <Row gutter={[8, 8]}>
          {PRESETS.map((p) => (
            <Col span={12} key={p.label}>
              <Card
                size="small"
                hoverable
                onClick={() => handleApplyPreset(p.cpu, p.mem)}
                style={{
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: p.recommended ? '1px solid #1677ff' : undefined,
                  background: p.recommended ? 'rgba(22, 119, 255, 0.04)' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong style={{ fontSize: 13 }}>{p.label}</Text>
                  {p.recommended && <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>推荐</Tag>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary, #8c8c8c)', marginTop: 4 }}>
                  {p.desc}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      <Form form={form} layout="vertical">
        <Form.Item
          name="cpuLimit"
          label="CPU 核心配额上限"
          rules={[{ required: true, message: '请选择 CPU 配额' }]}
          extra="默认推荐 1 核；轻量脚本任务 1 核即可满足。"
        >
          <Select
            options={[
              { label: '0.5 核 (超轻量型，极低开销)', value: 0.5 },
              { label: '1 核 (默认基准，适合日常问答与常规办公脚本)', value: 1 },
              { label: '2 核 (高性能，适合并发与重度处理)', value: 2 },
              { label: '4 核 (极限性能，多核编译与高负载任务)', value: 4 },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="memoryLimitMb"
          label="内存上限 (RAM Quota)"
          rules={[{ required: true, message: '请选择内存配额' }]}
          extra="推荐 2048 MB (2 GB)；容器空闲时仅消耗约数兆。"
        >
          <Select
            options={[
              { label: '512 MB (0.5 GB - 极简型)', value: 512 },
              { label: '1024 MB (1.0 GB - 轻量级)', value: 1024 },
              { label: '2048 MB (2.0 GB - 默认推荐，满足日常绝大多数需求)', value: 2048 },
              { label: '4096 MB (4.0 GB - 密集型计算 / 本地数据分析)', value: 4096 },
              { label: '8192 MB (8.0 GB - 高负载环境)', value: 8192 },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
