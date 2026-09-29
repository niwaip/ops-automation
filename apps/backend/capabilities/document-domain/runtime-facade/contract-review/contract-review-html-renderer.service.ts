import { Injectable } from '@nestjs/common';
import type {
  ClauseReviewItem,
  ContractReviewMetrics,
  ContractType,
  DocxCommentItem,
  MissingClauseAlert,
  PartyPosition,
  ReviewChapterGroup,
} from './contract-review.types';
import { fixFilenameEncoding } from '../filename-encoding.util';
import { ContractReviewHtmlDocumentRenderer } from './contract-review-html-document.renderer';
import {
  ContractReviewHtmlFindingRenderer,
  type FindingItemViewModel,
} from './contract-review-html-finding.renderer';
import { ContractReviewHtmlCommentRenderer } from './contract-review-html-comment.renderer';
import { buildContractReviewClientScript } from './contract-review-html-client-script.builder';
import { CONTRACT_REPORT_STANDALONE_CSS } from '../contract-standalone-style.util';

export interface RenderReviewHtmlInput {
  fileName: string;
  contractType: ContractType;
  contractTypeName: string;
  myPosition: PartyPosition;
  metrics: ContractReviewMetrics;
  clauses: ClauseReviewItem[];
  chapters?: ReviewChapterGroup[];
  missingClauses: MissingClauseAlert[];
  comments?: DocxCommentItem[];
  canComment?: boolean;
  commentApiUrl?: string;
}

@Injectable()
export class ContractReviewHtmlRendererService {
  private readonly documentRenderer = new ContractReviewHtmlDocumentRenderer();
  private readonly findingRenderer = new ContractReviewHtmlFindingRenderer();
  private readonly commentRenderer = new ContractReviewHtmlCommentRenderer();

  renderHtmlReport(input: RenderReviewHtmlInput): string {
    const {
      contractTypeName,
      metrics,
      clauses,
      missingClauses,
    } = input;

    const fileName = fixFilenameEncoding(input.fileName || '审查合同文档.docx');

    const scoreColor =
      metrics.healthScore >= 85
        ? '#059669'
        : metrics.healthScore >= 65
        ? '#D97706'
        : '#B42318';

    const scoreText =
      metrics.healthScore >= 85
        ? '合规良好'
        : metrics.healthScore >= 65
        ? '中度风险'
        : '高危陷阱';

    // 1. Build or normalize Chapters
    const chapters: ReviewChapterGroup[] =
      input.chapters && input.chapters.length > 0
        ? input.chapters
        : this.buildFallbackChapters(clauses);

    // 2. Build Unified Findings for the right 40% inspection workbench
    const findings: FindingItemViewModel[] = this.findingRenderer.buildFindingViewModels(
      clauses,
      missingClauses
    );

    // Calculate filter counts
    const highCount = findings.filter((f) => f.severity === 'HIGH').length;
    const missingCount = findings.filter((f) => f.issueType === '信息缺失').length;
    const verifyCount = findings.filter((f) => f.issueType === '表述歧义' || f.issueType === '待核实附件').length;

    // 3. Extract and normalize Word Comments
    const comments = input.comments || clauses.flatMap((c) => c.comments || []);
    const canComment = input.canComment ?? true;
    const commentApiUrl = input.commentApiUrl || '';

    // 4. Render Left 60% Document Paper
    const documentPaperHtml = this.documentRenderer.renderDocumentPaper({
      fileName,
      contractTypeName,
      clauses,
      chapters,
    });

    // 5. Render Right 40% Findings & Comments Workbench
    const commentCardsHtml = comments
      .map((c, idx) => this.commentRenderer.renderCommentCard(c, idx, canComment))
      .join('\n');
    const commentDetailWorkspaceHtml = this.commentRenderer.renderCommentDetailWorkspace({
      canComment,
      commentApiUrl,
    });
    const findingsWorkbenchHtml = this.findingRenderer.renderFindingsWorkbench(
      findings,
      metrics,
      commentCardsHtml,
      comments.length,
      commentDetailWorkspaceHtml
    );

    // 6. Render Append Comment Modal Dialog
    const appendCommentModalHtml = this.commentRenderer.renderAppendCommentModal({
      canComment,
      commentApiUrl,
      clauses,
    });

    // Truncation banner for partial review
    const truncationBannerHtml = metrics.isTruncated
      ? `
        <div class="mb-4 bg-[#FFFBEB] border-l-4 border-[#F59E0B] p-3.5 rounded-r-md text-xs text-[#B45309] flex items-start space-x-2.5">
          <span class="text-base shrink-0">⚠️</span>
          <div class="space-y-0.5">
            <p class="font-bold text-[#92400E]">文档部分截断审查警示 (Partial Review Warning)</p>
            <p class="text-slate-700">本文档篇幅超过单次审查上限，系统仅对前序已提取部分完成合规审查。未被提取的后续章节未纳入本次体检范围，请留意潜在未覆盖风险。</p>
            ${metrics.warnings && metrics.warnings.length > 0 ? `<ul class="list-disc list-inside mt-1 text-[11px] text-slate-600">${metrics.warnings.map((w: string) => `<li>${this.escapeHtml(w)}</li>`).join('')}</ul>` : ''}
          </div>
        </div>
      `
      : '';

    // 5. Render Outline Drawer List
    const outlineItemsHtml = chapters
      .map((ch) => {
        const chapterLabel = ch.chapterTitle.startsWith(ch.chapterNumber)
          ? ch.chapterTitle
          : ch.chapterNumber === '正文' || ch.chapterNumber === '前言' || ch.chapterNumber === '附件'
          ? ch.chapterTitle
          : `${ch.chapterNumber} ${ch.chapterTitle}`;

        const subLinksHtml = ch.clauses
          .map((c) => {
            const riskColor =
              c.riskLevel === 'HIGH'
                ? 'bg-[#B42318]'
                : c.riskLevel === 'MEDIUM'
                ? 'bg-[#D97706]'
                : 'bg-slate-300';

            const clauseDisplay =
              c.clauseNumber &&
              !c.title.startsWith(c.clauseNumber) &&
              c.clauseNumber !== '正文' &&
              c.clauseNumber !== '前言'
                ? `${c.clauseNumber} ${c.title}`
                : c.title || c.clauseNumber;

            return `
            <a href="#clause-node-${c.clauseIndex}" onclick="jumpToClauseNode(${c.clauseIndex}, event)" class="toc-link block px-2 py-1 rounded text-[11px] text-slate-600 hover:bg-[#294766]/5 hover:text-[#294766] transition truncate flex items-center justify-between cursor-pointer" data-clause-index="${c.clauseIndex}">
              <span class="truncate pl-1">· ${this.escapeHtml(clauseDisplay)}</span>
              <span class="w-1.5 h-1.5 rounded-full ${riskColor} shrink-0 ml-1"></span>
            </a>`;
          })
          .join('');

        return `
        <div class="toc-chapter-group mb-1.5 border border-[#E2E5EA] rounded overflow-hidden bg-[#F9FAFB]">
          <div onclick="toggleTocGroup(this)" class="w-full px-2.5 py-1.5 text-left text-xs font-semibold text-[#202833] hover:bg-slate-100 flex items-center justify-between transition cursor-pointer select-none">
            <span class="truncate text-[11px] font-medium">${this.escapeHtml(chapterLabel)}</span>
            <span class="text-[10px] font-mono text-[#667085]">(${ch.clauses.length})</span>
          </div>
          <div class="toc-sub-list px-1 py-1 bg-white border-t border-[#E2E5EA] space-y-0.5">
            ${subLinksHtml}
          </div>
        </div>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>合同智能审查与合规诊断报告 · 工作底稿 - ${this.escapeHtml(fileName)}</title>
  <style>
    ${CONTRACT_REPORT_STANDALONE_CSS}
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #EDF1F5;
      color: #1E293B;
    }
    .hidden-by-filter { display: none !important; }
    .active-filter-tab {
      background-color: #2E5882 !important;
      color: #ffffff !important;
      border-color: #4B79A6 !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25) !important;
    }
    .active-finding-card {
      border-color: #2E5882 !important;
      box-shadow: 0 0 0 2px rgba(46, 88, 130, 0.25) !important;
    }
    .evidence-highlight-active {
      background-color: #FEF3C7 !important;
      border-bottom: 2px solid #D97706 !important;
      color: #202833 !important;
      padding: 1px 3px;
      border-radius: 2px;
    }
    .clause-node, .clause-heading, .evidence-mark {
      scroll-margin-top: 130px;
    }
    /* Language Toggle Visibility Controls */
    .lang-zh-only .lang-secondary,
    .lang-zh-only .chapter-title-ja,
    .lang-zh-only .heading-ja {
      display: none !important;
    }
    .lang-ja-only .lang-primary,
    .lang-ja-only .chapter-title-zh,
    .lang-ja-only .heading-zh {
      display: none !important;
    }
    /* Scrollbars */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
  </style>
</head>
<body class="min-h-screen pb-12 antialiased">

  <!-- Minimalist Toast Notification -->
  <div id="toast" class="fixed top-4 right-6 z-50 px-3.5 py-2 bg-[#202833] text-white text-xs font-medium rounded shadow-lg opacity-0 pointer-events-none transition-all duration-200 transform -translate-y-2 flex items-center gap-2 border border-slate-700">
    <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
    <span id="toast-msg">已复制文本</span>
  </div>

  <!-- TOC Slide-over Drawer Backdrop -->
  <div id="toc-backdrop" onclick="toggleTocDrawer(false)" class="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40 transition-opacity duration-200 opacity-0 pointer-events-none"></div>

  <!-- TOC Slide-over Drawer -->
  <aside id="toc-drawer" class="fixed inset-y-0 left-0 z-50 w-80 bg-white shadow-xl border-r border-[#D9E1EC] transform -translate-x-full transition-transform duration-200 ease-in-out flex flex-col">
    <div class="px-4 py-3 bg-[#F4F6F9] border-b border-[#D9E1EC] flex items-center justify-between">
      <div class="truncate">
        <h2 class="text-xs font-bold text-[#1E293B] uppercase tracking-wider">合同条款目录大纲</h2>
        <div class="text-[10px] text-[#64748B] font-mono">共 ${clauses.length} 条款 · 快捷键 T</div>
      </div>
      <button onclick="toggleTocDrawer(false)" class="w-6 h-6 rounded hover:bg-slate-200 text-[#64748B] flex items-center justify-center text-xs transition cursor-pointer" title="关闭大纲 (Esc)">✕</button>
    </div>
    <div class="p-2 border-b border-[#D9E1EC] bg-white">
      <input id="toc-search" type="text" oninput="filterTocOutline(this.value)" placeholder="搜索章节或条号..." class="w-full text-xs px-2.5 py-1.5 rounded border border-[#D9E1EC] bg-[#F8FAFC] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2E5882]" />
    </div>
    <div id="toc-list" class="flex-1 overflow-y-auto p-2.5 space-y-1">
      ${outlineItemsHtml}
    </div>
  </aside>

  <!-- 1. Rigidly Fixed Unified Top Bar (Header + Executive Controls Combined 一览) -->
  <header id="unified-top-bar" class="sticky top-0 z-30 bg-[#1A2D42] text-white border-b border-[#2B4663] px-3 sm:px-4 py-2 shadow-md">
    <div class="max-w-[1680px] mx-auto flex items-center justify-between flex-nowrap gap-3">
      
      <!-- Brand & Document Title & Metadata -->
      <div class="flex items-center gap-2.5 min-w-0 shrink-0">
        <div class="w-7 h-7 rounded bg-[#2E5882] flex items-center justify-center text-white shrink-0 shadow-xs border border-[#386A9E]">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"></path></svg>
        </div>
        <div class="flex items-center gap-2 truncate">
          <h1 class="text-xs sm:text-sm font-bold text-white tracking-tight truncate shrink-0" title="合同智能审查与合规诊断报告 · 工作底稿">
            合同智能审查与合规诊断
          </h1>
          <span class="hidden md:inline-block px-1.5 py-0.5 rounded bg-[#243B53] text-[#93C5FD] text-[11px] font-semibold truncate max-w-[120px] shrink-0 border border-[#334E68]">
            ${this.escapeHtml(contractTypeName)}
          </span>
        </div>
      </div>

      <!-- Center: Filter Tabs Track (Dark pill track, crisp high-contrast, segmented control) -->
      <div class="flex items-center justify-center shrink-0">
        <div class="topbar-tabs-track" id="filter-tabs">
          <button type="button" onclick="applyFilter('all', this)" class="topbar-tab-btn active-tab">
            <span>全部</span>
            <span class="badge-count badge-count-all">${findings.length}</span>
          </button>
          <button type="button" onclick="applyFilter('high', this)" class="topbar-tab-btn">
            <span>高风险</span>
            <span class="badge-count badge-count-high">${highCount}</span>
          </button>
          <button type="button" onclick="applyFilter('missing', this)" class="topbar-tab-btn">
            <span>待补充</span>
            <span class="badge-count badge-count-missing">${missingCount}</span>
          </button>
          <button type="button" onclick="applyFilter('verify', this)" class="topbar-tab-btn">
            <span>待核实</span>
            <span class="badge-count badge-count-verify">${verifyCount}</span>
          </button>
          ${
            comments.length > 0
              ? `
          <button type="button" onclick="applyFilter('comments', this)" class="topbar-tab-btn" title="查看 Word 原文批注清单">
            <span>💬 批注</span>
            <span class="badge-count badge-count-comment">${comments.length}</span>
          </button>`
              : ''
          }
        </div>
      </div>

      <!-- Right: Action Button + Bilingual + Stepper + TOC + Score (ALL STRICTLY ON THE RIGHT, NO WRAP) -->
      <div class="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-auto">
        ${
          canComment
            ? `
        <!-- Prominent "+ 追加批注" Action Button -->
        <button
          type="button"
          onclick="openGlobalCommentModal()"
          class="btn-append-comment-primary"
          title="针对合同追加新批注"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          <span>追加批注</span>
        </button>
        <div class="h-4 w-px bg-[#334E68] hidden sm:block"></div>`
            : ''
        }

        <!-- Language Switcher -->
        <div class="inline-flex rounded border border-[#334E68] bg-[#101E2E] p-0.5 text-xs select-none shrink-0">
          <button type="button" id="lang-btn-both" onclick="setLanguageMode('both')" class="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#2E5882] text-white transition cursor-pointer">
            双语
          </button>
          <button type="button" id="lang-btn-zh" onclick="setLanguageMode('zh')" class="px-2 py-0.5 rounded text-[11px] text-slate-300 hover:text-white transition cursor-pointer">
            中文
          </button>
          <button type="button" id="lang-btn-ja" onclick="setLanguageMode('ja')" class="px-2 py-0.5 rounded text-[11px] text-slate-300 hover:text-white transition cursor-pointer">
            日文
          </button>
        </div>

        <div class="h-4 w-px bg-[#334E68] hidden sm:block"></div>

        <!-- Problem / Comment Navigation Stepper -->
        <div class="flex items-center gap-1 text-xs text-slate-300 select-none shrink-0">
          <button type="button" onclick="stepFinding(-1)" class="px-2 py-1 rounded border border-[#334E68] bg-[#101E2E] hover:bg-[#243B53] text-slate-200 flex items-center gap-1 cursor-pointer" title="上一项 (快捷键 P)">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
          </button>
          <span id="nav-indicator" class="font-mono text-[11px] px-1 text-slate-200 font-medium min-w-[36px] text-center">1 / ${findings.length || 1}</span>
          <button type="button" onclick="stepFinding(1)" class="px-2 py-1 rounded border border-[#334E68] bg-[#101E2E] hover:bg-[#243B53] text-slate-200 flex items-center gap-1 cursor-pointer" title="下一项 (快捷键 N)">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>

        <!-- TOC Drawer Toggle -->
        <button type="button" onclick="toggleTocDrawer(true)" class="px-2 py-1 rounded text-xs font-medium border border-[#4B79A6] bg-[#2E5882] hover:bg-[#386A9E] text-white transition flex items-center gap-1 cursor-pointer shadow-2xs shrink-0" title="大纲目录 (快捷键 T)">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"></path></svg>
          <span class="hidden sm:inline text-[11px]">目录</span>
        </button>

        <!-- Compliance Score Pill -->
        <div class="flex items-center gap-2 shrink-0">
          <div class="px-2.5 py-1 rounded text-xs font-bold text-white flex items-center gap-1 shadow-2xs font-mono" style="background-color: ${scoreColor}" title="综合合规评级：${metrics.healthScore} 分 · ${scoreText}">
            <span>${metrics.healthScore} 分</span>
          </div>
        </div>
      </div>

    </div>
  </header>

  <!-- 2. Main 60:40 Grid Container -->
  <main class="max-w-[1680px] mx-auto px-4 pt-4">
    ${truncationBannerHtml}
    <div class="grid grid-cols-1 md:grid-cols-10 gap-6 items-start">
      
      <!-- Left Column: 60% Continuous Document Paper -->
      <section class="md:col-span-6 min-w-0" aria-label="合同底稿区">
        ${documentPaperHtml}
      </section>

      <!-- Right Column: 40% Inspection Workbench Desk (Sticky & Scrollable) -->
      <aside class="md:col-span-4 sticky top-[56px] max-h-[calc(100vh-4.5rem)] overflow-y-auto pr-1" aria-label="审查检查台">
        ${findingsWorkbenchHtml}
      </aside>

    </div>
  </main>

  <!-- Floating Text Selection Comment Bubble -->
  <div id="text-selection-comment-bubble" onclick="openCommentFromSelection(event)">
    <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
    <span>添加批注</span>
  </div>

  <!-- Client-side Interaction Script -->
  ${buildContractReviewClientScript({ findings, comments, commentApiUrl })}

  ${appendCommentModalHtml}
</body>
</html>`;
  }

  private buildFallbackChapters(clauses: ClauseReviewItem[]): ReviewChapterGroup[] {
    const chapterMap = new Map<string, ReviewChapterGroup>();
    let chIdx = 1;
    for (const c of clauses) {
      const isPreamble = c.clauseIndex === 0 || c.clauseNumber === '前言';
      const isAnnex = c.clauseNumber?.includes('附件') || c.title?.includes('附件');
      const chNum = isPreamble
        ? c.chapterNumber && c.chapterNumber !== '正文'
          ? c.chapterNumber
          : '前言'
        : isAnnex
        ? c.chapterNumber || '附件'
        : c.chapterNumber || '正文';
      const chTitle = isPreamble
        ? c.chapterTitle && c.chapterTitle !== '合同正文条款'
          ? c.chapterTitle
          : '合同引言与签约主体'
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
    return Array.from(chapterMap.values());
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
