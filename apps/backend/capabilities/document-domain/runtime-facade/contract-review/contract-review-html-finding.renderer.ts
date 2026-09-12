import type {
  ClauseReviewItem,
  ContractReviewMetrics,
  MissingClauseAlert,
} from './contract-review.types';

export interface FindingItemViewModel {
  id: string;
  findingIndex: number;
  clauseIndex?: number;
  clauseNumber?: string;
  clauseTitle?: string;
  title: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS';
  issueType: '信息缺失' | '表述歧义' | '待核实附件' | '责任范围变化' | '权责偏颇' | '合规参考';
  factQuote?: string;
  impact: string;
  basis?: string;
  suggestion?: string;
  suggestedRevision?: string;
  isMissingClause?: boolean;
  unfilledVariables?: string[];
}

export class ContractReviewHtmlFindingRenderer {
  /**
   * Transforms raw clauses and missing clause alerts into a unified list of Findings.
   */
  buildFindingViewModels(
    clauses: ClauseReviewItem[],
    missingClauses: MissingClauseAlert[]
  ): FindingItemViewModel[] {
    const findings: FindingItemViewModel[] = [];
    let counter = 1;

    // 1. Convert Missing Clause Alerts to Findings (Type: 信息缺失)
    for (const m of missingClauses) {
      // Deduplicate "缺失" in title
      const cleanTitle = (m.title || '必备条款').replace(/^(缺失|缺少|未包含|未约定|未订立)\s*/, '');

      findings.push({
        id: `finding-missing-${m.id || counter}`,
        findingIndex: counter++,
        title: `缺失必备保护条款：${cleanTitle}`,
        severity: m.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
        issueType: '信息缺失',
        factQuote: '原合同文本未订立本防御性条款（法务条款空白）',
        impact: m.reason || '缺少该项关键免责或防御机制，可能在发生外部不可控事件或商业纠纷时陷入举证困难或连带责任敞口。',
        basis: `${m.category || '合同必备要件标准'} · ${m.elementCode || 'STATUTORY-ESSENTIAL'}`,
        suggestion: '建议在合同对应章节中增订该必备保护条款，或在补充协议中完成约定。',
        suggestedRevision: m.recommendedClause,
        isMissingClause: true,
      });
    }

    // 2. Convert Clause Risks and Form Warnings
    for (const c of clauses) {
      const isHigh = c.riskLevel === 'HIGH';
      const isMed = c.riskLevel === 'MEDIUM';

      // Check form integrity issues (Unfilled variables or excessive blanks)
      const form = c.formIntegrity;
      const hasUnfilledVars = form && form.unfilledVariables && form.unfilledVariables.length > 0;
      const hasBlanks = form && form.unfilledBlanksCount > 0;

      if (hasUnfilledVars || hasBlanks) {
        findings.push({
          id: `finding-form-${c.clauseIndex}`,
          findingIndex: counter++,
          clauseIndex: c.clauseIndex,
          clauseNumber: c.clauseNumber,
          clauseTitle: c.title,
          title: `${c.clauseNumber} 草稿模板填报未固化`,
          severity: 'MEDIUM',
          issueType: '信息缺失',
          factQuote: hasUnfilledVars
            ? `待替换变量：${form!.unfilledVariables.slice(0, 3).join(', ')}${form!.unfilledVariables.length > 3 ? ` 等共${form!.unfilledVariables.length}处` : ''}`
            : `留白待补处：全文检出 ${form!.unfilledBlanksCount} 处下划线留白`,
          impact: '签署前若未填实关键商业要素（如地点、期限、金额、验收基准），将导致履行约定不明或法律效力存疑。',
          basis: '合同形式完整性与填报规范核验标准',
          suggestion: '请与业务部门确认具体数值或参数，并在签署定稿前彻底消除括号与下划线。',
          unfilledVariables: form?.unfilledVariables,
        });
      }

      // Legal findings from P2 evaluation
      if (c.findings && c.findings.length > 0) {
        for (const f of c.findings) {
          if (f.severity === 'PASS' && !isHigh && !isMed) continue;

          let issueType: FindingItemViewModel['issueType'] = '权责偏颇';
          const titleLow = (f.title + ' ' + f.riskSummary).toLowerCase();
          if (titleLow.includes('缺失') || titleLow.includes('未约定') || titleLow.includes('未明确') || titleLow.includes('未提及')) {
            issueType = '信息缺失';
          } else if (titleLow.includes('歧义') || titleLow.includes('含糊') || titleLow.includes('矛盾') || titleLow.includes('标准不明')) {
            issueType = '表述歧义';
          } else if (titleLow.includes('附件') || titleLow.includes('sla') || titleLow.includes('技术方案')) {
            issueType = '待核实附件';
          } else if (titleLow.includes('违约金') || titleLow.includes('责任') || titleLow.includes('赔偿') || titleLow.includes('管辖') || titleLow.includes('解除')) {
            issueType = '责任范围变化';
          }

          // Clean duplicate clause number in title if already present
          const cleanFindingTitle = (f.title || '审查风控预警')
            .replace(new RegExp(`^(第\\s*\\d+\\s*条|${c.clauseNumber})\\s*`, 'i'), '')
            .trim();

          // Resolve evidence quote gracefully
          const resolvedQuote = this.resolveEvidenceQuote(f.evidenceQuote, c.originalContent, f.title, f.riskSummary);

          findings.push({
            id: `finding-${f.id || `${c.clauseIndex}-${counter}`}`,
            findingIndex: counter++,
            clauseIndex: c.clauseIndex,
            clauseNumber: c.clauseNumber,
            clauseTitle: c.title,
            title: `${c.clauseNumber} ${cleanFindingTitle}`,
            severity: f.severity === 'HIGH' ? 'HIGH' : f.severity === 'MEDIUM' ? 'MEDIUM' : 'LOW',
            issueType,
            factQuote: resolvedQuote,
            impact: f.riskSummary || c.riskSummary || '存在不对等约束或履约违约风险。',
            basis: f.elementCode ? `${f.category || '风控审查要件'} · 编码: ${f.elementCode}` : c.matchedCheckpoints?.[0] || '标准商事合同合规规范',
            suggestion: f.legalAdvice || c.legalAdvice || '建议调整条款表述以平衡双方权利义务。',
            suggestedRevision: f.recommendedRevision || c.recommendedRevision,
          });
        }
      } else if (isHigh || isMed) {
        // Fallback for clause without decomposed findings
        let issueType: FindingItemViewModel['issueType'] = '权责偏颇';
        const summary = (c.riskSummary || '').toLowerCase();
        if (summary.includes('缺失') || summary.includes('未约定')) {
          issueType = '信息缺失';
        } else if (summary.includes('歧义') || summary.includes('含糊')) {
          issueType = '表述歧义';
        }

        const cleanTitle = (c.title || '条款合规诊断')
          .replace(new RegExp(`^(第\\s*\\d+\\s*条|${c.clauseNumber})\\s*`, 'i'), '')
          .trim();

        const resolvedQuote = this.resolveEvidenceQuote(undefined, c.originalContent, cleanTitle, c.riskSummary);

        findings.push({
          id: `finding-clause-${c.clauseIndex}`,
          findingIndex: counter++,
          clauseIndex: c.clauseIndex,
          clauseNumber: c.clauseNumber,
          clauseTitle: c.title,
          title: `${c.clauseNumber} ${cleanTitle}`,
          severity: c.riskLevel,
          issueType,
          factQuote: resolvedQuote,
          impact: c.riskSummary || '条款存在商业偏颇或法律救济受限风险。',
          basis: c.matchedCheckpoints?.[0] || '商事合同合规指引与风险防范要求',
          suggestion: c.legalAdvice || '建议调整条款表述或增加对等豁免条款。',
          suggestedRevision: c.recommendedRevision,
        });
      }
    }

    return findings;
  }

  /**
   * Attempts to isolate the relevant sentence in clause text, or returns graceful message
   * instead of exposing the technical raw string '待定位'.
   */
  private resolveEvidenceQuote(
    rawQuote: string | undefined,
    clauseContent: string,
    title: string,
    summary: string
  ): string {
    if (rawQuote && rawQuote !== '待定位' && rawQuote.trim().length >= 4) {
      return rawQuote.trim();
    }

    // Try keyword matching in clause content
    if (clauseContent && clauseContent.trim()) {
      const stopWords = /[\s,，、;；|:：/\\_\-()（）\[\]【】\d+%“”"‘’'《》]+|是否|不得|应当|必须|超过|高于|低于|约定|排查|检查|若|如果|如|双方|甲方|乙方|开展|合作|合同|协议|条款|内容|规定|软件|系统|项目|业务|风险|存在|可能/g;
      const textTokens = (title + ' ' + summary)
        .split(stopWords)
        .filter((w) => w && w.length >= 2);

      const sentences = clauseContent.split(/[。\n；;]/).map((s) => s.trim()).filter((s) => s.length > 5);
      for (const token of textTokens) {
        for (const s of sentences) {
          if (s.includes(token)) {
            return s.length > 150 ? s.slice(0, 147) + '...' : s;
          }
        }
      }

      if (sentences.length > 0) {
        return sentences[0].length > 150 ? sentences[0].slice(0, 147) + '...' : sentences[0];
      }
    }

    // Graceful fallback explaining the semantic nature
    return '（源于本条款整体约定研判，未限定于单一特征句）';
  }

  /**
   * Render the complete right-hand inspection desk (40% right column).
   */
  renderFindingsWorkbench(findings: FindingItemViewModel[], metrics?: ContractReviewMetrics): string {
    const findingCardsHtml = findings.map((f, idx) => this.renderFindingCard(f, idx)).join('\n');
    const executiveSummaryHtml = this.renderExecutiveSummary(findings, metrics);

    return `
    <section id="findings-workbench" class="findings-desk flex flex-col space-y-3 font-sans">
      
      <!-- 总体合规研判与审查备忘卡片 (Executive Summary & Risk Posture) -->
      ${executiveSummaryHtml}

      <!-- Workbench Subheader & Operations Bar -->
      <div class="flex items-center justify-between py-1.5 px-1 border-b border-[#E2E5EA] select-none">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-[#202833] uppercase tracking-wider">审查要点清单</span>
          <span id="workbench-count-badge" class="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#294766]/10 text-[#294766]">
            共 ${findings.length} 项
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            id="toggle-all-details-btn"
            onclick="toggleAllFindingDetails()"
            class="text-[11px] text-[#294766] hover:text-[#1a3047] font-medium px-2 py-0.5 rounded border border-[#E2E5EA] bg-white transition cursor-pointer"
          >
            展开全部建议
          </button>
          <div class="text-[10px] text-[#667085] hidden sm:inline">
            快捷键 <kbd class="px-1 py-0.5 bg-white border border-[#E2E5EA] rounded font-mono text-[9px]">P</kbd> 上一项 · <kbd class="px-1 py-0.5 bg-white border border-[#E2E5EA] rounded font-mono text-[9px]">N</kbd> 下一项
          </div>
        </div>
      </div>

      <!-- Scrollable Findings Cards Stream -->
      <div id="findings-stream" class="space-y-3">
        ${
          findings.length === 0
            ? `
          <div class="p-8 text-center bg-white rounded-lg border border-[#E2E5EA] text-sm text-[#667085]">
            <svg class="w-8 h-8 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            合同未检出实质性法律风险或必备要件缺失，条款形式与实质合规规范。
          </div>
        `
            : findingCardsHtml
        }
      </div>
    </section>
    `;
  }

  /**
   * Render the Executive Summary / Overall Analysis card at the top of the desk.
   */
  private renderExecutiveSummary(findings: FindingItemViewModel[], metrics?: ContractReviewMetrics): string {
    const highFindings = findings.filter((f) => f.severity === 'HIGH');
    const missingFindings = findings.filter((f) => f.issueType === '信息缺失');
    const verifyFindings = findings.filter((f) => f.issueType === '表述歧义' || f.issueType === '待核实附件' || f.issueType === '责任范围变化');

    const score = metrics?.healthScore ?? (findings.length === 0 ? 100 : Math.max(30, 100 - highFindings.length * 15 - missingFindings.length * 10));
    const scoreColor = score >= 85 ? '#059669' : score >= 65 ? '#D97706' : '#B42318';
    const scoreText = score >= 85 ? '合规良好' : score >= 65 ? '中度风险' : '高危漏洞';

    // 1. Missing clauses section
    const missingHighlightsHtml = findings
      .filter((f) => f.isMissingClause)
      .map((f) => `<li><strong class="text-[#9A6700]">${this.escapeHtml(f.title)}</strong>：<span class="text-[#667085]">${this.escapeHtml(f.impact)}</span></li>`)
      .join('');

    // 2. High risk clauses section (up to 3)
    const highRiskHighlightsHtml = findings
      .filter((f) => !f.isMissingClause && f.severity === 'HIGH')
      .slice(0, 3)
      .map((f) => `<li><strong class="text-[#B42318]">${this.escapeHtml(f.title)}</strong>：<span class="text-[#667085]">${this.escapeHtml(f.impact)}</span></li>`)
      .join('');

    return `
    <div id="executive-summary-card" class="bg-white rounded-lg border border-[#E2E5EA] p-3.5 shadow-2xs">
      <div class="flex items-center justify-between pb-2 mb-2 border-b border-[#F0F2F5] select-none">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-[#294766]"></div>
          <h2 class="text-xs font-bold text-[#202833] uppercase tracking-wider">总体合规审查分析与风控备忘</h2>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="px-2 py-0.5 rounded text-[11px] font-bold text-white shadow-2xs" style="background-color: ${scoreColor}">
            ${score} 分 · ${scoreText}
          </span>
          <button
            type="button"
            onclick="toggleExecutiveSummary(this)"
            class="text-[10px] text-[#667085] hover:text-[#202833] px-1.5 py-0.5 rounded border border-[#E2E5EA] bg-[#F9FAFB] transition cursor-pointer"
          >
            收起备忘 ▲
          </button>
        </div>
      </div>

      <div id="executive-summary-content" class="space-y-2.5 text-xs">
        <!-- Metric Distribution Bar -->
        <div class="grid grid-cols-4 gap-1.5 text-center select-none font-sans">
          <div class="p-1.5 rounded bg-red-50/70 border border-red-100">
            <div class="text-[10px] text-[#B42318] font-medium">高风险项</div>
            <div class="text-sm font-bold text-[#B42318] font-mono leading-tight">${highFindings.length}</div>
          </div>
          <div class="p-1.5 rounded bg-amber-50/70 border border-amber-100">
            <div class="text-[10px] text-[#9A6700] font-medium">必备缺失</div>
            <div class="text-sm font-bold text-[#9A6700] font-mono leading-tight">${missingFindings.length}</div>
          </div>
          <div class="p-1.5 rounded bg-slate-50 border border-slate-200">
            <div class="text-[10px] text-[#475467] font-medium">偏颇/待核实</div>
            <div class="text-sm font-bold text-[#475467] font-mono leading-tight">${verifyFindings.length}</div>
          </div>
          <div class="p-1.5 rounded bg-emerald-50/70 border border-emerald-100">
            <div class="text-[10px] text-emerald-700 font-medium">合规通过</div>
            <div class="text-sm font-bold text-emerald-700 font-mono leading-tight">${metrics?.passCount ?? 0}</div>
          </div>
        </div>

        ${
          missingHighlightsHtml || highRiskHighlightsHtml
            ? `
        <!-- Top Vulnerabilities Takeaway -->
        <div class="p-2.5 rounded bg-[#F9FAFB] border border-[#E2E5EA] text-[11px] leading-relaxed space-y-2">
          ${
            missingHighlightsHtml
              ? `<div>
            <div class="text-[11px] font-bold text-[#9A6700] mb-1 flex items-center gap-1 select-none">
              <svg class="w-3.5 h-3.5 text-[#9A6700]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              <span>关键必备条款缺失预警：</span>
            </div>
            <ul class="space-y-1 text-[#202833] list-disc list-inside">
              ${missingHighlightsHtml}
            </ul>
          </div>`
              : ''
          }
          ${
            highRiskHighlightsHtml
              ? `<div>
            <div class="text-[11px] font-bold text-[#B42318] mb-1 flex items-center gap-1 select-none">
              <svg class="w-3.5 h-3.5 text-[#B42318]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <span>核心高风险条款诊断：</span>
            </div>
            <ul class="space-y-1 text-[#202833] list-disc list-inside">
              ${highRiskHighlightsHtml}
            </ul>
          </div>`
              : ''
          }
        </div>`
            : ''
        }
      </div>
    </div>
    `;
  }

  private renderFindingCard(f: FindingItemViewModel, index: number): string {
    const isHigh = f.severity === 'HIGH';
    const isMed = f.severity === 'MEDIUM';

    // 1. Severity Badge
    const severityBadge = isHigh
      ? `<span class="px-2 py-0.5 text-[11px] font-semibold rounded bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA]">高风险</span>`
      : isMed
      ? `<span class="px-2 py-0.5 text-[11px] font-semibold rounded bg-[#FFFAEB] text-[#D97706] border border-[#FEDF89]">中风险</span>`
      : `<span class="px-2 py-0.5 text-[11px] font-semibold rounded bg-[#F8F9FA] text-[#475467] border border-[#E4E7EC]">提示</span>`;

    // 2. Issue Type Badge
    let typeBadgeClass = 'bg-slate-100 text-[#475467] border-slate-200';
    if (f.issueType === '信息缺失') {
      typeBadgeClass = 'bg-amber-50 text-[#9A6700] border-amber-200';
    } else if (f.issueType === '表述歧义') {
      typeBadgeClass = 'bg-blue-50 text-blue-800 border-blue-200';
    } else if (f.issueType === '待核实附件') {
      typeBadgeClass = 'bg-purple-50 text-purple-800 border-purple-200';
    } else if (f.issueType === '责任范围变化' || f.issueType === '权责偏颇') {
      typeBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
    }

    const typeBadge = `<span class="px-2 py-0.5 text-[11px] font-medium rounded border ${typeBadgeClass}">${this.escapeHtml(f.issueType)}</span>`;

    // 3. Card Accent Border
    const leftAccentClass = isHigh
      ? 'border-l-4 border-l-[#B42318]'
      : isMed
      ? 'border-l-4 border-l-[#D97706]'
      : 'border-l-4 border-l-[#294766]';

    const copyId = `finding-copy-${index}`;
    const toggleId = `finding-revision-body-${index}`;
    const detailsId = `finding-details-drawer-${index}`;

    const isPendingLocalization =
      !f.factQuote ||
      f.factQuote === '待定位' ||
      f.factQuote.includes('未限定于单一特征句') ||
      f.factQuote.includes('无单一特定引句');

    return `
    <article
      id="${f.id}"
      class="finding-card bg-white rounded-lg border border-[#E2E5EA] p-3.5 shadow-xs transition-all hover:border-[#294766]/50 ${leftAccentClass}"
      data-finding-id="${f.id}"
      data-clause-index="${f.clauseIndex ?? -1}"
      data-severity="${f.severity.toLowerCase()}"
      data-issue-type="${f.issueType}"
      onclick="handleFindingClick('${f.id}', ${f.clauseIndex ?? -1}, event)"
    >
      <!-- Card Header: Title & Tags -->
      <header class="flex items-start justify-between gap-2 pb-2 mb-2 border-b border-[#F0F2F5]">
        <div class="flex-1 min-w-0 pr-2">
          <div class="flex items-center gap-1.5 mb-1 select-none">
            <span class="text-[10px] font-mono text-[#667085]">#${f.findingIndex}</span>
            ${f.clauseNumber ? `<span class="text-[11px] font-semibold text-[#294766]">${this.escapeHtml(f.clauseNumber)}</span>` : ''}
          </div>
          <h3 class="text-sm font-bold text-[#202833] leading-snug">
            ${this.escapeHtml(f.title)}
          </h3>
        </div>
        <div class="flex items-center gap-1.5 shrink-0 select-none">
          ${severityBadge}
          ${typeBadge}
        </div>
      </header>

      <div class="space-y-2 text-xs leading-relaxed text-[#202833]">
        
        <!-- 【核心诊断重点】: Prominent takeaway so reviewer immediately grasps the core issue -->
        <div class="key-takeaway p-2.5 rounded bg-[#F8F9FA] border-l-2 ${isHigh ? 'border-l-[#B42318]' : 'border-l-[#D97706]'}">
          <div class="text-[10px] font-bold ${isHigh ? 'text-[#B42318]' : 'text-[#D97706]'} mb-0.5 flex items-center gap-1 uppercase tracking-wider select-none">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <span>核心风险判断</span>
          </div>
          <p class="text-xs font-normal text-[#202833] leading-relaxed select-text">
            ${this.escapeHtml(f.impact)}
          </p>
        </div>

        <!-- 原文事实与证据 -->
        <div class="fact-section bg-[#F9FAFB] rounded border border-[#E2E5EA] p-2">
          <div class="flex items-center justify-between text-[11px] font-semibold text-[#667085] mb-1 select-none">
            <span class="flex items-center gap-1">
              <svg class="w-3.5 h-3.5 text-[#667085]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
              原文事实依据
            </span>
            ${
              f.clauseIndex !== undefined && f.clauseIndex >= 0
                ? `<button type="button" onclick="scrollToClause(${f.clauseIndex}, '${f.id}', event)" class="text-[11px] text-[#294766] hover:underline flex items-center gap-0.5 cursor-pointer font-medium">
                    <span>定位原文</span>
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                  </button>`
                : ''
            }
          </div>
          ${
            isPendingLocalization
              ? `<div class="text-[#667085] text-[11px] font-normal italic pl-2 border-l-2 border-slate-300 my-0.5 leading-relaxed flex items-center justify-between gap-2">
                  <span>源于本条款整体约定研判（无单一特征句）</span>
                  <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-[#667085] border border-slate-200 shrink-0 font-sans not-italic">整体研判</span>
                </div>`
              : `<blockquote class="text-[#202833] text-[11px] font-normal italic select-text border-l-2 border-[#294766]/40 pl-2 my-0.5 leading-relaxed">
                  "${this.escapeHtml(f.factQuote || '未明确约定')}"
                </blockquote>`
          }
        </div>

        <!-- Collapsible Details: Suggestion, Basis & Revision Text (Default Collapsed for Focus) -->
        <div class="finding-actions-accordion pt-2 border-t border-[#F0F2F5]">
          <div class="flex items-center justify-between">
            <span class="text-[11px] text-[#667085] flex items-center gap-1 font-medium select-none">
              <svg class="w-3.5 h-3.5 text-[#294766]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              <span>修改建议与推荐文本</span>
            </span>
            <button
              type="button"
              onclick="toggleFindingDetails('${detailsId}', this, event)"
              class="text-[11px] text-[#294766] hover:underline flex items-center gap-0.5 font-medium cursor-pointer select-none"
            >
              <span class="toggle-text">展开建议与条款 ▼</span>
            </button>
          </div>

          <!-- Drawer Body (Hidden by default) -->
          <div id="${detailsId}" class="finding-details-drawer hidden mt-2.5 space-y-2.5">
            
            <!-- 修改建议与谈判对策 -->
            ${
              f.suggestion
                ? `
            <div class="suggestion-section bg-[#F8F9FA] rounded border border-[#E2E5EA] p-2.5">
              <div class="text-[11px] font-semibold text-[#202833] mb-1 flex items-center gap-1 select-none">
                <svg class="w-3.5 h-3.5 text-[#294766]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                修改建议与谈判对策
              </div>
              <p class="text-xs text-[#202833] leading-relaxed select-text">
                ${this.escapeHtml(f.suggestion)}
              </p>
            </div>`
                : ''
            }

            <!-- 审查依据与规范指引 -->
            ${
              f.basis
                ? `
            <div class="basis-section">
              <details class="group cursor-pointer select-none">
                <summary class="text-[11px] text-[#667085] hover:text-[#202833] font-medium flex items-center justify-between list-none p-1 rounded hover:bg-slate-50">
                  <span class="flex items-center gap-1">
                    <svg class="w-3.5 h-3.5 text-[#667085]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    查看法律依据与要件标准
                  </span>
                  <span class="text-[10px] text-[#294766] group-open:rotate-180 transition-transform font-mono">▼</span>
                </summary>
                <div class="mt-1 p-2 bg-[#F9FAFB] rounded border border-[#E2E5EA] text-[11px] text-[#667085] font-mono leading-relaxed select-text">
                  ${this.escapeHtml(f.basis)}
                </div>
              </details>
            </div>`
                : ''
            }

            <!-- 建议修改文本 (Suggested Revised Text) with Infallible Pure Text Copy Button -->
            ${
              f.suggestedRevision
                ? `
            <div class="revision-container rounded border border-[#E2E5EA] bg-white overflow-hidden shadow-2xs">
              <div class="px-3 py-1.5 bg-[#F9FAFB] border-b border-[#E2E5EA] flex items-center justify-between gap-2 select-none">
                <div class="flex items-center gap-1.5 truncate">
                  <span class="text-[11px] font-bold text-[#202833]">建议修改文本</span>
                </div>
                
                <div class="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onclick="toggleRevisionExpand('${toggleId}', this, event)"
                    class="text-[10px] text-[#667085] hover:text-[#202833] px-1.5 py-0.5 rounded border border-[#E2E5EA] bg-white transition cursor-pointer"
                  >
                    展开全文
                  </button>
                  <button
                    type="button"
                    onclick="copyPureText('${copyId}', this, event)"
                    class="px-2 py-1 text-[11px] font-medium rounded border border-[#294766] text-[#294766] hover:bg-[#294766] hover:text-white active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                    title="复制纯文本建议修改条款"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    <span>复制文本</span>
                  </button>
                </div>
              </div>

              <div id="${toggleId}" class="revision-body p-3 bg-white text-xs leading-relaxed text-[#202833] font-mono select-all max-h-24 overflow-hidden transition-all duration-200">
                <pre id="${copyId}" class="whitespace-pre-wrap font-sans text-xs text-[#202833] leading-relaxed select-all">${this.escapeHtml(f.suggestedRevision)}</pre>
              </div>
              <div class="px-3 py-1 bg-[#F9FAFB] border-t border-[#F0F2F5] text-[10px] text-[#667085] flex items-center justify-between select-none">
                <span>保留占位符与方括号 [____]</span>
                <span>纯文本一键复制</span>
              </div>
            </div>`
                : ''
            }

          </div>
        </div>

      </div>
    </article>
    `;
  }

  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
