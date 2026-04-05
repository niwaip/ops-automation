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
        manualMarkings: [],
        currentZoom: 1,
        documentElements: [],
        sourceXml: '',
        currentTab: 'preview',
        currentSourceView: 'structure',  // 默认显示结构化视图
        xmlStructure: null
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
        elements.aiIdentifyBtn = document.getElementById('ai-identify-btn');
        elements.aiSuggestionsList = document.getElementById('ai-suggestions-list');
        elements.selectionSection = document.getElementById('selection-section');
        elements.selectedTextDisplay = document.getElementById('selected-text-display');
        elements.variablePathInput = document.getElementById('variable-path-input');
        elements.formattersInput = document.getElementById('formatters-input');
        elements.applyMarking = document.getElementById('apply-marking');
        elements.clearSelection = document.getElementById('clear-selection');
        elements.varsCount = document.getElementById('vars-count');
        elements.suggestionsCount = document.getElementById('suggestions-count');
        elements.documentElementsList = document.getElementById('document-elements-list');
        elements.elementsCount = document.getElementById('elements-count');
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
        state.currentTab = 'preview'; // Reset to preview tab
        state.currentSourceView = 'structure'; // 默认结构化视图
        renderTemplateList();

        elements.noTemplate.style.display = 'none';
        elements.templateEditor.style.display = 'flex';

        // Reset tab state
        elements.tabPreview.classList.add('active');
        elements.tabSource.classList.remove('active');
        elements.previewTabContent.classList.add('active');
        elements.sourceTabContent.classList.remove('active');

        // Reset source view state - 默认显示结构化视图
        elements.viewRaw.classList.remove('active');
        elements.viewStructure.classList.add('active');
        elements.rawView.classList.remove('active');
        elements.structureView.classList.add('active');

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

        // Load document structure elements
        loadDocumentElements(template);
    }

    async function loadDocumentElements(template) {
        if (template.format !== 'docx') {
            elements.documentElementsList.innerHTML = '<span class="empty-hint">Element selection only available for DOCX</span>';
            elements.elementsCount.textContent = '0';
            return;
        }

        try {
            const result = await apiRequest(`/templates/${template.id}/structure`);
            state.documentElements = result.elements || [];

            elements.elementsCount.textContent = state.documentElements.length;

            if (state.documentElements.length === 0) {
                elements.documentElementsList.innerHTML = '<span class="empty-hint">No elements found</span>';
                return;
            }

            elements.documentElementsList.innerHTML = state.documentElements.map((el, idx) => {
                // 表格特殊显示
                if (el.type === 'table') {
                    return `
                        <div class="element-item element-type-table" data-index="${idx}">
                            <div class="element-header">
                                <span class="element-type-icon">
                                    <i class="fas fa-table"></i>
                                </span>
                                <span class="element-type-label">Table</span>
                                <span class="element-badge">${el.attributes?.rows || '?'}行</span>
                            </div>
                            ${el.headerRow ? `
                                <div class="element-table-header">
                                    <span class="element-table-label">📋 标题行:</span>
                                    <code>${escapeHtml(el.headerRow)}</code>
                                </div>
                            ` : ''}
                            ${el.dataRows && el.dataRows.length > 0 ? `
                                <div class="element-table-data">
                                    <span class="element-table-label">🔄 数据行: ${el.dataRows.length}行可循环</span>
                                </div>
                            ` : ''}
                            <div class="element-actions">
                                <button class="btn btn-primary btn-sm btn-select-element" data-index="${idx}">
                                    <i class="fas fa-check"></i> Select
                                </button>
                            </div>
                        </div>
                    `;
                }

                // 普通元素
                return `
                    <div class="element-item element-type-${el.type}" data-index="${idx}">
                        <div class="element-header">
                            <span class="element-type-icon">
                                <i class="fas ${getElementIcon(el.type)}"></i>
                            </span>
                            <span class="element-type-label">${getElementLabel(el.type)}</span>
                        </div>
                        <div class="element-content">
                            <code>${escapeHtml(el.text.substring(0, 80))}${el.text.length > 80 ? '...' : ''}</code>
                        </div>
                        <div class="element-actions">
                            <button class="btn btn-primary btn-sm btn-select-element" data-index="${idx}">
                                <i class="fas fa-check"></i> Select
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            // Bind click events for element selection
            document.querySelectorAll('.btn-select-element').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.index);
                    selectDocumentElement(state.documentElements[idx]);
                });
            });

            // Bind click events for element items
            document.querySelectorAll('.element-item').forEach(item => {
                item.addEventListener('click', () => {
                    const idx = parseInt(item.dataset.index);
                    selectDocumentElement(state.documentElements[idx]);
                });
            });

        } catch (error) {
            console.error('Failed to load document elements:', error);
            elements.documentElementsList.innerHTML = '<span class="empty-hint">Failed to load elements</span>';
        }
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

            // Find matching text in PDF text layer
            const textLayer = iframeDoc.querySelector('.textLayer');
            if (textLayer) {
                const spans = textLayer.querySelectorAll('span');
                let foundFirst = false;

                spans.forEach(span => {
                    if (span.textContent && element.text.includes(span.textContent.trim())) {
                        span.classList.add('element-highlight');
                        if (!foundFirst) {
                            span.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            foundFirst = true;
                        }
                    }
                });
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
                }
                .textLayer span {
                    cursor: pointer !important;
                }
                .textLayer span:hover {
                    background-color: rgba(0, 123, 255, 0.15) !important;
                }
            `;
            iframeDoc.head.appendChild(style);

            // 使用事件委托，在document级别监听点击，这样所有页面的文本都可以响应
            iframeDoc.addEventListener('click', (e) => {
                const clickedSpan = e.target.closest('.textLayer span');
                if (!clickedSpan) return;

                const clickedText = clickedSpan.textContent.trim();
                if (!clickedText) return;

                // Find matching element in document elements with priority:
                // 1. Exact match (element.text === clickedText)
                // 2. Element starts with clickedText
                // 3. Element contains clickedText
                let matchingElement = null;

                // First try exact match
                matchingElement = state.documentElements.find(el => {
                    return el.text && el.text === clickedText;
                });

                // If no exact match, try element that starts with clicked text
                if (!matchingElement) {
                    matchingElement = state.documentElements.find(el => {
                        return el.text && el.text.startsWith(clickedText);
                    });
                }

                // If no match, try element that contains the clicked text
                if (!matchingElement) {
                    matchingElement = state.documentElements.find(el => {
                        return el.text && el.text.includes(clickedText);
                    });
                }

                // If still no match, try partial match (clicked text contains element text)
                if (!matchingElement) {
                    matchingElement = state.documentElements.find(el => {
                        return el.text && clickedText.includes(el.text.substring(0, 20)) && el.text.length > 10;
                    });
                }

                if (matchingElement) {
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
                    markings: state.manualMarkings
                })
            });

            showToast('Markings saved successfully', 'success');
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

        // AI Identify button
        elements.aiIdentifyBtn.addEventListener('click', aiIdentifyVariables);

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

        // Load source if switching to source tab
        if (tabName === 'source' && !state.sourceXml && state.selectedTemplate) {
            loadSourceXml();
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

            // 检查是否是表格元素 (w:tbl)
            if (tagName.includes('tbl')) {
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
                    dataRows: apiTable.dataRows || []
                });
            }
            // 检查是否是段落元素 (w:p) - 不在表格单元格内
            else if (tagName.includes('p') && !tagName.includes('pPr')) {
                const text = extractElementText(child);
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
            else if (tagName.includes('sectPr') || tagName.includes('pPr') || tagName.includes('rPr')) {
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
        let tableIndex = 0;

        // 遍历body下的所有直接子元素，按文档顺序收集
        const body = xmlDoc.getElementsByTagNameNS('*', 'body')[0];
        if (body) {
            collectElementsInOrder(body, state.xmlStructure, apiTables);
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

        // 按文档顺序渲染所有元素
        if (state.xmlStructure.orderedElements && state.xmlStructure.orderedElements.length > 0) {
            state.xmlStructure.orderedElements.forEach((el, idx) => {
                const preserveClass = el.hasPreserve && showPreserve ? 'preserve-node' : '';

                if (el.type === 'table' && showTables) {
                    // 表格节点 - 默认展开显示内容
                    html += `<div class="structure-node table-node ${preserveClass}" data-type="table" data-index="${el.index}">
                        <span class="node-toggle">▼</span>
                        <span class="node-tag">&lt;w:tbl&gt;</span>
                        <span class="node-attr">rows="${el.rows}"</span>
                        ${el.hasPreserve ? '<span class="node-preserve">preserve</span>' : ''}
                    </div>`;

                    // 表格子节点 - 默认展开
                    html += '<div class="node-children expanded">';

                    // 标题行（不可循环）
                    if (el.headerRow) {
                        html += `<div class="structure-node table-header-node" data-type="table-header" data-table="${el.index}">
                            <span class="node-label">📋 标题行</span>
                            <span class="node-text">${escapeHtml(el.headerRow)}</span>
                        </div>`;
                    }

                    // 数据行（可循环）
                    if (el.dataRows && el.dataRows.length > 0) {
                        html += `<div class="structure-node table-data-node" data-type="table-data" data-table="${el.index}">
                            <span class="node-label">🔄 数据行</span>
                            <span class="node-attr">${el.dataRows.length}行可循环</span>
                        </div>`;

                        // 显示数据行内容
                        html += '<div class="node-children">';
                        el.dataRows.slice(0, 3).forEach((row, rowIdx) => {
                            html += `<div class="structure-node table-row-node" data-type="table-row">
                                <span class="node-text">${escapeHtml(row.substring(0, 60))}${row.length > 60 ? '...' : ''}</span>
                            </div>`;
                        });
                        if (el.dataRows.length > 3) {
                            html += `<div class="structure-node table-row-node">
                                <span class="node-text">... 共${el.dataRows.length}行数据</span>
                            </div>`;
                        }
                        html += '</div>';
                    }

                    html += '</div>'; // node-children
                } else if (el.type === 'paragraph' && showParagraphs) {
                    const text = el.text.substring(0, 80) + (el.text.length > 80 ? '...' : '');
                    html += `<div class="structure-node paragraph-node ${preserveClass}" data-type="paragraph" data-index="${el.index}">
                        <span class="node-tag">&lt;w:p&gt;</span>
                        ${el.hasPreserve ? '<span class="node-preserve">preserve</span>' : ''}
                        <span class="node-text">${escapeHtml(text)}</span>
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

        elements.structureTree.innerHTML = html;

        // Add click handlers for structure nodes
        elements.structureTree.querySelectorAll('.structure-node[data-index]').forEach(node => {
            node.addEventListener('click', () => {
                // Remove previous selection
                elements.structureTree.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                node.classList.add('selected');

                const type = node.dataset.type;
                const index = parseInt(node.dataset.index);

                // Select corresponding element in document elements
                if (type === 'paragraph' || type === 'table') {
                    selectElementByXmlIndex(type, index);
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