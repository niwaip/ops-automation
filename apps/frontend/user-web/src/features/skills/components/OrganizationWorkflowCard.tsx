import React from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Tooltip,
  Typography,
  Steps,
} from 'antd';
import {
  ApartmentOutlined,
  ApiOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FileDoneOutlined,
  KeyOutlined,
  LockOutlined,
  RightOutlined,
} from '@ant-design/icons';
import type { WorkflowTemplateDefinition } from '../../../api/workbenchCoordination';

interface OrganizationWorkflowCardProps {
  template: WorkflowTemplateDefinition;
  onApply: (template: WorkflowTemplateDefinition) => void;
  onViewSchema: (template: WorkflowTemplateDefinition) => void;
  onRequestAccess: (template: WorkflowTemplateDefinition) => void;
}

export const OrganizationWorkflowCard: React.FC<OrganizationWorkflowCardProps> = ({
  template,
  onApply,
  onViewSchema,
  onRequestAccess,
}) => {
  const isAuthorized = template.accessStatus !== 'unauthorized' && template.accessStatus !== 'requested';
  const isRequested = template.accessStatus === 'requested';

  const getWorkflowIcon = (templateId: string) => {
    switch (templateId) {
      case 'hr.leave.request':
        return <CalendarOutlined style={{ fontSize: 24, color: '#1677ff' }} />;
      case 'oa.expense.claim':
        return <DollarOutlined style={{ fontSize: 24, color: '#fa8c16' }} />;
      default:
        return <FileDoneOutlined style={{ fontSize: 24, color: '#722ed1' }} />;
    }
  };

  // 动态解析流程定义中的阶段步骤（来自 5173 管理后台的流程定义）
  const getWorkflowSteps = () => {
    if (template.processDefinition?.stages && template.processDefinition.stages.length > 0) {
      return template.processDefinition.stages.map((stage) => {
        let desc = stage.description;
        if (stage.approverRole) {
          desc += ` [角色: ${stage.approverRole}]`;
        }
        return {
          title: stage.name,
          description: desc,
        };
      });
    }

    // 回退默认步骤
    return [
      { title: '发起申请', description: '员工填写参数卡片' },
      { title: '主管审批', description: 'GTD 收集箱在线核准' },
      { title: '系统联动', description: '底层工作流自动执行' },
      { title: '验收归档', description: '凭证回执沉淀归档' },
    ];
  };

  // 动态渲染组装的 5173 底层普通工作流资产徽标
  const renderAssembledBadges = () => {
    const assembled = template.assembledWorkflows || [];
    if (assembled.length > 0) {
      return (
        <Space wrap size={4}>
          {assembled.map((item) => (
            <Tooltip
              key={item.refId}
              title={`组装底层资产: ${item.type} | ${item.name} (${item.refId})${
                item.description ? ` - ${item.description}` : ''
              }`}
            >
              <Tag color="purple" icon={<ApiOutlined />}>
                已组装: {item.name}
              </Tag>
            </Tooltip>
          ))}
        </Space>
      );
    }

    // 默认 fallback
    if (template.id === 'hr.leave.request') {
      return (
        <Tag color="success" icon={<ApiOutlined />}>
          已接入 Mock Enterprise HRMS
        </Tag>
      );
    }
    if (template.id === 'oa.expense.claim') {
      return (
        <Tag color="orange" icon={<ApiOutlined />}>
          已接入 ERP 财务结算网关
        </Tag>
      );
    }

    return (
      <Tag color="blue" icon={<ApartmentOutlined />}>
        组织标准流程
      </Tag>
    );
  };

  return (
    <Card
      hoverable
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        borderRadius: 12,
        border: isAuthorized ? '1px solid var(--border-color)' : '1px dashed rgba(255, 77, 79, 0.6)',
        background: 'var(--bg-card)',
      }}
      styles={{ body: { display: 'flex', flexDirection: 'column', flex: 1, padding: 20 } }}
    >
      <div style={{ flex: 1 }}>
        {/* 顶部标题与权限标签 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <Space size={12}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                background: 'var(--bg-hover, rgba(255, 255, 255, 0.06))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {getWorkflowIcon(template.id)}
            </div>
            <div>
              <Typography.Text strong style={{ fontSize: 16 }}>
                {template.name}
              </Typography.Text>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                代号：<code>{template.workflowId}</code>
              </div>
            </div>
          </Space>

          {isAuthorized ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              已授权
            </Tag>
          ) : isRequested ? (
            <Tag color="processing" icon={<ClockCircleOutlined />}>
              审批中
            </Tag>
          ) : (
            <Tag color="default" icon={<LockOutlined />}>
              待开通
            </Tag>
          )}
        </div>

        {/* 组装底层工作流徽标 */}
        <div style={{ marginBottom: 12 }}>{renderAssembledBadges()}</div>

        {/* 描述 */}
        <Typography.Paragraph
          type="secondary"
          ellipsis={{ rows: 2 }}
          style={{ fontSize: 13, marginBottom: 16 }}
        >
          {template.description}
        </Typography.Paragraph>

        {/* 流程定义动态步骤链 */}
        <div
          style={{
            background: 'var(--bg-hover, rgba(255, 255, 255, 0.03))',
            border: '1px solid var(--border-color)',
            padding: '12px 10px',
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>
            流程定义链路（基于 5173 编排）：
          </div>
          <Steps size="small" direction="vertical" items={getWorkflowSteps()} />
        </div>
      </div>

      {/* 底部操作栏 */}
      <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
        {isAuthorized ? (
          <Button
            type="primary"
            style={{ flex: 1 }}
            icon={<RightOutlined />}
            onClick={() => onApply(template)}
          >
            发起申请
          </Button>
        ) : isRequested ? (
          <Button
            disabled
            style={{ flex: 1 }}
            icon={<ClockCircleOutlined />}
          >
            开通审批中
          </Button>
        ) : (
          <Button
            type="default"
            style={{ flex: 1, borderColor: '#1677ff', color: '#1677ff' }}
            icon={<KeyOutlined />}
            onClick={() => onRequestAccess(template)}
          >
            申请开通
          </Button>
        )}

        <Button onClick={() => onViewSchema(template)}>
          流程定义 & 契约
        </Button>
      </div>
    </Card>
  );
};
