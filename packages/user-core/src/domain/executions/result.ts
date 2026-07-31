import type {
  ExecutionDto,
  ExecutionStatus,
  NormalizedExecutionResult,
  WorkflowResultArtifact,
  WorkflowResultEnvelope,
  WorkflowResultExecution,
  WorkflowResultNextAction,
} from '../../types/execution.types.js';
import { asRecord, tryParseJsonValue } from './common.js';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const firstNonEmptyString = (...values: Array<string | undefined>): string | undefined =>
  values.find((value): value is string => typeof value === 'string' && value.trim().length > 0);

const normalizeArtifactUrl = (value: string | undefined): string | undefined =>
  value?.replace(/^(\/public)?\/renders\//i, '/api/renders/');

const mapExecutionStatus = (
  status?: ExecutionStatus
): WorkflowResultExecution['status'] | undefined => {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'failed';
    case 'cancelled':
    case 'rolled_back':
      return 'cancelled';
    default:
      return undefined;
  }
};

const readStringField = (value: unknown, fields: string[]): string | undefined => {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  for (const field of fields) {
    const candidate = asString(record[field]);
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
};

const readRecordField = (value: unknown, fields: string[]): Record<string, unknown> | undefined => {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  for (const field of fields) {
    const candidate = asRecord(record[field]);
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
};

const normalizeNextActions = (value: unknown): WorkflowResultNextAction[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const actions = value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      type: asString(item.type),
      label: asString(item.label),
      value: asString(item.value),
    }))
    .filter((item) => item.type || item.label || item.value);

  return actions.length > 0 ? actions : undefined;
};

const pickLegacyBusinessData = (rawResult: unknown): unknown => {
  const record = asRecord(rawResult);
  if (!record) {
    return typeof rawResult === 'string' ? undefined : rawResult;
  }

  const directStringResult = asString(record.result);
  if (directStringResult) {
    const remainingRecord = Object.fromEntries(
      Object.entries(record).filter(([key, value]) => {
        if (value === undefined || value === null) {
          return false;
        }
        return ![
          'result',
          'downloadUrl',
          'download_url',
          'url',
          'temporalLink',
          'temporal_link',
          'summary',
          'message',
          'text',
          'content',
          'formatted_output',
          'finalAnswer',
          'chatSummary',
          'notificationSummary',
          'title',
          'name',
        ].includes(key);
      })
    );

    return Object.keys(remainingRecord).length > 0 ? remainingRecord : undefined;
  }

  const directCandidates = [
    record.businessData,
    record.payload,
    record.output,
    record.result,
    record.data,
  ];
  for (const candidate of directCandidates) {
    if (candidate && typeof candidate === 'object') {
      return candidate;
    }
  }

  const filteredRecord = Object.fromEntries(
    Object.entries(record).filter(([key, value]) => {
      if (value === undefined || value === null) {
        return false;
      }
      return ![
        'downloadUrl',
        'download_url',
        'url',
        'temporalLink',
        'temporal_link',
        'summary',
        'message',
        'text',
        'content',
        'formatted_output',
        'finalAnswer',
        'chatSummary',
        'notificationSummary',
        'title',
        'name',
      ].includes(key);
    })
  );

  return Object.keys(filteredRecord).length > 0 ? filteredRecord : undefined;
};

const collectLegacyArtifacts = (value: unknown): WorkflowResultArtifact[] => {
  const queue: unknown[] = [value];
  const visited = new Set<unknown>();
  const artifacts: WorkflowResultArtifact[] = [];
  let inspected = 0;

  while (queue.length > 0 && inspected < 80) {
    const current = queue.shift();
    inspected += 1;

    const parsed = tryParseJsonValue(current);
    if (parsed !== current) {
      queue.push(parsed);
      continue;
    }

    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    const record = current as Record<string, unknown>;
    const downloadUrl = firstNonEmptyString(
      asString(record.downloadUrl),
      asString(record.download_url)
    );
    const url = firstNonEmptyString(asString(record.url), asString(record.fileUrl));
    const artifactType = firstNonEmptyString(
      asString(record.artifactType),
      asString(record.artifact_type),
      asString(record.type)
    );
    const name = firstNonEmptyString(
      asString(record.name),
      asString(record.fileName),
      asString(record.label)
    );

    if (downloadUrl || url) {
      artifacts.push({
        type: artifactType || (downloadUrl ? 'file' : 'url'),
        artifactType,
        name,
        label: name,
        downloadUrl: normalizeArtifactUrl(downloadUrl),
        url: normalizeArtifactUrl(url),
        mimeType: asString(record.mimeType) || asString(record.mime_type),
        path: asString(record.path),
      });
    }

    Object.values(record).forEach((item) => {
      if (item && typeof item === 'object') {
        queue.push(item);
      }
    });
  }

  return artifacts;
};

const normalizeArtifacts = (value: WorkflowResultArtifact[]): WorkflowResultArtifact[] => {
  const seen = new Set<string>();
  const artifacts: WorkflowResultArtifact[] = [];

  value.forEach((item) => {
    const record = asRecord(item);
    if (!record) {
      return;
    }

    const artifact: WorkflowResultArtifact = {
      type:
        asString(record.type) ||
        asString(record.artifactType) ||
        asString(record.artifact_type) ||
        (firstNonEmptyString(asString(record.downloadUrl), asString(record.url))
          ? 'file'
          : 'artifact'),
      artifactType: firstNonEmptyString(
        asString(record.artifactType),
        asString(record.artifact_type),
        asString(record.type)
      ),
      name: firstNonEmptyString(asString(record.name), asString(record.label)),
      label: firstNonEmptyString(asString(record.label), asString(record.name)),
      downloadUrl: normalizeArtifactUrl(asString(record.downloadUrl)),
      url: normalizeArtifactUrl(asString(record.url)),
      path: asString(record.path),
      mimeType: firstNonEmptyString(asString(record.mimeType), asString(record.mime_type)),
    };

    const artifactLocation = artifact.downloadUrl || artifact.url || artifact.path;
    const dedupeKey = artifactLocation || `${artifact.type}|${artifact.name || ''}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    artifacts.push(artifact);
  });

  return artifacts;
};

const artifactDownloadPriority = (artifact: WorkflowResultArtifact): number => {
  const url = firstNonEmptyString(artifact.downloadUrl, artifact.url) || '';
  const name = artifact.name || artifact.label || '';
  const mimeType = artifact.mimeType || '';
  const artifactType = artifact.artifactType || artifact.type || '';

  if (
    mimeType === 'text/markdown' ||
    /\.md(?:$|[?#])/i.test(name) ||
    /\.md(?:$|[?#])/i.test(url)
  ) {
    return 400;
  }
  if (/search_result|source|reference/i.test(artifactType)) {
    return 0;
  }
  if (artifact.downloadUrl || /\/renders\//i.test(url) || /document|file/i.test(artifactType)) {
    return 300;
  }
  if (/application\/(pdf|json)|text\/plain/i.test(mimeType)) {
    return 200;
  }
  return 100;
};

const isReferenceArtifact = (artifact: WorkflowResultArtifact): boolean => {
  const artifactType = artifact.artifactType || artifact.type || '';
  const url = firstNonEmptyString(artifact.downloadUrl, artifact.url) || '';

  return (
    /search_result|source|reference/i.test(artifactType) ||
    (artifactType === 'url' && !/\/renders\//i.test(url))
  );
};

const isDeliverableArtifact = (artifact: WorkflowResultArtifact): boolean => {
  if (isReferenceArtifact(artifact)) {
    return false;
  }

  const artifactType = artifact.artifactType || artifact.type || '';
  const mimeType = artifact.mimeType || '';
  const url = firstNonEmptyString(artifact.downloadUrl, artifact.url) || '';
  const name = artifact.name || artifact.label || '';

  return Boolean(
    (artifact.downloadUrl && (
      /\/renders\//i.test(url) ||
      /\.(?:md|pdf|docx?|xlsx?|csv|json|txt|zip)(?:$|[?#])/i.test(url)
    )) ||
    /document|file|report|export|attachment/i.test(artifactType) ||
    /\/renders\//i.test(url) ||
    /\.(?:md|pdf|docx?|xlsx?|csv|json|txt|zip)(?:$|[?#])/i.test(name) ||
    /\.(?:md|pdf|docx?|xlsx?|csv|json|txt|zip)(?:$|[?#])/i.test(url) ||
    /^(?:text\/markdown|text\/plain|application\/(?:pdf|json|zip|vnd\.))/i.test(mimeType)
  );
};

export const selectExecutionDeliverableArtifacts = (
  artifacts: WorkflowResultArtifact[]
): WorkflowResultArtifact[] => {
  return [...artifacts]
    .filter(isDeliverableArtifact)
    .sort((left, right) => artifactDownloadPriority(right) - artifactDownloadPriority(left));
};

export const selectExecutionReferenceArtifacts = (
  artifacts: WorkflowResultArtifact[]
): WorkflowResultArtifact[] => artifacts.filter(isReferenceArtifact);

const pickArtifactUrl = (artifacts: WorkflowResultArtifact[]): string | undefined =>
  selectExecutionDeliverableArtifacts(artifacts)
    .map((item) => firstNonEmptyString(item.downloadUrl, item.url))
    .find((item): item is string => Boolean(item));

const extractTemporalLink = (value: unknown): string | undefined => {
  const queue: unknown[] = [value];
  const visited = new Set<unknown>();
  let inspected = 0;

  while (queue.length > 0 && inspected < 50) {
    const current = queue.shift();
    inspected += 1;

    const parsed = tryParseJsonValue(current);
    if (parsed !== current) {
      queue.push(parsed);
      continue;
    }

    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    const record = current as Record<string, unknown>;
    const directUrl = firstNonEmptyString(
      asString(record.temporalLink),
      asString(record.temporal_link)
    );
    if (directUrl) {
      return directUrl;
    }

    Object.values(record).forEach((item) => {
      if (item && typeof item === 'object') {
        queue.push(item);
      }
    });
  }

  return undefined;
};

const isEnvelope = (value: unknown): value is WorkflowResultEnvelope => {
  const record = asRecord(value);
  if (!record) {
    return false;
  }
  return Boolean(
    asRecord(record.execution) ||
    asRecord(record.trigger) ||
    asRecord(record.presentation) ||
    Array.isArray(record.artifacts) ||
    asRecord(record.result)
  );
};

const buildEnvelope = (
  rawResult: unknown,
  context?: {
    executionId?: string;
    status?: WorkflowResultExecution['status'];
  }
): WorkflowResultEnvelope => {
  if (isEnvelope(rawResult)) {
    return rawResult;
  }

  const legacyResultRecord = asRecord(rawResult);
  const businessData = pickLegacyBusinessData(rawResult);

  return {
    execution: {
      executionId: context?.executionId,
      status: context?.status,
    },
    result: {
      resultType: firstNonEmptyString(
        readStringField(rawResult, ['resultType', 'type']),
        businessData ? 'generic' : undefined
      ),
      title: readStringField(rawResult, ['title', 'name']),
      summary: readStringField(rawResult, [
        'chatSummary',
        'finalAnswer',
        'formatted_output',
        'summary',
        'message',
        'result',
        'text',
        'content',
      ]),
      businessData,
      metrics: readRecordField(rawResult, ['metrics']),
      nextActions: normalizeNextActions(legacyResultRecord?.nextActions),
    },
    artifacts: collectLegacyArtifacts(rawResult),
    presentation: {
      preferAiSummary: Boolean(
        businessData &&
        !readStringField(rawResult, [
          'chatSummary',
          'finalAnswer',
          'formatted_output',
          'summary',
          'message',
          'result',
        ])
      ),
      preferStructuredView: false,
      chatSummary: readStringField(rawResult, ['chatSummary']),
      notificationSummary: readStringField(rawResult, ['notificationSummary', 'chatSummary']),
      summaryFormat:
        readStringField(rawResult, ['summaryFormat']) === 'markdown' ? 'markdown' : 'plain_text',
      detailText: readStringField(rawResult, [
        'detailText',
        'formatted_output',
        'result',
        'text',
        'content',
      ]),
      detailFormat:
        readStringField(rawResult, ['detailFormat']) === 'markdown' ? 'markdown' : 'plain_text',
    },
  };
};

export const normalizeWorkflowExecutionResult = (
  rawResult: unknown,
  context?: {
    executionId?: string;
    status?: WorkflowResultExecution['status'];
  }
): NormalizedExecutionResult => {
  const envelope = buildEnvelope(rawResult, context);
  const artifacts = normalizeArtifacts([
    ...(Array.isArray(envelope.artifacts) ? envelope.artifacts : []),
    ...collectLegacyArtifacts(rawResult),
  ]);
  const title = firstNonEmptyString(
    envelope.result?.title,
    readStringField(rawResult, ['title', 'name'])
  );
  const summary = firstNonEmptyString(
    envelope.presentation?.chatSummary,
    envelope.result?.summary,
    readStringField(rawResult, [
      'chatSummary',
      'finalAnswer',
      'formatted_output',
      'summary',
      'message',
      'result',
    ])
  );
  const body = firstNonEmptyString(
    envelope.presentation?.chatSummary,
    envelope.result?.summary,
    readStringField(rawResult, ['result', 'text', 'content']),
    typeof rawResult === 'string' ? rawResult : undefined
  );
  const summaryFormat = envelope.presentation?.summaryFormat || 'plain_text';
  const detailText = firstNonEmptyString(envelope.presentation?.detailText, body);
  const detailFormat = envelope.presentation?.detailFormat || summaryFormat || 'plain_text';
  const structuredData =
    envelope.result?.businessData !== undefined
      ? envelope.result.businessData
      : pickLegacyBusinessData(rawResult);
  const hasBusinessResult = Boolean(
    summary ||
    body ||
    title ||
    artifacts.length > 0 ||
    (structuredData !== undefined && structuredData !== null)
  );

  return {
    envelope: {
      ...envelope,
      artifacts,
      execution: {
        ...envelope.execution,
        executionId: envelope.execution?.executionId || context?.executionId,
        status: envelope.execution?.status || context?.status,
      },
    },
    resultType: envelope.result?.resultType,
    title,
    summary,
    body,
    summaryFormat,
    detailText,
    detailFormat,
    structuredData,
    artifacts,
    downloadUrl: pickArtifactUrl(artifacts),
    temporalLink: extractTemporalLink(rawResult),
    hasBusinessResult,
    rawResult,
  };
};

export const resolveExecutionNormalizedResult = (
  execution?: Pick<ExecutionDto, 'id' | 'status' | 'normalizedResult' | 'resultJson' | 'result'>
): NormalizedExecutionResult | undefined => {
  if (!execution) {
    return undefined;
  }
  if (execution.normalizedResult) {
    const artifacts = normalizeArtifacts(execution.normalizedResult.artifacts || []);
    return {
      ...execution.normalizedResult,
      artifacts,
      downloadUrl: pickArtifactUrl(artifacts),
      envelope: {
        ...execution.normalizedResult.envelope,
        artifacts,
      },
    };
  }

  const rawResult = execution.resultJson || execution.result;
  if (rawResult === undefined || rawResult === null) {
    return undefined;
  }

  return normalizeWorkflowExecutionResult(rawResult, {
    executionId: execution.id,
    status: mapExecutionStatus(execution.status),
  });
};
