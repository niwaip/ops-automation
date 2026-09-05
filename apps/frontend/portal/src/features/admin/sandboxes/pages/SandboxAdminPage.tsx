import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Typography,
  Descriptions,
  Row,
  Col,
  Statistic,
  message,
  Popconfirm,
  Alert,
  Tooltip,
  Form,
  Select,
} from 'antd';
import {
  CloudServerOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  SyncOutlined,
  CodeOutlined,
  SafetyCertificateOutlined,
  InfoCircleOutlined,
  FolderOpenOutlined,
  ThunderboltOutlined,
  SlidersOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;

interface UserSandboxStatus {
  userId: string;
  containerId?: string;
  containerName: string;
  status: 'running' | 'paused' | 'stopped' | 'not_found' | 'error';
  workspacePath: string;
  knowledgePath: string;
  endpoints?: {
    internalIp?: string;
    httpPort?: number;
  };
  createdAt?: string;
  lastActiveAt?: string;
  cpuLimit?: number;
  memoryLimitMb?: number;
}

export const SandboxAdminPage: React.FC = () => {
  const [sandboxes, setSandboxes] = useState<UserSandboxStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsOutput, setDiagnosticsOutput] = useState('');
  const [diagnosticsTargetUser, setDiagnosticsTargetUser] = useState('');
  const [guideVisible, setGuideVisible] = useState(false);

  const [quotaModalVisible, setQuotaModalVisible] = useState(false);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaTargetUser, setQuotaTargetUser] = useState('');
  const [quotaForm] = Form.useForm();

  const fetchSandboxes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get<{ sandboxes: UserSandboxStatus[] }>('/api/user-sandboxes');
      setSandboxes(res.data.sandboxes || []);
    } catch (err: any) {
      message.error(`获取沙箱列表失败: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSandboxes();
  }, [fetchSandboxes]);

  const handleLaunch = async (userId: string) => {
    try {
      await axios.post('/api/user-sandboxes/launch', { userId });
      message.success(`已成功启动用户 [${userId}] 的专属沙箱`);
      fetchSandboxes();
    } catch (err: any) {
      message.error(`启动沙箱失败: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleFreeze = async (userId: string) => {
    try {
      await axios.post('/api/user-sandboxes/freeze', { userId });
      message.success(`已休眠用户 [${userId}] 的沙箱（已释放 CPU 与内存）`);
      fetchSandboxes();
    } catch (err: any) {
      message.error(`休眠沙箱失败: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleRecreate = async (userId: string) => {
    try {
      await axios.post('/api/user-sandboxes/recreate', { userId });
      message.success(`已应用最新镜像无损重建用户 [${userId}] 的沙箱容器`);
      fetchSandboxes();
    } catch (err: any) {
      message.error(`重建容器失败: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleDestroy = async (userId: string) => {
    try {
      await axios.delete(`/api/user-sandboxes/${userId}`);
      message.success(`已销毁用户 [${userId}] 的容器实例（磁盘工作区已保留）`);
      fetchSandboxes();
    } catch (err: any) {
      message.error(`销毁容器失败: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleRunDiagnostics = async (userId: string) => {
    setDiagnosticsTargetUser(userId);
    setDiagnosticsVisible(true);
    setDiagnosticsLoading(true);
    setDiagnosticsOutput('');
    try {
      const res = await axios.post<{ stdout: string; stderr: string; exitCode: number }>(
        '/api/user-sandboxes/exec',
        {
          userId,
          command: ['dsh', 'info'],
        }
      );
      setDiagnosticsOutput(res.data.stdout || res.data.stderr || '诊断完成，无输出内容');
    } catch (err: any) {
      setDiagnosticsOutput(`执行诊断失败: ${err.response?.data?.message || err.message}`);
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const handleOpenQuotaModal = (record: UserSandboxStatus) => {
    setQuotaTargetUser(record.userId);
    quotaForm.setFieldsValue({
      cpuLimit: record.cpuLimit ?? 1,
      memoryLimitMb: record.memoryLimitMb ?? 2048,
    });
    setQuotaModalVisible(true);
  };

  const handleSaveQuota = async () => {
    try {
      const values = await quotaForm.validateFields();
      setQuotaLoading(true);
      await axios.post('/api/user-sandboxes/quota', {
        userId: quotaTargetUser,
        cpuLimit: values.cpuLimit,
        memoryLimitMb: values.memoryLimitMb,
      });
      message.success(`已成功调整用户 [${quotaTargetUser}] 的配额并实时生效`);
      setQuotaModalVisible(false);
      fetchSandboxes();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(`调整配额失败: ${err.response?.data?.message || err.message}`);
    } finally {
      setQuotaLoading(false);
    }
  };

  const runningCount = sandboxes.filter((s) => s.status === 'running').length;
  const stoppedCount = sandboxes.filter((s) => s.status !== 'running').length;

  const columns = [
    {
      title: '所属用户',
      dataIndex: 'userId',
      key: 'userId',
      render: (userId: string) => (
        <Space>
          <Text strong style={{ color: '#2563eb' }}>
            {userId}
          </Text>
          {userId === 'admin' && <Tag color="gold">系统管理</Tag>}
        </Space>
      ),
    },
    {
      title: '容器名称',
      dataIndex: 'containerName',
      key: 'containerName',
      render: (name: string, record: UserSandboxStatus) => (
        <div>
          <Text code>{name}</Text>
          {record.containerId && (
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              ID: {record.containerId.slice(0, 12)}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '运行状态 / 最近活动',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: UserSandboxStatus) => {
        return (
          <Space direction="vertical" size={2}>
            {status === 'running' ? (
              <Tag color="success">运行中 (Running)</Tag>
            ) : status === 'paused' ? (
              <Tag color="warning">已挂起 (Paused)</Tag>
            ) : (
              <Tag color="default">已停止 (Stopped)</Tag>
            )}
            {record.lastActiveAt ? (
              <span style={{ fontSize: 11, color: '#64748b' }}>
                最近活跃: {new Date(record.lastActiveAt).toLocaleTimeString()}
              </span>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: '内部 IP',
      key: 'internalIp',
      render: (_: any, record: UserSandboxStatus) => (
        <Text copyable={Boolean(record.endpoints?.internalIp)}>
          {record.endpoints?.internalIp || '-'}
        </Text>
      ),
    },
    {
      title: '资源配额',
      key: 'resources',
      render: (_: any, record: UserSandboxStatus) => (
        <Tag color="blue" style={{ margin: 0 }}>
          {record.cpuLimit || 1} 核 / {((record.memoryLimitMb || 2048) / 1024).toFixed(1)} GB
        </Tag>
      ),
    },
    {
      title: '工作区与知识库',
      key: 'paths',
      render: (_: any, record: UserSandboxStatus) => (
        <Tooltip
          title={
            <div>
              <div>工作区: {record.workspacePath} (rw)</div>
              <div>知识库: {record.knowledgePath} (ro)</div>
            </div>
          }
        >
          <Space>
            <FolderOpenOutlined />
            <Text ellipsis style={{ maxWidth: 160 }}>
              {record.workspacePath}
            </Text>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: UserSandboxStatus) => (
        <Space size="small">
          {record.status === 'running' ? (
            <Button
              size="small"
              icon={<PauseCircleOutlined />}
              onClick={() => handleFreeze(record.userId)}
            >
              休眠
            </Button>
          ) : (
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => handleLaunch(record.userId)}
            >
              启动
            </Button>
          )}

          <Button
            size="small"
            icon={<SlidersOutlined />}
            onClick={() => handleOpenQuotaModal(record)}
          >
            配额
          </Button>

          <Button
            size="small"
            icon={<CodeOutlined />}
            onClick={() => handleRunDiagnostics(record.userId)}
          >
            诊断
          </Button>

          <Popconfirm
            title="应用最新镜像重建容器？"
            description="将拉取最新底座重建 Docker 实例，用户工作区与个人知识文件将完整保留。"
            onConfirm={() => handleRecreate(record.userId)}
            okText="立即重建"
            cancelText="取消"
          >
            <Button size="small" icon={<SyncOutlined />}>
              更新
            </Button>
          </Popconfirm>

          <Popconfirm
            title="确定销毁此沙箱容器？"
            description="仅删除 Docker 容器实例，宿主机数据目录不会丢失。"
            onConfirm={() => handleDestroy(record.userId)}
            okText="确定销毁"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <CloudServerOutlined style={{ marginRight: 8, color: '#2563eb' }} />
            个人沙箱与 Docker 容器管理
          </Title>
          <Text type="secondary">
            管理与监控用户的独立安全沙箱实例、不可变 DeepSeek Harness 运行时及集中式插件体系
          </Text>
        </div>
        <Space>
          <Button icon={<InfoCircleOutlined />} onClick={() => setGuideVisible(true)}>
            更新与运维指南
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchSandboxes} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={6}>
          <Card size="small" bordered={false} style={{ background: '#f8fafc' }}>
            <Statistic
              title="运行中沙箱 (Running)"
              value={runningCount}
              valueStyle={{ color: '#16a34a', fontWeight: 'bold' }}
              prefix={<PlayCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bordered={false} style={{ background: '#f8fafc' }}>
            <Statistic
              title="休眠/停止沙箱"
              value={stoppedCount}
              valueStyle={{ color: '#64748b' }}
              prefix={<PauseCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bordered={false} style={{ background: '#f8fafc' }}>
            <Statistic
              title="默认基础资源配额"
              value="1 核 / 2.0 GB"
              valueStyle={{ fontSize: 16, color: '#2563eb', fontWeight: 600 }}
              prefix={<SafetyCertificateOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bordered={false} style={{ background: '#f8fafc' }}>
            <Statistic
              title="集中管理插件目录"
              value="/opt/dsh/plugins (ro)"
              valueStyle={{ fontSize: 15, color: '#7c3aed' }}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="用户沙箱容器实例"
        extra={
          <span style={{ fontSize: 13, color: '#64748b' }}>
            总容器数：{sandboxes.length} 个
          </span>
        }
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="沙箱运行机制、资源弹性配额与自动释放策略"
          description={
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div>• <b>默认标准规格与按需分配</b>：新沙箱默认分配 <b>1 核 / 2.0 GB</b> 轻量规格。管理员可通过【配额】按钮根据用户实际场景弹性调高或降低，基于 Docker cgroup <b>毫秒级热更新，无需重启</b>。</div>
              <div>• <b>“运行中 (Running)” 的含义</b>：容器处于就绪状态，内部静默进程为 <code>tail -f /dev/null</code>，<b>CPU 占用为 0%，内存实际仅消耗数兆</b>，配额仅为资源上限而非独占锁定。</div>
              <div>• <b>空闲超时自动休眠 (Auto-Freeze)</b>：系统已启用空闲自动休眠机制，沙箱连续无交互超过 <b>30 分钟</b>将自动休眠，彻底释放 CPU 与内存，且支持<b>1 秒无感唤醒</b>。</div>
            </div>
          }
        />
        <Table
          columns={columns}
          dataSource={sandboxes}
          rowKey="userId"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 调整配额弹窗 */}
      <Modal
        title={`调整沙箱资源配额 - [${quotaTargetUser}]`}
        open={quotaModalVisible}
        onCancel={() => setQuotaModalVisible(false)}
        onOk={handleSaveQuota}
        confirmLoading={quotaLoading}
        okText="保存并即时生效"
        cancelText="取消"
        width={520}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
          message="支持动态热生效"
          description="如果该用户的沙箱正在运行，保存后底层将通过 Docker cgroup 即时调整 CPU 与内存限额，无需重启容器。"
        />
        <Form form={quotaForm} layout="vertical">
          <Form.Item
            name="cpuLimit"
            label="CPU 核心上限"
            rules={[{ required: true, message: '请选择 CPU 配额' }]}
            extra="默认推荐 1 核；可为重度代码构建或并发分析用户上调。"
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
            label="内存上限 (RAM)"
            rules={[{ required: true, message: '请选择内存配额' }]}
            extra="默认推荐 2048 MB (2 GB)；空闲时内存实际仅占用 ~5MB。"
          >
            <Select
              options={[
                { label: '512 MB (0.5 GB - 极简型)', value: 512 },
                { label: '1024 MB (1.0 GB - 轻量级)', value: 1024 },
                { label: '2048 MB (2.0 GB - 默认推荐，满足日常大部分需求)', value: 2048 },
                { label: '4096 MB (4.0 GB - 密集型计算 / 本地数据分析)', value: 4096 },
                { label: '8192 MB (8.0 GB - 高负载环境)', value: 8192 },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 诊断弹窗 */}
      <Modal
        title={`沙箱运行诊断 - [${diagnosticsTargetUser}]`}
        open={diagnosticsVisible}
        onCancel={() => setDiagnosticsVisible(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setDiagnosticsVisible(false)}>
            关闭
          </Button>,
        ]}
        width={700}
      >
        {diagnosticsLoading ? (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <SyncOutlined spin style={{ fontSize: 24, color: '#2563eb' }} />
            <div style={{ marginTop: 12 }}>正在向沙箱发送命令并获取状态...</div>
          </div>
        ) : (
          <pre
            style={{
              background: '#0f172a',
              color: '#38bdf8',
              padding: 16,
              borderRadius: 8,
              fontSize: 13,
              maxHeight: 400,
              overflow: 'auto',
            }}
          >
            {diagnosticsOutput}
          </pre>
        )}
      </Modal>

      {/* 运维与更新管理指南弹窗 */}
      <Modal
        title="Docker 个人沙箱运维与更新维护指南"
        open={guideVisible}
        onCancel={() => setGuideVisible(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setGuideVisible(false)}>
            我知道了
          </Button>,
        ]}
        width={760}
      >
        <Alert
          message="核心原则：不可变底座 + 个人数据持久化 + 零信任凭据注入"
          description="普通用户在沙箱内部只有只读权限和个人工作区读写权限，无权更改系统依赖或查看生产 API Key。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="1. 镜像与 Harness 版本更新">
            <Paragraph style={{ margin: 0 }}>
              修改 <code>docker/user-sandbox/Dockerfile</code> 或升级 <code>dsh</code> 脚本后，执行标准构建命令：
              <pre style={{ background: '#f1f5f9', padding: 8, borderRadius: 4, marginTop: 4 }}>
                docker build -t ops-user-sandbox:local -f docker/user-sandbox/Dockerfile .
              </pre>
              构建完成后，在上方表格点击对应用户的 <b>“更新”</b> 按钮，即可无损切换到最新底座（工作区文件保留）。
            </Paragraph>
          </Descriptions.Item>
          <Descriptions.Item label="2. 集中式插件更新（热生效）">
            <Paragraph style={{ margin: 0 }}>
              管理员集中管理的插件位于宿主机 <code>data/shared/dsh-plugins/</code> 目录。
              直接向该目录放置 Python 工具脚本（如 <code>web_search.py</code>），所有运行中的沙箱内部只读挂载目录 <code>/opt/dsh/plugins/</code> <b>即时生效，无需重启容器</b>。
            </Paragraph>
          </Descriptions.Item>
          <Descriptions.Item label="3. 大模型 API Key 管理">
            <Paragraph style={{ margin: 0 }}>
              通过宿主机环境变量或管理后台【模型管理】配置真实的 DeepSeek/OpenAI Key。
              容器内注入的永远是 <code>sandbox-user-token-${'{userId}'}</code> 虚拟凭据，所有请求经由平台内部 AI Proxy 自动拦截和置换，<b>真实 API Key 绝不暴露进用户容器</b>。
            </Paragraph>
          </Descriptions.Item>
          <Descriptions.Item label="4. 资源释放与休眠">
            <Paragraph style={{ margin: 0 }}>
              支持一键“休眠”容器（<code>freeze</code>），暂停容器进程，将 CPU 与内存占用降为 0；在用户发起下一次对话时自动无缝唤醒。
            </Paragraph>
          </Descriptions.Item>
        </Descriptions>
      </Modal>
    </div>
  );
};

export default SandboxAdminPage;
