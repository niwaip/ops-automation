import { Inject, Injectable } from '@nestjs/common';
import { BrowserRecordingExecutionPlanValidatorService } from '../validator/browser-recording-execution-plan-validator.service';
import { BrowserRecordingFlowNormalizerService } from '../compiler/browser-recording-flow-normalizer.service';
import { CAPABILITY_RELEASE_ERROR_CODE } from '../capability-release.constants';
import { CapabilityReleaseTemporalSchemaService } from '../compiler/capability-release-temporal-schema.service';
import type { ReleaseManagerPrismaPort, ReleaseManagerSkillServicePort } from '../platform-runtime.ports';
import { RELEASE_MANAGER_PRISMA, RELEASE_MANAGER_SKILL_SERVICE } from '../platform-runtime.tokens';
import { SchemaCompatibilityService, SchemaDiffResult } from './schema-compatibility.service';
import { ContractLintService, ContractLintResult } from './contract-lint.service';
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
  /** Output-schema compatibility diff (§15.4 item 5), when the payload declares one */
  compatibility?: SchemaDiffResult;
  /** Gate 0 contract lint result — always present when the result has no blocker */
  lint?: ContractLintResult;
};

@Injectable()
export class CapabilityReleasePublishValidatorService {
  constructor(
    @Inject(RELEASE_MANAGER_SKILL_SERVICE)
    private readonly skillService: ReleaseManagerSkillServicePort,
    @Inject(RELEASE_MANAGER_PRISMA)
    private readonly prisma: ReleaseManagerPrismaPort,
    private readonly browserRecordingFlowNormalizerService: BrowserRecordingFlowNormalizerService,
    private readonly browserRecordingExecutionPlanValidatorService: BrowserRecordingExecutionPlanValidatorService,
    private readonly capabilityReleaseTemporalSchemaService: CapabilityReleaseTemporalSchemaService,
    private readonly schemaCompatibilityService: SchemaCompatibilityService,
    private readonly contractLintService: ContractLintService
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

    // Gate 0 — Contract Lint (§10.1): static schema/subset/ref checks. Failure
    // blocks the publish BEFORE any code generation happens. A payload with NO
    // declarative contract at all is a P0 violation (§15.1): a schema-less
    // capability must never be published, so the gate fails closed instead of
    // silently skipping the lint.
    const contractForLint = this.extractContractForLint(release, draft, snapshot);
    if (!contractForLint) {
      return {
        normalizedDraftTools,
        normalizedDraftPayload,
        blocker: {
          code: CAPABILITY_RELEASE_ERROR_CODE.CONTRACT_LINT_FAILED,
          message:
            '发布契约缺失：源定义与 Skill 草案均未声明任何契约（outputSchema/contracts/manifest），无输出 Schema 的能力禁止发布 (P0 §15.1)',
          auditEventType: 'skill_publish_blocked_by_contract_lint',
          auditSummary: '发布前阻断：能力未声明任何契约（无输出 Schema，P0）',
          details: { reason: 'no_declarative_contract' },
        },
      };
    }
    const lint = this.contractLintService.lintContract(contractForLint);
    if (!lint.passed) {
      return {
        normalizedDraftTools,
        normalizedDraftPayload,
        lint,
        blocker: {
          code: CAPABILITY_RELEASE_ERROR_CODE.CONTRACT_LINT_FAILED,
          message: '契约 Contract Lint 未通过，禁止进入代码生成',
          auditEventType: 'skill_publish_blocked_by_contract_lint',
          auditSummary: '发布前阻断：契约 Contract Lint 未通过',
          details: { lint },
        },
      };
    }

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

    // Output-schema backward-compatibility check (§15.4 item 5): blocks a
    // publish whose new output schema breaks consumers of the already
    // published schema. Skipped when no old schema exists (first publish) or
    // when the manifest declares contractCompatibility: none.
    const compatibility = await this.checkOutputSchemaCompatibility(
      release,
      draft,
      snapshot
    );
    if (compatibility && !compatibility.compatible) {
      return {
        normalizedDraftTools,
        normalizedDraftPayload,
        blocker: {
          code: CAPABILITY_RELEASE_ERROR_CODE.SCHEMA_BREAKING_CHANGE,
          message: '新版输出 Schema 与已发布版本不向后兼容，发布被阻断',
          auditEventType: 'skill_publish_blocked_by_schema_breaking_change',
          auditSummary: '发布前阻断：新版输出 Schema 与已发布版本不向后兼容',
          details: { compatibility },
        },
      };
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
      ...(compatibility ? { compatibility } : {}),
      lint,
    };
  }

  /**
   * Extracts the contract payload that Contract Lint validates. Prefers the
   * source snapshot when IT declares a contract; otherwise falls back to the
   * derived Skill draft payload (which post-fix-① always carries the
   * authoritative `outputSchema`). Returns undefined only when NEITHER
   * declares any contract — which the caller treats as a P0 schema-less
   * publish and blocks.
   */
  private extractContractForLint(
    release: CapabilityReleaseDTO,
    draft: SkillDraftDTO,
    snapshot?: CapabilitySourceSnapshotDTO
  ): Record<string, unknown> | undefined {
    const snapshotPayload = (snapshot?.sourcePayload as Record<string, unknown>) || {};
    if (this.hasDeclarativeContract(snapshotPayload)) {
      return snapshotPayload;
    }
    const draftPayload = (draft.draftPayload as Record<string, unknown>) || {};
    return this.hasDeclarativeContract(draftPayload) ? draftPayload : undefined;
  }

  private hasDeclarativeContract(payload: Record<string, unknown>): boolean {
    return Boolean(
      payload.contracts ||
        payload.outputSchema ||
        (payload.manifest && typeof payload.manifest === 'object')
    );
  }

  /**
   * Compares the draft's declared output schema against the currently
   * published one for the same skill. Returns undefined when there is nothing
   * to compare (first publish, no declarative schema in the payload, or the
   * manifest opts out with contractCompatibility: none).
   */
  private async checkOutputSchemaCompatibility(
    release: CapabilityReleaseDTO,
    draft: SkillDraftDTO,
    snapshot?: CapabilitySourceSnapshotDTO
  ): Promise<SchemaDiffResult | undefined> {
    const payload =
      (snapshot?.sourcePayload as Record<string, unknown>) ||
      (draft.draftPayload as Record<string, unknown>) ||
      {};
    const newSchema = this.schemaCompatibilityService.extractOutputSchema(payload);
    if (!newSchema) return undefined;

    const mode = this.schemaCompatibilityService.resolveCompatibility(payload);
    if (mode === 'none') return undefined;

    const skillName = draft.name || release.sourceName;
    if (!skillName) return undefined;

    const rows = await this.prisma
      .$queryRawUnsafe<Array<{ output_schema: unknown }>>(
        `SELECT output_schema FROM skill_configs WHERE name = $1 LIMIT 1`,
        skillName
      )
      .catch(() => []);
    const oldSchema = (rows?.[0]?.output_schema ?? null) as Record<string, unknown> | null;

    return this.schemaCompatibilityService.compareOutputSchemas(oldSchema, newSchema, mode);
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
