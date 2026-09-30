/**
 * Client-side script module for Actionable Workbench Operations & Keyboard Shortcuts.
 * Transforms passive reading into instant professional contract processing.
 */
export function buildActionsScript(): string {
  return `
    // Finding & Comment Action Handlers
    const findingStates = new Map(); // id -> { status: 'pending'|'accepted'|'resolved'|'ignored', ignoreReason?: string, inNegotiation?: boolean }

    function getFindingState(id) {
      if (!findingStates.has(id)) {
        findingStates.set(id, { status: 'pending', inNegotiation: false });
      }
      return findingStates.get(id);
    }

    function getFindingCardElement(findingId) {
      return document.getElementById(findingId) || document.getElementById('finding-card-' + findingId);
    }

    function navNextFinding() {
      if (typeof stepFinding === 'function') stepFinding(1);
    }

    function navPrevFinding() {
      if (typeof stepFinding === 'function') stepFinding(-1);
    }

    function acceptFinding(findingId, event) {
      if (event) event.stopPropagation();
      const state = getFindingState(findingId);
      state.status = 'accepted';
      updateFindingCardStatusUI(findingId);

      // Copy suggested revision text if available
      const card = getFindingCardElement(findingId);
      const revisionEl = card ? card.querySelector('.suggested-revision-text') : null;
      if (revisionEl && revisionEl.textContent) {
        navigator.clipboard?.writeText(revisionEl.textContent.trim());
        showToast('已采纳建议并复制修改文本至剪贴板');
      } else {
        showToast('已标记采纳该条建议');
      }

      if (typeof triggerFilterUpdate === 'function') triggerFilterUpdate();
    }

    function resolveFinding(findingId, event) {
      if (event) event.stopPropagation();
      const state = getFindingState(findingId);
      state.status = state.status === 'resolved' ? 'pending' : 'resolved';
      updateFindingCardStatusUI(findingId);
      showToast(state.status === 'resolved' ? '已标记为线下核实完成' : '已重置为待处理状态');
      if (typeof triggerFilterUpdate === 'function') triggerFilterUpdate();
    }

    function promptIgnoreFinding(findingId, event) {
      if (event) event.stopPropagation();
      const reason = prompt('请输入或选择忽略原因（例如：商业特批、不适用本项目、法务已线下确认）：', '商业条款特批');
      if (reason === null) return; // user cancelled

      const state = getFindingState(findingId);
      state.status = 'ignored';
      state.ignoreReason = reason.trim() || '法务已豁免';
      updateFindingCardStatusUI(findingId);
      showToast('已忽略该项（原因：' + state.ignoreReason + '）');
      if (typeof triggerFilterUpdate === 'function') triggerFilterUpdate();
    }

    function reopenFinding(findingId, event) {
      if (event) event.stopPropagation();
      const state = getFindingState(findingId);
      state.status = 'pending';
      state.ignoreReason = undefined;
      updateFindingCardStatusUI(findingId);
      showToast('已重开为待处理状态');
      if (typeof triggerFilterUpdate === 'function') triggerFilterUpdate();
    }

    function toggleNegotiation(findingId, event) {
      if (event) event.stopPropagation();
      const state = getFindingState(findingId);
      state.inNegotiation = !state.inNegotiation;
      updateFindingCardStatusUI(findingId);
      showToast(state.inNegotiation ? '已加入甲乙双方谈判备忘清单' : '已从谈判清单中移除');
      if (typeof triggerFilterUpdate === 'function') triggerFilterUpdate();
    }

    function copyFindingSuggestion(findingId, event) {
      if (event) event.stopPropagation();
      const card = getFindingCardElement(findingId);
      const revisionEl = card ? card.querySelector('.suggested-revision-text') : null;
      if (revisionEl && revisionEl.textContent) {
        navigator.clipboard?.writeText(revisionEl.textContent.trim()).then(() => {
          showToast('已复制推荐条款至剪贴板');
        });
      } else {
        showToast('暂无推荐修改文本');
      }
    }

    function updateFindingCardStatusUI(findingId) {
      const card = getFindingCardElement(findingId);
      if (!card) return;
      const state = getFindingState(findingId);
      const badge = card.querySelector('.finding-status-badge');
      const approvalBtn = document.getElementById('btn-approval-' + findingId);
      const approvalBtnText = document.getElementById('btn-approval-text-' + findingId);
      const resolveBtn = document.getElementById('btn-resolve-' + findingId);
      const resolveBtnText = document.getElementById('btn-resolve-text-' + findingId);

      card.classList.remove('status-accepted', 'status-resolved', 'status-ignored');

      if (state.approvalOpinion) {
        card.classList.add('status-accepted');
        if (badge) {
          badge.className = 'finding-status-badge px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300';
          badge.textContent = '已确认（写入审批）';
        }
        if (approvalBtn) {
          approvalBtn.className = 'action-btn action-btn-secondary bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold';
        }
        if (approvalBtnText) {
          approvalBtnText.textContent = '已写入审批 ✎';
        }
        if (resolveBtn) {
          resolveBtn.className = 'btn-resolve-action text-[11px] text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-0.5 rounded border border-slate-200 bg-white transition cursor-pointer flex items-center gap-1';
        }
        if (resolveBtnText) {
          resolveBtnText.textContent = '标记核实';
        }
      } else if (state.status === 'accepted') {
        card.classList.add('status-accepted');
        if (badge) {
          badge.className = 'finding-status-badge px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300';
          badge.textContent = '已采纳修改';
        }
        if (approvalBtn) {
          approvalBtn.className = 'action-btn action-btn-secondary text-[#2E5882] hover:bg-blue-50 border-blue-200';
        }
        if (approvalBtnText) {
          approvalBtnText.textContent = '写入审批';
        }
        if (resolveBtnText) {
          resolveBtnText.textContent = '标记核实';
        }
      } else if (state.status === 'resolved') {
        card.classList.add('status-resolved');
        if (badge) {
          badge.className = 'finding-status-badge px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-300';
          badge.textContent = '已线下核实';
        }
        if (approvalBtn) {
          approvalBtn.className = 'action-btn action-btn-secondary text-[#2E5882] hover:bg-blue-50 border-blue-200';
        }
        if (approvalBtnText) {
          approvalBtnText.textContent = '写入审批';
        }
        if (resolveBtn) {
          resolveBtn.className = 'btn-resolve-action text-[11px] text-blue-800 bg-blue-50 border border-blue-300 font-semibold px-2 py-0.5 rounded transition cursor-pointer flex items-center gap-1';
        }
        if (resolveBtnText) {
          resolveBtnText.textContent = '已核实 ✓';
        }
      } else if (state.status === 'ignored') {
        card.classList.add('status-ignored');
        if (badge) {
          badge.className = 'finding-status-badge px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300';
          badge.textContent = '已忽略（' + (state.ignoreReason || '豁免') + '）';
        }
        if (resolveBtn) {
          resolveBtn.className = 'btn-resolve-action text-[11px] text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-0.5 rounded border border-slate-200 bg-white transition cursor-pointer flex items-center gap-1';
        }
        if (resolveBtnText) {
          resolveBtnText.textContent = '标记核实';
        }
      } else {
        if (badge) {
          badge.className = 'finding-status-badge px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200';
          badge.textContent = '待处理';
        }
        if (approvalBtn) {
          approvalBtn.className = 'action-btn action-btn-secondary text-[#2E5882] hover:bg-blue-50 border-blue-200';
        }
        if (approvalBtnText) {
          approvalBtnText.textContent = '写入审批';
        }
        if (resolveBtn) {
          resolveBtn.className = 'btn-resolve-action text-[11px] text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-0.5 rounded border border-slate-200 bg-white transition cursor-pointer flex items-center gap-1';
        }
        if (resolveBtnText) {
          resolveBtnText.textContent = '标记核实';
        }
      }

      // Update negotiation button indicator
      const negBtn = card.querySelector('.btn-action-negotiate');
      if (negBtn) {
        if (state.inNegotiation) {
          negBtn.classList.add('text-amber-800', 'bg-amber-100', 'border-amber-300', 'font-bold');
          negBtn.setAttribute('title', '已在谈判清单中（点击移出）');
        } else {
          negBtn.classList.remove('text-amber-800', 'bg-amber-100', 'border-amber-300', 'font-bold');
          negBtn.setAttribute('title', '加入谈判清单');
        }
      }
    }

    function toggleApprovalOpinionBox(findingId, event) {
      if (event) event.stopPropagation();
      const box = document.getElementById('approval-box-' + findingId);
      if (!box) return;
      const isHidden = box.classList.contains('hidden');
      if (isHidden) {
        box.classList.remove('hidden');
        const ta = document.getElementById('approval-text-' + findingId);
        if (ta) {
          const state = getFindingState(findingId);
          if (state.approvalOpinion) {
            ta.value = state.approvalOpinion;
          }
          setTimeout(() => {
            ta.focus();
            ta.select();
          }, 60);
        }
      } else {
        box.classList.add('hidden');
      }
    }

    function cancelApprovalEdit(findingId, event) {
      if (event) event.stopPropagation();
      const box = document.getElementById('approval-box-' + findingId);
      if (box) box.classList.add('hidden');
    }

    function confirmApprovalOpinion(findingId, event) {
      if (event) event.stopPropagation();
      const ta = document.getElementById('approval-text-' + findingId);
      const text = ta ? ta.value.trim() : '';
      if (!text) {
        alert('请输入审批修改意见');
        if (ta) ta.focus();
        return;
      }

      const state = getFindingState(findingId);
      state.status = 'accepted';
      state.approvalOpinion = text;
      updateFindingCardStatusUI(findingId);

      const box = document.getElementById('approval-box-' + findingId);
      if (box) box.classList.add('hidden');

      if (typeof viewedFindingIds !== 'undefined') {
        viewedFindingIds.add(findingId);
      }
      if (typeof updateProgressIndicator === 'function') updateProgressIndicator();
      if (typeof updateSaveStatus === 'function') updateSaveStatus('审批意见已就绪', 'staged');
      showToast('已确认写入审批意见，并标记为已确认！');

      if (typeof triggerFilterUpdate === 'function') triggerFilterUpdate();
    }

    function clearApprovalOpinion(findingId, event) {
      if (event) event.stopPropagation();
      const state = getFindingState(findingId);
      state.status = 'pending';
      state.approvalOpinion = null;
      updateFindingCardStatusUI(findingId);

      const box = document.getElementById('approval-box-' + findingId);
      if (box) box.classList.add('hidden');

      const f = typeof findFindingObject === 'function' ? findFindingObject(findingId) : null;
      const ta = document.getElementById('approval-text-' + findingId);
      if (ta && f) {
        ta.value = f.suggestedRevision || f.suggestion || f.impact || '';
      }

      showToast('已撤回审批意见');
      if (typeof triggerFilterUpdate === 'function') triggerFilterUpdate();
    }

    function openReviewFromSelection(event) {
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

      if (typeof setPrimaryTab === 'function') {
        setPrimaryTab('findings');
      }

      const bubble = document.getElementById('text-selection-bubble') || document.getElementById('text-selection-comment-bubble');
      if (bubble) bubble.style.display = 'none';

      const existingFinding = (typeof allFindings !== 'undefined') ? allFindings.find(f => f.clauseIndex === clauseIdx) : null;
      if (existingFinding) {
        if (typeof selectFinding === 'function') {
          selectFinding(existingFinding.id, true);
        }
        toggleApprovalOpinionBox(existingFinding.id);
        const ta = document.getElementById('approval-text-' + existingFinding.id);
        if (ta) {
          if (!ta.value || !ta.value.trim()) {
            ta.value = '针对该句原文字句：“' + text + '”，提出如下审批修改意见：';
          }
          ta.focus();
        }
        showToast('已定位至该条款审查项，可就地录入审批意见');
      } else {
        const customId = 'finding-custom-' + Date.now();
        const customClauseNum = (node && node.querySelector('.clause-number'))
          ? node.querySelector('.clause-number').textContent.trim()
          : ('条款 #' + clauseIdx);

        const newFinding = {
          id: customId,
          clauseIndex: clauseIdx,
          severity: 'medium',
          issueType: '合规核验',
          title: customClauseNum + ' 自定义审查意见',
          impact: '审阅人针对选中文本提出专项审批处理意见。',
        };
        if (typeof allFindings !== 'undefined') {
          allFindings.unshift(newFinding);
        }
        if (typeof visibleFindingIds !== 'undefined') {
          visibleFindingIds.unshift(customId);
        }

        const container = document.getElementById('findings-cards-container');
        if (container) {
          const cardHtml = '<article id="' + customId + '" class="finding-card bg-white rounded-lg border-2 border-blue-400 p-3.5 shadow-card space-y-2.5" data-clause-index="' + clauseIdx + '">' +
            '<header class="flex items-start justify-between gap-2 pb-2 mb-2 border-b border-[#E2E8F0]">' +
            '<div class="flex-1 min-w-0 pr-2">' +
            '<div class="flex items-center gap-1.5 mb-1 select-none"><span class="text-[11px] font-semibold text-[#2E5882]">' + (customClauseNum || '') + '</span></div>' +
            '<h3 class="text-sm font-bold text-[#1E293B]">专项审查审批处理意见</h3>' +
            '</div>' +
            '<div class="flex items-center gap-1.5 shrink-0 select-none">' +
            '<span class="finding-status-badge hidden"></span>' +
            '<span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">人工审查</span>' +
            '</div>' +
            '</header>' +
            '<div class="p-2 bg-amber-50 rounded border border-amber-200 text-xs italic text-slate-700">“' + (text || '') + '”</div>' +
            '<div class="finding-actions-row flex items-center justify-between gap-2 pt-2 border-t border-[#E2E8F0]">' +
            '<div class="flex items-center gap-1.5">' +
            '<button type="button" class="action-btn action-btn-secondary" onclick="scrollToClause(' + clauseIdx + ', \\'' + customId + '\\', event)">定位原文</button>' +
            '<button type="button" id="btn-approval-' + customId + '" class="action-btn action-btn-secondary text-[#2E5882] hover:bg-blue-50 border-blue-200" onclick="toggleApprovalOpinionBox(\\'' + customId + '\\', event)"><span id="btn-approval-text-' + customId + '">写入审批</span></button>' +
            '</div></div>' +
            '<div id="approval-box-' + customId + '" class="approval-opinion-box mt-2.5 pt-2 border-t border-blue-100 bg-blue-50/60 rounded-md p-2.5 space-y-2">' +
            '<div class="flex items-center justify-between text-xs font-bold text-blue-900"><span>拟定审批意见（确认后将计入主流程审批意见）</span><button type="button" onclick="cancelApprovalEdit(\\'' + customId + '\\', event)" class="text-slate-400 hover:text-slate-600 text-[11px]">收起 ✕</button></div>' +
            '<textarea id="approval-text-' + customId + '" rows="3" class="w-full text-xs p-2 rounded border border-blue-200 bg-white leading-relaxed resize-none" placeholder="输入针对选中原文字句的法务/商务审查意见与修改要求...">针对选中字句：“' + (text || '') + '”，提出如下审批修改意见：</textarea>' +
            '<div class="flex items-center justify-between pt-1 border-t border-blue-100/80 text-[11px]">' +
            '<span class="text-slate-500 text-[10px]">点击确认后将自动标记为「已确认」</span>' +
            '<button type="button" onclick="confirmApprovalOpinion(\\'' + customId + '\\', event)" class="px-3 py-1 rounded bg-[#2E5882] hover:bg-[#1E3A5F] text-white font-semibold text-xs cursor-pointer shadow-2xs">确认写入审批</button>' +
            '</div></div>' +
            '</article>';
          container.insertAdjacentHTML('afterbegin', cardHtml);
          if (typeof selectFinding === 'function') {
            selectFinding(customId, true);
          }
          const ta = document.getElementById('approval-text-' + customId);
          if (ta) {
            setTimeout(() => {
              ta.focus();
              ta.selectionStart = ta.value.length;
              ta.selectionEnd = ta.value.length;
            }, 80);
          }
          showToast('已新增该句条款专项审查，可就地录入审批意见');
        }
      }
    }

    // Keyboard Shortcuts System (Fast Continuous Review)
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
        if (typeof showToast === 'function') showToast('建议修改文本已复制到剪贴板');
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

    function initKeyboardShortcuts() {
      document.addEventListener('keydown', function(e) {
        // Ignore if typing inside input, textarea or contenteditable
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable) {
          return;
        }

        const key = e.key.toLowerCase();

        if (key === 'j' || key === 'arrowdown') {
          e.preventDefault();
          navNextFinding();
        } else if (key === 'k' || key === 'arrowup') {
          e.preventDefault();
          navPrevFinding();
        } else if (key === 'a') {
          // Accept current
          if (visibleFindingIds.length > 0 && activeFindingIndex >= 0) {
            acceptFinding(visibleFindingIds[activeFindingIndex]);
          }
        } else if (key === 'x') {
          // Ignore current
          if (visibleFindingIds.length > 0 && activeFindingIndex >= 0) {
            promptIgnoreFinding(visibleFindingIds[activeFindingIndex]);
          }
        } else if (key === 'd') {
          // Resolve current
          if (visibleFindingIds.length > 0 && activeFindingIndex >= 0) {
            resolveFinding(visibleFindingIds[activeFindingIndex]);
          }
        } else if (key === 'f') {
          // Toggle focus mode
          if (currentViewMode === 'focus-doc') setViewMode('balance');
          else setViewMode('focus-doc');
        } else if (key === '?') {
          showKeyboardShortcutModal();
        }
      });
    }

    function showKeyboardShortcutModal() {
      const modal = document.getElementById('keyboard-shortcuts-modal');
      if (modal) modal.classList.toggle('hidden');
    }

    // 1. One-click conversion of Finding to Word Comment Draft
    function convertFindingToComment(findingId, event) {
      if (event) event.stopPropagation();
      const f = typeof findFindingObject === 'function' ? findFindingObject(findingId) : null;
      const card = getFindingCardElement(findingId);
      const revEl = card ? card.querySelector('.suggested-revision-text') : null;
      const advice = revEl && revEl.textContent
        ? revEl.textContent.trim()
        : (f ? (f.suggestedRevision || f.suggestion || f.impact || '') : '');
      const quote = f ? (f.factQuote || f.title || '') : '';
      const clauseIdx = f ? (f.clauseIndex ?? 0) : 0;

      if (typeof selectFinding === 'function') {
        selectFinding(findingId, true);
      }

      const initialCommentText = advice
        ? ('【法务修改意见】\\n' + advice)
        : '建议对该条款进行修改，以平衡合同权利义务并防范履约风险。';

      if (typeof enterCommentCreateMode === 'function') {
        enterCommentCreateMode(quote, clauseIdx, initialCommentText);
      }
      showToast('已将审查建议导入 Word 批注草稿');
    }

    // 2. Executive Summary Auto-collapse Helper
    function autoCollapseExecutiveSummary() {
      const content = document.getElementById('executive-summary-content');
      if (content && !content.classList.contains('hidden')) {
        content.classList.add('hidden');
        const toggleBtn = document.querySelector('[onclick*="toggleExecutiveSummary"]');
        if (toggleBtn) toggleBtn.textContent = '展开概览 ▼';
      }
    }

    // 3. Real-time Progress & Save Status Helpers
    function updateProgressIndicator() {
      const viewedEl = document.getElementById('progress-viewed-count');
      if (viewedEl && typeof viewedFindingIds !== 'undefined') {
        viewedEl.textContent = String(viewedFindingIds.size || (typeof allFindings !== 'undefined' && allFindings.length > 0 ? 1 : 0));
      }
      const commEl = document.getElementById('progress-comments-count');
      if (commEl && typeof docxCommentsData !== 'undefined') {
        commEl.textContent = String(docxCommentsData.length);
      }
    }

    function updateSaveStatus(text, type = 'ready') {
      const textEl = document.getElementById('save-status-text');
      const dotEl = document.getElementById('save-status-dot');
      if (textEl) textEl.textContent = text;
      if (dotEl) {
        if (type === 'saved') {
          dotEl.className = 'w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]';
        } else if (type === 'staged') {
          dotEl.className = 'w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]';
        } else if (type === 'warning') {
          dotEl.className = 'w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]';
        }
      }
    }

    function hasUnsavedCommentDraft() {
      const replyText = document.getElementById('comment-detail-reply-text');
      if (replyText && replyText.value.trim().length > 0) return true;
      const createText = document.getElementById('comment-create-text');
      const createWs = document.getElementById('comment-create-workspace');
      if (createWs && !createWs.classList.contains('hidden') && createText && createText.value.trim().length > 0) {
        return true;
      }
      return false;
    }

    function generateReviewSummaryText() {
      const findingsList = typeof allFindings !== 'undefined' ? allFindings : [];
      const totalFindings = findingsList.length;
      const highFindings = findingsList.filter(f => (f.severity || '').toLowerCase() === 'high');
      let acceptedCount = 0;
      let resolvedCount = 0;
      let ignoredCount = 0;
      const keyDecisions = [];
      const approvalOpinions = [];

      findingsList.forEach(f => {
        const s = getFindingState(f.id);
        if (s.approvalOpinion) {
          acceptedCount++;
          approvalOpinions.push({
            title: f.title || ('条款 #' + (f.clauseIndex ?? '通用')),
            clauseIndex: f.clauseIndex,
            opinion: s.approvalOpinion,
          });
        } else if (s.status === 'accepted') {
          acceptedCount++;
          keyDecisions.push('- [已采纳修改] ' + (f.title || ''));
        } else if (s.status === 'resolved') {
          resolvedCount++;
          keyDecisions.push('- [已线下核实] ' + (f.title || ''));
        } else if (s.status === 'ignored') {
          ignoredCount++;
          keyDecisions.push('- [忽略/特批] ' + (f.title || '') + ' (原因: ' + (s.ignoreReason || '豁免') + ')');
        }
      });

      const stagedList = typeof stagedComments !== 'undefined' ? stagedComments : [];
      const totalCommentsCount = typeof docxCommentsData !== 'undefined' ? docxCommentsData.length : 0;

      let summary = '【合同智能审阅结论与审批意见】\\n';
      summary += '审阅概况：排查合规风险 ' + totalFindings + ' 项（其中高风险 ' + highFindings.length + ' 项）。\\n';
      summary += '处置进度：已确认审批意见 ' + approvalOpinions.length + ' 条，已采纳建议 ' + acceptedCount + ' 项，已核实 ' + resolvedCount + ' 项，已特批忽略 ' + ignoredCount + ' 项；Word 批注共 ' + totalCommentsCount + ' 条（本次拟定/答复 ' + stagedList.length + ' 条）。\\n';

      if (approvalOpinions.length > 0) {
        summary += '\\n【法务审查处理意见与修改要求】\\n' + approvalOpinions.map((o, i) => (i + 1) + '. [' + o.title + ']\\n   意见：' + o.opinion).join('\\n') + '\\n';
      }

      if (highFindings.length > 0 && acceptedCount === 0 && resolvedCount === 0 && approvalOpinions.length === 0) {
        summary += '风险提示：存在 ' + highFindings.length + ' 处高风险要件待进一步闭环，请业务侧审慎复核。\\n';
      }

      if (keyDecisions.length > 0) {
        summary += '\\n重点处置决定：\\n' + keyDecisions.slice(0, 5).join('\\n') + (keyDecisions.length > 5 ? ('\\n...等共 ' + keyDecisions.length + ' 项处置') : '') + '\\n';
      }

      if (stagedList.length > 0) {
        summary += '\\n本次草拟Word批注：\\n' + stagedList.map((c, i) => (i + 1) + '. [条款 #' + (c.clauseIndex || '通用') + '] ' + (c.text || '')).join('\\n') + '\\n';
      }

      return summary;
    }

    // 4. Staging and Completion Handlers with Main Approval Linkage
    function showSyncCompleteModal(summaryText, isFinish) {
      var modal = document.getElementById('sync-return-modal');
      if (modal) modal.remove();

      modal = document.createElement('div');
      modal.id = 'sync-return-modal';
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-sans select-none';
      var escapedSummary = (summaryText || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      modal.innerHTML = 
        '<div class="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 text-center space-y-4 animate-in fade-in zoom-in duration-200">' +
          '<div class="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">✓</div>' +
          '<div>' +
            '<h3 class="text-base font-bold text-slate-800">' + (isFinish ? '合同审阅已完成并同步！' : '审阅草稿已暂存并同步！') + '</h3>' +
            '<p class="text-xs text-slate-500 mt-1">审批意见与批注已同步至主工作台，并已自动复制到系统剪贴板。</p>' +
          '</div>' +
          '<div class="text-left bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-700 max-h-48 overflow-y-auto whitespace-pre-wrap select-text font-mono leading-relaxed">' +
            escapedSummary +
          '</div>' +
          '<div class="flex items-center justify-center gap-3 pt-2">' +
            '<button type="button" onclick="window.close()" class="px-5 py-2 bg-[#2E5882] text-white rounded-lg text-xs font-semibold hover:bg-[#1E3A5F] transition cursor-pointer shadow-sm">' +
              '关闭当前窗口' +
            '</button>' +
            '<button type="button" onclick="document.getElementById(\\'sync-return-modal\\').remove()" class="px-3 py-2 border border-slate-300 text-slate-600 rounded-lg text-xs hover:bg-slate-50 transition cursor-pointer">' +
              '留在本页查阅' +
            '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
    }

    function dispatchReviewResult(payload, isFinish) {
      // 1. Notify parent iframe if embedded
      var isEmbedded = window.parent && window.parent !== window;
      if (isEmbedded) {
        try {
          window.parent.postMessage(payload, '*');
          window.parent.postMessage({ type: 'CONTRACT_REVIEW_CLOSE' }, '*');
        } catch (e) {}
      }

      // 2. Notify opener window if opened via window.open / target="_blank"
      if (window.opener && window.opener !== window) {
        try {
          window.opener.postMessage(payload, '*');
          window.opener.postMessage({ type: 'CONTRACT_REVIEW_CLOSE' }, '*');
        } catch (e) {}
      }

      // 3. BroadcastChannel cross-tab notification
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          var bc = new BroadcastChannel('CONTRACT_REVIEW_CHANNEL');
          bc.postMessage(payload);
          setTimeout(function() { bc.close(); }, 1000);
        }
      } catch (e) {}

      // 4. LocalStorage cross-tab fallback
      try {
        localStorage.setItem('CONTRACT_REVIEW_LAST_RESULT', JSON.stringify({
          action: payload.action,
          executionId: payload.executionId,
          artifactId: payload.artifactId,
          sourceDocumentVersion: payload.sourceDocumentVersion,
          ruleSetDigest: payload.ruleSetDigest,
          summaryText: payload.summaryText,
          stats: payload.stats,
          stagedComments: payload.stagedComments,
          reviewDraft: payload.reviewDraft,
          _timestamp: Date.now(),
        }));
      } catch (e) {}

      // 5. Automatic Clipboard copy for foolproof paste into approval comment
      if (navigator.clipboard && payload.summaryText) {
        try {
          navigator.clipboard.writeText(payload.summaryText).catch(function() {});
        } catch (e) {}
      }

      // 6. Standalone tab closing or sync modal fallback
      if (!isEmbedded) {
        try {
          window.close();
        } catch (e) {}
        setTimeout(function() {
          if (!window.closed) {
            showSyncCompleteModal(payload.summaryText, isFinish);
          }
        }, 250);
      }
    }

    function handleFinishAndReturn() {
      if (hasUnsavedCommentDraft()) {
        const confirmed = confirm('检测到当前有未保存的批注输入，是否直接完成审阅并返回主页面？');
        if (!confirmed) return;
      }

      const summaryText = generateReviewSummaryText();
      const rawApprovalOpinions = [];
      try {
        findingStates.forEach((state, id) => {
          if (state && state.approvalOpinion) {
            rawApprovalOpinions.push({
              findingId: id,
              opinion: state.approvalOpinion,
              status: state.status,
            });
          }
        });
      } catch (e) {}

      const stats = {
        totalFindings: typeof allFindings !== 'undefined' ? allFindings.length : 0,
        viewedCount: typeof viewedFindingIds !== 'undefined' ? viewedFindingIds.size : 0,
        stagedCommentsCount: typeof stagedComments !== 'undefined' ? stagedComments.length : 0,
        totalCommentsCount: typeof docxCommentsData !== 'undefined' ? docxCommentsData.length : 0,
      };

      const reviewDraft = {
        executionId: typeof currentExecutionId !== 'undefined' ? currentExecutionId : '',
        artifactId: typeof currentArtifactId !== 'undefined' ? currentArtifactId : '',
        sourceDocumentVersion: typeof currentSourceDocumentVersion !== 'undefined' ? currentSourceDocumentVersion : '',
        ruleSetId: typeof currentRuleSetId !== 'undefined' ? currentRuleSetId : 'contract-review/nda',
        ruleSetVersion: typeof currentRuleSetVersion !== 'undefined' ? currentRuleSetVersion : '1.0.0',
        ruleSetDigest: typeof currentRuleSetDigest !== 'undefined' ? currentRuleSetDigest : '',
        action: 'finish',
        summaryText,
        stagedComments: typeof stagedComments !== 'undefined' ? stagedComments : [],
        findingStates: Object.fromEntries(findingStates.entries()),
        approvalOpinions: rawApprovalOpinions,
        stats,
        _timestamp: Date.now(),
      };

      const payload = {
        type: 'CONTRACT_REVIEW_RESULT',
        action: 'finish',
        executionId: reviewDraft.executionId,
        artifactId: reviewDraft.artifactId,
        sourceDocumentVersion: reviewDraft.sourceDocumentVersion,
        ruleSetDigest: reviewDraft.ruleSetDigest,
        summaryText,
        stats,
        stagedComments: reviewDraft.stagedComments,
        findingStates: reviewDraft.findingStates,
        approvalOpinions: rawApprovalOpinions,
        reviewDraft,
      };

      dispatchReviewResult(payload, true);
      updateSaveStatus('审阅已完成并同步', 'saved');
      showToast('审阅完成，结论与批注已同步至审批流！');
    }

    function handleStageAndReturn() {
      const summaryText = generateReviewSummaryText();
      const rawApprovalOpinions = [];
      try {
        findingStates.forEach((state, id) => {
          if (state && state.approvalOpinion) {
            rawApprovalOpinions.push({
              findingId: id,
              opinion: state.approvalOpinion,
              status: state.status,
            });
          }
        });
      } catch (e) {}

      const stats = {
        totalFindings: typeof allFindings !== 'undefined' ? allFindings.length : 0,
        viewedCount: typeof viewedFindingIds !== 'undefined' ? viewedFindingIds.size : 0,
        stagedCommentsCount: typeof stagedComments !== 'undefined' ? stagedComments.length : 0,
        totalCommentsCount: typeof docxCommentsData !== 'undefined' ? docxCommentsData.length : 0,
      };

      const reviewDraft = {
        executionId: typeof currentExecutionId !== 'undefined' ? currentExecutionId : '',
        artifactId: typeof currentArtifactId !== 'undefined' ? currentArtifactId : '',
        sourceDocumentVersion: typeof currentSourceDocumentVersion !== 'undefined' ? currentSourceDocumentVersion : '',
        ruleSetId: typeof currentRuleSetId !== 'undefined' ? currentRuleSetId : 'contract-review/nda',
        ruleSetVersion: typeof currentRuleSetVersion !== 'undefined' ? currentRuleSetVersion : '1.0.0',
        ruleSetDigest: typeof currentRuleSetDigest !== 'undefined' ? currentRuleSetDigest : '',
        action: 'stage',
        summaryText,
        stagedComments: typeof stagedComments !== 'undefined' ? stagedComments : [],
        findingStates: Object.fromEntries(findingStates.entries()),
        approvalOpinions: rawApprovalOpinions,
        stats,
        _timestamp: Date.now(),
      };

      const payload = {
        type: 'CONTRACT_REVIEW_RESULT',
        action: 'stage',
        executionId: reviewDraft.executionId,
        artifactId: reviewDraft.artifactId,
        sourceDocumentVersion: reviewDraft.sourceDocumentVersion,
        ruleSetDigest: reviewDraft.ruleSetDigest,
        summaryText,
        stats,
        stagedComments: reviewDraft.stagedComments,
        findingStates: reviewDraft.findingStates,
        approvalOpinions: rawApprovalOpinions,
        reviewDraft,
      };

      dispatchReviewResult(payload, false);
      updateSaveStatus('草稿已暂存', 'staged');
      showToast('审阅草稿已暂存并返回');
    }

    // 5. Viewing vs Reviewing Mode Switching
    var currentInteractionMode = 'view'; // default: 'view' | 'review'

    function setInteractionMode(mode, silent) {
      currentInteractionMode = (mode === 'review') ? 'review' : 'view';
      var targets = [document.documentElement, document.body].filter(Boolean);
      var btnView = document.getElementById('mode-btn-view');
      var btnReview = document.getElementById('mode-btn-review');
      var bubble = document.getElementById('text-selection-bubble') || document.getElementById('text-selection-comment-bubble');

      if (currentInteractionMode === 'view') {
        targets.forEach(function(el) {
          el.classList.add('mode-view');
          el.classList.remove('mode-review');
        });
        if (btnView) {
          btnView.className = 'px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 bg-[#2563EB] text-white shadow-2xs';
        }
        if (btnReview) {
          btnReview.className = 'px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1 text-slate-300 hover:text-white';
        }
        if (bubble) bubble.style.display = 'none';
        if (!silent) showToast('已切换至查看模式（仅供底稿与诊断阅读）');
      } else {
        targets.forEach(function(el) {
          el.classList.add('mode-review');
          el.classList.remove('mode-view');
        });
        if (btnReview) {
          btnReview.className = 'px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 bg-[#2563EB] text-white shadow-2xs';
        }
        if (btnView) {
          btnView.className = 'px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1 text-slate-300 hover:text-white';
        }
        if (!silent) showToast('已切换至审查模式（可编辑意见与写入批注）');
      }
    }

    function initInteractionMode() {
      try {
        var urlParams = new URLSearchParams(window.location.search);
        var paramMode = urlParams.get('mode');
        if (paramMode === 'review') {
          setInteractionMode('review', true);
        } else {
          // 默认一律进入查看模式（底稿与诊断阅读模式），除非 URL 显式指定 ?mode=review
          setInteractionMode('view', true);
        }
      } catch (e) {
        setInteractionMode('view', true);
      }
    }
  `;
}
