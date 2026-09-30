import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';
import { BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import type { RuntimeStepInvokeRequest } from '../runtime-adapter.interface';
import {
  getCarboneServiceUrl,
  getAiOrchestratorUrl,
} from '../../../../config/service-endpoints';
import { formatDocumentDomainError } from '../builtin-handler-registry.service';
import type { ModelInvocationLedgerService } from '../../../experience-learning/model-invocation-ledger.service';

export interface ClauseReviewOutputItem {
  clauseIndex: number;
  clauseNumber: string;
  title: string;
  originalContent: string;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS';
  riskSummary: string;
  legalAdvice: string;
  recommendedRevision?: string;
  matchedCheckpoints: string[];
  elementId?: string;
  elementCode?: string;
  chapterNumber?: string;
  chapterTitle?: string;
  blocks?: any[];
  comments?: any[];
  formIntegrity?: any;
  llmReviewed?: boolean;
  facts?: any;
  findings?: any[];
}

export interface ReviewChapterGroupItem {
  chapterIndex: number;
  chapterNumber: string;
  chapterTitle: string;
  clauses: ClauseReviewOutputItem[];
  highRiskCount: number;
  mediumRiskCount: number;
  passCount: number;
}

/**
 * Normalizes risk levels supporting multi-lingual aliases and case-insensitive matching.
 */
function normalizeRiskLevel(rawLevel: any): 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS' | null {
  if (!rawLevel || typeof rawLevel !== 'string') return null;
  const clean = rawLevel.trim().toUpperCase();
  if (clean === 'HIGH' || clean === 'MEDIUM' || clean === 'LOW' || clean === 'PASS') {
    return clean;
  }
  if (/^(CRITICAL|FATAL|SEVERE|RED|高|高风险|严重|高危)$/i.test(clean)) return 'HIGH';
  if (/^(WARN|WARNING|MODERATE|YELLOW|中|中风险|警告|提示)$/i.test(clean)) return 'MEDIUM';
  if (/^(INFO|MINOR|BLUE|低|低风险|关注|轻微)$/i.test(clean)) return 'LOW';
  if (/^(PASSED|GREEN|OK|NONE|通过|合格|合规|无风险|正常)$/i.test(clean)) return 'PASS';
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
 * Pipeline Stage 2: Batched Semantic Review in Control Plane
 */
async function executeBatchedSemanticReview(
  parsedDoc: any,
  skipLlmReview: boolean,
  logger: Logger,
  modelLedger?: ModelInvocationLedgerService,
  request?: RuntimeStepInvokeRequest
): Promise<ClauseReviewOutputItem[]> {
  const parsedClauses: any[] = parsedDoc.parsedClauses || [];
  const contractTypeName = parsedDoc.contractTypeName || '商事合同';
  const myPosition = parsedDoc.myPosition || 'buyer';
  const rawPrompt = parsedDoc.rawPrompt || '';

  const positionDesc =
    myPosition === 'buyer'
      ? '买方/客户方/委托方/披露方（核心诉求：严格保密、保障交付质量、明确违约追偿责任、防范服务商单方免责）'
      : myPosition === 'seller'
      ? '卖方/服务商/开发方/接收方（核心诉求：合理限制保密责任与违约金上限、明确免责抗辩、防范无休止连带责任、严格审查永久保密与除外缺失）'
      : '中立客观商事法务专家/双向对等审查（核心诉求：权利义务对等、公平合理、符合中国《民法典》商事合同法律规范）';

  const results: ClauseReviewOutputItem[] = new Array(parsedClauses.length);

  // Identify pure empty / blank clauses to bypass LLM
  const clausesToReviewViaLlm: { clause: any; index: number }[] = [];

  for (let index = 0; index < parsedClauses.length; index++) {
    const clause = parsedClauses[index];
    const clauseText = String(clause.originalContent || '').trim();
    const clauseTitle = clause.title || clause.clauseNumber || `第 ${index + 1} 条`;
    const formIntegrity = clause.formIntegrity || {};
    const matchedRules: any[] = clause.matchedRules || [];

    const isAnnex = clause.clauseNumber?.includes('附件') || clauseTitle.includes('附件') || /付属文書/i.test(clauseTitle);
    const isPureBlank = clauseText.length === 0 || (isAnnex && clauseText.length <= 10 && !matchedRules.length);

    if (skipLlmReview || process.env.DISABLE_LLM_REVIEW === 'true' || isPureBlank) {
      // Deterministic Rule-based evaluation (bypass LLM)
      let riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS' = 'PASS';
      let riskSummary = '该条款权责约定明确对称，未检测到单方免责陷阱、畸高违约金或隐蔽不利条款。';
      let legalAdvice = '条款内容符合商业公平原则与法律规范，可按原约定保留。';
      let recommendedRevision: string | undefined = undefined;

      if (isPureBlank && isAnnex) {
        riskLevel = 'HIGH';
        riskSummary = '附件内容完全留白或仅有标题，核心履约范围、技术规格或交付验收标准处于实质缺失状态。';
        legalAdvice = '签约前必须补全附件实质内容（如SOW、SLA与验收指标），或若无需使用则彻底删除正文及附件引用，严禁空白签署。';
      } else if (matchedRules.length > 0) {
        const hasHigh = matchedRules.some((r) => r.severity === 'HIGH');
        const hasMed = matchedRules.some((r) => r.severity === 'MEDIUM');
        riskLevel = hasHigh ? 'HIGH' : hasMed ? 'MEDIUM' : 'LOW';
        const primaryRule = matchedRules.find((r) => r.severity === riskLevel) || matchedRules[0];
        riskSummary = primaryRule.riskSummary;
        legalAdvice = primaryRule.legalAdvice;
        recommendedRevision = primaryRule.recommendedRevision || (typeof primaryRule.recommendRevision === 'function' ? primaryRule.recommendRevision(clauseText) : undefined);
      } else if (formIntegrity.unfilledVariables && formIntegrity.unfilledVariables.length > 0) {
        riskLevel = 'MEDIUM';
        riskSummary = `该条款包含 ${formIntegrity.unfilledVariables.length} 处未填充模板变量，存在要素缺失风险。`;
        legalAdvice = '签约前务必核对并完整填充对应变量。';
      }

      results[index] = {
        clauseIndex: index,
        clauseNumber: clause.clauseNumber || `第 ${index + 1} 条`,
        title: clauseTitle,
        originalContent: clause.originalContent || '',
        riskLevel,
        riskSummary,
        legalAdvice,
        recommendedRevision,
        matchedCheckpoints: matchedRules.map((r: any) => `${r.category}：${r.title}`),
        elementId: matchedRules[0]?.elementId,
        elementCode: matchedRules[0]?.elementCode,
        chapterNumber: clause.chapterNumber,
        chapterTitle: clause.chapterTitle,
        blocks: clause.blocks,
        comments: clause.comments,
        formIntegrity,
        llmReviewed: false,
        facts: clause.facts,
      };
    } else {
      clausesToReviewViaLlm.push({ clause, index });
    }
  }

  logger.log(
    `[ContractReviewOrchestrator] Bypassed ${parsedClauses.length - clausesToReviewViaLlm.length}/${parsedClauses.length} empty/deterministic clauses. Dispatching ${clausesToReviewViaLlm.length} clauses to LLM in batches.`
  );

  // Batch substantive clauses (3 clauses per batch)
  const BATCH_SIZE = 3;
  const batches: { clause: any; index: number }[][] = [];
  for (let i = 0; i < clausesToReviewViaLlm.length; i += BATCH_SIZE) {
    batches.push(clausesToReviewViaLlm.slice(i, i + BATCH_SIZE));
  }

  // Concurrency limit of 3 batches
  const orchestratorUrl = getAiOrchestratorUrl();
  let currentBatchIdx = 0;
  const workerCount = Math.min(3, batches.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (currentBatchIdx < batches.length) {
      const batchIdx = currentBatchIdx++;
      const currentBatch = batches[batchIdx];

      const prompt = `你是一名资深中国商事合同法务与合规专家。请对以下合同条款批量进行深度法律合规审查，并严格以 JSON 数组格式返回每个条款的评估结果。

【合同类别】: ${contractTypeName}
【我方立场】: ${positionDesc}
${rawPrompt ? `【用户专项审查要求】: ${rawPrompt}\n` : ''}
【待审查条款列表及各条款候选合规要件】:
${currentBatch
  .map((item) => {
    const candidateRules = (
      item.clause.candidateRules && item.clause.candidateRules.length > 0
        ? item.clause.candidateRules
        : item.clause.matchedRules || []
    )
      .slice(0, 3)
      .map((r: any) => ({
        ruleId: r.elementCode || r.id,
        criterion: r.title || r.criterion || r.riskSummary,
        severity: r.severity,
      }));
    return `--- [条款序号: ${item.index}] [条款标题: ${item.clause.title || item.clause.clauseNumber || `第 ${item.index + 1} 条`}] ---
【条款原文】:
${item.clause.originalContent}
${candidateRules.length > 0 ? `【候选合规要件摘要】:\n${JSON.stringify(candidateRules, null, 2)}` : '【候选合规要件摘要】: 无预设专项要件，请进行权责对等与法律合规审查'}`;
  })
  .join('\n\n')}

【审查与判定规则】:
1. 逐一核验各条款是否命中上述候选合规要件（命中则 verdict="MATCHED"，未命中则 verdict="PASSED"）。
2. 若命中，必须在 evidenceQuote 中摘录条款原文证据原句（不可臆造），并在 reason 中简述判定理由（20-50字）。
3. 如存在候选规则之外的重大法律风险，可使用 ruleId="GENERAL-RISK" 标识补充，并注明 severity ("HIGH"|"MEDIUM"|"LOW")、reason 与 legalAdvice，但不得虚构其他规则编号。
4. 若条款权责平衡、无实质法律风险，findings 返回空数组或各项 verdict 为 PASSED。

【输出格式要求】:
必须且只能返回纯 JSON 数组，数组中每个对象对应上述条款，顺序一致：
[
  {
    "clauseIndex": <number>,
    "riskLevel": "HIGH" | "MEDIUM" | "LOW" | "PASS",
    "riskSummary": "一句话准确概括核心法律风险（若PASS则填条款权责明确）",
    "findings": [
      {
        "ruleId": "<候选规则ID或GENERAL-RISK>",
        "verdict": "MATCHED" | "PASSED",
        "evidenceQuote": "触发风险的原文原句",
        "reason": "判定理由"
      }
    ]
  }
]`;

      let batchSuccess = false;
      try {
        const response = await axios.post<{
          result?: string;
          content?: string;
          actualModel?: string;
          actualModelId?: string;
          provider?: string;
          pricing?: {
            input_price_per_1k: number;
            output_price_per_1k: number;
            currency: string;
          };
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
            prompt_tokens_details?: { cached_tokens?: number };
          };
          debug?: {
            modelId?: string;
            actualModel?: string;
            actualModelId?: string;
            provider?: string;
          };
        }>(
          `${orchestratorUrl}/ai/model/call`,
          {
            modelId: 'default',
            prompt,
            temperature: 0.1,
            seed: 42,
            responseFormat: 'json_array',
            includeDebug: true,
          },
          { timeout: 60000 }
        );

        if (modelLedger && request) {
          try {
            const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
              .update('contract-review-expert', 'utf8')
              .digest('hex');

            // Catalog snapshot digest from parsedDoc.ruleSetInfo?.digest or availableRules
            let catalogSnapshotDigest: string | undefined = undefined;
            if (parsedDoc.ruleSetInfo?.digest) {
              catalogSnapshotDigest = String(parsedDoc.ruleSetInfo.digest).replace(/^sha256:/i, '').slice(0, 64);
            } else if (parsedDoc.availableRules && parsedDoc.availableRules.length > 0) {
              catalogSnapshotDigest = crypto
                .createHash('sha256')
                .update(JSON.stringify(parsedDoc.availableRules))
                .digest('hex');
            }

            // Sampling policy digest
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
            const cachedTokens = response.data?.usage?.prompt_tokens_details?.cached_tokens ?? 0;

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
                ).toFixed(8)
              );
              currency = pricing.currency || 'CNY';
            } else {
              estimatedCost = Number((((inputTokens / 1000) * 0.002) + ((outputTokens / 1000) * 0.006)).toFixed(8));
              currency = 'CNY';
            }

            const traceId =
              request.traceContext?.traceId ||
              (request.metadata as any)?.traceId ||
              (executionId ? `trace_${executionId}` : undefined);

            const resolvedModelId =
              response.data?.actualModel ||
              response.data?.actualModelId ||
              response.data?.debug?.actualModel ||
              response.data?.debug?.modelId ||
              'default';
            const resolvedProvider =
              response.data?.provider ||
              response.data?.debug?.provider ||
              'ai-orchestrator';

            await modelLedger.record(ownerUserId, {
              executionId,
              stepId,
              traceId,
              purpose: 'llm_operation',
              provider: resolvedProvider,
              modelId: resolvedModelId,
              promptTemplateVersion: '1.0.0',
              promptTemplateDigest: promptDigest,
              systemPromptDigest,
              catalogSnapshotDigest,
              modelPolicyDigest,
              generationParameters: {
                batchIndex: batchIdx + 1,
                totalBatches: batches.length,
                batchSize: currentBatch.length,
                ...samplingPolicy,
              },
              inputRefs: currentBatch.map((b) => ({
                clauseIndex: b.index,
                title: b.clause.title,
                candidateRules: (b.clause.candidateRules || []).map((r: any) => r.elementCode || r.id),
              })),
              inputTokens,
              outputTokens,
              cachedTokens,
              estimatedCost,
              currency,
            });
          } catch (ledgerErr: any) {
            logger.warn(
              `[ContractReviewOrchestrator] Failed to record model invocation ledger: ${ledgerErr.message}`
            );
          }
        }

        const rawResult = response.data?.result || response.data?.content || '';
        const parsedArray = cleanAndParseJsonArray(rawResult);

        if (parsedArray && parsedArray.length > 0) {
          for (const item of currentBatch) {
            const match = parsedArray.find((p) => p.clauseIndex === item.index) || parsedArray[currentBatch.indexOf(item)];
            if (match) {
              const matchedRules: any[] = item.clause.matchedRules || [];
              const availableRules: any[] = [
                ...(item.clause.candidateRules || []),
                ...matchedRules,
                ...(parsedDoc.availableRules || []),
              ];
              const rawFindings: any[] = Array.isArray(match.findings) ? match.findings : [];

              // Post-hydration from server-side rule catalog
              const clauseFindings: any[] = [];
              for (const f of rawFindings) {
                if (f.verdict === 'PASSED') continue;
                const ruleId = String(f.ruleId || f.id || '').trim();
                const targetRule = availableRules.find(
                  (r) =>
                    r.elementCode === ruleId ||
                    r.id === ruleId ||
                    r.title === ruleId ||
                    (r.elementCode && ruleId.toUpperCase().includes(r.elementCode))
                );

                const quote =
                  typeof f.evidenceQuote === 'string' && f.evidenceQuote.trim().length >= 4
                    ? f.evidenceQuote.trim().replace(/^["“'‘]|["”'’]$/g, '').trim()
                    : undefined;

                if (targetRule) {
                  // Post-hydrated finding from authoritative rule
                  clauseFindings.push({
                    id: `finding-clause-${item.index}-${targetRule.elementCode || targetRule.id}`,
                    category: targetRule.category || '合规审查要件',
                    severity: targetRule.severity || 'MEDIUM',
                    title: targetRule.title || item.clause.title || `第 ${item.index + 1} 条`,
                    riskSummary: f.reason ? `${targetRule.riskSummary}（判定依据：${f.reason}）` : targetRule.riskSummary,
                    legalAdvice: targetRule.legalAdvice,
                    recommendedRevision:
                      targetRule.recommendedRevision ||
                      (typeof targetRule.recommendRevision === 'function'
                        ? targetRule.recommendRevision(item.clause.originalContent)
                        : undefined),
                    evidenceQuote: quote,
                    ruleId: targetRule.id,
                    ruleCode: targetRule.elementCode,
                  });
                } else if (ruleId === 'GENERAL-RISK' || f.reason || f.riskSummary) {
                  // General / open-ended risk finding
                  const fLevel = normalizeRiskLevel(f.severity) || 'MEDIUM';
                  clauseFindings.push({
                    id: `finding-clause-${item.index}-general`,
                    category: '专项法务风控发现',
                    severity: fLevel,
                    title: item.clause.title || `第 ${item.index + 1} 条`,
                    riskSummary: f.reason || f.riskSummary || '审查发现商事权责失衡或合规隐患',
                    legalAdvice: f.legalAdvice || '建议法务介入复核并协商对等条款。',
                    recommendedRevision: f.recommendedRevision,
                    evidenceQuote: quote,
                    ruleId: 'GENERAL-RISK',
                  });
                }
              }

              // Backward compatibility for flat LLM responses
              if (clauseFindings.length === 0 && (match.riskSummary || match.legalAdvice)) {
                const parsedLevel = normalizeRiskLevel(match.riskLevel);
                if (parsedLevel === 'HIGH' || parsedLevel === 'MEDIUM') {
                  const primaryRule = matchedRules[0];
                  const quote =
                    typeof match.evidenceQuote === 'string' && match.evidenceQuote.trim().length >= 4
                      ? match.evidenceQuote.trim().replace(/^["“'‘]|["”'’]$/g, '').trim()
                      : undefined;
                  clauseFindings.push({
                    id: `finding-clause-${item.index}`,
                    category: primaryRule?.category || '合规审查要件',
                    severity: parsedLevel,
                    title: primaryRule?.title || item.clause.title || item.clause.clauseNumber || `第 ${item.index + 1} 条`,
                    riskSummary: primaryRule?.riskSummary || match.riskSummary || '审查风险',
                    legalAdvice: primaryRule?.legalAdvice || match.legalAdvice,
                    recommendedRevision: primaryRule?.recommendedRevision || match.recommendedRevision,
                    evidenceQuote: quote,
                  });
                }
              }

              let finalLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS' = 'PASS';
              if (clauseFindings.some((f) => f.severity === 'HIGH')) {
                finalLevel = 'HIGH';
              } else if (clauseFindings.some((f) => f.severity === 'MEDIUM')) {
                finalLevel = 'MEDIUM';
              } else if (clauseFindings.some((f) => f.severity === 'LOW')) {
                finalLevel = 'LOW';
              } else {
                finalLevel = normalizeRiskLevel(match.riskLevel) || 'PASS';
              }

              const primaryFinding = clauseFindings[0];
              const riskSummary =
                primaryFinding?.riskSummary ||
                match.riskSummary ||
                (finalLevel === 'PASS' ? '该条款权责约定明确对称。' : '审查完毕');
              const legalAdvice =
                primaryFinding?.legalAdvice ||
                match.legalAdvice ||
                (finalLevel === 'PASS' ? '条款符合规范，可按原约定保留。' : '建议法务审阅复核。');
              const recommendedRevision =
                primaryFinding?.recommendedRevision || match.recommendedRevision || undefined;

              results[item.index] = {
                clauseIndex: item.index,
                clauseNumber: item.clause.clauseNumber || `第 ${item.index + 1} 条`,
                title: item.clause.title || item.clause.clauseNumber || `第 ${item.index + 1} 条`,
                originalContent: item.clause.originalContent || '',
                riskLevel: finalLevel,
                riskSummary,
                legalAdvice,
                recommendedRevision,
                matchedCheckpoints:
                  clauseFindings.length > 0
                    ? clauseFindings.map((f: any) => `${f.category || '合规审查要件'}：${f.title}`)
                    : matchedRules.map((r: any) => `${r.category}：${r.title}`),
                elementId: primaryFinding?.ruleId || matchedRules[0]?.elementId,
                elementCode: primaryFinding?.ruleCode || matchedRules[0]?.elementCode,
                chapterNumber: item.clause.chapterNumber,
                chapterTitle: item.clause.chapterTitle,
                blocks: item.clause.blocks,
                comments: item.clause.comments,
                formIntegrity: item.clause.formIntegrity,
                llmReviewed: true,
                facts: item.clause.facts,
                findings: clauseFindings.length > 0 ? clauseFindings : undefined,
              };
            }
          }
          batchSuccess = true;
        }
      } catch (err: any) {
        logger.warn(`[ContractReviewOrchestrator] Batch ${batchIdx} model call failed: ${err.message}. Falling back.`);
      }

      // Fallback for any unfulfilled items in this batch
      if (!batchSuccess) {
        for (const item of currentBatch) {
          if (!results[item.index]) {
            const matchedRules = item.clause.matchedRules || [];
            const hasHigh = matchedRules.some((r: any) => r.severity === 'HIGH');
            const hasMed = matchedRules.some((r: any) => r.severity === 'MEDIUM');
            const riskLevel = hasHigh ? 'HIGH' : hasMed ? 'MEDIUM' : 'LOW';
            const primaryRule = matchedRules.find((r: any) => r.severity === riskLevel) || matchedRules[0];

            const fallbackFindings: any[] = [];
            if (riskLevel === 'HIGH' || riskLevel === 'MEDIUM') {
              fallbackFindings.push({
                id: `finding-clause-${item.index}`,
                category: primaryRule?.category || '合规审查要件',
                severity: riskLevel,
                title: item.clause.title || item.clause.clauseNumber || `第 ${item.index + 1} 条`,
                riskSummary: primaryRule?.riskSummary || '审查风险',
                legalAdvice: primaryRule?.legalAdvice,
                recommendedRevision: primaryRule?.recommendedRevision,
                evidenceQuote: primaryRule?.evidenceQuote,
              });
            }

            results[item.index] = {
              clauseIndex: item.index,
              clauseNumber: item.clause.clauseNumber || `第 ${item.index + 1} 条`,
              title: item.clause.title || item.clause.clauseNumber || `第 ${item.index + 1} 条`,
              originalContent: item.clause.originalContent || '',
              riskLevel,
              riskSummary: primaryRule?.riskSummary || '该条款权责约定明确对称。',
              legalAdvice: primaryRule?.legalAdvice || '条款符合规范，可按原约定保留。',
              recommendedRevision: primaryRule?.recommendedRevision,
              matchedCheckpoints: matchedRules.map((r: any) => `${r.category}：${r.title}`),
              elementId: primaryRule?.elementId,
              elementCode: primaryRule?.elementCode,
              chapterNumber: item.clause.chapterNumber,
              chapterTitle: item.clause.chapterTitle,
              blocks: item.clause.blocks,
              comments: item.clause.comments,
              formIntegrity: item.clause.formIntegrity,
              llmReviewed: false,
              facts: item.clause.facts,
              findings: fallbackFindings.length > 0 ? fallbackFindings : undefined,
            };
          }
        }
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * 3-Stage Pipeline Implementation (Option B):
 * Stage 1: Document Parse (Carbone Engine, 0 LLM)
 * Stage 2: Batched Semantic Review & Scoring (Control Plane, Batching + Bypass)
 * Stage 3: HTML Report & Artifact Generation (Carbone Engine, 0 LLM)
 */
export async function executeContractReviewOrchestration(
  request: RuntimeStepInvokeRequest,
  idempotencyKey: string,
  logger: Logger,
  modelLedger?: ModelInvocationLedgerService
): Promise<BuiltinSkillHandlerResult> {
  const domainUrl = getCarboneServiceUrl();
  const rawInput = request.input || {};
  const input: Record<string, unknown> = { ...rawInput };

  // Clean up pseudo file URLs (e.g. "https://contract.nda") that pollute audit and execution events
  if (
    typeof input.fileUrl === 'string' &&
    (input.fileUrl === 'https://contract.nda' ||
      input.fileUrl.startsWith('https://contract.') ||
      input.fileUrl.startsWith('http://contract.'))
  ) {
    delete input.fileUrl;
  }

  // Clean up duplicate fileBase64A payload when fileBase64 is already present
  if (input.fileBase64 && input.fileBase64A && input.fileBase64A === input.fileBase64) {
    delete input.fileBase64A;
  }

  // Stage 1: Parse Document Structure
  logger.log(`[ContractReviewOrchestrator] Stage 1: Requesting document parsing from ${domainUrl}`);
  let parseResult: any;

  try {
    const parseResponse = await axios.post<{ output?: any }>(
      `${domainUrl}/internal/document/contract-review/parse`,
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
    parseResult = parseResponse.data?.output;
  } catch (err: any) {
    // If parse endpoint is not available (404), seamlessly fallback to legacy invoke
    if (err.response?.status === 404) {
      logger.warn(`[ContractReviewOrchestrator] /parse endpoint 404. Falling back to legacy /invoke.`);
      const fallbackResponse = await axios.post<BuiltinSkillHandlerResult>(
        `${domainUrl}/internal/document/contract-review/invoke`,
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

  // Stage 2: Batched Semantic Review in Control Plane
  logger.log(
    `[ContractReviewOrchestrator] Stage 2: Conducting batched semantic review for ${parseResult.parsedClauses?.length || 0} clauses`
  );
  const skipLlm =
    input.skipLlmReview === true ||
    request.metadata?.definitionVersion === '0.0.0-smoke' ||
    String(request.executionId || '').startsWith('smoke-');

  const reviewedClauses = await executeBatchedSemanticReview(
    parseResult,
    skipLlm,
    logger,
    modelLedger,
    request
  );

  // Compute metrics & health score
  const highRiskCount = reviewedClauses.filter((c) => c.riskLevel === 'HIGH').length;
  const mediumRiskCount = reviewedClauses.filter((c) => c.riskLevel === 'MEDIUM').length;
  const lowRiskCount = reviewedClauses.filter((c) => c.riskLevel === 'LOW').length;
  const passCount = reviewedClauses.filter((c) => c.riskLevel === 'PASS').length;
  const missingCount = (parseResult.missingClauses || []).length;
  const totalUnfilledVariables = parseResult.formIntegrityStats?.totalUnfilledVariables || 0;

  let score = 100;
  score -= highRiskCount * 14;
  score -= (parseResult.missingClauses || []).filter((m: any) => m.severity === 'HIGH').length * 15;
  score -= mediumRiskCount * 7;
  score -= (parseResult.missingClauses || []).filter((m: any) => m.severity === 'MEDIUM').length * 6;
  if (totalUnfilledVariables > 0) {
    score -= Math.min(15, totalUnfilledVariables * 3);
  }
  score = Math.max(25, Math.min(100, score));

  const metrics = {
    totalClauses: reviewedClauses.length,
    healthScore: score,
    highRiskCount,
    mediumRiskCount,
    lowRiskCount,
    missingClausesCount: missingCount,
    passCount,
    unfilledVariablesCount: totalUnfilledVariables,
    unfilledBlanksTotal: parseResult.formIntegrityStats?.totalUnfilledBlanks || 0,
    llmReviewedCount: reviewedClauses.filter((c) => c.llmReviewed).length,
    isTruncated: parseResult.isTruncated,
    warnings: parseResult.warnings,
  };

  // Group chapters
  const chapterMap = new Map<string, ReviewChapterGroupItem>();
  let chIdx = 1;
  for (const c of reviewedClauses) {
    const isPreamble = c.clauseIndex === 0 || c.clauseNumber === '前言';
    const isAnnex = c.clauseNumber?.includes('附件') || c.title?.includes('附件') || /付属文書/i.test(c.title);
    const chNum = isPreamble
      ? c.chapterNumber && c.chapterNumber !== '正文' ? c.chapterNumber : '前言'
      : isAnnex
      ? c.chapterNumber || '附件'
      : c.chapterNumber || '正文';
    const chTitle = isPreamble
      ? c.chapterTitle && c.chapterTitle !== '合同正文条款' ? c.chapterTitle : '合同引言与签约主体'
      : isAnnex
      ? c.chapterTitle || '合同附件与补充协议'
      : c.chapterTitle || '合同正文条款';
    const key = `${chNum}__${chTitle}`;
    if (!chapterMap.has(key)) {
      chapterMap.set(key, {
        chapterIndex: chIdx++,
        chapterNumber: chNum,
        chapterTitle: chTitle,
        clauses: [],
        highRiskCount: 0,
        mediumRiskCount: 0,
        passCount: 0,
      });
    }
    const group = chapterMap.get(key)!;
    group.clauses.push(c);
    if (c.riskLevel === 'HIGH') group.highRiskCount++;
    else if (c.riskLevel === 'MEDIUM') group.mediumRiskCount++;
    else if (c.riskLevel === 'PASS') group.passCount++;
  }
  const chapters = Array.from(chapterMap.values());

  // Stage 3: Render Report via Carbone Engine
  logger.log(`[ContractReviewOrchestrator] Stage 3: Rendering report and artifact via ${domainUrl}`);
  const allComments =
    parseResult.comments || reviewedClauses.flatMap((c: any) => c.comments || []);

  try {
    const renderResponse = await axios.post<{ output?: any }>(
      `${domainUrl}/internal/document/contract-review/render-report`,
      {
        executionId: request.executionId,
        stepId: request.stepId,
        idempotencyKey,
        input: {
          fileName: parseResult.fileName,
          contractType: parseResult.contractType,
          contractTypeName: parseResult.contractTypeName,
          myPosition: parseResult.myPosition,
          positionSource: parseResult.positionSource,
          metrics,
          clauses: reviewedClauses,
          chapters,
          missingClauses: parseResult.missingClauses,
          comments: allComments.length > 0 ? allComments : undefined,
          ruleSetInfo: parseResult.ruleSetInfo,
          sourceDocumentVersion: parseResult.sourceDocumentVersion,
          executionId: request.executionId,
          idempotencyKey,
        },
      },
      { timeout: 30000 }
    );

    const renderOutput = renderResponse.data?.output || {};

    const capabilityKey =
      request.publishedSkillId || request.skillId || 'platform.document.contract-reviewer';
    const capabilityVersion = request.metadata?.definitionVersion || '1.0.2';

    return {
      success: true,
      output: {
        capabilityKey,
        capabilityVersion,
        summary: renderOutput.summary,
        chatSummary: renderOutput.chatSummary,
        contractType: parseResult.contractType,
        contractTypeName: parseResult.contractTypeName,
        myPosition: parseResult.myPosition,
        positionSource: parseResult.positionSource || 'default',
        metrics,
        clauses: reviewedClauses,
        chapters,
        missingClauses: parseResult.missingClauses,
        comments: allComments.length > 0 ? allComments : undefined,
        ruleSetInfo: renderOutput.ruleSetInfo || parseResult.ruleSetInfo,
        sourceDocumentVersion: parseResult.sourceDocumentVersion,
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
