/**
 * 流程专用原子工作流标准化接口契约 (Standard Port Contracts)
 *
 * 核心设计目标：
 * 无论面对何种企业后台（如飞书、钉钉、SAP、用友、金蝶或自研系统）以及何种企业规则（年假额度、试用期限制、层级阶梯），
 * 自动生成的原子工作流（提单经办、协同审批、系统执行、通知归档）均必须遵循本固定契约。
 * 从而保证 5173 审批流编排引擎能以 100% 统一的逻辑完成自由组装，无需修改上层编排代码。
 */

/**
 * 1. 业务干系人固定要素（Parties Contract）
 * 必须显式携带申请人、经办担当人 (@handler)、核决审批人与归档人
 */
export interface WorkflowPartyMember {
  userId: string;
  username: string;
  displayName?: string;
  email?: string;
  departmentId?: string;
  departmentName?: string;
  roleKey?: string; // 如 "employee", "dept_leader", "hr_specialist", "finance_auditor"
}

export interface WorkflowPartiesEnvelope {
  /** 发起人 / 申请人 */
  applicant: WorkflowPartyMember;
  /** 承办 / 经办业务担当人（@担当，负责处理或推进该流程） */
  handler?: WorkflowPartyMember;
  /** 建议审批人（可选，由规则计算决议） */
  targetApprover?: WorkflowPartyMember;
  /** 抄送 / 归档接收人列表 */
  recipients?: WorkflowPartyMember[];
}

/**
 * 2. 提单申请专用流固定端口 (Submission Port)
 */
export interface WorkflowSubmissionInput<TFormData = Record<string, any>> {
  context: {
    enterpriseId: string;       // 租户 / 企业标识
    workflowKey: string;        // 流程契约唯一代号，如 "hr.leave.request"
    traceId: string;            // 链路追踪 ID
    initiatedChannel?: string;  // 触发渠道：web / im / api / voice
  };
  parties: WorkflowPartiesEnvelope;
  formData: TFormData;          // 业务表单数据（经过 paramsSchema 校验）
  mode: 'dry_run_validate' | 'submit'; // 支持仅执行前置校验，或正式提单
}

export interface WorkflowSubmissionOutput {
  success: boolean;
  /** 决议后的最终经办担当与审批人员（推入下游审批与收集箱） */
  resolvedParties: {
    applicantId: string;
    handlerId: string;          // 确定的担当人 ID (如 @test)
    handlerName: string;
    handlerRoleTitle: string;   // 担当人称谓，如 "直属主管"、"人事经办专员"
    assignedApproverRule: string;
  };
  /** 外部企业后台对接存据（如已在飞书/SAP 生成预申请草稿） */
  externalReference?: {
    systemType: string;         // "feishu" | "sap" | "kingdee" | "custom_oa"
    externalDocNumber: string;  // 外部单据号
    syncStatus: 'synced' | 'pending' | 'mocked';
    rawPayload?: Record<string, any>;
  };
  /** 前置业务规则核算摘要（如年假额度扣除预估） */
  validationSummary?: {
    rulePassed: boolean;
    quotaAvailable?: number;
    auditLogs: string[];
  };
  /** 向下游流转透传的不可变上下文 */
  pipelineContext: Record<string, any>;
  error?: {
    code: string;               // "QUOTA_EXCEEDED" | "INVALID_HANDLER" | "RESTRICTED_DATE"
    message: string;
  };
}

/**
 * 3. 协同审批流固定端口 (Approval Port)
 */
export interface WorkflowApprovalInput {
  taskId: string;
  workflowKey: string;
  operator: WorkflowPartyMember; // 执行核决的主管/审批担当
  action: 'approve' | 'reject' | 'delegate' | 'return_for_modification';
  comment?: string;
  pipelineContext: Record<string, any>;
}

export interface WorkflowApprovalOutput {
  success: boolean;
  finalDecision: 'approved' | 'rejected' | 'pending_next_stage';
  approverLog: {
    operatorId: string;
    action: string;
    timestamp: string;
    comment?: string;
  };
  pipelineContext: Record<string, any>;
}

/**
 * 4. 系统自动化执行流固定端口 (Automation Port)
 */
export interface WorkflowAutomationInput {
  workflowKey: string;
  parties: WorkflowPartiesEnvelope;
  approvedFormData: Record<string, any>;
  pipelineContext: Record<string, any>;
}

export interface WorkflowAutomationOutput {
  success: boolean;
  externalTransactionId?: string; // 外部 HRMS/ERP 实际扣减交易号
  executionSummary: string;
  auditTrail: string[];
}

/**
 * 5. 通知回执与归档流固定端口 (Archive Port)
 */
export interface WorkflowArchiveInput {
  taskId: string;
  workflowKey: string;
  applicantId: string;
  handlerId: string;
  receiptSnapshot: {
    workflowName: string;
    finalDecision: string;
    completedAt: string;
    summary: string;
    voucherPdfUrl?: string;
  };
}

export interface WorkflowArchiveOutput {
  success: boolean;
  inboxArchived: boolean;        // 收集箱待办是否已清除归档
  archiveRecordId: string;       // 审计存证 ID
  receiptDeliveredTo: string[];  // 回执通知已推送的用户列表
}

/**
 * 6. 面向不同企业的原子工作流生成规范配置 (Enterprise Workflow Synthesis Descriptor)
 * 实施时只需提供本描述符，系统编译器即可自动合成符合上述固定契约的原子工作流
 */
export interface EnterpriseWorkflowSynthesisDescriptor {
  enterpriseId: string;
  workflowKey: string;
  backendConnector: {
    type: 'feishu' | 'dingtalk' | 'sap' | 'kingdee' | 'rest_api' | 'builtin_mock';
    endpointUrl?: string;
    credentialSecretRef?: string;
    adapterMapping?: Record<string, string>; // 表单字段到外部系统字段的映射字典
  };
  handlerPolicy: {
    rule: 'direct_leader' | 'role_pool' | 'form_specified' | 'matrix_lookup';
    fallbackHandlerUserId?: string;
    matrixRules?: Array<{
      conditionExpr: string;   // 如 "durationHours > 24"
      assignRole: string;      // 如 "director"
    }>;
  };
  validationRules: Array<{
    ruleCode: string;          // 如 "CHECK_VACATION_BALANCE"
    action: 'query_api' | 'script' | 'builtin';
    expression?: string;
    failMessage: string;
  }>;
}
