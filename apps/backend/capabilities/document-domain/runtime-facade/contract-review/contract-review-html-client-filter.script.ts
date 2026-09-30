/**
 * Client-side script module for Orthogonal Multi-Dimension Filtering.
 * Solves dimension conflation by separating Primary View Tab, Severity, Issue Type, Status and Source.
 */
export function buildFilterScript(): string {
  return `
    // Orthogonal Filter State
    const filterState = {
      primaryTab: 'all',     // 'all' | 'findings' | 'comments'
      severity: 'all',       // 'all' | 'high' | 'medium' | 'low'
      issueType: 'all',      // 'all' | '缺失' | '歧义' | '偏颇' | '待核实'
      status: 'all',         // 'all' | 'pending' | 'accepted' | 'resolved' | 'ignored' | 'negotiation'
      commentStatus: 'all',  // 'all' | 'pending' | 'resolved'
      searchQuery: '',
    };

    function setPrimaryTab(tab) {
      filterState.primaryTab = tab;
      if (typeof currentWorkbenchMode !== 'undefined') {
        currentWorkbenchMode = (tab === 'comments') ? 'comments' : 'findings';
      }

      // Update Tab UI
      const tabs = ['all', 'findings', 'comments'];
      tabs.forEach(t => {
        const btn = document.getElementById('primary-tab-' + t);
        if (btn) {
          if (t === tab) {
            btn.classList.add('primary-tab-active');
          } else {
            btn.classList.remove('primary-tab-active');
          }
        }
      });

      const subFindingsBtn = document.getElementById('tab-btn-findings');
      const subCommentsBtn = document.getElementById('tab-btn-comments');
      if (subFindingsBtn) {
        subFindingsBtn.classList.toggle('active', tab === 'findings' || tab === 'all');
      }
      if (subCommentsBtn) {
        subCommentsBtn.classList.toggle('active', tab === 'comments');
      }

      // Mode-adaptive toolbar toggle
      const findingsControls = document.getElementById('findings-filter-controls');
      const commentsControls = document.getElementById('comments-filter-controls');
      if (findingsControls && commentsControls) {
        if (tab === 'comments') {
          findingsControls.classList.add('hidden');
          commentsControls.classList.remove('hidden');
        } else {
          findingsControls.classList.remove('hidden');
          commentsControls.classList.add('hidden');
        }
      }

      triggerFilterUpdate();
    }

    function setSeverityFilter(sev) {
      filterState.severity = sev;

      // Update Severity Buttons UI
      const sevs = ['all', 'high', 'medium', 'low'];
      sevs.forEach(s => {
        const btn = document.getElementById('filter-sev-' + s);
        if (btn) {
          if (s === sev) {
            btn.classList.add('sev-filter-active');
          } else {
            btn.classList.remove('sev-filter-active');
          }
        }
      });

      triggerFilterUpdate();
    }

    function setStatusFilter(status) {
      filterState.status = status;
      triggerFilterUpdate();
    }

    function setCommentStatusFilter(status) {
      filterState.commentStatus = status;
      const statuses = ['all', 'pending', 'resolved'];
      statuses.forEach(s => {
        const btn = document.getElementById('filter-comment-status-' + s);
        if (btn) {
          if (s === status) {
            btn.className = 'px-2 py-0.5 rounded text-[11px] font-semibold bg-[#2E5882] text-white transition cursor-pointer';
          } else if (s === 'pending') {
            btn.className = 'px-2 py-0.5 rounded text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer';
          } else if (s === 'resolved') {
            btn.className = 'px-2 py-0.5 rounded text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition cursor-pointer';
          } else {
            btn.className = 'px-2 py-0.5 rounded text-[11px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition cursor-pointer';
          }
        }
      });
      triggerFilterUpdate();
    }

    function handleKeywordSearch(val) {
      filterState.searchQuery = (val || '').trim();
      triggerFilterUpdate();
    }

    function setIssueTypeFilter(type) {
      filterState.issueType = type;
      triggerFilterUpdate();
    }

    function toggleAdvancedFilterPopover() {
      const popover = document.getElementById('advanced-filter-popover');
      if (popover) {
        popover.classList.toggle('hidden');
      }
    }

    function resetAllFilters() {
      filterState.primaryTab = 'all';
      filterState.severity = 'all';
      filterState.issueType = 'all';
      filterState.status = 'all';
      filterState.commentStatus = 'all';
      filterState.searchQuery = '';

      setPrimaryTab('all');
      setSeverityFilter('all');
      setCommentStatusFilter('all');

      const statusSelect = document.getElementById('select-filter-status');
      if (statusSelect) statusSelect.value = 'all';

      const typeSelect = document.getElementById('select-filter-type');
      if (typeSelect) typeSelect.value = 'all';

      const searchInput = document.getElementById('filter-search-input');
      if (searchInput) searchInput.value = '';

      const popover = document.getElementById('advanced-filter-popover');
      if (popover) popover.classList.add('hidden');

      triggerFilterUpdate();
      showToast('已重置全部筛选条件');
    }

    function triggerFilterUpdate() {
      const showFindings = filterState.primaryTab === 'all' || filterState.primaryTab === 'findings';
      const showComments = filterState.primaryTab === 'all' || filterState.primaryTab === 'comments';

      // 1. Filter Findings
      let visibleFindingsCount = 0;
      if (typeof visibleFindingIds !== 'undefined') visibleFindingIds = [];

      allFindings.forEach(f => {
        const card = document.getElementById(f.id) || document.getElementById('finding-card-' + f.id);
        if (!card) return;

        if (!showFindings) {
          card.classList.add('hidden');
          return;
        }

        const state = typeof getFindingState === 'function' ? getFindingState(f.id) : { status: 'pending' };

        // Severity match (case-insensitive)
        const fSev = (f.severity || '').toLowerCase();
        const sevMatch = filterState.severity === 'all' || fSev === filterState.severity.toLowerCase();

        // Issue Type match
        const typeMatch = filterState.issueType === 'all' || (f.issueType && f.issueType.includes(filterState.issueType));

        // Status match
        let statusMatch = true;
        if (filterState.status === 'pending') statusMatch = state.status === 'pending';
        else if (filterState.status === 'accepted') statusMatch = state.status === 'accepted';
        else if (filterState.status === 'resolved') statusMatch = state.status === 'resolved';
        else if (filterState.status === 'ignored') statusMatch = state.status === 'ignored';
        else if (filterState.status === 'negotiation') statusMatch = !!state.inNegotiation;

        // Search Query match
        const query = filterState.searchQuery.toLowerCase();
        const searchMatch = !query ||
          (f.title && f.title.toLowerCase().includes(query)) ||
          (f.impact && f.impact.toLowerCase().includes(query));

        if (sevMatch && typeMatch && statusMatch && searchMatch) {
          card.classList.remove('hidden');
          visibleFindingsCount++;
          if (typeof visibleFindingIds !== 'undefined') visibleFindingIds.push(f.id);
        } else {
          card.classList.add('hidden');
        }
      });

      // 2. Filter Comments (supports grouped cards and individual cards)
      let visibleCommentsCount = 0;
      if (typeof visibleCommentIds !== 'undefined') visibleCommentIds = [];

      const groupCards = document.querySelectorAll('.comment-group-card');
      if (groupCards.length > 0) {
        groupCards.forEach(card => {
          if (!showComments) {
            card.classList.add('hidden');
            return;
          }
          const ids = (card.getAttribute('data-comment-ids') || card.getAttribute('data-comment-id') || '').split(',').filter(Boolean);

          let statusMatch = true;
          if (filterState.commentStatus !== 'all' && typeof docxCommentsData !== 'undefined') {
            const cardComments = docxCommentsData.filter(c => ids.includes(String(c.id)));
            if (filterState.commentStatus === 'pending') {
              statusMatch = cardComments.some(c => !c.isResolved);
            } else if (filterState.commentStatus === 'resolved') {
              statusMatch = cardComments.length > 0 && cardComments.every(c => c.isResolved);
            }
          }

          const query = filterState.searchQuery.toLowerCase();
          const cardText = (card.textContent || '').toLowerCase();
          const searchMatch = !query || cardText.includes(query);

          if (statusMatch && searchMatch) {
            card.classList.remove('hidden');
            visibleCommentsCount += ids.length || 1;
            if (typeof visibleCommentIds !== 'undefined') {
              ids.forEach(cid => {
                if (!visibleCommentIds.includes(cid)) visibleCommentIds.push(cid);
              });
            }
          } else {
            card.classList.add('hidden');
          }
        });
      } else if (typeof docxCommentsData !== 'undefined' && Array.isArray(docxCommentsData)) {
        docxCommentsData.forEach(c => {
          const card = document.getElementById('comment-card-' + c.id);
          if (!card) return;

          if (!showComments) {
            card.classList.add('hidden');
            return;
          }

          let statusMatch = true;
          if (filterState.commentStatus === 'pending') statusMatch = !c.isResolved;
          else if (filterState.commentStatus === 'resolved') statusMatch = !!c.isResolved;

          // Search match
          const query = filterState.searchQuery.toLowerCase();
          const searchMatch = !query ||
            (c.author && c.author.toLowerCase().includes(query)) ||
            (c.text && c.text.toLowerCase().includes(query));

          if (statusMatch && searchMatch) {
            card.classList.remove('hidden');
            visibleCommentsCount++;
            if (typeof visibleCommentIds !== 'undefined') visibleCommentIds.push(c.id);
          } else {
            card.classList.add('hidden');
          }
        });
      }

      // Clamp activeCommentIndex if out of range
      if (typeof activeCommentIndex !== 'undefined' && typeof visibleCommentIds !== 'undefined') {
        if (activeCommentIndex >= visibleCommentIds.length) {
          activeCommentIndex = Math.max(0, visibleCommentIds.length - 1);
        }
      }

      // Update visible count in UI
      const countLabel = document.getElementById('filtered-count-label');
      if (countLabel) {
        const totalVisible = filterState.primaryTab === 'comments'
          ? visibleCommentsCount
          : (filterState.primaryTab === 'findings' ? visibleFindingsCount : (visibleFindingsCount + visibleCommentsCount));
        countLabel.textContent = '展示 ' + totalVisible + ' 项结果';
      }

      // Hide or show findings container, comments container & executive summary based on tab
      const findingsContainer = document.getElementById('findings-cards-container');
      const commentsContainer = document.getElementById('comments-stream-container') || document.getElementById('comments-cards-container');
      const execSummary = document.getElementById('executive-summary-card');

      if (findingsContainer) findingsContainer.classList.toggle('hidden', !showFindings);
      if (commentsContainer) commentsContainer.classList.toggle('hidden', !showComments);
      if (execSummary) execSummary.classList.toggle('hidden', filterState.primaryTab === 'comments');

      if (typeof updateNavIndicator === 'function') updateNavIndicator();
    }
  `;
}
