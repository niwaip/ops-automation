import type { DocxCommentItem } from './contract-review.types';
import type { FindingItemViewModel } from './contract-review-html-finding.renderer';

export interface BuildClientScriptInput {
  findings: FindingItemViewModel[];
  comments: DocxCommentItem[];
  commentApiUrl?: string;
}

/**
 * Builds the client-side JavaScript for the interactive contract review report.
 * Responsibilities:
 * - Findings / Comments stream switching & dual navigation
 * - In-place Comment Detail Workspace & reply submission
 * - Bilingual / translation toggle
 * - Outline drawer & TOC jump
 * - Text selection comment bubble
 */
export function buildContractReviewClientScript(input: BuildClientScriptInput): string {
  const { findings, comments, commentApiUrl = '' } = input;

  return `
  <script>
    let activeFindingIndex = 0;
    let visibleFindingIds = [];
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
      updateNavIndicator();
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

    function toggleTocDrawer(open) {
      const drawer = document.getElementById('toc-drawer');
      const backdrop = document.getElementById('toc-backdrop');
      if (!drawer || !backdrop) return;
      const isOpen = !drawer.classList.contains('-translate-x-full');
      const target = typeof open === 'boolean' ? open : !isOpen;
      if (target) {
        drawer.classList.remove('-translate-x-full');
        drawer.classList.add('translate-x-0');
        backdrop.classList.remove('opacity-0', 'pointer-events-none');
        backdrop.classList.add('opacity-100', 'pointer-events-auto');
        const searchInput = document.getElementById('toc-search');
        if (searchInput) setTimeout(() => searchInput.focus(), 150);
      } else {
        drawer.classList.add('-translate-x-full');
        drawer.classList.remove('translate-x-0');
        backdrop.classList.add('opacity-0', 'pointer-events-none');
        backdrop.classList.remove('opacity-100', 'pointer-events-auto');
      }
    }

    function toggleTocGroup(headerEl) {
      const group = headerEl.parentElement;
      const sub = group.querySelector('.toc-sub-list');
      if (!sub) return;
      if (sub.classList.contains('hidden')) {
        sub.classList.remove('hidden');
      } else {
        sub.classList.add('hidden');
      }
    }

    function filterTocItems(query) {
      const q = query.trim().toLowerCase();
      document.querySelectorAll('.toc-link').forEach(link => {
        const text = link.textContent.toLowerCase();
        if (!q || text.includes(q)) {
          link.classList.remove('hidden');
        } else {
          link.classList.add('hidden');
        }
      });
      document.querySelectorAll('.toc-chapter-group').forEach(grp => {
        const visibleSub = grp.querySelectorAll('.toc-link:not(.hidden)');
        if (visibleSub.length === 0 && q) {
          grp.classList.add('hidden');
        } else {
          grp.classList.remove('hidden');
        }
      });
    }

    function jumpToClauseNode(clauseIndex, event) {
      if (event) event.preventDefault();
      const node = document.getElementById('clause-node-' + clauseIndex);
      if (node) {
        scrollTargetToUpperMiddle(node);
        node.classList.add('evidence-highlight-active');
        setTimeout(() => node.classList.remove('evidence-highlight-active'), 2000);
      }
      toggleTocDrawer(false);
    }

    function scrollTargetToUpperMiddle(el) {
      const rect = el.getBoundingClientRect();
      const absoluteTop = window.scrollY + rect.top;
      const targetScroll = absoluteTop - (window.innerHeight * 0.28);
      window.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth'
      });
    }

    function setBilingualMode(mode) {
      const container = document.getElementById('document-paper-container');
      const btnBoth = document.getElementById('btn-lang-both');
      const btnZh = document.getElementById('btn-lang-zh');
      const btnJa = document.getElementById('btn-lang-ja');

      if (!container || !btnBoth || !btnZh || !btnJa) return;

      container.classList.remove('lang-bilingual', 'lang-zh-only', 'lang-ja-only');
      [btnBoth, btnZh, btnJa].forEach(b => {
        b.classList.remove('bg-[#243B53]', 'text-white', 'font-semibold', 'shadow-2xs');
        b.classList.add('text-slate-400');
      });

      if (mode === 'zh') {
        container.classList.add('lang-zh-only');
        btnZh.classList.add('bg-[#243B53]', 'text-white', 'font-semibold', 'shadow-2xs');
        btnZh.classList.remove('text-slate-400');
      } else if (mode === 'ja') {
        container.classList.add('lang-ja-only');
        btnJa.classList.add('bg-[#243B53]', 'text-white', 'font-semibold', 'shadow-2xs');
        btnJa.classList.remove('text-slate-400');
      } else {
        container.classList.add('lang-bilingual');
        btnBoth.classList.add('bg-[#243B53]', 'text-white', 'font-semibold', 'shadow-2xs');
        btnBoth.classList.remove('text-slate-400');
      }
    }

    const docxCommentsData = ${JSON.stringify(comments)};
    let currentWorkbenchMode = 'findings';
    let visibleCommentIds = ${JSON.stringify(comments.map((c) => c.id))};
    let activeCommentIndex = 0;

    function switchWorkbenchMode(mode) {
      currentWorkbenchMode = mode;
      const findingsTab = document.getElementById('tab-btn-findings');
      const commentsTab = document.getElementById('tab-btn-comments');
      const findingsContainer = document.getElementById('findings-cards-container');
      const commentsContainer = document.getElementById('comments-stream-container');
      const execSummary = document.getElementById('executive-summary-card');
      const listHeader = document.getElementById('workbench-list-header');
      const detailWorkspace = document.getElementById('comment-detail-workspace');

      if (detailWorkspace) detailWorkspace.classList.add('hidden');
      if (listHeader) listHeader.classList.remove('hidden');

      if (mode === 'comments') {
        if (findingsTab) findingsTab.classList.remove('active');
        if (commentsTab) commentsTab.classList.add('active');
        if (findingsContainer) findingsContainer.classList.add('hidden');
        if (commentsContainer) commentsContainer.classList.remove('hidden');
        if (execSummary) execSummary.classList.add('hidden');

        document.querySelectorAll('#filter-tabs button').forEach(b => {
          if (b.innerText.includes('批注')) b.classList.add('active-tab');
          else b.classList.remove('active-tab');
        });
      } else {
        if (commentsTab) commentsTab.classList.remove('active');
        if (findingsTab) findingsTab.classList.add('active');
        if (commentsContainer) commentsContainer.classList.add('hidden');
        if (findingsContainer) findingsContainer.classList.remove('hidden');
        if (execSummary) execSummary.classList.remove('hidden');
      }
      updateNavIndicator();
    }

    function applyFilter(filterType, btn) {
      document.querySelectorAll('#filter-tabs button').forEach(b => {
        b.classList.remove('active-tab');
      });
      if (btn) btn.classList.add('active-tab');

      if (filterType === 'comments') {
        switchWorkbenchMode('comments');
        return;
      }

      switchWorkbenchMode('findings');

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
    function handleCommentClick(commentId, clauseIndex, event) {
      if (event) event.stopPropagation();
      enterCommentDetailMode(commentId, true);
    }

    function selectComment(commentId, doScroll) {
      enterCommentDetailMode(commentId, doScroll);
    }

    function enterCommentDetailMode(commentId, doScroll) {
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

      // Parse Author Name and Title (e.g. "王建国 (法务合规总监)")
      let rawAuthor = comment.author || '审阅人';
      let authorName = rawAuthor;
      let authorTitle = '法务合规';
      const titleMatch = rawAuthor.match(/^([^(（]+)[(（]([^)）]+)[)）]$/);
      if (titleMatch) {
        authorName = titleMatch[1].trim();
        authorTitle = titleMatch[2].trim();
      }

      const authorNameEl = document.getElementById('comment-detail-author-name');
      if (authorNameEl) authorNameEl.textContent = authorName;

      const authorTitleEl = document.getElementById('comment-detail-author-title');
      if (authorTitleEl) authorTitleEl.textContent = authorTitle;

      const avatarEl = document.getElementById('comment-detail-avatar');
      if (avatarEl) avatarEl.textContent = authorName.slice(0, 1);

      const badgeEl = document.getElementById('comment-detail-badge');
      if (badgeEl) badgeEl.textContent = 'Word 原生批注 #' + comment.id;

      const statusBadge = document.getElementById('comment-detail-status-badge');
      if (statusBadge) {
        statusBadge.textContent = comment.isResolved ? '已解决' : '待处理';
        statusBadge.className = comment.isResolved
          ? 'px-2 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0'
          : 'px-2 py-0.5 text-[10px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0';
      }

      const clauseTag = document.getElementById('comment-detail-clause-tag');
      if (clauseTag) {
        clauseTag.textContent = comment.clauseNumber
          ? comment.clauseNumber + ' ' + (comment.clauseTitle || '')
          : '全合同通用审查';
      }

      const dateEl = document.getElementById('comment-detail-date');
      if (dateEl) {
        const dateStr = comment.date ? comment.date.replace('T', ' ').slice(0, 16) : '审阅流转中';
        const span = dateEl.querySelector('span');
        if (span) span.textContent = dateStr;
        else dateEl.textContent = dateStr;
      }

      const quoteContainer = document.getElementById('comment-detail-quote-container');
      const quoteEl = document.getElementById('comment-detail-quote');
      if (comment.selectedText && comment.selectedText.trim()) {
        if (quoteContainer) quoteContainer.classList.remove('hidden');
        if (quoteEl) quoteEl.textContent = '"' + comment.selectedText + '"';
      } else {
        if (quoteContainer) quoteContainer.classList.add('hidden');
      }

      const bodyEl = document.getElementById('comment-detail-body');
      if (bodyEl) bodyEl.textContent = comment.text || '';

      // Reset collapse state
      const bodyWrapper = document.getElementById('comment-detail-body-wrapper');
      const toggleBtnText = document.getElementById('btn-toggle-comment-body-text');
      if (bodyWrapper) bodyWrapper.style.display = 'block';
      if (toggleBtnText) toggleBtnText.textContent = '收起意见 ▲';
      isCommentDetailBodyCollapsed = false;

      const currId = document.getElementById('comment-detail-current-id');
      if (currId) currId.value = comment.id;

      const currClause = document.getElementById('comment-detail-current-clause');
      if (currClause) currClause.value = String(comment.clauseIndex ?? 0);

      const replyText = document.getElementById('comment-detail-reply-text');
      if (replyText) replyText.value = '';

      // Reset author edit container to collapsed (hidden)
      const authorEditContainer = document.getElementById('comment-reply-author-container');
      if (authorEditContainer) authorEditContainer.classList.add('hidden');

      // Populate threaded comments on the same clause (e.g. 2号, 3号 批注)
      const clauseComments = docxCommentsData.filter(x => x.clauseIndex === comment.clauseIndex && String(x.id) !== String(comment.id));
      const threadContainer = document.getElementById('comment-detail-thread-container');
      if (threadContainer) {
        if (clauseComments.length > 0) {
          threadContainer.classList.remove('hidden');
          let threadHtml = '<div class="pt-1 text-[11px] font-bold text-slate-500 flex items-center gap-1"><span>💬 该条款其他审阅批注 (' + clauseComments.length + ')</span></div>';
          clauseComments.forEach(otherC => {
            let oRaw = otherC.author || '审阅人';
            let oName = oRaw;
            let oTitle = '法务合规';
            const tm = oRaw.match(/^([^(（]+)[(（]([^)）]+)[)）]$/);
            if (tm) { oName = tm[1].trim(); oTitle = tm[2].trim(); }
            const oInitial = oName.slice(0, 1);
            const oDate = otherC.date ? otherC.date.replace('T', ' ').slice(0, 16) : '';
            threadHtml += \`
              <div class="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1 shadow-2xs hover:border-amber-300 transition cursor-pointer" onclick="enterCommentDetailMode('\${otherC.id}', true)">
                <div class="flex items-center justify-between gap-1 text-[11px]">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <div class="w-5 h-5 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-[10px] font-bold text-amber-900 shrink-0">\${oInitial}</div>
                    <span class="font-bold text-slate-800 truncate">\${escapeHtml(oName)}</span>
                    <span class="px-1 py-0.2 rounded text-[9px] bg-blue-50 text-blue-800 border border-blue-100 shrink-0">\${oTitle}</span>
                    <span class="px-1 py-0.2 rounded text-[9px] bg-amber-50 text-amber-900 font-mono font-medium shrink-0">#\${otherC.id}</span>
                  </div>
                  <span class="text-[10px] text-slate-400 font-mono shrink-0">\${oDate}</span>
                </div>
                <div class="text-xs text-slate-700 line-clamp-2 leading-relaxed pl-6.5">\${escapeHtml(otherC.text || '')}</div>
              </div>
            \`;
          });
          threadContainer.innerHTML = threadHtml;
        } else {
          threadContainer.classList.add('hidden');
          threadContainer.innerHTML = '';
        }
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
      const mark = document.getElementById('comment-target-' + comment.id);
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
      isCommentDetailBodyCollapsed = !isCommentDetailBodyCollapsed;
      const wrapper = document.getElementById('comment-detail-body-wrapper');
      const btnText = document.getElementById('btn-toggle-comment-body-text');
      if (!wrapper || !btnText) return;
      if (isCommentDetailBodyCollapsed) {
        wrapper.style.display = 'none';
        btnText.textContent = '展开意见 ▼';
      } else {
        wrapper.style.display = 'block';
        btnText.textContent = '收起意见 ▲';
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
      const mark = document.getElementById('comment-target-' + currId.value);
      if (mark) {
        scrollTargetToUpperMiddle(mark);
        mark.classList.add('docx-comment-highlight-active');
        setTimeout(() => mark.classList.remove('docx-comment-highlight-active'), 2500);
      } else {
        const currClause = document.getElementById('comment-detail-current-clause');
        const clauseIdx = currClause ? parseInt(currClause.value, 10) : 0;
        const node = document.getElementById('clause-node-' + clauseIdx);
        if (node) scrollTargetToUpperMiddle(node);
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
      const payload = {
        action: 'append_comment',
        parentCommentId: targetCommentId,
        clauseIndex,
        author,
        text,
        selectedText: comment ? comment.selectedText : '',
        timestamp: new Date().toISOString(),
      };

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

      showToast('批注答复已提交，后台业务控制面正在受控回写 Word OpenXML...');
      if (textInput) textInput.value = '';
    }

    // Sidebar Comment Creation Mode (No Modal Popups!)
    function enterCommentCreateMode(selectedText, clauseIndex) {
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
        textInput.value = '';
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

      const author = authorInput ? authorInput.value.trim() : '法务审阅人';
      const text = textInput ? textInput.value.trim() : '';
      const clauseIndex = clauseIdxInput ? parseInt(clauseIdxInput.value, 10) : 0;
      const selectedText = quoteTextEl ? quoteTextEl.textContent.replace(/^"|"$/g, '').trim() : '';

      if (!text) {
        alert('请输入批注意见与修改要求');
        if (textInput) textInput.focus();
        return;
      }

      const payload = {
        action: 'append_comment',
        clauseIndex,
        selectedText,
        author,
        text,
        timestamp: new Date().toISOString(),
      };

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
            showToast('批注已成功提交并回写 Word！');
            exitCommentCreateMode();
          })
          .catch(err => {
            console.error('Failed to append comment:', err);
            showToast('批注已提交业务控制面处理');
            exitCommentCreateMode();
          })
          .finally(() => {
            if (btn) btn.disabled = false;
          });
      } else {
        showToast('批注请求已派发（后台受控回写）');
        exitCommentCreateMode();
      }
    }

    function openCommentFromSelection(event) {
      if (event) event.stopPropagation();
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      const range = sel.getRangeAt(0);

      let node = range.commonAncestorContainer;
      while (node && node !== document.body) {
        if (node.nodeType === 1 && node.classList && node.classList.contains('clause-node')) {
          break;
        }
        node = node.parentNode;
      }
      const clauseIdx = (node && node.getAttribute) ? parseInt(node.getAttribute('data-clause-index') || '0', 10) : 0;

      enterCommentCreateMode(text, clauseIdx);

      const bubble = document.getElementById('text-selection-comment-bubble');
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

      if (rect.top > 160) {
        popoverEl.classList.add('arrow-bottom');
        popoverEl.style.left = left + 'px';
        popoverEl.style.top = (top - 125) + 'px';
      } else {
        popoverEl.classList.add('arrow-top');
        popoverEl.style.left = left + 'px';
        popoverEl.style.top = (rect.bottom + window.scrollY + 10) + 'px';
      }
    }

    function showCommentHoverPopover(targetEl, commentId) {
      if (!popoverEl) return;
      clearTimeout(popoverHideTimer);
      const c = docxCommentsData.find(item => String(item.id) === String(commentId));
      if (!c) return;

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

      popoverEl.classList.remove('popover-risk');
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

      positionPopover(targetEl);
      popoverEl.classList.add('popover-visible');
      popoverEl.onclick = () => {
        handleCommentClick(c.id, c.clauseIndex);
        hideCommentHoverPopover(0);
      };
    }

    function showFindingHoverPopover(targetEl, findingId) {
      if (!popoverEl) return;
      clearTimeout(popoverHideTimer);
      const f = allFindings.find(item => String(item.id) === String(findingId));
      if (!f) return;

      const isHigh = f.severity === 'high';
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
      const findingTarget = e.target.closest('[data-finding-id]');
      const target = commentTarget || findingTarget;

      if (target) {
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
            const fid = findingTarget.getAttribute('data-finding-id');
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

    // Floating Selection Comment Bubble Listeners
    document.addEventListener('mouseup', function(e) {
      const bubble = document.getElementById('text-selection-comment-bubble');
      if (!bubble) return;
      if (bubble.contains(e.target)) return;

      setTimeout(() => {
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
        const range = sel.getRangeAt(0);
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
      const bubble = document.getElementById('text-selection-comment-bubble');
      if (bubble && !bubble.contains(e.target)) {
        bubble.style.display = 'none';
      }
    });

    document.addEventListener('DOMContentLoaded', initFindingsList);
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      initFindingsList();
    }
  </script>
  `;
}
