import {
  BridgeRecorderExportDTO,
  RecorderBridgePublishPayloadDTO,
} from '../interfaces';
import { Injectable } from '@nestjs/common';
import { BrowserRecordingFlowNormalizerService } from './browser-recording-flow-normalizer.service';

type NormalizedRecorderPublishPayload = {
  name: string;
  description: string;
  triggerKeywords: string[];
  paramsSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  executionFlowTemplateIds: string[];
  executionFlow: Array<Record<string, unknown>>;
  tools: string[];
  apiEndpoints: Record<string, unknown> | null;
  loopPlanPreview?: Array<Record<string, unknown>>;
};

type CompiledRecorderBridgePayload = {
  hydratedPublishPayload: Record<string, unknown>;
  normalizedPayload: NormalizedRecorderPublishPayload;
  sourcePayload: Record<string, unknown>;
  draftPayload: Record<string, unknown>;
  sourceName: string;
};

@Injectable()
export class CapabilityReleaseRecorderBridgeCompilerService {
  constructor(
    private readonly browserRecordingFlowNormalizerService: BrowserRecordingFlowNormalizerService
  ) {}

  compileRecorderBridge(dto: BridgeRecorderExportDTO): CompiledRecorderBridgePayload {
    const publishPayload = dto.exportArtifacts?.skillDraft?.publishPayload;
    const hydratedPublishPayload = this.hydrateRecorderPublishPayload(
      dto.exportArtifacts as Record<string, unknown>,
      publishPayload as Record<string, unknown>
    );
    const normalizedPayload = this.normalizeRecorderPublishPayload(
      hydratedPublishPayload as RecorderBridgePublishPayloadDTO
    );
    const sourcePayload = this.buildRecorderSourcePayload(dto, normalizedPayload);
    const sourceName =
      dto.sourceName ||
      normalizedPayload.name ||
      dto.userGoal ||
      dto.exportArtifacts?.skillDraft?.name ||
      'Recorder Bridge Capability';
    const draftPayload = {
      ...normalizedPayload,
      sourceType: 'browser_recording',
      bridgeMode: 'browser_recording_native',
      recorderBridge: {
        userGoal: dto.userGoal || null,
        guidance:
          typeof dto.exportArtifacts?.guidance === 'string' ? dto.exportArtifacts.guidance : null,
        commandCount: Array.isArray(dto.exportArtifacts?.commands)
          ? dto.exportArtifacts.commands.length
          : 0,
      },
    } as Record<string, unknown>;

    return {
      hydratedPublishPayload,
      normalizedPayload,
      sourcePayload,
      draftPayload,
      sourceName,
    };
  }

  private normalizeRecorderPublishPayload(
    input: RecorderBridgePublishPayloadDTO
  ): NormalizedRecorderPublishPayload {
    const name =
      typeof input.name === 'string' && input.name.trim()
        ? input.name.trim()
        : `recorder-bridge-${Date.now()}`;
    const description =
      typeof input.description === 'string' && input.description.trim()
        ? input.description.trim()
        : `浏览器录制桥接草案：${name}`;
    const triggerKeywords = Array.isArray(input.triggerKeywords)
      ? input.triggerKeywords.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : [];
    const paramsSchema =
      input.paramsSchema &&
      typeof input.paramsSchema === 'object' &&
      !Array.isArray(input.paramsSchema)
        ? input.paramsSchema
        : { properties: {}, required: [] };
    const outputSchema =
      input.outputSchema &&
      typeof input.outputSchema === 'object' &&
      !Array.isArray(input.outputSchema)
        ? input.outputSchema
        : undefined;
    const executionFlowTemplateIds = Array.isArray(input.executionFlowTemplateIds)
      ? input.executionFlowTemplateIds.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : [];
    const executionFlow = this.browserRecordingFlowNormalizerService.normalizeExecutionFlow(
      input.executionFlow
    );
    const tools = this.browserRecordingFlowNormalizerService.mergeToolsWithExecutionFlow(
      input.tools,
      executionFlow
    );
    const apiEndpoints =
      input.apiEndpoints &&
      typeof input.apiEndpoints === 'object' &&
      !Array.isArray(input.apiEndpoints)
        ? input.apiEndpoints
        : null;
    const loopPlanPreview = Array.isArray(input.loopPlanPreview)
      ? input.loopPlanPreview.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item)
        )
      : undefined;

    return {
      name,
      description,
      triggerKeywords: triggerKeywords.length > 0 ? triggerKeywords : [name],
      paramsSchema,
      ...(outputSchema ? { outputSchema } : {}),
      executionFlowTemplateIds,
      executionFlow,
      tools,
      apiEndpoints,
      ...(loopPlanPreview?.length ? { loopPlanPreview } : {}),
    };
  }

  private buildRecorderSourcePayload(
    dto: BridgeRecorderExportDTO,
    normalizedPayload: {
      description: string;
      paramsSchema: Record<string, unknown>;
      outputSchema?: Record<string, unknown>;
      executionFlow: Array<Record<string, unknown>>;
      tools: string[];
      apiEndpoints: Record<string, unknown> | null;
    }
  ): Record<string, unknown> {
    return {
      goal: dto.userGoal || normalizedPayload.description,
      description: normalizedPayload.description,
      paramsSchema: normalizedPayload.paramsSchema,
      ...(normalizedPayload.outputSchema ? { outputSchema: normalizedPayload.outputSchema } : {}),
      executionFlow: normalizedPayload.executionFlow,
      tools: normalizedPayload.tools,
      runtimeMetadata: normalizedPayload.apiEndpoints?.runtimeMetadata || {},
      recordingCommands: Array.isArray(dto.exportArtifacts?.commands)
        ? dto.exportArtifacts.commands
        : [],
      guidance:
        typeof dto.exportArtifacts?.guidance === 'string' ? dto.exportArtifacts.guidance : '',
      sourceType: 'browser_recording',
    };
  }

  private hydrateRecorderPublishPayload(
    exportArtifacts: Record<string, unknown>,
    publishPayload: Record<string, unknown>
  ): Record<string, unknown> {
    const nextPayload = { ...publishPayload };
    const nextApiEndpoints = this.asRecord(nextPayload.apiEndpoints) || {};
    const nextRuntimeMetadata = this.asRecord(nextApiEndpoints.runtimeMetadata) || {};
    const nextExecutionPlan = this.asRecord(nextRuntimeMetadata.executionPlan) || {};
    const nextExecutionPlanTemplateSteps = Array.isArray(nextExecutionPlan.templateSteps)
      ? nextExecutionPlan.templateSteps
      : [];
    const nextRuntimeTemplateSteps = Array.isArray(nextRuntimeMetadata.templateSteps)
      ? nextRuntimeMetadata.templateSteps
      : [];
    const nextRuntimeLoopPlanPreview = Array.isArray(nextRuntimeMetadata.loopPlanPreview)
      ? nextRuntimeMetadata.loopPlanPreview
      : [];
    const skillDraft = this.asRecord(exportArtifacts.skillDraft) || {};
    const skillDraftExecutionPlan = this.asRecord(skillDraft.executionPlan);
    const exportLoopDraft = this.asRecord(exportArtifacts.loopDraft);
    const exportLoopPlanPreview = Array.isArray(exportArtifacts.loopPlanPreview)
      ? exportArtifacts.loopPlanPreview.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item)
        )
      : [];
    const exportTemplateSteps = Array.isArray(exportArtifacts.templateSteps)
      ? exportArtifacts.templateSteps.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item)
        )
      : [];

    const mergedExecutionPlan = {
      ...(skillDraftExecutionPlan || {}),
      ...nextExecutionPlan,
      ...(nextExecutionPlan.loopDraft
        ? {}
        : exportLoopDraft
          ? { loopDraft: exportLoopDraft }
          : {}),
      ...(nextExecutionPlanTemplateSteps.length > 0
        ? {}
        : exportTemplateSteps.length > 0
          ? { templateSteps: exportTemplateSteps }
          : {}),
    };

    const mergedRuntimeMetadata = {
      ...nextRuntimeMetadata,
      ...(Object.keys(mergedExecutionPlan).length > 0 ? { executionPlan: mergedExecutionPlan } : {}),
      ...(nextRuntimeTemplateSteps.length > 0
        ? {}
        : exportTemplateSteps.length > 0
          ? { templateSteps: exportTemplateSteps }
          : {}),
      ...(nextRuntimeMetadata.loopDraft ? {} : exportLoopDraft ? { loopDraft: exportLoopDraft } : {}),
      ...(nextRuntimeLoopPlanPreview.length > 0
        ? {}
        : exportLoopPlanPreview.length > 0
          ? { loopPlanPreview: exportLoopPlanPreview }
          : {}),
    };

    nextPayload.apiEndpoints = {
      ...nextApiEndpoints,
      runtimeMetadata: mergedRuntimeMetadata,
    };
    if (!nextPayload.loopPlanPreview && exportLoopPlanPreview.length > 0) {
      nextPayload.loopPlanPreview = exportLoopPlanPreview;
    }

    return nextPayload;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }
}
