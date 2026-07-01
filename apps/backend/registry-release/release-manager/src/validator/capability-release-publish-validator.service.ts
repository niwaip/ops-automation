import { Inject, Injectable } from '@nestjs/common';
import { BrowserRecordingExecutionPlanValidatorService } from '../validator/browser-recording-execution-plan-validator.service';
import { BrowserRecordingFlowNormalizerService } from '../compiler/browser-recording-flow-normalizer.service';
import { CAPABILITY_RELEASE_ERROR_CODE } from '../capability-release.constants';
import { CapabilityReleaseTemporalSchemaService } from '../compiler/capability-release-temporal-schema.service';
import type { ReleaseManagerSkillServicePort } from '../platform-runtime.ports';
import { RELEASE_MANAGER_SKILL_SERVICE } from '../platform-runtime.tokens';
import {
  CapabilityReleaseDTO,
  CapabilitySourceSnapshotDTO,
  SkillDraftDTO,
} from '../interfaces';

type ToolValidationResult = Awaited<
  ReturnType<ReleaseManagerSkillServicePort['validateSkillToolsPayload']>
>;
type BrowserRecordingExecutionPlanCompatibilityValidator =
  BrowserRecordingExecutionPlanValidatorService & {
    normalizePayloadForCompatibility(payload: Record<string, unknown>): Record<string, unknown>;
  };

export type CapabilityReleasePublishBlocker = {
  code: string;
  message: string;
  auditEventType: string;
  auditSummary: string;
  details: Record<string, unknown>;
};

export type CapabilityReleasePublishValidationResult = {
  normalizedDraftTools: string[];
  normalizedDraftPayload: Record<string, unknown>;
  blocker?: CapabilityReleasePublishBlocker;
};

@Injectable()
export class CapabilityReleasePublishValidatorService {
  constructor(
    @Inject(RELEASE_MANAGER_SKILL_SERVICE)
    private readonly skillService: ReleaseManagerSkillServicePort,
    private readonly browserRecordingFlowNormalizerService: BrowserRecordingFlowNormalizerService,
    private readonly browserRecordingExecutionPlanValidatorService: BrowserRecordingExecutionPlanValidatorService,
    private readonly capabilityReleaseTemporalSchemaService: CapabilityReleaseTemporalSchemaService
  ) {}

  async validatePublishDraft(
    release: CapabilityReleaseDTO,
    draft: SkillDraftDTO,
    snapshot?: CapabilitySourceSnapshotDTO
  ): Promise<CapabilityReleasePublishValidationResult> {
    const normalizedDraftTools = this.getNormalizedDraftTools(release, draft);
    const normalizedDraftPayload = this.getNormalizedDraftPayload(
      release,
      draft,
      normalizedDraftTools
    );

    if (release.sourceType === 'browser_recording') {
      const publishValidation =
        this.browserRecordingExecutionPlanValidatorService.validateForPublish(
          snapshot?.sourcePayload || {}
        );
      if (!publishValidation.valid) {
        return {
          normalizedDraftTools,
          normalizedDraftPayload,
          blocker: {
            code: 'invalid_source_payload',
            message: '发布前 executionPlan 校验失败',
            auditEventType: 'skill_publish_blocked_by_execution_plan_validation',
            auditSummary: '发布前 executionPlan 校验失败',
            details: { planValidation: publishValidation },
          },
        };
      }
    }

    const toolValidation = await this.validateTools(
      release,
      draft,
      normalizedDraftTools,
      normalizedDraftPayload
    );
    if (!toolValidation.isValid) {
      return {
        normalizedDraftTools,
        normalizedDraftPayload,
        blocker: {
          code: CAPABILITY_RELEASE_ERROR_CODE.SKILL_PUBLISH_TOOL_VALIDATION_FAILED,
          message: '发布前工具校验失败',
          auditEventType: 'skill_publish_blocked_by_tool_validation',
          auditSummary: '发布前工具校验失败',
          details: { toolValidation },
        },
      };
    }

    if (release.sourceType === 'temporal_workflow') {
      const mappingReadiness =
        this.capabilityReleaseTemporalSchemaService.assessTemporalDocumentMappingReadiness(
          snapshot?.sourcePayload || {}
        );
      if (mappingReadiness.applicable && mappingReadiness.mappedInputCount === 0) {
        return {
          normalizedDraftTools,
          normalizedDraftPayload,
          blocker: {
            code: CAPABILITY_RELEASE_ERROR_CODE.TEMPORAL_DOCUMENT_MAPPING_NOT_READY,
            message: '当前模板工作流缺少显式 renderPath/templateBinding，暂不允许发布',
            auditEventType: 'skill_publish_blocked_by_document_mapping',
            auditSummary: '发布前阻断：模板工作流缺少显式 renderPath/templateBinding',
            details: { mappingReadiness },
          },
        };
      }
    }

    return {
      normalizedDraftTools,
      normalizedDraftPayload,
    };
  }

  private getNormalizedDraftTools(
    release: CapabilityReleaseDTO,
    draft: SkillDraftDTO
  ): string[] {
    return release.sourceType === 'browser_recording'
      ? this.browserRecordingFlowNormalizerService.normalizeToolNames(draft.tools)
      : draft.tools;
  }

  private getNormalizedDraftPayload(
    release: CapabilityReleaseDTO,
    draft: SkillDraftDTO,
    normalizedDraftTools: string[]
  ): Record<string, unknown> {
    if (release.sourceType !== 'browser_recording') {
      return { ...(draft.draftPayload as Record<string, unknown>) };
    }

    const draftPayload = draft.draftPayload as Record<string, unknown>;
    return (
      this
        .browserRecordingExecutionPlanValidatorService as BrowserRecordingExecutionPlanCompatibilityValidator
    ).normalizePayloadForCompatibility({
      ...draftPayload,
      tools: Array.isArray(draftPayload.tools)
        ? this.browserRecordingFlowNormalizerService.normalizeToolNames(draftPayload.tools)
        : normalizedDraftTools,
      executionFlow: this.browserRecordingFlowNormalizerService.normalizeExecutionFlow(
        draftPayload.executionFlow
      ),
    });
  }

  private validateTools(
    release: CapabilityReleaseDTO,
    draft: SkillDraftDTO,
    normalizedDraftTools: string[],
    normalizedDraftPayload: Record<string, unknown>
  ): Promise<ToolValidationResult> {
    return this.skillService.validateSkillToolsPayload({
      tools: normalizedDraftTools,
      executionFlow:
        release.sourceType === 'browser_recording'
          ? (normalizedDraftPayload.executionFlow as Record<string, unknown>[])
          : [],
      executionFlowTemplateIds: draft.executionFlowTemplateIds,
    });
  }
}
