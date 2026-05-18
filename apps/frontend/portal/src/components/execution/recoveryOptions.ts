export type RecoveryResumeAction = 'retry' | 'resume_from_step' | 'resolve_by_human';

export interface RecoveryOption {
  value: RecoveryResumeAction;
  label: string;
}

export const RECOVERY_RESUME_OPTIONS: RecoveryOption[] = [
  { value: 'retry', label: '从当前阶段开头重试' },
  { value: 'resume_from_step', label: '从指定步骤恢复' },
  { value: 'resolve_by_human', label: '标记为人工已处理' },
];

export const RECOVERY_COPY = {
  panelTitle: '恢复参数和操作区域',
  activeHumanControl: '当前执行处于人工接管状态',
  waitingInputTitle: '该执行正在等待补充输入',
  waitingInputDesc: '补齐下面参数后可以直接恢复当前执行；也可以先带着参数回到 AI 任务模式，确认后再继续处理。',
  waitingInputContinue: '补参并继续执行',
  waitingInputToAi: '补参后转 AI 任务模式',
  currentPhase: '当前阶段',
  phaseStatus: '阶段状态',
  phaseKey: '阶段 Key',
  resumeAction: '恢复动作',
  resumeFromStep: '从指定步骤恢复',
  selectStep: '请选择步骤',
  patchJson: '恢复参数 JSON',
  patchJsonPlaceholder: '{"selector": "#new-id", "value": "new-value"}',
  note: '处理备注',
  notePlaceholder: '说明这次人工处理做了什么',
  markResumableOnly: '仅标记可恢复',
  applyAndResume: '应用并恢复执行',
  cancelExecution: '结束执行',
  resumeConfirmTitle: '确认恢复执行',
  resumeConfirmOk: '恢复执行',
  resumeConfirmCancel: '取消',
  resumeConfirmDesc: '将基于当前恢复参数继续执行。',
  resumeConfirmHint: '如果选择“从当前阶段开头重试”，会先把阶段标记为可恢复，再立即触发恢复。',
  cancelConfirmTitle: '确认结束执行',
  cancelConfirmOk: '结束执行',
  cancelConfirmCancel: '继续保留',
  cancelConfirmDesc: '确定要结束当前执行吗？',
  successResume: '已应用恢复参数并继续执行',
  successMarkResumable: '已标记阶段可恢复',
  successTakeover: '已发起阶段接管',
  successCancel: '执行已结束',
  resumeErrorPrefix: '恢复执行失败',
  takeoverErrorPrefix: '阶段接管失败',
  cancelErrorPrefix: '结束执行失败',
  invalidJson: '恢复参数 JSON 格式不正确',
  noRecoverablePhase: '当前没有可恢复的阶段',
  retryNote: '从当前阶段开头重试',
  resolveByHumanNote: '人工已处理',
  applyPatchNote: '已应用人工输入修复',
} as const;
