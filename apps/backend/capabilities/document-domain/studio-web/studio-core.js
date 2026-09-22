// Carbone Studio - Main Application
(function () {
  'use strict';

  // API Base URL
  const API_BASE = '/studio';

  // State
  const state = {
    templates: [],
    selectedTemplate: null,
    formatters: [],
    manualMarkings: {}, // 改为对象，key是元素索引
    templateConfig: null, // AI生成的模板配置
    currentZoom: 1,
    documentElements: [],
    sourceXml: '',
    currentTab: 'source', // 默认显示代码页
    currentSourceView: 'structure', // 默认显示结构化视图
    xmlStructure: null,
    selectedElementIndices: [], // 多选元素索引列表
    elementGroups: {}, // 元素分组：{ groupId: [index1, index2, ...] }
    ignoredGroups: {}, // 被忽略的分组：{ groupId: true } - 用于标记重复的分组
    ignoredElements: {}, // 被忽略的元素：{ index: true } - 用于标记重复/忽略的元素
  };

  // DOM Elements
  const elements = {};

  // Initialize elements after DOM is ready
  function initElements() {
    elements.templateList = document.getElementById('template-list');
    elements.uploadArea = document.getElementById('upload-area');
    elements.fileInput = document.getElementById('file-input');
    elements.noTemplate = document.getElementById('no-template');
    elements.templateEditor = document.getElementById('template-editor');
    elements.templateName = document.getElementById('template-name');
    elements.templateFormat = document.getElementById('template-format');
    elements.variablesList = document.getElementById('variables-list');
    elements.loopsList = document.getElementById('loops-list');
    elements.testData = document.getElementById('test-data');
    elements.validateBtn = document.getElementById('validate-btn');
    elements.renderBtn = document.getElementById('render-btn');
    elements.saveBtn = document.getElementById('save-btn');
    elements.renderModal = document.getElementById('render-modal');
    elements.outputFormat = document.getElementById('output-format');
    elements.confirmRender = document.getElementById('confirm-render');
    elements.toastContainer = document.getElementById('toast-container');
    elements.previewIframe = document.getElementById('preview-iframe');
    elements.zoomIn = document.getElementById('zoom-in');
    elements.zoomOut = document.getElementById('zoom-out');
    elements.zoomLevel = document.getElementById('zoom-level');
    elements.aiGenerateBtn = document.getElementById('ai-generate-btn');
    elements.aiSuggestionsList = document.getElementById('ai-suggestions-list');
    elements.selectionSection = document.getElementById('selection-section');
    elements.selectedTextDisplay = document.getElementById('selected-text-display');
    elements.variablePathInput = document.getElementById('variable-path-input');
    elements.formattersInput = document.getElementById('formatters-input');
    elements.applyMarking = document.getElementById('apply-marking');
    elements.clearSelection = document.getElementById('clear-selection');
    elements.varsCount = document.getElementById('vars-count');
    elements.suggestionsCount = document.getElementById('suggestions-count');
    elements.noSelectionHint = document.getElementById('no-selection-hint');
    // AI Generate Result
    elements.aiGenerateResultSection = document.getElementById('ai-generate-result-section');
    elements.aiGenerateResult = document.getElementById('ai-generate-result');
    elements.aiProgress = document.getElementById('ai-progress');
    elements.progressFill = document.getElementById('progress-fill');
    elements.progressText = document.getElementById('progress-text');
    // Verify Result (separate section)
    elements.verifyResultSection = document.getElementById('verify-result-section');
    elements.verifyResult = document.getElementById('verify-result');
    // Tab elements
    elements.tabPreview = document.getElementById('tab-preview');
    elements.tabSource = document.getElementById('tab-source');
    elements.previewTabContent = document.getElementById('preview-tab-content');
    elements.sourceTabContent = document.getElementById('source-tab-content');
    elements.sourceCode = document.getElementById('source-code');
    elements.sourceFileSelect = document.getElementById('source-file-select');
    elements.copySourceBtn = document.getElementById('copy-source-btn');
    elements.formatSourceBtn = document.getElementById('format-source-btn');
    // Structure view elements
    elements.viewRaw = document.getElementById('view-raw');
    elements.viewStructure = document.getElementById('view-structure');
    elements.rawView = document.getElementById('raw-view');
    elements.structureView = document.getElementById('structure-view');
    elements.structureTree = document.getElementById('structure-tree');
    elements.showPreserve = document.getElementById('show-preserve');
    elements.showTables = document.getElementById('show-tables');
    elements.showParagraphs = document.getElementById('show-paragraphs');
    // Operations section
    elements.operationsSection = document.getElementById('operations-section');
    elements.stepParseStatus = document.getElementById('step-parse-status');
    elements.stepConfigStatus = document.getElementById('step-config-status');
    elements.stepGenerateStatus = document.getElementById('step-generate-status');
    elements.stepVerifyStatus = document.getElementById('step-verify-status');
    elements.stepFinetuneStatus = document.getElementById('step-finetune-status');
    // AI Verify button
    elements.aiVerifyBtn = document.getElementById('ai-verify-btn');
    // Status display
    elements.statusText = document.getElementById('status-text');
    // Execution progress
    elements.executionProgress = document.getElementById('execution-progress');
    elements.executionTitle = document.getElementById('execution-title');
    elements.executionProgressFill = document.getElementById('execution-progress-fill');
    elements.executionLog = document.getElementById('execution-log');
  }

  // Utility Functions
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getFormatIcon(format) {
    const icons = {
      docx: 'fa-file-word',
      xlsx: 'fa-file-excel',
      pptx: 'fa-file-powerpoint',
      html: 'fa-file-code',
    };
    return icons[format] || 'fa-file';
  }

  function showToast(message, type = 'info') {
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-times-circle',
      warning: 'fa-exclamation-circle',
      info: 'fa-info-circle',
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
            <i class="fas ${icons[type]}"></i>
            <span>${message}</span>
        `;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // API Functions
  async function apiRequest(endpoint, options = {}) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Load Functions
  async function loadTemplates() {
    try {
      const result = await apiRequest('/templates');
      state.templates = result.templates;
      renderTemplateList();
    } catch (error) {
      elements.templateList.innerHTML = '<div class="loading">Failed to load templates</div>';
    }
  }

  async function loadFormatters() {
    try {
      const result = await apiRequest('/formatters');
      state.formatters = result.formatters;
    } catch (error) {
      console.error('Failed to load formatters:', error);
    }
  }

  // Render Functions
  function renderTemplateList() {
    if (state.templates.length === 0) {
      elements.templateList.innerHTML = '<div class="loading">No templates uploaded</div>';
      return;
    }

    elements.templateList.innerHTML = state.templates
      .map(
        (t) => `
            <div class="template-item ${state.selectedTemplate?.id === t.id ? 'active' : ''}" data-id="${t.id}">
                <div class="template-item-header">
                    <i class="fas ${getFormatIcon(t.format)}"></i>
                    <span class="template-item-name">${t.fileName}</span>
                </div>
                <div class="template-item-meta">
                    <span class="badge badge-info">${t.format.toUpperCase()}</span>
                    <span>${t.variables.length} vars</span>
                    <span>${formatBytes(t.size)}</span>
                    <button class="btn btn-sm btn-danger delete-btn" data-id="${t.id}" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `
      )
      .join('');

    // Bind events
    document.querySelectorAll('.template-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn')) return;
        const id = item.dataset.id;
        const template = state.templates.find((t) => t.id === id);
        if (template) selectTemplate(template);
      });
    });

    document.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (confirm('Delete this template?')) {
          await deleteTemplate(id);
        }
      });
    });
  }

  function selectTemplate(template) {
    state.selectedTemplate = template;
    state.sourceXml = ''; // Clear cached source
    state.xmlStructure = null; // Clear cached structure
    state.currentTab = 'source'; // 默认显示代码页
    state.currentSourceView = 'structure'; // 默认结构化视图
    state.manualMarkings = {}; // 清空手动标记
    state.ignoredElements = {}; // 清空忽略元素
    renderTemplateList();

    elements.noTemplate.style.display = 'none';
    elements.templateEditor.style.display = 'flex';

    // 显示操作区域
    if (elements.operationsSection) {
      elements.operationsSection.style.display = 'block';
    }

    // 更新步骤状态
    updateStepStatus('parse', 'completed', '已完成');
    updateStepStatus('config', 'pending', '');
    updateStepStatus('generate', 'pending', '');
    updateStepStatus('verify', 'pending', '');
    updateStepStatus('finetune', 'pending', '');
    updateStatus('idle', '等待配置');

    // Reset tab state - 默认选中Source标签
    elements.tabPreview.classList.remove('active');
    elements.tabSource.classList.add('active');
    elements.previewTabContent.classList.remove('active');
    elements.sourceTabContent.classList.add('active');

    // Reset source view state - 默认显示结构化视图
    elements.viewRaw.classList.remove('active');
    elements.viewStructure.classList.add('active');
    elements.rawView.classList.remove('active');
    elements.structureView.classList.add('active');

    // 先加载文档元素，然后再加载源码并渲染结构
    loadDocumentElements(template).then(() => {
      // 加载源码并渲染结构
      loadSourceXml().then(() => {
        switchSourceView('structure');
        // 先加载已保存的标记，再加载模板配置（确保状态正确更新）
        loadSavedMarkings().then(() => {
          loadSavedTemplateConfig();
        });
      });
    });

    // Update header
    elements.templateName.textContent = template.fileName;
    elements.templateFormat.textContent = template.format.toUpperCase();
    elements.templateFormat.className = `badge badge-info`;

    // Render variables (may be null if section removed)
    if (elements.varsCount) {
      elements.varsCount.textContent = template.variables.length;
    }
    if (elements.variablesList) {
      elements.variablesList.innerHTML =
        template.variables.length > 0
          ? template.variables
              .map(
                (v) => `
                    <div class="variable-item">
                        <code>{${v}}</code>
                    </div>
                `
              )
              .join('')
          : '<span class="empty-hint">No variables found</span>';
    }

    // Render loops (may be null if section removed)
    if (elements.loopsList) {
      elements.loopsList.innerHTML =
        template.loops.length > 0
          ? template.loops
              .map(
                (l) => `
                <div class="loop-item">
                    <i class="fas fa-repeat"></i>
                    <code>${l.arrayPath}</code>
                </div>
            `
              )
              .join('')
          : '<span class="empty-hint">No loops detected</span>';
    }

    // Load document preview
    loadDocumentPreview(template);

    // Load saved markings
    loadMarkings(template.id);
  }

  // 预加载源XML并解析结构
  async function preloadSourceXml(template) {
    if (template.format !== 'docx') return;

    try {
      const result = await apiRequest(`/templates/${template.id}/preview-source`);
      state.sourceXml = result.content;
      // 立即解析结构，确保PDF选择可以使用
      if (state.sourceXml && !state.xmlStructure) {
        parseXmlStructure();
      }
    } catch (error) {
      console.warn('Failed to preload source XML:', error);
    }
  }

  async function loadDocumentElements(template) {
    if (template.format !== 'docx') {
      return;
    }

    try {
      const result = await apiRequest(`/templates/${template.id}/structure`);
      state.documentElements = result.elements || [];

      // 不再渲染元素列表，元素信息通过结构视图选择显示
    } catch (error) {
      console.error('Failed to load document elements:', error);
    }
  }

  // 渲染文档元素列表已移除，改用结构视图选择
  function renderDocumentElementsList() {
    // 元素列表已移除，现在通过结构视图选择元素
    // 选中元素信息会显示在右侧编辑区域
  }

  function getElementIcon(type) {
    const icons = {
      title: 'fa-heading',
      heading1: 'fa-heading',
      heading2: 'fa-heading',
      heading3: 'fa-heading',
      paragraph: 'fa-paragraph',
      table: 'fa-table',
      list: 'fa-list',
      image: 'fa-image',
    };
    return icons[type] || 'fa-file-alt';
  }

  function getElementLabel(type) {
    const labels = {
      title: 'Title',
      heading1: 'Heading 1',
      heading2: 'Heading 2',
      heading3: 'Heading 3',
      paragraph: 'Paragraph',
      table: 'Table',
      list: 'List',
      image: 'Image',
    };
    return labels[type] || type;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function selectDocumentElement(element) {
    // Show selection section with element info
    elements.selectedTextDisplay.textContent = element.text;
    elements.variablePathInput.value = suggestVariablePath(element.text);
    elements.formattersInput.value = '';
    elements.selectionSection.style.display = 'block';

    // Store selected element
    state.selectedElement = element;

    // Highlight in preview
    highlightElementInPreview(element);

    showToast(`Selected ${element.type}: "${element.text.substring(0, 30)}..."`, 'info');
  }

  function highlightElementInPreview(element) {
    try {
      const iframeDoc =
        elements.previewIframe.contentDocument || elements.previewIframe.contentWindow.document;

      // Remove existing highlights
      iframeDoc.querySelectorAll('.element-highlight').forEach((el) => {
        el.classList.remove('element-highlight');
      });

      // PDF 预览：Find matching text in PDF text layer
      const textLayer = iframeDoc.querySelector('.textLayer');
      const canvas = iframeDoc.querySelector('#pdf-canvas');

      // 处理图片类型 - PDF预览
      if (element.type === 'image' && textLayer) {
        // 图片在PDF中，需要找到对应的文本（如"Step X: screenshot"）
        // 根据imageId判断是哪张图片
        const imageId = element.imageId || '';
        let searchPattern = '';

        if (imageId.includes('rId6')) {
          searchPattern = 'Step 3';
        } else if (imageId.includes('rId7')) {
          searchPattern = 'Step 7';
        } else {
          // 默认搜索"截图"或"screenshot"
          searchPattern = 'screenshot';
        }

        const spans = textLayer.querySelectorAll('span');
        let foundFirst = false;

        spans.forEach((span) => {
          const text = span.textContent || '';
          if (text.includes(searchPattern) || text.includes('截图')) {
            span.classList.add('element-highlight');
            if (!foundFirst) {
              span.scrollIntoView({ behavior: 'smooth', block: 'center' });
              foundFirst = true;
            }
          }
        });

        // 如果没有找到匹配文本，显示提示
        if (!foundFirst) {
          showToast(`Image selected: ${element.imageId || 'unknown'}`, 'info');
        }
        return;
      }

      if (textLayer && element.type !== 'image') {
        const spans = textLayer.querySelectorAll('span');
        let foundFirst = false;

        spans.forEach((span) => {
          if (span.textContent && element.text && element.text.includes(span.textContent.trim())) {
            span.classList.add('element-highlight');
            if (!foundFirst) {
              span.scrollIntoView({ behavior: 'smooth', block: 'center' });
              foundFirst = true;
            }
          }
        });
      }

      // HTML 预览：高亮匹配的 HTML 元素
      const docContainer = iframeDoc.querySelector('.document-container');
      if (docContainer) {
        if (element.type === 'table') {
          // 高亮表格
          const tables = docContainer.querySelectorAll('table');
          tables.forEach((table) => {
            const headerRow = table.querySelector('tr');
            if (headerRow && element.headerRow) {
              const headers = headerRow.querySelectorAll('th, td');
              const headerText = Array.from(headers)
                .map((h) => h.textContent.trim())
                .join(' | ');
              if (
                element.headerRow.includes(headerText.substring(0, 30)) ||
                headerText.includes(element.headerRow.substring(0, 30))
              ) {
                table.classList.add('element-highlight');
                table.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }
          });
        } else if (element.type === 'image') {
          // 高亮图片
          const images = docContainer.querySelectorAll('img');
          images.forEach((img, idx) => {
            if (idx < 2) {
              // 假设只有前两张图片是文档中的截图
              img.classList.add('element-highlight');
              if (idx === 0 || element.imageId?.includes('rId6')) {
                img.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }
          });
        } else if (element.text) {
          // 高亮段落/标题
          const textContent = element.text.substring(0, 50);
          const elements = docContainer.querySelectorAll('p, h1, h2, h3');
          let foundFirst = false;
          elements.forEach((el) => {
            if (
              el.textContent &&
              (el.textContent.includes(textContent) ||
                textContent.includes(el.textContent.trim().substring(0, 30)))
            ) {
              el.classList.add('element-highlight');
              if (!foundFirst) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                foundFirst = true;
              }
            }
          });
        }
      }
    } catch (e) {
      console.warn('Could not highlight element in preview:', e);
    }
  }

  async function loadDocumentPreview(template) {
    try {
      const result = await apiRequest(`/templates/${template.id}/preview-html`);

      // Load HTML into iframe
      elements.previewIframe.srcdoc = result.html;

      // Reset zoom
      state.currentZoom = 1;
      updateZoom();

      // Setup text selection after iframe loads
      elements.previewIframe.onload = () => {
        setupIframeSelection();
      };
    } catch (error) {
      console.error('Failed to load document preview:', error);
      elements.previewIframe.srcdoc = `
                <html>
                <body style="display:flex;align-items:center;justify-content:center;height:100vh;background:#f5f5f5;">
                    <div style="text-align:center;color:#999;">
                        <i class="fas fa-exclamation-triangle" style="font-size:48px;margin-bottom:16px;"></i>
                        <p>Failed to load document preview</p>
                    </div>
                </body>
                </html>
            `;
    }
  }

  function setupIframeSelection() {
    try {
      const iframeDoc =
        elements.previewIframe.contentDocument || elements.previewIframe.contentWindow.document;

      // Style for highlighted elements
      const style = iframeDoc.createElement('style');
      style.textContent = `
                .carbone-highlight {
                    background-color: #fff3cd !important;
                    border: 2px dashed #ffc107 !important;
                    cursor: pointer;
                }
                .carbone-highlight:hover {
                    background-color: #ffe69c !important;
                }
                .element-highlight {
                    background-color: rgba(0, 123, 255, 0.3) !important;
                    border: 2px solid #007bff !important;
                    border-radius: 2px;
                }
                /* Allow click on text layer for element selection */
                .textLayer {
                    user-select: none !important;
                    -webkit-user-select: none !important;
                    cursor: pointer !important;
                    pointer-events: auto !important;
                }
                .textLayer span {
                    cursor: pointer !important;
                }
                .textLayer span:hover {
                    background-color: rgba(0, 123, 255, 0.15) !important;
                }
                /* HTML preview element styles */
                .document-container p, .document-container h1, .document-container h2,
                .document-container h3, .document-container table, .document-container img {
                    cursor: pointer !important;
                }
                .document-container p:hover, .document-container h1:hover,
                .document-container h2:hover, .document-container h3:hover {
                    background-color: rgba(0, 123, 255, 0.1) !important;
                }
                .document-container table:hover {
                    outline: 2px solid #007bff !important;
                }
                .document-container img:hover {
                    outline: 2px solid #007bff !important;
                    opacity: 0.9;
                }
            `;
      iframeDoc.head.appendChild(style);

      // 检测预览类型（PDF有textLayer，HTML有document-container）
      // PDF.js异步渲染，需要等待textLayer出现
      const waitForPreviewType = () => {
        const isPdfPreview = iframeDoc.querySelector('.textLayer') !== null;
        const isHtmlPreview = iframeDoc.querySelector('.document-container') !== null;

        console.log('Preview type:', isPdfPreview ? 'PDF' : isHtmlPreview ? 'HTML' : 'Unknown');

        if (!isPdfPreview && !isHtmlPreview) {
          // PDF.js还没渲染完成，等待后再检测
          setTimeout(waitForPreviewType, 500);
          return;
        }

        // 预览类型确定后，设置点击事件处理
        setupClickHandlers(iframeDoc);
      };

      waitForPreviewType();
    } catch (error) {
      console.error('Failed to setup iframe selection:', error);
    }
  }

  function setupClickHandlers(iframeDoc) {
    try {
      iframeDoc.addEventListener('click', (e) => {
        // PDF 预览处理
        const clickedSpan = e.target.closest('.textLayer span');
        const clickedTextLayer = e.target.closest('.textLayer');
        const clickedCanvas = e.target.closest('#pdf-canvas') || e.target.closest('canvas');

        // HTML 预览处理
        const clickedParagraph = e.target.closest(
          '.document-container p, .document-container h1, .document-container h2, .document-container h3'
        );
        const clickedTable = e.target.closest('.document-container table');
        const clickedImg = e.target.closest('.document-container img');

        // 获取要搜索的元素列表
        let elementsToSearch = [];
        if (state.xmlStructure?.orderedElements?.length > 0) {
          elementsToSearch = state.xmlStructure.orderedElements.map((el, idx) => {
            const docEl = state.documentElements.find((d) => {
              if (el.type === 'table' && d.type === 'table') {
                return (
                  d.headerRow && el.headerRow && d.headerRow.includes(el.headerRow.substring(0, 30))
                );
              }
              if (el.type === 'image' && d.type === 'image') {
                return el.imageId && d.imageId === el.imageId;
              }
              return (
                d.text &&
                el.text &&
                (d.text === el.text || d.text.includes(el.text.substring(0, 50)))
              );
            });
            return (
              docEl || {
                text: el.text,
                type: el.type,
                headerRow: el.headerRow,
                dataRows: el.dataRows,
                imageId: el.imageId,
                orderIndex: el.orderIndex,
              }
            );
          });
        } else {
          elementsToSearch = state.documentElements;
        }

        let matchingElement = null;

        // PDF 预览：处理文本点击
        if (clickedSpan) {
          const clickedText = clickedSpan.textContent.trim();
          if (!clickedText) return;

          // 获取点击元素的Y坐标，用于判断是否在表格区域内
          const clickedRect = clickedSpan.getBoundingClientRect();
          const clickedY = clickedRect.top;

          // 优先检查是否点击的是表格区域内（标题行或数据行）的文字
          const tableElements = elementsToSearch.filter((el) => el.type === 'table');
          for (const tableEl of tableElements) {
            let isTableText = false;

            // 检查标题行
            if (tableEl.headerRow) {
              const headerParts = tableEl.headerRow.split(/[|,，]/).map((p) => p.trim());
              if (headerParts.includes(clickedText) || tableEl.headerRow.includes(clickedText)) {
                isTableText = true;
              }
            }

            // 检查数据行
            if (!isTableText && tableEl.dataRows) {
              for (const row of tableEl.dataRows) {
                if (row && row.includes(clickedText)) {
                  isTableText = true;
                  break;
                }
              }
            }

            // 检查表格整体文本（fallback）
            if (!isTableText && tableEl.text) {
              // 检查点击的文字是否是表格中常见的状态文字
              const tableKeywords = [
                'Success',
                'success',
                'Failed',
                'failed',
                'completed',
                'navigate',
                'wait',
                'screenshot',
                'search',
              ];
              if (tableKeywords.includes(clickedText) && tableEl.text.includes(clickedText)) {
                isTableText = true;
              }
            }

            if (isTableText) {
              matchingElement = tableEl;
              break;
            }
          }

          // 如果没有匹配到表格，再尝试段落匹配
          if (!matchingElement) {
            // First try exact match
            matchingElement = elementsToSearch.find((el) => {
              return el.text && el.text === clickedText;
            });
          }

          // If no exact match, try element that starts with clicked text
          if (!matchingElement) {
            matchingElement = elementsToSearch.find((el) => {
              return el.text && el.text.startsWith(clickedText);
            });
          }

          // If no match, try element that contains the clicked text
          if (!matchingElement) {
            matchingElement = elementsToSearch.find((el) => {
              return el.text && el.text.includes(clickedText);
            });
          }

          // If still no match, try partial match (clicked text contains element text)
          if (!matchingElement) {
            matchingElement = elementsToSearch.find((el) => {
              return (
                el.text && clickedText.includes(el.text.substring(0, 20)) && el.text.length > 10
              );
            });
          }
        }
        // 处理 textLayer 点击但不在 span 上（图片区域或空白区域）
        else if (clickedTextLayer && !clickedSpan) {
          // 点击的是 textLayer 但不是文字，可能是图片区域
          // 获取点击坐标
          const clickX = e.clientX;
          const clickY = e.clientY;

          // 获取所有图片元素
          const imageElements = elementsToSearch.filter((el) => el.type === 'image');

          if (imageElements.length > 0) {
            // 根据页面和点击位置判断选择哪张图片
            // 图片通常在"截图记录"标题下方，或"Step X: screenshot"后面
            const textLayerRect = clickedTextLayer.getBoundingClientRect();
            const relativeY = clickY - textLayerRect.top;
            const relativeX = clickX - textLayerRect.left;

            // 检查附近是否有"截图"相关文本
            const nearbySpans = clickedTextLayer.querySelectorAll('span');
            let foundScreenshotText = false;
            let nearbyText = '';

            nearbySpans.forEach((span) => {
              const spanRect = span.getBoundingClientRect();
              const distance = Math.abs(spanRect.top - clickY);
              if (distance < 100) {
                // 100px范围内的文本
                nearbyText += span.textContent + ' ';
              }
            });

            // 如果附近有"截图"或"Step X: screenshot"文本，选择对应的图片
            if (nearbyText.includes('截图') || nearbyText.toLowerCase().includes('screenshot')) {
              // 尝试通过Step编号匹配图片
              const stepMatch = nearbyText.match(/Step\s+(\d+)/i);
              if (stepMatch) {
                const stepNum = parseInt(stepMatch[1], 10);
                // 找到对应Step的图片（Step 3对应第一张，Step 7对应第二张）
                const imageIndex = stepNum === 3 ? 0 : stepNum === 7 ? 1 : 0;
                matchingElement = imageElements[imageIndex] || imageElements[0];
              } else {
                // 默认选择第一张图片
                matchingElement = imageElements[0];
              }
            } else {
              // 根据Y坐标判断：上半部分选第一张，下半部分选第二张
              const imageIndex = relativeY < textLayerRect.height / 2 ? 0 : 1;
              matchingElement = imageElements[Math.min(imageIndex, imageElements.length - 1)];
            }
          }

          // 如果没有找到图片元素，尝试找截图相关的段落
          if (!matchingElement) {
            matchingElement = elementsToSearch.find((el) => {
              if (el.type === 'paragraph') {
                const elText = el.text || '';
                return elText.includes('截图') || elText.toLowerCase().includes('screenshot');
              }
              return false;
            });
          }
        }
        // HTML 预览：处理表格点击
        else if (clickedTable) {
          // 获取表格的标题行文本
          const headerRow = clickedTable.querySelector('tr');
          let headerText = '';
          if (headerRow) {
            const headers = headerRow.querySelectorAll('th, td');
            headerText = Array.from(headers)
              .map((h) => h.textContent.trim())
              .join(' | ');
          }

          // 匹配表格
          matchingElement = elementsToSearch.find((el) => {
            if (el.type === 'table' && el.headerRow && headerText) {
              return (
                el.headerRow.includes(headerText.substring(0, 30)) ||
                headerText.includes(el.headerRow.substring(0, 30))
              );
            }
            return false;
          });

          // 如果没有通过标题行匹配，尝试通过文本匹配
          if (!matchingElement) {
            const tableText = clickedTable.textContent.trim().substring(0, 100);
            matchingElement = elementsToSearch.find((el) => {
              if (el.type === 'table' && el.text) {
                return (
                  tableText.includes(el.text.substring(0, 50)) ||
                  el.text.includes(tableText.substring(0, 50))
                );
              }
              return false;
            });
          }
        }
        // HTML 预览：处理图片点击
        else if (clickedImg) {
          // 匹配图片元素
          matchingElement = elementsToSearch.find((el) => {
            return el.type === 'image';
          });
        }
        // PDF 预览：处理canvas点击（图片区域）
        else if (clickedCanvas) {
          // 点击的是PDF canvas，可能是图片区域
          const imageElements = elementsToSearch.filter((el) => el.type === 'image');

          if (imageElements.length > 0) {
            // 获取点击坐标相对于canvas的位置
            const canvasRect = clickedCanvas.getBoundingClientRect();
            const relativeY = e.clientY - canvasRect.top;
            const relativeX = e.clientX - canvasRect.left;

            // 根据Y坐标判断选择哪张图片
            // 图片通常在页面的中下部分
            const imageIndex = relativeY > canvasRect.height * 0.4 ? 0 : 1;
            matchingElement = imageElements[Math.min(imageIndex, imageElements.length - 1)];

            console.log(
              'Canvas clicked at:',
              relativeX,
              relativeY,
              'Selected image index:',
              imageIndex
            );
          }
        }
        // HTML 预览：处理段落/标题点击
        else if (clickedParagraph) {
          const clickedText = clickedParagraph.textContent.trim();
          if (!clickedText) return;

          // 首先尝试精确匹配
          matchingElement = elementsToSearch.find((el) => {
            if (
              el.type === 'paragraph' ||
              el.type === 'title' ||
              el.type === 'heading1' ||
              el.type === 'heading2' ||
              el.type === 'heading3'
            ) {
              return (
                el.text &&
                (el.text === clickedText ||
                  clickedText === el.text.substring(0, clickedText.length))
              );
            }
            return false;
          });

          // 如果没有精确匹配，尝试包含匹配
          if (!matchingElement) {
            matchingElement = elementsToSearch.find((el) => {
              if (
                el.type === 'paragraph' ||
                el.type === 'title' ||
                el.type === 'heading1' ||
                el.type === 'heading2' ||
                el.type === 'heading3'
              ) {
                return (
                  el.text &&
                  (el.text.includes(clickedText) || clickedText.includes(el.text.substring(0, 50)))
                );
              }
              return false;
            });
          }
        }

        if (matchingElement) {
          // 如果是从orderedElements来的，需要找到对应的documentElement
          if (matchingElement.orderIndex !== undefined && !matchingElement.id) {
            const docEl = state.documentElements.find((d) => {
              if (matchingElement.type === 'table' && d.type === 'table') {
                return (
                  d.headerRow &&
                  matchingElement.headerRow &&
                  d.headerRow.includes(matchingElement.headerRow.substring(0, 30))
                );
              }
              return (
                d.text &&
                matchingElement.text &&
                (d.text === matchingElement.text ||
                  d.text.includes(matchingElement.text.substring(0, 50)))
              );
            });
            if (docEl) matchingElement = docEl;
          }
          selectDocumentElement(matchingElement);
        }
      });
      console.log('PDF click handler attached to document (works for all pages)');
    } catch (e) {
      console.warn('Could not setup iframe selection:', e);
    }
  }

  // handleTextSelection is no longer needed - element selection is done via Document Elements panel
  function handleTextSelection(e) {
    // Disabled - use Document Elements panel for atomic element selection
  }

  function showSelectionSection(text) {
    elements.selectedTextDisplay.textContent = text;
    elements.variablePathInput.value = suggestVariablePath(text);
    elements.formattersInput.value = '';
    elements.selectionSection.style.display = 'block';
  }

  function hideSelectionSection() {
    elements.selectionSection.style.display = 'none';
  }

  function suggestVariablePath(text) {
    // Simple heuristics for suggesting variable paths
    if (/^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(text)) return 'd.date';
    if (/^[￥¥$]\s*\d/.test(text)) return 'd.amount';
    if (/^\d+\.?\d*\s*(元|件|个|张|份)/.test(text)) return 'd.quantity';
    if (/^\d{11}$/.test(text) || /^1[3-9]\d{9}$/.test(text)) return 'd.phone';
    if (/^[\w.-]+@[\w.-]+\.\w+$/.test(text)) return 'd.email';
    if (/^[\u4e00-\u9fa5]{2,4}$/.test(text)) return 'd.name';
    return 'd.value';
  }

  function updateZoom() {
    elements.previewIframe.style.transform = `scale(${state.currentZoom})`;
    elements.zoomLevel.textContent = `${Math.round(state.currentZoom * 100)}%`;
  }

  async function loadMarkings(templateId) {
    try {
      const result = await apiRequest(`/templates/${templateId}/markings`);

      // 加载标记
      if (result.markings && result.markings.length > 0) {
        state.manualMarkings = {};
        result.markings.forEach((m) => {
          if (m.index !== undefined) {
            state.manualMarkings[m.index] = m.type;
          }
        });
      } else {
        state.manualMarkings = {};
      }

      // 加载忽略元素
      if (result.ignoredElements && result.ignoredElements.length > 0) {
        state.ignoredElements = {};
        result.ignoredElements.forEach((idx) => {
          state.ignoredElements[idx] = true;
        });
      } else {
        state.ignoredElements = {};
      }

      // 加载元素分组
      if (result.elementGroups && Object.keys(result.elementGroups).length > 0) {
        state.elementGroups = result.elementGroups;
      } else {
        state.elementGroups = {};
      }

      // 加载忽略的分组
      if (result.ignoredGroups && result.ignoredGroups.length > 0) {
        state.ignoredGroups = {};
        result.ignoredGroups.forEach((groupId) => {
          state.ignoredGroups[groupId] = true;
        });
      } else {
        state.ignoredGroups = {};
      }
    } catch (error) {
      console.error('Load markings failed:', error);
      state.manualMarkings = {};
      state.ignoredElements = {};
      state.elementGroups = {};
      state.ignoredGroups = {};
    }
  }
