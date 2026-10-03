/**
 * Client-side script module for Draggable Splitter and Focus View Modes.
 */
export function buildSplitterScript(): string {
  return `
    // Layout Resizer & Focus Mode Controller
    let currentViewMode = 'balance'; // 'balance' | 'focus-doc' | 'focus-review'
    let isResizing = false;
    let initialX = 0;
    let initialDocWidth = 0;

    function initSplitter() {
      const resizer = document.getElementById('layout-resizer');
      const docCol = document.getElementById('document-column');
      const workbenchCol = document.getElementById('workbench-column');
      const container = document.getElementById('main-workspace-container');

      if (!resizer || !docCol || !workbenchCol || !container) return;

      resizer.addEventListener('mousedown', function(e) {
        isResizing = true;
        initialX = e.clientX;
        initialDocWidth = docCol.getBoundingClientRect().width;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        resizer.classList.add('resizer-active');
      });

      document.addEventListener('mousemove', function(e) {
        if (!isResizing) return;
        const containerWidth = container.getBoundingClientRect().width;
        const deltaX = e.clientX - initialX;
        let newDocWidth = initialDocWidth + deltaX;

        // Constrain width between 30% and 75%
        const minDocWidth = containerWidth * 0.3;
        const maxDocWidth = containerWidth * 0.75;

        if (newDocWidth < minDocWidth) newDocWidth = minDocWidth;
        if (newDocWidth > maxDocWidth) newDocWidth = maxDocWidth;

        const docPercent = (newDocWidth / containerWidth) * 100;
        docCol.style.width = docPercent + '%';
        workbenchCol.style.width = (100 - docPercent) + '%';
        currentViewMode = 'custom';
        updateViewModeButtons();
      });

      document.addEventListener('mouseup', function() {
        if (isResizing) {
          isResizing = false;
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          resizer.classList.remove('resizer-active');
        }
      });

      // Double-click resizer to reset to 50/50 balance
      resizer.addEventListener('dblclick', function() {
        setViewMode('balance');
      });
    }

    function setViewMode(mode) {
      const docCol = document.getElementById('document-column');
      const workbenchCol = document.getElementById('workbench-column');
      const resizer = document.getElementById('layout-resizer');
      if (!docCol || !workbenchCol) return;

      currentViewMode = mode;

      if (mode === 'focus-doc') {
        docCol.style.width = '100%';
        workbenchCol.style.display = 'none';
        if (resizer) resizer.style.display = 'none';
        showToast('已进入专注原文阅读模式');
      } else if (mode === 'focus-review') {
        docCol.style.width = '35%';
        workbenchCol.style.display = 'block';
        workbenchCol.style.width = '65%';
        if (resizer) resizer.style.display = 'flex';
        showToast('已进入专注审查处置模式');
      } else {
        // 'balance'
        docCol.style.width = '53%';
        workbenchCol.style.display = 'block';
        workbenchCol.style.width = '47%';
        if (resizer) resizer.style.display = 'flex';
      }

      updateViewModeButtons();
    }

    function updateViewModeButtons() {
      const btnDoc = document.getElementById('btn-view-focus-doc');
      const btnBalance = document.getElementById('btn-view-balance');
      const btnReview = document.getElementById('btn-view-focus-review');

      [btnDoc, btnBalance, btnReview].forEach(btn => {
        if (btn) btn.classList.remove('view-btn-active');
      });

      if (currentViewMode === 'focus-doc' && btnDoc) btnDoc.classList.add('view-btn-active');
      else if (currentViewMode === 'focus-review' && btnReview) btnReview.classList.add('view-btn-active');
      else if (currentViewMode === 'balance' && btnBalance) btnBalance.classList.add('view-btn-active');
    }
  `;
}
