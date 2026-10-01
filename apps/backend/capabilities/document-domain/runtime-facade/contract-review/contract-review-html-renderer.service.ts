import { Injectable } from '@nestjs/common';
import type {
  ClauseReviewItem,
  ContractReviewMetrics,
  ContractType,
  DocxCommentItem,
  MissingClauseAlert,
  PartyPosition,
  ReviewChapterGroup,
  ReviewRuleSetSnapshot,
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
import { ReviewIcons } from './contract-review-html-icons.util';

export interface RenderReviewHtmlInput {
  fileName: string;
  contractType: ContractType;
  contractTypeName: string;
  myPosition: PartyPosition;
  positionSource?: 'default' | 'inferred' | 'user_confirmed';
  metrics: ContractReviewMetrics;
  clauses: ClauseReviewItem[];
  chapters?: ReviewChapterGroup[];
  missingClauses: MissingClauseAlert[];
  comments?: DocxCommentItem[];
  canComment?: boolean;
  commentApiUrl?: string;
  ruleSetInfo?: ReviewRuleSetSnapshot;
  executionId?: string;
  artifactId?: string;
  sourceDocumentVersion?: string;
  sourceAttachmentId?: string;
  sourceDocumentHash?: string;
}

@Injectable()
export class ContractReviewHtmlRendererService {
  private readonly documentRenderer = new ContractReviewHtmlDocumentRenderer();
  private readonly findingRenderer = new ContractReviewHtmlFindingRenderer();
  private readonly commentRenderer = new ContractReviewHtmlCommentRenderer();

  renderHtmlReport(input: RenderReviewHtmlInput): string {
    const {
      contractTypeName,
      clauses,
      missingClauses,
    } = input;

    const metrics = input.metrics || {
      healthScore: 100,
      passCount: (clauses || []).filter((c) => c.riskLevel === 'PASS').length,
      lowCount: (clauses || []).filter((c) => c.riskLevel === 'LOW').length,
      mediumCount: (clauses || []).filter((c) => c.riskLevel === 'MEDIUM').length,
      highCount: (clauses || []).filter((c) => c.riskLevel === 'HIGH').length,
      isTruncated: false,
      warnings: [],
    };

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

    const posLabel =
      input.myPosition === 'buyer'
        ? '买方/披露方'
        : input.myPosition === 'seller'
        ? '卖方/接收方'
        : '中立对等';
    const sourceLabel =
      input.positionSource === 'user_confirmed'
        ? '已确认'
        : input.positionSource === 'inferred'
        ? '正文推断'
        : '默认预设';

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

    // 3. Extract and normalize Word Comments (Strictly chronological, time-ordered)
    const rawComments = input.comments || clauses.flatMap((c) => c.comments || []);
    const comments = rawComments.slice().sort((a, b) => {
      if (a.date && b.date) {
        const tA = new Date(a.date).getTime();
        const tB = new Date(b.date).getTime();
        if (!isNaN(tA) && !isNaN(tB)) return tA - tB;
      }
      return Number(a.id) - Number(b.id);
    });
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
    const commentCardsHtml = this.commentRenderer.renderGroupedCommentCards(comments, canComment);
    const commentDetailWorkspaceHtml = this.commentRenderer.renderCommentDetailWorkspace({
      canComment,
      commentApiUrl,
    });
    const commentCreateWorkspaceHtml = this.commentRenderer.renderCommentCreateWorkspace();
    const findingsWorkbenchHtml = this.findingRenderer.renderFindingsWorkbench(
      findings,
      metrics,
      commentCardsHtml,
      comments.length,
      commentDetailWorkspaceHtml,
      commentCreateWorkspaceHtml
    );

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
    .clause-node, .clause-heading, .evidence-mark, .docx-comment-highlight {
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
<body class="min-h-screen pb-12 antialiased bg-[#EEF2F6] text-[#1E293B] mode-view">

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

  <!-- 1. Rigidly Fixed Unified Top Bar -->
  <header id="unified-top-bar" class="sticky top-0 z-30 bg-[#1A2D42] text-white border-b border-[#2B4663] px-3 sm:px-4 py-2 shadow-md">
    <div class="max-w-[1760px] mx-auto flex items-center justify-between flex-nowrap gap-3">
      
      <!-- Left: Brand & Document Title & Score -->
      <div class="flex items-center gap-2.5 min-w-0 shrink-0">
        <div class="w-7 h-7 rounded bg-[#2E5882] flex items-center justify-center text-white shrink-0 shadow-xs border border-[#386A9E]">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"></path></svg>
        </div>
        <div class="flex items-center gap-2 truncate">
          <h1 class="text-xs sm:text-sm font-bold text-white tracking-tight truncate shrink-0" title="合同智能审阅 · 工作底稿">
            合同智能审阅
          </h1>
          <span class="hidden md:inline-block px-1.5 py-0.5 rounded bg-[#243B53] text-[#93C5FD] text-[11px] font-semibold truncate max-w-[120px] shrink-0 border border-[#334E68]">
            ${this.escapeHtml(contractTypeName)}
          </span>
          <span class="px-2 py-0.5 rounded text-[11px] font-bold text-white shadow-2xs font-mono shrink-0 hidden sm:inline-block" style="background-color: ${scoreColor}" title="综合合规评级：${metrics.healthScore} 分 · ${scoreText}">
            ${metrics.healthScore} 分
          </span>
          <span class="px-2 py-0.5 rounded text-[11px] font-mono ${input.positionSource === 'default' ? 'bg-amber-950/80 text-amber-200 border border-amber-500/70 shadow-xs' : 'bg-[#1E3A5F] text-sky-200 border border-[#2D5B8E]'} shrink-0 hidden lg:inline-flex items-center gap-1" title="${input.positionSource === 'default' ? '系统默认采用卖方/接收方防御立场，建议人工核实确认' : `立场设定：${posLabel}（${sourceLabel}）`}">
            <span>立场: ${posLabel}</span>
            <span class="text-[10px] ${input.positionSource === 'default' ? 'text-amber-300 font-semibold' : 'text-amber-300 font-normal'}">(${input.positionSource === 'default' ? '⚠️ 默认预设·未经确认' : sourceLabel})</span>
          </span>
        </div>
      </div>

      <!-- Center: TOC Outline, Language, Navigation Stepper & Progress Badge -->
      <div class="flex items-center gap-2 sm:gap-2.5 shrink-0">
        <!-- TOC Drawer Toggle -->
        <button type="button" onclick="toggleTocDrawer(true)" class="px-2 py-1 rounded text-xs font-medium border border-[#4B79A6] bg-[#2E5882] hover:bg-[#386A9E] text-white transition flex items-center gap-1 cursor-pointer shadow-2xs shrink-0" title="条款大纲目录 (快捷键 T)">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"></path></svg>
          <span class="hidden sm:inline text-[11px]">目录</span>
        </button>

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

        <div class="h-4 w-px bg-[#334E68] hidden md:block"></div>

        <!-- Navigation Stepper -->
        <div class="flex items-center gap-1 text-xs text-slate-300 select-none shrink-0">
          <button type="button" onclick="stepFinding(-1)" class="px-2 py-1 rounded border border-[#334E68] bg-[#101E2E] hover:bg-[#243B53] text-slate-200 flex items-center gap-1 cursor-pointer" title="上一项 (快捷键 K / P)">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
          </button>
          <span id="nav-indicator" class="font-mono text-[11px] px-1 text-slate-200 font-medium min-w-[42px] text-center">1 / ${findings.length || 1}</span>
          <button type="button" onclick="stepFinding(1)" class="px-2 py-1 rounded border border-[#334E68] bg-[#101E2E] hover:bg-[#243B53] text-slate-200 flex items-center gap-1 cursor-pointer" title="下一项 (快捷键 J / N)">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>

        <!-- Real-time Review Progress Pill -->
        <div id="review-progress-indicator" class="hidden lg:flex items-center gap-1 text-[11px] text-slate-300 font-mono bg-[#101E2E] px-2 py-0.5 rounded border border-[#334E68]" title="本次审阅即时进度">
          <span class="text-amber-400">已审</span>
          <span id="progress-viewed-count" class="font-bold text-white">1</span>
          <span class="text-slate-400">/</span>
          <span id="progress-total-count" class="text-slate-400">${findings.length}</span>
          <span class="text-slate-500 mx-0.5">·</span>
          <span class="text-blue-300">批注</span>
          <span id="progress-comments-count" class="font-bold text-blue-200">${comments.length}</span>
        </div>
      </div>

      <!-- Right: Mode Switcher + Save Status + Stage & Return + Complete & Return -->
      <div class="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-auto">
        <!-- Interactive Mode Switcher Pill (查看模式 vs 审查模式) -->
        <div id="mode-switcher-container" class="flex items-center bg-[#101E2E] p-0.5 rounded-lg border border-[#334E68] text-xs select-none">
          <button
            type="button"
            id="mode-btn-view"
            onclick="setInteractionMode('view')"
            class="px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 bg-[#2563EB] text-white shadow-2xs"
            title="查看模式：纯底稿与诊断阅读，不触发更新或批注编辑"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            <span>查看模式</span>
          </button>
          <button
            type="button"
            id="mode-btn-review"
            onclick="setInteractionMode('review')"
            class="px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1 text-slate-300 hover:text-white"
            title="审查模式：支持写入审批意见、标记核实与追加 Word 批注"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            <span>审查模式</span>
          </button>
        </div>

        <!-- Save Status Light -->
        <div id="save-status-container" class="flex items-center gap-1.5 text-xs select-none mode-review-only">
          <span id="save-status-dot" class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
          <span id="save-status-text" class="text-slate-300 text-[11px] font-mono hidden xl:inline">修改已就绪</span>
        </div>

        <!-- Stage & Return Button -->
        <button
          type="button"
          id="btn-stage-return"
          onclick="handleStageAndReturn()"
          class="px-2.5 py-1 text-xs font-medium rounded border border-[#334E68] bg-[#101E2E] hover:bg-[#243B53] text-slate-200 transition cursor-pointer flex items-center gap-1 shadow-2xs mode-review-only"
          title="暂存当前审阅工作态并返回主审批页面"
        >
          <span>暂存并返回</span>
        </button>

        <!-- Complete & Return Button -->
        <button
          type="button"
          id="btn-finish-return"
          onclick="handleFinishAndReturn()"
          class="px-3 py-1 text-xs font-semibold rounded bg-[#2563EB] hover:bg-[#1D4ED8] text-white transition cursor-pointer flex items-center gap-1 shadow-xs border border-blue-400/40 mode-review-only"
          title="完成审阅，将审查结论与批注打包回填至主审批流"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          <span>完成审阅并返回</span>
        </button>
      </div>

    </div>
  </header>

  <!-- 2. Main Resizable Flex Container -->
  <main class="max-w-[1760px] mx-auto px-3 sm:px-4 pt-3 pb-8">
    ${truncationBannerHtml}
    <div id="main-workspace-container">
      
      <!-- Left Column: Continuous Document Paper -->
      <section id="document-column" class="min-w-0 transition-none" style="width: 53%;" aria-label="合同底稿区">
        ${documentPaperHtml}
      </section>

      <!-- Draggable Splitter -->
      <div id="layout-resizer" title="左右拖拽调整宽度，双击恢复默认平衡"></div>

      <!-- Right Column: Inspection Workbench Desk (Sticky & Scrollable) -->
      <aside id="workbench-column" class="min-w-0 pr-1 pl-1" style="width: 47%;" aria-label="审查检查台">
        ${findingsWorkbenchHtml}
      </aside>

    </div>
  </main>

  <!-- Floating Text Selection Dual Bubble (Left document paper only: 添加批注 + 写入审批) -->
  <div id="text-selection-bubble" class="text-selection-bubble">
    <button type="button" class="bubble-action-btn" onclick="openCommentFromSelection(event)" title="在 Word 中针对该句插入批注">
      <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
      <span>添加批注</span>
    </button>
    <div class="bubble-divider"></div>
    <button type="button" class="bubble-action-btn" onclick="openReviewFromSelection(event)" title="针对该句提出审查意见并写入主审批流">
      <svg class="w-3.5 h-3.5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
      <span>写入审批</span>
    </button>
  </div>
  <div id="text-selection-comment-bubble" style="display:none;"></div>

  <!-- Fast Rich Hover Popover for Word Comments -->
  <div id="comment-hover-popover"></div>

  <!-- Keyboard Shortcuts Help Modal -->
  <div id="keyboard-shortcuts-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs" onclick="if(event.target === this) this.classList.add('hidden')">
    <div class="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4 font-sans text-slate-800">
      <div class="flex items-center justify-between pb-2 border-b border-slate-100">
        <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          ${ReviewIcons.keyboard('w-4 h-4 text-[#2E5882]')}
          <span>高效法务审阅快捷键</span>
        </h3>
        <button onclick="document.getElementById('keyboard-shortcuts-modal').classList.add('hidden')" class="w-6 h-6 rounded hover:bg-slate-100 text-slate-500 text-xs flex items-center justify-center cursor-pointer">✕</button>
      </div>
      <div class="grid grid-cols-2 gap-2.5 text-xs">
        <div class="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
          <span class="text-slate-600">下一审查项</span>
          <kbd class="px-2 py-0.5 rounded bg-white border border-slate-300 shadow-2xs font-mono font-bold text-[#1E293B]">J / ↓</kbd>
        </div>
        <div class="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
          <span class="text-slate-600">上一审查项</span>
          <kbd class="px-2 py-0.5 rounded bg-white border border-slate-300 shadow-2xs font-mono font-bold text-[#1E293B]">K / ↑</kbd>
        </div>
        <div class="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
          <span class="text-slate-600">采纳修改建议</span>
          <kbd class="px-2 py-0.5 rounded bg-white border border-slate-300 shadow-2xs font-mono font-bold text-[#1E293B]">A</kbd>
        </div>
        <div class="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
          <span class="text-slate-600">忽略审查项</span>
          <kbd class="px-2 py-0.5 rounded bg-white border border-slate-300 shadow-2xs font-mono font-bold text-[#1E293B]">X</kbd>
        </div>
        <div class="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
          <span class="text-slate-600">标记已解决</span>
          <kbd class="px-2 py-0.5 rounded bg-white border border-slate-300 shadow-2xs font-mono font-bold text-[#1E293B]">D</kbd>
        </div>
        <div class="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
          <span class="text-slate-600">专注模式切换</span>
          <kbd class="px-2 py-0.5 rounded bg-white border border-slate-300 shadow-2xs font-mono font-bold text-[#1E293B]">F</kbd>
        </div>
        <div class="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
          <span class="text-slate-600">打开目录大纲</span>
          <kbd class="px-2 py-0.5 rounded bg-white border border-slate-300 shadow-2xs font-mono font-bold text-[#1E293B]">T</kbd>
        </div>
        <div class="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
          <span class="text-slate-600">快捷键帮助</span>
          <kbd class="px-2 py-0.5 rounded bg-white border border-slate-300 shadow-2xs font-mono font-bold text-[#1E293B]">?</kbd>
        </div>
      </div>
      <div class="pt-2 border-t border-slate-100 text-[11px] text-slate-500 text-center">
        在文本框或输入区域外敲击键盘按键即可触发连续审阅操作。
      </div>
    </div>
  </div>

  <!-- Client-side Interaction Script -->
  ${buildContractReviewClientScript({
    findings,
    comments,
    commentApiUrl,
    ruleSetInfo: input.ruleSetInfo,
    executionId: input.executionId,
    artifactId: input.artifactId,
    sourceDocumentVersion: input.sourceDocumentVersion,
    sourceAttachmentId: input.sourceAttachmentId,
    sourceDocumentHash: input.sourceDocumentHash,
    clauses: (clauses || []).map((c) => ({
      index: c.clauseIndex,
      title: c.title,
      clauseNumber: c.clauseNumber,
    })),
  })}
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
