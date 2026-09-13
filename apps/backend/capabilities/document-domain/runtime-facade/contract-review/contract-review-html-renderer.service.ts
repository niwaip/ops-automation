import { Injectable } from '@nestjs/common';
import type {
  ClauseReviewItem,
  ContractReviewMetrics,
  ContractType,
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

export interface RenderReviewHtmlInput {
  fileName: string;
  contractType: ContractType;
  contractTypeName: string;
  myPosition: PartyPosition;
  metrics: ContractReviewMetrics;
  clauses: ClauseReviewItem[];
  chapters?: ReviewChapterGroup[];
  missingClauses: MissingClauseAlert[];
}

@Injectable()
export class ContractReviewHtmlRendererService {
  private readonly documentRenderer = new ContractReviewHtmlDocumentRenderer();
  private readonly findingRenderer = new ContractReviewHtmlFindingRenderer();

  renderHtmlReport(input: RenderReviewHtmlInput): string {
    const {
      contractTypeName,
      myPosition,
      metrics,
      clauses,
      missingClauses,
    } = input;

    const fileName = fixFilenameEncoding(input.fileName || '审查合同文档.docx');

    const positionLabel =
      myPosition === 'buyer'
        ? '买方 / 委托方（严守风控底线）'
        : myPosition === 'seller'
        ? '卖方 / 开发方（保障合理免责）'
        : '中立 / 客观评估立场';

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

    // 3. Render Left 60% Document Paper
    const documentPaperHtml = this.documentRenderer.renderDocumentPaper({
      fileName,
      contractTypeName,
      clauses,
      chapters,
    });

    // 4. Render Right 40% Findings Workbench
    const findingsWorkbenchHtml = this.findingRenderer.renderFindingsWorkbench(findings, metrics);

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
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #F5F6F8;
      color: #202833;
    }
    .hidden-by-filter { display: none !important; }
    .active-filter-tab {
      background-color: #294766 !important;
      color: #ffffff !important;
      border-color: #294766 !important;
    }
    .active-finding-card {
      border-color: #294766 !important;
      box-shadow: 0 0 0 2px rgba(41, 71, 102, 0.25) !important;
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
  <div id="toc-backdrop" onclick="toggleTocDrawer(false)" class="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-40 transition-opacity duration-200 opacity-0 pointer-events-none"></div>

  <!-- TOC Slide-over Drawer -->
  <aside id="toc-drawer" class="fixed inset-y-0 left-0 z-50 w-80 bg-white shadow-xl border-r border-[#E2E5EA] transform -translate-x-full transition-transform duration-200 ease-in-out flex flex-col">
    <div class="px-4 py-3 bg-[#F9FAFB] border-b border-[#E2E5EA] flex items-center justify-between">
      <div class="truncate">
        <h2 class="text-xs font-bold text-[#202833] uppercase tracking-wider">合同条款目录大纲</h2>
        <div class="text-[10px] text-[#667085] font-mono">共 ${clauses.length} 条款 · 快捷键 T</div>
      </div>
      <button onclick="toggleTocDrawer(false)" class="w-6 h-6 rounded hover:bg-slate-200 text-[#667085] flex items-center justify-center text-xs transition cursor-pointer" title="关闭大纲 (Esc)">✕</button>
    </div>
    <div class="p-2 border-b border-[#E2E5EA] bg-white">
      <input id="toc-search" type="text" oninput="filterTocOutline(this.value)" placeholder="搜索章节或条号..." class="w-full text-xs px-2.5 py-1.5 rounded border border-[#E2E5EA] bg-[#F9FAFB] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#294766]" />
    </div>
    <div id="toc-list" class="flex-1 overflow-y-auto p-2.5 space-y-1">
      ${outlineItemsHtml}
    </div>
  </aside>

  <!-- 1. Rigidly Fixed Unified Top Bar (Header + Executive Controls Combined 一览) -->
  <header id="unified-top-bar" class="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E2E5EA] px-3 sm:px-4 py-2 shadow-2xs">
    <div class="max-w-[1680px] mx-auto flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
      
      <!-- Brand & Document Title & Metadata -->
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-7 h-7 rounded bg-[#294766] flex items-center justify-center text-white shrink-0 shadow-2xs">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"></path></svg>
        </div>
        <div class="min-w-0 flex items-center gap-2">
          <h1 class="text-xs sm:text-sm font-bold text-[#202833] tracking-tight truncate shrink-0" title="合同智能审查与合规诊断报告 · 工作底稿">
            合同智能审查与合规诊断报告
          </h1>
          <span class="hidden md:inline-block px-1.5 py-0.5 rounded bg-slate-100 text-[#294766] text-[11px] font-semibold truncate max-w-[120px] shrink-0">
            ${this.escapeHtml(contractTypeName)}
          </span>
          <span class="hidden xl:inline-block text-[11px] text-[#667085] truncate max-w-[220px] font-mono shrink-0" title="${this.escapeHtml(fileName)}">
            ${this.escapeHtml(fileName)}
          </span>
        </div>
      </div>

      <!-- Center: Filter Tabs -->
      <div class="flex items-center gap-1 shrink-0" id="filter-tabs">
        <button onclick="applyFilter('all', this)" class="active-filter-tab px-2.5 py-1 rounded text-xs font-semibold border border-[#E2E5EA] bg-white text-[#202833] hover:bg-slate-50 transition cursor-pointer">
          全部 <span class="text-[10px] font-mono opacity-80">(${findings.length})</span>
        </button>
        <button onclick="applyFilter('high', this)" class="px-2.5 py-1 rounded text-xs font-medium border border-[#E2E5EA] bg-white text-[#B42318] hover:bg-red-50 transition cursor-pointer">
          高风险 <span class="text-[10px] font-mono font-bold">(${highCount})</span>
        </button>
        <button onclick="applyFilter('missing', this)" class="px-2.5 py-1 rounded text-xs font-medium border border-[#E2E5EA] bg-white text-[#9A6700] hover:bg-amber-50 transition cursor-pointer">
          待补充 <span class="text-[10px] font-mono font-bold">(${missingCount})</span>
        </button>
        <button onclick="applyFilter('verify', this)" class="px-2.5 py-1 rounded text-xs font-medium border border-[#E2E5EA] bg-white text-slate-700 hover:bg-slate-50 transition cursor-pointer">
          待核实 <span class="text-[10px] font-mono font-bold">(${verifyCount})</span>
        </button>
      </div>

      <!-- Right: Language Toggle, Navigation Stepper, Outline, Health Score -->
      <div class="flex items-center gap-2 sm:gap-3 shrink-0">
        <!-- Language Switcher -->
        <div class="inline-flex rounded border border-[#E2E5EA] bg-slate-50 p-0.5 text-xs select-none">
          <button id="lang-btn-both" onclick="setLanguageMode('both')" class="px-2 py-0.5 rounded bg-white text-[#294766] font-semibold shadow-2xs cursor-pointer">
            双语
          </button>
          <button id="lang-btn-zh" onclick="setLanguageMode('zh')" class="px-2 py-0.5 rounded text-[#667085] hover:text-[#202833] cursor-pointer">
            中文
          </button>
          <button id="lang-btn-ja" onclick="setLanguageMode('ja')" class="px-2 py-0.5 rounded text-[#667085] hover:text-[#202833] cursor-pointer">
            日文
          </button>
        </div>

        <div class="h-4 w-px bg-slate-200 hidden sm:block"></div>

        <!-- Problem Navigation Stepper -->
        <div class="flex items-center gap-1 text-xs text-[#667085] select-none">
          <button onclick="stepFinding(-1)" class="px-2 py-1 rounded border border-[#E2E5EA] bg-white hover:bg-slate-50 text-[#202833] flex items-center gap-1 cursor-pointer" title="上一项 (快捷键 P)">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
            <span class="hidden lg:inline text-[11px]">上一问题</span>
          </button>
          <span id="nav-indicator" class="font-mono text-[11px] px-1 text-[#202833] font-medium min-w-[36px] text-center">1 / ${findings.length || 1}</span>
          <button onclick="stepFinding(1)" class="px-2 py-1 rounded border border-[#E2E5EA] bg-white hover:bg-slate-50 text-[#202833] flex items-center gap-1 cursor-pointer" title="下一项 (快捷键 N)">
            <span class="hidden lg:inline text-[11px]">下一问题</span>
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>

        <!-- TOC Drawer Toggle -->
        <button onclick="toggleTocDrawer(true)" class="px-2 py-1 rounded text-xs font-medium border border-[#294766] text-[#294766] hover:bg-[#294766] hover:text-white transition flex items-center gap-1 cursor-pointer" title="大纲目录 (快捷键 T)">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"></path></svg>
          <span class="hidden sm:inline text-[11px]">目录</span>
        </button>

        <div class="h-4 w-px bg-slate-200 hidden sm:block"></div>

        <!-- Compliance Score Pill -->
        <div class="flex items-center gap-2 shrink-0">
          <div class="text-right hidden xl:block">
            <div class="text-[10px] text-[#667085] uppercase tracking-wider">综合合规评级</div>
            <div class="text-xs font-bold" style="color: ${scoreColor}">${scoreText}</div>
          </div>
          <div class="px-2.5 py-1 rounded text-xs font-bold text-white flex items-center gap-1 shadow-2xs" style="background-color: ${scoreColor}" title="综合合规评级：${metrics.healthScore} 分 · ${scoreText}">
            <span>${metrics.healthScore} 分</span>
            <span class="text-[10px] opacity-90 sm:hidden">· ${scoreText}</span>
          </div>
        </div>
      </div>

    </div>
  </header>

  <!-- 2. Main 60:40 Grid Container -->
  <main class="max-w-[1680px] mx-auto px-4 pt-4">
    <div class="grid grid-cols-1 lg:grid-cols-10 gap-6 items-start">
      
      <!-- Left Column: 60% Continuous Document Paper -->
      <section class="lg:col-span-6 min-w-0" aria-label="合同底稿区">
        ${documentPaperHtml}
      </section>

      <!-- Right Column: 40% Inspection Workbench Desk (Sticky & Scrollable) -->
      <aside class="lg:col-span-4 sticky top-[56px] max-h-[calc(100vh-4.5rem)] overflow-y-auto pr-1" aria-label="审查检查台">
        ${findingsWorkbenchHtml}
      </aside>

    </div>
  </main>

  <!-- Client-side Interaction Script -->
  <script>
    let activeFindingIndex = 0;
    let visibleFindingIds = [];
    const allFindings = ${JSON.stringify(
      findings.map((f) => ({
        id: f.id,
        clauseIndex: f.clauseIndex ?? -1,
        severity: f.severity.toLowerCase(),
        issueType: f.issueType,
      }))
    )};

    function initFindingsList() {
      visibleFindingIds = allFindings.map(f => f.id);
      updateNavIndicator();
      if (visibleFindingIds.length > 0) {
        selectFinding(visibleFindingIds[0], false);
      }
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      const toastMsg = document.getElementById('toast-msg');
      if (!toast || !toastMsg) return;
      toastMsg.textContent = msg;
      toast.classList.remove('opacity-0', '-translate-y-2', 'pointer-events-none');
      toast.classList.add('opacity-100', 'translate-y-0');
      setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', '-translate-y-2', 'pointer-events-none');
      }, 2000);
    }

    function toggleTocDrawer(open) {
      const drawer = document.getElementById('toc-drawer');
      const backdrop = document.getElementById('toc-backdrop');
      if (!drawer || !backdrop) return;
      const isOpen = !drawer.classList.contains('-translate-x-full');
      const target = typeof open === 'boolean' ? open : !isOpen;
      if (target) {
        drawer.classList.remove('-translate-x-full');
        backdrop.classList.remove('opacity-0', 'pointer-events-none');
        backdrop.classList.add('opacity-100', 'pointer-events-auto');
        const searchInput = document.getElementById('toc-search');
        if (searchInput) setTimeout(() => searchInput.focus(), 150);
      } else {
        drawer.classList.add('-translate-x-full');
        backdrop.classList.add('opacity-0', 'pointer-events-none');
        backdrop.classList.remove('opacity-100', 'pointer-events-auto');
      }
    }

    function toggleTocGroup(headerEl) {
      const group = headerEl.parentElement;
      const sub = group.querySelector('.toc-sub-list');
      if (!sub) return;
      sub.classList.toggle('hidden');
    }

    function scrollTargetToUpperMiddle(el) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
      const unifiedBar = document.getElementById('unified-top-bar') || document.querySelector('header');
      const barHeight = unifiedBar ? unifiedBar.offsetHeight : 52;
      const targetViewportOffset = Math.max(barHeight + 20, Math.floor(window.innerHeight * 0.22));
      const destinationY = currentScrollY + rect.top - targetViewportOffset;
      window.scrollTo({
        top: Math.max(0, destinationY),
        behavior: 'smooth'
      });
    }

    function jumpToClauseNode(clauseIndex, event) {
      if (event) event.preventDefault();
      toggleTocDrawer(false);
      const target = document.getElementById('clause-node-' + clauseIndex);
      if (target) {
        scrollTargetToUpperMiddle(target);
      }
    }

    function filterTocOutline(q) {
      const query = (q || '').trim().toLowerCase();
      document.querySelectorAll('#toc-list .toc-link').forEach(link => {
        const text = link.textContent.toLowerCase();
        link.style.display = (!query || text.includes(query)) ? 'flex' : 'none';
      });
    }

    function setLanguageMode(mode) {
      const container = document.getElementById('document-paper-container');
      if (!container) return;
      container.classList.remove('lang-zh-only', 'lang-ja-only', 'lang-bilingual');
      
      const btnBoth = document.getElementById('lang-btn-both');
      const btnZh = document.getElementById('lang-btn-zh');
      const btnJa = document.getElementById('lang-btn-ja');

      [btnBoth, btnZh, btnJa].forEach(btn => {
        btn.classList.remove('bg-white', 'text-[#294766]', 'font-semibold', 'shadow-2xs');
        btn.classList.add('text-[#667085]');
      });

      if (mode === 'zh') {
        container.classList.add('lang-zh-only');
        btnZh.classList.add('bg-white', 'text-[#294766]', 'font-semibold', 'shadow-2xs');
      } else if (mode === 'ja') {
        container.classList.add('lang-ja-only');
        btnJa.classList.add('bg-white', 'text-[#294766]', 'font-semibold', 'shadow-2xs');
      } else {
        container.classList.add('lang-bilingual');
        btnBoth.classList.add('bg-white', 'text-[#294766]', 'font-semibold', 'shadow-2xs');
      }
    }

    function applyFilter(filterType, btn) {
      document.querySelectorAll('#filter-tabs button').forEach(b => {
        b.classList.remove('active-filter-tab');
      });
      btn.classList.add('active-filter-tab');

      const cards = document.querySelectorAll('.finding-card');
      visibleFindingIds = [];

      cards.forEach(card => {
        const sev = card.getAttribute('data-severity');
        const type = card.getAttribute('data-issue-type');
        const id = card.getAttribute('data-finding-id');

        let show = false;
        if (filterType === 'all') show = true;
        else if (filterType === 'high' && sev === 'high') show = true;
        else if (filterType === 'missing' && type === '信息缺失') show = true;
        else if (filterType === 'verify' && (type === '表述歧义' || type === '待核实附件')) show = true;

        if (show) {
          card.classList.remove('hidden-by-filter');
          visibleFindingIds.push(id);
        } else {
          card.classList.add('hidden-by-filter');
        }
      });

      activeFindingIndex = 0;
      updateNavIndicator();
      if (visibleFindingIds.length > 0) {
        selectFinding(visibleFindingIds[0], false);
      }
    }

    function selectFinding(findingId, doScroll) {
      // 1. Highlight Right Finding Card
      document.querySelectorAll('.finding-card').forEach(c => {
        c.classList.remove('active-finding-card');
      });
      const card = document.getElementById(findingId);
      if (card) {
        card.classList.add('active-finding-card');
        if (doScroll !== false) {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      // Update Nav Stepper
      const idx = visibleFindingIds.indexOf(findingId);
      if (idx >= 0) {
        activeFindingIndex = idx;
        updateNavIndicator();
      }

      // 2. Highlight Evidence in Left Document Paper
      document.querySelectorAll('.evidence-mark').forEach(m => {
        m.classList.remove('evidence-highlight-active');
      });

      const mark = document.getElementById('evidence-target-' + findingId);
      if (mark) {
        mark.classList.add('evidence-highlight-active');
        if (doScroll !== false) {
          scrollTargetToUpperMiddle(mark);
        }
      } else if (card) {
        const clauseIdx = card.getAttribute('data-clause-index');
        if (clauseIdx && clauseIdx >= 0) {
          const clauseNode = document.getElementById('clause-node-' + clauseIdx);
          if (clauseNode && doScroll !== false) {
            scrollTargetToUpperMiddle(clauseNode);
          }
        }
      }
    }

    function handleFindingClick(findingId, clauseIndex, event) {
      selectFinding(findingId, false);
      scrollToClause(clauseIndex, findingId, event);
    }

    function scrollToClause(clauseIndex, findingId, event) {
      if (event) event.stopPropagation();
      const mark = document.getElementById('evidence-target-' + findingId);
      if (mark) {
        scrollTargetToUpperMiddle(mark);
        mark.classList.add('evidence-highlight-active');
      } else if (clauseIndex >= 0) {
        const node = document.getElementById('clause-node-' + clauseIndex);
        if (node) {
          scrollTargetToUpperMiddle(node);
        }
      }
    }

    function stepFinding(direction) {
      if (visibleFindingIds.length === 0) return;
      activeFindingIndex = (activeFindingIndex + direction + visibleFindingIds.length) % visibleFindingIds.length;
      selectFinding(visibleFindingIds[activeFindingIndex], true);
    }

    function updateNavIndicator() {
      const ind = document.getElementById('nav-indicator');
      if (!ind) return;
      const total = visibleFindingIds.length;
      const curr = total > 0 ? activeFindingIndex + 1 : 0;
      ind.textContent = curr + ' / ' + total;
    }

    function toggleExecutiveSummary(btn) {
      const content = document.getElementById('executive-summary-content');
      if (!content) return;
      const isHidden = content.classList.contains('hidden');
      if (isHidden) {
        content.classList.remove('hidden');
        btn.textContent = '收起备忘 ▲';
      } else {
        content.classList.add('hidden');
        btn.textContent = '展开备忘 ▼';
      }
    }

    function toggleFindingDetails(detailsId, btn, event) {
      if (event) event.stopPropagation();
      const el = document.getElementById(detailsId);
      if (!el) return;
      const isHidden = el.classList.contains('hidden');
      const toggleText = btn.querySelector('.toggle-text') || btn;
      if (isHidden) {
        el.classList.remove('hidden');
        toggleText.textContent = '收起建议与条款 ▲';
      } else {
        el.classList.add('hidden');
        toggleText.textContent = '展开建议与条款 ▼';
      }
    }

    let allDetailsExpanded = false;
    function toggleAllFindingDetails() {
      allDetailsExpanded = !allDetailsExpanded;
      const btn = document.getElementById('toggle-all-details-btn');
      if (btn) {
        btn.textContent = allDetailsExpanded ? '收起全部建议' : '展开全部建议';
      }
      document.querySelectorAll('.finding-details-drawer').forEach(drawer => {
        if (allDetailsExpanded) {
          drawer.classList.remove('hidden');
        } else {
          drawer.classList.add('hidden');
        }
      });
      document.querySelectorAll('.toggle-text').forEach(t => {
        t.textContent = allDetailsExpanded ? '收起建议与条款 ▲' : '展开建议与条款 ▼';
      });
    }

    function toggleRevisionExpand(bodyId, btn, event) {
      if (event) event.stopPropagation();
      const body = document.getElementById(bodyId);
      if (!body) return;
      if (body.classList.contains('max-h-24')) {
        body.classList.remove('max-h-24');
        body.classList.add('max-h-none');
        btn.textContent = '收起';
      } else {
        body.classList.remove('max-h-none');
        body.classList.add('max-h-24');
        btn.textContent = '展开全文';
      }
    }

    function copyPureText(preId, btn, event) {
      if (event) event.stopPropagation();
      const el = document.getElementById(preId);
      if (!el) return;
      const text = (el.textContent || el.innerText || '').trim();
      if (!text) return;

      function onSuccess() {
        const origHtml = btn.dataset.origHtml || btn.innerHTML;
        btn.dataset.origHtml = origHtml;
        btn.innerHTML = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg><span>已复制</span>';
        btn.classList.add('bg-[#294766]', 'text-white');
        showToast('建议修改文本已复制到剪贴板');
        setTimeout(() => {
          btn.innerHTML = origHtml;
          btn.classList.remove('bg-[#294766]', 'text-white');
        }, 2000);
      }

      if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
          fallbackCopy(text, onSuccess);
        });
      } else {
        fallbackCopy(text, onSuccess);
      }
    }

    function fallbackCopy(text, cb) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        if (cb) cb();
      } catch (e) {
        window.prompt('请手动按 Ctrl+C / Cmd+C 复制以下建议条款文本：', text);
      }
      document.body.removeChild(ta);
    }

    // Keyboard Shortcuts (N: Next, P: Prev, T: TOC, Esc: Close)
    document.addEventListener('keydown', function(e) {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'n' || e.key === 'N') {
        stepFinding(1);
      } else if (e.key === 'p' || e.key === 'P') {
        stepFinding(-1);
      } else if (e.key === 't' || e.key === 'T') {
        toggleTocDrawer();
      } else if (e.key === 'Escape') {
        toggleTocDrawer(false);
      }
    });

    document.addEventListener('DOMContentLoaded', initFindingsList);
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      initFindingsList();
    }
  </script>
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
