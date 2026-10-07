import type { ExecutionDto } from '@/api/execution';
import { summarizeExecutionListResult } from '@ops/user-core';

export interface ExecutionDeliverableItem {
  id: string;
  name: string;
  url?: string;
  extension: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface ExecutionTimeDisplay {
  compactTime: string;
  durationLabel: string;
  isRunning: boolean;
  tooltip: string;
}

export interface CustomerFacingResultDisplay {
  status: 'succeeded' | 'failed' | 'running' | 'waiting' | 'other';
  headline: string;
  subline?: string;
  tooltipText: string;
}

const padZero = (n: number) => String(n).padStart(2, '0');

export const formatExecutionTimeDisplay = (record: ExecutionDto): ExecutionTimeDisplay => {
  const startRaw = record.startedAt || record.createdAt;
  if (!startRaw) {
    return {
      compactTime: '-',
      durationLabel: '-',
      isRunning: false,
      tooltip: '暂无时间记录',
    };
  }

  const startDate = new Date(startRaw);
  if (Number.isNaN(startDate.getTime())) {
    return {
      compactTime: '-',
      durationLabel: '-',
      isRunning: false,
      tooltip: '时间解析失败',
    };
  }

  const endRaw = record.endedAt;
  const endDate = endRaw ? new Date(endRaw) : null;
  const isRunning =
    !endRaw && ['running', 'waiting_input', 'pending_approval'].includes(record.status);

  const month = padZero(startDate.getMonth() + 1);
  const day = padZero(startDate.getDate());
  const hours = padZero(startDate.getHours());
  const minutes = padZero(startDate.getMinutes());
  const seconds = padZero(startDate.getSeconds());
  const compactTime = `${month}-${day} ${hours}:${minutes}:${seconds}`;

  let durationLabel = '';
  if (endDate && !Number.isNaN(endDate.getTime())) {
    const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
    if (diffMs < 1000) {
      durationLabel = '耗时 <1s';
    } else if (diffMs < 60000) {
      const sec = (diffMs / 1000).toFixed(1).replace(/\.0$/, '');
      durationLabel = `耗时 ${sec}s`;
    } else {
      const min = Math.floor(diffMs / 60000);
      const remSec = Math.round((diffMs % 60000) / 1000);
      durationLabel = `耗时 ${min}m${remSec ? ` ${remSec}s` : ''}`;
    }
  } else if (isRunning) {
    const diffMs = Math.max(0, Date.now() - startDate.getTime());
    const sec = Math.floor(diffMs / 1000);
    durationLabel = sec < 60 ? `运行中 ${sec}s` : `运行中 ${Math.floor(sec / 60)}m`;
  } else {
    durationLabel = '已结束';
  }

  const tooltipLines = [
    `开始时间: ${startDate.toLocaleString('zh-CN', { hour12: false })}`,
    endDate && !Number.isNaN(endDate.getTime())
      ? `结束时间: ${endDate.toLocaleString('zh-CN', { hour12: false })}`
      : isRunning
        ? '状态: 任务仍在执行中'
        : '结束时间: 未记录',
    `执行耗时: ${durationLabel.replace(/^(耗时|运行中)\s*/, '')}`,
  ];

  return {
    compactTime,
    durationLabel,
    isRunning,
    tooltip: tooltipLines.join('\n'),
  };
};

export const extractRecordBusinessTitle = (
  record: ExecutionDto,
  fallbackSkillName?: string
): string => {
  const input = (record.input || {}) as Record<string, unknown>;
  const normInput = (record.normalizedInput || {}) as Record<string, unknown>;
  const normUserInput = (normInput.input || {}) as Record<string, unknown>;

  // 1. Explicit business or contract title
  const candidates = [
    input.contractTitle,
    normInput.contractTitle,
    normUserInput.contractTitle,
    input.contractName,
    input.businessTitle,
    input.title,
    normInput.title,
    normUserInput.title,
  ];

  for (const cand of candidates) {
    if (typeof cand === 'string' && cand.trim().length > 0) {
      return cand.trim();
    }
  }

  // 2. Explicit file name or document title
  const fileCandidates = [
    input.fileName,
    input.fileTitle,
    input.fileNameA,
    input.fileNameB,
    normUserInput.fileName,
  ];
  for (const fileCand of fileCandidates) {
    if (typeof fileCand === 'string' && fileCand.trim().length > 0) {
      return fileCand.trim();
    }
  }

  // 3. Extract from URL query parameter (e.g. ?fileName=... or ?title=...)
  const rawUrl =
    (typeof input.url === 'string' && input.url) ||
    (typeof input.fileUrl === 'string' && input.fileUrl) ||
    (typeof normUserInput.url === 'string' && normUserInput.url);
  if (rawUrl && typeof rawUrl === 'string') {
    try {
      const match = rawUrl.match(/[?&](?:fileName|file_name|title)=([^&#]+)/i);
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1]).trim();
        if (decoded) {
          return decoded;
        }
      }
    } catch {
      // ignore URI malformed error
    }
  }

  // 4. Task instruction / subject
  const subjectCandidates = [
    input.subject,
    input.taskTitle,
    input.topic,
    normInput.objective,
  ];
  for (const subj of subjectCandidates) {
    if (typeof subj === 'string' && subj.trim().length > 0 && subj.trim().length < 80) {
      return subj.trim();
    }
  }

  // 5. Normalized result title if it's informative and not technical
  const resultTitle = record.normalizedResult?.title;
  if (
    typeof resultTitle === 'string' &&
    resultTitle.trim() &&
    resultTitle !== record.skillId &&
    resultTitle !== 'deterministic_plan' &&
    resultTitle !== 'single_skill'
  ) {
    return resultTitle.trim();
  }

  return fallbackSkillName?.trim() || '自动化任务';
};

const detectExtension = (name?: string, url?: string, mimeType?: string): string => {
  const target = (name || url || '').toLowerCase();
  const match = target.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
  if (match && match[1]) {
    return match[1];
  }

  if (mimeType) {
    const mime = mimeType.toLowerCase();
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('wordprocessingml') || mime.includes('msword')) return 'docx';
    if (mime.includes('html')) return 'html';
    if (mime.includes('spreadsheetml') || mime.includes('excel')) return 'xlsx';
    if (mime.includes('json')) return 'json';
    if (mime.includes('zip')) return 'zip';
    if (mime.includes('image/png')) return 'png';
    if (mime.includes('image/jpeg')) return 'jpg';
  }

  return 'file';
};

export const extractRecordDeliverables = (record: ExecutionDto): ExecutionDeliverableItem[] => {
  const deliverables: ExecutionDeliverableItem[] = [];
  const seenUrls = new Set<string>();
  const seenNames = new Set<string>();

  const addDeliverable = (item: {
    id?: string;
    name?: string;
    url?: string;
    mimeType?: string;
    sizeBytes?: number;
    artifactType?: string;
  }) => {
    const rawName = (item.name || '').trim();
    let rawUrl = (item.url || '').trim();

    if (rawUrl) {
      rawUrl = rawUrl.replace(/^(\/public)?\/renders\//i, '/api/renders/');
    }

    if (!rawName && !rawUrl) {
      return;
    }

    // Deduplicate by URL or exact name
    if (rawUrl && seenUrls.has(rawUrl)) {
      return;
    }
    if (rawName && !rawUrl && seenNames.has(rawName)) {
      return;
    }

    if (rawUrl) seenUrls.add(rawUrl);
    if (rawName) seenNames.add(rawName);

    const name = rawName || rawUrl.split('/').pop()?.split('?')[0] || '成果产物文件';
    const extension = detectExtension(name, rawUrl, item.mimeType);

    deliverables.push({
      id: item.id || `deliverable-${deliverables.length + 1}`,
      name,
      url: rawUrl || undefined,
      extension,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
    });
  };

  // 1. Check normalizedResult.artifacts
  if (Array.isArray(record.normalizedResult?.artifacts)) {
    for (const art of record.normalizedResult.artifacts) {
      addDeliverable({
        name: art.label || art.name,
        url: art.downloadUrl || art.url,
        mimeType: art.mimeType,
        artifactType: art.artifactType || art.type,
      });
    }
  }

  // 2. Check resultJson.artifacts or result.artifacts
  const resultObj = (record.resultJson || record.result || {}) as Record<string, unknown>;
  if (Array.isArray(resultObj.artifacts)) {
    for (const art of resultObj.artifacts) {
      if (art && typeof art === 'object') {
        const a = art as Record<string, unknown>;
        addDeliverable({
          id: typeof a.id === 'string' ? a.id : undefined,
          name: (typeof a.name === 'string' && a.name) || (typeof a.label === 'string' && a.label) || undefined,
          url: (typeof a.url === 'string' && a.url) || (typeof a.downloadUrl === 'string' && a.downloadUrl) || undefined,
          mimeType: typeof a.mimeType === 'string' ? a.mimeType : undefined,
          sizeBytes: typeof a.sizeBytes === 'number' ? a.sizeBytes : undefined,
        });
      }
    }
  }

  // 3. Check businessData.finalOutputs
  const bizData = ((resultObj.result as Record<string, unknown>)?.businessData ||
    resultObj.businessData) as Record<string, unknown> | undefined;
  if (bizData && Array.isArray(bizData.finalOutputs)) {
    for (const out of bizData.finalOutputs) {
      if (out && typeof out === 'object') {
        const val = (out as Record<string, unknown>).value;
        if (val && typeof val === 'object') {
          const v = val as Record<string, unknown>;
          if (v.url || v.name) {
            addDeliverable({
              id: typeof v.id === 'string' ? v.id : undefined,
              name: typeof v.name === 'string' ? v.name : undefined,
              url: typeof v.url === 'string' ? v.url : undefined,
              mimeType: typeof v.mimeType === 'string' ? v.mimeType : undefined,
            });
          }
        }
      }
    }
  }

  // 4. Check direct downloadUrl if no deliverables yet
  if (deliverables.length === 0) {
    const directUrl =
      record.normalizedResult?.downloadUrl ||
      (typeof resultObj.downloadUrl === 'string' ? resultObj.downloadUrl : undefined) ||
      (typeof resultObj.fileUrl === 'string' ? resultObj.fileUrl : undefined);
    if (directUrl && typeof directUrl === 'string' && directUrl.trim()) {
      addDeliverable({
        name: '成果交付文件',
        url: directUrl.trim(),
      });
    }
  }

  return deliverables;
};

const cleanMarkdownSyntax = (raw: string): string => {
  return raw
    // remove markdown links: [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // remove image tags: ![alt](url) -> ''
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    // remove prompt guidance/links
    .replace(/\*?\*?\(下方产物卡片支持[^)]*\)\*?\*?/g, '')
    .replace(/[🔗👉\s]*点击[^\n\r]*/gu, '')
    // remove markdown headers
    .replace(/^#+\s+/gm, '')
    // remove bullet points
    .replace(/^[\s-*•]+\s*/gm, '')
    // replace newlines with separator
    .replace(/[\r\n]+/g, ' · ')
    // strip markdown bold, italics, backticks, remaining hashes
    .replace(/[*_`#]/g, '')
    // normalize multiple separators and spaces
    .replace(/(?:\s*·\s*)+/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^·\s*|\s*·$/g, '');
};

export const formatCustomerFacingResult = (record: ExecutionDto): CustomerFacingResultDisplay => {
  const isFailed = record.status === 'failed';
  const isRunning = ['running', 'waiting_input', 'pending_approval', 'human_control'].includes(
    record.status
  );

  // 1. Failed
  if (isFailed) {
    const reason =
      record.failureReason?.trim() ||
      record.failureCode?.trim() ||
      record.takeoverReason?.trim() ||
      '任务执行异常中断';
    const cleanedReason = cleanMarkdownSyntax(reason);
    return {
      status: 'failed',
      headline: cleanedReason || '执行异常，请查看详情排查',
      tooltipText: `执行失败原因:\n${reason}`,
    };
  }

  // 2. Running or waiting
  if (isRunning) {
    let headline = record.currentPhaseStatus || '流程正在执行中...';
    if (record.status === 'waiting_input') {
      headline = '等待补充必要输入参数后继续';
    } else if (record.status === 'pending_approval') {
      headline = '等待法务/负责人审批确认';
    } else if (record.status === 'human_control') {
      headline = '已暂停，等待人工协同接管';
    }
    return {
      status: 'running',
      headline,
      tooltipText: `当前状态: ${headline}`,
    };
  }

  // 3. Succeeded: Extract high-value business insights
  const rawSummary =
    record.normalizedResult?.summary ||
    (record.resultJson?.result as Record<string, unknown>)?.summary ||
    summarizeExecutionListResult(record);

  const fullText = typeof rawSummary === 'string' ? rawSummary : '任务执行完成';

  // Check if summary is just a raw UUID / ID (e.g. from internal notification / message)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fullText.trim());
  if (isUuid) {
    const resultTitle = record.normalizedResult?.title || (record.resultJson?.result as any)?.title;
    const defaultText = resultTitle ? `${resultTitle}已完成` : '任务已成功执行完成';
    return {
      status: 'succeeded',
      headline: defaultText,
      subline: `单号: ${fullText.trim().slice(0, 8)}`,
      tooltipText: `执行返回 ID: ${fullText.trim()}`,
    };
  }

  // Clean first to remove markdown formatting
  const cleanedAll = cleanMarkdownSyntax(fullText);

  // Check for contract reviewer specific highlights
  const scoreMatch = cleanedAll.match(/综合(?:合规)?评分[：:]\s*([^·]+)/);
  const riskMatch = cleanedAll.match(/(?:条款)?风控(?:统计)?[：:]\s*([^·]+)/);

  if (scoreMatch || riskMatch) {
    const scoreStr = scoreMatch ? scoreMatch[1].trim() : '';
    const riskStr = riskMatch ? riskMatch[1].trim() : '';

    const parts = ['合规审查完成'];
    if (scoreStr) {
      parts.push(`综合评分: ${scoreStr}`);
    }
    if (riskStr) {
      parts.push(`风控统计: ${riskStr}`);
    }

    return {
      status: 'succeeded',
      headline: parts.join(' · '),
      tooltipText: fullText,
    };
  }

  return {
    status: 'succeeded',
    headline: cleanedAll || '任务执行成功完成',
    tooltipText: fullText,
  };
};
