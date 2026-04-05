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
        manualMarkings: []  // 存储手动标记
    };

    // DOM Elements
    const elements = {
        templateList: document.getElementById('template-list'),
        formatterList: document.getElementById('formatter-list'),
        uploadArea: document.getElementById('upload-area'),
        fileInput: document.getElementById('file-input'),
        noTemplate: document.getElementById('no-template'),
        templateEditor: document.getElementById('template-editor'),
        templateIcon: document.getElementById('template-icon'),
        templateName: document.getElementById('template-name'),
        templateFormat: document.getElementById('template-format'),
        templateSize: document.getElementById('template-size'),
        variablesList: document.getElementById('variables-list'),
        loopsList: document.getElementById('loops-list'),
        testData: document.getElementById('test-data'),
        validateBtn: document.getElementById('validate-btn'),
        renderBtn: document.getElementById('render-btn'),
        saveBtn: document.getElementById('save-btn'),
        renderModal: document.getElementById('render-modal'),
        outputFormat: document.getElementById('output-format'),
        confirmRender: document.getElementById('confirm-render'),
        previewEmpty: document.getElementById('preview-empty'),
        previewResult: document.getElementById('preview-result'),
        previewFilename: document.getElementById('preview-filename'),
        downloadLink: document.getElementById('download-link'),
        formatterGuide: document.getElementById('formatter-guide'),
        toastContainer: document.getElementById('toast-container'),
        sourceEmpty: document.getElementById('source-empty'),
        sourceContent: document.getElementById('source-content'),
        sourceFilename: document.getElementById('source-filename'),
        sourceCode: document.getElementById('source-code'),
        copySource: document.getElementById('copy-source'),
        // Document Preview elements
        docpreviewEmpty: document.getElementById('docpreview-empty'),
        docpreviewContent: document.getElementById('docpreview-content'),
        previewIframe: document.getElementById('preview-iframe'),
        previewFormatBadge: document.getElementById('preview-format-badge'),
        previewSizeInfo: document.getElementById('preview-size-info'),
        zoomIn: document.getElementById('zoom-in'),
        zoomOut: document.getElementById('zoom-out'),
        // AI Suggestion elements
        aiIdentifyBtn: document.getElementById('ai-identify-btn'),
        aiSuggestionsList: document.getElementById('ai-suggestions-list'),
        // Manual marking elements
        markingPopup: document.getElementById('marking-popup'),
        selectedText: document.getElementById('selected-text'),
        variablePathInput: document.getElementById('variable-path-input'),
        cancelMarking: document.getElementById('cancel-marking'),
        confirmMarking: document.getElementById('confirm-marking')
    };

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
                throw new Error(error.message || 'Request failed');
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    async function loadTemplates() {
        try {
            elements.templateList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
            const result = await apiRequest('/templates');
            state.templates = result.templates || [];
            renderTemplateList();
        } catch (error) {
            elements.templateList.innerHTML = '<div class="loading"><i class="fas fa-exclamation-circle"></i> Failed to load</div>';
        }
    }

    async function loadFormatters() {
        try {
            const result = await apiRequest('/formatters');
            state.formatters = result.formatters || [];
            renderFormatterList();
            renderFormatterGuide();
        } catch (error) {
            console.error('Failed to load formatters:', error);
        }
    }

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

            const template = await response.json();
            showToast(`Template "${template.fileName}" uploaded successfully`, 'success');
            await loadTemplates();
            selectTemplate(template);
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    async function deleteTemplate(id) {
        if (!confirm('Are you sure you want to delete this template?')) return;

        try {
            await apiRequest(`/templates/${id}/delete`, { method: 'POST' });
            showToast('Template deleted', 'success');
            await loadTemplates();
            if (state.selectedTemplate?.id === id) {
                state.selectedTemplate = null;
                showNoTemplate();
            }
        } catch (error) {
            showToast('Failed to delete template', 'error');
        }
    }

    async function validateData() {
        if (!state.selectedTemplate) return;

        let data = {};
        try {
            const text = elements.testData.value.trim();
            if (text) {
                data = JSON.parse(text);
            }
        } catch {
            showToast('Invalid JSON data', 'error');
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
                showToast('Data is valid', 'success');
            } else {
                showToast(`Missing variables: ${result.missing.join(', ')}`, 'warning');
            }
        } catch (error) {
            showToast('Validation failed', 'error');
        }
    }

    async function renderTemplate() {
        if (!state.selectedTemplate) return;

        let data = {};
        try {
            const text = elements.testData.value.trim();
            if (text) {
                data = JSON.parse(text);
            }
        } catch {
            showToast('Invalid JSON data', 'error');
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
            showPreviewResult(result);
            closeModal();
        } catch (error) {
            showToast('Render failed: ' + error.message, 'error');
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
                    <span class="badge">${t.format.toUpperCase()}</span>
                    <span>${t.variables.length} vars</span>
                    <span>${formatBytes(t.size)}</span>
                    <button class="btn btn-sm btn-danger delete-btn" data-id="${t.id}">
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
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteTemplate(btn.dataset.id);
            });
        });
    }

    function renderFormatterList() {
        const categories = {
            'String': ['upperCase', 'lowerCase', 'ucFirst', 'truncate'],
            'Number': ['formatNumber', 'round', 'add', 'currency'],
            'Date': ['formatD', 'addDays', 'date', 'time'],
            'Condition': ['show', 'hide', 'if', 'ifEmpty'],
            'Array': ['arrayLen', 'arrayJoin', 'sum', 'avg']
        };

        const html = Object.entries(categories).map(([cat, items]) => `
            <div style="margin-bottom: 8px;">
                <small style="color: #666;">${cat}</small>
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                    ${items.filter(f => state.formatters.includes(f)).map(f => `
                        <span class="formatter-tag" title="${f}">${f}</span>
                    `).join('')}
                </div>
            </div>
        `).join('');

        elements.formatterList.innerHTML = html;
    }

    function renderFormatterGuide() {
        const categories = {
            'String': state.formatters.filter(f => ['upperCase', 'lowerCase', 'ucFirst', 'ucWords', 'truncate', 'stripTags', 'escapeHtml'].includes(f)),
            'Number': state.formatters.filter(f => ['formatNumber', 'int', 'float', 'round', 'floor', 'ceil', 'abs', 'add', 'multiply', 'divide', 'currency'].includes(f)),
            'Date': state.formatters.filter(f => ['formatD', 'addDays', 'addMonths', 'date', 'time', 'datetime', 'year', 'month'].includes(f)),
            'Condition': state.formatters.filter(f => ['show', 'hide', 'if', 'ifEmpty', 'empty', 'notEmpty'].includes(f)),
            'Array': state.formatters.filter(f => ['arrayLen', 'arrayJoin', 'sum', 'avg', 'min', 'max'].includes(f)),
            'Transform': state.formatters.filter(f => ['toString', 'toNumber', 'toBoolean', 'concat', 'replace'].includes(f))
        };

        elements.formatterGuide.innerHTML = Object.entries(categories)
            .filter(([_, items]) => items.length > 0)
            .map(([cat, items]) => `
                <div class="formatter-group">
                    <h5>${cat}</h5>
                    <div class="formatter-group-items">
                        ${items.map(f => `<span class="formatter-tag">${f}</span>`).join('')}
                    </div>
                </div>
            `).join('');
    }

    function selectTemplate(template) {
        state.selectedTemplate = template;
        renderTemplateList();

        elements.noTemplate.style.display = 'none';
        elements.templateEditor.style.display = 'block';

        // Update header
        elements.templateIcon.className = `fas ${getFormatIcon(template.format)}`;
        elements.templateName.textContent = template.fileName;
        elements.templateFormat.textContent = template.format.toUpperCase();
        elements.templateSize.textContent = formatBytes(template.size);

        // Render variables
        elements.variablesList.innerHTML = template.variables.length > 0
            ? template.variables.map(v => `
                <div class="variable-item">
                    <code>{${v}}</code>
                </div>
            `).join('')
            : '<span style="color: #999;">No variables found</span>';

        // Render loops
        elements.loopsList.innerHTML = template.loops.length > 0
            ? template.loops.map(l => `
                <div class="loop-item">
                    <i class="fas fa-repeat"></i>
                    <code>${l.arrayPath}</code>
                </div>
            `).join('')
            : '<span style="color: #999;">No loops detected</span>';

        // Load source preview
        loadSourcePreview(template.id);
        // Load document preview
        loadDocumentPreview(template);
    }

    async function loadDocumentPreview(template) {
        try {
            const result = await apiRequest(`/templates/${template.id}/preview-html`);

            elements.docpreviewEmpty.style.display = 'none';
            elements.docpreviewContent.style.display = 'block';

            // Update format badge
            elements.previewFormatBadge.textContent = result.format.toUpperCase();
            elements.previewSizeInfo.textContent = formatBytes(template.size);

            // Load HTML into iframe
            const iframe = elements.previewIframe;
            iframe.srcdoc = result.html;

            // Reset zoom
            iframe.style.transform = 'scale(1)';

        } catch (error) {
            console.error('Failed to load document preview:', error);
            elements.docpreviewEmpty.style.display = 'block';
            elements.docpreviewContent.style.display = 'none';
        }
    }

    async function loadSourcePreview(templateId) {
        try {
            const result = await apiRequest(`/templates/${templateId}/preview-source`);

            elements.sourceEmpty.style.display = 'none';
            elements.sourceContent.style.display = 'block';

            // Set filename based on format
            const filenames = {
                docx: 'word/document.xml',
                xlsx: 'xl/worksheets/sheet1.xml',
                pptx: 'ppt/slides/slide1.xml',
                html: 'index.html'
            };
            elements.sourceFilename.textContent = filenames[result.format] || 'source';

            // Display content with syntax highlighting
            let displayContent = result.content;

            // Format XML for better readability (basic formatting)
            if (result.type === 'xml') {
                try {
                    // Basic XML formatting
                    displayContent = formatXml(result.content);
                } catch (e) {
                    // If formatting fails, show original
                }
            }

            elements.sourceCode.querySelector('code').textContent = displayContent;

            // Apply syntax highlighting if available
            if (typeof hljs !== 'undefined') {
                hljs.highlightElement(elements.sourceCode.querySelector('code'));
            }
        } catch (error) {
            console.error('Failed to load source:', error);
            elements.sourceEmpty.style.display = 'block';
            elements.sourceContent.style.display = 'none';
        }
    }

    function formatXml(xml) {
        // Basic XML formatter
        let formatted = '';
        let indent = '';
        const tab = '  ';

        xml.split(/>\s*</).forEach(node => {
            if (node.match(/^\/\w/)) {
                // Closing tag
                indent = indent.substring(tab.length);
            }

            formatted += indent + '<' + node + '>\n';

            if (node.match(/^<?\w[^>]*[^\/]$/) && !node.startsWith('?')) {
                // Opening tag (not self-closing)
                indent += tab;
            }
        });

        return formatted.substring(1, formatted.length - 2);
    }

    function showNoTemplate() {
        elements.noTemplate.style.display = 'block';
        elements.templateEditor.style.display = 'none';
        elements.sourceEmpty.style.display = 'block';
        elements.sourceContent.style.display = 'none';
        elements.docpreviewEmpty.style.display = 'block';
        elements.docpreviewContent.style.display = 'none';
    }

    function showPreviewResult(result) {
        elements.previewEmpty.style.display = 'none';
        elements.previewResult.style.display = 'block';
        elements.previewFilename.textContent = result.fileName;
        elements.downloadLink.href = result.downloadUrl;

        // Switch to preview tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelector('[data-tab="preview"]').classList.add('active');
        document.getElementById('preview-tab').classList.add('active');
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
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
            });
        });

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
        if (elements.saveBtn) {
            elements.saveBtn.addEventListener('click', saveMarkings);
        }

        // Zoom controls for document preview
        let currentZoom = 1;
        if (elements.zoomIn) {
            elements.zoomIn.addEventListener('click', () => {
                currentZoom = Math.min(currentZoom + 0.1, 2);
                elements.previewIframe.style.transform = `scale(${currentZoom})`;
                elements.previewIframe.style.transformOrigin = 'top left';
            });
        }
        if (elements.zoomOut) {
            elements.zoomOut.addEventListener('click', () => {
                currentZoom = Math.max(currentZoom - 0.1, 0.5);
                elements.previewIframe.style.transform = `scale(${currentZoom})`;
                elements.previewIframe.style.transformOrigin = 'top left';
            });
        }

        // Copy source button
        if (elements.copySource) {
            elements.copySource.addEventListener('click', () => {
                const code = elements.sourceCode.querySelector('code').textContent;
                navigator.clipboard.writeText(code).then(() => {
                    showToast('Source code copied to clipboard', 'success');
                }).catch(() => {
                    showToast('Failed to copy', 'error');
                });
            });
        }

        // Modal
        document.querySelector('.modal-close').addEventListener('click', closeModal);
        document.querySelector('.modal-cancel').addEventListener('click', closeModal);
        elements.renderModal.addEventListener('click', (e) => {
            if (e.target === elements.renderModal) closeModal();
        });

        // AI Identify button
        if (elements.aiIdentifyBtn) {
            elements.aiIdentifyBtn.addEventListener('click', async () => {
                if (!state.selectedTemplate) {
                    showToast('Please select a template first', 'warning');
                    return;
                }
                await aiIdentifyVariables();
            });
        }

        // Manual marking events
        if (elements.cancelMarking) {
            elements.cancelMarking.addEventListener('click', hideMarkingPopup);
        }
        if (elements.confirmMarking) {
            elements.confirmMarking.addEventListener('click', confirmManualMarking);
        }
        if (elements.variablePathInput) {
            elements.variablePathInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    confirmManualMarking();
                }
            });
        }

        // Text selection in document preview iframe
        if (elements.previewIframe) {
            elements.previewIframe.addEventListener('load', () => {
                try {
                    const iframeDoc = elements.previewIframe.contentDocument || elements.previewIframe.contentWindow.document;
                    iframeDoc.addEventListener('mouseup', handleTextSelection);
                } catch (e) {
                    // Cross-origin restriction
                }
            });
        }
    }

    // AI Identify Variables
    async function aiIdentifyVariables() {
        if (!state.selectedTemplate) return;

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
            elements.aiSuggestionsList.innerHTML = '<span style="color: #999;">Analysis failed</span>';
            showToast('Failed to analyze template', 'error');
        }
    }

    function renderAISuggestions(suggestions) {
        if (suggestions.length === 0) {
            elements.aiSuggestionsList.innerHTML = '<span style="color: #999;">No potential variables found</span>';
            return;
        }

        elements.aiSuggestionsList.innerHTML = suggestions.map((s, index) => `
            <div class="ai-suggestion-item" data-index="${index}">
                <div class="ai-suggestion-header">
                    <span class="ai-suggestion-path">{${s.path}}</span>
                    <span class="badge">${s.type}</span>
                </div>
                <div class="ai-suggestion-content">
                    Found: <code>${s.content}</code>
                </div>
                <div class="ai-suggestion-reason">
                    ${s.reason} (${Math.round(s.confidence * 100)}% confidence)
                </div>
                <div class="ai-suggestion-actions">
                    <button class="btn btn-accept" data-path="${s.path}" data-content="${s.content}">
                        <i class="fas fa-check"></i> Accept
                    </button>
                    <button class="btn btn-reject">
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

                // Remove suggestion
                item.style.opacity = '0.5';
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-check"></i> Added';
                showToast(`Added {${path}} to test data`, 'success');
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

    // Manual Marking Functions
    let currentSelection = null;

    function handleTextSelection(e) {
        const selection = window.getSelection ? window.getSelection() : document.selection;
        if (!selection || selection.toString().trim() === '') {
            return;
        }

        const selectedText = selection.toString().trim();

        // Only handle selections within iframe
        if (elements.previewIframe && elements.previewIframe.contentWindow === selection.anchorNode?.ownerDocument?.defaultView) {
            currentSelection = {
                text: selectedText,
                range: selection.getRangeAt(0)
            };

            showMarkingPopup(e.clientX, e.clientY, selectedText);
        }
    }

    function showMarkingPopup(x, y, text) {
        elements.selectedText.textContent = text;
        elements.variablePathInput.value = suggestVariablePath(text);
        elements.markingPopup.style.left = `${x}px`;
        elements.markingPopup.style.top = `${y}px`;
        elements.markingPopup.classList.add('show');
        elements.variablePathInput.focus();
    }

    function hideMarkingPopup() {
        elements.markingPopup.classList.remove('show');
        currentSelection = null;
    }

    function suggestVariablePath(text) {
        // Simple heuristics for suggesting variable paths
        if (/^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(text)) {
            return 'd.date';
        }
        if (/^[￥¥$]\s*\d/.test(text)) {
            return 'd.amount';
        }
        if (/^\d+\.?\d*\s*(元|件|个|张|份)/.test(text)) {
            return 'd.quantity';
        }
        if (/^\d{11}$/.test(text) || /^1[3-9]\d{9}$/.test(text)) {
            return 'd.phone';
        }
        if (/^[\w.-]+@[\w.-]+\.\w+$/.test(text)) {
            return 'd.email';
        }
        if (/^[\u4e00-\u9fa5]{2,4}$/.test(text)) {
            return 'd.name';
        }
        return 'd.value';
    }

    function confirmManualMarking() {
        const path = elements.variablePathInput.value.trim();
        if (!path) {
            showToast('Please enter a variable path', 'warning');
            return;
        }

        if (!path.startsWith('d.') && !path.startsWith('c.') && !path.startsWith('t.')) {
            showToast('Variable path should start with d., c., or t.', 'warning');
            return;
        }

        const text = elements.selectedText.textContent;

        // Add to manual markings
        state.manualMarkings.push({
            path: path,
            text: text,
            createdAt: new Date().toISOString()
        });

        // Add to test data
        addToTestData(path, text);

        // Add to variables list display
        const varItem = document.createElement('div');
        varItem.className = 'variable-item';
        varItem.innerHTML = `<code>{${path}}</code> <small style="color:#999">(手动标记: ${text})</small>`;
        elements.variablesList.appendChild(varItem);

        hideMarkingPopup();
        showToast(`Marked "${text}" as {${path}}`, 'success');
    }

    // Save Markings Function
    async function saveMarkings() {
        if (!state.selectedTemplate) {
            showToast('No template selected', 'warning');
            return;
        }

        try {
            const result = await apiRequest(`/templates/${state.selectedTemplate.id}/markings`, {
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

    // Initialize
    function init() {
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