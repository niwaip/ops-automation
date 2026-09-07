import {
  Drawer,
  Descriptions,
  Tag,
  Typography,
  Timeline,
  Space,
  Card,
  Alert,
} from 'antd';
import {
  AuditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  ApiOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { CoordinationTask } from '../../../api/workbenchCoordination';

interface WorkflowAuditDrawerProps {
  task: CoordinationTask | null;
  open: boolean;
  onClose: () => void;
}

export function WorkflowAuditDrawer({ task, open, onClose }: WorkflowAuditDrawerProps) {
  if (!task) return null;

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

  const getPriorityTag = (priority?: string) => {
    switch (priority) {
      case 'urgent':
        return <Tag color="error">紧急</Tag>;
      case 'high':
        return <Tag color="warning">高优先级</Tag>;
      case 'medium':
        return <Tag color="blue">中优先级</Tag>;
      default:
        return <Tag>普通</Tag>;
    }
  };

  const sync = task.externalSyncResult;
  const actions = task.actions || [];

  return (
    <Drawer
      title={
        <Space size={8} align="center">
          <AuditOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <span>流程全景履历与企业审计日志</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={620}
      extra={renderStatusTag(task.status)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 1. 企业合规提示 */}
        <Alert
          type="info"
          showIcon
          icon={<SafetyCertificateOutlined style={{ color: '#1677ff' }} />}
          message="企业级不可篡改流转审计链"
          description="该流程实例完整追溯提报申请、各级审批意见、外部系统（如 HRMS 考勤中心）扣减核销流水与回执归档履历。"
        />

        {/* 2. 基础单据元数据 */}
        <Card size="small" title="单据基础元数据" styles={{ body: { padding: '12px 16px' } }}>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="流程单号" span={2}>
              <code>{task.taskId}</code>
            </Descriptions.Item>
            <Descriptions.Item label="流程标题" span={2}>
              <strong>{task.title}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="工作流代号">
              <code>{task.workflowId || 'general.coordination'}</code>
            </Descriptions.Item>
            <Descriptions.Item label="任务类型">
              <Tag color="purple">{task.taskType || 'approval'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="发起人">
              <Tag color="blue">@{task.initiator?.username || '未知'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="审批 / 承办人">
              <Tag color="cyan">@{task.assignee?.username || '协同成员'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="优先级">
              {getPriorityTag(task.priority)}
            </Descriptions.Item>
            <Descriptions.Item label="发起时间">
              {task.createdAt ? dayjs(task.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 3. 业务表单申请快照 */}
        {task.parameters && Object.keys(task.parameters).length > 0 ? (
          <Card size="small" title="业务申请参数快照" styles={{ body: { padding: '12px 16px' } }}>
            <Descriptions size="small" column={2} bordered>
              {Object.entries(task.parameters).map(([key, val]) => (
                <Descriptions.Item key={key} label={key}>
                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        ) : null}

        {/* 4. 全链路流转日志与操作时间轴 */}
        <Card size="small" title="流程流转日志时间轴 (Audit Trail)" styles={{ body: { padding: '16px' } }}>
          <Timeline
            items={[
              // 节点 1: 提报发起
              {
                color: 'blue',
                dot: <UserOutlined style={{ fontSize: 16 }} />,
                children: (
                  <div>
                    <Space size={8} align="center">
                      <strong>【单据发起】</strong>
                      <Tag color="blue">@{task.initiator?.username || '发起人'}</Tag>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {task.createdAt ? dayjs(task.createdAt).format('YYYY-MM-DD HH:mm:ss') : ''}
                      </Typography.Text>
                    </Space>
                    <div style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 13 }}>
                      提交工作流申请，经 Schema 契约校验通过；已生成协同任务卡片并推入审批人 GTD 收集箱。
                    </div>
                  </div>
                ),
              },
              // 节点 2: 审批人操作记录 (Actions)
              ...(actions.length > 0
                ? actions.map((act) => {
                    const isApprove = act.action === 'approve';
                    const isReject = act.action === 'reject';
                    return {
                      color: isApprove ? 'green' : isReject ? 'red' : 'blue',
                      dot: isApprove ? (
                        <CheckCircleOutlined style={{ fontSize: 16 }} />
                      ) : isReject ? (
                        <CloseCircleOutlined style={{ fontSize: 16 }} />
                      ) : (
                        <CheckCircleOutlined style={{ fontSize: 16 }} />
                      ),
                      children: (
                        <div>
                          <Space size={8} align="center">
                            <strong>
                              {isApprove
                                ? '【主管审批 · 已核准】'
                                : isReject
                                ? '【主管审批 · 已驳回】'
                                : '【协同办理完成】'}
                            </strong>
                            <Tag color={isApprove ? 'green' : isReject ? 'red' : 'purple'}>
                              @{act.operatorName || '审批成员'}
                            </Tag>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {dayjs(act.timestamp).format('YYYY-MM-DD HH:mm:ss')}
                            </Typography.Text>
                          </Space>
                          {act.comment ? (
                            <div
                              style={{
                                marginTop: 6,
                                padding: '6px 12px',
                                background: 'var(--bg-subtle, rgba(0,0,0,0.03))',
                                borderRadius: 6,
                                fontSize: 13,
                              }}
                            >
                              <strong>审批意见：</strong>{act.comment}
                            </div>
                          ) : (
                            <div style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 13 }}>
                              （无附言意见）
                            </div>
                          )}
                        </div>
                      ),
                    };
                  })
                : [
                    {
                      color: 'orange',
                      dot: <ClockCircleOutlined style={{ fontSize: 16 }} />,
                      children: (
                        <div>
                          <Space size={8} align="center">
                            <strong>【待审批办理】</strong>
                            <Tag color="cyan">@{task.assignee?.username || '协同成员'}</Tag>
                          </Space>
                          <div style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 13 }}>
                            等待审批人在工作台 GTD 收集箱在线处理（承认 / 驳回）。
                          </div>
                        </div>
                      ),
                    },
                  ]),
              // 节点 3: 外部系统联动核销结果
              ...(sync
                ? [
                    {
                      color: sync.success ? 'green' : 'red',
                      dot: <ApiOutlined style={{ fontSize: 16 }} />,
                      children: (
                        <div>
                          <Space size={8} align="center">
                            <strong>【外部系统自动核准与回写】</strong>
                            <Tag color="cyan">{sync.externalSystem || 'HRMS 考勤中心'}</Tag>
                          </Space>
                          <div style={{ marginTop: 6, fontSize: 13 }}>
                            <div>
                              凭证流水号：<code>{sync.trackingNumber || 'AUTO-SETTLED'}</code>
                            </div>
                            <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                              联动状态：{sync.message}
                            </div>
                          </div>
                        </div>
                      ),
                    },
                  ]
                : []),
              // 节点 4: 回执与归档闭环
              ...(task.status !== 'pending'
                ? [
                    {
                      color: 'purple',
                      dot: <FileTextOutlined style={{ fontSize: 16 }} />,
                      children: (
                        <div>
                          <Space size={8} align="center">
                            <strong>【协同回执与归档闭环】</strong>
                            <Tag color="purple">GTD 收件箱</Tag>
                          </Space>
                          <div style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 13 }}>
                            流转结果已作为「协同回执」推入发起人 GTD 收集箱。发起人阅知后可点击【归档】将条目从活动收集箱清理移出（达成 Inbox Zero），历史数据永久沉淀。
                          </div>
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Card>

        {/* 5. 底部防伪溯源说明 */}
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12, paddingBottom: 8 }}>
          <SafetyCertificateOutlined style={{ marginRight: 4 }} />
          本流程日志受企业数据完整性与合规审计保障，遵循 SOC2 / ISO27001 规范标准
        </div>
      </div>
    </Drawer>
  );
}
