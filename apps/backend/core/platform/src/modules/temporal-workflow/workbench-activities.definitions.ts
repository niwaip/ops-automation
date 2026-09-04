import type { BuiltinActivityDefinition } from './builtin-activity.registry';
import { BUILTIN_ACTIVITY_REF_PREFIX } from './builtin-activity.registry';
import {
  FIXED_EMAIL_FETCH_UNREAD_ACTIVITY_CODE,
  FIXED_EMAIL_FETCH_UNREAD_ACTIVITY_FN,
  FIXED_EMAIL_MARK_READ_ACTIVITY_CODE,
  FIXED_EMAIL_MARK_READ_ACTIVITY_FN,
  FIXED_EXECUTION_INTERVENTION_GATE_ACTIVITY_CODE,
  FIXED_EXECUTION_INTERVENTION_GATE_ACTIVITY_FN,
  FIXED_INBOX_COLLECT_ACTIVITY_CODE,
  FIXED_INBOX_COLLECT_ACTIVITY_FN,
  FIXED_TODO_SYNC_EXTERNAL_ACTIVITY_CODE,
  FIXED_TODO_SYNC_EXTERNAL_ACTIVITY_FN,
} from './workbench-activity-templates';

export const EMAIL_FETCH_UNREAD_ACTIVITY_KEY = 'emailFetchUnread';
export const INBOX_COLLECT_ACTIVITY_KEY = 'inboxCollect';
export const EMAIL_MARK_READ_ACTIVITY_KEY = 'emailMarkRead';
export const TODO_SYNC_EXTERNAL_ACTIVITY_KEY = 'todoSyncExternal';
export const EXECUTION_INTERVENTION_GATE_ACTIVITY_KEY = 'executionInterventionGate';

export const EMAIL_FETCH_UNREAD_STEP_CONFIG_KEY = '__emailFetchUnread';
export const INBOX_COLLECT_STEP_CONFIG_KEY = '__inboxCollect';
export const EMAIL_MARK_READ_STEP_CONFIG_KEY = '__emailMarkRead';
export const TODO_SYNC_EXTERNAL_STEP_CONFIG_KEY = '__todoSyncExternal';
export const EXECUTION_INTERVENTION_GATE_STEP_CONFIG_KEY = '__executionInterventionGate';

export function getWorkbenchBuiltinActivities(): BuiltinActivityDefinition[] {
  const emailFetchUnread: BuiltinActivityDefinition = {
    key: EMAIL_FETCH_UNREAD_ACTIVITY_KEY,
    ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${EMAIL_FETCH_UNREAD_ACTIVITY_KEY}`,
    version: '1.0.0',
    name: '拉取未读邮件',
    fn: FIXED_EMAIL_FETCH_UNREAD_ACTIVITY_FN,
    timeout: '60s',
    retryPolicy: { maxRetries: 3, backoffMs: 1000 },
    handler: 'api',
    config: {
      stepConfigKey: EMAIL_FETCH_UNREAD_STEP_CONFIG_KEY,
      defaultStepConfig: {
        maxCount: 20,
      },
    },
    generatedCode: FIXED_EMAIL_FETCH_UNREAD_ACTIVITY_CODE,
    readonly: true,
    description: '从用户绑定的个人或企业邮箱中拉取最新未读邮件列表与元数据',
  };

  const inboxCollect: BuiltinActivityDefinition = {
    key: INBOX_COLLECT_ACTIVITY_KEY,
    ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${INBOX_COLLECT_ACTIVITY_KEY}`,
    version: '1.0.0',
    name: '沉淀入 GTD 收件箱',
    fn: FIXED_INBOX_COLLECT_ACTIVITY_FN,
    timeout: '30s',
    retryPolicy: { maxRetries: 2, backoffMs: 500 },
    handler: 'api',
    config: {
      stepConfigKey: INBOX_COLLECT_STEP_CONFIG_KEY,
      defaultStepConfig: {
        sourceType: 'EMAIL',
        autoDeduplicate: true,
      },
    },
    generatedCode: FIXED_INBOX_COLLECT_ACTIVITY_CODE,
    readonly: true,
    description: '将外部任务、邮件或消息按统一规范存入 GTD 收件箱并自动去重',
  };

  const emailMarkRead: BuiltinActivityDefinition = {
    key: EMAIL_MARK_READ_ACTIVITY_KEY,
    ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${EMAIL_MARK_READ_ACTIVITY_KEY}`,
    version: '1.0.0',
    name: '标记邮件已读',
    fn: FIXED_EMAIL_MARK_READ_ACTIVITY_FN,
    timeout: '30s',
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    handler: 'api',
    config: {
      stepConfigKey: EMAIL_MARK_READ_STEP_CONFIG_KEY,
      defaultStepConfig: {},
    },
    generatedCode: FIXED_EMAIL_MARK_READ_ACTIVITY_CODE,
    readonly: true,
    description: '回写邮件服务，将指定 messageId 列表标记为已读',
  };

  const todoSyncExternal: BuiltinActivityDefinition = {
    key: TODO_SYNC_EXTERNAL_ACTIVITY_KEY,
    ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${TODO_SYNC_EXTERNAL_ACTIVITY_KEY}`,
    version: '1.0.0',
    name: '同步待办至外部插件',
    fn: FIXED_TODO_SYNC_EXTERNAL_ACTIVITY_FN,
    timeout: '45s',
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    handler: 'api',
    config: {
      stepConfigKey: TODO_SYNC_EXTERNAL_STEP_CONFIG_KEY,
      defaultStepConfig: {
        providerId: 'microsoft_todo',
      },
    },
    generatedCode: FIXED_TODO_SYNC_EXTERNAL_ACTIVITY_CODE,
    readonly: true,
    description: '将内部待办任务广播导出到已启用的外部插件（如微软 To Do、Google Tasks）',
  };

  const executionInterventionGate: BuiltinActivityDefinition = {
    key: EXECUTION_INTERVENTION_GATE_ACTIVITY_KEY,
    ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${EXECUTION_INTERVENTION_GATE_ACTIVITY_KEY}`,
    version: '1.0.0',
    name: '人工介入决策门禁',
    fn: FIXED_EXECUTION_INTERVENTION_GATE_ACTIVITY_FN,
    timeout: '15s',
    retryPolicy: { maxRetries: 1, backoffMs: 500 },
    handler: 'api',
    config: {
      stepConfigKey: EXECUTION_INTERVENTION_GATE_STEP_CONFIG_KEY,
      defaultStepConfig: {},
    },
    generatedCode: FIXED_EXECUTION_INTERVENTION_GATE_ACTIVITY_CODE,
    readonly: true,
    description: '根据运行模式与状态判定是否需要将异常或审批任务送入 GTD 收件箱等待人工处理',
  };

  return [
    emailFetchUnread,
    inboxCollect,
    emailMarkRead,
    todoSyncExternal,
    executionInterventionGate,
  ];
}
