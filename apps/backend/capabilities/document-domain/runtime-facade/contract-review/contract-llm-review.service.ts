import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type {
  ContractType,
  FormIntegrityCheckResult,
  PartyPosition,
  ReviewRiskLevel,
} from './contract-review.types';
import type { CheckpointRule } from './contract-checklist-matrix.service';

export interface ClauseLlmReviewInput {
  clauseIndex: number;
  clauseNumber: string;
  clauseTitle: string;
  clauseText: string;
  contractType: ContractType;
  contractTypeName: string;
  myPosition: PartyPosition;
  matchedRules: CheckpointRule[];
  formIntegrity?: FormIntegrityCheckResult;
}

export interface ClauseLlmReviewResult {
  riskLevel: ReviewRiskLevel;
  riskSummary: string;
  legalAdvice: string;
  recommendedRevision?: string;
  evidenceQuote?: string;
  llmReviewed?: boolean;
}

@Injectable()
export class ContractLlmReviewService {
  private readonly logger = new Logger(ContractLlmReviewService.name);

  private getAiOrchestratorUrl(): string {
    if (process.env.AI_ORCHESTRATOR_URL) {
      return process.env.AI_ORCHESTRATOR_URL;
    }
    if (
      process.env.DOCKER_ENV === 'true' ||
      process.env.IS_DOCKER === 'true' ||
      process.env.NODE_ENV === 'production'
    ) {
      return 'http://ai-orchestrator:3007';
    }
    return 'http://localhost:3007';
  }

  /**
   * Conduct semantic legal review on a single clause.
   * Attempts live LLM invocation via AI Orchestrator. If disabled, unavailable,
   * or failing, seamlessly falls back to the deterministic rule matrix.
   */
  public async reviewClause(input: ClauseLlmReviewInput): Promise<ClauseLlmReviewResult> {
    if (process.env.DISABLE_LLM_REVIEW === 'true') {
      return this.reviewClauseRuleBasedFallback(input);
    }

    try {
      const orchestratorUrl = this.getAiOrchestratorUrl();
      const prompt = this.buildPrompt(input);

      this.logger.debug(
        `Invoking AI Orchestrator for clause ${input.clauseIndex} (${input.clauseTitle}) at ${orchestratorUrl}`
      );

      const response = await axios.post<{ result?: string; content?: string }>(
        `${orchestratorUrl}/ai/model/call`,
        {
          modelId: 'default',
          prompt,
        },
        { timeout: 25000 }
      );

      const rawResult = response.data?.result || response.data?.content || '';
      if (rawResult) {
        const parsed = this.cleanAndParseJson(rawResult);
        if (parsed) {
          const parsedLevel = this.normalizeRiskLevel(parsed.riskLevel);
          let finalLevel: ReviewRiskLevel;
          let notice = '';

          if (parsedLevel) {
            finalLevel = parsedLevel;
          } else {
            // Security guard: never silently downgrade unknown/corrupted risk levels to PASS
            if (input.matchedRules && input.matchedRules.length > 0) {
              const hasHigh = input.matchedRules.some((r) => r.severity === 'HIGH');
              const hasMed = input.matchedRules.some((r) => r.severity === 'MEDIUM');
              finalLevel = hasHigh ? 'HIGH' : hasMed ? 'MEDIUM' : 'LOW';
              notice = ' [模型评级异常，已按规则引擎校验等级]';
            } else {
              finalLevel = 'HIGH';
              notice = ' [模型评级异常待人工复核]';
            }
          }

          return {
            riskLevel: finalLevel,
            riskSummary: (parsed.riskSummary || '审查完毕') + notice,
            legalAdvice:
              parsed.legalAdvice ||
              (notice ? '模型返回了无法识别的风险级别，建议由法务人员人工复核该条款。' : '可按原条款保留。'),
            recommendedRevision:
              parsed.recommendedRevision && String(parsed.recommendedRevision).trim().length > 0
                ? String(parsed.recommendedRevision).trim()
                : undefined,
            evidenceQuote:
              parsed.evidenceQuote && String(parsed.evidenceQuote).trim().length > 0
                ? String(parsed.evidenceQuote).trim()
                : undefined,
            llmReviewed: true,
          };
        }
      }
    } catch (err: any) {
      this.logger.warn(
        `AI Orchestrator call failed for clause ${input.clauseIndex}: ${err.message}. Falling back to rule matrix.`
      );
    }

    return this.reviewClauseRuleBasedFallback(input);
  }

  /**
   * Normalizes risk levels supporting multi-lingual aliases and case-insensitive matching.
   * Returns null if unrecognized.
   */
  public normalizeRiskLevel(rawLevel: any): ReviewRiskLevel | null {
    if (!rawLevel || typeof rawLevel !== 'string') return null;
    const clean = rawLevel.trim().toUpperCase();

    if (clean === 'HIGH' || clean === 'MEDIUM' || clean === 'LOW' || clean === 'PASS') {
      return clean as ReviewRiskLevel;
    }

    if (/^(CRITICAL|FATAL|SEVERE|RED|高|高风险|严重|高危)$/i.test(clean)) {
      return 'HIGH';
    }

    if (/^(WARN|WARNING|MODERATE|YELLOW|中|中风险|警告|提示)$/i.test(clean)) {
      return 'MEDIUM';
    }

    if (/^(INFO|MINOR|BLUE|低|低风险|关注|轻微)$/i.test(clean)) {
      return 'LOW';
    }

    if (/^(PASSED|GREEN|OK|NONE|通过|合格|合规|无风险|正常)$/i.test(clean)) {
      return 'PASS';
    }

    return null;
  }

  private cleanAndParseJson(text: string): any {
    if (!text || typeof text !== 'string') return null;
    let cleaned = text.trim();

    // 1. If wrapped in markdown code blocks ```json ... ```
    const mdMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (mdMatch) {
      cleaned = mdMatch[1].trim();
    }

    // 2. Extract outermost { ... }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(cleaned);
    } catch {
      try {
        const sanitized = cleaned.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(sanitized);
      } catch {
        return null;
      }
    }
  }

  private buildPrompt(input: ClauseLlmReviewInput): string {
    const {
      clauseIndex,
      clauseNumber,
      clauseTitle,
      clauseText,
      contractTypeName,
      myPosition,
      matchedRules,
      formIntegrity,
    } = input;

    const positionDesc =
      myPosition === 'buyer'
        ? '买方/客户方/委托方/透露方（核心诉求：严格保密、保障交付质量、明确违约追偿责任、防范服务商单方免责）'
        : myPosition === 'seller'
        ? '卖方/服务商/开发方/接收方（核心诉求：合理限制保密责任与违约金上限、明确免责抗辩、防范无休止连带责任）'
        : '中立客观商事法务专家（核心诉求：权利义务对等、公平合理、符合中国《民法典》商事合同法律规范）';

    let standardsDesc = '';
    if (matchedRules && matchedRules.length > 0) {
      standardsDesc =
        '\n【重点法律审查标准（已命中本条款关键词）】:\n' +
        matchedRules
          .map((r, i) => `${i + 1}. [${r.severity}] ${r.riskSummary}: ${r.legalAdvice}`)
          .join('\n');
    }

    let formIntegrityDesc = '';
    if (formIntegrity) {
      const issues: string[] = [];
      if (formIntegrity.unfilledVariables.length > 0) {
        issues.push(`待填模板变量未填充: ${formIntegrity.unfilledVariables.join(', ')}`);
      }
      if (formIntegrity.unfilledBlanksCount > 0) {
        issues.push(`存在 ${formIntegrity.unfilledBlanksCount} 处下划线留白或括号空白未填`);
      }
      if (formIntegrity.missingEntities.length > 0) {
        issues.push(`主体关键要素缺失: ${formIntegrity.missingEntities.join(', ')}`);
      }
      if (formIntegrity.formatIssues.length > 0) {
        issues.push(`格式校验问题: ${formIntegrity.formatIssues.join('; ')}`);
      }
      if (issues.length > 0) {
        formIntegrityDesc =
          '\n【前置检测观点一：形式与填报质检发现的缺陷】:\n' +
          issues.map((s) => `- ${s}`).join('\n');
      }
    }

    return `你是一名资深中国商事合同法务与合规专家。请审查以下合同条款并以严格的 JSON 格式输出深度分析。

【合同类别】: ${contractTypeName || '商事合同'}
【我方立场】: ${positionDesc}
【条款定位】: 第${clauseIndex}项 | ${clauseNumber || ''} ${clauseTitle || '正文条款'}
【条款原文】:
"""
${clauseText}
"""
${standardsDesc}${formIntegrityDesc}

【审查要求】
1. 结合我方商业立场与法律审查标准，进行实质性法理审查与风险研判。
2. 若存在单方倾斜、单方免责、过度责任、保密范围不对称或草案模板未填充等问题，指出核心风险并给出针对我方立场的谈判与修改策略。
3. 严格输出一个 JSON 对象，严禁使用任何 markdown 代码块标记（禁止输出 \`\`\`json），严禁输出任何前后解释文字：
{
  "riskLevel": "PASS" | "LOW" | "MEDIUM" | "HIGH",
  "riskSummary": "核心法律风险总结或合规评语（精准概括，60字以内）",
  "legalAdvice": "针对我方立场的实质性谈判对策或法务修改建议（120字以内）",
  "recommendedRevision": "如需修改，给出修改后的示范条款原文（纯文本；若无需修改则留空字符串）"
}`;
  }

  /**
   * Deterministic Rule-Based Fallback when LLM is disabled or unavailable
   */
  public reviewClauseRuleBasedFallback(input: ClauseLlmReviewInput): ClauseLlmReviewResult {
    const {
      clauseIndex,
      clauseTitle,
      clauseText,
      myPosition,
      matchedRules,
      formIntegrity,
    } = input;

    const isExplicitNumberedClause =
      /第[一二三四五六七八九十0-9]+条/i.test(clauseTitle) ||
      /第[一二三四五六七八九十0-9]+条/i.test(clauseText.slice(0, 30));

    // 1. Substantive Matched Rules ALWAYS take precedence if present
    if (matchedRules.length > 0) {
      const hasHigh = matchedRules.some((r) => r.severity === 'HIGH');
      const hasMed = matchedRules.some((r) => r.severity === 'MEDIUM');
      const finalRiskLevel: ReviewRiskLevel = hasHigh ? 'HIGH' : hasMed ? 'MEDIUM' : 'LOW';
      const primaryRule = matchedRules.find((r) => r.severity === finalRiskLevel) || matchedRules[0];
      const recommended = primaryRule.recommendRevision(clauseText);

      let tailoredAdvice = primaryRule.legalAdvice;
      if (myPosition === 'buyer') {
        tailoredAdvice += '（以我方买方/委托方立场，应坚持交付违约责任与质量追索权，不轻易豁免对方实质义务）。';
      } else if (myPosition === 'seller') {
        tailoredAdvice += '（以我方卖方/开发方立场，应争取明确责任上限，并明确非我方过错的免责抗辩）。';
      }

      return {
        riskLevel: finalRiskLevel,
        riskSummary: primaryRule.riskSummary,
        legalAdvice: tailoredAdvice,
        recommendedRevision: recommended !== clauseText ? recommended : undefined,
        llmReviewed: false,
      };
    }

    // 2. Perspective 1 Integration: If this is preamble and has unfilled variables or blanks
    const isPreamble =
      !isExplicitNumberedClause &&
      (clauseIndex === 0 || /前言|引言|主体信息|鉴于/i.test(clauseTitle));

    if (isPreamble) {
      if (formIntegrity && formIntegrity.unfilledVariables.length > 0) {
        const vars = formIntegrity.unfilledVariables;
        const varsStr = vars.slice(0, 3).join('、') + (vars.length > 3 ? ' 等' : '');
        return {
          riskLevel: 'MEDIUM',
          riskSummary: `签约主体与合作引言包含 ${vars.length} 处未填充模板参数（${varsStr}），主体身份与合作标的尚未固化。`,
          legalAdvice:
            '本协议尚属于模板草案。正式签约前必须填入准确的签约主体全称、统一社会信用代码及合作项目名称，以确保合同生效要件完备并防范主体资格争议。',
          recommendedRevision: clauseText.replace(
            /\{[a-zA-Z0-9_\.]+\}/g,
            (m) => `【需填写：${m.replace(/[{}\.]/g, '_')}】`
          ),
          llmReviewed: false,
        };
      }

      if (formIntegrity && formIntegrity.missingEntities.length > 0) {
        return {
          riskLevel: 'LOW',
          riskSummary: `签约主体信息缺少：${formIntegrity.missingEntities.join('、')}。`,
          legalAdvice:
            '建议补充双方统一社会信用代码、法定代表人或授权代表姓名，以便在涉诉时能迅速锁定准确的诉讼保全与执行主体。',
          llmReviewed: false,
        };
      }

      return {
        riskLevel: 'PASS',
        riskSummary: '签约双方主体身份界定规范，合作背景与专有信息透露目的描述清晰。',
        legalAdvice: '引言陈述完备，符合标准商事合同规范，无需实质修改。',
        llmReviewed: false,
      };
    }


    // Substantive Clause with no negative rule triggered
    return {
      riskLevel: 'PASS',
      riskSummary: '该条款权责约定明确对称，未检测到单方免责陷阱、畸高违约金或隐蔽不利条款。',
      legalAdvice: '条款内容符合商业公平原则与法律规范，可按原约定保留。',
      llmReviewed: false,
    };
  }
}

