import { Injectable } from '@nestjs/common';

export interface WorkflowResultExecution {
  status?: 'success' | 'partial_success' | 'failed' | 'cancelled';
  executionId?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface WorkflowResultTrigger {
  type?: 'manual' | 'schedule' | 'api' | 'resume';
  scheduleId?: string;
  scheduledAt?: string;
  windowStart?: string;
  windowEnd?: string;
}

export interface WorkflowResultNextAction {
  type?: string;
  label?: string;
  value?: string;
}

export interface WorkflowResultArtifact {
  type?: string;
  artifactType?: string;
  name?: string;
  label?: string;
  downloadUrl?: string;
  url?: string;
  path?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export type WorkflowResultTextFormat = 'plain_text' | 'markdown';

export interface WorkflowResultPresentation {
  preferAiSummary?: boolean;
  preferStructuredView?: boolean;
  chatSummary?: string;
  notificationSummary?: string;
  summaryFormat?: WorkflowResultTextFormat;
  detailText?: string;
  detailFormat?: WorkflowResultTextFormat;
}

export interface WorkflowResultBusinessSection {
  resultType?: string;
  title?: string;
  summary?: string;
  businessData?: unknown;
  metrics?: Record<string, unknown>;
  nextActions?: WorkflowResultNextAction[];
}

export interface WorkflowResultEnvelope {
  execution?: WorkflowResultExecution;
  trigger?: WorkflowResultTrigger;
  result?: WorkflowResultBusinessSection;
  artifacts?: WorkflowResultArtifact[];
  presentation?: WorkflowResultPresentation;
  delivery?: Record<string, unknown>;
}

export interface NormalizedChatExecutionResult {
  envelope: WorkflowResultEnvelope;
  resultType?: string;
  title?: string;
  summary?: string;
  body?: string;
  summaryFormat?: WorkflowResultTextFormat;
  detailText?: string;
  detailFormat?: WorkflowResultTextFormat;
  structuredData?: unknown;
  artifacts: WorkflowResultArtifact[];
  downloadUrl?: string;
  temporalLink?: string;
  hasBusinessResult: boolean;
  rawResult: unknown;
}

@Injectable()
export class ChatResultNormalizerService {
  normalize(
    rawResult: unknown,
    context?: {
      executionId?: string;
      status?: WorkflowResultExecution['status'];
    }
  ): NormalizedChatExecutionResult {
    const envelope = this.buildEnvelope(rawResult, context);
    const artifacts = this.normalizeArtifacts([
      ...(Array.isArray(envelope.artifacts) ? envelope.artifacts : []),
      ...this.collectLegacyArtifacts(rawResult),
    ]);
    const downloadUrl = this.pickArtifactUrl(artifacts);
    const temporalLink = this.extractTemporalLink(rawResult);
    const title = this.firstNonEmptyString(
      envelope.result?.title,
      this.readStringField(rawResult, ['title', 'name'])
    );
    const rawRecord = this.asRecord(rawResult);
    const textCandidate = this.firstNonEmptyString(
      this.readStringField(rawResult, ['text', 'content', 'mainContent', 'extractedText']),
      this.readStringField(rawRecord?.output, ['text', 'mainContent', 'content', 'summary', 'extractedText']),
      this.readStringField(rawRecord?.data, ['text', 'mainContent', 'content', 'summary']),
      this.readStringField(rawRecord?.postProcessing, ['summary', 'text', 'result']),
      this.readStringField(rawRecord?.result, ['text', 'summary', 'content'])
    );
    const summary = this.firstNonEmptyString(
      envelope.presentation?.chatSummary,
      envelope.result?.summary,
      this.readStringField(rawResult, [
        'chatSummary',
        'finalAnswer',
        'formatted_output',
        'summary',
        'message',
      ]),
      textCandidate,
      this.readStringField(rawResult, ['result'])
    );
    const body = this.firstNonEmptyString(
      envelope.presentation?.detailText,
      envelope.presentation?.chatSummary,
      envelope.result?.summary,
      textCandidate,
      this.readStringField(rawResult, ['result', 'text', 'content']),
      typeof rawResult === 'string' ? rawResult : undefined
    );
    const summaryFormat = envelope.presentation?.summaryFormat || 'plain_text';
    const detailText = this.firstNonEmptyString(envelope.presentation?.detailText, body);
    const detailFormat = envelope.presentation?.detailFormat || summaryFormat || 'plain_text';
    const structuredData = this.pickStructuredData(envelope, rawResult);
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
      downloadUrl,
      temporalLink,
      hasBusinessResult,
      rawResult,
    };
  }

  formatForChat(result: NormalizedChatExecutionResult, executionId?: string): string {
    // detailText is the chat deliverable; chatSummary may intentionally be a
    // short notification such as “找到 5 条结果”. Keep notification copy out of
    // the primary answer whenever a richer detail payload is available.
    const lead = this.firstNonEmptyString(result.detailText, result.summary, result.body);
    if (lead) {
      return lead;
    }

    const documentSummary = this.summarizeDocumentResult(result);
    if (documentSummary) {
      return documentSummary;
    }

    const browserSummary = this.summarizeBrowserResult(result, executionId);
    if (browserSummary) {
      return browserSummary;
    }

    // If structuredData is purely an internal artifact/finalOutputs payload, don't dump its JSON.
    // Artifacts are already surfaced via download buttons or markdown links; show a clean completion message instead.
    const isFinalOutputsPayload =
      result.structuredData !== undefined &&
      result.structuredData !== null &&
      typeof result.structuredData === 'object' &&
      !Array.isArray(result.structuredData) &&
      (() => {
        const keys = Object.keys(result.structuredData as Record<string, unknown>);
        return (
          keys.length > 0 &&
          keys.every((k) =>
            [
              'finalOutputs',
              'artifact',
              'artifacts',
              'operation',
              'pageCount',
              'selectedPages',
            ].includes(k)
          )
        );
      })();

    if (result.artifacts.length > 1 && isFinalOutputsPayload) {
      const artifactList = result.artifacts
        .map((a, idx) => {
          const name = a.name || `文档_${idx + 1}`;
          const sizeKb = a.sizeBytes ? ` (${Math.round(a.sizeBytes / 1024)} KB)` : '';
          const targetUrl = a.downloadUrl || a.url;
          return targetUrl ? `- [${name}](${targetUrl})${sizeKb}` : `- ${name}${sizeKb}`;
        })
        .join('\n');
      return `任务已成功完成，已为您生成 ${result.artifacts.length} 个文档产物：\n\n${artifactList}${
        executionId ? `\n\n执行单 ID: ${executionId}` : ''
      }`;
    }

    if (isFinalOutputsPayload) {
      const artifactName =
        result.artifacts.length > 0 ? result.artifacts[0]?.name : undefined;
      return artifactName
        ? `任务已成功完成，已为您生成结果文档：${artifactName}。您可以直接点击下方按钮进行查看与下载。${executionId ? `\n\n执行单 ID: ${executionId}` : ''}`
        : `任务已成功完成，已为您生成结果文档。您可以直接点击下方按钮进行查看与下载。${executionId ? `\n\n执行单 ID: ${executionId}` : ''}`;
    }

    if (result.structuredData !== undefined && result.structuredData !== null) {
      return `任务已完成，返回结果如下：\n\n${this.safeJsonStringify(result.structuredData)}${
        executionId ? `\n\n执行单 ID: ${executionId}` : ''
      }`;
    }

    if (result.title && result.artifacts.length > 0) {
      return `${result.title}已生成，可下载查看。`;
    }

    if (result.title) {
      return `${result.title}已完成。`;
    }

    if (result.artifacts.length > 0) {
      return '任务已完成，已生成可查看的结果产物。';
    }

    return `任务已完成。${executionId ? `\n\n执行单 ID: ${executionId}` : ''}`;
  }

  private summarizeBrowserResult(
    result: NormalizedChatExecutionResult,
    executionId?: string
  ): string | undefined {
    const record = this.asRecord(result.structuredData);
    if (!record) return undefined;
    const isBrowserStep = Boolean(
      record.command ||
      record.pageUrl ||
      record.pageFingerprint ||
      (typeof record.stdout === 'string' && record.stdout.includes('Playwright'))
    );
    if (!isBrowserStep) return undefined;

    const outputRecord = this.asRecord(record.output);
    const dataRecord = this.asRecord(record.data);
    const stepResults = Array.isArray(record.stepResults) ? (record.stepResults as Array<Record<string, unknown>>) : [];
    const lastStep = stepResults.length > 0 ? this.asRecord(stepResults[stepResults.length - 1]) : undefined;
    const lastStepOutput = this.asRecord(lastStep?.output);
    const text = this.firstNonEmptyString(
      this.asString(record.text),
      this.asString(record.mainContent),
      this.asString(record.content),
      this.asString(record.summary),
      this.asString(outputRecord?.text),
      this.asString(outputRecord?.mainContent),
      this.asString(dataRecord?.text),
      this.asString(lastStepOutput?.text),
      this.asString(lastStepOutput?.mainContent)
    );
    const pageTitle =
      this.asString(record.pageTitle) ||
      this.asString(record.title) ||
      this.asString(outputRecord?.pageTitle) ||
      this.asString(lastStepOutput?.pageTitle);
    const pageUrl =
      this.asString(record.pageUrl) ||
      this.asString(record.url) ||
      this.asString(dataRecord?.url) ||
      this.asString(outputRecord?.pageUrl) ||
      this.asString(lastStepOutput?.pageUrl);

    if (text) {
      const header = pageTitle ? `### ${pageTitle}\n\n` : '';
      return `${header}${text}${executionId ? `\n\n执行单 ID: ${executionId}` : ''}`;
    }

    if (pageUrl) {
      const titleDisplay = pageTitle ? `【${pageTitle}】` : '';
      return `已成功打开并访问网页 ${titleDisplay}(${pageUrl})。${executionId ? `\n\n执行单 ID: ${executionId}` : ''}`;
    }

    return `网页操作执行完成。${executionId ? `\n\n执行单 ID: ${executionId}` : ''}`;
  }

  private summarizeDocumentResult(result: NormalizedChatExecutionResult): string | undefined {
    const record = this.asRecord(result.structuredData);
    if (!record) {
      return undefined;
    }

    const resultType = this.asString(record.resultType)?.trim().toLowerCase();
    const status = this.asString(record.status)?.trim().toLowerCase();
    const fileName = this.firstNonEmptyString(
      this.asString(record.fileName),
      this.asString(record.filename),
      this.asString(record.name)
    );
    const format = this.asString(record.format)?.trim().toUpperCase();

    const isExplicitDocument =
      resultType === 'document' || Boolean(record.isDocument) || Boolean(record.carbone);
    const hasDocumentFileMeta = Boolean(
      (fileName || format) && (result.downloadUrl || status === 'rendered')
    );

    if (!isExplicitDocument && !hasDocumentFileMeta) {
      return undefined;
    }


    return [
      '文档已生成。',
      ...(fileName ? [`- 文件名：${fileName}`] : []),
      ...(format ? [`- 格式：${format}`] : []),
      result.downloadUrl ? '- 可直接下载查看。' : '- 可在执行详情中查看结果。',
    ].join('\n');
  }

  private buildEnvelope(
    rawResult: unknown,
    context?: {
      executionId?: string;
      status?: WorkflowResultExecution['status'];
    }
  ): WorkflowResultEnvelope {
    if (this.isEnvelope(rawResult)) {
      return rawResult;
    }

    const legacyResultRecord = this.asRecord(rawResult);
    const businessData = this.pickLegacyBusinessData(rawResult);
    return {
      execution: {
        executionId: context?.executionId,
        status: context?.status,
      },
      result: {
        resultType: this.firstNonEmptyString(
          this.readStringField(rawResult, ['resultType', 'type']),
          businessData ? 'generic' : undefined
        ),
        title: this.readStringField(rawResult, ['title', 'name']),
        summary: this.readStringField(rawResult, [
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
        metrics: this.readRecordField(rawResult, ['metrics']),
        nextActions: this.normalizeNextActions(legacyResultRecord?.nextActions),
      },
      artifacts: this.collectLegacyArtifacts(rawResult),
      presentation: {
        preferAiSummary: Boolean(
          businessData &&
          !this.readStringField(rawResult, [
            'chatSummary',
            'finalAnswer',
            'formatted_output',
            'summary',
            'message',
            'result',
          ])
        ),
        preferStructuredView: false,
        chatSummary: this.readStringField(rawResult, ['chatSummary']),
        notificationSummary: this.readStringField(rawResult, [
          'notificationSummary',
          'chatSummary',
        ]),
        summaryFormat:
          this.readStringField(rawResult, ['summaryFormat']) === 'markdown'
            ? 'markdown'
            : 'plain_text',
        detailText: this.readStringField(rawResult, [
          'detailText',
          'formatted_output',
          'result',
          'text',
          'content',
        ]),
        detailFormat:
          this.readStringField(rawResult, ['detailFormat']) === 'markdown'
            ? 'markdown'
            : 'plain_text',
      },
    };
  }

  private isEnvelope(value: unknown): value is WorkflowResultEnvelope {
    const record = this.asRecord(value);
    if (!record) {
      return false;
    }
    return Boolean(
      this.asRecord(record.execution) ||
      this.asRecord(record.trigger) ||
      this.asRecord(record.presentation) ||
      Array.isArray(record.artifacts) ||
      this.asRecord(record.result)
    );
  }

  private pickStructuredData(envelope: WorkflowResultEnvelope, rawResult: unknown): unknown {
    if (envelope.result?.businessData !== undefined) {
      return envelope.result.businessData;
    }
    return this.pickLegacyBusinessData(rawResult);
  }

  private pickLegacyBusinessData(rawResult: unknown): unknown {
    const record = this.asRecord(rawResult);
    if (!record) {
      return typeof rawResult === 'string' ? undefined : rawResult;
    }

    const directStringResult = this.asString(record.result);
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
  }

  private normalizeNextActions(value: unknown): WorkflowResultNextAction[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const actions = value
      .map((item) => this.asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => ({
        type: this.asString(item.type),
        label: this.asString(item.label),
        value: this.asString(item.value),
      }))
      .filter((item) => item.type || item.label || item.value);

    return actions.length > 0 ? actions : undefined;
  }

  private collectLegacyArtifacts(value: unknown): WorkflowResultArtifact[] {
    const queue: unknown[] = [value];
    const visited = new Set<unknown>();
    const artifacts: WorkflowResultArtifact[] = [];
    let inspected = 0;

    while (queue.length > 0 && inspected < 80) {
      const current = queue.shift();
      inspected += 1;

      const parsed = this.tryParseJsonString(current);
      if (parsed !== undefined) {
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
      const downloadUrl = this.firstNonEmptyString(
        this.asString(record.downloadUrl),
        this.asString(record.download_url)
      );
      const url = this.firstNonEmptyString(
        this.asString(record.url),
        this.asString(record.fileUrl)
      );
      const artifactType = this.firstNonEmptyString(
        this.asString(record.artifactType),
        this.asString(record.artifact_type),
        this.asString(record.type)
      );
      const name = this.firstNonEmptyString(
        this.asString(record.name),
        this.asString(record.fileName),
        this.asString(record.label)
      );
      const sizeBytes =
        typeof record.sizeBytes === 'number'
          ? record.sizeBytes
          : typeof record.size === 'number'
            ? record.size
            : undefined;

      if (downloadUrl || url) {
        artifacts.push({
          type: artifactType || (downloadUrl ? 'file' : 'url'),
          artifactType,
          name,
          label: name,
          downloadUrl: this.normalizeArtifactUrl(downloadUrl || url),
          url: this.normalizeArtifactUrl(url || downloadUrl),
          mimeType: this.asString(record.mimeType) || this.asString(record.mime_type),
          path: this.asString(record.path),
          sizeBytes,
        });
      }

      Object.values(record).forEach((item) => {
        if (item && typeof item === 'object') {
          queue.push(item);
        }
      });
    }

    return artifacts;
  }

  private normalizeArtifacts(value: WorkflowResultArtifact[]): WorkflowResultArtifact[] {
    const seen = new Set<string>();
    const artifacts: WorkflowResultArtifact[] = [];

    value.forEach((item) => {
      const record = this.asRecord(item);
      if (!record) {
        return;
      }
      const rawDownloadUrl = this.firstNonEmptyString(
        this.asString(record.downloadUrl),
        this.asString(record.url)
      );
      const rawUrl = this.firstNonEmptyString(
        this.asString(record.url),
        this.asString(record.downloadUrl)
      );
      const artifact: WorkflowResultArtifact = {
        type:
          this.asString(record.type) ||
          this.asString(record.artifactType) ||
          this.asString(record.artifact_type) ||
          (this.firstNonEmptyString(rawDownloadUrl, rawUrl) ? 'file' : 'artifact'),
        artifactType: this.firstNonEmptyString(
          this.asString(record.artifactType),
          this.asString(record.artifact_type),
          this.asString(record.type)
        ),
        name: this.firstNonEmptyString(this.asString(record.name), this.asString(record.label)),
        label: this.firstNonEmptyString(this.asString(record.label), this.asString(record.name)),
        downloadUrl: this.normalizeArtifactUrl(rawDownloadUrl),
        url: this.normalizeArtifactUrl(rawUrl),
        path: this.asString(record.path),
        mimeType: this.firstNonEmptyString(
          this.asString(record.mimeType),
          this.asString(record.mime_type)
        ),
        sizeBytes:
          typeof record.sizeBytes === 'number'
            ? record.sizeBytes
            : typeof record.size === 'number'
              ? record.size
              : undefined,
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
  }

  private pickArtifactUrl(artifacts: WorkflowResultArtifact[]): string | undefined {
    return [...artifacts]
      .filter((artifact) => this.isDeliverableArtifact(artifact))
      .sort(
        (left, right) => this.artifactDownloadPriority(right) - this.artifactDownloadPriority(left)
      )
      .map((item) => this.firstNonEmptyString(item.downloadUrl, item.url))
      .find((item): item is string => Boolean(item));
  }

  private isDeliverableArtifact(artifact: WorkflowResultArtifact): boolean {
    const artifactType = artifact.artifactType || artifact.type || '';
    const mimeType = artifact.mimeType || '';
    const url = this.firstNonEmptyString(artifact.downloadUrl, artifact.url) || '';
    const name = artifact.name || artifact.label || '';

    if (
      /search_result|source|reference/i.test(artifactType) ||
      (artifactType === 'url' && !/\/renders\//i.test(url))
    ) {
      return false;
    }

    return Boolean(
      artifact.downloadUrl ||
      /document|file|report|export|attachment/i.test(artifactType) ||
      /\/renders\//i.test(url) ||
      /\.(?:md|pdf|docx?|xlsx?|csv|json|txt|zip)(?:$|[?#])/i.test(name) ||
      /\.(?:md|pdf|docx?|xlsx?|csv|json|txt|zip)(?:$|[?#])/i.test(url) ||
      /^(?:text\/markdown|text\/plain|application\/(?:pdf|json|zip|vnd\.))/i.test(mimeType)
    );
  }

  private normalizeArtifactUrl(value: string | undefined): string | undefined {
    return value?.replace(/\/public\/renders\//i, '/renders/');
  }

  private artifactDownloadPriority(artifact: WorkflowResultArtifact): number {
    const url = this.firstNonEmptyString(artifact.downloadUrl, artifact.url) || '';
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
    if (
      artifact.downloadUrl ||
      url.startsWith('/public/renders/') ||
      url.startsWith('/renders/') ||
      /document|file/i.test(artifactType)
    ) {
      return 300;
    }
    if (/application\/(pdf|json)|text\/plain/i.test(mimeType)) {
      return 200;
    }
    return 100;
  }

  private extractTemporalLink(value: unknown): string | undefined {
    const queue: unknown[] = [value];
    const visited = new Set<unknown>();
    let inspected = 0;

    while (queue.length > 0 && inspected < 50) {
      const current = queue.shift();
      inspected += 1;

      const parsed = this.tryParseJsonString(current);
      if (parsed !== undefined) {
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
      const directUrl = this.firstNonEmptyString(
        this.asString(record.temporalLink),
        this.asString(record.temporal_link)
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
  }

  private readStringField(value: unknown, fields: string[]): string | undefined {
    const record = this.asRecord(value);
    if (!record) {
      return undefined;
    }
    for (const field of fields) {
      const next = this.asString(record[field]);
      if (next) {
        return next;
      }
    }
    return undefined;
  }

  private readRecordField(value: unknown, fields: string[]): Record<string, unknown> | undefined {
    const record = this.asRecord(value);
    if (!record) {
      return undefined;
    }
    for (const field of fields) {
      const next = this.asRecord(record[field]);
      if (next) {
        return next;
      }
    }
    return undefined;
  }

  private tryParseJsonString(value: unknown): unknown {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }

  private safeJsonStringify(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  toContract(
    normalized: NormalizedChatExecutionResult,
    context?: {
      executionId?: string;
      status?: WorkflowResultExecution['status'];
      warnings?: string[];
    }
  ) {
    const executionId = context?.executionId || normalized.envelope.execution?.executionId;
    const status = context?.status || normalized.envelope.execution?.status || 'success';
    const chatSummary =
      normalized.envelope.presentation?.chatSummary ||
      normalized.summary ||
      normalized.body ||
      (typeof normalized.rawResult === 'string' ? normalized.rawResult : '') ||
      this.formatForChat(normalized, executionId);

    return {
      _version: '1' as const,
      executionId,
      status,
      hasBusinessResult: normalized.hasBusinessResult,
      chatSummary,
      summaryFormat: normalized.summaryFormat || 'plain_text',
      title: normalized.title,
      businessData: normalized.structuredData,
      artifacts: normalized.artifacts,
      downloadUrl: normalized.downloadUrl,
      temporalLink: normalized.temporalLink,
      nextActions: normalized.envelope.result?.nextActions,
      warnings: context?.warnings,
    };
  }

  private firstNonEmptyString(...values: Array<string | undefined>): string | undefined {
    return values.find(
      (item): item is string => typeof item === 'string' && item.trim().length > 0
    );
  }
}
