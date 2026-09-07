import React from 'react';
import { Modal, Tabs, Tag, Typography, Space, Alert, theme } from 'antd';
import {
  CodeOutlined,
  ApartmentOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { AvailableBaseWorkflowItem } from '@/api/orgWorkflow';

const { Text } = Typography;

interface WorkflowContractModalProps {
  visible: boolean;
  workflow: AvailableBaseWorkflowItem | null;
  onClose: () => void;
}

export const WorkflowContractModal: React.FC<WorkflowContractModalProps> = ({
  visible,
  workflow,
  onClose,
}) => {
  const { token } = theme.useToken();

  if (!workflow) return null;

  const sampleInput = {
    context: {
      enterpriseId: 'ent_corp_sample',
      workflowKey: workflow.id,
      traceId: 'tr_leave_20260905_8829a',
      initiatedChannel: 'web_chat_composer',
    },
    parties: {
      applicant: {
        userId: 'u_applicant_001',
        username: 'alice',
        departmentName: '技术研发中心',
        roleKey: 'employee',
      },
      handler: {
        userId: 'u_handler_002',
        username: 'bob_leader',
        roleKey: 'dept_leader',
      },
      recipients: [{ userId: 'u_applicant_001' }],
    },
    formData: {
      leaveType: '事假',
      startTime: '2026-09-06 09:00',
      endTime: '2026-09-06 18:00',
      durationHours: 8,
      reason: '个人家庭事务请假办理',
    },
    mode: 'submit',
  };

  const sampleOutput = {
    success: true,
    resolvedParties: {
      applicantId: 'u_applicant_001',
      handlerId: 'u_handler_002',
      handlerName: 'bob_leader',
      handlerRoleTitle: '直属技术主管',
      assignedApproverRule: 'leader',
    },
    externalReference: {
      systemType: 'feishu_or_sap',
      externalDocNumber: 'EXT_APPL_20260905_102',
      syncStatus: 'synced',
    },
    validationSummary: {
      rulePassed: true,
      quotaAvailable: 16,
      auditLogs: ['已核验申请人在岗状态', '假期配额满足要求', '经办担当人可达'],
    },
    pipelineContext: {
      formDigest: 'sha256_9f82c1...',
      submissionTimestamp: '2026-09-05T22:00:00.000Z',
    },
  };

  const sampleSynthesisDescriptor = {
    enterpriseId: 'ent_custom_corp',
    workflowKey: workflow.id,
    backendConnector: {
      type: 'feishu',
      endpointUrl: 'https://open.feishu.cn/open-apis/attendance',
      adapterMapping: {
        leaveType: 'vacation_code',
        durationHours: 'duration_units',
      },
    },
    handlerPolicy: {
      rule: 'matrix_lookup',
      matrixRules: [
        { conditionExpr: 'durationHours <= 24', assignRole: 'dept_leader' },
        { conditionExpr: 'durationHours > 24', assignRole: 'division_director' },
      ],
    },
    validationRules: [
      {
        ruleCode: 'CHECK_QUOTA_BALANCE',
        action: 'query_api',
        failMessage: '年假余额不足！',
      },
    ],
  };

  const codeBoxStyle: React.CSSProperties = {
    background: token.colorFillAlter,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: 8,
    padding: 12,
    fontFamily: 'monospace',
    fontSize: 12,
    color: token.colorText,
    maxHeight: 280,
    overflowY: 'auto',
  };

  return (
    <Modal
      title={
        <Space>
          <SafetyCertificateOutlined style={{ color: token.colorPrimary }} />
          <span>固定端口契约规范 (Fixed Port Contract) - {workflow.name}</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={720}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
        <Alert
          message="接口契约必须固定的设计原则"
          description="无论底层对接哪家企业的何种系统（飞书、钉钉、SAP、金蝶或自研系统），此原子流均实现相同的 I/O 协议。因此 5173 企业审批流在组装该流时，可保证 100% 稳定运行。"
          type="info"
          showIcon
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Tag color="purple">ID: {workflow.id}</Tag>
          <Tag color="blue">{workflow.stageType || 'automation'}</Tag>
          {workflow.handlerRule && (
            <Tag color="geekblue" icon={<UserOutlined />}>
              经办担当: {workflow.handlerRule}
            </Tag>
          )}
        </div>

        <Tabs
          defaultActiveKey="input"
          items={[
            {
              key: 'input',
              label: (
                <span>
                  <CodeOutlined /> 输入信封 (Input Payload)
                </span>
              ),
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    标准输入信封规范（固定包含组织要素：申请人 `applicant`、承办经办担当 `handler`、表单参数 `formData`）：
                  </Text>
                  <pre style={codeBoxStyle}>{JSON.stringify(sampleInput, null, 2)}</pre>
                </div>
              ),
            },
            {
              key: 'output',
              label: (
                <span>
                  <CodeOutlined /> 输出响应 (Output Response)
                </span>
              ),
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    标准输出响应规范（固定返回决议担当人 `resolvedParties`、外部后台存根 `externalReference` 及校验摘要）：
                  </Text>
                  <pre style={codeBoxStyle}>{JSON.stringify(sampleOutput, null, 2)}</pre>
                </div>
              ),
            },
            {
              key: 'synthesis',
              label: (
                <span>
                  <ApartmentOutlined /> 企业自动生成描述符 (Synthesis DSL)
                </span>
              ),
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    针对不同企业自动合成该原子工作流时，仅需输入本描述符，系统即自动生成匹配对应外部后台与规则的原子流：
                  </Text>
                  <pre style={codeBoxStyle}>
                    {JSON.stringify(sampleSynthesisDescriptor, null, 2)}
                  </pre>
                </div>
              ),
            },
          ]}
        />
      </div>
    </Modal>
  );
};
