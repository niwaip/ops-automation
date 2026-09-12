import { Injectable, Logger } from '@nestjs/common';
import type { FormIntegrityCheckResult } from './contract-review.types';
import type { DocumentBlock } from '../contract-compare/contract-compare.types';

@Injectable()
export class ContractFormIntegrityScannerService {
  private readonly logger = new Logger(ContractFormIntegrityScannerService.name);

  // Template placeholders: {d.partyA.name}, {{var}}, {var}, ${var}, [待定], 【待补充】
  private readonly TEMPLATE_VAR_REGEX = /\{[a-zA-Z0-9_\.]+\}|\{\{[a-zA-Z0-9_\.]+\}|\$\{[a-zA-Z0-9_\.]+\}/g;
  private readonly DRAFT_PLACEHOLDER_REGEX = /\[(?:待定|待填|待补充|TBD|待确认|●|详见附件)\]|【(?:待定|待填|待补充|待确认|请补充)】/gi;

  // Unfilled blanks: ____, ————, (   ), （   ）
  private readonly BLANKS_REGEX = /[—_]{3,}|（\s{2,}）|\(\s{2,}\)/g;

  // 18-digit Unified Social Credit Code (GB 32100-2015)
  private readonly USCC_REGEX = /\b([0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10})\b/g;

  /**
   * Scan an individual clause for form integrity, placeholders, and fill-in completeness
   */
  public scanClause(
    clauseText: string,
    clauseTitle: string,
    clauseIndex: number,
    blocks?: DocumentBlock[]
  ): FormIntegrityCheckResult {
    const unfilledVariables: string[] = [];
    let unfilledBlanksCount = 0;
    const missingEntities: string[] = [];
    const formatIssues: string[] = [];

    // 1. Scan Template Variables
    const varMatches = clauseText.match(this.TEMPLATE_VAR_REGEX);
    if (varMatches) {
      for (const v of varMatches) {
        if (!unfilledVariables.includes(v)) {
          unfilledVariables.push(v);
        }
      }
    }

    const draftMatches = clauseText.match(this.DRAFT_PLACEHOLDER_REGEX);
    if (draftMatches) {
      for (const d of draftMatches) {
        if (!unfilledVariables.includes(d)) {
          unfilledVariables.push(d);
        }
      }
    }

    // 2. Scan Blanks / Underlines
    const blankMatches = clauseText.match(this.BLANKS_REGEX);
    if (blankMatches) {
      unfilledBlanksCount += blankMatches.length;
    }

    // Also inspect DocumentBlocks for unfilled blanks
    if (blocks && Array.isArray(blocks)) {
      for (const b of blocks) {
        if (b.type === 'bilingual_pair') {
          if (b.primaryHtml && b.primaryHtml.includes('contract-unfilled-blank')) {
            unfilledBlanksCount++;
          }
        }
        if (b.type === 'table' && b.tableData) {
          for (const row of b.tableData.rows) {
            for (const cell of row) {
              const cellVars = cell.match(this.TEMPLATE_VAR_REGEX);
              if (cellVars) {
                for (const cv of cellVars) {
                  if (!unfilledVariables.includes(cv)) unfilledVariables.push(cv);
                }
              }
            }
          }
        }
      }
    }

    // 3. Entity & Subject Completeness Check (Preamble / Clause 0)
    const isExplicitNumberedClause =
      /第[一二三四五六七八九十0-9]+条/i.test(clauseTitle) ||
      /第[一二三四五六七八九十0-9]+条/i.test(clauseText.slice(0, 30));
    const isPreamble =
      !isExplicitNumberedClause &&
      (clauseIndex === 0 || /前言|引言|主体信息|鉴于/i.test(clauseTitle));
    if (isPreamble) {
      const hasPartyA = /甲方|委托方|买方|披露方|出租方|发包方/i.test(clauseText);
      const hasPartyB = /乙方|受托方|卖方|接收方|承租方|承包方/i.test(clauseText);
      if (!hasPartyA) missingEntities.push('甲方（或首要签约方）身份主体标识');
      if (!hasPartyB) missingEntities.push('乙方（或相对签约方）身份主体标识');

      // Check if address/registration is specified
      const hasAddress = /住所|地址|注册地址|位于/i.test(clauseText);
      if (!hasAddress) {
        missingEntities.push('签约方注册住所/法定地址信息');
      }

      // Check if USCC or code is present
      const hasCreditCode = /统一社会信用代码|注册号|营业执照/i.test(clauseText);
      if (!hasCreditCode && !unfilledVariables.some((v) => v.includes('creditCode') || v.includes('taxId'))) {
        missingEntities.push('统一社会信用代码/企业注册代码');
      }
    }

    // 4. Format Validation (USCC syntax if code is present)
    const rawCodes = [...clauseText.matchAll(this.USCC_REGEX)].map((m) => m[1]);
    for (const code of rawCodes) {
      if (!this.isValidUscc(code)) {
        formatIssues.push(`检测到统一社会信用代码 [${code}] 校验码异常，请核对。`);
      }
    }

    // 5. Build Synthesized Summary & Status
    let status: FormIntegrityCheckResult['status'] = 'PASS';
    let summary = '形式要件规范，未检测到未替换变量或待填空白。';

    if (unfilledVariables.length > 0) {
      status = 'WARNING';
      const sampleVars = unfilledVariables.slice(0, 3).join('、');
      const more = unfilledVariables.length > 3 ? ` 等共 ${unfilledVariables.length} 处` : '';
      summary = `⚠️ 检测到未替换模板变量/待填占位符：${sampleVars}${more}，合同尚处于草稿状态，签约前需固化。`;
    } else if (unfilledBlanksCount > 0) {
      status = 'WARNING';
      summary = `⚠️ 检测到 ${unfilledBlanksCount} 处下划线/括号待填留白项，需在正式签署前补全关键数据。`;

    } else if (missingEntities.length > 0 && isPreamble) {
      status = 'WARNING';
      summary = `⚠️ 签约主体信息不完整，缺少：${missingEntities.slice(0, 2).join('、')}。`;
    } else if (formatIssues.length > 0) {
      status = 'WARNING';
      summary = `⚠️ 格式校验异常：${formatIssues[0]}`;
    }

    return {
      status,
      unfilledVariables,
      unfilledBlanksCount,
      missingEntities,
      formatIssues,
      summary,
    };
  }

  /**
   * GB 32100-2015 18-digit Unified Social Credit Code Checksum Algorithm
   */
  private isValidUscc(uscc: string): boolean {
    if (!uscc || uscc.length !== 18) return false;
    const chars = '0123456789ABCDEFGHJKLMNPQRTUWXY';
    const weights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];
    let sum = 0;
    for (let i = 0; i < 17; i++) {
      const idx = chars.indexOf(uscc[i]);
      if (idx === -1) return false;
      sum += idx * weights[i];
    }
    const remainder = sum % 31;
    const checkIndex = (31 - remainder) % 31;
    return uscc[17] === chars[checkIndex];
  }
}
