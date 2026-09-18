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
  // 1. 过滤原始附件中的有效合同文档
  const validOriginals = (originalAttachments || []).filter(
    (att): att is CoordinationAttachment | ChatTaskAttachment =>
      Boolean(att && (att.url?.trim() || att.name?.trim()) && !isNonContractReportFile(att))
  );

  // 2. 过滤追加的新版本文件
  const validAppended = (appendedFiles || []).filter(
    (att): att is CoordinationAttachment | ChatTaskAttachment =>
      Boolean(att && (att.url?.trim() || att.name?.trim()) && !isNonContractReportFile(att))
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

  // CoordinationFileReplacer 中 validOriginals 为最新置顶倒序：Index 0 是最新，Index (length-1) 是 V1
  // 反转为按版本时间升序排列：[V1, V2, ..., VN]
  const chronologicalOriginals = [...validOriginals].reverse();

  // 追加的文件属于更新的版本，拼接至末尾
  const combined = [...chronologicalOriginals, ...validAppended];

  // 按 URL 去重（若无 URL 则按文件名去重）
  const seenKeys = new Set<string>();
  const result: ChatTaskAttachment[] = [];
  for (const doc of combined) {
    const key = doc.url || doc.name;
    if (key && !seenKeys.has(key)) {
      seenKeys.add(key);
      result.push({
        name: doc.name || '合同文档.docx',
        url: doc.url,
        size: doc.size,
        mimeType: doc.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    }
  }

  return result;
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
