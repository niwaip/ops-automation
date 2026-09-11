import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  ReleaseManagerExecutionFlowValidationFacadePort,
  ReleaseManagerPrismaPort,
  ReleaseManagerTemporalWorkflowPort,
} from '../platform-runtime.ports';
import {
  RELEASE_MANAGER_EXECUTION_FLOW_VALIDATION_FACADE,
  RELEASE_MANAGER_PRISMA,
  RELEASE_MANAGER_TEMPORAL_WORKFLOW,
} from '../platform-runtime.tokens';
import type { CapabilityReleaseDeploymentAccessors } from '../publisher/capability-release-deployment.service';
import { CapabilityReleaseBrowserRecordingService } from '../compiler/capability-release-browser-recording.service';
import { CapabilityReleaseTemporalSchemaService } from '../compiler/capability-release-temporal-schema.service';
import { resolveTemporalRuntimeCredentials } from './temporal-runtime-credential.resolver';
import {
  CapabilityBuildDTO,
  CapabilityReleaseDTO,
  CapabilitySourceSnapshotDTO,
} from '../interfaces';

const SENSITIVE_SMOKE_FIELD =
  /(?:api[_-]?key|device[_-]?key|access[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|authorization|credential|password|secret|token)$/i;

const asSmokeRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const getDefaultScenarioRequiredFields = (sourcePayload: Record<string, unknown>): string[] => {
  const workflowDsl = asSmokeRecord(sourcePayload.workflowDsl) || {};
  const validation = asSmokeRecord(workflowDsl.validation) || {};
  const scenarios = Array.isArray(validation.scenarios) ? validation.scenarios : [];
  const defaultScenario = asSmokeRecord(scenarios[0]);
  return Array.isArray(defaultScenario?.requiredParameters)
    ? defaultScenario.requiredParameters.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0
      )
    : [];
};

const redactSmokeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactSmokeValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_SMOKE_FIELD.test(key) ? '[REDACTED]' : redactSmokeValue(item),
    ])
  );
};

const collectSmokeSecrets = (
  value: unknown,
  secrets: string[] = []
): string[] => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSmokeSecrets(item, secrets));
  } else if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (SENSITIVE_SMOKE_FIELD.test(key) && typeof item === 'string' && item.length > 0) {
        secrets.push(item);
      } else {
        collectSmokeSecrets(item, secrets);
      }
    });
  }
  return secrets;
};

const redactSmokeText = (value: string | null, secrets: string[]): string | null => {
  if (value === null) return null;
  return secrets.reduce(
    (text, secret) => text.split(secret).join('[REDACTED]'),
    value
  );
};

@Injectable()
export class CapabilityReleaseDeploymentSmokeService {
  constructor(
    @Inject(RELEASE_MANAGER_PRISMA) private readonly prisma: ReleaseManagerPrismaPort,
    @Inject(RELEASE_MANAGER_TEMPORAL_WORKFLOW)
    private readonly temporalWorkflowService: ReleaseManagerTemporalWorkflowPort,
    @Inject(RELEASE_MANAGER_EXECUTION_FLOW_VALIDATION_FACADE)
    private readonly executionFlowValidationFacade: ReleaseManagerExecutionFlowValidationFacadePort,
    private readonly capabilityReleaseBrowserRecordingService: CapabilityReleaseBrowserRecordingService,
    private readonly capabilityReleaseTemporalSchemaService: CapabilityReleaseTemporalSchemaService
  ) {}

  async resolveBuildForDeployment(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId: string | undefined,
    accessors: CapabilityReleaseDeploymentAccessors
  ): Promise<CapabilityBuildDTO> {
    if (release.sourceType === 'temporal_workflow') {
      return accessors.resolveTemporalExecutableBuildOrThrow(release, snapshot, buildId, userId);
    }

    if (buildId) {
      return accessors.getBuildOrThrow(buildId);
    }
    if (release.currentBuildId) {
      return accessors.getBuildOrThrow(release.currentBuildId);
    }

    const syntheticBuildId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_builds (
        id, release_id, source_snapshot_id, build_type, model_id, input_snapshot_json,
        generated_config_json, status, started_at, finished_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, 'config_enhancement', 'system', $4::jsonb,
        $5::jsonb, 'succeeded', now(), now(), $6::uuid, now()
      )`,
      syntheticBuildId,
      release.id,
      snapshot.id,
      JSON.stringify(snapshot.sourcePayload),
      JSON.stringify(snapshot.sourcePayload),
      userId || null
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET current_build_id = $2::uuid, latest_successful_build_id = $2::uuid, updated_at = now()
       WHERE id = $1::uuid`,
      release.id,
      syntheticBuildId
    );

    return accessors.getBuildOrThrow(syntheticBuildId);
  }

  async runPostDeploySmokeTest(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    build: CapabilityBuildDTO,
    deploymentId: string,
    environment: string,
    userId: string | undefined,
    oneTimeSmokeInput: Record<string, unknown> | undefined,
    accessors: CapabilityReleaseDeploymentAccessors
  ): Promise<{
    validationId: string;
    success: boolean;
    score: number;
    logs: string[];
    resultSnapshot: Record<string, unknown> | null;
    errorSummary: string | null;
  }> {
    const validationId = await this.createSmokeValidationRecord(
      release.id,
      build.id,
      { deploymentId, environment },
      userId
    );

    try {
      let success = false;
      let score = 0;
      let logs: string[] = [];
      let resultSnapshot: Record<string, unknown> | null = null;
      let errorSummary: string | null = null;
      const smokeInput = this.capabilityReleaseTemporalSchemaService.buildSmokeTestInput(
        release,
        snapshot,
        environment,
        oneTimeSmokeInput
      );
      const templateId = this.resolveExecutionTemplateIdForRuntime(release, snapshot);

      if (release.sourceType === 'temporal_workflow') {
        const effectiveParamsSchema =
          this.capabilityReleaseTemporalSchemaService.resolveEffectiveTemporalParamsSchema(
            snapshot.sourcePayload
          );
        const effectiveRequired = Array.isArray(effectiveParamsSchema.required)
          ? effectiveParamsSchema.required.filter(
              (item): item is string => typeof item === 'string' && item.trim().length > 0
            )
          : [];
        const effectiveCredentialSource = {
          ...snapshot.sourcePayload,
          paramsSchema: {
            ...effectiveParamsSchema,
            required: Array.from(
              new Set([
                ...effectiveRequired,
                ...getDefaultScenarioRequiredFields(snapshot.sourcePayload),
              ])
            ),
          },
        };
        const credentialResolution = resolveTemporalRuntimeCredentials(
          smokeInput,
          effectiveCredentialSource,
          {}
        );
        if (credentialResolution.missing.length > 0) {
          throw new Error(
            `部署后验证缺少一次性凭证: ${credentialResolution.missing
              .map(({ field }) => field)
              .join('、')}。请通过 smokeTestInput 提供；该输入仅用于本次部署验证，不会绑定给任何用户。`
          );
        }
        if (!build.generatedCode) {
          throw new Error('当前构建没有可执行代码，无法执行部署后 smoke test');
        }
        const fn = accessors.resolveWorkflowFnOrThrow(snapshot.sourcePayload);
        const result = await this.temporalWorkflowService.validateWorkflowReal(
          build.generatedCode,
          fn,
          credentialResolution.input
        );
        success = result.success;
        score = result.score;
        logs = result.logs;
        resultSnapshot = {
          result: result.result ?? null,
          error: result.error ?? null,
          fn,
          environment,
          deploymentId,
          input: smokeInput,
        };
        errorSummary = result.error || null;
      } else if (release.sourceType === 'browser_recording') {
        const result = this.capabilityReleaseBrowserRecordingService.validateSnapshot(snapshot, {
          environment,
          deploymentId,
          input: smokeInput,
          testCases: [`smoke test for ${environment}`],
        });
        success = result.success;
        score = result.score;
        logs = result.logs;
        resultSnapshot = result.resultSnapshot;
        errorSummary = result.errorSummary;
      } else if (templateId) {
        const validation = await this.executionFlowValidationFacade.validateTemplate(
          templateId,
          undefined,
          smokeInput,
          true,
          `smoke test for ${environment}`
        );
        success = validation.isValid;
        score = validation.score || 0;
        logs = validation.details?.executionTest?.log || [];
        resultSnapshot = {
          ...((validation as unknown as Record<string, unknown>) || {}),
          environment,
          deploymentId,
          input: smokeInput,
        };
        errorSummary = validation.warnings?.[0] || null;
      } else {
        throw new Error('当前能力缺少可用模板标识，无法执行部署后 smoke test');
      }

      const smokeSecrets = collectSmokeSecrets(oneTimeSmokeInput);
      logs = logs.map((line) => redactSmokeText(line, smokeSecrets) || '');
      resultSnapshot = redactSmokeValue(resultSnapshot) as Record<string, unknown> | null;
      errorSummary = redactSmokeText(errorSummary, smokeSecrets);

      await this.finishSmokeValidation(
        validationId,
        release.id,
        success,
        score,
        logs,
        resultSnapshot,
        errorSummary
      );

      await accessors.insertAuditEvent(
        release.id,
        success ? 'deployment_smoke_succeeded' : 'deployment_smoke_failed',
        userId,
        success,
        success
          ? `部署后 smoke test 通过 (${environment})`
          : `部署后 smoke test 失败: ${errorSummary || '未知错误'}`,
        { deploymentId, environment, validationId }
      );

      return {
        validationId,
        success,
        score,
        logs,
        resultSnapshot,
        errorSummary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      await this.finishSmokeValidation(
        validationId,
        release.id,
        false,
        0,
        [`[Error] ${message}`],
        { deploymentId, environment, error: message },
        message
      );
      await accessors.insertAuditEvent(
        release.id,
        'deployment_smoke_failed',
        userId,
        false,
        `部署后 smoke test 失败: ${message}`,
        { deploymentId, environment, validationId }
      );
      return {
        validationId,
        success: false,
        score: 0,
        logs: [`[Error] ${message}`],
        resultSnapshot: { deploymentId, environment, error: message },
        errorSummary: message,
      };
    }
  }

  private async createSmokeValidationRecord(
    releaseId: string,
    buildId: string,
    input: Record<string, unknown> | undefined,
    userId?: string
  ): Promise<string> {
    const validationId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_validations (
        id, release_id, build_id, validation_type, input_snapshot_json,
        logs_json, score, success, started_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, 'post_deploy_smoke', $4::jsonb,
        '[]'::jsonb, 0, false, now(), $5::uuid, now()
      )`,
      validationId,
      releaseId,
      buildId,
      JSON.stringify(input || null),
      userId || null
    );
    return validationId;
  }

  private async finishSmokeValidation(
    validationId: string,
    releaseId: string,
    success: boolean,
    score: number,
    logs: string[],
    resultSnapshot: Record<string, unknown> | null,
    errorSummary: string | null
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_validations
       SET result_snapshot_json = $2::jsonb,
           logs_json = $3::jsonb,
           score = $4,
           success = $5,
           error_summary = $6,
           finished_at = now()
       WHERE id = $1::uuid`,
      validationId,
      JSON.stringify(resultSnapshot),
      JSON.stringify(logs),
      score,
      success,
      errorSummary
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET latest_validation_id = $2::uuid,
           latest_successful_validation_id = CASE WHEN $3 THEN $2::uuid ELSE latest_successful_validation_id END,
           updated_at = now()
       WHERE id = $1::uuid`,
      releaseId,
      validationId,
      success
    );
  }

  private resolveExecutionTemplateIdForRuntime(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO
  ): string | null {
    if (release.sourceType === 'temporal_workflow') {
      return null;
    }
    if (release.sourceId && release.sourceId.trim()) {
      return release.sourceId.trim();
    }
    const payload =
      snapshot.sourcePayload && typeof snapshot.sourcePayload === 'object'
        ? (snapshot.sourcePayload as Record<string, unknown>)
        : {};
    const sourceTemplate =
      payload.sourceTemplate && typeof payload.sourceTemplate === 'object'
        ? (payload.sourceTemplate as Record<string, unknown>)
        : {};
    const fromTemplate = sourceTemplate.templateId;
    if (typeof fromTemplate === 'string' && fromTemplate.trim()) {
      return fromTemplate.trim();
    }
    const fromPayloadId = payload.id;
    if (typeof fromPayloadId === 'string' && fromPayloadId.trim()) {
      return fromPayloadId.trim();
    }
    return null;
  }
}
