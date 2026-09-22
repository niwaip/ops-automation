import { jsonSchemaValidator } from '@ops/backend-runtime-capability-contract';
import type { ReleaseManagerTemporalWorkflowPort } from '../platform-runtime.ports';
import type { CapabilityReleaseDTO, CapabilitySourceSnapshotDTO } from '../interfaces';

export async function resolveSavedTemporalWorkflowArtifact(
  release: CapabilityReleaseDTO,
  snapshot: CapabilitySourceSnapshotDTO,
  temporalWorkflowService: ReleaseManagerTemporalWorkflowPort
): Promise<{
  workflowId: string;
  artifactVersion?: number | null;
  artifactHash?: string | null;
  generatedCode: string;
}> {
  const snapshotPayload =
    snapshot.sourcePayload && typeof snapshot.sourcePayload === 'object'
      ? (snapshot.sourcePayload as Record<string, unknown>)
      : {};
  const workflowId =
    typeof release.sourceId === 'string' && release.sourceId.trim()
      ? release.sourceId.trim()
      : typeof snapshotPayload.id === 'string' && snapshotPayload.id.trim()
        ? snapshotPayload.id.trim()
        : '';

  if (!workflowId) {
    throw new Error('当前 Release 未绑定 Workflow，请先在 Workflow 页面保存并关联后再进入 Release');
  }

  const artifact = await temporalWorkflowService.getArtifact(workflowId);
  const generatedCode =
    typeof artifact.generatedCode === 'string' ? artifact.generatedCode.trim() : '';
  if (!generatedCode) {
    throw new Error(
      `关联的 Workflow 尚未生成并保存代码: ${artifact.workflowName || workflowId}。请先在 Workflow 页面执行“生成并保存代码”`
    );
  }
  if (artifact.validationStatus !== 'validated') {
    throw new Error(
      `关联的 Workflow 尚未完成 artifact 验证: ${artifact.workflowName || workflowId}。请先在 Workflow 页面执行“端到端验证”`
    );
  }

  return {
    workflowId,
    artifactVersion: artifact.artifactVersion,
    artifactHash: artifact.artifactHash,
    generatedCode,
  };
}

export function resolveExecutionTemplateIdForRuntime(
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

export function validateExecutionFlowPayload(payload: Record<string, unknown>) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  const paramsSchema = parseJson(payload.paramsSchema) as Record<string, unknown>;

  if (!payload.name || typeof payload.name !== 'string') {
    errors.push('模板名称不能为空');
  }
  if (steps.length === 0) {
    errors.push('至少需要一个流程步骤');
  }
  steps.forEach((step, index) => {
    const record = parseJson(step) as Record<string, unknown>;
    if (!record.name) {
      errors.push(`步骤 ${index + 1} 缺少名称`);
    }
    if (!record.type) {
      errors.push(`步骤 ${index + 1} 缺少类型`);
    }
    if (record.type === 'api' && !(record.api as Record<string, unknown> | undefined)?.endpoint) {
      errors.push(`步骤 ${index + 1} 的 API endpoint 不能为空`);
    }
  });
  if (!paramsSchema || typeof paramsSchema !== 'object') {
    warnings.push('未配置 paramsSchema，后续参数提取能力会受限');
  }

  const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);
  return {
    isValid: errors.length === 0,
    score,
    errors,
    warnings,
  };
}

export function applyGate2OutputSchemaValidation(
  snapshot: CapabilitySourceSnapshotDTO,
  resultSnapshot: Record<string, unknown>,
  score: number
): { success: boolean; score: number; errorSummary: string | null } {
  const payload = (snapshot?.sourcePayload as Record<string, unknown>) || {};
  const contracts =
    (payload?.contracts as Record<string, unknown>) || (payload?.manifest as any)?.spec?.contracts;
  const outputContract = (contracts?.output as Record<string, unknown>) || {};
  const outputSchema = outputContract?.schema || (payload?.outputSchema as Record<string, unknown>);
  if (!outputSchema || typeof outputSchema !== 'object' || Object.keys(outputSchema).length === 0) {
    return { success: true, score, errorSummary: null };
  }
  // 契约 dataPath 优先（§7.1：迁移期根 $.result.businessData、目标期根 $.data，
  // 均相对验证 agent 返回的 workflow 返回值解析）；未声明时保留 legacy 默认
  // resultSnapshot 坐标的 $.result.businessData 语义。
  // falsy-safe：extractDataByPath 仅在路径缺失时返回 undefined，合法的 falsy
  // 业务值（0 / false / '' / []）必须原样保留，不能整体回退到整个 result。
  const contractDataPath =
    typeof outputContract?.dataPath === 'string' && outputContract.dataPath.trim()
      ? outputContract.dataPath.trim()
      : undefined;
  const workflowResult =
    resultSnapshot && typeof resultSnapshot === 'object' ? resultSnapshot.result : undefined;
  const extractedBusinessData = contractDataPath
    ? jsonSchemaValidator.extractDataByPath(workflowResult, contractDataPath)
    : jsonSchemaValidator.extractDataByPath(resultSnapshot, '$.result.businessData');
  const businessData = extractedBusinessData === undefined ? resultSnapshot : extractedBusinessData;
  const validationResult = jsonSchemaValidator.validate(
    businessData,
    outputSchema as Record<string, unknown>
  );
  if (validationResult.valid) {
    return { success: true, score, errorSummary: null };
  }
  const schemaErrStr = validationResult.errors
    ?.map((e: { path: string; message: string }) => `${e.path}: ${e.message}`)
    .join('; ');
  return {
    success: false,
    score: Math.min(score, 40),
    errorSummary: `OUTPUT_SCHEMA_VIOLATION: ${schemaErrStr}`,
  };
}

export function expectRecord(value: unknown, errorMessage: string): Record<string, unknown> {
  const record = parseJson(value);
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(errorMessage);
  }
  return record as Record<string, unknown>;
}

export function parseJson<T = unknown>(value: unknown): T {
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

export function flattenPayload(
  obj: Record<string, unknown>,
  prefix = '',
  res: Record<string, unknown> = {}
): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenPayload(v as Record<string, unknown>, key, res);
    } else {
      res[key] = v;
    }
  }
  return res;
}
