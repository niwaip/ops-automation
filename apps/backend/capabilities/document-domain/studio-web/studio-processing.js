  // Upload Function
  async function uploadTemplate(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      showToast('Uploading template...', 'info');

      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
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
      const newTemplate = state.templates.find((t) => t.id === result.id);
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
      state.templates = state.templates.filter((t) => t.id !== id);
      if (state.selectedTemplate?.id === id) {
        state.selectedTemplate = null;
        elements.noTemplate.style.display = 'flex';
        elements.templateEditor.style.display = 'none';
        // 隐藏操作区域
        if (elements.operationsSection) {
          elements.operationsSection.style.display = 'none';
        }
      }
      renderTemplateList();
    } catch (error) {
      showToast('Failed to delete template', 'error');
    }
  }

  // Validate Function - 使用编辑后的模版生成文档
  async function validateData() {
    if (!state.selectedTemplate) return;

    showToast('正在验证模版并生成文档...', 'info');

    try {
      const result = await apiRequest('/validate', {
        method: 'POST',
        body: JSON.stringify({
          templateId: state.selectedTemplate.id,
          data: {}, // 空数据，让后端生成模拟数据
        }),
      });

      if (result.downloadUrl) {
        showToast('文档生成成功！', 'success');

        // 自动下载文件
        const link = document.createElement('a');
        link.href = result.downloadUrl;
        link.download = result.fileName || 'validated_document.docx';
        link.click();

        // 在结果区域显示验证结果
        if (elements.verifyResultSection) {
          elements.verifyResultSection.style.display = 'block';
          elements.verifyResultSection.classList.add('expanded');
        }
        if (elements.verifyResult) {
          let resultHtml = `
                        <div style="margin-bottom: 15px;">
                            <i class="fas fa-check-circle" style="color: #52c41a; margin-right: 8px;"></i>
                            <strong>验证完成</strong>
                        </div>
                        <p style="margin-bottom: 10px;">模版已使用编辑后的版本和模拟数据生成文档。</p>
                    `;

          // 显示生成的模拟数据
          if (result.sampleData) {
            resultHtml += `
                            <details style="margin-bottom: 15px;">
                                <summary style="cursor: pointer; font-weight: 500;">
                                    <i class="fas fa-database"></i> 生成的模拟数据
                                </summary>
                                <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 11px; max-height: 200px; overflow-y: auto;">
                                    <pre style="margin: 0; white-space: pre-wrap;">${JSON.stringify(result.sampleData, null, 2)}</pre>
                                </div>
                            </details>
                        `;
          }

          // 显示下载按钮
          resultHtml += `
                        <div style="margin-top: 15px; display: flex; gap: 8px; flex-wrap: wrap;">
                            <button id="validate-download-btn" class="btn btn-primary btn-sm">
                                <i class="fas fa-download"></i> 下载文档
                            </button>
                        </div>
                    `;

          elements.verifyResult.innerHTML = resultHtml;

          // 绑定下载按钮事件
          const downloadBtn = document.getElementById('validate-download-btn');
          if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
              const link = document.createElement('a');
              link.href = result.downloadUrl;
              link.download = result.fileName || 'validated_document.docx';
              link.click();
            });
          }
        }
      } else if (result.missing && result.missing.length > 0) {
        showToast(`缺少变量: ${result.missing.join(', ')}`, 'warning');
      } else {
        showToast('验证失败', 'error');
      }
    } catch (error) {
      showToast('验证失败: ' + error.message, 'error');
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
          outputFormat,
        }),
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

    elements.aiSuggestionsList.innerHTML =
      '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Analyzing...</div>';

    try {
      const result = await apiRequest(`/templates/${state.selectedTemplate.id}/ai-identify`, {
        method: 'POST',
        body: JSON.stringify({
          templateId: state.selectedTemplate.id,
        }),
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
      const identifyResult = await apiRequest(
        `/templates/${state.selectedTemplate.id}/ai-identify`,
        {
          method: 'POST',
          body: JSON.stringify({
            templateId: state.selectedTemplate.id,
            context: userContext,
          }),
        }
      );

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
      showToast(
        `分析完成：${totalLoops}个表格循环，${totalImages}个图片循环，${totalVars}个变量`,
        'success'
      );
    } catch (error) {
      console.error('AI analysis failed:', error);
      showToast('AI 分析失败，请重试', 'error');
      elements.aiAnalysisResult.style.display = 'none';
    } finally {
      elements.aiAnalyzeBtn.disabled = false;
      elements.aiAnalyzeBtn.innerHTML = '<i class="fas fa-magic"></i> AI 自动生成模版';
    }
  }

  // AI Generate Function - 生成模版配置
  async function performAIGenerate() {
    if (!state.selectedTemplate) {
      showToast('请先选择一个模板', 'warning');
      return;
    }

    // 更新状态显示
    updateStatus('processing', '开始生成模版...');
    updateStepStatus('generate', 'in-progress', '生成中...');

    // 禁用按钮并显示加载状态
    elements.aiGenerateBtn.disabled = true;
    elements.aiGenerateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';

    // 显示进度条
    if (elements.aiGenerateResultSection) {
      elements.aiGenerateResultSection.style.display = 'block';
      elements.aiGenerateResultSection.classList.add('expanded');
    }
    if (elements.aiProgress) {
      elements.aiProgress.style.display = 'block';
    }
    if (elements.aiGenerateResult) {
      elements.aiGenerateResult.innerHTML = '<div style="color: #1890ff;">正在连接AI服务...</div>';
    }

    let fullResponse = '';

    try {
      // 使用SSE流式调用
      const response = await fetch(
        `${API_BASE}/templates/${state.selectedTemplate.id}/ai-identify-stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: state.selectedTemplate.id,
            context: '根据手动标记生成模版配置',
            manualMarkings: state.manualMarkings,
            markingSummary: buildMarkingSummary(),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let progress = 30;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.chunk) {
                fullResponse += data.chunk;
                // 更新进度显示
                progress = Math.min(progress + 1, 90);
                updateProgress(progress, 'AI正在生成...');
                if (elements.aiGenerateResult) {
                  elements.aiGenerateResult.innerHTML = `<pre style="white-space: pre-wrap; word-break: break-all; font-size: 11px; max-height: 200px; overflow-y: auto;">${fullResponse.substring(0, 500)}${fullResponse.length > 500 ? '...' : ''}</pre>`;
                }
              }

              if (data.done && data.templateConfig) {
                const templateConfig = data.templateConfig;
                const loops = data.loops || [];
                const suggestions = data.suggestions || [];

                // 检查是否成功获取配置
                if (!templateConfig) {
                  throw new Error('AI分析失败，未生成模版配置');
                }

                // 保存模版配置
                updateProgress(95, '正在保存模版配置...');
                updateStatus('processing', '保存模版配置...');

                await apiRequest(`/templates/${state.selectedTemplate.id}/config`, {
                  method: 'POST',
                  body: JSON.stringify({
                    templateId: state.selectedTemplate.id,
                    templateConfig: templateConfig,
                  }),
                });
                state.templateConfig = templateConfig;

                // 完成
                updateProgress(100, '完成');
                updateStatus('success', '生成完成');
                updateStepStatus('generate', 'completed', '已完成');

                // 隐藏进度条
                if (elements.aiProgress) {
                  elements.aiProgress.style.display = 'none';
                }

                // 显示结果
                if (elements.aiGenerateResult) {
                  let resultHtml = '<h3>模版生成结果</h3>';
                  resultHtml += `<ul><li>循环数量: ${loops.length}</li>`;
                  resultHtml += `<li>变量数量: ${suggestions.length}</li></ul>`;
                  resultHtml +=
                    '<p style="color: #52c41a;">模版配置已保存，点击"验证模版"生成验证报告</p>';
                  elements.aiGenerateResult.innerHTML = resultHtml;
                }

                // 启用验证按钮
                if (elements.aiVerifyBtn) {
                  elements.aiVerifyBtn.disabled = false;
                  elements.aiVerifyBtn.classList.remove('disabled');
                }

                renderAISuggestions(suggestions);

                const totalVars = suggestions.length;
                const totalLoops = loops.length;
                showToast(`生成完成：${totalLoops}个循环，${totalVars}个变量`, 'success');
              }

              if (data.error) {
                throw new Error(data.error);
              }
            } catch (parseError) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('AI generate failed:', error);
      updateProgress(0, '失败');
      updateStatus('error', '生成失败: ' + error.message);
      updateStepStatus('generate', 'error', '失败');

      if (elements.aiProgress) {
        elements.aiProgress.style.display = 'none';
      }
      if (elements.aiGenerateResult) {
        elements.aiGenerateResult.innerHTML = `<div style="color: #ff4d4f;">生成失败: ${error.message}</div>`;
      }
      showToast('生成失败: ' + error.message, 'error');
    } finally {
      elements.aiGenerateBtn.disabled = false;
      elements.aiGenerateBtn.innerHTML = '<i class="fas fa-magic"></i> 生成模版';
    }
  }

  // AI Verify Function - 验证模版配置（使用fetch流式处理，参考生成模版）
  async function performAIVerify() {
    if (!state.selectedTemplate) {
      showToast('请先选择一个模板', 'warning');
      return;
    }

    // 更新状态显示
    updateStatus('processing', '开始验证模版...');
    updateStepStatus('verify', 'in-progress', '验证中...');

    // 禁用按钮并显示加载状态
    elements.aiVerifyBtn.disabled = true;
    elements.aiVerifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 验证中...';

    // 显示验证结果区域（独立的，不覆盖AI结果报告）
    if (elements.verifyResultSection) {
      elements.verifyResultSection.style.display = 'block';
      elements.verifyResultSection.classList.add('expanded');
    }
    if (elements.verifyResult) {
      elements.verifyResult.innerHTML =
        '<div style="color: #1890ff;"><i class="fas fa-spinner fa-spin"></i> 正在连接AI服务...</div>';
    }

    try {
      // 使用fetch流式调用（参考performAIGenerate）
      const requestBody = {
        templateId: state.selectedTemplate.id,
        prompt: '验证模版配置是否合理，生成示例报告',
        testData: '',
        templateConfig: state.templateConfig || {},
      };
      console.log('AI Verify request:', requestBody);
      const response = await fetch(
        `${API_BASE}/templates/${state.selectedTemplate.id}/ai-verify-stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let verifyResult = null;
      let progressMessages = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'progress') {
                // 更新进度显示
                updateProgress(data.progress, data.message);
                progressMessages.push(`[${data.step}] ${data.message}`);

                // 实时更新右边栏的进度
                if (elements.verifyResult) {
                  let progressHtml = '<div style="margin-bottom: 10px;">';
                  progressHtml += '<div style="display: flex; align-items: center; gap: 8px;">';
                  progressHtml += '<i class="fas fa-spinner fa-spin" style="color: #1890ff;"></i>';
                  progressHtml += `<span>${data.message}</span>`;
                  progressHtml += '</div>';
                  progressHtml += '<div class="progress-bar" style="margin-top: 8px;">';
                  progressHtml += `<div class="progress-fill" style="width: ${data.progress}%;"></div>`;
                  progressHtml += '</div></div>';
                  elements.verifyResult.innerHTML = progressHtml;
                }
              } else if (data.type === 'result') {
                verifyResult = data.data;

                // 完成
                updateProgress(100, '完成');
                updateStatus('success', '验证完成');
                updateStepStatus('verify', 'completed', '已完成');

                // 显示验证结果（独立的验证结果区域）
                if (elements.verifyResult) {
                  // 显示验证完成标题
                  let fullResultHtml =
                    '<div style="background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 4px; padding: 12px; margin-bottom: 15px;">';
                  fullResultHtml +=
                    '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">';
                  fullResultHtml += '<i class="fas fa-check-circle" style="color: #52c41a;"></i>';
                  fullResultHtml += '<strong style="color: #52c41a;">验证完成</strong>';
                  fullResultHtml += '</div>';

                  // 显示验证报告
                  if (verifyResult.report) {
                    fullResultHtml += '<div style="max-height: 300px; overflow-y: auto;">';
                    fullResultHtml += marked.parse(verifyResult.report);
                    fullResultHtml += '</div>';
                  }
                  fullResultHtml += '</div>';

                  // 显示生成的示例数据（可折叠）
                  if (verifyResult.sampleData) {
                    fullResultHtml +=
                      '<details style="margin-bottom: 15px;"><summary style="cursor: pointer; font-weight: 500;"><i class="fas fa-database"></i> 生成的示例数据</summary>';
                    fullResultHtml +=
                      '<div style="background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 11px; max-height: 200px; overflow-y: auto;">';
                    fullResultHtml +=
                      '<pre style="margin: 0; white-space: pre-wrap;">' +
                      JSON.stringify(verifyResult.sampleData, null, 2) +
                      '</pre>';
                    fullResultHtml += '</div></details>';
                  }

                  // 显示操作按钮
                  fullResultHtml +=
                    '<div style="margin-top: 15px; display: flex; gap: 8px; flex-wrap: wrap;">';
                  if (verifyResult.previewUrl) {
                    fullResultHtml +=
                      '<button id="verify-pdf-btn" class="btn btn-primary btn-sm"><i class="fas fa-file-pdf"></i> PDF预览</button>';
                  }
                  if (verifyResult.downloadUrl) {
                    fullResultHtml +=
                      '<button id="verify-download-btn" class="btn btn-outline btn-sm"><i class="fas fa-download"></i> 下载文档</button>';
                  }
                  if (verifyResult.markedTemplateUrl) {
                    fullResultHtml +=
                      '<button id="download-marked-template-btn" class="btn btn-outline btn-sm" style="background: #e6f7ff; border-color: #1890ff;"><i class="fas fa-file-code"></i> 下载注入模版</button>';
                  }
                  fullResultHtml += '</div>';

                  elements.verifyResult.innerHTML = fullResultHtml;

                  // 绑定按钮事件
                  const pdfBtn = document.getElementById('verify-pdf-btn');
                  if (pdfBtn) {
                    pdfBtn.addEventListener('click', () =>
                      openPdfPreviewPopup(verifyResult.previewUrl)
                    );
                  }
                  const downloadBtn = document.getElementById('verify-download-btn');
                  if (downloadBtn) {
                    downloadBtn.addEventListener('click', () =>
                      downloadRenderedDocument(verifyResult.downloadUrl)
                    );
                  }
                  const markedTemplateBtn = document.getElementById('download-marked-template-btn');
                  if (markedTemplateBtn) {
                    markedTemplateBtn.addEventListener('click', () =>
                      downloadRenderedDocument(verifyResult.markedTemplateUrl)
                    );
                  }
                }

                showToast('验证完成', 'success');
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (parseError) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('AI verify failed:', error);
      updateProgress(0, '失败');
      updateStatus('error', '验证失败: ' + error.message);
      updateStepStatus('verify', 'error', '失败');

      // 在验证结果区域显示错误
      if (elements.verifyResultSection) {
        elements.verifyResultSection.style.display = 'block';
        elements.verifyResultSection.classList.add('expanded');
      }
      if (elements.verifyResult) {
        elements.verifyResult.innerHTML = `<div style="color: #ff4d4f; background: #fff2f0; border: 1px solid #ffccc7; border-radius: 4px; padding: 12px;"><i class="fas fa-times-circle"></i> 验证失败: ${error.message}</div>`;
      }
      showToast('验证失败: ' + error.message, 'error');
    } finally {
      elements.aiVerifyBtn.disabled = false;
      elements.aiVerifyBtn.innerHTML = '<i class="fas fa-check-double"></i> 验证模版';
    }
  }

  // 打开PDF预览popup
  function openPdfPreviewPopup(previewUrl) {
    if (!previewUrl) {
      showToast('预览链接不可用', 'warning');
      return;
    }

    // 创建PDF预览弹窗
    const popupWidth = 800;
    const popupHeight = 600;
    const left = (window.innerWidth - popupWidth) / 2;
    const top = (window.innerHeight - popupHeight) / 2;

    // 打开popup窗口
    const popup = window.open(
      previewUrl,
      'pdfPreview',
      `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      // 如果popup被阻止，显示提示
      showToast('弹出窗口被阻止，请允许弹出窗口或直接点击下载', 'warning');
      // 提供直接链接
      window.open(previewUrl, '_blank');
    }
  }

  // 下载渲染后的文档
  function downloadRenderedDocument(downloadUrl) {
    if (!downloadUrl) {
      showToast('下载链接不可用', 'warning');
      return;
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `verify_${state.selectedTemplate?.name || 'document'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showToast('文档已下载', 'success');
  }

  // 更新进度条
  function updateProgress(percent, text) {
    if (elements.progressFill) {
      elements.progressFill.style.width = percent + '%';
    }
    if (elements.progressText) {
      elements.progressText.textContent = text;
    }
  }

  // 更新状态显示
  function updateStatus(type, text) {
    if (elements.statusText) {
      elements.statusText.textContent = text;
      elements.statusText.className = 'status-value ' + type;
    }
  }

  // 更新步骤状态
  function updateStepStatus(step, status, text) {
    const statusEl = document.getElementById(`step-${step}-status`);
    if (statusEl) {
      statusEl.textContent = text || '';
      statusEl.className = 'step-status ' + status;
    }
  }

  // 显示执行进度
  function showExecutionProgress(title) {
    if (elements.executionProgress) {
      elements.executionProgress.style.display = 'block';
    }
    if (elements.executionTitle) {
      elements.executionTitle.textContent = title || '执行中...';
    }
    if (elements.executionProgressFill) {
      elements.executionProgressFill.style.width = '0%';
    }
    if (elements.executionLog) {
      elements.executionLog.innerHTML = '';
    }
  }

  // 隐藏执行进度
  function hideExecutionProgress() {
    if (elements.executionProgress) {
      elements.executionProgress.style.display = 'none';
    }
  }

  // 更新执行进度
  function updateExecutionProgress(percent, logMessage) {
    if (elements.executionProgressFill) {
      elements.executionProgressFill.style.width = percent + '%';
    }
    if (logMessage && elements.executionLog) {
      const time = new Date().toLocaleTimeString();
      elements.executionLog.innerHTML += `<div>[${time}] ${logMessage}</div>`;
      elements.executionLog.scrollTop = elements.executionLog.scrollHeight;
    }
  }

  // 添加执行日志
  function addExecutionLog(message) {
    if (elements.executionLog) {
      const time = new Date().toLocaleTimeString();
      elements.executionLog.innerHTML += `<div>[${time}] ${message}</div>`;
      elements.executionLog.scrollTop = elements.executionLog.scrollHeight;
    }
  }

  // 预览模版HTML
  async function previewTemplateHtml() {
    if (!state.selectedTemplate) {
      showToast('请先选择一个模版', 'warning');
      return;
    }

    try {
      updateStatus('processing', '正在生成预览...');
      const result = await apiRequest(`/templates/${state.selectedTemplate.id}/preview-html`);

      // 显示预览模态框
      const modal = document.getElementById('preview-modal');
      const previewContent = document.getElementById('preview-content');

      if (modal && previewContent) {
        previewContent.innerHTML = result.html;
        modal.style.display = 'flex';
      } else {
        // 创建临时预览窗口
        const previewWindow = window.open('', '_blank', 'width=800,height=600');
        if (previewWindow) {
          previewWindow.document.write(`
                        <html>
                        <head><title>模版预览 - ${state.selectedTemplate.name}</title>
                        <style>body { font-family: Arial, sans-serif; padding: 20px; }</style>
                        </head>
                        <body>${result.html}</body>
                        </html>
                    `);
          previewWindow.document.close();
        }
      }
      updateStatus('success', '预览生成完成');
      showToast('预览已生成', 'success');
    } catch (error) {
      console.error('Preview failed:', error);
      updateStatus('error', '预览失败: ' + error.message);
      showToast('预览失败: ' + error.message, 'error');
    }
  }

  // 生成示例文档预览
  async function previewRenderDocument() {
    if (!state.selectedTemplate) {
      showToast('请先选择一个模版', 'warning');
      return;
    }

    try {
      updateStatus('processing', '正在生成示例文档...');

      // 使用预览端点生成示例文档
      const response = await fetch(`/api/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: state.selectedTemplate.id,
          maxRows: 5,
        }),
      });

      if (!response.ok) {
        throw new Error(`预览请求失败: ${response.status}`);
      }

      // 获取文件blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      // 在新窗口打开或下载
      const previewWindow = window.open(url, '_blank');
      if (!previewWindow) {
        // 如果无法打开新窗口，则下载文件
        const a = document.createElement('a');
        a.href = url;
        a.download = `preview_${state.selectedTemplate.name || 'document'}`;
        a.click();
      }

      updateStatus('success', '示例文档已生成');
      showToast('示例文档已生成', 'success');
    } catch (error) {
      console.error('Render preview failed:', error);
      updateStatus('error', '生成失败: ' + error.message);
      showToast('生成失败: ' + error.message, 'error');
    }
  }

  // 构建标记摘要
  function buildMarkingSummary() {
    const markings = state.manualMarkings || {};
    const ignored = state.ignoredElements || {};
    const elementGroups = state.elementGroups || {};
    const ignoredGroups = state.ignoredGroups || {};
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
      Object.keys(ignored).forEach((idx) => {
        const el = state.xmlStructure?.orderedElements?.[idx];
        if (el) {
          summary += `- 索引${idx}: ${el.text?.substring(0, 30) || el.type}\n`;
        }
      });
    }

    // 添加分组循环信息
    if (Object.keys(elementGroups).length > 0) {
      summary += '\n元素分组（循环）：\n';
      Object.entries(elementGroups).forEach(([groupId, indices]) => {
        if (indices && indices.length > 0) {
          const isIgnored = ignoredGroups[groupId];
          const groupContents = indices
            .map((idx) => {
              const el = state.xmlStructure?.orderedElements?.[idx];
              if (!el) return '';
              if (el.type === 'image') return `图片(${el.imageId || ''})`;
              return el.text?.substring(0, 30) || el.type;
            })
            .join(' + ');
          summary += `- 分组${groupId.substring(0, 4)}: 索引[${indices.join(',')}] 包含 "${groupContents}"${isIgnored ? ' [已忽略/重复]' : ''}\n`;
          summary += `  重要：这是一个分组循环，这组元素应该作为循环体，生成类似 {#d.steps} ... {/d.steps} 的循环配置\n`;
        }
      });
      if (Object.keys(ignoredGroups).length > 0) {
        summary += `\n注意：有 ${Object.keys(ignoredGroups).length} 个分组被标记为重复/忽略，生成模板时将跳过这些分组。\n`;
      }
    }

    return summary;
  }
