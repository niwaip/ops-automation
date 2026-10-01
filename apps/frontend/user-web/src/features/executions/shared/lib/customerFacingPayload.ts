export interface ExtractedDocument {
  name: string;
  url?: string;
  role?: string;
}

export interface ExtractedSetting {
  label: string;
  value: string;
  color?: string;
}

export interface ExtractedReviewComment {
  text: string;
  clauseTitle?: string;
  tag?: string;
}

export interface CustomerFacingPayloadModel {
  documents: ExtractedDocument[];
  settings: ExtractedSetting[];
  reviewComments: ExtractedReviewComment[];
  primaryText?: string;
  articles?: Array<Record<string, unknown>>;
  remainingEntries: Array<{ key: string; label: string; value: unknown }>;
  hasBusinessContent: boolean;
}

const FRIENDLY_FIELD_LABELS: Record<string, string> = {
  fileName: '目标文件',
  fileTitle: '文件标题',
  contractTitle: '合同名称',
  contractName: '合同名称',
  businessTitle: '业务标题',
  fileNameA: '比对基准版 (A)',
  fileNameB: '比对修订版 (B)',
  myPosition: '我方审查立场',
  position: '审查立场',
  compareMode: '比对模式',
  title: '任务标题',
  subject: '任务主题',
  taskTitle: '任务标题',
  topic: '关注主题',
  user_input: '用户需求',
  prompt: '任务指令',
  instruction: '处理要求',
  query: '查询关键词',
  searchQuery: '搜索词',
  url: '目标链接',
  link: '链接地址',
  website: '访问站点',
  recipient: '接收人',
  recipients: '接收人员',
  channel: '推送通道',
  message: '消息内容',
  content: '文档内容',
  executionId: '关联单号',
  orgId: '组织机构',
  category: '业务类别',
  tags: '标签',
  department: '所属部门',
};

const POSITION_LABELS: Record<string, { label: string; color: string }> = {
  buyer: { label: '买方 / 披露方（较严格风控）', color: 'blue' },
  seller: { label: '卖方 / 接收方（较宽松风控）', color: 'green' },
  neutral: { label: '双向对等 / 中立立场', color: 'purple' },
  custom: { label: '自定义立场', color: 'orange' },
};

const COMPARE_MODE_LABELS: Record<string, { label: string; color: string }> = {
  strict: { label: '严格逐字红线比对', color: 'blue' },
  semantic: { label: '智能语义条款比对', color: 'cyan' },
};

export const INTERNAL_NOISE_KEYS = new Set([
  // Coordination & Orchestration context
  'taskContext',
  'metadata',
  'operator',
  'orgId',
  'taskId',
  'taskType',
  'originalTaskType',
  'stageId',
  'stage',
  'currentStage',
  'stageName',
  'workflowId',
  'recipientId',
  'isAsync',
  'isReceipt',
  'receiptAction',
  'hasAnnotatedDocx',
  'annotatedDocxUrl',
  'commentInjectionError',
  'commentInjectionStats',
  'sourceAttachmentId',
  'sourceDocumentHash',
  'sourceDocumentVersion',
  'sourceDocxSha256',
  'ruleSetDigest',
  'ruleSetId',
  'ruleSetVersion',
  'findingStates',
  'approvalOpinions',
  'stagedComments',
  'reviewDraft',
  'checkedRules',
  'summaryItems',
  'rawContent',
  'clauses',
  'metrics',
  'reviewReport',

  // System & Execution noise
  'trace',
  'backend',
  'variables',
  'stepResults',
  'browserRunOutput',
  'runtimeEvidence',
  'executionPlanVersion',
  'runtimeSessionId',
  'requiresTakeover',
  'capabilityId',
  'publishedSkillId',
  'capabilityVersion',
  'releaseId',
  'runtime',
  'stepId',
  'snapshot',
  'rawResult',
  'action',
  'status',
  'failedStepId',
  'failedAction',
  'takeoverReason',
  'success',
  'artifacts',
  'degradedMode',
  'degradeReason',
  'pageFingerprint',
  'readiness',
  'phaseVariables',
  'contentCandidate',
  'contentQuality',
  'errorCode',
  'errorMessage',
  'retryable',
  'skillDraftId',
  'exportArtifactId',
  'recorderSessionId',
  'runtimeExecutionId',
  'previousResultRef',
  'previousResultData',
  'upstreamResult',
  'upstreamContext',
  'orchestrationContext',
  'workflowContext',
  'parentExecutionId',
  'sourceExecutionId',
  'fileBase64',
  'fileBase64A',
  'fileBase64B',
  'base64',
  'fileContent',
  'fileData',
  'rawFile',
  'rawBase64',
  'sha256',
  'inputSha256',
  'sourceSha256',
  'hash',
  'md5',
]);

const decodeUrlFileName = (url?: string): string | undefined => {
  if (!url || typeof url !== 'string') return undefined;
  try {
    const match = url.match(/[?&](?:fileName|file_name|name)=([^&#]+)/i);
    if (match && match[1]) {
      const decoded = decodeURIComponent(match[1]).trim();
      if (decoded) return decoded;
    }
  } catch {
    // ignore malformed uri
  }
  return undefined;
};

const normalizeUrl = (url?: string): string | undefined => {
  if (!url || typeof url !== 'string') return undefined;
  return url.trim().replace(/^(\/public)?\/renders\//i, '/api/renders/');
};

export const parseCustomerFacingPayload = (raw: unknown): CustomerFacingPayloadModel => {
  const documents: ExtractedDocument[] = [];
  const settings: ExtractedSetting[] = [];
  const reviewComments: ExtractedReviewComment[] = [];
  const remainingEntries: Array<{ key: string; label: string; value: unknown }> = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      documents,
      settings,
      reviewComments,
      remainingEntries,
      hasBusinessContent: false,
    };
  }

  const rec = raw as Record<string, unknown>;
  const consumedKeys = new Set<string>();

  // 1. Extract documents & file associations
  const rawUrl = typeof rec.url === 'string' ? rec.url : undefined;
  const rawFileUrl = typeof rec.fileUrl === 'string' ? rec.fileUrl : undefined;
  const rawDownloadUrl = typeof rec.downloadUrl === 'string' ? rec.downloadUrl : undefined;
  const primaryFileUrl = normalizeUrl(rawDownloadUrl || rawFileUrl || rawUrl);

  const rawFileName =
    typeof rec.fileName === 'string' && rec.fileName.trim()
      ? rec.fileName.trim()
      : typeof rec.fileTitle === 'string' && rec.fileTitle.trim()
      ? rec.fileTitle.trim()
      : decodeUrlFileName(rawUrl || rawFileUrl || rawDownloadUrl);

  // Comparison files (A / B)
  const rawFileNameA = typeof rec.fileNameA === 'string' ? rec.fileNameA.trim() : undefined;
  const rawFileNameB = typeof rec.fileNameB === 'string' ? rec.fileNameB.trim() : undefined;
  const rawUrlA = normalizeUrl(
    (typeof rec.fileUrlA === 'string' ? rec.fileUrlA : undefined) ||
      (typeof rec.urlA === 'string' ? rec.urlA : undefined) ||
      (typeof rec.downloadUrlA === 'string' ? rec.downloadUrlA : undefined)
  );
  const rawUrlB = normalizeUrl(
    (typeof rec.fileUrlB === 'string' ? rec.fileUrlB : undefined) ||
      (typeof rec.urlB === 'string' ? rec.urlB : undefined) ||
      (typeof rec.downloadUrlB === 'string' ? rec.downloadUrlB : undefined)
  );

  if (rawFileNameA) {
    documents.push({
      name: rawFileNameA,
      url: rawUrlA,
      role: '比对基准版 (A)',
    });
    consumedKeys.add('fileNameA');
    consumedKeys.add('fileUrlA');
    consumedKeys.add('urlA');
    consumedKeys.add('downloadUrlA');
  }

  if (rawFileNameB) {
    documents.push({
      name: rawFileNameB,
      url: rawUrlB,
      role: '比对修订版 (B)',
    });
    consumedKeys.add('fileNameB');
    consumedKeys.add('fileUrlB');
    consumedKeys.add('urlB');
    consumedKeys.add('downloadUrlB');
  }

  if (rawFileName && (!rawFileNameA || (rawFileName !== rawFileNameA && rawFileName !== rawFileNameB))) {
    documents.push({
      name: rawFileName,
      url: primaryFileUrl,
      role: '目标合同文档',
    });
    consumedKeys.add('fileName');
    consumedKeys.add('fileTitle');
  }

  // Consume standalone URL keys if they were already captured in document URL
  if (primaryFileUrl || documents.length > 0) {
    consumedKeys.add('url');
    consumedKeys.add('fileUrl');
    consumedKeys.add('downloadUrl');
  }

  // Extract attachments array and taskContext attachments
  const collectDocAttachment = (att: unknown) => {
    if (!att || typeof att !== 'object') return;
    const item = att as Record<string, unknown>;
    const name =
      typeof item.name === 'string'
        ? item.name.trim()
        : typeof item.fileName === 'string'
        ? item.fileName.trim()
        : typeof item.label === 'string'
        ? item.label.trim()
        : undefined;
    const url = normalizeUrl(
      (typeof item.url === 'string' ? item.url : undefined) ||
        (typeof item.downloadUrl === 'string' ? item.downloadUrl : undefined)
    );
    if (name && !documents.some((d) => d.name === name)) {
      documents.push({
        name,
        url,
        role: typeof item.role === 'string' ? item.role : '关联文件',
      });
    }
  };

  if (Array.isArray(rec.attachments)) {
    rec.attachments.forEach(collectDocAttachment);
    consumedKeys.add('attachments');
  }

  if (rec.taskContext && typeof rec.taskContext === 'object') {
    const tc = rec.taskContext as Record<string, unknown>;
    if (Array.isArray(tc.attachments)) {
      tc.attachments.forEach(collectDocAttachment);
    }
    consumedKeys.add('taskContext');
  }

  if (typeof rec.sourceDocxName === 'string' && rec.sourceDocxName.trim()) {
    const docxName = rec.sourceDocxName.trim();
    if (!documents.some((d) => d.name === docxName)) {
      documents.push({
        name: docxName,
        url: primaryFileUrl,
        role: '源 Word 文档',
      });
    }
    consumedKeys.add('sourceDocxName');
  }

  // 2. Extract review drafts / comments
  const draftObj = rec.reviewDraft as Record<string, unknown> | undefined;
  const stagedCandidates = [
    draftObj?.stagedComments,
    draftObj?.comments,
    rec.stagedComments,
    rec.comments,
  ];

  for (const candidate of stagedCandidates) {
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => {
        if (!item) return;
        if (typeof item === 'string' && item.trim()) {
          reviewComments.push({ text: item.trim() });
        } else if (typeof item === 'object') {
          const c = item as Record<string, unknown>;
          const text =
            (typeof c.text === 'string' && c.text.trim()) ||
            (typeof c.comment === 'string' && c.comment.trim()) ||
            (typeof c.suggestion === 'string' && c.suggestion.trim());
          if (text) {
            reviewComments.push({
              text,
              clauseTitle:
                (typeof c.clauseTitle === 'string' && c.clauseTitle.trim()) ||
                (typeof c.clauseNumber === 'string' && c.clauseNumber.trim()) ||
                undefined,
              tag: typeof c.type === 'string' ? c.type : undefined,
            });
          }
        }
      });
      consumedKeys.add('reviewDraft');
      consumedKeys.add('stagedComments');
      consumedKeys.add('comments');
      break;
    }
  }

  // 3. Extract business settings (position, compareMode, title, pageNumbers, etc.)
  const positionVal =
    (typeof rec.myPosition === 'string' && rec.myPosition) ||
    (typeof rec.position === 'string' && rec.position);
  if (positionVal) {
    const matched = POSITION_LABELS[positionVal.toLowerCase()] || {
      label: positionVal,
      color: 'blue',
    };
    settings.push({
      label: '审查立场',
      value: matched.label,
      color: matched.color,
    });
    consumedKeys.add('myPosition');
    consumedKeys.add('position');
  }

  const compareModeVal = typeof rec.compareMode === 'string' ? rec.compareMode : undefined;
  if (compareModeVal) {
    const matched = COMPARE_MODE_LABELS[compareModeVal.toLowerCase()] || {
      label: compareModeVal,
      color: 'cyan',
    };
    settings.push({
      label: '比对模式',
      value: matched.label,
      color: matched.color,
    });
    consumedKeys.add('compareMode');
  }

  const execIdVal = typeof rec.executionId === 'string' ? rec.executionId.trim() : undefined;
  if (execIdVal) {
    settings.push({
      label: '关联单号',
      value: `#${execIdVal.replace(/^exec_/, '')}`,
    });
    consumedKeys.add('executionId');
  }

  const titleVal =
    (typeof rec.title === 'string' && rec.title.trim()) ||
    (typeof rec.taskTitle === 'string' && rec.taskTitle.trim());
  if (titleVal) {
    settings.push({
      label: '任务标题',
      value: titleVal,
    });
    consumedKeys.add('title');
    consumedKeys.add('taskTitle');
  }

  if (typeof rec.pageNumbers === 'boolean') {
    settings.push({
      label: '包含页码',
      value: rec.pageNumbers ? '是' : '否',
      color: rec.pageNumbers ? 'green' : 'default',
    });
    consumedKeys.add('pageNumbers');
  }

  const contractTitleVal =
    (typeof rec.contractTitle === 'string' && rec.contractTitle.trim()) ||
    (typeof rec.contractName === 'string' && rec.contractName.trim());
  if (contractTitleVal && (!rawFileName || contractTitleVal !== rawFileName)) {
    settings.push({
      label: '合同名称',
      value: contractTitleVal,
    });
    consumedKeys.add('contractTitle');
    consumedKeys.add('contractName');
  }

  // 4. Primary text / user instruction / notification message
  let primaryText: string | undefined;
  for (const textKey of ['user_input', 'prompt', 'instruction', 'query', 'task', 'goal', 'message']) {
    if (typeof rec[textKey] === 'string' && (rec[textKey] as string).trim()) {
      primaryText = (rec[textKey] as string).trim();
      consumedKeys.add(textKey);
      break;
    }
  }

  // Consume AST content payloads
  if (rec.content !== undefined) {
    if (typeof rec.content === 'string') {
      const trimmed = rec.content.trim();
      if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed) || typeof parsed === 'object') {
            consumedKeys.add('content');
          }
        } catch {
          if (!primaryText) primaryText = trimmed;
          consumedKeys.add('content');
        }
      } else {
        if (!primaryText) primaryText = trimmed;
        consumedKeys.add('content');
      }
    } else if (Array.isArray(rec.content) || typeof rec.content === 'object') {
      consumedKeys.add('content');
    }
  }

  // 5. Remaining business fields (strict filtering: no objects, arrays, or stringified JSON)
  Object.entries(rec).forEach(([key, val]) => {
    if (consumedKeys.has(key) || INTERNAL_NOISE_KEYS.has(key)) {
      return;
    }
    if (val === undefined || val === null || val === '') {
      return;
    }
    // Filter base64 strings
    if (typeof val === 'string' && val.length > 200 && /^[A-Za-z0-9+/=\r\n]+$/.test(val.slice(0, 100))) {
      return;
    }
    // Filter complex objects and arrays (technical payloads!)
    if (typeof val === 'object') {
      return;
    }
    // Filter stringified JSON (starts with { or [)
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          JSON.parse(trimmed);
          return;
        } catch {
          // not json
        }
      }
    }

    const label = FRIENDLY_FIELD_LABELS[key] || key;
    remainingEntries.push({ key, label, value: val });
  });

  const hasBusinessContent =
    documents.length > 0 ||
    settings.length > 0 ||
    reviewComments.length > 0 ||
    Boolean(primaryText) ||
    remainingEntries.length > 0;

  return {
    documents,
    settings,
    reviewComments,
    primaryText,
    remainingEntries,
    hasBusinessContent,
  };
};
