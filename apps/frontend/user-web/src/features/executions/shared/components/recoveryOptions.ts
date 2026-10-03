export type RecoveryResumeAction =
  | 'resolve_by_human'
  | 'retry_step'
  | 'retry_phase'
  | 'retry'
  | 'resume_from_step';

export interface RecoveryOption {
  value: RecoveryResumeAction;
  label: string;
  description: string;
  badge?: string;
}

export const RECOVERY_RESUME_OPTIONS: RecoveryOption[] = [
  {
    value: 'resolve_by_human',
    label: '人工已处理 / 特批放行（继续下一步）',
    description:
      '适用于在页面已完成手动操作（如登录/滑块），或业务规则/指标已核实特批。系统将标记此步成功并推进后续步骤。',
    badge: '推荐',
  },
  {
    value: 'retry_step',
    label: '重试当前失败步骤',
    description:
      '适用于网络偶发抖动、页面短暂未加载或外部环境已就绪。让机器人重新尝试执行刚才失败的这一步。',
  },
  {
    value: 'retry_phase',
    label: '重新运行整个阶段',
    description:
      '适用于页面状态已脏、表单已被打乱的场景。清空本阶段状态，从该阶段第一步重新开始。',
  },
];

export const RECOVERY_ACTION_DESCRIPTIONS: Record<RecoveryResumeAction, string> = {
  resolve_by_human:
    '适用于已在页面完成手动操作或业务规则特批放行。系统将标记该步骤成功，继续执行后续步骤。',
  retry_step: '让机器人重新尝试执行刚才失败的这一个步骤。',
  retry_phase: '清空当前阶段的所有脏状态，从阶段起始步骤重新开始。',
  retry: '重新运行当前阶段，适用于页面或条件判断需要再次验证的场景。',
  resume_from_step: '从指定步骤继续执行。',
};

export const RECOVERY_ACTION_BUTTON_LABELS: Record<RecoveryResumeAction, string> = {
  resolve_by_human: '确认放行，继续后续步骤',
  retry_step: '重试当前步骤',
  retry_phase: '重新运行整个阶段',
  retry: '重新运行整个阶段',
  resume_from_step: '确认并恢复执行',
};

export const RECOVERY_CONFIRM_DETAILS: Record<
  RecoveryResumeAction,
  { title: string; desc: string; hint: string; okText: string }
> = {
  resolve_by_human: {
    title: '确认放行并继续执行',
    desc: '系统将把当前挂起步骤标记为“人工处理完成”，并继续自动执行后续步骤。',
    hint: '如需人工在网页上操作（例如滑块验证或验证码），请确认您已在远程浏览器中操作完毕。',
    okText: '确认放行，继续执行',
  },
  retry_step: {
    title: '确认重试当前步骤',
    desc: '机器人将重新尝试执行刚才失败的这一步。',
    hint: '请确保外部网络、目标系统或页面已恢复可用。',
    okText: '重试当前步骤',
  },
  retry_phase: {
    title: '确认重新运行整个阶段',
    desc: '将重置当前阶段的所有步骤，并从阶段起点重新开始全流程执行。',
    hint: '适用于页面状态已被打乱或表单数据已脏需要从头跑的场景。',
    okText: '重新运行本阶段',
  },
  retry: {
    title: '确认重新运行整个阶段',
    desc: '将重置当前阶段的所有步骤，并从阶段起点重新开始全流程执行。',
    hint: '适用于页面状态已被打乱或表单数据已脏需要从头跑的场景。',
    okText: '重新运行本阶段',
  },
  resume_from_step: {
    title: '确认恢复执行',
    desc: '将基于当前恢复参数继续执行。',
    hint: '系统将尝试从指定步骤恢复流转。',
    okText: '恢复执行',
  },
};

export const RECOVERY_COPY = {
  panelTitle: '人工干预与处置区域',
  activeHumanControl: '当前执行处于人工接管状态',
  waitingInputTitle: '该执行正在等待补充输入',
  waitingInputDesc:
    '补齐下面参数后可以直接恢复当前执行；也可以先带着参数回到 AI 任务模式，确认后再继续处理。',
  waitingInputContinue: '补参并继续执行',
  waitingInputToAi: '补参后转 AI 任务模式',
  currentPhase: '当前阶段',
  phaseStatus: '阶段状态',
  phaseKey: '阶段 Key',
  resumeAction: '处置方式',
  resumeFromStep: '重试失败的步骤',
  selectStep: '请选择步骤',
  patchJson: '恢复参数 JSON',
  patchJsonPlaceholder: '{"selector": "#new-id", "value": "new-value"}',
  note: '处理记录（选填）',
  notePlaceholder:
    '说明本次人工处理内容，例如：已核实毛利率 17.8%，特批放行；或：已在浏览器手动完成登录验证',
  markResumableOnly: '仅标记可恢复',
  applyAndResume: '应用并恢复执行',
  cancelExecution: '结束执行',
  resumeConfirmTitle: '确认恢复执行',
  resumeConfirmOk: '恢复执行',
  resumeConfirmCancel: '取消',
  resumeConfirmDesc: '将基于当前恢复参数继续执行。',
  resumeConfirmHint: '如果选择“重新运行当前阶段”，会先把阶段标记为可恢复，再立即触发恢复。',
  cancelConfirmTitle: '确认结束执行',
  cancelConfirmOk: '结束执行',
  cancelConfirmCancel: '继续保留',
  cancelConfirmDesc: '确定要结束当前执行吗？任务将被终止。',
  successResume: '已应用处理决策并继续执行',
  successMarkResumable: '已标记阶段可恢复',
  successTakeover: '已发起阶段接管',
  successCancel: '执行已结束',
  resumeErrorPrefix: '恢复执行失败',
  takeoverErrorPrefix: '阶段接管失败',
  cancelErrorPrefix: '结束执行失败',
  invalidJson: '恢复参数 JSON 格式不正确',
  noRecoverablePhase: '当前没有可恢复的阶段',
  retryNote: '人工确认重试当前步骤',
  resolveByHumanNote: '人工已处理 / 特批放行',
  applyPatchNote: '已应用人工输入修复',
} as const;
