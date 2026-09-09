import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  message,
  Popconfirm,
  Tooltip,
  Input,
  Select,
  Badge,
  Avatar,
} from 'antd';
import {
  CloudServerOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  SyncOutlined,
  CodeOutlined,
  FolderOpenOutlined,
  SlidersOutlined,
  SearchOutlined,
  UserOutlined,
  BookOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { userApi, type UserDto } from '@/api/auth';
import { UserSandboxStatus } from '../types';
import { SandboxOverviewCards } from '../components/SandboxOverviewCards';
import { SandboxDiagnosticsModal } from '../components/SandboxDiagnosticsModal';
import { SandboxQuotaModal } from '../components/SandboxQuotaModal';
import { SandboxGuideModal } from '../components/SandboxGuideModal';

const { Title, Text } = Typography;

export const SandboxAdminPage: React.FC = () => {
  const [sandboxes, setSandboxes] = useState<UserSandboxStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'paused' | 'stopped'>('all');

  // Diagnostics Modal State
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsOutput, setDiagnosticsOutput] = useState('');
  const [diagnosticsTargetUser, setDiagnosticsTargetUser] = useState('');

  // Guide Modal State
  const [guideVisible, setGuideVisible] = useState(false);

  // Quota Modal State
  const [quotaModalVisible, setQuotaModalVisible] = useState(false);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaTargetUser, setQuotaTargetUser] = useState('');
  const [quotaCurrentRecord, setQuotaCurrentRecord] = useState<UserSandboxStatus | null>(null);
  const [users, setUsers] = useState<UserDto[]>([]);

  useEffect(() => {
    userApi
      .list({ page: 1 })
      .then((res) => {
        setUsers(res.users || []);
      })
      .catch(() => {});
  }, []);

  const userMap = useMemo(() => {
    const map = new Map<string, { username: string; email?: string }>();
    for (const u of users) {
      const name = u.username || u.email || u.id;
      const email = u.email || undefined;
      map.set(u.id, { username: name, email });
      if (u.username) {
        map.set(u.username, { username: u.username, email });
      }
    }
    return map;
  }, [users]);

  const getUserDisplayName = useCallback(
    (userId: string) => {
      const info = userMap.get(userId);
      if (info?.username) return info.username;
      if (userId === 'admin') return '系统管理员';
      return userId;
    },
    [userMap]
  );

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
      message.success(`已成功启动用户 [${getUserDisplayName(userId)}] 的专属沙箱`);
      fetchSandboxes();
    } catch (err: any) {
      message.error(`启动沙箱失败: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleFreeze = async (userId: string) => {
    try {
      await axios.post('/api/user-sandboxes/freeze', { userId });
      message.success(`已休眠用户 [${getUserDisplayName(userId)}] 的沙箱（已释放 CPU 与内存）`);
      fetchSandboxes();
    } catch (err: any) {
      message.error(`休眠沙箱失败: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleRecreate = async (userId: string) => {
    try {
      await axios.post('/api/user-sandboxes/recreate', { userId });
      message.success(`已应用最新镜像无损重建用户 [${getUserDisplayName(userId)}] 的沙箱容器`);
      fetchSandboxes();
    } catch (err: any) {
      message.error(`重建容器失败: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleDestroy = async (userId: string) => {
    try {
      await axios.delete(`/api/user-sandboxes/${userId}`);
      message.success(`已销毁用户 [${getUserDisplayName(userId)}] 的容器实例（磁盘工作区已保留）`);
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
    setQuotaCurrentRecord(record);
    setQuotaModalVisible(true);
  };

  const handleSaveQuota = async (values: { cpuLimit: number; memoryLimitMb: number }) => {
    try {
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
      message.error(`调整配额失败: ${err.response?.data?.message || err.message}`);
    } finally {
      setQuotaLoading(false);
    }
  };

  const filteredSandboxes = useMemo(() => {
    return sandboxes.filter((item) => {
      const displayName = getUserDisplayName(item.userId);
      const userEmail = userMap.get(item.userId)?.email || '';
      const matchesSearch =
        !searchText ||
        displayName.toLowerCase().includes(searchText.toLowerCase()) ||
        userEmail.toLowerCase().includes(searchText.toLowerCase()) ||
        item.userId.toLowerCase().includes(searchText.toLowerCase()) ||
        item.containerName.toLowerCase().includes(searchText.toLowerCase()) ||
        (item.endpoints?.internalIp && item.endpoints.internalIp.includes(searchText));
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'running' && item.status === 'running') ||
        (statusFilter === 'paused' && item.status === 'paused') ||
        (statusFilter === 'stopped' && item.status !== 'running' && item.status !== 'paused');
      return matchesSearch && matchesStatus;
    });
  }, [sandboxes, searchText, statusFilter, getUserDisplayName, userMap]);

  const columns = [
    {
      title: '所属用户',
      dataIndex: 'userId',
      key: 'userId',
      align: 'left' as const,
      onHeaderCell: () => ({
        style: { textAlign: 'left' as const },
      }),
      onCell: () => ({
        style: { textAlign: 'left' as const },
      }),
      render: (userId: string) => {
        const userInfo = userMap.get(userId);
        const displayName = getUserDisplayName(userId);
        const isSystemAdmin = userId === 'admin' || displayName.includes('admin') || displayName === '系统管理员';
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', width: '100%' }}>
            <Space size={8} style={{ justifyContent: 'flex-start' }}>
              <Avatar
                size="small"
                icon={<UserOutlined />}
                style={{
                  backgroundColor: isSystemAdmin ? '#722ed1' : '#1677ff',
                }}
              />
              <Text strong style={{ color: 'var(--text-primary)' }}>
                {displayName}
              </Text>
              {isSystemAdmin && (
                <Tag color="purple" style={{ borderRadius: 10, fontSize: 11 }}>
                  系统管理员
                </Tag>
              )}
              {userInfo?.email && userInfo.email !== displayName && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ({userInfo.email})
                </Text>
              )}
            </Space>
          </div>
        );
      },
    },
    {
      title: '状态 / 最近活跃',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: UserSandboxStatus) => {
        const isRunning = status === 'running';
        const isPaused = status === 'paused';
        return (
          <Space direction="vertical" size={2}>
            <Space size={6}>
              <Badge status={isRunning ? 'processing' : isPaused ? 'warning' : 'default'} />
              <Tag
                color={isRunning ? 'success' : isPaused ? 'warning' : 'default'}
                style={{ borderRadius: 10, fontSize: 11 }}
              >
                {isRunning ? '就绪运行 (Running)' : isPaused ? '挂起休眠 (Paused)' : '已停止 (Stopped)'}
              </Tag>
            </Space>
            {record.lastActiveAt && (
              <span style={{ fontSize: 11, color: 'var(--text-secondary, #8c8c8c)' }}>
                活跃: {new Date(record.lastActiveAt).toLocaleTimeString()}
              </span>
            )}
          </Space>
        );
      },
    },
    {
      title: '内部 IP',
      key: 'internalIp',
      render: (_: any, record: UserSandboxStatus) => (
        <Text
          code
          copyable={Boolean(record.endpoints?.internalIp)}
          style={{ fontSize: 12 }}
        >
          {record.endpoints?.internalIp || '-'}
        </Text>
      ),
    },
    {
      title: '弹性配额',
      key: 'resources',
      render: (_: any, record: UserSandboxStatus) => (
        <Tag color="blue" style={{ borderRadius: 8, fontSize: 12 }}>
          {record.cpuLimit || 1} 核 / {((record.memoryLimitMb || 2048) / 1024).toFixed(1)} GB
        </Tag>
      ),
    },
    {
      title: '工作区目录',
      key: 'paths',
      render: (_: any, record: UserSandboxStatus) => (
        <Tooltip
          title={
            <div>
              <div>工作区: {record.workspacePath} (rw)</div>
              <div>知识库: {record.knowledgePath} (rw)</div>
            </div>
          }
        >
          <Space size={4}>
            <FolderOpenOutlined style={{ color: '#fa8c16' }} />
            <Text ellipsis style={{ maxWidth: 140, fontSize: 12 }}>
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
        <Space size={6}>
          {record.status === 'running' ? (
            <Button
              size="small"
              icon={<PauseCircleOutlined />}
              onClick={() => handleFreeze(record.userId)}
              style={{ borderRadius: 6 }}
            >
              休眠
            </Button>
          ) : (
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => handleLaunch(record.userId)}
              style={{ borderRadius: 6 }}
            >
              唤醒
            </Button>
          )}

          <Tooltip title="配额配置：动态调整容器 CPU 核心数与内存上限">
            <Button
              size="small"
              icon={<SlidersOutlined />}
              onClick={() => handleOpenQuotaModal(record)}
              style={{ borderRadius: 6 }}
            >
              配额
            </Button>
          </Tooltip>

          <Tooltip title="执行体检：在容器内运行 dsh info 检查 Python/Node 运行环境、挂载路径与守护进程健康状态">
            <Button
              size="small"
              icon={<CodeOutlined />}
              onClick={() => handleRunDiagnostics(record.userId)}
              style={{ borderRadius: 6 }}
            >
              诊断
            </Button>
          </Tooltip>

          <Popconfirm
            title="应用最新镜像重建容器？"
            description="将拉取最新底座重建 Docker 实例，用户工作区与个人知识文件将完整保留。"
            onConfirm={() => handleRecreate(record.userId)}
            okText="立即重建"
            cancelText="取消"
          >
            <Tooltip title="无损更新：拉取最新镜像底座重建容器，用户工作区代码与知识库文件无损保留">
              <Button size="small" icon={<SyncOutlined />} style={{ borderRadius: 6 }}>
                更新
              </Button>
            </Tooltip>
          </Popconfirm>

          <Popconfirm
            title="确定销毁此沙箱容器？"
            description="仅删除 Docker 容器实例，宿主机数据目录不会丢失。"
            onConfirm={() => handleDestroy(record.userId)}
            okText="确定销毁"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1600, margin: '0 auto' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
        }}
      >
        <div>
          <Space align="center" size={10}>
            <CloudServerOutlined style={{ fontSize: 24, color: '#1677ff' }} />
            <Title level={3} style={{ margin: 0 }}>
              沙箱管理
            </Title>
          </Space>
          <div style={{ marginTop: 6, color: 'var(--text-secondary, #8c8c8c)', fontSize: 13 }}>
            为每个用户动态开辟轻量隔离的 Docker 安全沙箱，搭载不可变运行时底座、集中式工具插件与零信任凭据代理。
          </div>
        </div>
        <Space>
          <Button icon={<BookOutlined />} onClick={() => setGuideVisible(true)} style={{ borderRadius: 8 }}>
            底座与运维指南
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchSandboxes}
            loading={loading}
            style={{ borderRadius: 8 }}
          >
            刷新状态
          </Button>
        </Space>
      </div>

      {/* Top Overview Cards */}
      <SandboxOverviewCards sandboxes={sandboxes} loading={loading} />

      {/* Main Table Card */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 12 }}>
            <Space size={8} align="center">
              <Text strong style={{ fontSize: 15 }}>用户专属容器实例</Text>
              <Tooltip
                title={
                  <div style={{ padding: '4px 2px', fontSize: 12.5, lineHeight: 1.6, maxWidth: 360 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 4 }}>沙箱运行机制与自动休眠策略</div>
                    <div>• <b>弹性轻量开销</b>：运行中容器内部静默挂起等待请求，实际 <b>CPU 占用为 0%，内存仅消耗数兆</b>，配额仅为资源上限而非独占。</div>
                    <div>• <b>空闲 30 分钟自动休眠</b>：连续无交互将自动挂起彻底释放算力；下一次对话请求发起时将在 <b>1 秒内自动唤醒</b>。</div>
                  </div>
                }
              >
                <QuestionCircleOutlined style={{ color: '#1677ff', cursor: 'pointer', fontSize: 14 }} />
              </Tooltip>
              <Tag color="blue" style={{ borderRadius: 10 }}>
                总计 {filteredSandboxes.length} / {sandboxes.length} 个
              </Tag>
            </Space>

            {/* Filter controls */}
            <Space size={10}>
              <Input
                placeholder="搜索用户名 / 容器名 / IP"
                prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
                style={{ width: 220, borderRadius: 8 }}
              />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 130, borderRadius: 8 }}
                options={[
                  { label: '全部状态', value: 'all' },
                  { label: '运行中', value: 'running' },
                  { label: '已挂起', value: 'paused' },
                  { label: '已停止', value: 'stopped' },
                ]}
              />
            </Space>
          </div>
        }
        style={{ borderRadius: 12 }}
      >

        <Table
          columns={columns}
          dataSource={filteredSandboxes}
          rowKey="userId"
          loading={loading}
          pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 个容器` }}
        />
      </Card>

      {/* Modals */}
      <SandboxQuotaModal
        visible={quotaModalVisible}
        onClose={() => setQuotaModalVisible(false)}
        targetUser={quotaTargetUser}
        loading={quotaLoading}
        onSave={handleSaveQuota}
        initialCpuLimit={quotaCurrentRecord?.cpuLimit}
        initialMemoryLimitMb={quotaCurrentRecord?.memoryLimitMb}
      />

      <SandboxDiagnosticsModal
        visible={diagnosticsVisible}
        onClose={() => setDiagnosticsVisible(false)}
        targetUser={diagnosticsTargetUser}
        loading={diagnosticsLoading}
        output={diagnosticsOutput}
      />

      <SandboxGuideModal
        visible={guideVisible}
        onClose={() => setGuideVisible(false)}
      />
    </div>
  );
};

export default SandboxAdminPage;
