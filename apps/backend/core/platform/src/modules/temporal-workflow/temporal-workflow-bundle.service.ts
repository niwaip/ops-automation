import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import type {
  ActivityDsl,
  CreateTemporalWorkflowDTO,
  WorkflowDsl,
} from './temporal-workflow.types';
import { TemporalWorkflowManagementService } from '../../workflow-registry/workflow-template/temporal-workflow-management.service';
import { TemporalWorkflowDslValidationService } from '../../workflow-registry/validation/temporal-workflow-dsl-validation.service';
import {
  TEMPORAL_WORKFLOW_BUNDLE_FORMAT,
  TEMPORAL_WORKFLOW_BUNDLE_VERSION,
  type TemporalWorkflowBundleFileDigest,
  type TemporalWorkflowBundleImportResult,
  type TemporalWorkflowBundleManifest,
} from './temporal-workflow-bundle.types';
import {
  createTarGzip,
  extractTarGzip,
  type WorkflowBundleTarEntry,
} from './temporal-workflow-bundle-tar.utils';

const MANIFEST_PATH = 'manifest.json';
const WORKFLOW_DSL_PATH = 'dsl/workflow.json';
const ACTIVITY_DSL_PATH = 'dsl/activities.json';
const WORKFLOW_CODE_PATH = 'code/workflow.py';
const METADATA_PATH = 'metadata/source.json';

interface BundleSourceMetadata {
  workflowId: string;
  name: string;
  description: string | null;
  taskQueue: string;
  isActive: boolean;
  artifactVersion: number;
  artifactHash: string;
  validationStatus: string;
  validationScore: number;
  validatedAt: string | null;
  deployedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function sha256(content: Buffer | string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)])
  );
}

function contractDigest(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): string {
  return sha256(JSON.stringify(canonicalize({ workflowDsl, activityDsl })));
}

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function safeCodeFileName(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return normalized || fallback;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`工作流包清单字段缺失或非法: ${field}`);
  }
  return value;
}

function parseJsonFile<T>(entries: Map<string, Buffer>, path: string): T {
  const content = entries.get(path);
  if (!content) throw new BadRequestException(`工作流包缺少文件: ${path}`);
  try {
    return JSON.parse(content.toString('utf8')) as T;
  } catch (error: unknown) {
    throw new BadRequestException(`工作流包 JSON 文件无法解析 (${path}): ${errorMessage(error)}`);
  }
}

function mediaTypeForPath(path: string): string {
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.py')) return 'text/x-python';
  return 'application/octet-stream';
}

@Injectable()
export class TemporalWorkflowBundleService {
  constructor(
    private readonly workflowManagementService: TemporalWorkflowManagementService,
    private readonly workflowDslValidationService: TemporalWorkflowDslValidationService
  ) {}

  async exportBundle(id: string): Promise<{ archive: Buffer; fileName: string }> {
    const workflow = await this.workflowManagementService.findOne(id);
    if (!workflow) throw new NotFoundException(`Temporal Workflow 不存在: ${id}`);
    if (!workflow.generatedCode?.trim()) {
      throw new BadRequestException('当前 Workflow 尚未生成并保存代码，无法导出完整工作流包');
    }

    const exportedAt = new Date();
    const workflowDsl = cloneJson(workflow.workflowDsl as unknown as WorkflowDsl);
    const activityDsl = cloneJson(workflow.activityDsl as unknown as ActivityDsl);
    const bundledActivityDsl = cloneJson(activityDsl);
    const activityCodeFiles: TemporalWorkflowBundleManifest['files']['activityCodeFiles'] = [];
    const entries: WorkflowBundleTarEntry[] = [];

    bundledActivityDsl.activities.forEach((activity, activityIndex) => {
      const code = activity.generatedCode;
      if (!code?.trim()) return;
      const path = `code/activities/${String(activityIndex + 1).padStart(2, '0')}-${safeCodeFileName(
        activity.fn,
        `activity-${activityIndex + 1}`
      )}.py`;
      activityCodeFiles.push({ activityIndex, fn: activity.fn, path });
      entries.push({ path, content: Buffer.from(code, 'utf8') });
      delete activity.generatedCode;
    });

    const artifactHash = sha256(workflow.generatedCode);
    const metadata: BundleSourceMetadata = {
      workflowId: workflow.id,
      name: workflow.name,
      description: workflow.description,
      taskQueue: workflow.taskQueue,
      isActive: workflow.isActive,
      artifactVersion: Number(workflow.artifactVersion || 0),
      artifactHash,
      validationStatus: workflow.validationStatus || 'generated',
      validationScore: Number(workflow.validationScore || 0),
      validatedAt: workflow.validatedAt ? new Date(workflow.validatedAt).toISOString() : null,
      deployedAt: workflow.deployedAt ? new Date(workflow.deployedAt).toISOString() : null,
      createdAt: new Date(workflow.createdAt).toISOString(),
      updatedAt: new Date(workflow.updatedAt).toISOString(),
    };

    entries.push(
      { path: WORKFLOW_DSL_PATH, content: jsonBuffer(workflowDsl) },
      { path: ACTIVITY_DSL_PATH, content: jsonBuffer(bundledActivityDsl) },
      { path: WORKFLOW_CODE_PATH, content: Buffer.from(workflow.generatedCode, 'utf8') },
      { path: METADATA_PATH, content: jsonBuffer(metadata) }
    );

    const digests = Object.fromEntries(
      entries.map((entry) => [
        entry.path,
        {
          sha256: sha256(entry.content),
          size: entry.content.length,
          mediaType: mediaTypeForPath(entry.path),
        } satisfies TemporalWorkflowBundleFileDigest,
      ])
    );
    const manifest: TemporalWorkflowBundleManifest = {
      format: TEMPORAL_WORKFLOW_BUNDLE_FORMAT,
      formatVersion: TEMPORAL_WORKFLOW_BUNDLE_VERSION,
      exportedAt: exportedAt.toISOString(),
      contractDigest: contractDigest(workflowDsl, bundledActivityDsl),
      source: {
        workflowId: workflow.id,
        artifactVersion: Number(workflow.artifactVersion || 0),
        artifactHash,
        validationStatus: workflow.validationStatus || 'generated',
        deployedAt: metadata.deployedAt,
      },
      workflow: {
        name: workflow.name,
        description: workflow.description,
        taskQueue: workflow.taskQueue,
      },
      files: {
        workflowDsl: WORKFLOW_DSL_PATH,
        activityDsl: ACTIVITY_DSL_PATH,
        workflowCode: WORKFLOW_CODE_PATH,
        metadata: METADATA_PATH,
        activityCodeFiles,
      },
      dependencies: activityDsl.activities.map((activity) => ({
        activityRef: activity.activityRef || null,
        fn: activity.fn,
        handler: activity.handler,
      })),
      digests,
    };

    const archive = createTarGzip(
      [{ path: MANIFEST_PATH, content: jsonBuffer(manifest) }, ...entries],
      exportedAt
    );
    return {
      archive,
      fileName: `${safeCodeFileName(workflow.name, 'temporal-workflow')}.tar.gz`,
    };
  }

  async importBundle(
    archive: Buffer,
    nameOverride?: string
  ): Promise<TemporalWorkflowBundleImportResult> {
    const entries = extractTarGzip(archive);
    const manifest = this.parseAndValidateManifest(entries);
    this.validateFileDigests(entries, manifest);

    const workflowDsl = parseJsonFile<WorkflowDsl>(entries, manifest.files.workflowDsl);
    const activityDsl = parseJsonFile<ActivityDsl>(entries, manifest.files.activityDsl);
    const workflowCode = entries.get(manifest.files.workflowCode)?.toString('utf8') || '';
    parseJsonFile<BundleSourceMetadata>(entries, manifest.files.metadata);
    if (!workflowCode.trim()) {
      throw new BadRequestException('工作流包中的主工作流代码为空');
    }
    if (sha256(workflowCode) !== manifest.source.artifactHash) {
      throw new BadRequestException('工作流包主代码与来源 artifactHash 不一致');
    }
    if (!isRecord(workflowDsl) || !Array.isArray(workflowDsl.steps)) {
      throw new BadRequestException('工作流包中的 Workflow DSL 结构非法');
    }
    if (!isRecord(activityDsl) || !Array.isArray(activityDsl.activities)) {
      throw new BadRequestException('工作流包中的 Activity DSL 结构非法');
    }

    const hydratedActivityDsl = cloneJson(activityDsl);
    const usedActivityIndexes = new Set<number>();
    for (const codeRef of manifest.files.activityCodeFiles) {
      if (
        !Number.isInteger(codeRef.activityIndex) ||
        codeRef.activityIndex < 0 ||
        codeRef.activityIndex >= hydratedActivityDsl.activities.length ||
        usedActivityIndexes.has(codeRef.activityIndex)
      ) {
        throw new BadRequestException(`工作流包 Activity 代码映射非法: ${codeRef.activityIndex}`);
      }
      const activity = hydratedActivityDsl.activities[codeRef.activityIndex];
      if (activity.fn !== codeRef.fn) {
        throw new BadRequestException(`工作流包 Activity 代码映射与 DSL 不一致: ${codeRef.fn}`);
      }
      activity.generatedCode = entries.get(codeRef.path)?.toString('utf8') || '';
      if (!activity.generatedCode.trim()) {
        throw new BadRequestException(`工作流包 Activity 代码为空: ${codeRef.path}`);
      }
      usedActivityIndexes.add(codeRef.activityIndex);
    }

    if (contractDigest(workflowDsl, activityDsl) !== manifest.contractDigest) {
      throw new BadRequestException('工作流包 contractDigest 不匹配，DSL 可能已被修改');
    }

    const staticValidation = await this.workflowDslValidationService.validate(
      workflowDsl,
      hydratedActivityDsl
    );
    if (!staticValidation.isValid) {
      throw new BadRequestException(
        `工作流包 DSL 校验失败: ${staticValidation.errors.join('; ') || '未知错误'}`
      );
    }

    const createPayload: CreateTemporalWorkflowDTO = {
      name: nameOverride?.trim() || manifest.workflow.name,
      description: manifest.workflow.description || undefined,
      taskQueue: manifest.workflow.taskQueue,
      workflowDsl,
      activityDsl: hydratedActivityDsl,
      generatedCode: workflowCode,
      isActive: false,
    };
    const workflow = await this.workflowManagementService.create(createPayload);
    return {
      workflow,
      manifest,
      staticValidation,
      requiresRuntimeValidation: true,
      nextAction: 'validate_saved_artifact',
    };
  }

  private parseAndValidateManifest(entries: Map<string, Buffer>): TemporalWorkflowBundleManifest {
    const manifest = parseJsonFile<TemporalWorkflowBundleManifest>(entries, MANIFEST_PATH);
    if (!isRecord(manifest)) throw new BadRequestException('工作流包 manifest.json 结构非法');
    if (manifest.format !== TEMPORAL_WORKFLOW_BUNDLE_FORMAT) {
      throw new BadRequestException(`不支持的工作流包格式: ${String(manifest.format)}`);
    }
    if (manifest.formatVersion !== TEMPORAL_WORKFLOW_BUNDLE_VERSION) {
      throw new BadRequestException(`不支持的工作流包版本: ${String(manifest.formatVersion)}`);
    }
    if (!isRecord(manifest.source) || !isRecord(manifest.workflow) || !isRecord(manifest.files)) {
      throw new BadRequestException('工作流包清单缺少 source、workflow 或 files');
    }
    requireString(manifest.contractDigest, 'contractDigest');
    requireString(manifest.source.artifactHash, 'source.artifactHash');
    requireString(manifest.workflow.name, 'workflow.name');
    requireString(manifest.workflow.taskQueue, 'workflow.taskQueue');
    requireString(manifest.files.workflowDsl, 'files.workflowDsl');
    requireString(manifest.files.activityDsl, 'files.activityDsl');
    requireString(manifest.files.workflowCode, 'files.workflowCode');
    requireString(manifest.files.metadata, 'files.metadata');
    if (!Array.isArray(manifest.files.activityCodeFiles) || !isRecord(manifest.digests)) {
      throw new BadRequestException('工作流包清单的代码映射或摘要列表非法');
    }
    for (const ref of manifest.files.activityCodeFiles) {
      if (!isRecord(ref)) throw new BadRequestException('工作流包 Activity 代码映射非法');
      requireString(ref.fn, 'files.activityCodeFiles.fn');
      requireString(ref.path, 'files.activityCodeFiles.path');
    }
    return manifest;
  }

  private validateFileDigests(
    entries: Map<string, Buffer>,
    manifest: TemporalWorkflowBundleManifest
  ): void {
    const expectedPaths = new Set([MANIFEST_PATH, ...Object.keys(manifest.digests)]);
    for (const path of entries.keys()) {
      if (!expectedPaths.has(path)) {
        throw new BadRequestException(`工作流包包含清单未声明的文件: ${path}`);
      }
    }
    for (const [path, digest] of Object.entries(manifest.digests)) {
      if (!isRecord(digest)) throw new BadRequestException(`工作流包摘要非法: ${path}`);
      const content = entries.get(path);
      if (!content) throw new BadRequestException(`工作流包缺少清单声明文件: ${path}`);
      if (content.length !== digest.size || sha256(content) !== digest.sha256) {
        throw new BadRequestException(`工作流包文件摘要不匹配: ${path}`);
      }
    }

    const referencedPaths = [
      manifest.files.workflowDsl,
      manifest.files.activityDsl,
      manifest.files.workflowCode,
      manifest.files.metadata,
      ...manifest.files.activityCodeFiles.map((item) => item.path),
    ];
    for (const path of referencedPaths) {
      if (!Object.prototype.hasOwnProperty.call(manifest.digests, path)) {
        throw new BadRequestException(`工作流包文件未声明摘要: ${path}`);
      }
    }
  }
}
