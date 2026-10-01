import type { DocxCommentItem } from './contract-review.types';
import type { FindingItemViewModel } from './contract-review-html-finding.renderer';
import { buildSplitterScript } from './contract-review-html-client-splitter.script';
import { buildActionsScript } from './contract-review-html-client-actions.script';
import { buildFilterScript } from './contract-review-html-client-filter.script';
import { buildTocAndLangScript } from './contract-review-html-client-toc.script';

export interface BuildClientScriptInput {
  findings: FindingItemViewModel[];
  comments: DocxCommentItem[];
  commentApiUrl?: string;
  ruleSetInfo?: {
    ruleSetId: string;
    ruleSetVersion: string;
    ruleSetDigest?: string;
    ruleSetName?: string;
  };
  executionId?: string;
  artifactId?: string;
  sourceDocumentVersion?: string;
  sourceAttachmentId?: string;
  sourceDocumentHash?: string;
  clauses?: Array<{ index: number; title: string; clauseNumber?: string }>;
}

/**
 * Builds the client-side JavaScript for the interactive contract review report.
 */
export function buildContractReviewClientScript(input: BuildClientScriptInput): string {
  const { findings, comments, commentApiUrl = '', ruleSetInfo } = input;

  return `
  <script>
    const currentRuleSetId = ${JSON.stringify(ruleSetInfo?.ruleSetId || 'contract-review/nda')};
    const currentRuleSetVersion = ${JSON.stringify(ruleSetInfo?.ruleSetVersion || '1.0.0')};
    const currentRuleSetDigest = ${JSON.stringify(ruleSetInfo?.ruleSetDigest || '')};
    const currentExecutionId = ${JSON.stringify(input.executionId || '')};
    const currentArtifactId = ${JSON.stringify(input.artifactId || '')};
    const currentSourceDocumentVersion = ${JSON.stringify(input.sourceDocumentVersion || '')};
    const currentSourceAttachmentId = ${JSON.stringify(input.sourceAttachmentId || '')};
    const currentSourceDocumentHash = ${JSON.stringify(input.sourceDocumentHash || '')};
    const allClauses = ${JSON.stringify(
      (input.clauses || []).map((c) => ({
        clauseIndex: c.index,
        title: c.title,
        clauseNumber: c.clauseNumber || '',
      }))
    )};
    let activeFindingIndex = 0;
    let visibleFindingIds = [];
    const viewedFindingIds = new Set();
    const stagedComments = [];
    const allFindings = ${JSON.stringify(
      findings.map((f) => ({
        id: f.id,
        clauseIndex: f.clauseIndex ?? -1,
        severity: f.severity.toLowerCase(),
        issueType: f.issueType,
        title: f.title,
        impact: f.impact || f.suggestion || '',
      }))
    )};

    function initFindingsList() {
      visibleFindingIds = allFindings.map(f => f.id);
      if (visibleFindingIds.length > 0) viewedFindingIds.add(visibleFindingIds[0]);
      updateNavIndicator();
      if (typeof updateProgressIndicator === 'function') updateProgressIndicator();
      const hash = window.location.hash;
      if (hash && hash.startsWith('#comment-')) {
        const cid = hash.replace('#comment-', '');
        setTimeout(() => enterCommentDetailMode(cid, true), 50);
      } else if (visibleFindingIds.length > 0) {
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

    ${buildTocAndLangScript()}
    const setLanguageMode = setBilingualMode;

    const docxCommentsData = ${JSON.stringify(comments)};
    let currentWorkbenchMode = 'findings';
    let visibleCommentIds = ${JSON.stringify(comments.map((c) => c.id))};
    let activeCommentIndex = 0;

    function switchWorkbenchMode(mode) {
      if (typeof setPrimaryTab === 'function') {
        setPrimaryTab(mode);
        return;
      }
      currentWorkbenchMode = mode;
      updateNavIndicator();
    }

    function applyFilter(filterType, btn) {
      if (typeof setPrimaryTab === 'function') {
        if (filterType === 'all') resetAllFilters();
        else if (filterType === 'high') setSeverityFilter('high');
        else if (filterType === 'missing') setIssueTypeFilter('缺失');
        else if (filterType === 'verify') setIssueTypeFilter('歧义');
        else if (filterType === 'comments') setPrimaryTab('comments');
        return;
      }
    }

    function findFindingObject(rawId) {
      if (!rawId) return null;
      const idStr = String(rawId);
      const cleanId = idStr.replace(/^finding-/, '');
      return allFindings.find(f => {
        const fid = String(f.id);
        return fid === idStr ||
               fid === 'finding-' + idStr ||
               fid.replace(/^finding-/, '') === cleanId;
      });
    }

    function selectFinding(findingId, doScroll) {
      const f = findFindingObject(findingId);
      const normalizedFindingId = f ? f.id : findingId;
      const cleanId = String(findingId).replace(/^finding-/, '');

      viewedFindingIds.add(normalizedFindingId);
      if (typeof updateProgressIndicator === 'function') updateProgressIndicator();

      // 1. Highlight Right Finding Card
      document.querySelectorAll('.finding-card').forEach(c => {
        c.classList.remove('active-finding-card');
      });
      const card = document.getElementById(normalizedFindingId) ||
                   document.getElementById(findingId) ||
                   document.getElementById('finding-' + cleanId) ||
                   document.getElementById(cleanId);
      if (card) {
        card.classList.add('active-finding-card');
        if (doScroll !== false) {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      // Update Nav Stepper
      const idx = visibleFindingIds.indexOf(normalizedFindingId) >= 0
        ? visibleFindingIds.indexOf(normalizedFindingId)
        : visibleFindingIds.indexOf(findingId);
      if (idx >= 0) {
        activeFindingIndex = idx;
        updateNavIndicator();
      }

      // 2. Highlight Evidence in Left Document Paper
      document.querySelectorAll('.evidence-mark').forEach(m => {
        m.classList.remove('evidence-highlight-active');
      });

      const mark = document.getElementById('evidence-target-' + normalizedFindingId) ||
                   document.getElementById('evidence-target-' + findingId) ||
                   document.getElementById('evidence-target-finding-' + cleanId) ||
                   document.getElementById('evidence-target-' + cleanId);
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
      const f = findFindingObject(findingId);
      const normalizedFindingId = f ? f.id : findingId;
      const cleanId = String(findingId).replace(/^finding-/, '');
      const mark = document.getElementById('evidence-target-' + normalizedFindingId) ||
                   document.getElementById('evidence-target-' + findingId) ||
                   document.getElementById('evidence-target-finding-' + cleanId) ||
                   document.getElementById('evidence-target-' + cleanId);
      if (mark) {
        scrollTargetToUpperMiddle(mark);
        document.querySelectorAll('.evidence-mark').forEach(m => m.classList.remove('evidence-highlight-active'));
        mark.classList.add('evidence-highlight-active');
        setTimeout(() => mark.classList.remove('evidence-highlight-active'), 2500);
      } else if (clauseIndex >= 0) {
        const node = document.getElementById('clause-node-' + clauseIndex);
        if (node) {
          scrollTargetToUpperMiddle(node);
          node.classList.add('evidence-highlight-active');
          setTimeout(() => node.classList.remove('evidence-highlight-active'), 2500);
        }
      }
    }

    function stepFinding(direction) {
      if (currentWorkbenchMode === 'comments') {
        if (visibleCommentIds.length === 0) return;
        activeCommentIndex = (activeCommentIndex + direction + visibleCommentIds.length) % visibleCommentIds.length;
        selectComment(visibleCommentIds[activeCommentIndex], true);
        return;
      }
      if (visibleFindingIds.length === 0) return;
      activeFindingIndex = (activeFindingIndex + direction + visibleFindingIds.length) % visibleFindingIds.length;
      selectFinding(visibleFindingIds[activeFindingIndex], true);
    }

    function updateNavIndicator() {
      const ind = document.getElementById('nav-indicator');
      if (!ind) return;
      if (currentWorkbenchMode === 'comments') {
        const total = visibleCommentIds.length;
        const curr = total > 0 ? activeCommentIndex + 1 : 0;
        ind.textContent = curr + ' / ' + total;
      } else {
        const total = visibleFindingIds.length;
        const curr = total > 0 ? activeFindingIndex + 1 : 0;
        ind.textContent = curr + ' / ' + total;
      }
    }

    function toggleExecutiveSummary(btn) {
      const content = document.getElementById('executive-summary-content');
      if (!content) return;
      const isHidden = content.classList.contains('hidden');
      if (isHidden) {
        content.classList.remove('hidden');
        btn.textContent = '收起概览 ▲';
      } else {
        content.classList.add('hidden');
        btn.textContent = '展开概览 ▼';
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

    // Keyboard Shortcuts (N: Next, P: Prev, T: TOC, Esc: Close)
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeCommentModal();
        toggleTocDrawer(false);
        exitCommentDetailMode();
        if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
          document.activeElement.blur();
        }
        return;
      }
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'n' || e.key === 'N') {
        stepFinding(1);
      } else if (e.key === 'p' || e.key === 'P') {
        stepFinding(-1);
      } else if (e.key === 't' || e.key === 'T') {
        toggleTocDrawer();
      }
    });

    // Word Comment Interactions
    function renderTimelineComments(clauseIndex, targetCommentId) {
      const threadContainer = document.getElementById('comment-detail-thread-container');
      if (!threadContainer) return;

      // 1. 获取该条款下的所有批注（按条款聚合）
      let clauseComments = docxCommentsData.filter(x => x.clauseIndex === clauseIndex);
      if (clauseComments.length === 0) {
        const target = docxCommentsData.find(x => String(x.id) === String(targetCommentId));
        if (target) clauseComments = [target];
      }

      // 2. 严格按时间顺序（从早到晚，序号递增）正序排列，物理位置绝对不可改变！
      clauseComments.sort((a, b) => {
        if (a.date && b.date) {
          const tA = new Date(a.date).getTime();
          const tB = new Date(b.date).getTime();
          if (!isNaN(tA) && !isNaN(tB)) return tA - tB;
        }
        return Number(a.id) - Number(b.id);
      });

      const totalCount = clauseComments.length;
      let html = '';

      if (totalCount > 1) {
        html += '<div class="flex items-center justify-between text-[11px] text-slate-500 font-semibold pb-1 border-b border-slate-100 select-none">' +
          '<span>💬 该条款审阅批注流转（共 ' + totalCount + ' 条，按时间顺序排列）</span>' +
          '<span class="text-[10px] text-slate-400">历史批注默认收起，最新批注默认展开</span>' +
          '</div>';
      }

      clauseComments.forEach((c, idx) => {
        const isLast = idx === totalCount - 1;
        const isTarget = String(c.id) === String(targetCommentId);

        // 核心规则：默认展开最后面的批注（最新的一条），关闭前面的批注。
        // 早于最新批注的历史批注默认必须收起
        const shouldExpand = isLast;

        let rawAuthor = c.author || '审阅人';
        let authorName = rawAuthor;
        let authorTitle = '法务合规';
        const titleMatch = rawAuthor.match(/^([^(（]+)[(（]([^)）]+)[)）]$/);
        if (titleMatch) {
          authorName = titleMatch[1].trim();
          authorTitle = titleMatch[2].trim();
        }
        const initials = authorName.slice(0, 1);
        const dateStr = c.date ? c.date.replace('T', ' ').slice(0, 16) : '审阅流转中';

        html += '<div id="timeline-comment-card-' + c.id + '" class="timeline-comment-card rounded-lg border ' +
          (isTarget ? 'border-[#2E5882] ring-2 ring-[#2E5882]/25 shadow-md' : 'border-[#D9E1EC] shadow-card') +
          ' bg-white overflow-hidden transition-all duration-150" data-comment-id="' + c.id + '">';

        // Header: 矮化标题行高度，单行紧凑排列
        html += '<div class="px-2.5 py-1.5 ' + (isTarget ? 'bg-blue-50/40' : 'bg-[#F8FAFC]') +
          ' border-b border-[#E2E8F0] flex items-center justify-between gap-1.5 select-none cursor-pointer" onclick="toggleSingleCommentCard(this)">';
        html += '<div class="flex items-center gap-1.5 min-w-0">';
        html += '<div class="w-6 h-6 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-[10px] font-bold text-amber-900 shrink-0 shadow-2xs">' + escapeHtml(initials) + '</div>';
        html += '<div class="flex items-center gap-1 flex-nowrap min-w-0">';
        html += '<span class="text-xs font-bold text-[#1E293B] truncate max-w-[85px]">' + escapeHtml(authorName) + '</span>';
        html += '<span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200 shrink-0 leading-tight">' + escapeHtml(authorTitle) + '</span>';
        html += '<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-amber-50 text-amber-900 border border-amber-200 shrink-0 leading-tight">#' + c.id + '</span>';
        if (isLast) {
          html += '<span class="px-1.5 py-0.2 text-[10px] font-medium rounded ' + (c.isResolved ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200') + ' shrink-0 leading-tight">' + (c.isResolved ? '已解决' : '待处理') + '</span>';
        }
        html += '</div></div>';

        // Right side: date + collapse button
        html += '<div class="flex items-center gap-1.5 shrink-0">';
        html += '<div class="text-[11px] text-[#64748B] font-mono hidden sm:flex items-center gap-1"><svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>' + dateStr + '</span></div>';
        html += '<button type="button" id="btn-toggle-comment-' + c.id + '" onclick="event.stopPropagation(); toggleSingleCommentCard(this)" class="text-xs text-[#2E5882] hover:text-[#1A2D42] font-semibold flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded hover:bg-slate-200/50"><span id="btn-toggle-comment-text-' + c.id + '">' + (shouldExpand ? '收起意见 ▲' : '展开意见 ▼') + '</span></button>';
        html += '</div></div>';

        // Body
        html += '<div id="comment-body-wrapper-' + c.id + '" class="p-3 transition-all duration-200 ' + (shouldExpand ? '' : 'hidden') + '">';
        html += '<p class="text-sm text-[#1E293B] leading-relaxed select-text whitespace-pre-wrap font-normal">' + escapeHtml(c.text || '') + '</p>';
        html += '</div></div>';
      });

      threadContainer.innerHTML = html;
      threadContainer.classList.remove('hidden');
    }

    function toggleSingleCommentCard(targetEl) {
      const card = targetEl ? targetEl.closest('.timeline-comment-card') : null;
      if (!card) return;
      const cid = card.getAttribute('data-comment-id');
      if (cid) toggleSingleCommentCollapse(cid);
    }

    function toggleSingleCommentCollapse(commentId) {
      const wrapper = document.getElementById('comment-body-wrapper-' + commentId);
      const btnText = document.getElementById('btn-toggle-comment-text-' + commentId);
      if (!wrapper || !btnText) return;
      if (wrapper.classList.contains('hidden')) {
        wrapper.classList.remove('hidden');
        btnText.textContent = '收起意见 ▲';
        hideCommentHoverPopover(0);
      } else {
        wrapper.classList.add('hidden');
        btnText.textContent = '展开意见 ▼';
      }
    }

    function handleCommentClick(commentId, clauseIndex, event) {
      if (event) event.stopPropagation();
      enterCommentDetailMode(commentId, true);
    }

    function selectComment(commentId, doScroll) {
      enterCommentDetailMode(commentId, doScroll);
    }

    function findCommentMark(commentId) {
      if (!commentId && commentId !== 0) return null;
      const cid = String(commentId);
      let mark = document.getElementById('comment-target-' + cid);
      if (mark) return mark;
      const marks = document.querySelectorAll('.docx-comment-highlight');
      for (let i = 0; i < marks.length; i++) {
        const m = marks[i];
        if (m.getAttribute('data-comment-id') === cid) return m;
        const ids = (m.getAttribute('data-comment-ids') || '').split(',');
        if (ids.includes(cid)) return m;
      }
      return null;
    }

    function enterCommentDetailMode(commentId, doScroll) {
      hideCommentHoverPopover(0);
      const comment = docxCommentsData.find(c => String(c.id) === String(commentId));
      if (!comment) return;

      const execSummary = document.getElementById('executive-summary-card');
      const listHeader = document.getElementById('workbench-list-header');
      const findingsStream = document.getElementById('findings-stream');
      const detailWorkspace = document.getElementById('comment-detail-workspace');
      const createWorkspace = document.getElementById('comment-create-workspace');

      if (execSummary) execSummary.classList.add('hidden');
      if (listHeader) listHeader.classList.add('hidden');
      if (findingsStream) findingsStream.classList.add('hidden');
      if (createWorkspace) createWorkspace.classList.add('hidden');
      if (detailWorkspace) detailWorkspace.classList.remove('hidden');

      const quoteContainer = document.getElementById('comment-detail-quote-container');
      const quoteEl = document.getElementById('comment-detail-quote');
      if (comment.selectedText && comment.selectedText.trim()) {
        if (quoteContainer) quoteContainer.classList.remove('hidden');
        if (quoteEl) quoteEl.textContent = '"' + comment.selectedText + '"';
      } else {
        if (quoteContainer) quoteContainer.classList.add('hidden');
      }

      const currId = document.getElementById('comment-detail-current-id');
      if (currId) currId.value = comment.id;

      const currClause = document.getElementById('comment-detail-current-clause');
      if (currClause) currClause.value = String(comment.clauseIndex ?? 0);

      const replyText = document.getElementById('comment-detail-reply-text');
      if (replyText) replyText.value = '';

      // Reset author edit container to collapsed (hidden)
      const authorEditContainer = document.getElementById('comment-reply-author-container');
      if (authorEditContainer) authorEditContainer.classList.add('hidden');

      // 动态渲染时间正序的批注列表，默认展开最后一条，关闭前面的批注
      renderTimelineComments(comment.clauseIndex, comment.id);

      // 平滑滚动定位到当前激活卡片
      const activeCard = document.getElementById('timeline-comment-card-' + comment.id);
      if (activeCard && doScroll !== false) {
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // Stepper index
      const idx = visibleCommentIds.indexOf(comment.id);
      if (idx >= 0) {
        activeCommentIndex = idx;
        const stepperLabel = document.getElementById('comment-detail-stepper-label');
        if (stepperLabel) stepperLabel.textContent = (idx + 1) + ' / ' + visibleCommentIds.length;
      }

      // Highlight in Left Document Paper
      document.querySelectorAll('.docx-comment-highlight').forEach(m => m.classList.remove('docx-comment-highlight-active'));
      const mark = findCommentMark(comment.id);
      if (mark) {
        mark.classList.add('docx-comment-highlight-active');
        if (doScroll !== false) {
          scrollTargetToUpperMiddle(mark);
        }
      } else if (comment.clauseIndex !== undefined && comment.clauseIndex >= 0) {
        const node = document.getElementById('clause-node-' + comment.clauseIndex);
        if (node && doScroll !== false) scrollTargetToUpperMiddle(node);
      }
    }

    let isCommentDetailBodyCollapsed = false;
    function toggleCommentDetailBodyCollapse() {
      const cards = document.querySelectorAll('.timeline-comment-card');
      if (cards.length > 0) {
        const lastCard = cards[cards.length - 1];
        const cid = lastCard.getAttribute('data-comment-id');
        if (cid) toggleSingleCommentCollapse(cid);
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function toggleReplyAuthorEdit() {
      const container = document.getElementById('comment-reply-author-container');
      if (!container) return;
      const isHidden = container.classList.contains('hidden');
      if (isHidden) {
        container.classList.remove('hidden');
        const input = document.getElementById('comment-detail-reply-author');
        if (input) input.focus();
      } else {
        container.classList.add('hidden');
      }
    }

    function toggleCreateAuthorEdit() {
      const container = document.getElementById('comment-create-author-container');
      if (!container) return;
      const isHidden = container.classList.contains('hidden');
      if (isHidden) {
        container.classList.remove('hidden');
        const input = document.getElementById('comment-create-author');
        if (input) input.focus();
      } else {
        container.classList.add('hidden');
      }
    }

    function exitCommentDetailMode() {
      const detailWorkspace = document.getElementById('comment-detail-workspace');
      const listHeader = document.getElementById('workbench-list-header');
      const findingsStream = document.getElementById('findings-stream');
      if (detailWorkspace) detailWorkspace.classList.add('hidden');
      if (listHeader) listHeader.classList.remove('hidden');
      if (findingsStream) findingsStream.classList.remove('hidden');
      switchWorkbenchMode(currentWorkbenchMode || 'comments');
    }

    function stepCommentInDetail(direction) {
      if (visibleCommentIds.length === 0) return;
      activeCommentIndex = (activeCommentIndex + direction + visibleCommentIds.length) % visibleCommentIds.length;
      enterCommentDetailMode(visibleCommentIds[activeCommentIndex], true);
    }

    function locateCurrentDetailCommentInDoc() {
      const currId = document.getElementById('comment-detail-current-id');
      if (!currId || !currId.value) return;
      const mark = findCommentMark(currId.value);
      if (mark) {
        scrollTargetToUpperMiddle(mark);
        document.querySelectorAll('.docx-comment-highlight').forEach(m => m.classList.remove('docx-comment-highlight-active'));
        mark.classList.add('docx-comment-highlight-active');
        setTimeout(() => mark.classList.remove('docx-comment-highlight-active'), 2500);
      } else {
        const currClause = document.getElementById('comment-detail-current-clause');
        const clauseIdx = currClause ? parseInt(currClause.value, 10) : 0;
        const node = document.getElementById('clause-node-' + clauseIdx);
        if (node) {
          scrollTargetToUpperMiddle(node);
          node.classList.add('evidence-highlight-active');
          setTimeout(() => node.classList.remove('evidence-highlight-active'), 2500);
        }
      }
    }

    function scrollToCommentAnchor(commentId, clauseIndex, event) {
      if (event) event.stopPropagation();
      const mark = findCommentMark(commentId);
      if (mark) {
        scrollTargetToUpperMiddle(mark);
        document.querySelectorAll('.docx-comment-highlight').forEach(m => m.classList.remove('docx-comment-highlight-active'));
        mark.classList.add('docx-comment-highlight-active');
        setTimeout(() => mark.classList.remove('docx-comment-highlight-active'), 2500);
      } else if (typeof clauseIndex === 'number' && clauseIndex >= 0) {
        const node = document.getElementById('clause-node-' + clauseIndex);
        if (node) {
          scrollTargetToUpperMiddle(node);
          node.classList.add('evidence-highlight-active');
          setTimeout(() => node.classList.remove('evidence-highlight-active'), 2500);
        }
      }
    }

    function submitCommentDetailReply() {
      const authorInput = document.getElementById('comment-detail-reply-author');
      const textInput = document.getElementById('comment-detail-reply-text');
      const targetIdInput = document.getElementById('comment-detail-current-id');
      const clauseInput = document.getElementById('comment-detail-current-clause');

      const author = authorInput ? authorInput.value.trim() : '审阅人';
      const text = textInput ? textInput.value.trim() : '';
      const targetCommentId = targetIdInput ? targetIdInput.value : '';
      const clauseIndex = clauseInput ? parseInt(clauseInput.value, 10) : 0;

      if (!text) {
        alert('请输入针对此批注的答复说明或修改意见');
        if (textInput) textInput.focus();
        return;
      }

      const comment = docxCommentsData.find(c => String(c.id) === String(targetCommentId));
      const clauseHeadingEl = document.getElementById('clause-heading-' + clauseIndex);
      const clauseTitle = clauseHeadingEl ? (clauseHeadingEl.querySelector('.heading-zh')?.textContent || clauseHeadingEl.textContent || '').trim() : '';

      const payload = {
        action: 'append_comment',
        parentCommentId: targetCommentId,
        clauseIndex,
        clauseTitle,
        author,
        text,
        selectedText: comment ? comment.selectedText : '',
        timestamp: new Date().toISOString(),
      };

      const newCommentItem = {
        id: 'reply-' + Date.now(),
        parentCommentId: targetCommentId,
        clauseIndex,
        clauseTitle,
        author,
        text,
        date: new Date().toISOString(),
        selectedText: comment ? comment.selectedText : '',
        isResolved: false,
      };
      docxCommentsData.push(newCommentItem);
      stagedComments.push(newCommentItem);
      renderTimelineComments(clauseIndex, targetCommentId);
      if (typeof updateProgressIndicator === 'function') updateProgressIndicator();
      if (typeof updateSaveStatus === 'function') updateSaveStatus('有新批注已暂存', 'staged');

      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'DOCX_COMMENT_APPEND', payload }, '*');
      }

      const apiUrl = "${commentApiUrl || ''}";
      if (apiUrl) {
        fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(e => console.warn('Comment writeback API error:', e));
      }

      showToast('批注已暂存并返回清单');
      if (textInput) textInput.value = '';
      exitCommentDetailMode();
    }

    // Sidebar Comment Creation Mode (No Modal Popups!)
    function enterCommentCreateMode(selectedText, clauseIndex, initialText) {
      const execSummary = document.getElementById('executive-summary-card');
      const listHeader = document.getElementById('workbench-list-header');
      const findingsStream = document.getElementById('findings-stream');
      const detailWorkspace = document.getElementById('comment-detail-workspace');
      const createWorkspace = document.getElementById('comment-create-workspace');

      if (execSummary) execSummary.classList.add('hidden');
      if (listHeader) listHeader.classList.add('hidden');
      if (findingsStream) findingsStream.classList.add('hidden');
      if (detailWorkspace) detailWorkspace.classList.add('hidden');
      if (createWorkspace) createWorkspace.classList.remove('hidden');

      const quoteTextEl = document.getElementById('comment-create-quote-text');
      if (quoteTextEl) quoteTextEl.textContent = selectedText ? '"' + selectedText + '"' : '未圈选特定文字（通用批注）';

      const clauseIdxInput = document.getElementById('comment-create-clause-index');
      if (clauseIdxInput) clauseIdxInput.value = String(clauseIndex || 0);

      const clauseLabel = document.getElementById('comment-create-clause-label');
      if (clauseLabel) {
        clauseLabel.textContent = clauseIndex ? '关联条款 #' + clauseIndex : '全合同通用';
      }

      const textInput = document.getElementById('comment-create-text');
      if (textInput) {
        textInput.value = initialText || '';
        setTimeout(() => textInput.focus(), 120);
      }
    }

    function exitCommentCreateMode() {
      const createWorkspace = document.getElementById('comment-create-workspace');
      const listHeader = document.getElementById('workbench-list-header');
      const findingsStream = document.getElementById('findings-stream');

      if (createWorkspace) createWorkspace.classList.add('hidden');
      if (listHeader) listHeader.classList.remove('hidden');
      if (findingsStream) findingsStream.classList.remove('hidden');
      switchWorkbenchMode(currentWorkbenchMode || 'findings');
    }

    function submitCommentCreateFromSidebar() {
      const authorInput = document.getElementById('comment-create-author');
      const textInput = document.getElementById('comment-create-text');
      const clauseIdxInput = document.getElementById('comment-create-clause-index');
      const quoteTextEl = document.getElementById('comment-create-quote-text');

      const author = authorInput ? authorInput.value.trim() : '法务批注人';
      const text = textInput ? textInput.value.trim() : '';
      const clauseIndex = clauseIdxInput ? parseInt(clauseIdxInput.value, 10) : 0;
      const selectedText = quoteTextEl ? quoteTextEl.textContent.replace(/^"|"$/g, '').trim() : '';

      if (!text) {
        alert('请输入批注意见与修改要求');
        if (textInput) textInput.focus();
        return;
      }

      const clauseHeadingEl = document.getElementById('clause-heading-' + clauseIndex);
      const clauseTitle = clauseHeadingEl ? (clauseHeadingEl.querySelector('.heading-zh')?.textContent || clauseHeadingEl.textContent || '').trim() : '';

      const payload = {
        action: 'append_comment',
        clauseIndex,
        clauseTitle,
        selectedText,
        author,
        text,
        timestamp: new Date().toISOString(),
      };

      const newCommentItem = {
        id: 'user-' + Date.now(),
        clauseIndex,
        clauseTitle,
        selectedText,
        author,
        text,
        date: new Date().toISOString(),
        isResolved: false,
      };
      docxCommentsData.push(newCommentItem);
      stagedComments.push(newCommentItem);
      if (typeof updateProgressIndicator === 'function') updateProgressIndicator();
      if (typeof updateSaveStatus === 'function') updateSaveStatus('有新批注已暂存', 'staged');

      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'DOCX_COMMENT_APPEND', payload }, '*');
      }

      const apiUrl = "${commentApiUrl || ''}";
      if (apiUrl) {
        const btn = document.getElementById('comment-create-submit-btn');
        if (btn) btn.disabled = true;
        fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(res => res.json())
          .then(data => {
            showToast('批注已成功暂存并通知业务控制面');
            exitCommentCreateMode();
          })
          .catch(err => {
            console.error('Failed to append comment:', err);
            showToast('批注已暂存并提交业务控制面处理');
            exitCommentCreateMode();
          })
          .finally(() => {
            if (btn) btn.disabled = false;
          });
      } else {
        showToast('批注已成功暂存');
        exitCommentCreateMode();
      }
    }

    function openCommentFromSelection(event) {
      if (event) event.stopPropagation();
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (!text) return;
      const range = sel.getRangeAt(0);

      const docCol = document.getElementById('document-column');
      if (docCol && !docCol.contains(range.commonAncestorContainer)) {
        const bubble = document.getElementById('text-selection-bubble') || document.getElementById('text-selection-comment-bubble');
        if (bubble) bubble.style.display = 'none';
        return;
      }

      let node = range.commonAncestorContainer;
      while (node && node !== document.body) {
        if (node.nodeType === 1 && node.classList && node.classList.contains('clause-node')) {
          break;
        }
        node = node.parentNode;
      }
      const clauseIdx = (node && node.getAttribute) ? parseInt(node.getAttribute('data-clause-index') || '0', 10) : 0;

      enterCommentCreateMode(text, clauseIdx);

      const bubble = document.getElementById('text-selection-bubble') || document.getElementById('text-selection-comment-bubble');
      if (bubble) bubble.style.display = 'none';
    }

    // Fast Rich Hover Popover for Word Comments and Audit Risk Findings (Debounced & Readable)
    let popoverShowTimer = null;
    let popoverHideTimer = null;
    let currentHoverTarget = null;
    const HOVER_SHOW_DELAY = 220; // 220ms debounce: fixes "太快了", avoids accidental flickering on sweep
    const HOVER_HIDE_DELAY = 160;
    const popoverEl = document.getElementById('comment-hover-popover');

    function positionPopover(targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const popoverWidth = 330;
      let left = rect.left + rect.width / 2 - 30 + window.scrollX;
      if (left + popoverWidth > window.innerWidth - 20) {
        left = window.innerWidth - popoverWidth - 20 + window.scrollX;
      }
      if (left < 10) left = 10;

      let top = rect.top + window.scrollY - 10;
      popoverEl.classList.remove('arrow-top', 'arrow-bottom');

      const popoverHeight = popoverEl.offsetHeight || 135;
      if (rect.top > popoverHeight + 25) {
        popoverEl.classList.add('arrow-bottom');
        popoverEl.style.left = left + 'px';
        popoverEl.style.top = (rect.top + window.scrollY - popoverHeight - 10) + 'px';
      } else {
        popoverEl.classList.add('arrow-top');
        popoverEl.style.left = left + 'px';
        popoverEl.style.top = (rect.bottom + window.scrollY + 10) + 'px';
      }
    }

    function showCommentHoverPopover(targetEl, commentId) {
      if (!popoverEl) return;

      const timelineCard = targetEl.closest('.timeline-comment-card');
      if (timelineCard) {
        const cid = timelineCard.getAttribute('data-comment-id');
        const bodyWrapper = document.getElementById('comment-body-wrapper-' + cid);
        const isCollapsed = bodyWrapper && bodyWrapper.classList.contains('hidden');
        if (!isCollapsed) {
          // 已经展开的批注卡片，无需弹出重复 popup
          return;
        }
      } else {
        // 位于左侧文档区：如果右侧抽屉处于打开状态，且该批注已经在右侧展开可见，则无需弹出 popup
        const detailWorkspace = document.getElementById('comment-detail-workspace');
        if (detailWorkspace && !detailWorkspace.classList.contains('hidden')) {
          const bodyWrapper = document.getElementById('comment-body-wrapper-' + commentId);
          if (bodyWrapper && !bodyWrapper.classList.contains('hidden')) {
            return;
          }
        }
      }

      clearTimeout(popoverHideTimer);

      const rawIds = targetEl.getAttribute('data-comment-ids');
      const commentIds = rawIds ? rawIds.split(',') : [String(commentId)];
      const matchedComments = commentIds
        .map((id) => docxCommentsData.find((item) => String(item.id) === String(id)))
        .filter(Boolean);

      if (matchedComments.length === 0) return;

      popoverEl.classList.remove('popover-risk');

      if (matchedComments.length === 1) {
        const c = matchedComments[0];
        let rawAuthor = c.author || '审阅人';
        let authorName = rawAuthor;
        let authorTitle = '法务合规';
        const titleMatch = rawAuthor.match(/^([^(（]+)[(（]([^)）]+)[)）]$/);
        if (titleMatch) {
          authorName = titleMatch[1].trim();
          authorTitle = titleMatch[2].trim();
        }

        const dateStr = c.date ? c.date.replace('T', ' ').slice(0, 16) : '';
        const initials = authorName.slice(0, 1);

        popoverEl.innerHTML = \`
          <div class="flex items-start justify-between gap-2 pb-1.5 mb-1.5 border-b border-amber-200 select-none">
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-6 h-6 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-[11px] font-bold text-amber-900 shrink-0 shadow-2xs">
                \${initials}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-xs font-bold text-slate-900">\${escapeHtml(authorName)}</span>
                  <span class="text-[10px] px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 border border-blue-200 font-medium">\${escapeHtml(authorTitle)}</span>
                </div>
                \${dateStr ? '<div class="text-[10px] text-slate-500 font-mono">' + dateStr + '</div>' : ''}
              </div>
            </div>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-mono font-semibold shrink-0">
              批注 #\${c.id}
            </span>
          </div>
          <div class="text-xs text-slate-800 leading-relaxed font-normal select-text">
            \${escapeHtml(c.text || '')}
          </div>
          <div class="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-amber-800 select-none">
            <span class="font-medium">👉 点击可在侧边栏查看与回复</span>
            <span class="font-mono text-[9px] text-slate-400">点击进入</span>
          </div>
        \`;
      } else {
        // Multi-comment collection for the exact same text anchor
        let listHtml = '';
        matchedComments.forEach((c, idx) => {
          let rawAuthor = c.author || '审阅人';
          let authorName = rawAuthor;
          let authorTitle = '法务合规';
          const titleMatch = rawAuthor.match(/^([^(（]+)[(（]([^)）]+)[)）]$/);
          if (titleMatch) {
            authorName = titleMatch[1].trim();
            authorTitle = titleMatch[2].trim();
          }
          const initials = authorName.slice(0, 1);
          listHtml += \`
            <div class="pb-1.5 \${idx < matchedComments.length - 1 ? 'border-b border-amber-100 mb-1.5' : ''}">
              <div class="flex items-center justify-between gap-1 text-[11px] mb-0.5">
                <div class="flex items-center gap-1 min-w-0">
                  <span class="w-4 h-4 rounded-full bg-amber-100 text-[9px] font-bold text-amber-900 flex items-center justify-center shrink-0">\${initials}</span>
                  <span class="font-bold text-slate-800 truncate">\${escapeHtml(authorName)}</span>
                  <span class="text-[9px] px-1 rounded bg-blue-50 text-blue-700 shrink-0">\${escapeHtml(authorTitle)}</span>
                </div>
                <span class="text-[9px] font-mono text-amber-800">#\${c.id}</span>
              </div>
              <div class="text-xs text-slate-700 line-clamp-2 leading-relaxed">\${escapeHtml(c.text || '')}</div>
            </div>
          \`;
        });

        popoverEl.innerHTML = \`
          <div class="flex items-center justify-between pb-1.5 mb-1.5 border-b border-amber-200 select-none">
            <div class="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <span>💬 同一锚点批注合集</span>
              <span class="px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-950 font-mono text-[10px]">\${matchedComments.length} 条</span>
            </div>
            <span class="text-[10px] text-slate-400 font-mono">#\${matchedComments[0].id}~#\${matchedComments[matchedComments.length - 1].id}</span>
          </div>
          <div class="space-y-1 max-h-52 overflow-y-auto">
            \${listHtml}
          </div>
          <div class="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-amber-800 select-none">
            <span class="font-medium">👉 点击进入侧边栏展开完整审批讨论</span>
            <span class="font-mono text-[9px] text-slate-400">点击进入</span>
          </div>
        \`;
      }

      positionPopover(targetEl);
      popoverEl.classList.add('popover-visible');
      popoverEl.onclick = () => {
        handleCommentClick(matchedComments[0].id, matchedComments[0].clauseIndex);
        hideCommentHoverPopover(0);
      };
    }

    function showFindingHoverPopover(targetEl, findingId) {
      if (!popoverEl) return;
      const f = findFindingObject(findingId);
      if (!f) return;

      const isHigh = f.severity && String(f.severity).toLowerCase() === 'high';
      const severityText = isHigh ? '高风险' : '中风险';
      const severityBadgeClass = isHigh
        ? 'bg-red-50 text-red-700 border-red-200'
        : 'bg-amber-50 text-amber-700 border-amber-200';

      popoverEl.classList.add('popover-risk');
      popoverEl.innerHTML = \`
        <div class="flex items-start justify-between gap-2 pb-1.5 mb-1.5 border-b border-red-100 select-none">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-xs font-bold text-red-700 shrink-0">⚠️ 审查风险</span>
            <span class="text-xs font-bold text-slate-900 truncate">\${escapeHtml(f.title || '条款合规预警')}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <span class="text-[10px] px-1.5 py-0.2 rounded border font-semibold \${severityBadgeClass}">
              \${severityText}
            </span>
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
              \${escapeHtml(f.issueType || '合规项')}
            </span>
          </div>
        </div>
        <div class="text-xs text-slate-700 leading-relaxed font-normal select-text line-clamp-4">
          \${escapeHtml(f.impact || '该条款可能存在合规偏颇或履行隐患，建议核对法务风控要求。')}
        </div>
        <div class="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-red-700 select-none">
          <span class="font-medium">👉 点击进入侧边栏查看修改建议</span>
          <span class="font-mono text-[9px] text-slate-400">点击进入</span>
        </div>
      \`;

      positionPopover(targetEl);
      popoverEl.classList.add('popover-visible');
      popoverEl.onclick = () => {
        selectFinding(f.id, true);
        hideCommentHoverPopover(0);
      };
    }

    function hideCommentHoverPopover(delay = 160) {
      clearTimeout(popoverShowTimer);
      clearTimeout(popoverHideTimer);
      if (delay === 0) {
        if (popoverEl) popoverEl.classList.remove('popover-visible');
        currentHoverTarget = null;
        return;
      }
      popoverHideTimer = setTimeout(() => {
        if (popoverEl) {
          popoverEl.classList.remove('popover-visible');
        }
        currentHoverTarget = null;
      }, delay);
    }

    document.addEventListener('mouseover', function(e) {
      const commentTarget = e.target.closest('[data-comment-id]');
      const findingTarget = e.target.closest('[data-finding-id]') || e.target.closest('.evidence-mark');
      const target = commentTarget || findingTarget;

      if (target) {
        const timelineCard = commentTarget ? commentTarget.closest('.timeline-comment-card') : null;
        if (timelineCard) {
          const cid = timelineCard.getAttribute('data-comment-id');
          const bodyWrapper = document.getElementById('comment-body-wrapper-' + cid);
          const isCollapsed = bodyWrapper && bodyWrapper.classList.contains('hidden');
          // 仅收起状态下的批注卡片在鼠标悬停时显示批注内容浮层；已经展开的则不弹出重复浮层
          if (!isCollapsed) {
            hideCommentHoverPopover(0);
            return;
          }
        } else if (target.closest('#workbench-column')) {
          // 右侧工作台其他区域不显示浮层
          hideCommentHoverPopover(0);
          return;
        } else if (commentTarget) {
          // 左侧正文批注锚点：如果右侧抽屉处于展开状态且该批注内容已展开可见，则无需弹出浮层
          const detailWorkspace = document.getElementById('comment-detail-workspace');
          if (detailWorkspace && !detailWorkspace.classList.contains('hidden')) {
            const cid = commentTarget.getAttribute('data-comment-id');
            const bodyWrapper = document.getElementById('comment-body-wrapper-' + cid);
            if (bodyWrapper && !bodyWrapper.classList.contains('hidden')) {
              hideCommentHoverPopover(0);
              return;
            }
          }
        }

        clearTimeout(popoverHideTimer);
        if (currentHoverTarget === target) {
          return;
        }
        currentHoverTarget = target;
        clearTimeout(popoverShowTimer);
        popoverShowTimer = setTimeout(() => {
          if (commentTarget) {
            const cid = commentTarget.getAttribute('data-comment-id');
            if (cid) showCommentHoverPopover(commentTarget, cid);
          } else if (findingTarget) {
            const fid = findingTarget.getAttribute('data-finding-id') ||
                        findingTarget.querySelector('[data-finding-id]')?.getAttribute('data-finding-id');
            if (fid) showFindingHoverPopover(findingTarget, fid);
          }
        }, HOVER_SHOW_DELAY);
        return;
      }

      if (popoverEl && popoverEl.contains(e.target)) {
        clearTimeout(popoverHideTimer);
        return;
      }

      clearTimeout(popoverShowTimer);
      currentHoverTarget = null;
      hideCommentHoverPopover(HOVER_HIDE_DELAY);
    });

    // Floating Selection Dual Action Bubble Listeners (底稿区划词添加批注/写入审批，右侧风险/批注显示区严格不弹出)
    document.addEventListener('mouseup', function(e) {
      const bubble = document.getElementById('text-selection-bubble') || document.getElementById('text-selection-comment-bubble');
      if (!bubble) return;
      if (bubble.contains(e.target)) return;

      setTimeout(() => {
        if (typeof currentInteractionMode !== 'undefined' && currentInteractionMode === 'view') {
          bubble.style.display = 'none';
          return;
        }

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          bubble.style.display = 'none';
          return;
        }

        const text = sel.toString().trim();
        if (text.length < 2) {
          bubble.style.display = 'none';
          return;
        }

        const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        if (!range) {
          bubble.style.display = 'none';
          return;
        }

        // 仅在左侧底稿区 (#document-column) 选中文本才出现操作气泡
        const docCol = document.getElementById('document-column');
        if (!docCol) {
          bubble.style.display = 'none';
          return;
        }

        const container = range.commonAncestorContainer;
        const targetNode = container.nodeType === 1 ? container : container.parentNode;
        if (!docCol.contains(targetNode)) {
          bubble.style.display = 'none';
          return;
        }

        // 右侧审查检查台/风险/批注卡片区严格禁用添加气泡
        const workbenchCol = document.getElementById('workbench-column');
        if (workbenchCol && (workbenchCol.contains(e.target) || workbenchCol.contains(targetNode))) {
          bubble.style.display = 'none';
          return;
        }

        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          bubble.style.display = 'none';
          return;
        }

        bubble.style.display = 'inline-flex';
        bubble.style.left = (rect.left + rect.width / 2 + window.scrollX) + 'px';
        bubble.style.top = (rect.top + window.scrollY) + 'px';
      }, 60);
    });

    document.addEventListener('mousedown', function(e) {
      const bubble = document.getElementById('text-selection-bubble') || document.getElementById('text-selection-comment-bubble');
      if (bubble && !bubble.contains(e.target)) {
        bubble.style.display = 'none';
      }
    });

    ${buildSplitterScript()}
    ${buildActionsScript()}
    ${buildFilterScript()}

    function bootstrapContractWorkbench() {
      initFindingsList();
      if (typeof initSplitter === 'function') initSplitter();
      if (typeof initKeyboardShortcuts === 'function') initKeyboardShortcuts();
      if (typeof setPrimaryTab === 'function') setPrimaryTab('all');
      if (typeof updateProgressIndicator === 'function') updateProgressIndicator();
      if (typeof initInteractionMode === 'function') initInteractionMode();
    }

    document.addEventListener('DOMContentLoaded', bootstrapContractWorkbench);
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      bootstrapContractWorkbench();
    }
  </script>
  `;
}
