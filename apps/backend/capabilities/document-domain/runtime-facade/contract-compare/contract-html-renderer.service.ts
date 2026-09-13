import { Injectable } from '@nestjs/common';
import type { AlignedClausePair, ContractCompareMetrics } from './contract-compare.types';
import { ICONS } from './contract-report-icons.util';
import { formatContractDiffHtml } from './contract-markdown-formatter.util';

export interface RenderReportInput {
  fileNameA: string;
  fileNameB: string;
  metrics: ContractCompareMetrics;
  alignedPairs: AlignedClausePair[];
}

@Injectable()
export class ContractHtmlRendererService {
  /**
   * Escape HTML special characters
   */
  public escapeHtml(text: string): string {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Render a fully self-contained, interactive HTML comparison report adhering to legal review visual hierarchy.
   */
  public renderHtmlReport(input: RenderReportInput): string {
    const { fileNameA, fileNameB, metrics, alignedPairs } = input;
    const safeFileNameA = this.escapeHtml(fileNameA);
    const safeFileNameB = this.escapeHtml(fileNameB);

    // 1. Resolve key change text for compact change table
    const resolveKeyChange = (pair: AlignedClausePair): string => {
      if (pair.aiInsight?.keyChange) return pair.aiInsight.keyChange;
      if (pair.status === 'DELETED') return '原条款被删除';
      if (pair.status === 'ADDED') return '新增该条款内容';
      if (pair.status === 'MODIFIED') {
        const summary = pair.aiInsight?.summary || '';
        const matchByTo = summary.match(/（由\s*([^）]+?)\s*至\s*([^）]+?)）/);
        if (matchByTo) return `变更：${matchByTo[1]} → ${matchByTo[2]}`;
        return pair.aiInsight?.shortSummary || '条款文本微调';
      }
      return '条款内容一致';
    };

    // 2. TOC Sidebar HTML
    const tocOverviewHtml = `
      <a href="#summary" class="flex items-center justify-between p-2 rounded-md text-[#315A7D] bg-slate-50 hover:bg-slate-100 font-semibold transition text-xs mb-2 border border-[#E2E8F0]">
        <span class="truncate pr-1 flex items-center space-x-1.5">
          ${ICONS.document}
          <span>比对结果概览</span>
        </span>
        <span class="px-1.5 py-0.5 rounded text-[10px] bg-slate-200/80 text-slate-700 font-medium">${metrics.totalClauses} 项</span>
      </a>
    `;

    const tocHtml = tocOverviewHtml + alignedPairs
      .map((pair, idx) => {
        const rawTitle = pair.targetClause?.title || pair.sourceClause?.title || `条款 ${idx + 1}`;
        const rawNum = pair.targetClause?.clauseNumber || pair.sourceClause?.clauseNumber || '';
        const title = this.escapeHtml(rawTitle);
        const num = this.escapeHtml(rawNum);
        let badge = '<span class="text-slate-400 text-[10px]">未变</span>';

        if (pair.status === 'MODIFIED') {
          const isHigh = pair.aiInsight?.riskLevel === 'HIGH';
          badge = isHigh
            ? '<span class="px-1.5 py-0.2 rounded text-[10px] bg-[#FEF2F2] text-[#991B1B] border border-[#FCA5A5] font-medium">修改(高危)</span>'
            : '<span class="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-[#475569] border border-slate-200">修改</span>';
        } else if (pair.status === 'ADDED') {
          badge = '<span class="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-[#475569] border border-slate-200">新增</span>';
        } else if (pair.status === 'DELETED') {
          badge = '<span class="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-[#475569] border border-slate-200">删除</span>';
        }

        const riskLevel = pair.aiInsight?.riskLevel || 'NONE';
        const riskDataAttr = riskLevel.toLowerCase();

        return `
          <a href="#sec-${idx + 1}" class="toc-link flex items-center justify-between p-1.5 rounded-md text-[#243041] hover:bg-slate-100 hover:text-[#315A7D] transition text-xs" data-status="${pair.status.toLowerCase()}" data-risk="${riskDataAttr}">
            <span class="truncate pr-2">${num ? `${num} ` : ''}${title}</span>
            ${badge}
          </a>
        `;
      })
      .join('\n');

    // 3. Key Risk Clauses - Sorted by risk descending (HIGH first, then MEDIUM), then clause order
    const riskPairs = alignedPairs
      .filter((p) => p.aiInsight && (p.aiInsight.riskLevel === 'HIGH' || p.aiInsight.riskLevel === 'MEDIUM'))
      .sort((a, b) => {
        const rankA = a.aiInsight?.riskLevel === 'HIGH' ? 1 : 2;
        const rankB = b.aiInsight?.riskLevel === 'HIGH' ? 1 : 2;
        if (rankA !== rankB) return rankA - rankB;
        return alignedPairs.indexOf(a) - alignedPairs.indexOf(b);
      });

    const keyRiskTableHtml = riskPairs.length > 0
      ? `
        <div class="border-t border-[#E2E8F0] pt-3">
          <div class="text-xs font-semibold text-[#243041] mb-2 flex items-center justify-between">
            <span class="flex items-center space-x-1.5">
              ${ICONS.searchList}
              <span>重点关注条款与变更清单</span>
            </span>
            <span class="text-[11px] text-slate-400 font-normal">默认按风险等级排序 · 点击行可快速定位条款正文</span>
          </div>
          <div class="overflow-x-auto border border-[#E2E8F0] rounded-md">
            <table class="w-full text-xs text-left text-[#243041] border-collapse">
              <thead class="bg-[#F8FAFC] text-slate-600 border-b border-[#E2E8F0] font-medium text-[11px]">
                <tr>
                  <th class="py-2 px-3 w-[28%]">条款</th>
                  <th class="py-2 px-3 w-[52%]">关键变化</th>
                  <th class="py-2 px-3 w-[12%] text-center">关注程度</th>
                  <th class="py-2 px-3 w-[8%] text-right">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#E2E8F0] bg-white">
                ${riskPairs
                  .map((pair) => {
                    const idx = alignedPairs.indexOf(pair);
                    const rawTitle = pair.targetClause?.title || pair.sourceClause?.title || pair.targetClause?.clauseNumber || `条款 ${idx + 1}`;
                    const rawNum = pair.targetClause?.clauseNumber || pair.sourceClause?.clauseNumber || '';
                    const title = this.escapeHtml(rawTitle);
                    const num = this.escapeHtml(rawNum);
                    const isHigh = pair.aiInsight?.riskLevel === 'HIGH';
                    const riskBadge = isHigh
                      ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FEF2F2] text-[#991B1B] border border-[#FCA5A5]">高风险</span>'
                      : '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FFFBEB] text-[#B45309] border border-[#FCD34D]">中风险</span>';

                    return `
                      <tr onclick="jumpToClause('sec-${idx + 1}')" class="hover:bg-slate-50/80 cursor-pointer transition group">
                        <td class="py-2.5 px-3 font-semibold text-[#243041] group-hover:text-[#315A7D]">
                          ${num ? `${num}：` : ''}${title}
                        </td>
                        <td class="py-2.5 px-3 text-slate-700 leading-normal">
                          ${this.escapeHtml(resolveKeyChange(pair))}
                        </td>
                        <td class="py-2.5 px-3 text-center">
                          ${riskBadge}
                        </td>
                        <td class="py-2.5 px-3 text-right">
                          <span class="text-[#315A7D] hover:underline font-medium inline-flex items-center space-x-0.5">
                            <span>查看</span>
                            ${ICONS.chevronRight}
                          </span>
                        </td>
                      </tr>
                    `;
                  })
                  .join('\n')}
              </tbody>
            </table>
          </div>
        </div>
      `
      : '';

    // 4. Compact Executive Summary Bar
    const sourceCountStr = metrics.sourceClauseCount ? `基准版 ${metrics.sourceClauseCount} 条` : '';
    const targetCountStr = metrics.targetClauseCount ? `修订版 ${metrics.targetClauseCount} 条` : '';
    const scopeSubtitle = sourceCountStr && targetCountStr
      ? `（对齐后比对项数：共 ${metrics.totalClauses} 项条款 · ${sourceCountStr} / ${targetCountStr}）`
      : `（对齐后比对项数：共 ${metrics.totalClauses} 项条款）`;

    const riskBadgeHeader = metrics.highRiskCount > 0
      ? `<span class="inline-flex items-center space-x-1 px-2.5 py-1 bg-[#FEF2F2] text-[#991B1B] border border-[#FCA5A5] rounded-md text-xs font-semibold">${ICONS.warning}<span>${metrics.highRiskCount} 项高风险变更，建议重点复核</span></span>`
      : metrics.mediumRiskCount > 0
      ? `<span class="inline-flex items-center space-x-1 px-2.5 py-1 bg-[#FFFBEB] text-[#B45309] border border-[#FCD34D] rounded-md text-xs font-semibold">${ICONS.info}<span>${metrics.mediumRiskCount} 项中风险变更</span></span>`
      : `<span class="inline-flex items-center space-x-1 px-2.5 py-1 bg-[#F0FDF4] text-[#166534] border border-[#86EFAC] rounded-md text-xs font-medium">${ICONS.checkCircle}<span>未发现高/中风险变更</span></span>`;

    const truncationBannerHtml = metrics.isTruncated
      ? `
        <div class="bg-[#FFFBEB] border-l-4 border-[#F59E0B] p-3 rounded-r-md text-xs text-[#B45309] flex items-start space-x-2.5">
          <span class="text-base shrink-0">⚠️</span>
          <div class="space-y-0.5">
            <p class="font-bold text-[#92400E]">文档部分截断审查警示 (Partial Review Warning)</p>
            <p class="text-slate-700">该比对文档超过单次处理页数或字符上限，系统仅对比对了前序内容（已提取部分）。后续未被提取的章节未纳入本次比对及风险审查范围，请留意潜在未覆盖风险。</p>
            ${metrics.warnings && metrics.warnings.length > 0 ? `<ul class="list-disc list-inside text-[11px] text-slate-600 mt-1">${metrics.warnings.map((w) => `<li>${this.escapeHtml(w)}</li>`).join('')}</ul>` : ''}
          </div>
        </div>
      `
      : '';

    const executiveSummaryHtml = `
      <section id="summary" class="bg-white border border-[#E2E8F0] rounded-lg p-3.5 space-y-3">
        ${truncationBannerHtml}
        <div class="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
          <div class="flex items-center space-x-2">
            <span class="text-[#315A7D]">${ICONS.scales}</span>
            <span class="text-sm font-bold text-[#243041]">比对结果概览</span>
            <span class="text-xs text-slate-500 font-normal">${scopeSubtitle}</span>
          </div>
          <div>
            ${riskBadgeHeader}
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between text-xs py-2.5 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md gap-y-2">
          <div class="flex flex-wrap items-center space-x-2 text-slate-600">
            <span>共比对 <strong class="text-[#243041] font-semibold">${metrics.totalClauses}</strong> 项条款</span>
            <span class="text-slate-300">|</span>
            <span>修改 <strong class="text-[#243041] font-semibold">${metrics.modifiedCount}</strong></span>
            <span class="text-slate-300">·</span>
            <span>新增 <strong class="text-[#243041] font-semibold">${metrics.addedCount}</strong></span>
            <span class="text-slate-300">·</span>
            <span>删除 <strong class="text-[#243041] font-semibold">${metrics.deletedCount}</strong></span>
            <span class="text-slate-300">·</span>
            <span>未变更 <strong class="text-[#64748B] font-semibold">${metrics.unchangedCount}</strong></span>
          </div>
          <div class="flex items-center space-x-1.5 text-xs">
            <span class="text-slate-500">重点关注：</span>
            <span class="font-semibold ${metrics.highRiskCount > 0 ? 'text-[#991B1B]' : 'text-[#243041]'}">高风险 ${metrics.highRiskCount} 项</span>
            <span class="text-slate-300">、</span>
            <span class="font-semibold ${metrics.mediumRiskCount > 0 ? 'text-[#B45309]' : 'text-[#243041]'}">中风险 ${metrics.mediumRiskCount} 项</span>
          </div>
        </div>

        ${keyRiskTableHtml}
      </section>
    `;

    // 5. Clause Cards HTML
    const clausesHtml = alignedPairs
      .map((pair, idx) => {
        const rawTitle = pair.targetClause?.title || pair.sourceClause?.title || `条款 ${idx + 1}`;
        const rawNum = pair.targetClause?.clauseNumber || pair.sourceClause?.clauseNumber || '';
        const title = this.escapeHtml(rawTitle);
        const num = this.escapeHtml(rawNum);
        const riskLevel = pair.aiInsight?.riskLevel || 'NONE';
        const isHigh = riskLevel === 'HIGH';
        const isMedium = riskLevel === 'MEDIUM';
        const riskDataAttr = riskLevel.toLowerCase();

        // Status badge
        let statusTag = '<span class="px-2 py-0.5 text-slate-400 border border-slate-200 rounded text-xs">无变更</span>';
        if (pair.status === 'MODIFIED') {
          statusTag = '<span class="px-2 py-0.5 bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1] rounded text-xs font-medium">已修改</span>';
        } else if (pair.status === 'ADDED') {
          statusTag = '<span class="px-2 py-0.5 bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1] rounded text-xs font-medium">新增条款</span>';
        } else if (pair.status === 'DELETED') {
          statusTag = '<span class="px-2 py-0.5 bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1] rounded text-xs font-medium">删除条款</span>';
        }

        // Risk badge
        let riskBadge = '';
        if (isHigh) {
          riskBadge = '<span class="px-2 py-0.5 bg-[#FEF2F2] text-[#991B1B] border border-[#FCA5A5] rounded text-xs font-semibold">高风险</span>';
        } else if (isMedium) {
          riskBadge = '<span class="px-2 py-0.5 bg-[#FFFBEB] text-[#B45309] border border-[#FCD34D] rounded text-xs font-semibold">中风险</span>';
        }

        // Clause Insight: omit boilerplate "未见显著恶化" for normal low risk
        const hasSpecificInsight =
          pair.aiInsight &&
          pair.status !== 'UNCHANGED' &&
          (isHigh || isMedium || (pair.aiInsight.summary && !pair.aiInsight.summary.includes('整体权责结构未见显著恶化') && !pair.aiInsight.summary.includes('未发生变更')));

        let aiCard = '';
        if (hasSpecificInsight && pair.aiInsight) {
          const rawShortText = pair.aiInsight.shortSummary || pair.aiInsight.summary;
          const shortText = this.escapeHtml(rawShortText);
          const hasDetails = Boolean(pair.aiInsight.legalAdvice || pair.aiInsight.summary.length > 25);
          const safeSummary = this.escapeHtml(pair.aiInsight.summary);
          const safeLegalAdvice = pair.aiInsight.legalAdvice ? this.escapeHtml(pair.aiInsight.legalAdvice) : '';

          aiCard = `
            <div class="mx-3 mt-2.5 p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md text-xs text-[#243041]">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2">
                  <span class="text-xs font-semibold text-slate-500 shrink-0 flex items-center space-x-1">
                    ${ICONS.insight}
                    <span>变化摘要</span>
                  </span>
                  <span class="text-[#243041] font-medium text-xs leading-normal">${shortText}</span>
                </div>
                ${hasDetails ? `
                  <button type="button" class="text-[#315A7D] hover:underline font-medium text-xs shrink-0 ml-2" onclick="toggleAdvice('adv-sec-${idx + 1}', event)">
                    <span id="adv-label-sec-${idx + 1}">${isHigh ? '收起影响与建议' : '影响与建议 展开查看'}</span>
                  </button>
                ` : ''}
              </div>
              ${hasDetails ? `
                <div id="adv-sec-${idx + 1}" class="${isHigh ? '' : 'hidden'} mt-2 pt-2 border-t border-[#E2E8F0] space-y-1.5 text-xs">
                  <p><strong class="font-semibold text-slate-700">影响分析：</strong><span class="text-slate-800 leading-normal">${safeSummary}</span></p>
                  ${safeLegalAdvice ? `<p><strong class="font-semibold text-[#315A7D]">法务建议：</strong><span class="text-[14px] text-[#243041] font-normal leading-relaxed">${safeLegalAdvice}</span></p>` : ''}
                </div>
              ` : ''}
            </div>
          `;
        }

        const rawSource = pair.sourceHtml || (pair.sourceClause ? this.escapeHtml(pair.sourceClause.content).replace(/\n/g, '<br>') : '');
        const rawTarget = pair.targetHtml || (pair.targetClause ? this.escapeHtml(pair.targetClause.content).replace(/\n/g, '<br>') : '');

        const formattedSource = formatContractDiffHtml(rawSource);
        const formattedTarget = formatContractDiffHtml(rawTarget);

        const leftColumnHtml = pair.sourceClause
          ? `
            <div class="content-formatted pr-3 border-r border-[#E2E8F0] break-words leading-relaxed text-[15px] text-[#243041]">${formattedSource}</div>
            <div class="content-raw hidden pr-3 border-r border-[#E2E8F0] break-words font-mono text-[13px] leading-relaxed text-[#243041]">${rawSource}</div>
          `
          : '<div class="pr-3 border-r border-[#E2E8F0] bg-slate-50/50 rounded flex items-center justify-center text-slate-400 italic text-xs p-4">[ 原版合同中不存在此条款 ]</div>';

        const rightColumnHtml = pair.targetClause
          ? `
            <div class="content-formatted pl-3 break-words leading-relaxed text-[15px] text-[#243041]">${formattedTarget}</div>
            <div class="content-raw hidden pl-3 break-words font-mono text-[13px] leading-relaxed text-[#243041]">${rawTarget}</div>
          `
          : '<div class="pl-3 bg-slate-50/50 rounded flex items-center justify-center text-slate-400 italic text-xs p-4">[ 修订版中该条款已被删除 ]</div>';

        const isUnchanged =
          pair.status === 'UNCHANGED' ||
          (pair.similarity >= 0.999 && !pair.diffTokens?.some((t) => t.type !== 'equal'));

        return `
          <div id="sec-${idx + 1}" class="clause-card bg-white border border-[#E2E8F0] rounded-lg overflow-hidden transition" data-status="${pair.status.toLowerCase()}" data-risk="${riskDataAttr}">
            <div class="bg-[#F8FAFC] px-3.5 py-2.5 border-b border-[#E2E8F0] flex items-center justify-between text-xs cursor-pointer select-none hover:bg-slate-100/60 transition" onclick="toggleClause('sec-${idx + 1}')">
              <div class="flex items-center space-x-2">
                <span id="chevron-sec-${idx + 1}" class="text-slate-400 inline-block transform transition-transform duration-200" style="${isUnchanged ? 'transform: rotate(-90deg);' : ''}">${ICONS.chevronDown}</span>
                <span class="text-[17px] font-semibold text-[#243041] tracking-tight">${num ? `${num} ` : ''}${title}</span>
                ${statusTag}
                ${riskBadge}
              </div>
              <div class="flex items-center space-x-3">
                <span class="text-slate-400 text-xs font-normal" title="基于字符编辑距离计算">相似度: ${(pair.similarity * 100).toFixed(1)}%</span>
                <span class="text-xs text-[#315A7D] font-medium hover:underline">折叠/展开</span>
              </div>
            </div>
            <div id="content-sec-${idx + 1}" class="clause-content" style="${isUnchanged ? 'display: none;' : ''}">
              ${aiCard}
              <div class="grid grid-cols-2 gap-3 p-3.5 text-[#243041] bg-white">
                ${leftColumnHtml}
                ${rightColumnHtml}
              </div>
            </div>
          </div>
        `;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>合同智能比对与红线审查报告 - ${safeFileNameA} vs ${safeFileNameB}</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    @media print {
      .no-print { display: none !important; }
      .clause-content { display: block !important; }
      body { background: #fff !important; color: #000 !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.03); }
    ::-webkit-scrollbar-thumb { background: rgba(100, 116, 139, 0.25); border-radius: 3px; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background-color: #F5F6F8;
      color: #243041;
    }
    ins.diff-ins {
      background-color: #F0FDF4;
      color: #166534;
      text-decoration: underline;
      text-decoration-color: #22C55E;
      text-underline-offset: 2.5px;
      padding: 1px 3px;
      border-radius: 2px;
      font-weight: 500;
    }
    del.diff-del {
      background-color: #FEF2F2;
      color: #991B1B;
      text-decoration: line-through;
      text-decoration-color: #EF4444;
      padding: 1px 3px;
      border-radius: 2px;
      opacity: 0.92;
      font-weight: 500;
    }
    .hidden, .filter-hidden {
      display: none !important;
    }
    .clause-card-target {
      outline: 2px solid #315A7D;
      outline-offset: -1px;
    }
  </style>
</head>
<body class="antialiased min-h-screen flex flex-col">
  <header class="bg-white border-b border-[#E2E8F0] sticky top-0 z-30">
    <div class="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="h-8 w-8 rounded-md bg-[#315A7D] flex items-center justify-center text-white">
          ${ICONS.document}
        </div>
        <div>
          <h1 class="text-sm sm:text-base font-bold text-[#243041] leading-tight">合同文档智能比对与红线审查报告</h1>
          <p class="text-[11px] text-slate-500">AST 章节对齐 + 字符级 Myers Diff + AI 语义风险胶水</p>
        </div>
      </div>

      <div class="flex items-center space-x-2 sm:space-x-3">
        <!-- View mode toggle: Formatted vs Raw -->
        <div class="inline-flex items-center bg-slate-100 p-0.5 rounded-md text-xs font-medium text-slate-600 border border-slate-200">
          <button id="btn-view-formatted" onclick="setViewMode('formatted')" class="px-2.5 py-1 rounded bg-white text-[#315A7D] font-semibold transition shadow-xs">排版视图</button>
          <button id="btn-view-raw" onclick="setViewMode('raw')" class="px-2.5 py-1 rounded text-slate-600 hover:text-[#243041] transition">原始文本</button>
        </div>

        <label class="flex items-center space-x-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1 rounded-md cursor-pointer transition border border-slate-200">
          <input type="checkbox" id="filter-diffs-only" class="rounded border-slate-300 text-[#315A7D]" onchange="applyFilters()">
          <span>仅看变更条款</span>
        </label>
        <label class="flex items-center space-x-1.5 text-xs font-medium text-[#991B1B] bg-[#FEF2F2] hover:bg-red-100/70 border border-[#FCA5A5] px-2.5 py-1 rounded-md cursor-pointer transition">
          <input type="checkbox" id="filter-high-risk" class="rounded border-rose-300 text-rose-600" onchange="applyFilters()">
          <span>仅看高风险</span>
        </label>
        <span id="filter-counter" class="text-xs font-semibold text-[#315A7D] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md" style="display: none;"></span>

        <button onclick="toggleAllClauses()" id="btn-toggle-all" class="px-2.5 py-1 text-slate-600 hover:text-[#243041] bg-slate-100 hover:bg-slate-200 rounded-md text-xs font-medium transition border border-slate-200" title="一键收起/展开全部条款正文">
          <span id="label-toggle-all">${metrics.unchangedCount > 0 ? '展开全部条款' : '收起全部条款'}</span>
        </button>

        <button onclick="toggleFullscreen()" class="p-1.5 text-slate-600 hover:text-[#243041] hover:bg-slate-100 rounded-md transition" title="全屏查看">
          ${ICONS.fullscreen}
        </button>
        <button onclick="printReport()" class="px-2.5 py-1 bg-[#315A7D] hover:bg-[#284966] text-white text-xs font-medium rounded-md transition flex items-center space-x-1" title="调用系统打印或另存为 PDF 报告">
          ${ICONS.print}
          <span class="hidden sm:inline">打印报告</span>
        </button>
      </div>
    </div>

    <!-- Contract file subheader bar -->
    <div class="bg-[#F8FAFC] border-t border-[#E2E8F0] px-4 sm:px-6 lg:px-8 py-1.5">
      <div class="max-w-[1720px] mx-auto flex flex-wrap items-center justify-between text-xs text-slate-600 gap-y-1">
        <div class="flex items-center space-x-6">
          <div class="flex items-center space-x-1.5">
            <span class="font-medium text-slate-500">基准合同 (A):</span>
            <span class="font-mono bg-white px-2 py-0.5 rounded border border-[#E2E8F0] text-[#243041]">${safeFileNameA}</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <span class="font-medium text-slate-500">比对合同 (B):</span>
            <span class="font-mono bg-white px-2 py-0.5 rounded border border-[#E2E8F0] text-[#243041]">${safeFileNameB}</span>
          </div>
        </div>
        <div class="flex items-center space-x-3 text-xs">
          <span>共比对 <strong>${metrics.totalClauses}</strong> 项</span>
          <span>修改 <strong>${metrics.modifiedCount}</strong></span>
          <span>新增 <strong>${metrics.addedCount}</strong></span>
          <span>删除 <strong>${metrics.deletedCount}</strong></span>
          ${metrics.highRiskCount > 0 ? `<span class="px-2 py-0.5 bg-[#FEF2F2] text-[#991B1B] border border-[#FCA5A5] rounded-md font-semibold">${metrics.highRiskCount} 项高风险</span>` : ''}
        </div>
      </div>
    </div>
  </header>

  <div class="flex-1 max-w-[1720px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 flex gap-5">
    <aside class="w-64 shrink-0 hidden lg:block no-print">
      <div class="sticky top-28 bg-white border border-[#E2E8F0] rounded-lg p-3 max-h-[calc(100vh-8rem)] overflow-y-auto">
        <h3 class="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">章节索引与状态</h3>
        <nav class="space-y-0.5 text-xs">
          ${tocHtml}
        </nav>
      </div>
    </aside>

    <main class="flex-1 min-w-0 space-y-4">
      ${executiveSummaryHtml}

      <!-- Sticky 2-Column Neutral Header -->
      <div class="grid grid-cols-2 gap-3 bg-white p-2.5 rounded-lg border border-[#E2E8F0] text-xs sticky top-[72px] z-20">
        <div class="flex items-center justify-between px-2">
          <div class="flex items-center space-x-2">
            <span class="text-[#315A7D]">${ICONS.document}</span>
            <span class="font-semibold text-[#243041]">基准版本 (Doc A - 原版)</span>
          </div>
          <span class="font-mono text-[11px] text-slate-500 truncate max-w-[240px]">${safeFileNameA}</span>
        </div>
        <div class="flex items-center justify-between px-2">
          <div class="flex items-center space-x-2">
            <span class="text-[#315A7D]">${ICONS.document}</span>
            <span class="font-semibold text-[#243041]">修订版本 (Doc B - 待审)</span>
          </div>
          <span class="font-mono text-[11px] text-slate-500 truncate max-w-[240px]">${safeFileNameB}</span>
        </div>
      </div>

      ${clausesHtml}
    </main>
  </div>

  <script>
    function applyFilters() {
      const diffOnly = Boolean(document.getElementById('filter-diffs-only')?.checked);
      const highRiskOnly = Boolean(document.getElementById('filter-high-risk')?.checked);
      const cards = document.querySelectorAll('.clause-card');
      const tocLinks = document.querySelectorAll('.toc-link');
      let visibleCount = 0;

      cards.forEach(card => {
        const status = card.getAttribute('data-status');
        const risk = card.getAttribute('data-risk');
        let show = true;
        if (diffOnly && status === 'unchanged') show = false;
        if (highRiskOnly && risk !== 'high') show = false;

        if (show) {
          card.classList.remove('filter-hidden');
          card.style.display = '';
          visibleCount++;
        } else {
          card.classList.add('filter-hidden');
          card.style.display = 'none';
        }
      });

      tocLinks.forEach(link => {
        const status = link.getAttribute('data-status');
        const risk = link.getAttribute('data-risk');
        let show = true;
        if (diffOnly && status === 'unchanged') show = false;
        if (highRiskOnly && risk !== 'high') show = false;
        link.style.display = show ? '' : 'none';
      });

      const countEl = document.getElementById('filter-counter');
      if (countEl) {
        if (diffOnly || highRiskOnly) {
          countEl.textContent = '已筛选 ' + visibleCount + '/' + cards.length + ' 条';
          countEl.style.display = 'inline-block';
        } else {
          countEl.style.display = 'none';
        }
      }
    }

    let allCollapsed = false;
    function toggleClause(id) {
      const content = document.getElementById('content-' + id);
      const chevron = document.getElementById('chevron-' + id);
      if (!content) return;
      if (content.style.display === 'none') {
        content.style.display = '';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
      } else {
        content.style.display = 'none';
        if (chevron) chevron.style.transform = 'rotate(-90deg)';
      }
    }

    function toggleAdvice(id, event) {
      if (event) event.stopPropagation();
      const el = document.getElementById(id);
      const btnId = id.replace('adv-', 'adv-label-');
      const labelEl = document.getElementById(btnId);
      if (!el) return;
      if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        if (labelEl) labelEl.textContent = '收起影响与建议';
      } else {
        el.classList.add('hidden');
        if (labelEl) labelEl.textContent = '影响与建议 展开查看';
      }
    }

    function toggleAllClauses() {
      const contents = document.querySelectorAll('.clause-content');
      const chevrons = document.querySelectorAll('[id^="chevron-sec-"]');
      const hasHidden = Array.from(contents).some(c => c.style.display === 'none');
      const shouldExpand = hasHidden;
      contents.forEach(c => { c.style.display = shouldExpand ? '' : 'none'; });
      chevrons.forEach(ch => { ch.style.transform = shouldExpand ? 'rotate(0deg)' : 'rotate(-90deg)'; });
      const label = document.getElementById('label-toggle-all');
      if (label) label.textContent = shouldExpand ? '收起全部条款' : '展开全部条款';
    }

    function printReport() {
      try {
        window.focus();
        window.print();
      } catch (err) {
        console.warn('Direct print failed, attempting fallback:', err);
        try {
          const printWin = window.open('', '_blank');
          if (printWin) {
            printWin.document.open();
            printWin.document.write(document.documentElement.outerHTML);
            printWin.document.close();
            printWin.focus();
            setTimeout(() => {
              try { printWin.print(); } catch (e) {}
            }, 350);
          } else {
            alert('打印受宿主安全策略限制，请点击右上角【新窗口】打开后再尝试打印或另存为 PDF。');
          }
        } catch (e2) {
          alert('打印受宿主安全策略限制，请点击右上角【新窗口】打开后再尝试打印或另存为 PDF。');
        }
      }
    }

    function jumpToClause(secId) {
      const target = document.getElementById(secId);
      if (!target) return;
      // Ensure content is expanded
      const content = document.getElementById('content-' + secId);
      const chevron = document.getElementById('chevron-' + secId);
      if (content && content.style.display === 'none') {
        content.style.display = '';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.add('clause-card-target');
      setTimeout(() => target.classList.remove('clause-card-target'), 2000);
    }

    let currentViewMode = 'formatted';
    function setViewMode(mode) {
      currentViewMode = mode;
      const btnFormatted = document.getElementById('btn-view-formatted');
      const btnRaw = document.getElementById('btn-view-raw');

      if (mode === 'formatted') {
        btnFormatted?.classList.add('bg-white', 'text-[#315A7D]', 'font-semibold', 'shadow-xs');
        btnFormatted?.classList.remove('text-slate-600');
        btnRaw?.classList.remove('bg-white', 'text-[#315A7D]', 'font-semibold', 'shadow-xs');
        btnRaw?.classList.add('text-slate-600');

        document.querySelectorAll('.content-formatted').forEach(el => el.classList.remove('hidden'));
        document.querySelectorAll('.content-raw').forEach(el => el.classList.add('hidden'));
      } else {
        btnRaw?.classList.add('bg-white', 'text-[#315A7D]', 'font-semibold', 'shadow-xs');
        btnRaw?.classList.remove('text-slate-600');
        btnFormatted?.classList.remove('bg-white', 'text-[#315A7D]', 'font-semibold', 'shadow-xs');
        btnFormatted?.classList.add('text-slate-600');

        document.querySelectorAll('.content-formatted').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.content-raw').forEach(el => el.classList.remove('hidden'));
      }
    }

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  </script>
</body>
</html>`;
  }
}
