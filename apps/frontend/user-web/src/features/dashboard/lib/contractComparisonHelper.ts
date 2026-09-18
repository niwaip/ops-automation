import { useChatStore, type ChatTaskAttachment } from '../../chat/chatStore';
import type { CoordinationAttachment } from '../../../api/workbenchCoordination';

export interface ContractComparisonPair {
  baseDoc: ChatTaskAttachment;
  latestDoc: ChatTaskAttachment;
  totalVersions: number;
}

/**
 * 判断是否为非合同正文的报告/辅助类文件（如 HTML 审查报告）
 */
export function isNonContractReportFile(
  file?: { name?: string; url?: string; mimeType?: string } | null
): boolean {
  if (!file) return true;
  const name = file.name?.toLowerCase() || '';
  const url = file.url?.toLowerCase() || '';
  const mime = file.mimeType?.toLowerCase() || '';

  if (name.endsWith('.html') || name.endsWith('.htm') || url.includes('.html') || url.includes('.htm')) {
    return true;
  }
  if (mime.includes('html')) {
    return true;
  }
  return false;
}

/**
 * 提取并归一化任务中的所有有效合同文档版本（自动排除 HTML 审查报告）
 * 顺序统一为按版本升序：[V1, V2, ..., VN]
 */
export function resolveContractDocVersions(
  originalAttachments: Array<CoordinationAttachment | ChatTaskAttachment | undefined | null> = [],
  appendedFiles: Array<CoordinationAttachment | ChatTaskAttachment | undefined | null> = [],
  parameters?: Record<string, any>
): ChatTaskAttachment[] {
  const normalizeDocUrl = (att: any): string | undefined => {
    if (att?.url && typeof att.url === 'string' && att.url.trim()) {
      return att.url.trim();
    }
    if (att?.attachmentId && typeof att.attachmentId === 'string' && att.attachmentId.trim()) {
      return `/api/workbench-coordination/attachments/${encodeURIComponent(att.attachmentId.trim())}/download?fileName=${encodeURIComponent(att.name || 'document.docx')}`;
    }
    return undefined;
  };

  // 1. 过滤原始附件中的有效合同文档
  const validOriginals = (originalAttachments || []).filter(
    (att): att is CoordinationAttachment | ChatTaskAttachment =>
      Boolean(att && (normalizeDocUrl(att) || att.name?.trim()) && !isNonContractReportFile(att))
  );

  // 2. 过滤追加的新版本文件
  const validAppended = (appendedFiles || []).filter(
    (att): att is CoordinationAttachment | ChatTaskAttachment =>
      Boolean(att && (normalizeDocUrl(att) || att.name?.trim()) && !isNonContractReportFile(att))
  );

  // 3. 如果原始附件暂未载入但 parameters 携带了初稿地址
  if (
    validOriginals.length === 0 &&
    parameters?.downloadUrl &&
    !isNonContractReportFile({ name: parameters?.fileName, url: parameters?.downloadUrl })
  ) {
    validOriginals.push({
      name: parameters.fileName || parameters.contractFileName || '合同初始初稿.docx',
      url: parameters.downloadUrl,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  // 4. 如果 parameters 中包含明确的 originalDraftUrl 且在列表中未出现，补充为初始初稿
  if (
    parameters?.originalDraftUrl &&
    !validOriginals.some((a) => (a.url && a.url === parameters.originalDraftUrl) || a.name === parameters.originalDraftFileName)
  ) {
    validOriginals.push({
      name: parameters.originalDraftFileName || '保密合同_初始初稿.docx',
      url: parameters.originalDraftUrl,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  // CoordinationFileReplacer 中 validOriginals 为最新置顶倒序：Index 0 是最新，Index (length-1) 是 V1
  // 反转为按版本时间升序排列：[V1, V2, ..., VN]
  const chronologicalOriginals = [...validOriginals].reverse();

  // 追加的文件属于更新的版本，拼接至末尾
  const combined = [...chronologicalOriginals, ...validAppended];

  // 按 URL 去重（若无 URL 则按文件名去重）
  const seenKeys = new Set<string>();
  const result: ChatTaskAttachment[] = [];
  for (const rawDoc of combined) {
    const docUrl = normalizeDocUrl(rawDoc) || (rawDoc === combined[combined.length - 1] ? parameters?.downloadUrl : undefined);
    const key = docUrl || rawDoc.name;
    if (key && !seenKeys.has(key)) {
      seenKeys.add(key);
      result.push({
        name: rawDoc.name || '合同文档.docx',
        url: docUrl,
        size: rawDoc.size,
        mimeType: rawDoc.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    }
  }

  return result;
}

export interface FormattedContractVersion {
  versionNumber: number;
  versionLabel: string;
  isLatest: boolean;
  name: string;
  url?: string;
  size?: number;
  mimeType?: string;
}

/**
 * 提取结构化合同版本列表，按最新版本置顶倒序输出：[VN, VN-1, ..., V1]
 */
export function getFormattedContractVersions(
  originalAttachments: Array<CoordinationAttachment | ChatTaskAttachment | undefined | null> = [],
  appendedFiles: Array<CoordinationAttachment | ChatTaskAttachment | undefined | null> = [],
  parameters?: Record<string, any>
): FormattedContractVersion[] {
  const ascendingVersions = resolveContractDocVersions(originalAttachments, appendedFiles, parameters);
  if (ascendingVersions.length === 0) {
    return [];
  }

  const total = ascendingVersions.length;
  // 反转为倒序（最新版本排在最前）
  return [...ascendingVersions].reverse().map((doc, idx) => {
    const versionNumber = total - idx;
    const isLatest = idx === 0;
    const versionLabel =
      total === 1
        ? '送审版本'
        : isLatest
        ? `V${versionNumber} · 最新生效版`
        : versionNumber === 1
        ? 'V1 · 初始初稿'
        : `V${versionNumber} · 经办人修订版`;

    return {
      versionNumber,
      versionLabel,
      isLatest,
      name: doc.name || '合同文档.docx',
      url: doc.url,
      size: doc.size,
      mimeType: doc.mimeType,
    };
  });
}

/**
 * 判定是否存在 2 个及以上版本，并提取对比基准版本 (A) 与最新版本 (B)
 */
export function getContractComparisonPair(
  originalAttachments: Array<CoordinationAttachment | ChatTaskAttachment | undefined | null> = [],
  appendedFiles: Array<CoordinationAttachment | ChatTaskAttachment | undefined | null> = [],
  parameters?: Record<string, any>
): ContractComparisonPair | null {
  const versions = resolveContractDocVersions(originalAttachments, appendedFiles, parameters);
  if (versions.length < 2) {
    return null;
  }

  // 升序排列：[0] 为 V1 初稿基准，[length - 1] 为最新送审/修订版本
  const baseDoc = versions[0];
  const latestDoc = versions[versions.length - 1];

  return {
    baseDoc,
    latestDoc,
    totalVersions: versions.length,
  };
}

/**
 * 将两份合同文档引用至 AI 窗口并预填「比较合同」，调用 platform.document.contract-comparator
 */
export function triggerContractComparisonInAi(options: {
  taskId?: string;
  taskTitle?: string;
  baseDoc: ChatTaskAttachment;
  latestDoc: ChatTaskAttachment;
  parameters?: Record<string, any>;
}): void {
  const { taskId, taskTitle, baseDoc, latestDoc, parameters = {} } = options;

  useChatStore.getState().openWithTaskContext(
    {
      taskId,
      taskTitle: taskTitle || '合同比对与红线审查',
      workflowId: 'platform.document.contract-comparator',
      taskContent: `对比基准版本【${baseDoc.name}】与修订版本【${latestDoc.name}】的条款差异，重点排查修改项并生成左右红线审查报告。`,
      parameters: {
        ...parameters,
        fileNameA: baseDoc.name,
        fileUrlA: baseDoc.url,
        downloadUrlA: baseDoc.url,
        fileNameB: latestDoc.name,
        fileUrlB: latestDoc.url,
        downloadUrlB: latestDoc.url,
        baseFileName: baseDoc.name,
        compareFileName: latestDoc.name,
      },
      attachments: [baseDoc, latestDoc],
    },
    '比较合同'
  );
}
