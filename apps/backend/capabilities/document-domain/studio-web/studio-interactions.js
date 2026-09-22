  // Detect potential loops from document structure
  function detectLoopsFromStructure(structure) {
    const loops = [];

    // Find tables that look like data tables
    const tables = structure.elements?.filter((el) => el.type === 'table') || [];

    tables.forEach((table, index) => {
      // Check if table has multiple data rows (more than just header)
      const rowCount = table.tableRows?.length || 0;
      if (rowCount > 2) {
        // This looks like a data table that could be looped
        const headerText = table.headerRow || '';

        // Generate a loop path based on header content
        let loopPath = `d.items`;
        if (headerText.includes('Step') || headerText.includes('步骤')) {
          loopPath = 'd.steps';
        } else if (headerText.includes('产品') || headerText.includes('商品')) {
          loopPath = 'd.products';
        } else if (headerText.includes('用户') || headerText.includes('人员')) {
          loopPath = 'd.users';
        }

        loops.push({
          arrayPath: loopPath,
          tableIndex: index,
          headerRow: headerText,
          rowCount: rowCount,
        });
      }
    });

    return loops;
  }

  // Render AI analysis result in sidebar
  function renderAIAnalysisResult(suggestions, loops, contextAnalysis, templateConfig, images) {
    if (!elements.aiAnalysisResult || !elements.aiResultContent) return;

    let html = '';

    // Show context analysis if available
    if (contextAnalysis || templateConfig) {
      const templateType =
        templateConfig?.templateType || contextAnalysis?.detectedTemplateType || '通用文档';
      const userIntent = contextAnalysis?.userIntent || '';

      html += `
                <div class="ai-result-section" style="background:#e6f7ff;padding:10px;border-radius:4px;margin-bottom:12px;">
                    <h4 style="margin:0 0 8px 0;color:#1890ff;font-size:13px;">
                        <i class="fas fa-info-circle"></i> 模版类型: ${templateType}
                    </h4>
                    ${userIntent ? `<div style="font-size:12px;color:#666;margin-bottom:4px;">分析指令: ${userIntent}</div>` : ''}
                    ${
                      templateConfig?.analysisNotes?.length > 0
                        ? `
                        <div style="font-size:12px;color:#52c41a;">
                            ${templateConfig.analysisNotes.map((n) => `<div>• ${n}</div>`).join('')}
                        </div>
                    `
                        : ''
                    }
                </div>
            `;
    }

    // Show detected table loops
    if (loops && loops.length > 0) {
      html +=
        '<div class="ai-result-section"><h4 style="margin-bottom:8px;color:#d46b08;"><i class="fas fa-sync"></i> 检测到的表格循环</h4>';
      loops.forEach((loop, idx) => {
        const rowCount = loop.dataRowCount || loop.rowCount || 0;
        html += `
                    <div class="ai-result-loop">
                        <div class="ai-result-loop-header">
                            <code>{#${loop.arrayPath}}</code>
                            ${loop.confidence ? `<span class="badge badge-info" style="font-size:10px;">${Math.round(loop.confidence * 100)}%</span>` : ''}
                        </div>
                        <div style="font-size:12px;color:#666;margin-bottom:4px;">
                            表格 ${idx + 1}: ${loop.headerRow?.substring(0, 40) || '数据表格'}...
                            <br>数据行: ${rowCount} 行
                        </div>
                        ${
                          loop.columnMappings && loop.columnMappings.length > 0
                            ? `
                            <div style="font-size:11px;color:#999;margin-bottom:4px;">
                                列映射: ${loop.columnMappings
                                  .slice(0, 3)
                                  .map(
                                    (c) =>
                                      `<code style="background:#f0f0f0;padding:1px 3px;margin:1px;">${c.headerName}→{${c.variablePath}}</code>`
                                  )
                                  .join(' ')}
                                ${loop.columnMappings.length > 3 ? `<span>+${loop.columnMappings.length - 3}更多</span>` : ''}
                            </div>
                        `
                            : ''
                        }
                        <div style="font-size:11px;color:#999;margin-bottom:4px;">
                            ${loop.reason}
                        </div>
                        <button class="btn btn-outline btn-sm ai-apply-btn" data-type="loop" data-path="${loop.arrayPath}">
                            应用循环
                        </button>
                    </div>
                `;
      });
      html += '</div>';
    }

    // Show detected image loops
    if (images && images.length > 0) {
      html +=
        '<div class="ai-result-section"><h4 style="margin-bottom:8px;color:#722ed1;"><i class="fas fa-images"></i> 检测到的图片循环</h4>';
      images.forEach((img, idx) => {
        html += `
                    <div class="ai-result-item" style="background:#f9f0ff;">
                        <div class="ai-result-variable">
                            <code>{#${img.arrayPath}}</code>
                            <span class="badge badge-info" style="font-size:10px;">图片</span>
                        </div>
                        <div style="font-size:12px;color:#666;">
                            图片 ${idx + 1}: ${img.altText?.substring(0, 30) || 'Image'}...
                        </div>
                        <div style="font-size:11px;color:#999;margin-bottom:4px;">
                            ${img.reason}
                        </div>
                        <button class="btn btn-outline btn-sm ai-apply-btn" data-type="imageLoop" data-path="${img.arrayPath}">
                            应用图片循环
                        </button>
                    </div>
                `;
      });
      html += '</div>';
    }

    // Show detected variables
    if (suggestions && suggestions.length > 0) {
      html +=
        '<div class="ai-result-section"><h4 style="margin-bottom:8px;color:#1890ff;"><i class="fas fa-tags"></i> 检测到的变量</h4>';
      suggestions.slice(0, 10).forEach((s, idx) => {
        html += `
                    <div class="ai-result-item">
                        <div class="ai-result-variable">
                            <code>{${s.path}}</code>
                            <span class="badge badge-info">${s.type}</span>
                        </div>
                        <div style="font-size:12px;color:#666;margin-bottom:4px;">
                            "${s.content?.substring(0, 30) || ''}${s.content?.length > 30 ? '...' : ''}"
                        </div>
                        <div style="font-size:11px;color:#999;margin-bottom:4px;">
                            ${s.reason || ''}
                        </div>
                        <button class="btn btn-outline btn-sm ai-apply-btn" data-type="variable" data-path="${s.path}" data-content="${s.content || ''}">
                            应用变量
                        </button>
                    </div>
                `;
      });
      if (suggestions.length > 10) {
        html += `<div style="text-align:center;color:#666;font-size:12px;padding:8px;">还有 ${suggestions.length - 10} 个变量...</div>`;
      }
      html += '</div>';
    }

    if (html === '') {
      html =
        '<div style="text-align:center;color:#999;padding:20px;">未检测到明显的变量或循环结构</div>';
    }

    elements.aiResultContent.innerHTML = html;
    elements.aiAnalysisResult.style.display = 'block';

    // Bind apply button events
    elements.aiResultContent.querySelectorAll('.ai-apply-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const path = btn.dataset.path;
        const content = btn.dataset.content;

        if (type === 'loop') {
          applyLoop(path);
        } else {
          applyVariable(path, content);
        }
      });
    });
  }

  // Apply a detected loop
  function applyLoop(loopPath) {
    // Add loop to state
    if (!state.selectedTemplate.loops) {
      state.selectedTemplate.loops = [];
    }

    const exists = state.selectedTemplate.loops.some((l) => l.arrayPath === loopPath);
    if (!exists) {
      state.selectedTemplate.loops.push({ arrayPath: loopPath });

      // Update loops list in UI
      renderLoopsList();

      showToast(`已添加循环: {#${loopPath}}`, 'success');
    } else {
      showToast('该循环已存在', 'info');
    }
  }

  // Apply a detected variable
  function applyVariable(path, content) {
    // Add to test data
    addToTestData(path, content);

    // Update variables list
    const varItem = document.createElement('div');
    varItem.className = 'variable-item';
    varItem.innerHTML = `<code>{${path}}</code> <small style="color:#999">(${content.substring(0, 20)})</small>`;
    elements.variablesList.appendChild(varItem);

    // Update count
    elements.varsCount.textContent = parseInt(elements.varsCount.textContent) + 1;

    showToast(`已添加变量: {${path}}`, 'success');
  }

  // Render loops list
  function renderLoopsList() {
    if (!elements.loopsList || !state.selectedTemplate?.loops) return;

    if (state.selectedTemplate.loops.length === 0) {
      elements.loopsList.innerHTML = '<span class="empty-hint">No loops detected</span>';
      return;
    }

    elements.loopsList.innerHTML = state.selectedTemplate.loops
      .map(
        (l) => `
            <div class="loop-item">
                <i class="fas fa-repeat"></i>
                <code>{#${l.arrayPath}}</code>
            </div>
        `
      )
      .join('');
  }

  function renderAISuggestions(suggestions) {
    if (suggestions.length === 0) {
      elements.aiSuggestionsList.innerHTML =
        '<span class="empty-hint">No potential variables found</span>';
      elements.suggestionsCount.style.display = 'none';
      return;
    }

    elements.suggestionsCount.textContent = suggestions.length;
    elements.suggestionsCount.style.display = 'inline';

    elements.aiSuggestionsList.innerHTML = suggestions
      .map(
        (s, index) => `
            <div class="ai-suggestion-item" data-index="${index}">
                <div class="ai-suggestion-header">
                    <span class="ai-suggestion-path">{${s.path}}</span>
                    <span class="badge badge-info">${s.type}</span>
                </div>
                <div class="ai-suggestion-content">
                    Found: <code>${s.content}</code>
                </div>
                <div class="ai-suggestion-reason">
                    ${s.reason} (${Math.round(s.confidence * 100)}% confidence)
                </div>
                <div class="ai-suggestion-actions">
                    <button class="btn btn-primary btn-sm btn-accept" data-path="${s.path}" data-content="${s.content}">
                        <i class="fas fa-check"></i> Accept
                    </button>
                    <button class="btn btn-outline btn-sm btn-reject">
                        <i class="fas fa-times"></i> Ignore
                    </button>
                </div>
            </div>
        `
      )
      .join('');

    // Bind accept/reject events
    elements.aiSuggestionsList.querySelectorAll('.btn-accept').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.ai-suggestion-item');
        const path = btn.dataset.path;
        const content = btn.dataset.content;

        // Add to test data
        addToTestData(path, content);

        // Add to variables list
        const varItem = document.createElement('div');
        varItem.className = 'variable-item';
        varItem.innerHTML = `<code>{${path}}</code> <small style="color:#999">(${content})</small>`;
        elements.variablesList.appendChild(varItem);

        // Update count
        elements.varsCount.textContent = parseInt(elements.varsCount.textContent) + 1;

        // Remove suggestion
        item.remove();
        showToast(`Added {${path}} to variables`, 'success');
      });
    });

    elements.aiSuggestionsList.querySelectorAll('.btn-reject').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.ai-suggestion-item');
        item.remove();
      });
    });
  }

  function addToTestData(path, sampleValue) {
    let data = {};
    try {
      const text = elements.testData.value.trim();
      if (text) {
        data = JSON.parse(text);
      }
    } catch {
      data = {};
    }

    // Parse path like "d.user.name" -> { user: { name: ... } }
    const pathParts = path.replace(/^d\./, '').split('.');
    let current = data;

    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }

    // Set the final value
    const finalKey = pathParts[pathParts.length - 1];
    if (!current[finalKey]) {
      current[finalKey] = sampleValue;
    }

    // Update textarea
    elements.testData.value = JSON.stringify(data, null, 2);
  }

  // Apply Manual Marking
  function applyManualMarking() {
    const path = elements.variablePathInput.value.trim();
    const formatters = elements.formattersInput.value.trim();
    const text = elements.selectedTextDisplay.textContent;

    if (!path) {
      showToast('Please enter a variable path', 'warning');
      return;
    }

    if (!path.startsWith('d.') && !path.startsWith('c.') && !path.startsWith('t.')) {
      showToast('Variable path should start with d., c., or t.', 'warning');
      return;
    }

    // Build final path with formatters
    let fullPath = path;
    if (formatters) {
      const formatterList = formatters
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f);
      if (formatterList.length > 0) {
        fullPath += ':' + formatterList.join(':');
      }
    }

    // Add to manual markings
    state.manualMarkings.push({
      path: fullPath,
      text: text,
      createdAt: new Date().toISOString(),
    });

    // Add to test data
    addToTestData(path, text);

    // Add to variables list
    const varItem = document.createElement('div');
    varItem.className = 'variable-item';
    varItem.innerHTML = `
            <code>{${fullPath}}</code>
            <small style="color:#999">(${text})</small>
        `;
    elements.variablesList.appendChild(varItem);

    // Update count
    elements.varsCount.textContent = parseInt(elements.varsCount.textContent) + 1;

    hideSelectionSection();
    showToast(`Marked "${text}" as {${fullPath}}`, 'success');
  }

  // Save Markings
  async function saveMarkings() {
    if (!state.selectedTemplate) {
      showToast('No template selected', 'warning');
      return;
    }

    const markings = state.manualMarkings || {};
    const ignored = state.ignoredElements || {};
    const elementGroups = state.elementGroups || {};
    const ignoredGroups = state.ignoredGroups || {};
    const markingCount = Object.keys(markings).length;
    const ignoredCount = Object.keys(ignored).length;

    updateStatus('processing', '保存配置中...');
    updateStepStatus('config', 'in-progress', '保存中...');

    try {
      // 将对象转换为数组格式
      const markingsArray = Object.entries(markings).map(([index, type]) => ({
        index: parseInt(index),
        type: type,
        path: '',
        text: '',
      }));

      await apiRequest(`/templates/${state.selectedTemplate.id}/markings`, {
        method: 'POST',
        body: JSON.stringify({
          templateId: state.selectedTemplate.id,
          markings: markingsArray,
          ignoredElements: Object.keys(ignored).map((idx) => parseInt(idx)),
          elementGroups: elementGroups,
          ignoredGroups: Object.keys(ignoredGroups),
        }),
      });

      updateStatus('success', '配置已保存');
      updateStepStatus('config', 'completed', `${markingCount + ignoredCount}个`);
      showToast(`配置已保存 (${markingCount}个标记, ${ignoredCount}个忽略)`, 'success');
    } catch (error) {
      updateStatus('error', '保存失败');
      updateStepStatus('config', 'error', '失败');
      showToast('Failed to save markings', 'error');
    }
  }

  // Modal Functions
  function openModal() {
    elements.renderModal.classList.add('show');
  }

  function closeModal() {
    elements.renderModal.classList.remove('show');
  }

  // Event Handlers
  function initEvents() {
    // Upload area
    elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
    elements.uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      elements.uploadArea.classList.add('dragover');
    });
    elements.uploadArea.addEventListener('dragleave', () => {
      elements.uploadArea.classList.remove('dragover');
    });
    elements.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      elements.uploadArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) uploadTemplate(file);
    });
    elements.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) uploadTemplate(file);
    });

    // Buttons
    elements.validateBtn.addEventListener('click', validateData);
    elements.renderBtn.addEventListener('click', openModal);
    elements.confirmRender.addEventListener('click', renderTemplate);
    elements.saveBtn.addEventListener('click', saveMarkings);

    // Zoom controls
    elements.zoomIn.addEventListener('click', () => {
      state.currentZoom = Math.min(state.currentZoom + 0.1, 2);
      updateZoom();
    });
    elements.zoomOut.addEventListener('click', () => {
      state.currentZoom = Math.max(state.currentZoom - 0.1, 0.5);
      updateZoom();
    });

    // AI Generate button
    if (elements.aiGenerateBtn) {
      elements.aiGenerateBtn.addEventListener('click', performAIGenerate);
    }

    // AI Verify button
    if (elements.aiVerifyBtn) {
      elements.aiVerifyBtn.addEventListener('click', performAIVerify);
    }

    // Selection controls
    elements.applyMarking.addEventListener('click', applyManualMarking);
    elements.clearSelection.addEventListener('click', hideSelectionSection);

    // Tab switching
    elements.tabPreview.addEventListener('click', () => switchTab('preview'));
    elements.tabSource.addEventListener('click', () => switchTab('source'));

    // Source toolbar
    elements.copySourceBtn.addEventListener('click', copySourceToClipboard);
    elements.formatSourceBtn.addEventListener('click', formatSourceXml);
    elements.sourceFileSelect.addEventListener('change', loadSelectedSourceFile);

    // Structure view controls
    elements.viewRaw.addEventListener('click', () => switchSourceView('raw'));
    elements.viewStructure.addEventListener('click', () => switchSourceView('structure'));
    elements.showPreserve.addEventListener('change', renderStructureTree);
    elements.showTables.addEventListener('change', renderStructureTree);
    elements.showParagraphs.addEventListener('change', renderStructureTree);

    // Modal
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.querySelector('.modal-cancel')?.addEventListener('click', closeModal);
    elements.renderModal.addEventListener('click', (e) => {
      if (e.target === elements.renderModal) closeModal();
    });

    // Resize handle
    initResizeHandle();
  }

  // Tab Switching Functions
  function switchTab(tabName) {
    state.currentTab = tabName;

    // Update tab buttons
    elements.tabPreview.classList.toggle('active', tabName === 'preview');
    elements.tabSource.classList.toggle('active', tabName === 'source');

    // Update tab content
    elements.previewTabContent.classList.toggle('active', tabName === 'preview');
    elements.sourceTabContent.classList.toggle('active', tabName === 'source');

    // Load source and render if switching to source tab
    if (tabName === 'source' && state.selectedTemplate) {
      if (!state.sourceXml) {
        loadSourceXml().then(() => {
          // After loading, activate the current view
          switchSourceView(state.currentSourceView);
        });
      } else {
        // Already loaded, activate the current view which will render content
        switchSourceView(state.currentSourceView);
      }
    }
  }

  async function loadSourceXml() {
    if (!state.selectedTemplate) return;

    try {
      const result = await apiRequest(`/templates/${state.selectedTemplate.id}/preview-source`);
      state.sourceXml = result.content;

      // Display with basic syntax highlighting
      displaySourceXml(result.content);
    } catch (error) {
      console.error('Failed to load source:', error);
      elements.sourceCode.innerHTML = '<code style="color:red;">Failed to load source XML</code>';
    }
  }

  function displaySourceXml(xml) {
    // Basic XML syntax highlighting
    let highlighted = escapeHtml(xml);

    // Highlight tags
    highlighted = highlighted.replace(/&lt;(\/?[\w:]+)/g, '&lt;<span class="hljs-tag">$1</span>');
    highlighted = highlighted.replace(/([\w:]+)=/g, '<span class="hljs-attr">$1</span>=');
    highlighted = highlighted.replace(/"([^"]*)"/g, '"<span class="hljs-string">$1</span>"');

    elements.sourceCode.innerHTML = `<code class="xml">${highlighted}</code>`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function copySourceToClipboard() {
    if (!state.sourceXml) {
      showToast('No source to copy', 'warning');
      return;
    }

    navigator.clipboard
      .writeText(state.sourceXml)
      .then(() => {
        showToast('Source copied to clipboard', 'success');
      })
      .catch((err) => {
        console.error('Copy failed:', err);
        showToast('Failed to copy', 'error');
      });
  }

  function formatSourceXml() {
    if (!state.sourceXml) {
      showToast('No source to format', 'warning');
      return;
    }

    try {
      // Simple XML formatting
      let formatted = state.sourceXml;
      let indent = 0;
      const lines = [];

      // Add newlines after > and before <
      formatted = formatted.replace(/></g, '>\n<');

      // Process each line
      formatted.split('\n').forEach((line) => {
        line = line.trim();
        if (!line) return;

        // Decrease indent for closing tags
        if (line.startsWith('</')) {
          indent = Math.max(0, indent - 1);
        }

        lines.push('  '.repeat(indent) + line);

        // Increase indent for opening tags (not self-closing)
        if (
          line.startsWith('<') &&
          !line.startsWith('</') &&
          !line.endsWith('/>') &&
          !line.match(/<.*\/>/)
        ) {
          indent++;
        }
      });

      displaySourceXml(lines.join('\n'));
      showToast('XML formatted', 'success');
    } catch (err) {
      console.error('Format failed:', err);
      showToast('Failed to format XML', 'error');
    }
  }

  async function loadSelectedSourceFile() {
    const selectedFile = elements.sourceFileSelect.value;
    // For now, only document.xml is supported
    // Future: add support for other files
    await loadSourceXml();
  }

  // Source View Switching
  function switchSourceView(viewName) {
    state.currentSourceView = viewName;

    // Update view buttons
    elements.viewRaw.classList.toggle('active', viewName === 'raw');
    elements.viewStructure.classList.toggle('active', viewName === 'structure');

    // Update view content
    elements.rawView.classList.toggle('active', viewName === 'raw');
    elements.structureView.classList.toggle('active', viewName === 'structure');

    // Display content for the selected view
    if (viewName === 'raw' && state.sourceXml) {
      displaySourceXml(state.sourceXml);
    }
    // Parse and render structure if switching to structure view
    if (viewName === 'structure' && state.sourceXml && !state.xmlStructure) {
      parseXmlStructure();
    }
    if (viewName === 'structure' && state.xmlStructure) {
      renderStructureTree();
    }
  }
