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
    const contractForLint = this.extractContractForLint(
      release,
      draft,
      normalizedDraftPayload,
      snapshot
    );
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
      normalizedDraftPayload,
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
   * Extracts the contract payload that Contract Lint validates. The normalized
   * draft is the exact artifact that will be persisted, so it is authoritative.
   * Source snapshots are only legacy fallback evidence. Returns undefined when
   * neither source declares a contract, which blocks schema-less publishing.
   */
  private extractContractForLint(
    release: CapabilityReleaseDTO,
    draft: SkillDraftDTO,
    normalizedDraftPayload: Record<string, unknown>,
    snapshot?: CapabilitySourceSnapshotDTO
  ): Record<string, unknown> | undefined {
    // The normalized draft is the exact immutable artifact being published.
    // Source snapshots are authoring evidence and may contain weaker inferred
    // contracts (for example outputParams without an explicit type), so they
    // must never override the publish artifact's authoritative schema.
    if (this.hasDeclarativeContract(normalizedDraftPayload)) {
      return normalizedDraftPayload;
    }
    const snapshotPayload = (snapshot?.sourcePayload as Record<string, unknown>) || {};
    if (this.hasDeclarativeContract(snapshotPayload)) {
      return snapshotPayload;
    }
    const draftPayload = (draft.draftPayload as Record<string, unknown>) || {};
    if (this.hasDeclarativeContract(draftPayload)) {
      return draftPayload;
    }

    const outputSchema =
      this.extractOutputSchemaFromPayload(snapshotPayload) ||
      this.extractOutputSchemaFromPayload(draftPayload);
    if (outputSchema) {
      return {
        ...draftPayload,
        outputSchema,
      };
    }

    return undefined;
  }

  private hasDeclarativeContract(payload: Record<string, unknown>): boolean {
    return Boolean(
      payload.contracts ||
        payload.outputSchema ||
        (payload.manifest && typeof payload.manifest === 'object')
    );
  }

  private extractOutputSchemaFromPayload(
    payload: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!payload || typeof payload !== 'object') return undefined;

    const contracts =
      (payload.contracts as Record<string, unknown>) ||
      (payload.manifest as any)?.spec?.contracts ||
      {};
    const output =
      (contracts?.output as Record<string, unknown>) ||
      (payload.outputSchema as Record<string, unknown>);
    const schema = (output as any)?.schema ?? output;
    if (
      schema &&
      typeof schema === 'object' &&
      !Array.isArray(schema) &&
      Object.keys(schema).length > 0
    ) {
      return schema as Record<string, unknown>;
    }

    const outputParams =
      (payload.outputParams as Record<string, unknown>) ||
      (payload.apiEndpoints as any)?.runtimeMetadata?.outputParams ||
      (payload.runtimeMetadata as any)?.outputParams;

    if (outputParams && typeof outputParams === 'object' && Object.keys(outputParams).length > 0) {
      const properties: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(outputParams)) {
        const paramDef =
          typeof val === 'object' && val !== null ? (val as Record<string, unknown>) : {};
        const description =
          typeof paramDef.description === 'string'
            ? paramDef.description
            : `Output field ${key}`;
        const inferredType = /结果数组|列表|results?/i.test(`${key} ${description}`)
          ? 'array'
          : /metadata|元数据/i.test(`${key} ${description}`)
            ? 'object'
            : 'string';
        properties[key] = {
          type: typeof paramDef.type === 'string' ? paramDef.type : inferredType,
          ...(inferredType === 'array' ? { items: { type: 'object' } } : {}),
          description,
        };
      }
      return {
        type: 'object',
        properties,
        required: Object.keys(properties),
        additionalProperties: false,
      };
    }

    return undefined;
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
    normalizedDraftPayload: Record<string, unknown>,
    snapshot?: CapabilitySourceSnapshotDTO
  ): Promise<SchemaDiffResult | undefined> {
    const snapshotPayload = (snapshot?.sourcePayload as Record<string, unknown>) || {};
    const draftPayload = (draft.draftPayload as Record<string, unknown>) || {};
    const newSchema =
      this.schemaCompatibilityService.extractOutputSchema(normalizedDraftPayload) ||
      this.schemaCompatibilityService.extractOutputSchema(draftPayload) ||
      this.schemaCompatibilityService.extractOutputSchema(snapshotPayload);
    if (!newSchema) return undefined;

    const mode = this.schemaCompatibilityService.resolveCompatibility({
      ...snapshotPayload,
      ...draftPayload,
      ...normalizedDraftPayload,
    });
    if (mode === 'none') return undefined;

    const rows = release.sourceId
      ? await this.prisma
          .$queryRawUnsafe<Array<{ output_schema: unknown }>>(
            `SELECT sc.output_schema
               FROM capability_releases cr
               JOIN skill_configs sc ON sc.id = cr.published_skill_id
              WHERE cr.source_type = $1
                AND cr.source_id = $2::uuid
                AND cr.published_skill_id IS NOT NULL
              ORDER BY CASE WHEN cr.id = $3::uuid THEN 0 ELSE 1 END,
                       cr.updated_at DESC
              LIMIT 1`,
            release.sourceType,
            release.sourceId,
            release.id
          )
          .catch(() => [])
      : [];

    // Legacy releases may not carry a stable sourceId. Exact-name lookup is a
    // fallback only; deterministic ordering avoids selecting an arbitrary row.
    const skillName = draft.name || release.sourceName;
    const legacyRows =
      rows.length === 0 && skillName
        ? await this.prisma
      .$queryRawUnsafe<Array<{ output_schema: unknown }>>(
            `SELECT output_schema
               FROM skill_configs
              WHERE name = $1
              ORDER BY is_active DESC, updated_at DESC
              LIMIT 1`,
            skillName
          )
          .catch(() => [])
        : [];
    const oldSchema = (rows[0]?.output_schema ?? legacyRows[0]?.output_schema ?? null) as Record<
      string,
      unknown
    > | null;

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
