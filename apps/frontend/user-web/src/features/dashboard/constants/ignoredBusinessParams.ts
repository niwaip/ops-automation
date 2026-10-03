/**
 * 业务参数黑名单与过滤工具
 * 确保所有系统内部运行参数、协同流程元数据、Word批注注入技术字段绝对不面向最终用户展示
 */

export const IGNORED_BUSINESS_PARAM_KEYS = new Set<string>([
  // 文件与下载链接
  'downloadUrl',
  'fileUrl',
  'contractUrl',
  'fileName',
  'contractFileName',
  'originalDraftUrl',
  'originalDraftFileName',
  'originalDraftSize',
  'isDraftReplaced',
  'rawContent',
  'text',

  // 任务与流程编排
  'executionId',
  'taskId',
  'taskType',
  'originalTaskType',
  'stage',
  'currentStage',
  'isReceipt',
  'receiptAction',
  'isAsync',

  // 审阅与结构化分析结果
  'clauses',
  'reviewReport',
  'artifacts',
  'metrics',
  'checkedRules',
  'summaryItems',
  'ruleSetDigest',
  'ruleSetId',
  'ruleSetVersion',
  'reviewDraft',
  'approvalOpinions',
  'stagedComments',
  'findingStates',

  // 系统运行时与 Word 批注回写元数据（严格不向最终用户展示）
  'hasAnnotatedDocx',
  'annotatedDocxUrl',
  'commentInjectionError',
  'commentInjectionStats',
  'sourceAttachmentId',
  'sourceDocumentHash',
  'sourceDocumentVersion',

  // 业务专区已有单独卡片/控件展示的核心商务要件（避免在非格式化键值列表里重复展示）
  'contractTitle',
  'contractType',
  'myPosition',
  'durationYears',
  'counterpartyName',
  'counterpartyAddress',
  'counterpartyRole',
  'ourParty',
  'ourRole',
  'ourCompany',
  'cooperationSubject',
  'signDate',
  'penaltyAmount',
  'contractAmount',
  'amount',
  'remarks',
]);

/**
 * 判断某个键值是否属于面向最终用户可见的业务要件
 */
export function isUserFacingBusinessParam(key: string, value: any): boolean {
  if (IGNORED_BUSINESS_PARAM_KEYS.has(key)) return false;
  if (key.startsWith('_')) return false;
  if (typeof value === 'object' && value !== null) return false;
  if (value === undefined || value === null || value === '') return false;
  return true;
}
