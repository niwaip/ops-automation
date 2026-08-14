import { Injectable, Logger } from '@nestjs/common';
import { LlmOperationRegistryService } from './registry/llm-operation-registry.service';
import { computeOperationContractDigest } from './operation-manifest.util';
import type { LlmOperationIdV1 } from '@ops/backend-deterministic-plan';
import { AttestationService } from './eval/attestation.service';
import type { OperationAttestation } from './eval/types';

type JsonSchema = Record<string, unknown>;

export interface LlmOperationCatalogProjection {
  capabilityRef: {
    id: string;
    version: string;
    digest: string;                  // operationDigest（覆盖 Manifest 全字段）
    contractDigest: string;          // 合同包络 digest（覆盖 input/output Schema）
  };
  capabilityKind: 'llm_operation';
  displayName: string;
  summary: string;
  goals: string[];
  inputSchema: JsonSchema | null;
  outputSchema: JsonSchema | null;
  runtime: {
    type: 'llm_operation';
    executionRuntimeType?: string;
  };
  lifecycle: {
    status: 'active' | 'deprecated' | 'disabled';
    environment?: string;
  };
  governance: {
    attestationId?: string;
    evaluatedAt?: string;
    approvedAt?: string;
  };
}

const OPERATION_METADATA: Record<
  LlmOperationIdV1,
  { displayName: string; summary: string; goals: string[] }
> = {
  summarize_list: {
    displayName: '列表摘要',
    summary: '对列表文本、搜索结果或文章项集合做精炼要点总结',
    goals: ['summarize', 'news_summary', 'list_summary'],
  },
  rewrite_to_markdown: {
    displayName: 'Markdown 格式化',
    summary: '将结构化或非结构化内容重写格式化为干净规范的 Markdown 文本',
    goals: ['format_markdown', 'rewrite'],
  },
  summarize_text: {
    displayName: '文本摘要',
    summary: '对长文本段落做关键摘要提取',
    goals: ['summarize_text'],
  },
  extract_structured_fields: {
    displayName: '结构化字段提取',
    summary: '从非结构化文本中提取结构化 JSON 字段',
    goals: ['extract_fields'],
  },
  classify_intent_label: {
    displayName: '意图标签分类',
    summary: '对短文本做意图分类标签,返回标签与置信度',
    goals: ['classify_intent'],
  },
  merge_multi_source_notes: {
    displayName: '多源笔记合并',
    summary: '将多个来源的笔记内容合并为一份 Markdown 文档',
    goals: ['merge_notes'],
  },
};

@Injectable()
export class LlmOperationCatalogProjector {
  private readonly logger = new Logger(LlmOperationCatalogProjector.name);

  constructor(
    private readonly registry: LlmOperationRegistryService,
    private readonly attestation: AttestationService,
  ) {}

  public async projectAll(): Promise<LlmOperationCatalogProjection[]> {
    try {
      const operations = await this.registry.listActiveOperations();
      const projections = await Promise.all(
        operations.map(async (op) => {
          const versionId = op.currentVersion?.id;
          const version = op.currentVersion?.version;
          const operationKey = op.operation?.operationKey;
          if (!versionId || !version || !operationKey) return null;
          if (!(await this.attestation.hasValidAttestation(versionId))) return null;
          const proof = await this.attestation.getLatestAttestation(operationKey, version);
          return proof ? this.fromDbRecord(op, proof) : null;
        }),
      );
      return projections.filter(
        (projection): projection is LlmOperationCatalogProjection => projection !== null,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to project attested LLM Operations; returning no candidates: ${err.message}`,
      );
      return [];
    }
  }

  public async projectOne(operationId: string): Promise<LlmOperationCatalogProjection | null> {
    try {
      const resolved = await this.registry.resolveActiveVersion(operationId as LlmOperationIdV1, 'production');
      if (!resolved) return null;
      if (!(await this.attestation.hasValidAttestation(resolved.version.id))) return null;
      const proof = await this.attestation.getLatestAttestation(
        operationId,
        resolved.version.version,
      );
      return proof ? this.fromResolvedVersion(operationId, resolved.version, proof) : null;
    } catch (err: any) {
      this.logger.error(
        `Failed to project attested LLM Operation '${operationId}': ${err.message}`,
      );
      return null;
    }
  }

  private fromDbRecord(
    op: any,
    proof: OperationAttestation,
  ): LlmOperationCatalogProjection {
    const operationKey = op.operation.operationKey as string;
    const metadata = OPERATION_METADATA[operationKey as LlmOperationIdV1] || {
      displayName: op.operation.displayName || operationKey,
      summary: op.operation.description || operationKey,
      goals: [],
    };

    const manifest = op.currentVersion?.manifestJson || {};
    const version = op.currentVersion?.version || '1';
    const digest = op.currentVersion?.operationDigest || '';
    const contractDigest =
      op.currentVersion?.contractDigest ||
      computeOperationContractDigest(operationKey, version, manifest);

    return {
      capabilityRef: {
        id: operationKey,
        version,
        digest,
        contractDigest,
      },
      capabilityKind: 'llm_operation',
      displayName: metadata.displayName,
      summary: metadata.summary,
      goals: metadata.goals,
      inputSchema: manifest.inputSchema || null,
      outputSchema: manifest.outputSchema || null,
      runtime: {
        type: 'llm_operation',
      },
      lifecycle: {
        status: op.operation.status,
        environment: op.activation?.environment,
      },
      governance: {
        attestationId: proof.id,
        evaluatedAt: proof.createdAt.toISOString(),
        approvedAt: op.currentVersion?.approvedAt?.toISOString?.(),
      },
    };
  }

  private fromResolvedVersion(
    operationId: string,
    version: any,
    proof: OperationAttestation,
  ): LlmOperationCatalogProjection {
    const metadata = OPERATION_METADATA[operationId as LlmOperationIdV1] || {
      displayName: operationId,
      summary: operationId,
      goals: [],
    };

    const manifest = version.manifestJson || {};
    const versionStr = version.version || '1';
    const digest = version.operationDigest || '';
    const contractDigest =
      version.contractDigest ||
      computeOperationContractDigest(operationId, versionStr, manifest);

    return {
      capabilityRef: {
        id: operationId,
        version: versionStr,
        digest,
        contractDigest,
      },
      capabilityKind: 'llm_operation',
      displayName: metadata.displayName,
      summary: metadata.summary,
      goals: metadata.goals,
      inputSchema: manifest.inputSchema || null,
      outputSchema: manifest.outputSchema || null,
      runtime: {
        type: 'llm_operation',
      },
      lifecycle: {
        status: 'active',
        environment: 'production',
      },
      governance: {
        attestationId: proof.id,
        evaluatedAt: proof.createdAt.toISOString(),
        approvedAt: version.approvedAt?.toISOString?.(),
      },
    };
  }
}
