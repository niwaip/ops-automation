import { AssembledBaseWorkflow, AvailableBaseWorkflowItem } from './org-workflow.entity';

/**
 * 流程专用基础工作流资产池（供 5173 管理员组装企业工作流）
 * 初始为空，由管理员通过「AI 对话创建原子流」从第一步按需创建并注册
 */
export const DEDICATED_BASE_WORKFLOW_TEMPLATES: AvailableBaseWorkflowItem[] = [];

/**
 * 预置默认员工请假审批企业工作流的标准组装配置（初始为空，由管理员组装）
 */
export const DEFAULT_LEAVE_ASSEMBLED_WORKFLOWS: AssembledBaseWorkflow[] = [];

/**
 * 预置默认费用报销审批企业工作流的标准组装配置（初始为空，由管理员组装）
 */
export const DEFAULT_EXPENSE_ASSEMBLED_WORKFLOWS: AssembledBaseWorkflow[] = [];

/**
 * 预置默认通用协同任务的标准组装配置（初始为空，由管理员组装）
 */
export const DEFAULT_GENERAL_COORDINATION_ASSEMBLED_WORKFLOWS: AssembledBaseWorkflow[] = [];
