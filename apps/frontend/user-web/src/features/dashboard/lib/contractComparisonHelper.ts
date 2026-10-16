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
 * 获取文件的主干文件名（去除常见办公文档与 PDF 扩展名）
 */
export function getDocumentStemName(filename?: string): string {
  if (!filename) return '';
  return filename.replace(/\.(docx|doc|pdf|txt|rtf)$/i, '').trim();
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

  // 对原始附件进行按版本主干归一化：
  // 1) 同名或同 URL 文件自动去重；
  // 2) 同一主干文件名的 docx 与 pdf 属于同一版本的双格式衍生件（如起草生成的 word 与排版渲染 pdf），
  //    归一为同一个版本条目（优先保留可编辑的 docx 格式便于后续文本比对）；
  const stemToDocMap = new Map<string, ChatTaskAttachment>();
  const originalVersionList: ChatTaskAttachment[] = [];

  for (const rawDoc of chronologicalOriginals) {
    const docUrl = normalizeDocUrl(rawDoc) || parameters?.downloadUrl;
    const name = rawDoc.name || '合同文档.docx';
    const stem = getDocumentStemName(name);
    const docItem: ChatTaskAttachment = {
      name,
      url: docUrl,
      size: rawDoc.size,
      mimeType: rawDoc.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    if (stemToDocMap.has(stem)) {
      const existing = stemToDocMap.get(stem)!;
      // 若已有同主干文件是 pdf 而新遇到的是 docx，则替换为 docx 作为代表性比对文档
      if (
        existing.name.toLowerCase().endsWith('.pdf') &&
        (name.toLowerCase().endsWith('.docx') || name.toLowerCase().endsWith('.doc'))
      ) {
        const idx = originalVersionList.indexOf(existing);
        if (idx !== -1) {
          originalVersionList[idx] = docItem;
          stemToDocMap.set(stem, docItem);
        }
      }
    } else {
      stemToDocMap.set(stem, docItem);
      originalVersionList.push(docItem);
    }
  }

  // 3) 追加的文件（appendedFiles）属于经办人或法务明确上传的后续修订版本，拼接到末尾
  const appendedList: ChatTaskAttachment[] = [];
  for (const rawAppended of validAppended) {
    const docUrl = normalizeDocUrl(rawAppended);
    const name = rawAppended.name || '修订版本.docx';
    appendedList.push({
      name,
      url: docUrl,
      size: rawAppended.size,
      mimeType: rawAppended.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  return [...originalVersionList, ...appendedList];
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
        ? '当前生效版'
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

  // 若基准版本与最新版本的主干名称和下载地址均相同，说明同属同一版本，不误触发比对
  if (
    baseDoc.name === latestDoc.name ||
    (getDocumentStemName(baseDoc.name) === getDocumentStemName(latestDoc.name) && baseDoc.url === latestDoc.url)
  ) {
    return null;
  }

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
