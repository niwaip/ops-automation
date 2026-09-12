import {
  ApartmentOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Row,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import {
  workbenchCoordinationApi,
  type CoordinationTask,
  type WorkflowTemplateDefinition,
} from '../../../api/workbenchCoordination';
import { CoordinationTaskCardModal } from '../../chat/components/CoordinationTaskCardModal';
import { WorkflowAuditDrawer } from './WorkflowAuditDrawer';
import { OrganizationWorkflowCard } from './OrganizationWorkflowCard';
import { OrgWorkflowRequestModal } from './OrgWorkflowRequestModal';

export function OrganizationWorkflowList() {
  const navigate = useNavigate();
  const [selectedWorkflowForApply, setSelectedWorkflowForApply] =
    useState<WorkflowTemplateDefinition | null>(null);
  const [schemaDrawerWorkflow, setSchemaDrawerWorkflow] =
    useState<WorkflowTemplateDefinition | null>(null);
  const [requestAccessWorkflow, setRequestAccessWorkflow] =
    useState<WorkflowTemplateDefinition | null>(null);
  const [auditDrawerTask, setAuditDrawerTask] = useState<CoordinationTask | null>(null);

  // 1. 获取系统组织工作流模版（包含权限状态与流程定义）
  const {
    data: templates = [],
    isLoading: isTemplatesLoading,
    refetch: refetchTemplates,
  } = useQuery('workflowTemplates', () => workbenchCoordinationApi.getWorkflowTemplates());

  // 2. 获取近期流转实例
  const {
    data: recentTasks = [],
    isLoading: isTasksLoading,
    refetch: refetchTasks,
  } = useQuery('coordinationTasks', () => workbenchCoordinationApi.listTasks('all'), {
    refetchInterval: 10000,
  });

  // 分类工作流：已授权 vs 待开通
  const { authorizedTemplates, unauthorizedTemplates } = useMemo(() => {
    const auth: WorkflowTemplateDefinition[] = [];
    const unauth: WorkflowTemplateDefinition[] = [];

    for (const t of templates) {
      if (t.accessStatus === 'unauthorized' || t.accessStatus === 'requested') {
        unauth.push(t);
      } else {
        auth.push(t);
      }
    }
    return { authorizedTemplates: auth, unauthorizedTemplates: unauth };
  }, [templates]);

  const renderStatusTag = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Tag color="processing" icon={<ClockCircleOutlined />}>
            审批 / 办理中
          </Tag>
        );
      case 'approved':
        return (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            审批已核准
          </Tag>
        );
      case 'completed':
        return (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            已办理完成
          </Tag>
        );
      case 'rejected':
        return (
          <Tag color="error" icon={<CloseCircleOutlined />}>
            已驳回
          </Tag>
        );
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const taskColumns = [
    {
      title: '业务流名称 / 任务标题',
      key: 'title',
      render: (_: any, record: CoordinationTask) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            工作流代号：<code>{record.workflowId || 'general.coordination'}</code>
          </div>
        </div>
      ),
    },
    {
      title: '发起人',
      key: 'initiator',
      width: 120,
      render: (_: any, record: CoordinationTask) => (
        <Tag color="blue">@{record.initiator?.username || '未知'}</Tag>
      ),
    },
    {
      title: '审批 / 办理对象',
      key: 'assignee',
      width: 140,
      render: (_: any, record: CoordinationTask) => (
        <Tag color="purple">@{record.assignee?.username || '协同成员'}</Tag>
      ),
    },
    {
      title: '当前流转状态',
      key: 'status',
      width: 140,
      render: (_: any, record: CoordinationTask) => renderStatusTag(record.status),
    },
    {
      title: '外部系统联动凭证',
      key: 'externalSync',
      width: 220,
      render: (_: any, record: CoordinationTask) => {
        const sync = record.externalSyncResult;
        if (!sync) return <Typography.Text type="secondary">-</Typography.Text>;
        return (
          <Tooltip title={`${sync.externalSystem} | ${sync.message}`}>
            <Tag color="cyan">
              {sync.trackingNumber || '已完成系统同步'}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '发起时间',
      key: 'createdAt',
      width: 150,
      render: (_: any, record: CoordinationTask) =>
        dayjs(record.createdAt).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '流程审计与履历',
      key: 'action',
      width: 140,
      render: (_: any, record: CoordinationTask) => (
        <Button
          type="link"
          size="small"
          icon={<AuditOutlined />}
          onClick={() => setAuditDrawerTask(record)}
        >
          查看履历与日志
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 0 24px' }}>
      {/* 1. 顶部全景说明 */}
      <Card
        style={{
          background: 'linear-gradient(135deg, rgba(22, 119, 255, 0.08) 0%, rgba(114, 46, 209, 0.08) 100%)',
          borderColor: 'var(--border-color, #d6e4ff)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Typography.Title level={4} style={{ margin: '0 0 8px 0' }}>
              <ApartmentOutlined style={{ color: '#1677ff', marginRight: 8 }} />
              组织工作流中心 (Enterprise Organization Workflows)
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 850 }}>
              组织工作流由管理员在 5173 管理后台基于底层普通工作流（基础执行流、Temporal、技能）进行组装并发布。具备完整的流程定义（提单 Schema 契约 → 审批节点及角色规则 → 审批通过后自动触发底层自动化执行流闭环 → GTD 回执归档）。
            </Typography.Paragraph>
          </div>
          <Space>
            <Button icon={<SyncOutlined />} onClick={() => { refetchTemplates(); refetchTasks(); }}>
              刷新状态
            </Button>
            {authorizedTemplates.length > 0 && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setSelectedWorkflowForApply(authorizedTemplates[0] || null)}
              >
                快速发起流程
              </Button>
            )}
          </Space>
        </div>
      </Card>

      {/* 2. 已授权在岗工作流板块 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            在岗企业工作流 (已授权 - {authorizedTemplates.length})
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            点击「立即发起申请」可直接填报参数卡片；亦可在「智能协同」对话中输入自然语言自动触发。
          </Typography.Text>
        </div>

        {authorizedTemplates.length === 0 ? (
          <Card loading={isTemplatesLoading}>
            <Empty description="当前没有已开通的组织工作流，可向管理员申请开通" />
          </Card>
        ) : (
          <Row gutter={[16, 16]}>
            {authorizedTemplates.map((tpl) => (
              <Col xs={24} md={12} lg={8} key={tpl.id}>
                <OrganizationWorkflowCard
                  template={tpl}
                  onApply={setSelectedWorkflowForApply}
                  onViewSchema={setSchemaDrawerWorkflow}
                  onRequestAccess={setRequestAccessWorkflow}
                />
              </Col>
            ))}
          </Row>
        )}
      </div>

      {/* 3. 待开通企业工作流板块 (未授权/审批中) */}
      {unauthorizedTemplates.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Typography.Title level={5} style={{ margin: 0, color: 'var(--text-secondary)' }}>
              待开通企业工作流 (未授权 / 审批中 - {unauthorizedTemplates.length})
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              根据企业角色权限控制，未开通工作流需提交开通申请并经管理员审核。
            </Typography.Text>
          </div>

          <Row gutter={[16, 16]}>
            {unauthorizedTemplates.map((tpl) => (
              <Col xs={24} md={12} lg={8} key={tpl.id}>
                <OrganizationWorkflowCard
                  template={tpl}
                  onApply={setSelectedWorkflowForApply}
                  onViewSchema={setSchemaDrawerWorkflow}
                  onRequestAccess={setRequestAccessWorkflow}
                />
              </Col>
            ))}
          </Row>
        </div>
      )}

      {/* 4. 近期流程流转与追踪看板 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            组织流程流转看板 ({recentTasks.length})
          </Typography.Title>
          <Button type="link" onClick={() => navigate('/dashboard')}>
            前往工作台 GTD 收集箱处理待办 →
          </Button>
        </div>

        <Card styles={{ body: { padding: 0 } }}>
          <Table
            dataSource={recentTasks}
            columns={taskColumns}
            rowKey="taskId"
            loading={isTasksLoading}
            pagination={{ pageSize: 5 }}
            locale={{
              emptyText: <Empty description="暂无近期流转任务，点击上方「发起申请」提交新流程" />,
            }}
          />
        </Card>
      </div>

      {/* 5. 发起申请弹窗 */}
      {selectedWorkflowForApply ? (
        <CoordinationTaskCardModal
          open={Boolean(selectedWorkflowForApply)}
          initialTemplateId={selectedWorkflowForApply.id}
          onClose={() => setSelectedWorkflowForApply(null)}
          onSuccess={() => {
            setSelectedWorkflowForApply(null);
            refetchTasks();
            message.success('申请已成功提交，已推入审批人 GTD 收集箱！');
          }}
        />
      ) : null}

      {/* 6. 申请开通工作流弹窗 */}
      <OrgWorkflowRequestModal
        visible={Boolean(requestAccessWorkflow)}
        workflow={requestAccessWorkflow}
        onClose={() => setRequestAccessWorkflow(null)}
        onSuccess={() => refetchTemplates()}
      />

      {/* 7. 查看契约与流程定义 Drawer */}
      <Drawer
        title={
          <Space>
            <span>工作流定义与契约:</span>
            <strong>{schemaDrawerWorkflow?.name}</strong>
          </Space>
        }
        open={Boolean(schemaDrawerWorkflow)}
        onClose={() => setSchemaDrawerWorkflow(null)}
        width={560}
      >
        {schemaDrawerWorkflow ? (
          <Tabs
            defaultActiveKey="stages"
            items={[
              {
                key: 'stages',
                label: '流程定义链路 (Stages)',
                children: (
                  <div>
                    <Typography.Paragraph type="secondary">
                      在 5173 管理后台中配置的业务流转节点与审批人角色定义：
                    </Typography.Paragraph>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {(schemaDrawerWorkflow.processDefinition?.stages || []).map((stage, idx) => (
                        <Card size="small" key={stage.id || idx} style={{ background: 'var(--bg-hover, rgba(255, 255, 255, 0.04))', borderColor: 'var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Typography.Text strong>
                              {idx + 1}. {stage.name}
                            </Typography.Text>
                            <Tag color="blue">{stage.type}</Tag>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                            {stage.description}
                          </div>
                          {stage.approverRule && (
                            <div style={{ fontSize: 12 }}>
                              审批人规则：<Tag color="purple">{stage.approverRule}</Tag>
                              {stage.approverRole ? <span> 角色：<code>{stage.approverRole}</code></span> : null}
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>

                    <Typography.Title level={5} style={{ marginTop: 20 }}>
                      组装的 5173 底层普通工作流
                    </Typography.Title>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(schemaDrawerWorkflow.assembledWorkflows || []).length === 0 ? (
                        <Typography.Text type="secondary">未绑定底层技术流</Typography.Text>
                      ) : (
                        (schemaDrawerWorkflow.assembledWorkflows || []).map((item) => (
                          <Card size="small" key={item.refId} style={{ background: 'rgba(82, 196, 26, 0.08)', borderColor: 'rgba(82, 196, 26, 0.25)' }}>
                            <Space>
                              <Tag color="green">{item.type}</Tag>
                              <strong>{item.name}</strong>
                              <code>{item.refId}</code>
                            </Space>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                              触发时机: {item.triggerEvent || '审批通过时'} | {item.description}
                            </div>
                          </Card>
                        ))
                      )}
                    </div>
                  </div>
                ),
              },
              {
                key: 'schema',
                label: '参数契约 (Schema)',
                children: (
                  <div>
                    <Descriptions
                      title="基础元数据"
                      bordered
                      size="small"
                      column={1}
                      style={{ marginBottom: 20 }}
                    >
                      <Descriptions.Item label="工作流 ID">
                        <code>{schemaDrawerWorkflow.workflowId}</code>
                      </Descriptions.Item>
                      <Descriptions.Item label="任务类型">
                        <Tag color="blue">{schemaDrawerWorkflow.taskType}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="必填字段">
                        {schemaDrawerWorkflow.paramsSchema.required.map((req) => (
                          <Tag color="red" key={req}>{req}</Tag>
                        ))}
                      </Descriptions.Item>
                    </Descriptions>

                    <Typography.Title level={5}>参数字段清单 (Properties)</Typography.Title>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {Object.entries(schemaDrawerWorkflow.paramsSchema.properties).map(
                        ([propKey, propDef]) => (
                          <Card size="small" key={propKey} style={{ background: 'var(--bg-hover, rgba(255, 255, 255, 0.04))', borderColor: 'var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Typography.Text strong>
                                {propDef.description || propKey} (<code>{propKey}</code>)
                              </Typography.Text>
                              <Space>
                                <Tag>{propDef.type}</Tag>
                                {schemaDrawerWorkflow.paramsSchema.required.includes(propKey) ? (
                                  <Tag color="red">必填</Tag>
                                ) : null}
                              </Space>
                            </div>
                            {propDef.enum ? (
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                枚举选项：{propDef.enum.join(' / ')}
                              </div>
                            ) : null}
                          </Card>
                        )
                      )}
                    </div>
                  </div>
                ),
              },
            ]}
          />
        ) : null}
      </Drawer>

      {/* 8. 流程全景履历与企业审计日志 Drawer */}
      <WorkflowAuditDrawer
        open={Boolean(auditDrawerTask)}
        task={auditDrawerTask}
        onClose={() => setAuditDrawerTask(null)}
      />
    </div>
  );
}
