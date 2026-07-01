import { Injectable } from '@nestjs/common';
import axios from 'axios';
import {
  getCarboneExternalUrl,
  getCarboneServiceUrl,
} from '../config/service-endpoints';
import { CapabilityReleaseSkillDraftService } from '../capability-release-skill-draft.service';
import {
  CapabilityReleaseDTO,
  ExecuteCapabilityRuntimeResultDTO,
} from '../interfaces';
import type {
  CapabilityReleaseRuntimeAccessors,
  CapabilityReleaseRuntimeExecutionOptions,
} from './capability-release-runtime.service';

type RenderResolvedRequest = {
  publishedSkillId?: string;
  templateId?: string;
  skillId?: string;
  data: Record<string, unknown>;
  outputFormat?: string;
  outputName?: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
  prepareLocalizedRenderData?: boolean;
};

type GenerateRenderDataResponse = {
  success?: boolean;
  error?: string;
  renderResolvedRequest?: RenderResolvedRequest;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const toExternalCarboneUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `${getCarboneExternalUrl()}${trimmed}`;
  }
  return `${getCarboneExternalUrl()}/${trimmed.replace(/^\/+/, '')}`;
};

const extractDownloadUrl = (value: unknown): string | undefined => {
  const queue: unknown[] = [value];
  const visited = new Set<unknown>();
  let inspected = 0;

  while (queue.length > 0 && inspected < 50) {
    const current = queue.shift();
    inspected += 1;

    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    const record = current as Record<string, unknown>;
    const directUrl = [record.downloadUrl, record.download_url, record.url]
      .map((item) => toExternalCarboneUrl(item))
      .find((item): item is string => typeof item === 'string' && item.trim().length > 0);
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

@Injectable()
export class CapabilityReleaseDocumentRuntimeService {
  constructor(
    private readonly capabilityReleaseSkillDraftService: CapabilityReleaseSkillDraftService
  ) {}

  async executePublishedSkill(
    release: CapabilityReleaseDTO,
    skillId: string,
    input: Record<string, unknown> | undefined,
    userId: string | undefined,
    options: CapabilityReleaseRuntimeExecutionOptions | undefined,
    accessors: CapabilityReleaseRuntimeAccessors
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
    const sourceTemplate =
      this.parseJson<Record<string, unknown>>(snapshot.sourcePayload.sourceTemplate) ||
      this.capabilityReleaseSkillDraftService.extractExecutionFlowSourceTemplate(
        snapshot.sourcePayload
      ) ||
      {};
    const renderInput = this.resolveDocumentRenderInput(input, sourceTemplate);
    const renderRequest = await this.resolveDocumentRenderRequest(skillId, renderInput);
    const resolvedTemplateId = renderRequest.templateId || renderInput.templateId;
    const resolvedSkillId = renderRequest.skillId || renderInput.skillId;
    const url = `${getCarboneServiceUrl()}/studio/render-resolved`;
    const logs = [
      '[DocumentRuntime] 调用文档运行时: resolved_render',
      `[DocumentRuntime] endpoint=${url}`,
      `[DocumentRuntime] publishedSkillId=${skillId}`,
      ...(resolvedTemplateId ? [`[DocumentRuntime] templateId=${resolvedTemplateId}`] : []),
      ...(resolvedSkillId ? [`[DocumentRuntime] sourceSkillId=${resolvedSkillId}`] : []),
      ...(renderRequest.outputFormat
        ? [`[DocumentRuntime] outputFormat=${renderRequest.outputFormat}`]
        : []),
      ...(renderRequest.outputName
        ? [`[DocumentRuntime] outputName=${renderRequest.outputName}`]
        : []),
      ...(renderRequest.sourceLanguage
        ? [`[DocumentRuntime] sourceLanguage=${renderRequest.sourceLanguage}`]
        : []),
      ...(renderRequest.targetLanguages?.length
        ? [`[DocumentRuntime] targetLanguages=${renderRequest.targetLanguages.join(',')}`]
        : []),
      ...(renderRequest.prepareLocalizedRenderData
        ? ['[DocumentRuntime] prepareLocalizedRenderData=true']
        : []),
    ];

    try {
      const response = await axios.post<Record<string, unknown>>(url, renderRequest, {
        timeout: 120000,
      });
      const responseData = response.data;
      const downloadUrl = extractDownloadUrl(responseData);

      const rawResult =
        responseData !== undefined && responseData !== null
          ? typeof responseData === 'object' && !Array.isArray(responseData)
            ? (responseData as Record<string, unknown>)
            : { result: responseData }
          : {};

      const normalizedResult = {
        ...rawResult,
        ...(downloadUrl ? { downloadUrl } : {}),
        ...(resolvedTemplateId ? { templateId: resolvedTemplateId } : {}),
        ...(resolvedSkillId ? { skillId: resolvedSkillId } : {}),
      };

      await accessors.insertAuditEvent(
        release.id,
        'skill_runtime_invoked',
        userId,
        true,
        `运行时调用 Document Skill 成功: ${skillId}`,
        {
          publishedSkillId: skillId,
          capabilityId: skillId,
          capabilityVersion: options?.capabilityVersion || null,
          runtime: 'document',
          requestedRuntimeType: options?.runtimeType || null,
          executionId: options?.executionId || null,
          stepId: options?.stepId || null,
          sourceTemplate,
          renderMode: 'resolved',
        }
      );

      return {
        releaseId: release.id,
        capabilityId: skillId,
        capabilityVersion: options?.capabilityVersion || null,
        publishedSkillId: skillId,
        runtime: 'document',
        success: true,
        downloadUrl: downloadUrl || null,
        output: normalizedResult,
        result: normalizedResult,
        logs,
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Document runtime execution failed';
      logs.push(`[DocumentRuntime][Error] ${message}`);

      await accessors.insertAuditEvent(
        release.id,
        'skill_runtime_invoked',
        userId,
        false,
        `运行时调用 Document Skill 失败: ${skillId}`,
        {
          publishedSkillId: skillId,
          capabilityId: skillId,
          capabilityVersion: options?.capabilityVersion || null,
          runtime: 'document',
          requestedRuntimeType: options?.runtimeType || null,
          executionId: options?.executionId || null,
          stepId: options?.stepId || null,
          sourceTemplate,
          renderMode: 'resolved',
          error: message,
        }
      );

      return {
        releaseId: release.id,
        capabilityId: skillId,
        capabilityVersion: options?.capabilityVersion || null,
        publishedSkillId: skillId,
        runtime: 'document',
        success: false,
        downloadUrl: null,
        output: null,
        result: null,
        logs,
        error: message,
      };
    }
  }

  private resolveDocumentRenderInput(
    input: Record<string, unknown> | undefined,
    sourceTemplate: Record<string, unknown>
  ): {
    templateId?: string;
    skillId?: string;
    outputFormat?: string;
    outputName?: string;
    sourceLanguage?: string;
    targetLanguages: string[];
    prepareLocalizedRenderData?: boolean;
    data: Record<string, unknown>;
  } {
    const normalizedInput = input || {};
    const directData = asRecord(normalizedInput.data);
    const directParams = asRecord(normalizedInput.params);
    const data = directData || directParams || this.omitRuntimeEnvelopeFields(normalizedInput);
    const targetLanguages = this.pickFirstStringArray(
      normalizedInput.targetLanguages,
      normalizedInput.target_languages,
      sourceTemplate.targetLanguages,
      sourceTemplate.target_languages
    );
    const sourceLanguage = this.pickFirstNonEmptyString(
      normalizedInput.sourceLanguage,
      normalizedInput.source_language,
      sourceTemplate.sourceLanguage,
      sourceTemplate.source_language
    );
    const prepareLocalizedRenderData = this.pickFirstBoolean(
      normalizedInput.prepareLocalizedRenderData,
      normalizedInput.prepare_localized_render_data,
      sourceTemplate.prepareLocalizedRenderData,
      sourceTemplate.prepare_localized_render_data
    );

    return {
      templateId: this.pickFirstNonEmptyString(
        normalizedInput.templateId,
        normalizedInput.template_id,
        sourceTemplate.templateId
      ),
      skillId: this.pickFirstNonEmptyString(
        normalizedInput.skillId,
        normalizedInput.skill_id,
        sourceTemplate.skillId
      ),
      outputFormat: this.pickFirstNonEmptyString(
        normalizedInput.outputFormat,
        normalizedInput.output_format,
        normalizedInput.format,
        sourceTemplate.format
      ),
      outputName: this.pickFirstNonEmptyString(
        normalizedInput.outputName,
        normalizedInput.output_name,
        sourceTemplate.outputName,
        sourceTemplate.output_name
      ),
      sourceLanguage,
      targetLanguages,
      prepareLocalizedRenderData:
        prepareLocalizedRenderData === undefined
          ? Boolean(sourceLanguage) || targetLanguages.length > 0
            ? true
            : undefined
          : prepareLocalizedRenderData,
      data,
    };
  }

  private async resolveDocumentRenderRequest(
    publishedSkillId: string,
    renderInput: ReturnType<CapabilityReleaseDocumentRuntimeService['resolveDocumentRenderInput']>
  ): Promise<RenderResolvedRequest> {
    const fallbackRequest: RenderResolvedRequest = {
      publishedSkillId,
      templateId: renderInput.templateId,
      skillId: renderInput.skillId,
      data: renderInput.data,
      outputFormat: renderInput.outputFormat,
      ...(renderInput.outputName ? { outputName: renderInput.outputName } : {}),
      ...(renderInput.sourceLanguage ? { sourceLanguage: renderInput.sourceLanguage } : {}),
      ...(renderInput.targetLanguages.length > 0
        ? { targetLanguages: renderInput.targetLanguages }
        : {}),
      ...(renderInput.prepareLocalizedRenderData !== undefined
        ? { prepareLocalizedRenderData: renderInput.prepareLocalizedRenderData }
        : {}),
    };

    try {
      const response = await axios.post<GenerateRenderDataResponse>(
        `${getCarboneServiceUrl()}/studio/generate-render-data-with-skill`,
        {
          publishedSkillId,
          templateId: renderInput.templateId,
          skillId: renderInput.skillId,
          simulatedData: renderInput.data,
          outputFormat: renderInput.outputFormat,
          ...(renderInput.outputName ? { outputName: renderInput.outputName } : {}),
          ...(renderInput.sourceLanguage ? { sourceLanguage: renderInput.sourceLanguage } : {}),
          ...(renderInput.targetLanguages.length > 0
            ? { targetLanguages: renderInput.targetLanguages }
            : {}),
          ...(renderInput.prepareLocalizedRenderData !== undefined
            ? { prepareLocalizedRenderData: renderInput.prepareLocalizedRenderData }
            : {}),
        },
        {
          timeout: 120000,
        }
      );
      const standardizedRequest = response.data?.renderResolvedRequest;
      const standardizedData = asRecord(standardizedRequest?.data);
      if (response.data?.success && standardizedRequest && standardizedData) {
        return {
          ...standardizedRequest,
          data: standardizedData,
          ...(standardizedRequest.outputFormat ? {} : { outputFormat: renderInput.outputFormat }),
        };
      }
    } catch {
      // Standardization failure falls back to direct render-resolved for historical compatibility.
    }

    return fallbackRequest;
  }

  private omitRuntimeEnvelopeFields(value: Record<string, unknown>): Record<string, unknown> {
    const omittedKeys = new Set([
      'templateId',
      'template_id',
      'skillId',
      'skill_id',
      'params',
      'data',
      'outputFormat',
      'output_format',
      'format',
      'outputName',
      'output_name',
      'sourceLanguage',
      'source_language',
      'targetLanguages',
      'target_languages',
      'prepareLocalizedRenderData',
      'prepare_localized_render_data',
      'action',
      'sourceTemplate',
    ]);

    return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, current]) => {
      if (!omittedKeys.has(key)) {
        acc[key] = current;
      }
      return acc;
    }, {});
  }

  private pickFirstNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private pickFirstStringArray(...values: unknown[]): string[] {
    for (const value of values) {
      if (!Array.isArray(value)) {
        continue;
      }
      const normalized = value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      if (normalized.length > 0) {
        return normalized;
      }
    }
    return [];
  }

  private pickFirstBoolean(...values: unknown[]): boolean | undefined {
    for (const value of values) {
      if (typeof value === 'boolean') {
        return value;
      }
    }
    return undefined;
  }

  private parseJson<T = unknown>(value: unknown): T {
    if (value === null || value === undefined) {
      return value as T;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    }
    return value as T;
  }
}
