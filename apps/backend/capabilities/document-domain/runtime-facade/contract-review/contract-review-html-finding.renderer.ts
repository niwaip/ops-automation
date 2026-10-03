import type {
  ClauseReviewItem,
  ContractReviewMetrics,
  MissingClauseAlert,
} from './contract-review.types';
import { ReviewIcons } from './contract-review-html-icons.util';

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
          const escapedClauseNum = (c.clauseNumber || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const cleanFindingTitle = (f.title || '审查风控预警')
            .replace(
              escapedClauseNum
                ? new RegExp(`^(第\\s*\\d+\\s*条|${escapedClauseNum})\\s*`, 'i')
                : /^第\s*\d+\s*条\s*/i,
              ''
            )
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

        const escapedClauseNum = (c.clauseNumber || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cleanTitle = (c.title || '条款合规诊断')
          .replace(
            escapedClauseNum
              ? new RegExp(`^(第\\s*\\d+\\s*条|${escapedClauseNum})\\s*`, 'i')
              : /^第\s*\d+\s*条\s*/i,
            ''
          )
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
      const stopWords = /[\s,，、;；|:：/\\_\-()（）[\]【】\d+%“”"‘’'《》]+|是否|不得|应当|必须|超过|高于|低于|约定|排查|检查|若|如果|如|双方|甲方|乙方|开展|合作|合同|协议|条款|内容|规定|软件|系统|项目|业务|风险|存在|可能/g;
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
  renderFindingsWorkbench(
    findings: FindingItemViewModel[],
    metrics?: ContractReviewMetrics,
    commentCardsHtml?: string,
    commentsCount = 0,
    commentDetailWorkspaceHtml?: string,
    commentCreateWorkspaceHtml?: string
  ): string {
    const findingCardsHtml = findings.map((f, idx) => this.renderFindingCard(f, idx)).join('\n');
    const executiveSummaryHtml = this.renderExecutiveSummary(findings, metrics);

    return `
    <section id="findings-workbench" class="findings-desk flex flex-col space-y-3 font-sans">
      
      <!-- 总体合规研判与审查备忘卡片 (Executive Summary & Risk Posture) -->
      ${executiveSummaryHtml}

      <!-- Workbench Subheader & Operations Bar -->
      <div id="workbench-list-header" class="flex items-center justify-between py-2 px-1 border-b border-[#E2E8F0] select-none">
        <div class="flex items-center gap-2" id="workbench-tabs">
          <button
            type="button"
            id="tab-btn-findings"
            onclick="switchWorkbenchMode('findings')"
            class="workbench-tab-btn active flex items-center gap-1.5"
          >
            ${ReviewIcons.riskHigh('w-4 h-4 text-amber-600')}
            <span>审查发现</span>
            <span class="badge-count badge-count-all" id="badge-findings-count">${findings.length}</span>
          </button>
          ${
            commentsCount > 0
              ? `
          <button
            type="button"
            id="tab-btn-comments"
            onclick="switchWorkbenchMode('comments')"
            class="workbench-tab-btn flex items-center gap-1.5"
          >
            ${ReviewIcons.comment('w-4 h-4 text-indigo-600')}
            <span>Word批注</span>
            <span class="badge-count badge-count-comment" id="badge-comments-count">${commentsCount}</span>
          </button>`
              : ''
          }
        </div>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            id="toggle-all-details-btn"
            onclick="toggleAllFindingDetails()"
            class="text-xs text-[#2E5882] hover:text-[#1A2D42] font-semibold px-2.5 py-1 rounded border border-[#D9E1EC] bg-white hover:bg-slate-50 transition cursor-pointer shadow-2xs"
          >
            展开建议
          </button>
        </div>
      </div>

      <!-- Mode-Adaptive Filter Toolbar (跟随当前模式自适应切换) -->
      <div id="workbench-filter-bar" class="p-2.5 rounded-xl bg-white border border-[#E2E8F0] shadow-xs flex items-center justify-between gap-3 text-xs select-none">
        <!-- Findings Filter Controls (审查发现模式专属) -->
        <div id="findings-filter-controls" class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-slate-500 font-semibold shrink-0">筛选:</span>
          <button type="button" id="filter-sev-all" onclick="setSeverityFilter('all')" class="px-2.5 py-1 rounded-md text-xs font-semibold sev-filter-active transition cursor-pointer">全部</button>
          <button type="button" id="filter-sev-high" onclick="setSeverityFilter('high')" class="px-2.5 py-1 rounded-md text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition cursor-pointer">高风险</button>
          <button type="button" id="filter-sev-medium" onclick="setSeverityFilter('medium')" class="px-2.5 py-1 rounded-md text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition cursor-pointer">中风险</button>
          
          <select id="select-filter-type" onchange="setIssueTypeFilter(this.value)" class="text-xs px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="all">全部类型</option>
            <option value="缺失">必备缺失</option>
            <option value="歧义">表述歧义</option>
            <option value="偏颇">权责偏颇</option>
          </select>
        </div>

        <!-- Comments Filter Controls (Word批注模式专属) -->
        <div id="comments-filter-controls" class="hidden flex items-center gap-2 flex-wrap">
          <span class="text-xs text-slate-500 font-semibold shrink-0">状态:</span>
          <button type="button" id="filter-comment-status-all" onclick="setCommentStatusFilter('all')" class="px-2.5 py-1 rounded-md text-xs font-semibold bg-[#2E5882] text-white transition cursor-pointer">全部</button>
          <button type="button" id="filter-comment-status-pending" onclick="setCommentStatusFilter('pending')" class="px-2.5 py-1 rounded-md text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer">待处理</button>
          <button type="button" id="filter-comment-status-resolved" onclick="setCommentStatusFilter('resolved')" class="px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition cursor-pointer">已解决</button>
        </div>

        <!-- Search Input -->
        <div class="relative shrink-0 w-36 sm:w-44">
          <input
            type="text"
            id="filter-search-input"
            oninput="handleKeywordSearch(this.value)"
            placeholder="搜索关键字..."
            class="w-full text-xs px-2.5 py-1 pl-7 rounded-md border border-slate-200 bg-slate-50 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2E5882] transition"
          />
          <svg class="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
      </div>

      <!-- Scrollable Findings & Comments Cards Stream -->
      <div id="findings-stream" class="space-y-3">
        <div id="findings-cards-container" class="space-y-3">
          ${
            findings.length === 0
              ? `
            <div class="p-8 text-center bg-white rounded-lg border border-[#D9E1EC] text-sm text-[#64748B]">
              <svg class="w-8 h-8 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              合同未检出实质性法律风险或必备要件缺失，条款形式与实质合规规范。
            </div>
          `
              : findingCardsHtml
          }
        </div>
        ${
          commentCardsHtml
            ? `
        <div id="comments-stream-container" class="space-y-3">
          <div class="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
            <span class="font-medium flex items-center gap-1.5">${ReviewIcons.commentQuote('w-4 h-4 text-amber-700')}<span>Word 批注清单（共 ${commentsCount} 条批注）</span></span>
            <span class="text-[11px] text-amber-700">点击卡片可查看详情并在正文中定位</span>
          </div>
          ${commentCardsHtml}
        </div>`
            : ''
        }
      </div>

      <!-- Dedicated Comment Detail & In-Place Reply Workspace (Active on Comment Click) -->
      ${commentDetailWorkspaceHtml || ''}

      <!-- Dedicated Comment Create Workspace (Active on Text Selection Add Comment) -->
      ${commentCreateWorkspaceHtml || ''}

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
    <div id="executive-summary-card" class="bg-white rounded-lg border border-[#D9E1EC] p-3.5 shadow-card">
      <div class="flex items-center justify-between pb-2 mb-2 border-b border-[#E2E8F0] select-none">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-[#2E5882]"></div>
          <h2 class="text-xs font-bold text-[#1E293B] uppercase tracking-wider">审查概览</h2>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="px-2 py-0.5 rounded text-[11px] font-bold text-white shadow-2xs" style="background-color: ${scoreColor}">
            ${score} 分 · ${scoreText}
          </span>
          <button
            type="button"
            onclick="toggleExecutiveSummary(this)"
            class="text-[10px] text-[#64748B] hover:text-[#1E293B] px-1.5 py-0.5 rounded border border-[#D9E1EC] bg-[#F4F6F9] transition cursor-pointer"
          >
            收起概览 ▲
          </button>
        </div>
      </div>

      <div id="executive-summary-content" class="space-y-2.5 text-xs">
        <!-- Metric Distribution Bar (Executive 4-Column KPI Cards) -->
        <div class="grid grid-cols-4 gap-2 text-left select-none font-sans">
          <div class="kpi-metric-tile kpi-card-high cursor-pointer" onclick="setSeverityFilter('high')" title="点击筛选高风险审查项">
            <div class="flex items-center justify-between">
              <span class="kpi-icon-pill bg-red-100 text-red-700 flex items-center gap-1">
                ${ReviewIcons.riskHigh('w-3.5 h-3.5 text-red-700')}
                <span>高风险</span>
              </span>
            </div>
            <div class="flex items-baseline gap-1 mt-1.5">
              <span class="text-2xl font-black text-[#991B1B] font-mono leading-none">${highFindings.length}</span>
              <span class="text-[10px] text-red-600/80 font-sans font-medium">项</span>
            </div>
          </div>

          <div class="kpi-metric-tile kpi-card-missing cursor-pointer" onclick="setIssueTypeFilter('缺失')" title="点击筛选必备条款缺失项">
            <div class="flex items-center justify-between">
              <span class="kpi-icon-pill bg-amber-100 text-amber-800 flex items-center gap-1">
                ${ReviewIcons.riskMissing('w-3.5 h-3.5 text-amber-800')}
                <span>必备缺失</span>
              </span>
            </div>
            <div class="flex items-baseline gap-1 mt-1.5">
              <span class="text-2xl font-black text-[#92400E] font-mono leading-none">${missingFindings.length}</span>
              <span class="text-[10px] text-amber-700/80 font-sans font-medium">项</span>
            </div>
          </div>

          <div class="kpi-metric-tile kpi-card-verify cursor-pointer" onclick="setIssueTypeFilter('歧义')" title="点击筛选偏颇待核实项">
            <div class="flex items-center justify-between">
              <span class="kpi-icon-pill bg-blue-100 text-blue-800 flex items-center gap-1">
                ${ReviewIcons.riskVerify('w-3.5 h-3.5 text-blue-800')}
                <span>偏颇待核</span>
              </span>
            </div>
            <div class="flex items-baseline gap-1 mt-1.5">
              <span class="text-2xl font-black text-[#1E40AF] font-mono leading-none">${verifyFindings.length}</span>
              <span class="text-[10px] text-blue-700/80 font-sans font-medium">项</span>
            </div>
          </div>

          <div class="kpi-metric-tile kpi-card-pass cursor-pointer" onclick="resetAllFilters()" title="重置筛选查看全部">
            <div class="flex items-center justify-between">
              <span class="kpi-icon-pill bg-emerald-100 text-emerald-800 flex items-center gap-1">
                ${ReviewIcons.checkPass('w-3.5 h-3.5 text-emerald-800')}
                <span>合规通过</span>
              </span>
            </div>
            <div class="flex items-baseline gap-1 mt-1.5">
              <span class="text-2xl font-black text-[#166534] font-mono leading-none">${metrics?.passCount ?? 0}</span>
              <span class="text-[10px] text-emerald-700/80 font-sans font-medium">款</span>
            </div>
          </div>
        </div>

        <!-- Comprehensive Review Takeaway & Highlights -->
        <div class="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#334155] leading-relaxed space-y-2">
          <div class="flex items-center justify-between border-b border-slate-200/70 pb-1.5">
            <div class="flex items-center gap-1.5 font-bold text-slate-800">
              ${ReviewIcons.fileSearch('w-4 h-4 text-[#2E5882]')}
              <span>审查综述</span>
            </div>
            <span class="text-[11px] text-slate-500 font-mono font-medium">共检出 ${findings.length} 项诊断</span>
          </div>
          <div class="text-slate-700 text-xs leading-relaxed select-text font-normal break-words">
            ${
              highFindings.length > 0 || missingFindings.length > 0
                ? `本次重点排查检出 <strong>${highFindings.length} 项高风险</strong> 与 <strong>${missingFindings.length} 项必备要件缺失</strong>。重点关注核心权责平衡、违约赔偿上限及救济途径，建议依据修改建议完成审批确认或在底稿中批注协商。`
                : '合同条款整体齐备规范，形式与实质合规性良好，未检出重大法律漏洞。'
            }
          </div>
          ${
            (missingHighlightsHtml || highRiskHighlightsHtml)
              ? `
          <div class="pt-2 border-t border-slate-200/70 text-[11px] space-y-1 text-slate-600">
            <div class="font-semibold text-slate-700">重点关注要件：</div>
            <ul class="list-disc pl-4 space-y-1 select-text leading-relaxed">
              ${missingHighlightsHtml}
              ${highRiskHighlightsHtml}
            </ul>
          </div>`
              : ''
          }
        </div>
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
      ? 'finding-card-high'
      : isMed
      ? 'finding-card-medium'
      : 'finding-card-low';

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
      class="finding-card bg-white rounded-lg border border-[#D9E1EC] p-3.5 sm:p-4 shadow-card transition-all hover:border-[#2E5882]/70 hover:shadow-card-hover ${leftAccentClass}"
      data-finding-id="${f.id}"
      data-clause-index="${f.clauseIndex ?? -1}"
      data-severity="${f.severity.toLowerCase()}"
      data-issue-type="${f.issueType}"
      onclick="handleFindingClick('${f.id}', ${f.clauseIndex ?? -1}, event)"
    >
      <!-- Card Header: Title & Tags -->
      <header class="pb-2.5 mb-2.5 border-b border-[#E2E8F0]">
        <div class="flex items-center justify-between gap-2 mb-1.5 select-none">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="px-1.5 py-0.5 rounded text-[11px] font-bold font-mono bg-slate-100 text-slate-700 border border-slate-200">#${f.findingIndex}</span>
            ${f.clauseNumber ? `<span class="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-[#2E5882] border border-blue-100 truncate">${this.escapeHtml(f.clauseNumber)}</span>` : ''}
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            ${severityBadge}
            ${typeBadge}
            <span class="finding-status-badge px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 mode-review-only">待处理</span>
          </div>
        </div>
        <h3 class="text-sm sm:text-[15px] font-bold text-[#1E293B] leading-[1.5] select-text">
          ${this.escapeHtml(f.title)}
        </h3>
      </header>

      <div class="space-y-2.5 text-sm leading-[1.7] text-[#1E293B]">
        
        <!-- 【核心诊断重点】: Prominent takeaway so reviewer immediately grasps the core issue -->
        <div class="key-takeaway p-3 rounded-lg ${isHigh ? 'bg-rose-50/70 border border-rose-200/80' : isMed ? 'bg-amber-50/70 border border-amber-200/80' : 'bg-blue-50/60 border border-blue-200/80'}">
          <div class="text-[11px] font-bold ${isHigh ? 'text-rose-800' : isMed ? 'text-amber-800' : 'text-blue-800'} mb-1.5 flex items-center gap-1.5 select-none">
            ${isHigh ? ReviewIcons.riskHigh('w-4 h-4 text-rose-600') : ReviewIcons.riskMedium('w-4 h-4 text-amber-600')}
            <span>核心风险判断</span>
          </div>
          <p class="text-xs sm:text-[13px] text-slate-800 leading-[1.7] select-text font-normal">
            ${this.escapeHtml(f.impact)}
          </p>
        </div>

        <!-- 原文事实与证据 -->
        <div class="fact-section bg-slate-50/80 rounded-lg border border-slate-200/90 p-3">
          <div class="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5 select-none">
            <span class="flex items-center gap-1.5">
              ${ReviewIcons.commentQuote('w-3.5 h-3.5 text-slate-500')}
              <span>原文事实依据</span>
            </span>
            ${
              f.clauseIndex !== undefined && f.clauseIndex >= 0
                ? `<button type="button" onclick="scrollToClause(${f.clauseIndex}, '${f.id}', event)" class="text-xs text-[#2E5882] hover:underline flex items-center gap-0.5 cursor-pointer font-semibold">
                    <span>定位原文</span>
                    ${ReviewIcons.locate('w-3 h-3 text-[#2E5882]')}
                  </button>`
                : ''
            }
          </div>
          ${
            isPendingLocalization
              ? `<div class="text-slate-500 text-xs font-normal italic pl-2.5 border-l-2 border-slate-300 my-1 leading-[1.7] flex items-center justify-between gap-2">
                  <span>源于本条款整体约定研判（无单一特征句）</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-600 border border-slate-300 shrink-0 font-sans not-italic">整体研判</span>
                </div>`
              : `<blockquote class="text-slate-800 text-xs sm:text-[13px] font-normal italic select-text border-l-2 border-[#2E5882] pl-2.5 my-1 leading-[1.7]">
                  "${this.escapeHtml(f.factQuote || '未明确约定')}"
                </blockquote>`
          }
        </div>

        <!-- Collapsible Details: Suggestion, Basis & Revision Text (Default Collapsed for Focus) -->
        <div class="finding-actions-accordion pt-2 border-t border-slate-200">
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-600 flex items-center gap-1.5 font-medium select-none">
              ${ReviewIcons.edit('w-3.5 h-3.5 text-[#2E5882]')}
              <span>修改建议与推荐文本</span>
            </span>
            <button
              type="button"
              onclick="toggleFindingDetails('${detailsId}', this, event)"
              class="text-xs text-[#2E5882] hover:underline flex items-center gap-0.5 font-semibold cursor-pointer select-none"
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
            <div class="suggestion-section bg-emerald-50/60 rounded-lg border border-emerald-200/80 p-3">
              <div class="text-xs font-bold text-emerald-900 mb-1.5 flex items-center gap-1.5 select-none">
                ${ReviewIcons.resolve('w-3.5 h-3.5 text-emerald-700')}
                <span>修改建议与谈判对策</span>
              </div>
              <p class="text-xs sm:text-[13px] text-slate-800 leading-[1.7] select-text font-normal">
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
                <summary class="text-xs text-slate-600 hover:text-slate-900 font-medium flex items-center justify-between list-none p-1 rounded hover:bg-slate-50">
                  <span class="flex items-center gap-1.5">
                    ${ReviewIcons.fileSearch('w-3.5 h-3.5 text-slate-500')}
                    <span>查看法律依据与要件标准</span>
                  </span>
                  <span class="text-[10px] text-[#2E5882] group-open:rotate-180 transition-transform font-mono">▼</span>
                </summary>
                <div class="mt-1 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 font-mono leading-[1.7] select-text">
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
            <div class="revision-container rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs">
              <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 select-none">
                <div class="flex items-center gap-1.5 truncate">
                  <span class="text-xs font-bold text-slate-800">建议修改文本</span>
                </div>
                
                <div class="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onclick="toggleRevisionExpand('${toggleId}', this, event)"
                    class="text-[11px] text-slate-600 hover:text-slate-900 px-2 py-0.5 rounded border border-slate-300 bg-white transition cursor-pointer"
                  >
                    展开全文
                  </button>
                  <button
                    type="button"
                    onclick="copyPureText('${copyId}', this, event)"
                    class="px-2.5 py-1 text-xs font-semibold rounded border border-[#294766] text-[#294766] hover:bg-[#294766] hover:text-white active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                    title="复制纯文本建议修改条款"
                  >
                    ${ReviewIcons.copy('w-3 h-3')}
                    <span>复制文本</span>
                  </button>
                </div>
              </div>

              <div id="${toggleId}" class="revision-body p-3 bg-white text-xs leading-[1.7] text-slate-800 font-mono select-all max-h-28 overflow-hidden transition-all duration-200">
                <pre id="${copyId}" class="suggested-revision-text whitespace-pre-wrap font-sans text-xs sm:text-[13px] text-slate-800 leading-[1.7] select-all">${this.escapeHtml(f.suggestedRevision)}</pre>
              </div>
              <div class="px-3 py-1 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 flex items-center justify-between select-none">
                <span>保留占位符与方括号 [____]</span>
                <span>纯文本一键复制</span>
              </div>
            </div>`
                : ''
            }

          </div>
        </div>

        <!-- Action Bar: 3 Core Actions (定位原文, 写入审批, 写入Word批注) + In-Session Status -->
        <div class="finding-actions-row flex items-center justify-between gap-2 pt-2.5 border-t border-[#E2E8F0] select-none">
          <div class="flex items-center gap-1.5 flex-wrap">
            <!-- 1. 定位原文 -->
            <button
              type="button"
              class="action-btn action-btn-secondary"
              onclick="scrollToClause(${f.clauseIndex ?? 0}, '${f.id}', event)"
              title="在左侧底稿区定位高亮该条款"
            >
              ${ReviewIcons.locate('w-3.5 h-3.5 text-[#2E5882]')}
              <span>定位原文</span>
            </button>

            <!-- 2. 写入审批 (默认用建议，可编辑，确认后即标记已确认) -->
            <button
              type="button"
              id="btn-approval-${f.id}"
              class="action-btn action-btn-secondary text-[#2E5882] hover:bg-blue-50 border-blue-200 mode-review-only"
              onclick="toggleApprovalOpinionBox('${f.id}', event)"
              title="编辑建议并写入主审批意见"
            >
              ${ReviewIcons.pencilSquare('w-3.5 h-3.5 text-[#2E5882]')}
              <span id="btn-approval-text-${f.id}">写入审批</span>
            </button>

            <!-- 3. 写入Word批注 (一键将AI建议转为Word批注并定位) -->
            <button
              type="button"
              class="action-btn action-btn-primary bg-[#2E5882] hover:bg-[#1E3A5F] text-white mode-review-only"
              onclick="convertFindingToComment('${f.id}', event)"
              title="一键在对应条款草拟并追加 Word 批注"
            >
              ${ReviewIcons.comment('w-3.5 h-3.5 text-white')}
              <span>写入Word批注</span>
            </button>
          </div>

          <!-- Secondary In-Session Status (标记线下核实 / 忽略) -->
          <div class="flex items-center gap-1 shrink-0 mode-review-only">
            <button
              type="button"
              id="btn-resolve-${f.id}"
              class="btn-resolve-action text-[11px] text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-0.5 rounded border border-slate-200 bg-white transition cursor-pointer flex items-center gap-1"
              onclick="resolveFinding('${f.id}', event)"
              title="标记该风险项已在线下核实排除"
            >
              <span id="btn-resolve-text-${f.id}">标记核实</span>
            </button>
            <button
              type="button"
              id="btn-ignore-${f.id}"
              class="text-[11px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 px-1.5 py-0.5 rounded border border-transparent transition cursor-pointer"
              onclick="promptIgnoreFinding('${f.id}', event)"
              title="忽略该风险项"
            >
              <span>忽略</span>
            </button>
          </div>
        </div>

        <!-- Inline Approval Opinion Editor Box (Collapsible) -->
        <div id="approval-box-${f.id}" class="approval-opinion-box hidden mt-2.5 pt-2.5 border-t border-blue-100 bg-blue-50/60 rounded-md p-2.5 space-y-2 select-text mode-review-only">
          <div class="flex items-center justify-between text-xs select-none">
            <span class="font-bold text-blue-900 flex items-center gap-1">
              ${ReviewIcons.pencilSquare('w-3.5 h-3.5 text-blue-700')}
              <span>拟定审批处理意见（确认后将计入主流程审批意见并标记已确认）</span>
            </span>
            <button type="button" onclick="cancelApprovalEdit('${f.id}', event)" class="text-slate-400 hover:text-slate-600 text-[11px] cursor-pointer">
              收起 ✕
            </button>
          </div>
          <div>
            <textarea
              id="approval-text-${f.id}"
              rows="3"
              class="w-full text-xs p-2 rounded border border-blue-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed resize-none"
              placeholder="请输入针对此审查项的审批意见或要求..."
            >${this.escapeHtml(f.suggestedRevision || f.suggestion || f.impact || '')}</textarea>
          </div>
          <div class="flex items-center justify-between pt-1 border-t border-blue-100/80 text-[11px] select-none">
            <span class="text-slate-500 text-[10px]">默认填入推荐修改条款，支持编辑润色</span>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                onclick="clearApprovalOpinion('${f.id}', event)"
                class="px-2 py-0.5 rounded text-slate-500 hover:text-red-600 text-[11px] cursor-pointer"
                title="清除审批意见并恢复为待处理"
              >
                重置
              </button>
              <button
                type="button"
                onclick="confirmApprovalOpinion('${f.id}', event)"
                class="px-3 py-1 rounded bg-[#2E5882] hover:bg-[#1E3A5F] text-white font-semibold text-xs cursor-pointer shadow-2xs transition"
              >
                确认写入审批
              </button>
            </div>
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
