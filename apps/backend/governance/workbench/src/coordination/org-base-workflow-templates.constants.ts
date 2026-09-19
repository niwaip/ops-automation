import { AssembledBaseWorkflow, AvailableBaseWorkflowItem } from './org-workflow.entity';

/**
 * 流程专用基础工作流资产池（供管理员组装企业工作流）
 * 初始为空，由管理员通过「AI 对话创建原子流」从第一步按需创建并注册
 */
export const DEDICATED_BASE_WORKFLOW_TEMPLATES: AvailableBaseWorkflowItem[] = [];

/**
 * 预置默认合同起草与法务审查企业工作流的标准组装配置
 */
export const DEFAULT_CONTRACT_REVIEW_ASSEMBLED_WORKFLOWS: AssembledBaseWorkflow[] = [
  {
    type: 'skill',
    refId: 'platform.document.pdf-create',
    name: '合同初稿生成引擎',
    triggerEvent: 'on_submit',
    stageType: 'submission',
    description: '根据录入的商务参数自动生成标准合同草案',
  },
  {
    type: 'skill',
    refId: 'platform.document.contract-reviewer',
    name: '合同文档智能审查与合规诊断',
    triggerEvent: 'on_stage_approval',
    stageType: 'approval',
    description: '法务审查时执行条款树解析与合规诊断，输出审查报告与修改建议',
  },
  {
    type: 'skill',
    refId: 'platform.notification.internal-message',
    name: '流转凭证与回执通知',
    triggerEvent: 'on_complete',
    stageType: 'archive',
    description: '审批通过后推送归档凭证，驳回时推送法务批注说明',
  },
];

/**
 * 预置保密合同专用企业工作流的标准组装配置
 * 第 1 阶段专门挂载专属保密合同生成技能 (ConfidentialityAgreementGenerationWorkflow)
 */
export const DEFAULT_NDA_ASSEMBLED_WORKFLOWS: AssembledBaseWorkflow[] = [
  {
    type: 'skill',
    refId: 'ConfidentialityAgreementGenerationWorkflow',
    name: '商业保密协议(NDA)智能生成技能',
    triggerEvent: 'on_submit',
    stageType: 'submission',
    description: '根据双方企业主体、保密期限、商业合作主题等要件生成标准保密合同草案',
  },
  {
    type: 'skill',
    refId: 'workbench.task.initiator-confirm',
    name: '业务担当初稿核对与确认',
    triggerEvent: 'on_stage_approval',
    stageType: 'approval',
    description: '执行初稿生成后，由业务担当查看并核对生成的内容与条款要素，确认通过后流转至合同审查',
  },
  {
    type: 'skill',
    refId: 'platform.document.contract-reviewer',
    name: '合同文档智能审查与合规诊断',
    triggerEvent: 'on_stage_approval',
    stageType: 'automation',
    stageId: 'contract_review_execution',
    config: {
      contractType: 'nda',
      myPosition: 'buyer',
    },
    description: '担当确认后自动执行合同合规审查规则库，排查永久保密陷阱、除外责任及违约条款，输出审查报告',
  },
  {
    type: 'skill',
    refId: 'workbench.task.legal-review',
    name: '法务合规核准与确认',
    triggerEvent: 'on_stage_approval',
    stageType: 'approval',
    stageId: 'legal_review',
    description: '法务专员结合初稿内容与合同审查报告进行最终核准与批注把关，核准通过后归档存证',
  },
  {
    type: 'skill',
    refId: 'platform.document.pdf-create',
    name: '防篡改电子凭证与归档存证',
    triggerEvent: 'on_stage_approval',
    stageType: 'automation',
    stageId: 'auto_archiving',
    description: '法务审核通过后自动生成不可篡改标准 PDF 版本并固化存证',
  },
  {
    type: 'skill',
    refId: 'platform.notification.internal-message',
    name: '流转凭证与回执通知',
    triggerEvent: 'on_complete',
    stageType: 'archive',
    description: '流程闭环后向发起员工与法务专员推送企业微信/邮件办结凭证',
  },
];
