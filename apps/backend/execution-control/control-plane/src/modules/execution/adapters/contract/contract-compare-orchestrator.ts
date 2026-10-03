import { Logger } from '@nestjs/common';
import axios from 'axios';
import { BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import type { RuntimeStepInvokeRequest } from '../runtime-adapter.interface';
import {
  getCarboneServiceUrl,
  getAiOrchestratorUrl,
} from '../../../../config/service-endpoints';
import { formatDocumentDomainError } from '../builtin-handler-registry.service';

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
  logger: Logger
): Promise<void> {
  const changedPairs = alignedClauses.filter((p) => p.status !== 'UNCHANGED');

  if (changedPairs.length === 0) {
    logger.log('[ContractCompareOrchestrator] No changed clauses detected. Skipping LLM audit.');
    return;
  }

  logger.log(
    `[ContractCompareOrchestrator] Auditing ${changedPairs.length} changed clauses via LLM.`
  );

  const positionDesc =
    myPosition === 'buyer'
      ? '买方/客户方/委托方（核心诉求：防止责任转嫁、防范免责条款扩大、严守工期与质量违约追偿）'
      : myPosition === 'seller'
      ? '卖方/服务商/开发方（核心诉求：合理限制违约责任上限、明确免责抗辩、防止苛刻延期罚则）'
      : '中立客观商事法务专家（核心诉求：权利义务对等、公平合理、防范隐蔽法律陷阱）';

  // Batch 2-3 changed clauses per LLM call
  const BATCH_SIZE = 2;
  const batches: AlignedClausePairDto[][] = [];
  for (let i = 0; i < changedPairs.length; i += BATCH_SIZE) {
    batches.push(changedPairs.slice(i, i + BATCH_SIZE));
  }

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
        const response = await axios.post<{ result?: string; content?: string }>(
          `${orchestratorUrl}/ai/model/call`,
          { modelId: 'default', prompt },
          { timeout: 60000 }
        );

        const rawResult = response.data?.result || response.data?.content || '';
        const parsedArray = cleanAndParseJsonArray(rawResult);

        if (parsedArray && parsedArray.length > 0) {
          for (const item of currentBatch) {
            const match =
              parsedArray.find((p) => p.clauseId === item.id) ||
              parsedArray[currentBatch.indexOf(item)];

            if (match) {
              const parsedLevel = normalizeRiskLevel(match.riskLevel);
              const prevInsight = item.aiInsight;

              // Determine final risk level (highest of rule level and LLM level)
              let finalRisk = parsedLevel || 'MEDIUM';
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
            }
          }
        }
      } catch (err: any) {
        logger.warn(
          `[ContractCompareOrchestrator] Batch ${batchIdx} LLM audit call failed: ${err.message}. Retaining rule insights.`
        );
      }
    }
  });

  await Promise.all(workers);
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
  logger: Logger
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
    request.metadata?.definitionVersion === '0.0.0-smoke' ||
    String(request.executionId || '').startsWith('smoke-');

  if (!skipLlm && process.env.DISABLE_LLM_REVIEW !== 'true') {
    logger.log(
      `[ContractCompareOrchestrator] Stage 2: Performing LLM semantic audit on changed clauses`
    );
    await auditChangedClausesWithLlm(alignedClauses, String(input.myPosition || 'both'), logger);
  }

  // Recalculate metrics
  const highRiskCount = alignedClauses.filter((p) => p.aiInsight?.riskLevel === 'HIGH').length;
  const mediumRiskCount = alignedClauses.filter((p) => p.aiInsight?.riskLevel === 'MEDIUM').length;

  const metrics = {
    ...diffResult.metrics,
    highRiskCount,
    mediumRiskCount,
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

    return {
      success: true,
      output: {
        summary: renderOutput.summary,
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
