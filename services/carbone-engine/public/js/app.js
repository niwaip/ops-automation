// Carbone Studio - Main Application
(function() {
    'use strict';

    // API Base URL
    const API_BASE = '/studio';

    // State
    const state = {
        templates: [],
        selectedTemplate: null,
        formatters: [],
        manualMarkings: {},  // 改为对象，key是元素索引
        templateConfig: null,  // AI生成的模板配置
        currentZoom: 1,
        documentElements: [],
        sourceXml: '',
        currentTab: 'source',  // 默认显示代码页
        currentSourceView: 'structure',  // 默认显示结构化视图
        xmlStructure: null,
        selectedElementIndices: [],  // 多选元素索引列表
        elementGroups: {},  // 元素分组：{ groupId: [index1, index2, ...] }
        ignoredGroups: {},  // 被忽略的分组：{ groupId: true } - 用于标记重复的分组
        ignoredElements: {}  // 被忽略的元素：{ index: true } - 用于标记重复/忽略的元素
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
        elements.aiConfigBtn = document.getElementById('ai-config-btn');
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
            html: 'fa-file-code'
        };
        return icons[format] || 'fa-file';
    }

    function showToast(message, type = 'info') {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-circle',
            info: 'fa-info-circle'
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
                    ...options.headers
                },
                ...options
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

        elements.templateList.innerHTML = state.templates.map(t => `
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
        `).join('');

        // Bind events
        document.querySelectorAll('.template-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.delete-btn')) return;
                const id = item.dataset.id;
                const template = state.templates.find(t => t.id === id);
                if (template) selectTemplate(template);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
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
        renderTemplateList();

        elements.noTemplate.style.display = 'none';
        elements.templateEditor.style.display = 'flex';

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
                // 结构渲染完成后加载已保存的标记和模板配置
                loadSavedMarkings();
                loadSavedTemplateConfig();
            });
        });

        // Update header
        elements.templateName.textContent = template.fileName;
        elements.templateFormat.textContent = template.format.toUpperCase();
        elements.templateFormat.className = `badge badge-info`;

        // Render variables
        elements.varsCount.textContent = template.variables.length;
        elements.variablesList.innerHTML = template.variables.length > 0
            ? template.variables.map(v => `
                <div class="variable-item">
                    <code>{${v}}</code>
                </div>
            `).join('')
            : '<span class="empty-hint">No variables found</span>';

        // Render loops
        elements.loopsList.innerHTML = template.loops.length > 0
            ? template.loops.map(l => `
                <div class="loop-item">
                    <i class="fas fa-repeat"></i>
                    <code>${l.arrayPath}</code>
                </div>
            `).join('')
            : '<span class="empty-hint">No loops detected</span>';

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
            'title': 'fa-heading',
            'heading1': 'fa-heading',
            'heading2': 'fa-heading',
            'heading3': 'fa-heading',
            'paragraph': 'fa-paragraph',
            'table': 'fa-table',
            'list': 'fa-list',
            'image': 'fa-image'
        };
        return icons[type] || 'fa-file-alt';
    }

    function getElementLabel(type) {
        const labels = {
            'title': 'Title',
            'heading1': 'Heading 1',
            'heading2': 'Heading 2',
            'heading3': 'Heading 3',
            'paragraph': 'Paragraph',
            'table': 'Table',
            'list': 'List',
            'image': 'Image'
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
            const iframeDoc = elements.previewIframe.contentDocument || elements.previewIframe.contentWindow.document;

            // Remove existing highlights
            iframeDoc.querySelectorAll('.element-highlight').forEach(el => {
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

                spans.forEach(span => {
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

                spans.forEach(span => {
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
                    tables.forEach(table => {
                        const headerRow = table.querySelector('tr');
                        if (headerRow && element.headerRow) {
                            const headers = headerRow.querySelectorAll('th, td');
                            const headerText = Array.from(headers).map(h => h.textContent.trim()).join(' | ');
                            if (element.headerRow.includes(headerText.substring(0, 30)) ||
                                headerText.includes(element.headerRow.substring(0, 30))) {
                                table.classList.add('element-highlight');
                                table.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }
                    });
                } else if (element.type === 'image') {
                    // 高亮图片
                    const images = docContainer.querySelectorAll('img');
                    images.forEach((img, idx) => {
                        if (idx < 2) { // 假设只有前两张图片是文档中的截图
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
                    elements.forEach(el => {
                        if (el.textContent && (el.textContent.includes(textContent) || textContent.includes(el.textContent.trim().substring(0, 30)))) {
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
            const iframeDoc = elements.previewIframe.contentDocument || elements.previewIframe.contentWindow.document;

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

                console.log('Preview type:', isPdfPreview ? 'PDF' : (isHtmlPreview ? 'HTML' : 'Unknown'));

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
                const clickedParagraph = e.target.closest('.document-container p, .document-container h1, .document-container h2, .document-container h3');
                const clickedTable = e.target.closest('.document-container table');
                const clickedImg = e.target.closest('.document-container img');

                // 获取要搜索的元素列表
                let elementsToSearch = [];
                if (state.xmlStructure?.orderedElements?.length > 0) {
                    elementsToSearch = state.xmlStructure.orderedElements.map((el, idx) => {
                        const docEl = state.documentElements.find(d => {
                            if (el.type === 'table' && d.type === 'table') {
                                return d.headerRow && el.headerRow &&
                                       d.headerRow.includes(el.headerRow.substring(0, 30));
                            }
                            if (el.type === 'image' && d.type === 'image') {
                                return el.imageId && d.imageId === el.imageId;
                            }
                            return d.text && el.text &&
                                   (d.text === el.text || d.text.includes(el.text.substring(0, 50)));
                        });
                        return docEl || {
                            text: el.text,
                            type: el.type,
                            headerRow: el.headerRow,
                            dataRows: el.dataRows,
                            imageId: el.imageId,
                            orderIndex: el.orderIndex
                        };
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
                    const tableElements = elementsToSearch.filter(el => el.type === 'table');
                    for (const tableEl of tableElements) {
                        let isTableText = false;

                        // 检查标题行
                        if (tableEl.headerRow) {
                            const headerParts = tableEl.headerRow.split(/[|,，]/).map(p => p.trim());
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
                            const tableKeywords = ['Success', 'success', 'Failed', 'failed', 'completed', 'navigate', 'wait', 'screenshot', 'search'];
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
                        matchingElement = elementsToSearch.find(el => {
                            return el.text && el.text === clickedText;
                        });
                    }

                    // If no exact match, try element that starts with clicked text
                    if (!matchingElement) {
                        matchingElement = elementsToSearch.find(el => {
                            return el.text && el.text.startsWith(clickedText);
                        });
                    }

                    // If no match, try element that contains the clicked text
                    if (!matchingElement) {
                        matchingElement = elementsToSearch.find(el => {
                            return el.text && el.text.includes(clickedText);
                        });
                    }

                    // If still no match, try partial match (clicked text contains element text)
                    if (!matchingElement) {
                        matchingElement = elementsToSearch.find(el => {
                            return el.text && clickedText.includes(el.text.substring(0, 20)) && el.text.length > 10;
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
                    const imageElements = elementsToSearch.filter(el => el.type === 'image');

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

                        nearbySpans.forEach(span => {
                            const spanRect = span.getBoundingClientRect();
                            const distance = Math.abs(spanRect.top - clickY);
                            if (distance < 100) { // 100px范围内的文本
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
                                const imageIndex = stepNum === 3 ? 0 : (stepNum === 7 ? 1 : 0);
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
                        matchingElement = elementsToSearch.find(el => {
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
                        headerText = Array.from(headers).map(h => h.textContent.trim()).join(' | ');
                    }

                    // 匹配表格
                    matchingElement = elementsToSearch.find(el => {
                        if (el.type === 'table' && el.headerRow && headerText) {
                            return el.headerRow.includes(headerText.substring(0, 30)) ||
                                   headerText.includes(el.headerRow.substring(0, 30));
                        }
                        return false;
                    });

                    // 如果没有通过标题行匹配，尝试通过文本匹配
                    if (!matchingElement) {
                        const tableText = clickedTable.textContent.trim().substring(0, 100);
                        matchingElement = elementsToSearch.find(el => {
                            if (el.type === 'table' && el.text) {
                                return tableText.includes(el.text.substring(0, 50)) ||
                                       el.text.includes(tableText.substring(0, 50));
                            }
                            return false;
                        });
                    }
                }
                // HTML 预览：处理图片点击
                else if (clickedImg) {
                    // 匹配图片元素
                    matchingElement = elementsToSearch.find(el => {
                        return el.type === 'image';
                    });
                }
                // PDF 预览：处理canvas点击（图片区域）
                else if (clickedCanvas) {
                    // 点击的是PDF canvas，可能是图片区域
                    const imageElements = elementsToSearch.filter(el => el.type === 'image');

                    if (imageElements.length > 0) {
                        // 获取点击坐标相对于canvas的位置
                        const canvasRect = clickedCanvas.getBoundingClientRect();
                        const relativeY = e.clientY - canvasRect.top;
                        const relativeX = e.clientX - canvasRect.left;

                        // 根据Y坐标判断选择哪张图片
                        // 图片通常在页面的中下部分
                        const imageIndex = relativeY > canvasRect.height * 0.4 ? 0 : 1;
                        matchingElement = imageElements[Math.min(imageIndex, imageElements.length - 1)];

                        console.log('Canvas clicked at:', relativeX, relativeY, 'Selected image index:', imageIndex);
                    }
                }
                // HTML 预览：处理段落/标题点击
                else if (clickedParagraph) {
                    const clickedText = clickedParagraph.textContent.trim();
                    if (!clickedText) return;

                    // 首先尝试精确匹配
                    matchingElement = elementsToSearch.find(el => {
                        if (el.type === 'paragraph' || el.type === 'title' ||
                            el.type === 'heading1' || el.type === 'heading2' || el.type === 'heading3') {
                            return el.text && (el.text === clickedText || clickedText === el.text.substring(0, clickedText.length));
                        }
                        return false;
                    });

                    // 如果没有精确匹配，尝试包含匹配
                    if (!matchingElement) {
                        matchingElement = elementsToSearch.find(el => {
                            if (el.type === 'paragraph' || el.type === 'title' ||
                                el.type === 'heading1' || el.type === 'heading2' || el.type === 'heading3') {
                                return el.text && (el.text.includes(clickedText) || clickedText.includes(el.text.substring(0, 50)));
                            }
                            return false;
                        });
                    }
                }

                if (matchingElement) {
                    // 如果是从orderedElements来的，需要找到对应的documentElement
                    if (matchingElement.orderIndex !== undefined && !matchingElement.id) {
                        const docEl = state.documentElements.find(d => {
                            if (matchingElement.type === 'table' && d.type === 'table') {
                                return d.headerRow && matchingElement.headerRow &&
                                       d.headerRow.includes(matchingElement.headerRow.substring(0, 30));
                            }
                            return d.text && matchingElement.text &&
                                   (d.text === matchingElement.text || d.text.includes(matchingElement.text.substring(0, 50)));
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
            state.manualMarkings = result.markings || [];
        } catch (error) {
            state.manualMarkings = [];
        }
    }

    // Upload Function
    async function uploadTemplate(file) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            showToast('Uploading template...', 'info');

            const response = await fetch(`${API_BASE}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Upload failed');
            }

            const result = await response.json();
            showToast('Template uploaded successfully', 'success');

            // Reload templates
            await loadTemplates();

            // Select the new template
            const newTemplate = state.templates.find(t => t.id === result.id);
            if (newTemplate) selectTemplate(newTemplate);

        } catch (error) {
            showToast('Upload failed: ' + error.message, 'error');
        }
    }

    // Delete Function
    async function deleteTemplate(id) {
        try {
            await apiRequest(`/templates/${id}/delete`, { method: 'POST' });
            showToast('Template deleted', 'success');
            state.templates = state.templates.filter(t => t.id !== id);
            if (state.selectedTemplate?.id === id) {
                state.selectedTemplate = null;
                elements.noTemplate.style.display = 'flex';
                elements.templateEditor.style.display = 'none';
            }
            renderTemplateList();
        } catch (error) {
            showToast('Failed to delete template', 'error');
        }
    }

    // Validate Function
    async function validateData() {
        if (!state.selectedTemplate) return;

        let data = {};
        try {
            const text = elements.testData.value.trim();
            if (text) {
                data = JSON.parse(text);
            }
        } catch {
            showToast('Invalid JSON in test data', 'error');
            return;
        }

        try {
            const result = await apiRequest('/validate', {
                method: 'POST',
                body: JSON.stringify({
                    templateId: state.selectedTemplate.id,
                    data
                })
            });

            if (result.valid) {
                showToast('Validation passed!', 'success');
            } else {
                showToast(`Missing variables: ${result.missing.join(', ')}`, 'warning');
            }
        } catch (error) {
            showToast('Validation failed', 'error');
        }
    }

    // Render Function
    async function renderTemplate() {
        if (!state.selectedTemplate) return;

        let data = {};
        try {
            const text = elements.testData.value.trim();
            if (text) {
                data = JSON.parse(text);
            }
        } catch {
            showToast('Invalid JSON in test data', 'error');
            return;
        }

        const outputFormat = elements.outputFormat.value || undefined;

        try {
            showToast('Rendering template...', 'info');

            const result = await apiRequest('/render', {
                method: 'POST',
                body: JSON.stringify({
                    templateId: state.selectedTemplate.id,
                    data,
                    outputFormat
                })
            });

            showToast('Template rendered successfully', 'success');

            // Download file
            const link = document.createElement('a');
            link.href = result.downloadUrl;
            link.download = result.fileName;
            link.click();

            closeModal();

        } catch (error) {
            showToast('Render failed: ' + error.message, 'error');
        }
    }

    // AI Identify Function
    async function aiIdentifyVariables() {
        if (!state.selectedTemplate) {
            showToast('Please select a template first', 'warning');
            return;
        }

        elements.aiSuggestionsList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Analyzing...</div>';

        try {
            const result = await apiRequest(`/templates/${state.selectedTemplate.id}/ai-identify`, {
                method: 'POST',
                body: JSON.stringify({
                    templateId: state.selectedTemplate.id
                })
            });

            renderAISuggestions(result.suggestions);
            showToast(`Found ${result.suggestions.length} potential variables`, 'success');
        } catch (error) {
            elements.aiSuggestionsList.innerHTML = '<span class="empty-hint">Analysis failed</span>';
            showToast('Failed to analyze template', 'error');
        }
    }

    // Advanced AI Analysis with user context
    async function performAIAnalysis() {
        if (!state.selectedTemplate) {
            showToast('请先选择一个模板', 'warning');
            return;
        }

        const userContext = elements.aiContextInput?.value || '';

        // Disable button and show loading
        elements.aiAnalyzeBtn.disabled = true;
        elements.aiAnalyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 分析中...';

        try {
            // Call AI identify with enhanced context
            const identifyResult = await apiRequest(`/templates/${state.selectedTemplate.id}/ai-identify`, {
                method: 'POST',
                body: JSON.stringify({
                    templateId: state.selectedTemplate.id,
                    context: userContext
                })
            });

            // Extract data from response
            const templateConfig = identifyResult.templateConfig;
            const loops = identifyResult.loops || [];
            const images = identifyResult.images || [];
            const suggestions = identifyResult.suggestions || [];
            const contextAnalysis = identifyResult.contextAnalysis;

            // Render analysis result with all data
            renderAIAnalysisResult(suggestions, loops, contextAnalysis, templateConfig, images);

            const totalVars = suggestions.length;
            const totalLoops = loops.length;
            const totalImages = images.length;
            showToast(`分析完成：${totalLoops}个表格循环，${totalImages}个图片循环，${totalVars}个变量`, 'success');
        } catch (error) {
            console.error('AI analysis failed:', error);
            showToast('AI 分析失败，请重试', 'error');
            elements.aiAnalysisResult.style.display = 'none';
        } finally {
            elements.aiAnalyzeBtn.disabled = false;
            elements.aiAnalyzeBtn.innerHTML = '<i class="fas fa-magic"></i> AI 自动生成模版';
        }
    }

    // AI Generate Function - 合并生成模版和验证
    async function performAIGenerate() {
        if (!state.selectedTemplate) {
            showToast('请先选择一个模板', 'warning');
            return;
        }

        // 禁用按钮并显示加载状态
        elements.aiGenerateBtn.disabled = true;
        elements.aiGenerateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';

        try {
            // 1. 调用AI生成模版配置
            const identifyResult = await apiRequest(`/templates/${state.selectedTemplate.id}/ai-identify`, {
                method: 'POST',
                body: JSON.stringify({
                    templateId: state.selectedTemplate.id,
                    context: '根据手动标记生成模版配置',
                    manualMarkings: state.manualMarkings,
                    markingSummary: buildMarkingSummary()
                })
            });

            const templateConfig = identifyResult.templateConfig;
            const loops = identifyResult.loops || [];
            const suggestions = identifyResult.suggestions || [];

            // 2. 保存模版配置
            if (templateConfig) {
                await apiRequest(`/templates/${state.selectedTemplate.id}/config`, {
                    method: 'POST',
                    body: JSON.stringify({
                        templateId: state.selectedTemplate.id,
                        templateConfig: templateConfig
                    })
                });
                state.templateConfig = templateConfig;
            }

            // 3. 渲染AI建议
            renderAISuggestions(suggestions);

            // 4. 调用AI验证
            const verifyResult = await apiRequest(`/templates/${state.selectedTemplate.id}/ai-verify`, {
                method: 'POST',
                body: JSON.stringify({
                    templateId: state.selectedTemplate.id,
                    prompt: '验证模版配置是否合理',
                    templateConfig: templateConfig
                })
            });

            // 5. 显示验证结果
            if (elements.aiGenerateResultSection && elements.aiGenerateResult) {
                elements.aiGenerateResultSection.style.display = 'block';
                elements.aiGenerateResult.innerHTML = marked.parse(verifyResult.report || '验证完成');
            }

            const totalVars = suggestions.length;
            const totalLoops = loops.length;
            showToast(`生成完成：${totalLoops}个循环，${totalVars}个变量`, 'success');
        } catch (error) {
            console.error('AI generate failed:', error);
            showToast('生成失败: ' + error.message, 'error');
        } finally {
            elements.aiGenerateBtn.disabled = false;
            elements.aiGenerateBtn.innerHTML = '<i class="fas fa-magic"></i> 生成模版';
        }
    }

    // 构建标记摘要
    function buildMarkingSummary() {
        const markings = state.manualMarkings || {};
        const ignored = state.ignoredElements || {};
        let summary = '';

        if (Object.keys(markings).length > 0) {
            summary += '已标记元素：\n';
            Object.entries(markings).forEach(([idx, type]) => {
                const el = state.xmlStructure?.orderedElements?.[idx];
                if (el) {
                    summary += `- 索引${idx}: [${type}] ${el.text?.substring(0, 30) || el.type}\n`;
                }
            });
        }

        if (Object.keys(ignored).length > 0) {
            summary += '\n已忽略元素：\n';
            Object.keys(ignored).forEach(idx => {
                const el = state.xmlStructure?.orderedElements?.[idx];
                if (el) {
                    summary += `- 索引${idx}: ${el.text?.substring(0, 30) || el.type}\n`;
                }
            });
        }

        return summary;
    }

    // AI Verify Function - 利用模版自动生成验证报告
    async function performAIVerify() {
        if (!state.selectedTemplate) {
            showToast('请先选择一个模板', 'warning');
            return;
        }

        // 获取验证提示词
        const verifyPrompt = elements.aiVerifyPrompt?.value || '生成一份示例报告用于验证模版配置';

        // 禁用按钮并显示加载状态
        elements.aiVerifyBtn.disabled = true;
        elements.aiVerifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 验证中...';

        try {
            // 获取测试数据
            const testData = elements.testData?.value || '{}';

            // 调用AI验证API
            const result = await apiRequest(`/templates/${state.selectedTemplate.id}/ai-verify`, {
                method: 'POST',
                body: JSON.stringify({
                    templateId: state.selectedTemplate.id,
                    prompt: verifyPrompt,
                    testData: testData,
                    templateConfig: state.templateConfig
                })
            });

            // 显示验证结果
            if (elements.aiVerifyResult && elements.aiVerifyContent) {
                elements.aiVerifyResult.style.display = 'block';
                elements.aiVerifyContent.innerHTML = result.report || result.message || '验证完成';
            }

            showToast('验证报告已生成', 'success');
        } catch (error) {
            console.error('AI verify failed:', error);
            showToast('AI 验证失败: ' + error.message, 'error');
            if (elements.aiVerifyResult) {
                elements.aiVerifyResult.style.display = 'none';
            }
        } finally {
            elements.aiVerifyBtn.disabled = false;
            elements.aiVerifyBtn.innerHTML = '<i class="fas fa-check-double"></i> AI 验证';
        }
    }

    // Detect potential loops from document structure
    function detectLoopsFromStructure(structure) {
        const loops = [];

        // Find tables that look like data tables
        const tables = structure.elements?.filter(el => el.type === 'table') || [];

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
                    rowCount: rowCount
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
            const templateType = templateConfig?.templateType || contextAnalysis?.detectedTemplateType || '通用文档';
            const userIntent = contextAnalysis?.userIntent || '';

            html += `
                <div class="ai-result-section" style="background:#e6f7ff;padding:10px;border-radius:4px;margin-bottom:12px;">
                    <h4 style="margin:0 0 8px 0;color:#1890ff;font-size:13px;">
                        <i class="fas fa-info-circle"></i> 模版类型: ${templateType}
                    </h4>
                    ${userIntent ? `<div style="font-size:12px;color:#666;margin-bottom:4px;">分析指令: ${userIntent}</div>` : ''}
                    ${templateConfig?.analysisNotes?.length > 0 ? `
                        <div style="font-size:12px;color:#52c41a;">
                            ${templateConfig.analysisNotes.map(n => `<div>• ${n}</div>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // Show detected table loops
        if (loops && loops.length > 0) {
            html += '<div class="ai-result-section"><h4 style="margin-bottom:8px;color:#d46b08;"><i class="fas fa-sync"></i> 检测到的表格循环</h4>';
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
                        ${loop.columnMappings && loop.columnMappings.length > 0 ? `
                            <div style="font-size:11px;color:#999;margin-bottom:4px;">
                                列映射: ${loop.columnMappings.slice(0, 3).map(c => `<code style="background:#f0f0f0;padding:1px 3px;margin:1px;">${c.headerName}→{${c.variablePath}}</code>`).join(' ')}
                                ${loop.columnMappings.length > 3 ? `<span>+${loop.columnMappings.length - 3}更多</span>` : ''}
                            </div>
                        ` : ''}
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
            html += '<div class="ai-result-section"><h4 style="margin-bottom:8px;color:#722ed1;"><i class="fas fa-images"></i> 检测到的图片循环</h4>';
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
            html += '<div class="ai-result-section"><h4 style="margin-bottom:8px;color:#1890ff;"><i class="fas fa-tags"></i> 检测到的变量</h4>';
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
            html = '<div style="text-align:center;color:#999;padding:20px;">未检测到明显的变量或循环结构</div>';
        }

        elements.aiResultContent.innerHTML = html;
        elements.aiAnalysisResult.style.display = 'block';

        // Bind apply button events
        elements.aiResultContent.querySelectorAll('.ai-apply-btn').forEach(btn => {
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

        const exists = state.selectedTemplate.loops.some(l => l.arrayPath === loopPath);
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

        elements.loopsList.innerHTML = state.selectedTemplate.loops.map(l => `
            <div class="loop-item">
                <i class="fas fa-repeat"></i>
                <code>{#${l.arrayPath}}</code>
            </div>
        `).join('');
    }

    function renderAISuggestions(suggestions) {
        if (suggestions.length === 0) {
            elements.aiSuggestionsList.innerHTML = '<span class="empty-hint">No potential variables found</span>';
            elements.suggestionsCount.style.display = 'none';
            return;
        }

        elements.suggestionsCount.textContent = suggestions.length;
        elements.suggestionsCount.style.display = 'inline';

        elements.aiSuggestionsList.innerHTML = suggestions.map((s, index) => `
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
        `).join('');

        // Bind accept/reject events
        elements.aiSuggestionsList.querySelectorAll('.btn-accept').forEach(btn => {
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

        elements.aiSuggestionsList.querySelectorAll('.btn-reject').forEach(btn => {
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
            const formatterList = formatters.split(',').map(f => f.trim()).filter(f => f);
            if (formatterList.length > 0) {
                fullPath += ':' + formatterList.join(':');
            }
        }

        // Add to manual markings
        state.manualMarkings.push({
            path: fullPath,
            text: text,
            createdAt: new Date().toISOString()
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

        try {
            await apiRequest(`/templates/${state.selectedTemplate.id}/markings`, {
                method: 'POST',
                body: JSON.stringify({
                    templateId: state.selectedTemplate.id,
                    markings: state.manualMarkings,
                    ignoredElements: Object.keys(state.ignoredElements || {}).map(idx => parseInt(idx))
                })
            });

            showToast('配置已保存', 'success');
        } catch (error) {
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

        // AI Generate button - 合并生成和验证
        if (elements.aiGenerateBtn) {
            elements.aiGenerateBtn.addEventListener('click', performAIGenerate);
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

        // AI config button
        if (elements.aiConfigBtn) {
            elements.aiConfigBtn.addEventListener('click', handleAIConfig);
        }

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

        navigator.clipboard.writeText(state.sourceXml).then(() => {
            showToast('Source copied to clipboard', 'success');
        }).catch(err => {
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
            formatted.split('\n').forEach(line => {
                line = line.trim();
                if (!line) return;

                // Decrease indent for closing tags
                if (line.startsWith('</')) {
                    indent = Math.max(0, indent - 1);
                }

                lines.push('  '.repeat(indent) + line);

                // Increase indent for opening tags (not self-closing)
                if (line.startsWith('<') && !line.startsWith('</') && !line.endsWith('/>') && !line.match(/<.*\/>/)) {
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

    // 按文档顺序收集元素
    function collectElementsInOrder(parent, structure, apiTables, tableIndex = { value: 0 }) {
        const children = parent.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const tagName = child.tagName || '';
            const localName = child.localName || tagName.split(':').pop() || tagName;

            // 检查是否是表格元素 (w:tbl)
            if (localName === 'tbl' || tagName.includes('tbl')) {
                const rows = child.getElementsByTagNameNS('*', 'tr');
                const text = extractElementText(child);
                const apiTable = apiTables[tableIndex.value] || {};
                tableIndex.value++;

                structure.orderedElements.push({
                    type: 'table',
                    element: child,
                    orderIndex: structure.orderedElements.length,
                    index: structure.tables.length,
                    rows: rows.length,
                    text: text.substring(0, 100),
                    hasPreserve: child.outerHTML.includes('preserve'),
                    headerRow: apiTable.headerRow || '',
                    dataRows: apiTable.dataRows || [],
                    dataRowCount: apiTable.dataRowCount || (apiTable.dataRows ? apiTable.dataRows.length : 0)
                });
            }
            // 检查是否是段落元素 (w:p) - 不在表格单元格内
            else if (localName === 'p' || (tagName.includes(':p') && !tagName.includes('pPr'))) {
                const text = extractElementText(child);

                // 检查段落中是否有图片 (drawing 元素)
                const drawingElements = child.getElementsByTagNameNS('*', 'drawing');
                if (drawingElements.length > 0) {
                    // 添加图片元素
                    for (let d = 0; d < drawingElements.length; d++) {
                        structure.orderedElements.push({
                            type: 'image',
                            element: drawingElements[d],
                            orderIndex: structure.orderedElements.length,
                            text: '[图片]',
                            hasPreserve: false
                        });
                    }
                }

                // 如果段落有文本，也添加段落
                if (text.trim()) {
                    structure.orderedElements.push({
                        type: 'paragraph',
                        element: child,
                        orderIndex: structure.orderedElements.length,
                        index: structure.paragraphs.length,
                        text: text,
                        hasPreserve: child.outerHTML.includes('preserve')
                    });
                }
            }
            // 对于sectPr等非内容元素，跳过
            else if (localName === 'sectPr' || localName === 'pPr' || localName === 'rPr' ||
                     tagName.includes('sectPr') || tagName.includes('pPr') || tagName.includes('rPr')) {
                continue;
            }
            // 递归处理其他元素的子元素
            else {
                collectElementsInOrder(child, structure, apiTables, tableIndex);
            }
        }
    }

    // Parse XML Structure
    function parseXmlStructure() {
        if (!state.sourceXml) return;

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(state.sourceXml, 'text/xml');

        state.xmlStructure = {
            document: xmlDoc,
            tables: [],
            paragraphs: [],
            // 按文档顺序存储所有元素
            orderedElements: [],
            preserveElements: []
        };

        // 使用后端API返回的结构化数据来丰富表格信息
        const apiTables = state.documentElements.filter(el => el.type === 'table');
        const apiImages = state.documentElements.filter(el => el.type === 'image');
        const tableIndex = { value: 0 };

        // 遍历body下的所有直接子元素，按文档顺序收集
        const body = xmlDoc.getElementsByTagNameNS('*', 'body')[0];
        if (body) {
            collectElementsInOrder(body, state.xmlStructure, apiTables, tableIndex);
        }

        // 合并后端API返回的图片数据到orderedElements
        if (apiImages.length > 0) {
            // 找到orderedElements中的图片元素并更新数据
            const imageElements = state.xmlStructure.orderedElements.filter(el => el.type === 'image');
            imageElements.forEach((imgEl, idx) => {
                const apiImage = apiImages[idx];
                if (apiImage) {
                    imgEl.imageId = apiImage.imageId;
                    imgEl.text = apiImage.text;
                    imgEl.altText = apiImage.altText;
                    imgEl.attributes = apiImage.attributes;
                    imgEl.imageWidth = apiImage.imageWidth;
                    imgEl.imageHeight = apiImage.imageHeight;
                }
            });
        }

        // 更新tables数组（保持兼容）
        state.xmlStructure.orderedElements.forEach(el => {
            if (el.type === 'table') {
                state.xmlStructure.tables.push(el);
            }
        });

        // 更新paragraphs数组（保持兼容）
        state.xmlStructure.orderedElements.forEach(el => {
            if (el.type === 'paragraph') {
                state.xmlStructure.paragraphs.push(el);
            }
        });

        // Find elements with preserve
        const allElements = xmlDoc.getElementsByTagName('*');
        for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i];
            const preserveAttr = el.getAttribute('xml:space');
            if (preserveAttr === 'preserve' || el.outerHTML.includes('preserve')) {
                state.xmlStructure.preserveElements.push({
                    element: el,
                    tagName: el.tagName
                });
            }
        }
    }

    // Extract text from XML element
    function extractElementText(element) {
        const textElements = element.getElementsByTagNameNS('*', 't');
        let text = '';
        for (let i = 0; i < textElements.length; i++) {
            text += textElements[i].textContent || '';
        }
        return text;
    }

    // Render Structure Tree
    function renderStructureTree() {
        if (!state.xmlStructure) {
            parseXmlStructure();
        }

        const showPreserve = elements.showPreserve.checked;
        const showTables = elements.showTables.checked;
        const showParagraphs = elements.showParagraphs.checked;

        // 统计各类型标记数量
        const markings = state.manualMarkings || {};
        const ignored = state.ignoredElements || {};
        let paramCount = 0, loopCount = 0, staticCount = 0, ignoredCount = Object.keys(ignored).length;
        Object.values(markings).forEach(type => {
            if (type === 'param') paramCount++;
            else if (type === 'loop') loopCount++;
            else if (type === 'static') staticCount++;
        });

        // 更新图例显示数量
        const legendItems = document.querySelectorAll('.structure-legend .legend-item');
        if (legendItems.length >= 4) {
            legendItems[0].innerHTML = `<span class="legend-color legend-param"></span> 参数${paramCount > 0 ? ` <span class="legend-count">(${paramCount})</span>` : ''}`;
            legendItems[1].innerHTML = `<span class="legend-color legend-loop"></span> 循环${loopCount > 0 ? ` <span class="legend-count">(${loopCount})</span>` : ''}`;
            legendItems[2].innerHTML = `<span class="legend-color legend-static"></span> 静态${staticCount > 0 ? ` <span class="legend-count">(${staticCount})</span>` : ''}`;
            legendItems[3].innerHTML = `<span class="legend-color legend-ignore"></span> 忽略${ignoredCount > 0 ? ` <span class="legend-count">(${ignoredCount})</span>` : ''}`;
        }

        let html = '<div class="structure-content">';

        // Document root
        html += `<div class="structure-node" data-type="document">
            <span class="node-tag">&lt;w:document&gt;</span>
        </div>`;

        html += '<div class="node-children expanded">';

        // Body
        html += `<div class="structure-node" data-type="body">
            <span class="node-tag">&lt;w:body&gt;</span>
        </div>`;

        html += '<div class="node-children expanded">';

        // 统计标记数量
        const markingCount = state.manualMarkings ? Object.keys(state.manualMarkings).length : 0;
        // ignoredCount 已在上面声明

        // 多选操作栏
        const selectedCount = state.selectedElementIndices.length;
        if (selectedCount > 0) {
            html += `<div class="multi-select-bar">
                <span class="selected-info">已选中 ${selectedCount} 个元素</span>
                <button class="btn btn-primary btn-sm" id="merge-selected-btn" title="将选中元素合并为一个循环项">
                    <i class="fas fa-layer-group"></i> 合并为循环项
                </button>
                <button class="btn btn-outline btn-sm" id="clear-selection-btn" title="取消选择">
                    <i class="fas fa-times"></i> 取消选择
                </button>
            </div>`;
        }

        // 显示已有分组
        const groups = state.elementGroups || {};
        const ignoredGroups = state.ignoredGroups || {};
        Object.entries(groups).forEach(([groupId, indices]) => {
            if (indices && indices.length > 0) {
                const indicesStr = indices.join(',');
                const isIgnored = ignoredGroups[groupId];
                const ignoredClass = isIgnored ? 'ignored-group' : '';
                html += `<div class="element-group-bar ${ignoredClass}" data-group="${groupId}">
                    <span class="group-label"><i class="fas fa-layer-group"></i> 分组 #${groupId.substring(0, 4)}</span>
                    <span class="group-info">包含 ${indices.length} 个元素 (索引: ${indicesStr})</span>
                    ${isIgnored ? '<span class="ignored-badge"><i class="fas fa-ban"></i> 已忽略(重复)</span>' : ''}
                    <button class="btn btn-outline btn-sm btn-toggle-ignore" data-group="${groupId}" title="${isIgnored ? '取消忽略' : '标记为重复/忽略'}">
                        <i class="fas ${isIgnored ? 'fa-undo' : 'fa-ban'}"></i> ${isIgnored ? '恢复' : '忽略'}
                    </button>
                    <button class="btn btn-outline btn-sm btn-remove-group" data-group="${groupId}" title="解散分组">
                        <i class="fas fa-times"></i>
                    </button>
                </div>`;
            }
        });

        // 按文档顺序渲染所有元素
        if (state.xmlStructure.orderedElements && state.xmlStructure.orderedElements.length > 0) {
            state.xmlStructure.orderedElements.forEach((el, idx) => {
                const preserveClass = el.hasPreserve && showPreserve ? 'preserve-node' : '';
                const marking = state.manualMarkings?.[idx];
                // 默认是静态，只有明确标记才显示
                const markedClass = marking ? `marked-${marking}` : '';
                const defaultMark = !marking ? 'default-static' : '';
                const isSelected = state.selectedElementIndices.includes(idx);
                const selectedClass = isSelected ? 'selected-for-multi' : '';

                // 检查是否在分组中
                const inGroup = Object.entries(groups).find(([gId, indices]) => indices.includes(idx));
                const groupClass = inGroup ? 'in-group' : '';
                const groupInfo = inGroup ? `<span class="group-tag" title="分组 ${inGroup[0].substring(0, 4)}"><i class="fas fa-layer-group"></i></span>` : '';

                // 检查是否被忽略
                const isIgnored = state.ignoredElements?.[idx];
                const ignoredClass = isIgnored ? 'ignored-element' : '';

                // 如果元素在分组中，且分组第一个元素被标记为loop，则该元素也显示循环标记
                const isFirstInGroup = inGroup && inGroup[1][0] === idx;
                const isInGroupLoop = inGroup && state.manualMarkings?.[inGroup[1][0]] === 'loop';
                const groupLoopClass = isInGroupLoop && !isFirstInGroup ? 'marked-loop-group' : '';

                // 多选复选框
                const checkboxHtml = `<input type="checkbox" class="node-checkbox" data-index="${idx}" ${isSelected ? 'checked' : ''} title="按住Ctrl多选">`;

                // 生成开关按钮（一个按钮切换状态）
                // 状态循环：未设置(默认静态) → 参数 → 循环 → 静态 → 未设置
                // 对于分组中的非首元素，显示"分组循环"状态
                let statusLabel = '静态'; // 默认
                let statusIcon = 'fa-lock';
                let statusClass = 'btn-static';
                let isGroupMember = false; // 是否是分组成员（非首元素）

                if (isInGroupLoop && !isFirstInGroup) {
                    // 分组中的非首元素，显示分组循环状态（不可单独切换）
                    statusLabel = '分组循环';
                    statusIcon = 'fa-layer-group';
                    statusClass = 'btn-loop-group';
                    isGroupMember = true;
                } else if (marking === 'param') {
                    statusLabel = '参数';
                    statusIcon = 'fa-code';
                    statusClass = 'btn-param';
                } else if (marking === 'loop') {
                    // 对于表格，显示"循环数据行"
                    if (el.type === 'table') {
                        statusLabel = '循环数据行';
                    } else if (isFirstInGroup && isInGroupLoop) {
                        statusLabel = '分组循环';
                    } else {
                        statusLabel = '循环';
                    }
                    statusIcon = 'fa-repeat';
                    statusClass = 'btn-loop';
                } else if (marking === 'static') {
                    statusLabel = '静态';
                    statusIcon = 'fa-lock';
                    statusClass = 'btn-static';
                }

                const toggleButton = `
                    <span class="node-actions">
                        <button class="node-action-btn ${statusClass} ${marking || isGroupMember ? 'active' : ''}"
                                data-action="${isGroupMember ? 'group-info' : 'toggle'}" data-index="${idx}"
                                title="${isGroupMember ? '此元素属于分组循环，点击分组首元素可修改' : '点击切换：静态→参数→循环→静态'}">
                            <i class="fas ${statusIcon}"></i> ${statusLabel}
                        </button>
                        ${marking && !isGroupMember ? `<button class="node-action-btn btn-clear"
                                data-action="clear" data-index="${idx}" title="清除标记">
                            <i class="fas fa-times"></i>
                        </button>` : ''}
                        <button class="node-action-btn ${isIgnored ? 'btn-ignored active' : 'btn-ignore'}"
                                data-action="ignore" data-index="${idx}"
                                title="${isIgnored ? '取消忽略' : '标记为忽略/重复'}">
                            <i class="fas ${isIgnored ? 'fa-ban' : 'fa-eye-slash'}"></i>
                        </button>
                    </span>`;

                if (el.type === 'table' && showTables) {
                    // 表格节点 - 默认展开显示内容
                    html += `<div class="structure-node table-node ${preserveClass} ${markedClass} ${defaultMark} ${selectedClass} ${groupClass} ${groupLoopClass} ${ignoredClass}" data-type="table" data-order-index="${el.orderIndex}">
                        ${checkboxHtml}
                        ${groupInfo}
                        <span class="node-toggle">▼</span>
                        <span class="node-tag">&lt;w:tbl&gt;</span>
                        <span class="node-attr">rows="${el.rows}"</span>
                        ${el.hasPreserve ? '<span class="node-preserve">preserve</span>' : ''}
                        ${toggleButton}
                    </div>`;

                    // 表格子节点 - 默认展开
                    html += '<div class="node-children expanded">';

                    // 标题行（不可循环）- 如果表格被标记为循环，标题行显示为静态
                    if (el.headerRow) {
                        const headerStaticClass = marking === 'loop' ? 'marked-static' : '';
                        html += `<div class="structure-node table-header-node ${headerStaticClass}" data-type="table-header" data-table="${el.index}">
                            <span class="node-label">📋 标题行</span>
                            ${marking === 'loop' ? '<span class="node-attr" style="color:#856404;background:#fff3cd;padding:2px 6px;border-radius:3px;">静态保留</span>' : ''}
                            <span class="node-text">${escapeHtml(el.headerRow)}</span>
                        </div>`;
                    }

                    // 数据行（可循环）- 如果表格被标记为循环，数据行显示循环标记
                    if (el.dataRowCount > 0 || (el.dataRows && el.dataRows.length > 0)) {
                        const rowCount = el.dataRowCount || (el.dataRows ? el.dataRows.length : 0);
                        const dataLoopClass = marking === 'loop' ? 'marked-loop' : '';
                        html += `<div class="structure-node table-data-node ${dataLoopClass}" data-type="table-data" data-table="${el.index}">
                            <span class="node-label">🔄 数据行</span>
                            ${marking === 'loop' ? '<span class="node-attr" style="color:#155724;background:#d4edda;padding:2px 6px;border-radius:3px;">将循环</span>' : ''}
                            <span class="node-attr">${rowCount}行可循环</span>
                        </div>`;

                        // 显示数据行内容
                        html += '<div class="node-children">';
                        if (el.dataRows && el.dataRows.length > 0) {
                            el.dataRows.slice(0, 3).forEach((row, rowIdx) => {
                                html += `<div class="structure-node table-row-node" data-type="table-row">
                                    <span class="node-text">${escapeHtml(row.substring(0, 60))}${row.length > 60 ? '...' : ''}</span>
                                </div>`;
                            });
                        }
                        if (rowCount > 3) {
                            html += `<div class="structure-node table-row-node">
                                <span class="node-text">... 共${rowCount}行数据</span>
                            </div>`;
                        }
                        html += '</div>';
                    }

                    html += '</div>'; // node-children
                } else if (el.type === 'paragraph' && showParagraphs) {
                    const text = el.text.substring(0, 80) + (el.text.length > 80 ? '...' : '');
                    html += `<div class="structure-node paragraph-node ${preserveClass} ${markedClass} ${defaultMark} ${selectedClass} ${groupClass} ${groupLoopClass} ${ignoredClass}" data-type="paragraph" data-order-index="${el.orderIndex}">
                        ${checkboxHtml}
                        ${groupInfo}
                        <span class="node-tag">&lt;w:p&gt;</span>
                        ${el.hasPreserve ? '<span class="node-preserve">preserve</span>' : ''}
                        <span class="node-text">${escapeHtml(text)}</span>
                        ${toggleButton}
                    </div>`;
                } else if (el.type === 'image') {
                    // 图片节点
                    const sizeInfo = el.attributes?.widthPx ? `${el.attributes.widthPx}×${el.attributes.heightPx}px` : '';
                    html += `<div class="structure-node image-node ${preserveClass} ${markedClass} ${defaultMark} ${selectedClass} ${groupClass} ${groupLoopClass} ${ignoredClass}" data-type="image" data-order-index="${el.orderIndex}" data-image-id="${el.imageId || ''}">
                        ${checkboxHtml}
                        ${groupInfo}
                        <span class="node-label">🖼️ 图片</span>
                        ${el.imageId ? `<span class="node-attr">id="${el.imageId}"</span>` : ''}
                        ${sizeInfo ? `<span class="node-attr">${sizeInfo}</span>` : ''}
                        <span class="node-text">${escapeHtml(el.altText || el.text || '')}</span>
                        ${toggleButton}
                    </div>`;
                } else if (el.type === 'list') {
                    // 列表节点
                    const text = el.text.substring(0, 80) + (el.text.length > 80 ? '...' : '');
                    html += `<div class="structure-node list-node ${preserveClass} ${markedClass} ${defaultMark} ${selectedClass} ${groupClass} ${groupLoopClass} ${ignoredClass}" data-type="list" data-order-index="${el.orderIndex}">
                        ${checkboxHtml}
                        ${groupInfo}
                        <span class="node-label">📝 列表项</span>
                        ${el.hasPreserve ? '<span class="node-preserve">preserve</span>' : ''}
                        <span class="node-text">${escapeHtml(text)}</span>
                        ${toggleButton}
                    </div>`;
                } else if (el.type === 'heading1' || el.type === 'heading2' || el.type === 'heading3') {
                    // 标题节点
                    const level = el.type.replace('heading', '');
                    const text = el.text.substring(0, 80) + (el.text.length > 80 ? '...' : '');
                    html += `<div class="structure-node heading-node ${preserveClass} ${markedClass} ${defaultMark} ${selectedClass} ${groupClass} ${groupLoopClass} ${ignoredClass}" data-type="${el.type}" data-order-index="${el.orderIndex}">
                        ${checkboxHtml}
                        ${groupInfo}
                        <span class="node-label">📌 H${level}</span>
                        <span class="node-text">${escapeHtml(text)}</span>
                        ${toggleButton}
                    </div>`;
                } else if (el.type === 'title') {
                    // 标题节点
                    const text = el.text.substring(0, 80) + (el.text.length > 80 ? '...' : '');
                    html += `<div class="structure-node title-node ${preserveClass} ${markedClass} ${defaultMark} ${selectedClass} ${groupClass} ${groupLoopClass} ${ignoredClass}" data-type="title" data-order-index="${el.orderIndex}">
                        ${checkboxHtml}
                        ${groupInfo}
                        <span class="node-label">🏷️ 标题</span>
                        <span class="node-text">${escapeHtml(text)}</span>
                        ${toggleButton}
                    </div>`;
                }
            });
        }

        // Preserve elements summary
        if (showPreserve && state.xmlStructure.preserveElements.length > 0) {
            html += `<div class="structure-node section-node" data-type="section">
                <span class="node-tag">Preserve Elements (${state.xmlStructure.preserveElements.length})</span>
            </div>`;
        }

        html += '</div></div></div>';

        // 显示标记统计
        if (markingCount > 0 || ignoredCount > 0) {
            html += `<div class="marking-summary">
                <span>已标记 ${markingCount} 个元素${ignoredCount > 0 ? `, 已忽略 ${ignoredCount} 个` : ''}</span>
                <button id="save-markings-btn" class="btn btn-primary btn-sm">
                    <i class="fas fa-save"></i> 保存配置
                </button>
            </div>`;
        }

        elements.structureTree.innerHTML = html;

        // Add click handlers for action buttons
        elements.structureTree.querySelectorAll('.node-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const index = parseInt(btn.dataset.index);

                if (!state.manualMarkings) state.manualMarkings = {};

                if (action === 'toggle') {
                    // 切换状态：未设置 → 参数 → 循环 → 静态 → 未设置
                    const current = state.manualMarkings[index];
                    if (!current || current === 'static') {
                        state.manualMarkings[index] = 'param';
                    } else if (current === 'param') {
                        state.manualMarkings[index] = 'loop';
                    } else if (current === 'loop') {
                        state.manualMarkings[index] = 'static';
                    }
                } else if (action === 'clear') {
                    delete state.manualMarkings[index];
                } else if (action === 'ignore') {
                    // 切换忽略状态
                    if (!state.ignoredElements) state.ignoredElements = {};
                    if (state.ignoredElements[index]) {
                        delete state.ignoredElements[index];
                    } else {
                        state.ignoredElements[index] = true;
                    }
                }

                // Re-render structure tree
                renderStructureTree();
            });
        });

        // Add save button handler
        const saveBtn = document.getElementById('save-markings-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveManualMarkings);
        }

        // Add checkbox handlers for multi-selection
        elements.structureTree.querySelectorAll('.node-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                const index = parseInt(cb.dataset.index);
                if (cb.checked) {
                    if (!state.selectedElementIndices.includes(index)) {
                        state.selectedElementIndices.push(index);
                    }
                } else {
                    state.selectedElementIndices = state.selectedElementIndices.filter(i => i !== index);
                }
                // Re-render to show selection
                renderStructureTree();
            });
            // Prevent click propagation to node
            cb.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });

        // Add merge selected button handler
        const mergeBtn = document.getElementById('merge-selected-btn');
        if (mergeBtn) {
            mergeBtn.addEventListener('click', () => {
                mergeSelectedElements();
            });
        }

        // Add clear selection button handler
        const clearSelectionBtn = document.getElementById('clear-selection-btn');
        if (clearSelectionBtn) {
            clearSelectionBtn.addEventListener('click', () => {
                state.selectedElementIndices = [];
                renderStructureTree();
            });
        }

        // Add remove group button handlers
        elements.structureTree.querySelectorAll('.btn-remove-group').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const groupId = btn.dataset.group;
                if (state.elementGroups[groupId]) {
                    delete state.elementGroups[groupId];
                    // 同时清除忽略状态
                    if (state.ignoredGroups[groupId]) {
                        delete state.ignoredGroups[groupId];
                    }
                    showToast('分组已解散', 'info');
                    renderStructureTree();
                }
            });
        });

        // Add toggle ignore button handlers
        elements.structureTree.querySelectorAll('.btn-toggle-ignore').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const groupId = btn.dataset.group;
                if (!state.ignoredGroups) state.ignoredGroups = {};

                if (state.ignoredGroups[groupId]) {
                    delete state.ignoredGroups[groupId];
                    showToast('分组已恢复', 'info');
                } else {
                    state.ignoredGroups[groupId] = true;
                    showToast('分组已标记为忽略(重复)', 'warning');
                }
                renderStructureTree();
            });
        });

        // Add click handlers for structure nodes
        elements.structureTree.querySelectorAll('.structure-node[data-order-index]').forEach(node => {
            node.addEventListener('click', () => {
                // Remove previous selection
                elements.structureTree.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                node.classList.add('selected');

                const orderIndex = parseInt(node.dataset.orderIndex);

                // 获取xmlStructure中对应元素的文本
                const xmlElement = state.xmlStructure?.orderedElements?.[orderIndex];
                if (xmlElement && xmlElement.text) {
                    // 通过文本内容匹配documentElements中的元素
                    const element = state.documentElements.find(el => {
                        // 对于表格，匹配标题行
                        if (xmlElement.type === 'table' && el.type === 'table') {
                            return el.headerRow && xmlElement.headerRow &&
                                   el.headerRow.includes(xmlElement.headerRow.substring(0, 30));
                        }
                        // 对于段落，匹配文本内容
                        return el.text && xmlElement.text &&
                               (el.text === xmlElement.text ||
                                el.text.includes(xmlElement.text.substring(0, 50)) ||
                                xmlElement.text.includes(el.text.substring(0, 50)));
                    });

                    if (element) {
                        selectDocumentElement(element);
                    } else {
                        showToast(`Selected ${xmlElement.type}: "${xmlElement.text.substring(0, 30)}..."`, 'info');
                    }
                }
            });
        });
    }

    // Select element by XML index
    function selectElementByXmlIndex(type, xmlIndex) {
        // Map XML index to document element
        const element = state.documentElements.find(el => {
            return el.xpath && el.xpath.includes(`[${xmlIndex}]`);
        });

        if (element) {
            selectDocumentElement(element);
        } else {
            // Use the first element if no exact match
            showToast(`Selected ${type} at position ${xmlIndex}`, 'info');
        }
    }

    /**
     * 保存手动标记到服务端
     */
    async function saveManualMarkings() {
        if (!state.selectedTemplate) {
            showToast('请先选择模板', 'warning');
            return;
        }

        const markings = state.manualMarkings || {};
        const ignored = state.ignoredElements || {};
        const markingCount = Object.keys(markings).length;
        const ignoredCount = Object.keys(ignored).length;

        if (markingCount === 0 && ignoredCount === 0) {
            showToast('没有需要保存的标记', 'warning');
            return;
        }

        try {
            // 保存到服务端
            await apiRequest(`/templates/${state.selectedTemplate.id}/markings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateId: state.selectedTemplate.id,
                    markings: Object.entries(markings).map(([index, type]) => ({
                        index: parseInt(index),
                        type: type,
                        path: '',
                        text: ''
                    })),
                    ignoredElements: Object.keys(ignored).map(idx => parseInt(idx))
                })
            });

            showToast(`已保存 ${markingCount} 个标记配置，${ignoredCount} 个忽略元素`, 'success');
        } catch (error) {
            console.error('Save markings failed:', error);
            showToast('保存失败: ' + error.message, 'error');
        }
    }

    /**
     * 合并选中的元素为一个循环项
     */
    function mergeSelectedElements() {
        if (state.selectedElementIndices.length < 2) {
            showToast('请至少选择2个元素进行合并', 'warning');
            return;
        }

        // 排序索引确保顺序正确
        const indices = [...state.selectedElementIndices].sort((a, b) => a - b);

        // 创建新分组
        const groupId = 'group_' + Date.now();
        if (!state.elementGroups) state.elementGroups = {};
        state.elementGroups[groupId] = indices;

        // 清空选中状态
        state.selectedElementIndices = [];

        // 将分组的第一个元素标记为循环
        if (!state.manualMarkings) state.manualMarkings = {};
        state.manualMarkings[indices[0]] = 'loop';

        showToast(`已将 ${indices.length} 个元素合并为循环项`, 'success');
        renderStructureTree();
    }

    /**
     * 加载已保存的标记
     */
    async function loadSavedMarkings() {
        if (!state.selectedTemplate) return;

        try {
            const result = await apiRequest(`/templates/${state.selectedTemplate.id}/markings`);

            if (result.markings && result.markings.length > 0) {
                state.manualMarkings = {};
                result.markings.forEach(m => {
                    if (m.index !== undefined) {
                        state.manualMarkings[m.index] = m.type;
                    }
                });

                // 如果当前在结构视图且xmlStructure已解析，重新渲染
                if (state.currentSourceView === 'structure' && state.xmlStructure) {
                    renderStructureTree();
                }
            }
        } catch (error) {
            console.error('Load markings failed:', error);
        }
    }

    /**
     * Handle AI configuration based on manual markings
     * 根据手动标记调用AI配置参数名称、类型等信息
     */
    async function handleAIConfig() {
        if (!state.selectedTemplate) {
            showToast('请先选择模板', 'warning');
            return;
        }

        // 检查是否有手动标记
        const markings = state.manualMarkings || {};
        const ignoredElements = state.ignoredElements || {};
        const markingCount = Object.keys(markings).length;
        const ignoredCount = Object.keys(ignoredElements).length;

        if (markingCount === 0 && ignoredCount === 0) {
            showToast('请先在结构视图中标记元素（参数/循环/静态）或标记忽略', 'warning');
            return;
        }

        // 构建标记摘要
        let markingSummary = Object.entries(markings).map(([idx, type]) => {
            const el = state.xmlStructure?.orderedElements?.[idx];
            if (!el) return null;

            let content = '';
            if (el.type === 'table') {
                content = `表格: ${el.headerRow || ''}, rows=${el.rows}`;
            } else {
                content = el.text?.substring(0, 50) || '';
            }

            return `- 索引${idx}: [${type}] ${content}`;
        }).filter(Boolean).join('\n');

        // 添加忽略元素信息
        if (ignoredCount > 0) {
            markingSummary += '\n\n忽略的元素（重复/跳过）：\n';
            Object.keys(ignoredElements).forEach(idx => {
                const el = state.xmlStructure?.orderedElements?.[idx];
                if (!el) return;
                let content = el.type === 'image' ? `图片(${el.imageId || ''})` : el.text?.substring(0, 30) || el.type;
                markingSummary += `- 索引${idx}: "${content}" [已忽略]\n`;
            });
            markingSummary += `\n注意：有 ${ignoredCount} 个元素被标记为忽略，生成模板时将跳过这些元素。`;
        }

        // 添加分组信息
        const groups = state.elementGroups || {};
        const ignoredGroups = state.ignoredGroups || {};
        if (Object.keys(groups).length > 0) {
            markingSummary += '\n\n元素分组信息：\n';
            Object.entries(groups).forEach(([groupId, indices]) => {
                if (indices && indices.length > 0) {
                    const isIgnored = ignoredGroups[groupId];
                    const groupContents = indices.map(idx => {
                        const el = state.xmlStructure?.orderedElements?.[idx];
                        if (!el) return '';
                        if (el.type === 'image') return `图片(${el.imageId || ''})`;
                        return el.text?.substring(0, 30) || el.type;
                    }).join(' + ');
                    markingSummary += `- 分组${groupId.substring(0, 4)}: 索引[${indices.join(',')}] 包含 "${groupContents}"${isIgnored ? ' [已忽略/重复]' : ''}\n`;
                }
            });
            // 添加忽略分组说明
            const ignoredCount = Object.keys(ignoredGroups).length;
            if (ignoredCount > 0) {
                markingSummary += `\n注意：有 ${ignoredCount} 个分组被标记为重复/忽略，生成模板时将跳过这些分组。`;
            }
        }

        // 调用AI分析API，传入手动标记
        try {
            elements.aiConfigBtn.disabled = true;
            elements.aiConfigBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI配置中...';

            const response = await apiRequest(`/templates/${state.selectedTemplate.id}/ai-identify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context: '根据用户手动标记配置参数',
                    manualMarkings: markings,
                    markingSummary: markingSummary
                })
            });

            // 显示AI配置结果
            displayAIConfigResult(response);

            // 自动保存AI生成的模板配置
            await saveTemplateConfig(response.templateConfig);

            showToast('AI配置完成并已自动保存', 'success');
        } catch (error) {
            console.error('AI config failed:', error);
            showToast('AI配置失败: ' + error.message, 'error');
        } finally {
            elements.aiConfigBtn.disabled = false;
            elements.aiConfigBtn.innerHTML = '<i class="fas fa-magic"></i> AI 配置参数';
        }
    }

    /**
     * Save AI-generated template configuration
     * 保存AI生成的模板配置
     */
    async function saveTemplateConfig(templateConfig) {
        if (!state.selectedTemplate || !templateConfig) return;

        try {
            await apiRequest(`/templates/${state.selectedTemplate.id}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateId: state.selectedTemplate.id,
                    templateConfig: templateConfig
                })
            });
            console.log('Template config saved:', templateConfig);
        } catch (error) {
            console.error('Failed to save template config:', error);
            showToast('保存模板配置失败', 'warning');
        }
    }

    /**
     * Load saved template configuration
     * 加载已保存的模板配置
     */
    async function loadSavedTemplateConfig() {
        if (!state.selectedTemplate) return;

        try {
            const result = await apiRequest(`/templates/${state.selectedTemplate.id}/config`);

            if (result.templateConfig) {
                state.templateConfig = result.templateConfig;
                // 如果有保存的配置，显示它
                if (state.currentSourceView === 'structure') {
                    displayAIConfigResult({ templateConfig: result.templateConfig });
                }
                console.log('Loaded saved template config:', result.templateConfig);
            }
        } catch (error) {
            console.error('Load template config failed:', error);
        }
    }

    /**
     * Display AI configuration result
     * 显示AI配置结果
     */
    function displayAIConfigResult(response) {
        const config = response.templateConfig || {};

        let html = '<div class="ai-config-result">';

        // 显示模版类型
        if (config.templateType) {
            html += `<div class="config-section">
                <h4><i class="fas fa-file-alt"></i> 模版类型: ${config.templateType}</h4>
            </div>`;
        }

        // 显示静态元素
        if (config.staticElements && config.staticElements.length > 0) {
            html += `<div class="config-section">
                <h4><i class="fas fa-lock"></i> 静态元素 (${config.staticElements.length})</h4>
                <ul>`;
            config.staticElements.forEach(el => {
                html += `<li><code>${el.content || ''}</code> - ${el.reason || ''}</li>`;
            });
            html += '</ul></div>';
        }

        // 显示循环配置
        if (config.tableLoops && config.tableLoops.length > 0) {
            html += `<div class="config-section">
                <h4><i class="fas fa-repeat"></i> 循环表格 (${config.tableLoops.length})</h4>
                <ul>`;
            config.tableLoops.forEach(loop => {
                html += `<li>
                    <code>${loop.arrayPath}</code> - ${loop.reason}
                    <br><small>列映射: ${loop.columnMappings?.map(c => c.headerName + '→' + c.variablePath).join(', ')}</small>
                </li>`;
            });
            html += '</ul></div>';
        }

        // 显示组合变量
        if (config.combinedVariables && config.combinedVariables.length > 0) {
            html += `<div class="config-section">
                <h4><i class="fas fa-images"></i> 组合变量 (${config.combinedVariables.length})</h4>
                <ul>`;
            config.combinedVariables.forEach(cv => {
                html += `<li>
                    <code>${cv.imagePath}</code> - Step ${cv.stepNumber}
                    <br><small>${cv.reason}</small>
                </li>`;
            });
            html += '</ul></div>';
        }

        // 显示变量映射
        if (config.variableMappings && config.variableMappings.length > 0) {
            html += `<div class="config-section">
                <h4><i class="fas fa-code"></i> 变量映射 (${config.variableMappings.length})</h4>
                <ul>`;
            config.variableMappings.forEach(vm => {
                html += `<li>
                    <code>${vm.path}</code> (${vm.type})
                    <br><small>${vm.reason}</small>
                </li>`;
            });
            html += '</ul></div>';
        }

        html += '</div>';

        // 显示结果
        if (elements.aiGenerateResultSection && elements.aiGenerateResult) {
            elements.aiGenerateResultSection.style.display = 'block';
            elements.aiGenerateResult.innerHTML = html;
        }
    }

    function initResizeHandle() {
        const handle = document.querySelector('.resize-handle');
        const panelRight = document.querySelector('.panel-right');

        if (!handle || !panelRight) return;

        let isResizing = false;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const containerWidth = document.querySelector('.split-panel-container')?.offsetWidth || 0;
            const newWidth = containerWidth - e.clientX + 260; // 260 is sidebar width

            if (newWidth >= 300 && newWidth <= 500) {
                panelRight.style.width = `${newWidth}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });
    }

    // Initialize
    function init() {
        initElements();
        initEvents();
        loadTemplates();
        loadFormatters();
    }

    // Start app when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();