import { message } from 'antd';

/**
 * 识别企业主体是否误识别为地址
 */
export const looksLikeAddress = (name?: string): boolean => {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (/(?:公司|集团|厂|局|行|事务所|有限责任|有限合伙)$/.test(trimmed)) return false;
  return (
    /(?:路|街|号|弄|区|道|巷|大厦|中心|大楼|\d+号)$/.test(trimmed) ||
    /(?:省|市|区|县|街|路|大道).*(?:号|室|层)/.test(trimmed)
  );
};

export interface DraftConsistencyCheckContext {
  item: any;
  draft: {
    executionId?: string;
    artifactId?: string;
    sourceDocumentVersion?: string;
    sourceAttachmentId?: string;
    ruleSetDigest?: string;
  };
}

/**
 * 四维一致性防串单/防换版/防漂移校验
 * 返回 true 表示校验通过；若校验不通过则自动弹提示并返回 false
 */
export function validateDraftConsistency({
  item,
  draft,
}: DraftConsistencyCheckContext): boolean {
  const currentExecutionId =
    (item as any)?.executionId ||
    (item?.unifiedPayload as any)?.executionId ||
    (item?.unifiedPayload as any)?.parameters?.executionId;
  if (currentExecutionId && draft.executionId && currentExecutionId !== draft.executionId) {
    message.error(
      `审阅草稿关联任务(${draft.executionId.slice(0, 8)}...)与当前待办任务(${currentExecutionId.slice(0, 8)}...)不一致，已拦截防止串单！`
    );
    return false;
  }

  const currentArtifactId =
    (item as any)?.artifactId ||
    (item?.unifiedPayload as any)?.artifactId ||
    (item?.unifiedPayload as any)?.reviewReport?.artifactId ||
    (item?.unifiedPayload as any)?.parameters?.artifactId;
  if (currentArtifactId && draft.artifactId && currentArtifactId !== draft.artifactId) {
    message.error(
      `审阅草稿关联产物(${draft.artifactId.slice(0, 8)}...)与当前任务产物(${currentArtifactId.slice(0, 8)}...)不一致，已拦截防止产物漂移！`
    );
    return false;
  }

  const currentDocVersion =
    (item as any)?.sourceDocumentVersion ||
    (item?.unifiedPayload as any)?.sourceDocumentVersion ||
    (item?.unifiedPayload as any)?.reviewReport?.sourceDocumentVersion ||
    (item?.unifiedPayload as any)?.parameters?.sourceDocumentVersion;
  if (currentDocVersion && draft.sourceDocumentVersion && currentDocVersion !== draft.sourceDocumentVersion) {
    message.error(
      `审阅草稿关联文档版本(${draft.sourceDocumentVersion.slice(0, 16)}...)与任务原文档版本(${currentDocVersion.slice(0, 16)}...)不一致，已拦截防止文档换版！`
    );
    return false;
  }

  const currentAttachmentId =
    (item as any)?.sourceAttachmentId ||
    (item?.unifiedPayload as any)?.sourceAttachmentId ||
    (item?.unifiedPayload as any)?.reviewReport?.sourceAttachmentId ||
    (item?.unifiedPayload as any)?.parameters?.sourceAttachmentId;
  if (currentAttachmentId && draft.sourceAttachmentId && currentAttachmentId !== draft.sourceAttachmentId) {
    message.error(
      `审阅草稿关联附件(${draft.sourceAttachmentId})与任务原附件(${currentAttachmentId})不一致，已拦截防止附件漂移！`
    );
    return false;
  }

  const currentRuleSetDigest =
    (item as any)?.ruleSetDigest ||
    (item?.unifiedPayload as any)?.ruleSetDigest ||
    (item?.unifiedPayload as any)?.parameters?.ruleSetDigest;
  if (currentRuleSetDigest && draft.ruleSetDigest && currentRuleSetDigest !== draft.ruleSetDigest) {
    message.error(
      `审阅草稿关联审查要件快照(${draft.ruleSetDigest.slice(0, 16)}...)与任务规则快照(${currentRuleSetDigest.slice(0, 16)}...)不一致，已拦截防止规则快照漂移！`
    );
    return false;
  }

  return true;
}
