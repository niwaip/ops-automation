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
import { partitionClausesAdaptively } from './contract-clause-batcher';

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
  isBypassed?: boolean;
  isFallback?: boolean;
  facts?: any;
  findings?: any[];
  diagnostics?: {
    attempt?: number;
    modelId?: string;
    elapsedMs?: number;
    rawSnippet?: string;
    validationFailureCode?: string;
  };
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

interface TransformedClauseReview {
  isValid: boolean;
  rejectionReason?: string;
  findings: any[];
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS';
  riskSummary: string;
  legalAdvice: string;
  recommendedRevision?: string;
}

/**
 * Domain Transformation:
 * Normalizes model finding structures, performs catalog rule hydration,
 * validates semantic integrity, and derives final risk level in a single coherent step.
 * Invariant: Any admitted risk finding MUST be materialized and preserved in final riskLevel.
 * Under no circumstances may an unfulfilled/malformed risk finding be silently converted to PASS.
 */
function transformClauseSemanticReview(
  match: any,
  item: { clause: any; index: number },
  availableRules: any[]
): TransformedClauseReview {
  if (!match || typeof match !== 'object' || Array.isArray(match)) {
    return {
      isValid: false,
      rejectionReason: '模型响应缺失或格式非对象',
      findings: [],
      riskLevel: 'PASS',
      riskSummary: '',
      legalAdvice: '',
    };
  }

  const explicitRiskLevel = normalizeRiskLevel(match.riskLevel);
  const rawFindings: any[] = Array.isArray(match.findings) ? match.findings : [];
  const clauseFindings: any[] = [];
  let passedFindingsCount = 0;
  let hasMalformedFinding = false;

  for (const f of rawFindings) {
    if (!f || typeof f !== 'object' || Array.isArray(f) || Object.keys(f).length === 0) {
      hasMalformedFinding = true;
      continue;
    }

    const normVerdict = typeof f.verdict === 'string' ? f.verdict.toUpperCase().trim() : undefined;
    const fSeverity = normalizeRiskLevel(f.severity);

    // Explicit pass finding
    if (normVerdict === 'PASSED' || fSeverity === 'PASS') {
      passedFindingsCount++;
      continue;
    }

    // Risk finding: requires either a risk severity (HIGH/MEDIUM/LOW), verdict MATCHED, or non-empty rule/reason
    const fLevel: 'HIGH' | 'MEDIUM' | 'LOW' | null =
      fSeverity === 'HIGH' || fSeverity === 'MEDIUM' || fSeverity === 'LOW'
        ? fSeverity
        : normVerdict === 'MATCHED'
        ? 'MEDIUM'
        : null;

    const rawRuleId = String(f.ruleId || f.id || '').trim();
    const rawReason = String(f.reason || f.riskSummary || '').trim();

    // If it has no level, no verdict, no rule, and no reason, it is malformed
    if (!fLevel && !rawRuleId && !rawReason) {
      hasMalformedFinding = true;
      continue;
    }

    const effectiveSeverity = fLevel || 'MEDIUM';

    let quote =
      typeof f.evidenceQuote === 'string' && f.evidenceQuote.trim().length >= 4
        ? f.evidenceQuote.trim().replace(/^["“'‘]|["”'’]$/g, '').trim()
        : undefined;
    if (quote) {
      const normClause = String(item.clause.originalContent || '').replace(/\s+/g, '');
      const normQuote = quote.replace(/\s+/g, '');
      if (!normClause.includes(normQuote)) {
        quote = undefined;
      }
    }

    // Attempt catalog hydration
    const targetRule = availableRules.find(
      (r) =>
        r.elementCode === rawRuleId ||
        r.id === rawRuleId ||
        r.title === rawRuleId ||
        (r.elementCode && rawRuleId && rawRuleId.toUpperCase().includes(r.elementCode))
    );

    if (targetRule) {
      clauseFindings.push({
        id: `finding-clause-${item.index}-${targetRule.elementCode || targetRule.id}`,
        category: targetRule.category || '合规审查要件',
        severity: targetRule.severity || effectiveSeverity,
        title: targetRule.title || item.clause.title || `第 ${item.index + 1} 条`,
        riskSummary: rawReason || targetRule.riskSummary,
        legalAdvice: f.legalAdvice || targetRule.legalAdvice,
        recommendedRevision:
          f.recommendedRevision ||
          targetRule.recommendedRevision ||
          (typeof targetRule.recommendRevision === 'function'
            ? targetRule.recommendRevision(item.clause.originalContent)
            : undefined),
        evidenceQuote: quote,
        ruleId: targetRule.id,
        ruleCode: targetRule.elementCode,
      });
    } else {
      // General / custom risk finding (preserves any reported risk finding)
      clauseFindings.push({
        id: `finding-clause-${item.index}-${rawRuleId || 'general'}`,
        category: '专项法务风控发现',
        severity: effectiveSeverity,
        title: item.clause.title || `第 ${item.index + 1} 条`,
        riskSummary:
          rawReason ||
          (rawRuleId && rawRuleId !== 'GENERAL-RISK'
            ? `命中风险要件 [${rawRuleId}]`
            : '审查发现商事权责失衡或合规隐患'),
        legalAdvice: f.legalAdvice || '建议法务介入复核并协商对等条款。',
        recommendedRevision: f.recommendedRevision,
        evidenceQuote: quote,
        ruleId: rawRuleId || 'GENERAL-RISK',
      });
    }
  }

  // Backward compatibility: flat response with explicit HIGH/MEDIUM risk level
  if (clauseFindings.length === 0 && (explicitRiskLevel === 'HIGH' || explicitRiskLevel === 'MEDIUM')) {
    const primaryRule = item.clause.matchedRules?.[0];
    let quote =
      typeof match.evidenceQuote === 'string' && match.evidenceQuote.trim().length >= 4
        ? match.evidenceQuote.trim().replace(/^["“'‘]|["”'’]$/g, '').trim()
        : undefined;
    if (quote) {
      const normClause = String(item.clause.originalContent || '').replace(/\s+/g, '');
      const normQuote = quote.replace(/\s+/g, '');
      if (!normClause.includes(normQuote)) {
        quote = undefined;
      }
    }
    clauseFindings.push({
      id: `finding-clause-${item.index}`,
      category: primaryRule?.category || '合规审查要件',
      severity: explicitRiskLevel,
      title: primaryRule?.title || item.clause.title || item.clause.clauseNumber || `第 ${item.index + 1} 条`,
      riskSummary: primaryRule?.riskSummary || match.riskSummary || '审查风险',
      legalAdvice: primaryRule?.legalAdvice || match.legalAdvice || '建议法务审阅复核。',
      recommendedRevision: primaryRule?.recommendedRevision || match.recommendedRevision,
      evidenceQuote: quote,
    });
  }

  // Derive final risk level
  let finalLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS' = 'PASS';
  if (clauseFindings.some((f) => f.severity === 'HIGH')) {
    finalLevel = 'HIGH';
  } else if (clauseFindings.some((f) => f.severity === 'MEDIUM')) {
    finalLevel = 'MEDIUM';
  } else if (clauseFindings.some((f) => f.severity === 'LOW')) {
    finalLevel = 'LOW';
  } else if (explicitRiskLevel !== null) {
    finalLevel = explicitRiskLevel;
  } else if (passedFindingsCount > 0 && !hasMalformedFinding) {
    finalLevel = 'PASS';
  }

  // Determine if this is a valid semantic review
  const hasDerivedRisk = clauseFindings.length > 0;
  const hasExplicitPass = explicitRiskLevel === 'PASS';
  const hasAllPassedFindings = passedFindingsCount > 0 && !hasDerivedRisk && !hasMalformedFinding;

  const isValid = hasDerivedRisk || hasExplicitPass || hasAllPassedFindings || explicitRiskLevel !== null;

  if (!isValid) {
    return {
      isValid: false,
      rejectionReason: '模型响应缺失有效风险评估字段或有效判定结论',
      findings: [],
      riskLevel: 'PASS',
      riskSummary: '',
      legalAdvice: '',
    };
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

  return {
    isValid: true,
    findings: clauseFindings,
    riskLevel: finalLevel,
    riskSummary,
    legalAdvice,
    recommendedRevision,
  };
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

  let array: any[] | null = null;
  try {
    const res = JSON.parse(cleaned);
    array = Array.isArray(res) ? res : null;
  } catch {
    try {
      const sanitized = cleaned.replace(/,\s*([}\]])/g, '$1');
      const res = JSON.parse(sanitized);
      array = Array.isArray(res) ? res : null;
    } catch {
      return null;
    }
  }

  if (array) {
    for (const item of array) {
      if (item && typeof item === 'object') {
        const rawIdx = item.clauseIndex ?? item.clauseId ?? item.index ?? item.clause_index;
        const num = Number(rawIdx);
        if (Number.isInteger(num)) {
          item.clauseIndex = num;
        }
      }
    }
  }

  return array;
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
): Promise<{
  reviewedClauses: ClauseReviewOutputItem[];
  orchestratorWarnings: string[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}> {
  const parsedClauses: any[] = parsedDoc.parsedClauses || [];
  const contractTypeName = parsedDoc.contractTypeName || '商事合同';
  const myPosition = parsedDoc.myPosition || 'buyer';
  const rawPrompt = parsedDoc.rawPrompt || '';
  const requestedModelId =
    (request?.input as any)?.modelId ||
    (request?.metadata as any)?.modelId ||
    parsedDoc.modelId ||
    process.env.CONTRACT_REVIEW_MODEL_ID ||
    'default';

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
      const isBypassed = isPureBlank;
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
        isBypassed,
        isFallback: !isBypassed,
        facts: clause.facts,
      };
    } else {
      clausesToReviewViaLlm.push({ clause, index });
    }
  }

  logger.log(
    `[ContractReviewOrchestrator] Bypassed ${parsedClauses.length - clausesToReviewViaLlm.length}/${parsedClauses.length} empty/deterministic clauses. Dispatching ${clausesToReviewViaLlm.length} clauses to LLM in batches.`
  );

  // Dynamically partition substantive clauses using adaptive content-aware batching
  const batches = partitionClausesAdaptively(clausesToReviewViaLlm);
  logger.log(
    `[ContractReviewOrchestrator] Adaptive batching packed ${clausesToReviewViaLlm.length} clauses into ${batches.length} batches ` +
    `(avg ${(clausesToReviewViaLlm.length / (batches.length || 1)).toFixed(1)} clauses/batch, ` +
    `distribution: [${batches.map((b) => b.length).join(', ')}]).`
  );

  // Concurrency limit of batches (default 1 to prevent local GPU contention on designated 35B model)
  const orchestratorUrl = getAiOrchestratorUrl();
  let currentBatchIdx = 0;
  const configuredConcurrency = Number(process.env.CONTRACT_REVIEW_CONCURRENCY);
  const maxConcurrency =
    Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
      ? configuredConcurrency
      : 1;
  const workerCount = Math.min(maxConcurrency, batches.length);
  const orchestratorWarnings: string[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (currentBatchIdx < batches.length) {
      const batchIdx = currentBatchIdx++;
      const currentBatch = batches[batchIdx];

      const prompt = `你是一名资深中国商事合同法务与合规专家。请对以下合同条款批量进行法律合规审查，并严格以 JSON 数组格式返回每个条款的评估结果。

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
        severity: r.severity || 'MEDIUM',
      }));
    const candidateRulesSummary =
      candidateRules.length > 0
        ? candidateRules.map((r: any) => `- [${r.ruleId}] (${r.severity}): ${r.criterion}`).join('\n')
        : '无预设专项要件，请进行常规商事法律合规与权责对等核验';
    return `--- [条款序号: ${item.index}] [条款标题: ${item.clause.title || item.clause.clauseNumber || `第 ${item.index + 1} 条`}] ---
【条款原文】:
${item.clause.originalContent}
【候选合规要件摘要】:
${candidateRulesSummary}`;
  })
  .join('\n\n')}

【审查与判定规则】:
1. 目标导向：直接核验各条款是否命中上述候选要件。直接输出判定结果，禁止展开漫长的自我辩论或非结构化推演。
2. 命中规则：命中则 verdict="MATCHED"，未命中则 verdict="PASSED"。若命中，必须在 evidenceQuote 中摘录条款原文证据原句（严禁臆造），并在 reason 中简述判定理由（20-50字内）。
3. 补充风险：如存在候选规则之外的重大法律风险，可使用 ruleId="GENERAL-RISK" 标识补充，注明 severity ("HIGH"|"MEDIUM"|"LOW") 与 reason，但不得虚构其他规则编号。
4. 数量控制：每个条款 findings 最多保留 1-2 项最关键实质性风险。若条款权责对等、无实质风险，findings 返回空数组或各项 verdict 为 PASSED。
5. 双语排查与数值冲突：若条款中包含双语（如中日双语或中英双语）对照，必须严格比对两种语言版本在付款期限（如天数/日历日/工作日）、金额数值、违约金比例、交付节点及法律效力优先级上是否存在实质冲突。若存在期限或数值冲突（例如中文约定30日而日文约定60日），即便写明某一语言优先，仍构成重大法律理解与争议风险，必须判定为 HIGH 并在 riskSummary 中具体指出两种语言的差异与冲突。

【输出格式要求】:
必须且只能返回纯 JSON 数组，数组中每个对象对应上述条款，顺序一致，且每个对象必须包含 clauseIndex 对应上述条款序号：
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
      const batchStartTime = Date.now();
      let batchFailureCode: string | undefined;
      let batchRawSnippet: string | undefined;
      let lastAttempt = 1;
      let batchModelId = requestedModelId;
      const itemFailureCodes = new Map<number, string>();
      const llmTimeoutMs = Number(process.env.CONTRACT_REVIEW_LLM_TIMEOUT_MS) || 60000;
      try {
        let response: any;
        let lastErr: any;
        for (let attempt = 0; attempt < 2; attempt++) {
          lastAttempt = attempt + 1;
          try {
            response = await axios.post<{
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
                modelId: requestedModelId,
                prompt,
                temperature: 0.1,
                seed: 42,
                responseFormat: 'json_array',
                includeDebug: true,
                timeoutMs: llmTimeoutMs,
                thinking: false,
              },
              { timeout: llmTimeoutMs + 10000 }
            );
            lastErr = null;
            break;
          } catch (err: any) {
            lastErr = err;
            if (attempt === 0) {
              logger.warn(
                `[ContractReviewOrchestrator] Batch ${batchIdx} call attempt 1 failed (${err.message}). Retrying once...`
              );
              await new Promise((r) => setTimeout(r, 600));
            }
          }
        }
        if (lastErr) {
          if (lastErr.code === 'ECONNABORTED' || String(lastErr.message).toLowerCase().includes('timeout')) {
            batchFailureCode = 'NETWORK_TIMEOUT';
          } else if (lastErr.response?.status === 524) {
            batchFailureCode = 'UPSTREAM_HTTP_524';
          } else if (lastErr.response?.status) {
            batchFailureCode = `UPSTREAM_HTTP_${lastErr.response.status}`;
          } else {
            batchFailureCode = 'UPSTREAM_NETWORK_ERROR';
          }
          throw lastErr;
        }

        const inputTokens = response.data?.usage?.prompt_tokens ?? 0;
        const outputTokens = response.data?.usage?.completion_tokens ?? 0;
        const cachedTokens = response.data?.usage?.prompt_tokens_details?.cached_tokens ?? 0;
        totalPromptTokens += inputTokens;
        totalCompletionTokens += outputTokens;

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

        batchModelId =
          response.data?.actualModel ||
          response.data?.actualModelId ||
          response.data?.debug?.actualModel ||
          response.data?.debug?.modelId ||
          requestedModelId;

        const rawResult = response.data?.result || response.data?.content || '';
        batchRawSnippet = typeof rawResult === 'string' ? rawResult.slice(0, 300) : undefined;
        const parsedArray = cleanAndParseJsonArray(rawResult);

        if (!parsedArray || parsedArray.length === 0) {
          batchFailureCode = rawResult ? 'INVALID_JSON_RESPONSE' : 'EMPTY_RESPONSE';
          orchestratorWarnings.push(
            `批次 ${batchIdx + 1} 模型响应未能解析为有效 JSON 数组 (${batchFailureCode})，条款 [${currentBatch.map((b) => b.index + 1).join(', ')}] 已降级为静态规则校验。`
          );
        } else {
          // Detect schema anomalies in batch output: duplicate IDs or foreign IDs
          const expectedIndices = new Set(currentBatch.map((item) => item.index));
          const returnedIndices: number[] = [];
          const duplicateIndices = new Set<number>();
          const foreignIndices: number[] = [];

          for (const p of parsedArray) {
            if (typeof p.clauseIndex === 'number') {
              if (returnedIndices.includes(p.clauseIndex)) {
                duplicateIndices.add(p.clauseIndex);
              } else {
                returnedIndices.push(p.clauseIndex);
              }
              if (!expectedIndices.has(p.clauseIndex)) {
                foreignIndices.push(p.clauseIndex);
              }
            }
          }

          if (duplicateIndices.size > 0) {
            orchestratorWarnings.push(
              `批次 ${batchIdx + 1} 模型响应中包含重复条款序号 [${Array.from(duplicateIndices).join(', ')}]，已记录为格式异常。`
            );
          }
          if (foreignIndices.length > 0) {
            orchestratorWarnings.push(
              `批次 ${batchIdx + 1} 模型响应中包含未知条款序号 [${foreignIndices.join(', ')}]，超出当前批次预期范围。`
            );
          }

          for (const item of currentBatch) {
            const matches = parsedArray.filter((p) => p.clauseIndex === item.index);
            const match = matches[0];
            if (!match) {
              itemFailureCodes.set(item.index, 'MISSING_CLAUSE_IN_BATCH_OUTPUT');
              orchestratorWarnings.push(
                `条款 ${item.index + 1} (${item.clause.clauseNumber || `第 ${item.index + 1} 条`}) 模型响应中未返回该条款评估，已回退为静态规则校验。`
              );
              continue;
            }

            const availableRules: any[] = [
              ...(item.clause.candidateRules || []),
              ...(item.clause.matchedRules || []),
              ...(parsedDoc.availableRules || []),
            ];

            const transformed = transformClauseSemanticReview(match, item, availableRules);

            if (!transformed.isValid) {
              itemFailureCodes.set(item.index, 'MALFORMED_FINDING_SCHEMA');
              orchestratorWarnings.push(
                `条款 ${item.index + 1} (${item.clause.clauseNumber || `第 ${item.index + 1} 条`}) 模型响应缺失有效风险评估字段 (${transformed.rejectionReason || '字段不合法'})，已回退为静态规则校验。`
              );
            } else {
              results[item.index] = {
                clauseIndex: item.index,
                clauseNumber: item.clause.clauseNumber || `第 ${item.index + 1} 条`,
                title: item.clause.title || item.clause.clauseNumber || `第 ${item.index + 1} 条`,
                originalContent: item.clause.originalContent || '',
                riskLevel: transformed.riskLevel,
                riskSummary: transformed.riskSummary,
                legalAdvice: transformed.legalAdvice,
                recommendedRevision: transformed.recommendedRevision,
                matchedCheckpoints:
                  transformed.findings.length > 0
                    ? transformed.findings.map((f: any) => `${f.category || '合规审查要件'}：${f.title}`)
                    : (item.clause.matchedRules || []).map((r: any) => `${r.category}：${r.title}`),
                elementId: transformed.findings[0]?.ruleId || item.clause.matchedRules?.[0]?.elementId,
                elementCode: transformed.findings[0]?.ruleCode || item.clause.matchedRules?.[0]?.elementCode,
                chapterNumber: item.clause.chapterNumber,
                chapterTitle: item.clause.chapterTitle,
                blocks: item.clause.blocks,
                comments: item.clause.comments,
                formIntegrity: item.clause.formIntegrity,
                llmReviewed: true,
                isBypassed: false,
                isFallback: false,
                facts: item.clause.facts,
                findings: transformed.findings.length > 0 ? transformed.findings : undefined,
                diagnostics: {
                  attempt: lastAttempt,
                  modelId: batchModelId,
                  elapsedMs: Date.now() - batchStartTime,
                },
              };
            }
          }
          batchSuccess = currentBatch.every((item) => results[item.index]?.llmReviewed === true);
        }
      } catch (err: any) {
        if (!batchFailureCode) {
          batchFailureCode =
            err.code === 'ECONNABORTED' || String(err.message).toLowerCase().includes('timeout')
              ? 'NETWORK_TIMEOUT'
              : err.response?.status === 524
              ? 'UPSTREAM_HTTP_524'
              : err.response?.status
              ? `UPSTREAM_HTTP_${err.response.status}`
              : 'UPSTREAM_NETWORK_ERROR';
        }
        logger.warn(
          `[ContractReviewOrchestrator] Batch ${batchIdx} model call failed (${batchFailureCode}): ${err.message}. Falling back.`
        );
        orchestratorWarnings.push(
          `批次 ${batchIdx + 1} 模型调用失败 (${batchFailureCode}): ${err.message}，条款 [${currentBatch.map((b) => b.index + 1).join(', ')}] 已降级为静态规则校验。`
        );
      }

      // Fallback for any unfulfilled items in this batch
      if (!batchSuccess) {
        for (const item of currentBatch) {
          if (!results[item.index]) {
            const itemFailure = itemFailureCodes.get(item.index) || batchFailureCode || 'UNKNOWN_DEGRADATION';
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
              riskSummary:
                primaryRule?.riskSummary ||
                `该条款大模型语义审查降级 (${itemFailure})，已回退为静态规则校验。`,
              legalAdvice: primaryRule?.legalAdvice || '未完成大模型语义深审，建议结合业务背景人工复核。',
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
              isBypassed: false,
              isFallback: true,
              facts: item.clause.facts,
              findings: fallbackFindings.length > 0 ? fallbackFindings : undefined,
              diagnostics: {
                attempt: lastAttempt,
                modelId: batchModelId,
                elapsedMs: Date.now() - batchStartTime,
                rawSnippet: batchRawSnippet,
                validationFailureCode: itemFailure,
              },
            };
          }
        }
      }
    }
  });

  await Promise.all(workers);
  const totalTokens = totalPromptTokens + totalCompletionTokens;
  const usage =
    totalTokens > 0
      ? {
          prompt_tokens: totalPromptTokens,
          completion_tokens: totalCompletionTokens,
          total_tokens: totalTokens,
        }
      : undefined;
  return { reviewedClauses: results, orchestratorWarnings, usage };
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

  const { reviewedClauses, orchestratorWarnings, usage } = await executeBatchedSemanticReview(
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
  const clampedScore = Math.max(0, Math.min(100, score));
  const degradedClauses = reviewedClauses.filter((c: any) => c.isFallback === true);
  const combinedWarnings = [
    ...(parseResult.warnings || []),
    ...orchestratorWarnings,
  ];
  if (degradedClauses.length > 0) {
    combinedWarnings.push(
      `检测到 ${degradedClauses.length} 条条款未能完成大模型语义审查（已回退为静态规则校验），建议重点人工复核。`
    );
  }

  const metrics = {
    totalClauses: reviewedClauses.length,
    healthScore: clampedScore,
    highRiskCount,
    mediumRiskCount,
    lowRiskCount,
    missingClausesCount: missingCount,
    passCount,
    unfilledVariablesCount: totalUnfilledVariables,
    unfilledBlanksTotal: parseResult.formIntegrityStats?.totalUnfilledBlanks || 0,
    llmReviewedCount: reviewedClauses.filter((c) => c.llmReviewed).length,
    degradedClausesCount: degradedClauses.length,
    isDegraded: degradedClauses.length > 0,
    isTruncated: Boolean(parseResult.isTruncated),
    warnings: combinedWarnings,
    tokens: usage,
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
        reviewStatus: (degradedClauses.length > 0 || orchestratorWarnings.length > 0) ? 'degraded' : 'completed',
        htmlReport: renderOutput.htmlReport,
        artifact: renderOutput.artifact,
        artifacts: renderOutput.artifacts,
        usage,
      },
      artifacts: renderOutput.artifacts,
    };
  } catch (err: any) {
    throw formatDocumentDomainError(err);
  }
}
