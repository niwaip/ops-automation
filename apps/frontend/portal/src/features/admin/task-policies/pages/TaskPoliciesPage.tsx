import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  message,
  Popconfirm,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  taskPolicyApi,
  type TaskPolicyDetail,
  type TaskPolicyProposal,
  type TaskPolicySummary,
} from '@/api/taskPolicies';

const { Title, Text } = Typography;

export default function TaskPoliciesPage() {
  const [policies, setPolicies] = useState<TaskPolicySummary[]>([]);
  const [proposals, setProposals] = useState<TaskPolicyProposal[]>([]);
  const [detail, setDetail] = useState<TaskPolicyDetail>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [policyRows, proposalRows] = await Promise.all([
        taskPolicyApi.list(),
        taskPolicyApi.listProposals(),
      ]);
      setPolicies(policyRows);
      setProposals(proposalRows);
    } catch (error: any) {
      message.error(error?.message || '加载任务策略失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const policyColumns: ColumnsType<TaskPolicySummary> = [
    {
      title: '策略名称',
      dataIndex: 'name',
      render: (value, row) => (
        <Button
          type="link"
          style={{ padding: 0 }}
          onClick={async () => setDetail(await taskPolicyApi.get(row.id))}
        >
          {value}
        </Button>
      ),
    },
    {
      title: '作用域',
      render: (_, row) => (
        <Tag color={row.scopeType === 'platform' ? 'purple' : 'cyan'}>
          {row.scopeType}:{row.scopeId}
        </Tag>
      ),
    },
    {
      title: '版本',
      dataIndex: 'version',
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value) => (
        <Tag color={value === 'active' ? 'green' : value === 'shadow' ? 'blue' : 'default'}>
          {value}
        </Tag>
      ),
    },
    {
      title: '别名 / 流程 / 绑定',
      render: (_, row) =>
        `${row._count?.aliases ?? 0} / ${row._count?.recipes ?? 0} / ${row._count?.bindings ?? 0}`,
    },
    {
      title: '不可变摘要',
      dataIndex: 'digest',
      render: (value: string) => <Text code>{value.slice(0, 10)}</Text>,
    },
    {
      title: '操作',
      render: (_, row) =>
        row.status === 'draft' || row.status === 'shadow' ? (
          <Space>
            <Button
              size="small"
              onClick={async () => {
                try {
                  const result = await taskPolicyApi.replay(row.id);
                  if (result.passed) {
                    message.success('回放门禁通过');
                  } else {
                    message.error('回放门禁未通过');
                  }
                  await load();
                } catch (err: any) {
                  message.error(err?.message || '回放测试失败');
                }
              }}
            >
              回放门禁
            </Button>
            <Popconfirm
              title="确认发布策略"
              description="发布后将使当前不可变版本生效，同作用域下的旧活跃策略将自动退休。"
              onConfirm={async () => {
                try {
                  await taskPolicyApi.publish(row.id);
                  message.success('策略已发布');
                  await load();
                } catch (err: any) {
                  message.error(err?.message || '发布策略失败');
                }
              }}
            >
              <Button size="small" type="primary">
                发布
              </Button>
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  const proposalColumns: ColumnsType<TaskPolicyProposal> = [
    {
      title: '补丁类型',
      dataIndex: 'proposalType',
    },
    {
      title: '作用域',
      render: (_, row) => `${row.scopeType}:${row.scopeId}`,
    },
    {
      title: '模型置信度',
      dataIndex: 'confidence',
      render: (value) => Number(value).toFixed(2),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value) => <Tag>{value}</Tag>,
    },
    {
      title: '人工审查',
      render: (_, row) =>
        row.status === 'candidate' ? (
          <Space>
            <Button
              size="small"
              type="primary"
              onClick={async () => {
                try {
                  await taskPolicyApi.reviewProposal(row.id, 'shadow');
                  message.success('已移入影子评估');
                  await load();
                } catch (err: any) {
                  message.error(err?.message || '操作失败');
                }
              }}
            >
              进入影子
            </Button>
            <Popconfirm
              title="拒绝候选补丁"
              description="确定拒绝该学习候选补丁吗？"
              onConfirm={async () => {
                try {
                  await taskPolicyApi.reviewProposal(row.id, 'rejected');
                  message.info('已拒绝候选补丁');
                  await load();
                } catch (err: any) {
                  message.error(err?.message || '操作失败');
                }
              }}
            >
              <Button size="small" danger>
                拒绝
              </Button>
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%', padding: '0 4px' }}>
      <div>
        <Title level={4} style={{ marginBottom: 4 }}>
          任务策略治理
        </Title>
        <Text type="secondary">
          受限规划器策略集配置。固定规范命令别名、Recipe 确定性拓扑与 Capability 绑定。LLM 离线学习只提交候选补丁，需人工审查并通过不可变回放门禁方可发布生效。
        </Text>
      </div>

      <Card title="已版本化策略集" extra={<Button onClick={load}>刷新</Button>}>
        <Table
          rowKey="id"
          loading={loading}
          columns={policyColumns}
          dataSource={policies}
          pagination={false}
        />
      </Card>

      <Card title="离线学习候选补丁">
        {proposals.length ? (
          <Table
            rowKey="id"
            columns={proposalColumns}
            dataSource={proposals}
            pagination={{ pageSize: 8 }}
          />
        ) : (
          <Empty description="暂无待审查候选补丁" />
        )}
      </Card>

      <Drawer
        width={800}
        title={detail?.name}
        open={Boolean(detail)}
        onClose={() => setDetail(undefined)}
      >
        {detail ? <PolicyDetailView policy={detail} /> : null}
      </Drawer>
    </Space>
  );
}

function PolicyDetailView({ policy }: { policy: TaskPolicyDetail }) {
  return (
    <>
      <Descriptions
        column={2}
        size="small"
        bordered
        items={[
          { key: 'scope', label: '作用域', children: `${policy.scopeType}:${policy.scopeId}` },
          { key: 'version', label: '版本', children: policy.version },
          { key: 'status', label: '状态', children: policy.status },
          {
            key: 'digest',
            label: '不可变摘要',
            children: (
              <Text code copyable>
                {policy.digest}
              </Text>
            ),
          },
        ]}
      />
      <Tabs
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'aliases',
            label: `命令别名 (${policy.aliases.length})`,
            children: (
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={policy.aliases}
                columns={[
                  { title: '规范命令', dataIndex: 'canonicalCommand' },
                  { title: '触发别名', dataIndex: 'alias' },
                  { title: '匹配模式', dataIndex: 'matchType' },
                  { title: '权重', dataIndex: 'weight' },
                ]}
              />
            ),
          },
          {
            key: 'recipes',
            label: `确定性流程 (${policy.recipes.length})`,
            children: (
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={policy.recipes}
                columns={[
                  { title: 'Recipe Key', dataIndex: 'recipeKey' },
                  {
                    title: '前置命令链',
                    dataIndex: 'requiredCommandsJson',
                    render: (v: string[]) => v?.join(' → ') || '-',
                  },
                  {
                    title: '步骤数',
                    dataIndex: 'stepsJson',
                    render: (v: unknown[]) => v?.length || 0,
                  },
                  {
                    title: '完成声明 (Claims)',
                    dataIndex: 'completionClaimsJson',
                    render: (v: string[]) => v?.join(', ') || '-',
                  },
                ]}
              />
            ),
          },
          {
            key: 'bindings',
            label: `能力角色绑定 (${policy.bindings.length})`,
            children: (
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={policy.bindings}
                columns={[
                  { title: '角色', dataIndex: 'capabilityRole' },
                  { title: '能力标识', dataIndex: 'capabilityId' },
                  { title: '版本', dataIndex: 'capabilityVersion', render: (v) => v || 'latest' },
                  { title: '优先级', dataIndex: 'priority' },
                ]}
              />
            ),
          },
          {
            key: 'audit',
            label: `发布审计 (${policy.auditLogs.length})`,
            children: (
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={policy.auditLogs}
                columns={[
                  { title: '操作动作', dataIndex: 'action' },
                  { title: '操作者', dataIndex: 'actorUserId', render: (v) => v || 'system' },
                  { title: '记录时间', dataIndex: 'createdAt' },
                ]}
              />
            ),
          },
        ]}
      />
    </>
  );
}
