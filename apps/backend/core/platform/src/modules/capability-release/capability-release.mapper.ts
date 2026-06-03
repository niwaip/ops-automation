import {
  CapabilityBuildDTO,
  CapabilityReleaseDTO,
  CapabilitySourceSnapshotDTO,
  CapabilityValidationDTO,
  DeploymentRecordDTO,
  ReleaseAuditEventDTO,
  SkillDraftDTO,
} from './interfaces';

export function parseCapabilityReleaseJson<T = unknown>(value: unknown): T {
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

export function toCapabilityReleaseIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(String(value)).toISOString();
}

export function mapCapabilityRelease(raw: any): CapabilityReleaseDTO {
  return {
    id: raw.id,
    sourceType: raw.source_type,
    sourceId: raw.source_id,
    sourceName: raw.source_name,
    sourceStatus: raw.source_status,
    releaseVersion: Number(raw.release_version || 1),
    status: raw.status,
    approvalStatus: raw.approval_status,
    deploymentStatus: raw.deployment_status,
    currentSourceSnapshotId: raw.current_source_snapshot_id,
    currentBuildId: raw.current_build_id,
    latestSuccessfulBuildId: raw.latest_successful_build_id,
    latestValidationId: raw.latest_validation_id,
    latestSuccessfulValidationId: raw.latest_successful_validation_id,
    currentSkillDraftId: raw.current_skill_draft_id,
    publishedSkillId: raw.published_skill_id,
    lastDeploymentId: raw.last_deployment_id,
    lastDeploymentEnvironment: raw.last_deployment_environment,
    rollbackOfReleaseId: raw.rollback_of_release_id,
    createdBy: raw.created_by,
    createdAt: toCapabilityReleaseIsoString(raw.created_at),
    updatedAt: toCapabilityReleaseIsoString(raw.updated_at),
  };
}

export function mapCapabilitySourceSnapshot(raw: any): CapabilitySourceSnapshotDTO {
  return {
    id: raw.id,
    releaseId: raw.release_id,
    snapshotVersion: Number(raw.snapshot_version || 1),
    sourceType: raw.source_type,
    sourceId: raw.source_id,
    sourcePayload: parseCapabilityReleaseJson(raw.source_payload_json) || {},
    summary: raw.summary,
    createdBy: raw.created_by,
    createdAt: toCapabilityReleaseIsoString(raw.created_at),
  };
}

export function mapCapabilityBuild(raw: any): CapabilityBuildDTO {
  return {
    id: raw.id,
    releaseId: raw.release_id,
    sourceSnapshotId: raw.source_snapshot_id,
    buildType: raw.build_type,
    modelId: raw.model_id,
    promptVersion: raw.prompt_version,
    inputSnapshot: parseCapabilityReleaseJson(raw.input_snapshot_json) || {},
    generatedCode: raw.generated_code,
    generatedConfig: parseCapabilityReleaseJson(raw.generated_config_json) || null,
    logs: parseCapabilityReleaseJson<string[]>(raw.logs_json) || [],
    diffSummary: raw.diff_summary,
    status: raw.status,
    errorSummary: raw.error_summary,
    startedAt: raw.started_at ? toCapabilityReleaseIsoString(raw.started_at) : null,
    finishedAt: raw.finished_at ? toCapabilityReleaseIsoString(raw.finished_at) : null,
    createdBy: raw.created_by,
    createdAt: toCapabilityReleaseIsoString(raw.created_at),
  };
}

export function mapCapabilityValidation(raw: any): CapabilityValidationDTO {
  return {
    id: raw.id,
    releaseId: raw.release_id,
    buildId: raw.build_id,
    validationType: raw.validation_type,
    inputSnapshot: parseCapabilityReleaseJson(raw.input_snapshot_json) || null,
    resultSnapshot: parseCapabilityReleaseJson(raw.result_snapshot_json) || null,
    logs: parseCapabilityReleaseJson<string[]>(raw.logs_json) || [],
    score: Number(raw.score || 0),
    success: Boolean(raw.success),
    errorSummary: raw.error_summary,
    startedAt: raw.started_at ? toCapabilityReleaseIsoString(raw.started_at) : null,
    finishedAt: raw.finished_at ? toCapabilityReleaseIsoString(raw.finished_at) : null,
    createdBy: raw.created_by,
    createdAt: toCapabilityReleaseIsoString(raw.created_at),
  };
}

export function mapCapabilitySkillDraft(raw: any): SkillDraftDTO {
  return {
    id: raw.id,
    releaseId: raw.release_id,
    generatedFromBuildId: raw.generated_from_build_id,
    generatedFromValidationId: raw.generated_from_validation_id,
    sourceType: raw.source_type,
    name: raw.name,
    description: raw.description,
    triggerKeywords: parseCapabilityReleaseJson<string[]>(raw.trigger_keywords) || [],
    paramsSchema: parseCapabilityReleaseJson(raw.params_schema) || {},
    executionFlowTemplateIds: parseCapabilityReleaseJson<string[]>(raw.execution_flow_template_ids) || [],
    tools: parseCapabilityReleaseJson<string[]>(raw.tools) || [],
    apiEndpoints: parseCapabilityReleaseJson(raw.api_endpoints) || null,
    draftPayload: parseCapabilityReleaseJson(raw.draft_payload_json) || {},
    status: raw.status,
    createdBy: raw.created_by,
    createdAt: toCapabilityReleaseIsoString(raw.created_at),
    updatedAt: toCapabilityReleaseIsoString(raw.updated_at),
  };
}

export function mapCapabilityDeployment(raw: any): DeploymentRecordDTO {
  return {
    id: raw.id,
    releaseId: raw.release_id,
    publishedSkillId: raw.published_skill_id,
    environment: raw.environment,
    runtimeType: raw.runtime_type,
    artifactUri: raw.artifact_uri,
    artifactHash: raw.artifact_hash,
    workerVersion: raw.worker_version,
    reloadStrategy: raw.reload_strategy,
    requestPayload: parseCapabilityReleaseJson(raw.request_payload_json) || null,
    resultSnapshot: parseCapabilityReleaseJson(raw.result_snapshot_json) || null,
    logs: parseCapabilityReleaseJson<string[]>(raw.logs_json) || [],
    status: raw.status,
    success: Boolean(raw.success),
    smokeValidationId: raw.smoke_validation_id,
    rollbackTargetReleaseId: raw.rollback_target_release_id,
    startedAt: raw.started_at ? toCapabilityReleaseIsoString(raw.started_at) : null,
    finishedAt: raw.finished_at ? toCapabilityReleaseIsoString(raw.finished_at) : null,
    createdBy: raw.created_by,
    createdAt: toCapabilityReleaseIsoString(raw.created_at),
  };
}

export function mapCapabilityAuditEvent(raw: any): ReleaseAuditEventDTO {
  return {
    id: raw.id,
    releaseId: raw.release_id,
    eventType: raw.event_type,
    actorId: raw.actor_id,
    actorName: raw.actor_name,
    success: Boolean(raw.success),
    summary: raw.summary,
    details: parseCapabilityReleaseJson(raw.details_json) || null,
    createdAt: toCapabilityReleaseIsoString(raw.created_at),
  };
}
