import { Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import type { RuntimeStepInvokeRequest } from '../runtime-adapter.interface';
import {
  getCarboneServiceUrl,
  getAiOrchestratorUrl,
} from '../../../../config/service-endpoints';
import { formatDocumentDomainError } from '../builtin-handler-registry.service';
import type { ModelInvocationLedgerService } from '../../../experience-learning/model-invocation-ledger.service';

export interface SemanticAuditOutcome {
  hasFailure: boolean;
  warnings: string[];
  reviewedCount: number;
  failedCount: number;
  totalBatches: number;
}

export function resolvePositionDescription(myPosition?: string): string {
  const clean = String(myPosition || '').trim().toLowerCase();
  if (
    ['buyer', '甲方', '买方', '客户方', '委托方', '发包方', '采购方'].some((k) =>
      clean.includes(k.toLowerCase())
    )
  ) {
    return '甲方/买方/委托方（核心诉求：防止责任转嫁、防范免责条款扩大、严守工期与质量违约追偿）';
  }
  if (
    ['seller', '乙方', '卖方', '服务商', '开发方', '承包方', '供应商'].some((k) =>
      clean.includes(k.toLowerCase())
    )
  ) {
    return '乙方/卖方/服务商（核心诉求：合理限制违约责任上限、明确免责抗辩、防止苛刻延期罚则）';
  }
  if (clean && clean !== 'both' && clean !== 'neutral' && clean !== '中立') {
    return `${myPosition}（核心诉求：维护我方合法权益、对等履行合同义务、防范隐蔽法律陷阱）`;
  }
  return '中立客观商事法务专家（核心诉求：权利义务对等、公平合理、防范隐蔽法律陷阱）';
}

export interface AlignedClausePairDto {
  id: string;
  status: 'UNCHANGED' | 'MODIFIED' | 'ADDED' | 'DELETED';
  sourceClause?: {
    id?: string;
    clauseNumber?: string;
    title?: string;
    content: string;
  };
  targetClause?: {
    id?: string;
    clauseNumber?: string;
    title?: string;
    content: string;
  };
  similarity: number;
  diffTokens?: Array<{ type: 'equal' | 'insert' | 'delete'; text: string }>;
  sourceHtml?: string;
  targetHtml?: string;
  aiInsight?: {
    summary: string;
    riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    legalAdvice?: string;
    elementId?: string;
    elementCode?: string;
    keyChange?: string;
    shortSummary?: string;
  };
}

function normalizeRiskLevel(rawLevel: any): 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | null {
  if (!rawLevel || typeof rawLevel !== 'string') return null;
  const clean = rawLevel.trim().toUpperCase();
  if (clean === 'HIGH' || clean === 'MEDIUM' || clean === 'LOW' || clean === 'NONE') {
    return clean;
  }
  if (/^(CRITICAL|FATAL|SEVERE|RED|高|高风险|严重|高危)$/i.test(clean)) return 'HIGH';
  if (/^(WARN|WARNING|MODERATE|YELLOW|中|中风险|警告|提示)$/i.test(clean)) return 'MEDIUM';
  if (/^(INFO|MINOR|BLUE|低|低风险|关注|轻微)$/i.test(clean)) return 'LOW';
  if (/^(PASSED|GREEN|OK|NONE|通过|合格|合规|无风险|正常|无)$/i.test(clean)) return 'NONE';
  return null;
}

function cleanAndParseJsonArray(text: string): any[] | null {
  if (!text || typeof text !== 'string') return null;
  let cleaned = text.trim();

  const mdMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (mdMatch) {
    cleaned = mdMatch[1].trim();
  }

  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.substring(firstBracket, lastBracket + 1);
  }

  try {
    const res = JSON.parse(cleaned);
    return Array.isArray(res) ? res : null;
  } catch {
    try {
      const sanitized = cleaned.replace(/,\s*([}\]])/g, '$1');
      const res = JSON.parse(sanitized);
      return Array.isArray(res) ? res : null;
    } catch {
      return null;
    }
  }
}

/**
 * Stage 2: Batched LLM Audit for Changed Clauses (MODIFIED / ADDED / DELETED)
 */
async function auditChangedClausesWithLlm(
  alignedClauses: AlignedClausePairDto[],
  myPosition: string,
  request: RuntimeStepInvokeRequest,
  logger: Logger,
  modelLedger?: ModelInvocationLedgerService
): Promise<SemanticAuditOutcome> {
  const outcome: SemanticAuditOutcome = {
    hasFailure: false,
    warnings: [],
    reviewedCount: 0,
    failedCount: 0,
    totalBatches: 0,
  };

  const changedPairs = alignedClauses.filter((p) => p.status !== 'UNCHANGED');

  if (changedPairs.length === 0) {
    logger.log('[ContractCompareOrchestrator] No changed clauses detected. Skipping LLM audit.');
    return outcome;
  }

  logger.log(
    `[ContractCompareOrchestrator] Auditing ${changedPairs.length} changed clauses via LLM.`
  );

  const positionDesc = resolvePositionDescription(myPosition);
  const requestedModelId =
    (request as any).modelId || request.metadata?.modelId || 'default';

  // Batch 2-3 changed clauses per LLM call
  const BATCH_SIZE = 2;
  const batches: AlignedClausePairDto[][] = [];
  for (let i = 0; i < changedPairs.length; i += BATCH_SIZE) {
    batches.push(changedPairs.slice(i, i + BATCH_SIZE));
  }
  outcome.totalBatches = batches.length;

  const orchestratorUrl = getAiOrchestratorUrl();
  let currentBatchIdx = 0;
  const workerCount = Math.min(3, batches.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (currentBatchIdx < batches.length) {
      const batchIdx = currentBatchIdx++;
      const currentBatch = batches[batchIdx];

      const prompt = `你是一名资深中国商事合同法务与风控专家。
以下是两份合同版本比对中发现的【实质变更条款】。请对每一处变更进行深入的法律风控审计：
【我方立场】: ${positionDesc}

【待审计变更条款】:
${currentBatch
  .map((pair, idx) => {
    const title = pair.targetClause?.title || pair.sourceClause?.title || `条款 ${pair.id}`;
    const statusText =
      pair.status === 'MODIFIED'
        ? '文本修改 (MODIFIED)'
        : pair.status === 'ADDED'
        ? '新增条款 (ADDED)'
        : '删除条款 (DELETED)';

    let contentDesc = '';
    if (pair.status === 'MODIFIED') {
      contentDesc = `【基准版原文 (修改前)】:\n${pair.sourceClause?.content || '无'}\n\n【修订版原文 (修改后)】:\n${pair.targetClause?.content || '无'}`;
    } else if (pair.status === 'ADDED') {
      contentDesc = `【新增条款内容】:\n${pair.targetClause?.content || '无'}`;
    } else {
      contentDesc = `【被删除的原条款内容】:\n${pair.sourceClause?.content || '无'}`;
    }

    const baselineInsight = pair.aiInsight?.summary ? `【规则引擎初步线索】: ${pair.aiInsight.summary}\n` : '';

    return `=== [变更序号: ${idx + 1}] [Clause ID: ${pair.id}] [条款标题: ${title}] [变更性质: ${statusText}] ===
${baselineInsight}${contentDesc}
`;
  })
  .join('\n')}

【审计任务要求】:
1. 辨析变更意图与实质性影响（对方试图改变什么权利义务关系？是否存在责任转嫁、免责扩大、陷阱条款）；
2. 评估对我方的法律风险等级（HIGH/MEDIUM/LOW/NONE）与具体风险敞口；
3. 给出针对该项变更的专业修改反驳或谈判应对策略。

【输出格式要求】:
必须且只能返回纯 JSON 数组，数组中每个对象对应上述条款：
[
  {
    "clauseId": "<string, 对应 Clause ID>",
    "riskLevel": "HIGH" | "MEDIUM" | "LOW" | "NONE",
    "summary": "一句话准确揭示变更意图与核心法律风险敞口（20-60字）",
    "legalAdvice": "针对该项变更给出的专业修改/谈判应对策略（30-80字）",
    "keyChange": "简练标注核心改动要点（如：工期压缩/免责范围扩大/删除违约追偿）"
  }
]`;

      try {
        const response = await axios.post<{
          result?: string;
          content?: string;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            prompt_tokens_details?: { cached_tokens?: number };
          };
          pricing?: { input_price_per_1k?: number; output_price_per_1k?: number };
          debug?: {
            modelId?: string;
            actualModel?: string;
            actualModelId?: string;
            provider?: string;
          };
        }>(
          `${orchestratorUrl}/ai/model/call`,
          {
            modelId: requestedModelId,
            prompt,
            temperature: 0.1,
            seed: 42,
            responseFormat: 'json_array',
            timeoutMs: 60000,
            includeDebug: true,
          },
          { timeout: 60000 }
        );

        if (modelLedger && request) {
          try {
            const UUID_REGEX =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            const ownerUserId =
              request.traceContext?.userId && UUID_REGEX.test(request.traceContext.userId)
                ? request.traceContext.userId
                : 'e7fce333-a8f4-4097-9a53-f0a4c729da46';
            const executionId =
              request.executionId && UUID_REGEX.test(request.executionId)
                ? request.executionId
                : undefined;
            const stepId =
              request.stepId && UUID_REGEX.test(request.stepId)
                ? request.stepId
                : undefined;

            const promptDigest = crypto.createHash('sha256').update(prompt, 'utf8').digest('hex');
            const systemPromptDigest = crypto
              .createHash('sha256')
              .update('contract-compare-expert', 'utf8')
              .digest('hex');

            const samplingPolicy = {
              temperature: 0.1,
              seed: 42,
              responseFormat: 'json_array',
            };
            const modelPolicyDigest = crypto
              .createHash('sha256')
              .update(JSON.stringify(samplingPolicy))
              .digest('hex');

            const inputTokens = response.data?.usage?.prompt_tokens ?? 0;
            const outputTokens = response.data?.usage?.completion_tokens ?? 0;
            const cachedTokens =
              response.data?.usage?.prompt_tokens_details?.cached_tokens ?? 0;

            let estimatedCost: number | null = null;
            let currency: string | null = null;
            const pricing = response.data?.pricing;
            if (
              pricing &&
              typeof pricing.input_price_per_1k === 'number' &&
              typeof pricing.output_price_per_1k === 'number'
            ) {
              estimatedCost = Number(
                (
                  ((inputTokens - cachedTokens) / 1000) * pricing.input_price_per_1k +
                  (cachedTokens / 1000) * (pricing.input_price_per_1k * 0.5) +
                  (outputTokens / 1000) * pricing.output_price_per_1k
                ).toFixed(6)
              );
              currency = 'USD';
            }

            await modelLedger.record(ownerUserId, {
              executionId,
              stepId,
              traceId: request.traceContext?.traceId,
              purpose: 'llm_operation',
              promptTemplateVersion: '1.0.0',
              promptTemplateDigest: promptDigest,
              systemPromptDigest,
              modelPolicyDigest,
              generationParameters: samplingPolicy,
              inputRefs: currentBatch.map((pair) => ({
                id: pair.id,
                status: pair.status,
                sourceTitle: pair.sourceClause?.title,
                targetTitle: pair.targetClause?.title,
              })),
              provider:
                (response.data as any)?.provider ||
                response.data?.debug?.provider ||
                'builtin',
              modelId:
                (response.data as any)?.actualModel ||
                response.data?.debug?.actualModel ||
                (response.data as any)?.actualModelId ||
                response.data?.debug?.actualModelId ||
                requestedModelId,
              inputTokens,
              outputTokens,
              cachedTokens,
              estimatedCost,
              currency,
            });
          } catch (ledgerErr: any) {
            logger.warn(
              `[ContractCompareOrchestrator] Failed to record model invocation ledger: ${ledgerErr.message}`
            );
          }
        }

        const rawResult = response.data?.result || response.data?.content || '';
        const parsedArray = cleanAndParseJsonArray(rawResult);

        if (parsedArray && parsedArray.length > 0) {
          for (const item of currentBatch) {
            const matches = parsedArray.filter(
              (p) => p && typeof p === 'object' && p.clauseId === item.id
            );

            // 1. Missing / unmatched clause (F09)
            if (matches.length === 0) {
              outcome.hasFailure = true;
              outcome.failedCount++;
              outcome.warnings.push(`Clause ${item.id} not matched in semantic model response`);
              continue;
            }

            // 2. Duplicate clause IDs with conflict insights (F06)
            if (matches.length > 1) {
              outcome.hasFailure = true;
              outcome.failedCount++;
              outcome.warnings.push(
                `Duplicate conflict semantic insights returned for clause ${item.id}`
              );
              continue;
            }

            const match = matches[0];

            // 3. Incomplete semantic fields (F07)
            const hasValidContent = Boolean(
              match.riskLevel &&
                (match.summary || match.keyChange || match.legalAdvice)
            );
            if (!hasValidContent) {
              outcome.hasFailure = true;
              outcome.failedCount++;
              outcome.warnings.push(
                `Clause ${item.id} returned invalid or incomplete semantic payload`
              );
              continue;
            }

            const parsedLevel = normalizeRiskLevel(match.riskLevel);
            if (!parsedLevel) {
              outcome.hasFailure = true;
              outcome.failedCount++;
              outcome.warnings.push(
                `Clause ${item.id} returned invalid riskLevel '${match.riskLevel}'`
              );
              continue;
            }
            const prevInsight = item.aiInsight;

            // Determine final risk level (highest of rule level and LLM level)
            let finalRisk = parsedLevel;
            if (prevInsight?.riskLevel === 'HIGH' || parsedLevel === 'HIGH') {
              finalRisk = 'HIGH';
            }

            // Combine rule insight with LLM deep insight
            let combinedSummary = match.summary || '条款存在实质变更';
            if (prevInsight?.summary && !combinedSummary.includes(prevInsight.summary)) {
              combinedSummary = `${prevInsight.summary}；${combinedSummary}`;
            }

            let combinedAdvice = match.legalAdvice || prevInsight?.legalAdvice || '建议重点复核。';
            if (prevInsight?.legalAdvice && !combinedAdvice.includes(prevInsight.legalAdvice)) {
              combinedAdvice = `${prevInsight.legalAdvice} ${combinedAdvice}`;
            }

            item.aiInsight = {
              riskLevel: finalRisk,
              summary: combinedSummary,
              legalAdvice: combinedAdvice,
              keyChange: match.keyChange || prevInsight?.keyChange,
              shortSummary: match.keyChange || prevInsight?.shortSummary,
              elementId: prevInsight?.elementId,
              elementCode: prevInsight?.elementCode,
            };
            outcome.reviewedCount++;
          }
        } else {
          outcome.hasFailure = true;
          outcome.failedCount += currentBatch.length;
          outcome.warnings.push(`Batch ${batchIdx + 1} returned unparseable or empty semantic model result`);
        }
      } catch (err: any) {
        outcome.hasFailure = true;
        outcome.failedCount += currentBatch.length;
        const msg = `Batch ${batchIdx + 1} LLM audit call failed: ${err.message}`;
        outcome.warnings.push(msg);
        logger.warn(
          `[ContractCompareOrchestrator] ${msg}. Retaining rule insights.`
        );
      }
    }
  });

  await Promise.all(workers);
  return outcome;
}

/**
 * 3-Stage Pipeline Implementation for Contract Compare:
 * Stage 1: Document Structure Parsing & Diff Alignment (Carbone Engine, 0 LLM)
 * Stage 2: Semantic LLM Audit for Changed Clauses (Control Plane, Batched)
 * Stage 3: Interactive Side-by-side Report & Artifact Rendering (Carbone Engine, 0 LLM)
 */
export async function executeContractCompareOrchestration(
  request: RuntimeStepInvokeRequest,
  idempotencyKey: string,
  logger: Logger,
  modelLedger?: ModelInvocationLedgerService
): Promise<BuiltinSkillHandlerResult> {
  const domainUrl = getCarboneServiceUrl();
  const input = request.input || {};

  // Stage 1: Diff and Align Sections in Carbone Engine
  logger.log(`[ContractCompareOrchestrator] Stage 1: Requesting AST diff and alignment from ${domainUrl}`);
  let diffResult: any;

  try {
    const diffResponse = await axios.post<{ output?: any }>(
      `${domainUrl}/internal/document/contract-compare/diff`,
      {
        executionId: request.executionId,
        stepId: request.stepId,
        capabilityKey: request.publishedSkillId || request.skillId,
        definitionVersion: request.metadata?.definitionVersion,
        idempotencyKey,
        input,
      },
      { timeout: 30000 }
    );
    diffResult = diffResponse.data?.output;
  } catch (err: any) {
    // If diff endpoint returns 404, gracefully fallback to legacy invoke
    if (err.response?.status === 404) {
      logger.warn(
        `[ContractCompareOrchestrator] /diff endpoint 404. Falling back to legacy /invoke.`
      );
      const fallbackResponse = await axios.post<BuiltinSkillHandlerResult>(
        `${domainUrl}/internal/document/contract-compare/invoke`,
        {
          executionId: request.executionId,
          stepId: request.stepId,
          capabilityKey: request.publishedSkillId || request.skillId,
          definitionVersion: request.metadata?.definitionVersion,
          idempotencyKey,
          input,
        },
        { timeout: 120000 }
      );
      return fallbackResponse.data;
    }
    throw formatDocumentDomainError(err);
  }

  const alignedClauses: AlignedClausePairDto[] = diffResult.alignedClauses || [];

  // Stage 2: Batched LLM Audit for Changed Clauses
  const skipLlm =
    input.skipLlmReview === true ||
    input.enableRiskAnalysis === false ||
    request.metadata?.definitionVersion === '0.0.0-smoke' ||
    String(request.executionId || '').startsWith('smoke-');

  let semanticAuditOutcome: SemanticAuditOutcome | undefined;

  if (!skipLlm && process.env.DISABLE_LLM_REVIEW !== 'true') {
    logger.log(
      `[ContractCompareOrchestrator] Stage 2: Performing LLM semantic audit on changed clauses`
    );
    semanticAuditOutcome = await auditChangedClausesWithLlm(
      alignedClauses,
      String(input.myPosition || 'both'),
      request,
      logger,
      modelLedger
    );
  }

  // Recalculate metrics
  const highRiskCount = alignedClauses.filter((p) => p.aiInsight?.riskLevel === 'HIGH').length;
  const mediumRiskCount = alignedClauses.filter((p) => p.aiInsight?.riskLevel === 'MEDIUM').length;

  const isDegraded = Boolean(semanticAuditOutcome?.hasFailure);
  const warnings = semanticAuditOutcome?.warnings || [];

  const metrics = {
    ...diffResult.metrics,
    highRiskCount,
    mediumRiskCount,
    ...(isDegraded ? { isDegraded: true } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };

  // Stage 3: Render Report via Carbone Engine
  logger.log(`[ContractCompareOrchestrator] Stage 3: Rendering comparison report via ${domainUrl}`);
  try {
    const renderResponse = await axios.post<{ output?: any }>(
      `${domainUrl}/internal/document/contract-compare/render-report`,
      {
        executionId: request.executionId,
        stepId: request.stepId,
        idempotencyKey,
        input: {
          fileNameA: diffResult.fileNameA,
          fileNameB: diffResult.fileNameB,
          metrics,
          alignedClauses,
          idempotencyKey,
        },
      },
      { timeout: 30000 }
    );

    const renderOutput = renderResponse.data?.output || {};
    const reviewStatus = semanticAuditOutcome?.hasFailure ? 'incomplete' : 'complete';

    return {
      success: true,
      output: {
        summary: renderOutput.summary,
        reviewStatus,
        metrics,
        alignedClauses,
        htmlReport: renderOutput.htmlReport,
        artifact: renderOutput.artifact,
        artifacts: renderOutput.artifacts,
      },
      artifacts: renderOutput.artifacts,
    };
  } catch (err: any) {
    throw formatDocumentDomainError(err);
  }
}
