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

      if (execSummary) execSummary.classList.add('hidden');
      if (listHeader) listHeader.classList.add('hidden');
      if (findingsStream) findingsStream.classList.add('hidden');
      if (detailWorkspace) detailWorkspace.classList.remove('hidden');

      // Populate Comment Data
      const badge = document.getElementById('comment-detail-badge');
      if (badge) badge.textContent = 'Word 批注 · #' + comment.id;

      const statusBadge = document.getElementById('comment-detail-status-badge');
      if (statusBadge) {
        statusBadge.textContent = comment.isResolved ? '已解决' : '待处理';
        statusBadge.className = comment.isResolved
          ? 'px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-600 border border-slate-200'
          : 'px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200';
      }

      const authorEl = document.getElementById('comment-detail-author');
      if (authorEl) authorEl.textContent = comment.author || '审阅人';

      const avatarEl = document.getElementById('comment-detail-avatar');
      if (avatarEl) avatarEl.textContent = (comment.author || '阅').trim().slice(0, 1);

      const clauseTag = document.getElementById('comment-detail-clause-tag');
      if (clauseTag) clauseTag.textContent = comment.clauseNumber ? '条款 ' + comment.clauseNumber : '';

      const dateEl = document.getElementById('comment-detail-date');
      if (dateEl) dateEl.textContent = comment.date ? comment.date.replace('T', ' ').slice(0, 16) : '';

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

      const currId = document.getElementById('comment-detail-current-id');
      if (currId) currId.value = comment.id;

      const currClause = document.getElementById('comment-detail-current-clause');
      if (currClause) currClause.value = String(comment.clauseIndex ?? 0);

      const replyText = document.getElementById('comment-detail-reply-text');
      if (replyText) replyText.value = '';

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

    function scrollToCommentAnchor(commentId, clauseIndex, event) {
      if (event) event.stopPropagation();
      const mark = document.getElementById('comment-target-' + commentId);
      if (mark) {
        scrollTargetToUpperMiddle(mark);
        mark.classList.add('docx-comment-highlight-active');
        setTimeout(() => mark.classList.remove('docx-comment-highlight-active'), 2500);
      } else if (clauseIndex >= 0) {
        const node = document.getElementById('clause-node-' + clauseIndex);
        if (node) scrollTargetToUpperMiddle(node);
      }
    }

    function openGlobalCommentModal() {
      const modal = document.getElementById('append-comment-modal');
      const box = document.getElementById('append-comment-modal-box');
      if (!modal || !box) return;

      const clauseSelect = document.getElementById('comment-modal-clause-select');
      const quoteInput = document.getElementById('comment-modal-quote');
      const targetIdInput = document.getElementById('comment-modal-target-id');
      const textInput = document.getElementById('comment-modal-text');

      if (clauseSelect) clauseSelect.value = '0';
      if (quoteInput) quoteInput.value = '';
      if (targetIdInput) targetIdInput.value = '';
      if (textInput) {
        textInput.value = '';
        setTimeout(() => textInput.focus(), 150);
      }

      modal.classList.remove('opacity-0', 'pointer-events-none');
      modal.classList.add('opacity-100', 'pointer-events-auto');
      box.classList.remove('scale-95');
      box.classList.add('scale-100');
    }

    function openClauseCommentModal(clauseIndex, clauseHeading, event) {
      if (event) event.stopPropagation();
      openGlobalCommentModal();
      const clauseSelect = document.getElementById('comment-modal-clause-select');
      if (clauseSelect) clauseSelect.value = String(clauseIndex);
    }

    function openCommentReplyModal(commentId, author, quoteText, clauseIndex, event) {
      if (event) event.stopPropagation();
      openGlobalCommentModal();
      const clauseSelect = document.getElementById('comment-modal-clause-select');
      const quoteInput = document.getElementById('comment-modal-quote');
      const targetIdInput = document.getElementById('comment-modal-target-id');

      if (clauseSelect) clauseSelect.value = String(clauseIndex);
      if (quoteInput) quoteInput.value = quoteText || '';
      if (targetIdInput) targetIdInput.value = commentId;
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
      const clauseIdx = (node && node.getAttribute) ? node.getAttribute('data-clause-index') : '0';

      openGlobalCommentModal();
      const clauseSelect = document.getElementById('comment-modal-clause-select');
      const quoteInput = document.getElementById('comment-modal-quote');
      if (clauseSelect) clauseSelect.value = String(clauseIdx || '0');
      if (quoteInput) quoteInput.value = text;

      const bubble = document.getElementById('text-selection-comment-bubble');
      if (bubble) bubble.style.display = 'none';
    }

    function closeCommentModal() {
      const modal = document.getElementById('append-comment-modal');
      const box = document.getElementById('append-comment-modal-box');
      if (!modal || !box) return;
      modal.classList.add('opacity-0', 'pointer-events-none');
      modal.classList.remove('opacity-100', 'pointer-events-auto');
      box.classList.add('scale-95');
      box.classList.remove('scale-100');
    }

    function submitAppendComment() {
      const authorInput = document.getElementById('comment-modal-author');
      const textInput = document.getElementById('comment-modal-text');
      const clauseSelect = document.getElementById('comment-modal-clause-select');
      const quoteInput = document.getElementById('comment-modal-quote');
      const targetIdInput = document.getElementById('comment-modal-target-id');

      const author = authorInput ? authorInput.value.trim() : '审阅人';
      const text = textInput ? textInput.value.trim() : '';
      const clauseIndex = clauseSelect ? parseInt(clauseSelect.value, 10) : 0;
      const selectedText = quoteInput ? quoteInput.value.trim() : '';
      const targetId = targetIdInput ? targetIdInput.value : '';

      if (!text) {
        alert('请输入批注意见与修改建议');
        if (textInput) textInput.focus();
        return;
      }

      const payload = {
        action: 'append_comment',
        clauseIndex,
        selectedText,
        parentCommentId: targetId || undefined,
        author,
        text,
        timestamp: new Date().toISOString(),
      };

      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'DOCX_COMMENT_APPEND', payload }, '*');
      }

      const apiUrl = "${commentApiUrl || ''}";
      if (apiUrl) {
        const btn = document.getElementById('comment-modal-submit-btn');
        if (btn) btn.disabled = true;
        fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(res => res.json())
          .then(data => {
            showToast('批注已回写至 Word 文档，文档版本已更新！');
            closeCommentModal();
          })
          .catch(err => {
            console.error('Failed to append comment:', err);
            showToast('批注请求已发送（将在控制面处理）');
            closeCommentModal();
          })
          .finally(() => {
            if (btn) btn.disabled = false;
          });
      } else {
        showToast('批注请求已派发（业务控制面已接收）');
        closeCommentModal();
      }
    }

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
