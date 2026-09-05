import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl, getAuthServiceUrl } from '../../../../config/service-endpoints';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateExecutionDto } from '../../state/execution.dto';
import { ExecutionPlanNormalizationService } from './execution-plan-normalization.service';
import {
  partitionBrowserTemplateStepsForLoopWorkflow,
  type BrowserLoopDraftLike,
} from '../browser/browser-loop-workflow-plan.builder';

@Injectable()
export class ExecutionPlanningService {
  private readonly logger = new Logger(ExecutionPlanningService.name);
  private readonly authServiceUrl = getAuthServiceUrl();
  private readonly aiOrchestratorUrl = getAiOrchestratorUrl();
  private readonly internalApiSharedSecret =
    process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
  private readonly browserLoopWorkflowEnabled =
    String(process.env.BROWSER_LOOP_WORKFLOW_ENABLED || '').trim().toLowerCase() === 'true';

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionPlanNormalizationService: ExecutionPlanNormalizationService
  ) {}

  private normalizePublishedVersion(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return undefined;
  }

  private normalizePublishedStatus(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim().toLowerCase()
      : undefined;
  }

  private buildAuthServiceHeaders(
    authToken?: string,
    requester?: { id: string; role?: string }
  ): Record<string, string> | undefined {
    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      return {
        Authorization: authToken,
      };
    }

    if (
      this.internalApiSharedSecret &&
      typeof requester?.id === 'string' &&
      requester.id.trim().length > 0
    ) {
      return {
        'X-Internal-Secret': this.internalApiSharedSecret,
        'X-Internal-Auth': this.internalApiSharedSecret,
        'X-User-Id': requester.id,
        'X-User-Role': requester.role || 'employee',
      };
    }

    return undefined;
  }

  async assertSkillAccessibleByUser(
    skillId: string,
    skillVersion?: string,
    authToken?: string,
    requester?: { id: string; role?: string }
  ): Promise<{
    id: string;
    publishedReleaseVersion?: string;
    publishedReleaseStatus?: string;
    publishedDeploymentStatus?: string;
    definitionDigest?: string;
    handlerKey?: string;
    adapterRoute?: string;
  }> {
    const headers = this.buildAuthServiceHeaders(authToken, requester);
    if (!headers) {
      throw new BadRequestException('无法验证技能执行权限（缺少认证信息）');
    }

    if (skillId.startsWith('platform.')) {
      try {
        const resolveRes = await axios.post(
          `${this.authServiceUrl}/internal/builtin-skills/resolve`,
          {
            capabilityKey: skillId,
            definitionVersion: skillVersion,
            action: 'execute',
          },
          { headers, timeout: 10000 }
        );
        const data = resolveRes.data as any;
        if (!data?.found) {
          throw new BadRequestException(`内置技能 '${skillId}' 未找到: ${data?.reason}`);
        }
        if (!data?.isHealthy) {
          throw new BadRequestException(`内置技能 '${skillId}' 部署状态异常: ${data?.reason}`);
        }
        if (!data?.authorized) {
          throw new ForbiddenException(`您暂无内置技能 '${skillId}' 的执行权限，如需使用请前往「技能中心」申请授权或联系管理员开通: ${data?.reason || ''}`);
        }
        return {
          id: data.capabilityKey,
          publishedReleaseVersion: data.definitionVersion,
          publishedReleaseStatus: 'published',
          publishedDeploymentStatus: data.deploymentStatus,
          definitionDigest: data.definitionDigest,
          handlerKey: data.manifest?.spec?.runtime?.handlerKey,
          adapterRoute: data.manifest?.spec?.runtime?.adapterRoute,
        };
      } catch (err: any) {
        if (err instanceof ForbiddenException || err instanceof BadRequestException) throw err;
        this.logger.warn(`Builtin skill resolve failed for ${skillId}: ${err.message}`);
        throw new BadRequestException(`无法验证内置技能权限 (${skillId})`);
      }
    }

    try {
      const response = await axios.get<{
        id: string;
        publishedReleaseVersion?: string | number | null;
        publishedReleaseStatus?: string | null;
        publishedDeploymentStatus?: string | null;
      }>(`${this.authServiceUrl}/skills/${skillId}`, {
        headers,
        timeout: 10000,
      });

      return {
        id: response.data.id,
        publishedReleaseVersion: this.normalizePublishedVersion(
          response.data.publishedReleaseVersion,
        ),
        publishedReleaseStatus: this.normalizePublishedStatus(
          response.data.publishedReleaseStatus,
        ),
        publishedDeploymentStatus: this.normalizePublishedStatus(
          response.data.publishedDeploymentStatus,
        ),
      };
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as { response?: { status?: number } }).response?.status
          : undefined;

      if (status === 403 || status === 404) {
        const remoteMessage = (error as any)?.response?.data?.message;
        const msg =
          typeof remoteMessage === 'string' && remoteMessage.includes('权限')
            ? remoteMessage
            : '您当前暂无该技能的执行权限，如需使用请前往「技能中心」申请授权，或联系系统管理员开通权限。';
        throw new ForbiddenException(msg);
      }

      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Failed to verify skill permission for ${skillId}: ${message}`);
      throw new BadRequestException('无法验证技能执行权限');
    }
  }

  async fetchSkillDefaultResolution(
    skillId: string,
    authToken?: string,
    requester?: { id: string; role?: string }
  ): Promise<{ input: Record<string, unknown>; sources: Record<string, unknown> }> {
    try {
      const headers = this.buildAuthServiceHeaders(authToken, requester);
      const response = await axios.get<{
        paramsSchema?: {
          properties?: Record<
            string,
            { type?: string; default?: unknown; renderPath?: string | string[] }
          >;
        };
        inputPolicy?: {
          params?: Record<
            string,
            {
              defaultValue?: unknown;
              defaultValueResolver?: string;
              valueSourcePriority?: string[];
            }
          >;
        };
        executionFlowTemplateIds?: string[];
      }>(`${this.authServiceUrl}/skills/${skillId}`, {
        headers,
        timeout: 10000,
      });

      const templateIds = Array.isArray(response.data?.executionFlowTemplateIds)
        ? response.data.executionFlowTemplateIds.filter(
            (id): id is string => typeof id === 'string' && id.trim().length > 0
          )
        : [];
      const templateSchemas = await Promise.all(
        templateIds.map(async (templateId) => {
          try {
            const templateResponse = await axios.get(`${this.authServiceUrl}/flows/${templateId}`, {
              headers,
              timeout: 10000,
            });
            return templateResponse.data;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown error';
            this.logger.warn(`Failed to load runtime defaults from flow ${templateId}: ${message}`);
            return undefined;
          }
        })
      );

      return this.executionPlanNormalizationService.buildRuntimeDefaultResolution(
        response.data as any,
        templateSchemas as any[]
      ) as { input: Record<string, unknown>; sources: Record<string, unknown> };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Failed to load runtime defaults for skill ${skillId}: ${message}`);
      return { input: {}, sources: {} };
    }
  }

  /**
   * Reads only the immutable published recorder snapshot.  A composition is
   * opt-in metadata authored by the recorder, never inferred from a skill
   * name or a browser result at runtime.
   */
  async loadPublishedRecorderComposition(
    skillId: string,
    skillVersion?: string,
  ): Promise<{ composition: Record<string, unknown>; outputNames: string[]; skillVersion: string } | undefined> {
    if (typeof this.prisma.$queryRawUnsafe !== 'function') return undefined;
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{
        source_type?: string;
        release_version?: string | number;
        source_payload_json?: unknown;
      }>>(
        `
          SELECT cr.source_type, cr.release_version, COALESCE(css.source_payload_json, sd.draft_payload_json) AS source_payload_json
          FROM capability_releases cr
          LEFT JOIN capability_source_snapshots css ON css.id = cr.current_source_snapshot_id
          LEFT JOIN skill_drafts sd ON sd.id = cr.current_skill_draft_id
          WHERE cr.published_skill_id::text = $1
            AND ($2::text IS NULL OR cr.release_version::text = $2::text)
            AND cr.status = 'published'
          ORDER BY cr.release_version DESC
          LIMIT 1
        `,
        skillId,
        skillVersion || null,
      );
      const row = rows[0];
      if (!row || this.readNonEmptyString(row.source_type) !== 'browser_recording') return undefined;
      const sourcePayload = this.parseJsonRecord(row.source_payload_json);
      const apiEndpoints = this.parseJsonRecord(sourcePayload?.apiEndpoints);
      // Browser recorder bridge stores runtime metadata on the immutable source
      // payload.  The apiEndpoints location is retained for snapshots created by
      // earlier exporters, but must never be the only lookup location.
      const runtimeMetadata =
        this.parseJsonRecord(sourcePayload?.runtimeMetadata) ||
        this.parseJsonRecord(apiEndpoints?.runtimeMetadata);
      const composition =
        this.parseJsonRecord(runtimeMetadata?.composition) ||
        this.parseJsonRecord(sourcePayload?.workflowComposition) ||
        this.parseJsonRecord(sourcePayload?.composition);
      if (!composition || !Array.isArray(composition.postProcessingSteps) || composition.postProcessingSteps.length === 0) {
        return undefined;
      }
      const executionPlan = this.parseJsonRecord(runtimeMetadata?.executionPlan);
      const outputNames = this.readRecordArray(executionPlan?.outputs)
        .map((output) => this.readNonEmptyString(output.name))
        .filter((name): name is string => Boolean(name));
      const version = this.normalizePublishedVersion(row.release_version);
      if (!version) return undefined;
      return { composition, outputNames, skillVersion: version };
    } catch (error) {
      this.logger.warn(`Failed to load recorder composition for '${skillId}': ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  async generatePlanDraft(
    userId: string,
    dto: CreateExecutionDto,
    authToken?: string
  ): Promise<any | undefined> {
    try {
      const userInput = this.executionPlanNormalizationService.buildPlannerUserInput(dto);
      const response = await axios.post(
        `${this.aiOrchestratorUrl}/ai/plans/generate`,
        {
          user_input: userInput,
          user_id: userId,
          context: {
            skillId: dto.skillId,
            skillVersion: dto.skillVersion,
            runtimeType: this.executionPlanNormalizationService.normalizeExecutionRuntimeType(
              dto.runtimeType
            ),
            executionInput: dto.input,
          },
        },
        {
          headers: authToken ? { Authorization: authToken } : undefined,
        }
      );

      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to generate plan draft for skill ${dto.skillId}: ${message}`);
      return undefined;
    }
  }

  async rewriteBrowserRecordingPlanDraftWithActivities(
    planDraft: any | undefined,
    fallbackCapabilityId?: string,
    input?: Record<string, unknown>,
    runtimeDefaultInput?: Record<string, unknown>
  ): Promise<any | undefined> {
    if (!planDraft) {
      return planDraft;
    }
    const capabilityId = planDraft.skill_match?.skill_id || fallbackCapabilityId;
    if (!capabilityId) {
      return planDraft;
    }

    const resolvedInput = this.executionPlanNormalizationService.buildPlannerResolvedInput(
      planDraft as any,
      input,
      runtimeDefaultInput
    );

    const rewriteResult = await this.loadBrowserRecordingPlannerRewriteResult(
      capabilityId,
      resolvedInput
    );
    this.logger.log(
      `Browser recording rewrite mode for capability ${capabilityId}: ${rewriteResult.mode}`
    );
    if (rewriteResult.mode === 'direct_skill') {
      return this.executionPlanNormalizationService.buildDirectSkillExecutionPlanDraftFromExisting(
        planDraft as any,
        capabilityId,
        {
          runtimeSourceType: 'browser_recording',
        }
      );
    }

    if (
      rewriteResult.mode === 'browser_loop_workflow' &&
      rewriteResult.loopDraft &&
      rewriteResult.templateSteps
    ) {
      return this.executionPlanNormalizationService.buildBrowserLoopWorkflowPlanDraftFromExisting({
        planDraft: planDraft as any,
        resolvedSkillId: capabilityId,
        resolvedInput,
        templateSteps: rewriteResult.templateSteps,
        loopDraft: rewriteResult.loopDraft,
        runtimeSourceType: 'browser_recording',
      });
    }

    if (
      planDraft.steps.some((step: any) => Array.isArray(step.commands) && step.commands.length > 0)
    ) {
      return planDraft;
    }

    if (rewriteResult.steps.length === 0) {
      return planDraft;
    }

    return {
      ...planDraft,
      steps: rewriteResult.steps,
    };
  }

  private async loadBrowserRecordingPlannerRewriteResult(
    capabilityId: string,
    resolvedInput: Record<string, unknown>
  ): Promise<{
    mode: 'workflow_activity' | 'direct_skill' | 'browser_loop_workflow';
    steps: any[];
    templateSteps?: Record<string, unknown>[];
    loopDraft?: BrowserLoopDraftLike;
  }> {
    if (!capabilityId) {
      return { mode: 'workflow_activity', steps: [] };
    }
    if (typeof this.prisma.$queryRawUnsafe !== 'function') {
      return { mode: 'workflow_activity', steps: [] };
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{
          source_type?: string;
          source_id?: string;
          source_payload_json?: unknown;
          runtime_loop_draft?: unknown;
          execution_plan_loop_draft?: unknown;
          runtime_template_steps?: unknown;
          execution_plan_template_steps?: unknown;
          workflow_dsl?: unknown;
          activity_dsl?: unknown;
        }>
      >(
        `
          SELECT
            cr.source_type,
            cr.source_id,
            css.source_payload_json,
            css.source_payload_json #> '{apiEndpoints,runtimeMetadata,loopDraft}' AS runtime_loop_draft,
            css.source_payload_json #> '{apiEndpoints,runtimeMetadata,executionPlan,loopDraft}' AS execution_plan_loop_draft,
            css.source_payload_json #> '{apiEndpoints,runtimeMetadata,templateSteps}' AS runtime_template_steps,
            css.source_payload_json #> '{apiEndpoints,runtimeMetadata,executionPlan,templateSteps}' AS execution_plan_template_steps,
            tw.workflow_dsl,
            tw.activity_dsl
          FROM capability_releases cr
          LEFT JOIN capability_source_snapshots css
            ON css.id = cr.current_source_snapshot_id
          LEFT JOIN temporal_workflows tw
            ON tw.id = cr.source_id
          WHERE cr.published_skill_id::text = $1
          ORDER BY
            CASE WHEN cr.archived_at IS NULL THEN 0 ELSE 1 END,
            cr.updated_at DESC
          LIMIT 1
        `,
        capabilityId
      );

      const row = rows[0];
      if (!row || this.readNonEmptyString(row.source_type) !== 'browser_recording') {
        return { mode: 'workflow_activity', steps: [] };
      }

      const sourcePayload = this.parseJsonRecord(row.source_payload_json);
      const payloadLoopMetadata = this.extractBrowserRecordingLoopMetadata(sourcePayload);
      const loopDraft =
        (this.parseJsonRecord(row.execution_plan_loop_draft) as BrowserLoopDraftLike | undefined) ||
        (this.parseJsonRecord(row.runtime_loop_draft) as BrowserLoopDraftLike | undefined) ||
        payloadLoopMetadata.loopDraft;
      const loopTemplateSteps = this.readRecordArray(row.execution_plan_template_steps).length
        ? this.readRecordArray(row.execution_plan_template_steps)
        : this.readRecordArray(row.runtime_template_steps).length
          ? this.readRecordArray(row.runtime_template_steps)
          : payloadLoopMetadata.templateSteps;
      this.logger.log(
        `Browser recording rewrite metadata for capability ${capabilityId}: hasLoopDraft=${Boolean(loopDraft)} templateSteps=${loopTemplateSteps.length} workflowMode=${this.browserLoopWorkflowEnabled}`
      );
      if (
        this.browserLoopWorkflowEnabled &&
        loopDraft &&
        loopTemplateSteps.length > 0
      ) {
        const loopPartition = partitionBrowserTemplateStepsForLoopWorkflow({
          templateSteps: loopTemplateSteps,
          loopDraft,
          loopId: `${capabilityId}_loop`,
        });
        if (loopPartition.iterationSteps.length === 0) {
          this.logger.warn(
            `Browser recording loop draft for capability ${capabilityId} has no executable iteration steps; falling back to direct skill replay`
          );
          return {
            mode: 'direct_skill',
            steps: [],
          };
        }
        return {
          mode: 'browser_loop_workflow',
          steps: [],
          loopDraft,
          templateSteps: loopTemplateSteps,
        };
      }
      if (Boolean(loopDraft)) {
        return {
          mode: 'direct_skill',
          steps: [],
        };
      }

      const workflowDsl =
        this.parseJsonRecord(sourcePayload?.workflowDsl) || this.parseJsonRecord(row.workflow_dsl);
      const activityDsl =
        this.parseJsonRecord(sourcePayload?.activityDsl) || this.parseJsonRecord(row.activity_dsl);
      if (!workflowDsl || !activityDsl) {
        return { mode: 'workflow_activity', steps: [] };
      }

      const workflowSteps = this.readRecordArray(workflowDsl.steps).filter(
        (step) => this.readNonEmptyString(step.type) === 'activity'
      );
      const browserActivities = this.readRecordArray(activityDsl.activities).filter(
        (activity) => this.readNonEmptyString(activity.handler) === 'browser'
      );
      const sourceContext = this.parseJsonRecord(workflowDsl.sourceContext);
      const sourceTemplate = this.parseJsonRecord(sourceContext?.sourceTemplate);
      const templateId = this.readNonEmptyString(
        sourceTemplate?.templateId,
        this.readRecordArray(activityDsl.activities)
          .map((activity) =>
            this.readNonEmptyString(this.parseJsonRecord(activity.config)?.templateId)
          )
          .find((value) => Boolean(value))
      );

      if (workflowSteps.length === 0 || browserActivities.length === 0) {
        return { mode: 'workflow_activity', steps: [] };
      }

      const templateSteps = templateId ? await this.loadBrowserTemplateSteps(templateId) : [];

      return {
        mode: 'workflow_activity',
        steps: this.executionPlanNormalizationService.buildBrowserRecordingPlannerSteps(
          workflowSteps,
          browserActivities,
          resolvedInput,
          templateSteps
        ) as any[],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      this.logger.warn(
        `Failed to rewrite browser recording plan draft for capability ${capabilityId}: ${message}`
      );
      return { mode: 'workflow_activity', steps: [] };
    }
  }

  private extractBrowserRecordingLoopMetadata(sourcePayload?: Record<string, unknown>): {
    loopDraft?: BrowserLoopDraftLike;
    templateSteps: Record<string, unknown>[];
  } {
    const apiEndpoints = this.parseJsonRecord(sourcePayload?.apiEndpoints);
    const runtimeMetadata = this.parseJsonRecord(apiEndpoints?.runtimeMetadata);
    const executionPlan = this.parseJsonRecord(runtimeMetadata?.executionPlan);
    const loopDraft =
      (this.parseJsonRecord(executionPlan?.loopDraft) as BrowserLoopDraftLike | undefined) ||
      (this.parseJsonRecord(runtimeMetadata?.loopDraft) as BrowserLoopDraftLike | undefined);
    const templateSteps = this.readRecordArray(executionPlan?.templateSteps).length
      ? this.readRecordArray(executionPlan?.templateSteps)
      : this.readRecordArray(runtimeMetadata?.templateSteps);
    this.logger.log(
      `Browser recording loop detection: apiEndpoints=${Boolean(apiEndpoints)} runtimeMetadata=${Boolean(runtimeMetadata)} executionPlan=${Boolean(executionPlan)} hasLoopDraft=${Boolean(loopDraft)} templateSteps=${templateSteps.length} workflowMode=${this.browserLoopWorkflowEnabled}`
    );
    return {
      ...(loopDraft ? { loopDraft } : {}),
      templateSteps,
    };
  }

  private parseJsonRecord(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private async loadBrowserTemplateSteps(templateId: string): Promise<Record<string, unknown>[]> {
    if (!templateId || typeof this.prisma.$queryRawUnsafe !== 'function') {
      return [];
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ config?: unknown }>>(
        `
          SELECT config
          FROM templates
          WHERE id::text = $1
          LIMIT 1
        `,
        templateId
      );
      const config = this.parseJsonRecord(rows[0]?.config);
      return this.readRecordArray(this.parseJsonRecord(config?.executionPlan)?.templateSteps);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      this.logger.warn(
        `Failed to load browser template steps for template ${templateId}: ${message}`
      );
      return [];
    }
  }

  private readRecordArray(source: unknown, key?: string): Record<string, unknown>[] {
    const value =
      key && source && typeof source === 'object'
        ? (source as Record<string, unknown>)[key]
        : source;
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
    );
  }

  private readNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }
}
