  // Select element by XML index
  function selectElementByXmlIndex(type, xmlIndex) {
    // Map XML index to document element
    const element = state.documentElements.find((el) => {
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
    const elementGroups = state.elementGroups || {};
    const ignoredGroups = state.ignoredGroups || {};
    const markingCount = Object.keys(markings).length;
    const ignoredCount = Object.keys(ignored).length;

    if (markingCount === 0 && ignoredCount === 0 && Object.keys(elementGroups).length === 0) {
      showToast('没有需要保存的标记', 'warning');
      return;
    }

    updateStatus('processing', '保存配置中...');
    updateStepStatus('config', 'in-progress', '保存中...');

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
            text: '',
          })),
          ignoredElements: Object.keys(ignored).map((idx) => parseInt(idx)),
          elementGroups: elementGroups,
          ignoredGroups: Object.keys(ignoredGroups),
        }),
      });

      updateStatus('success', '配置已保存');
      updateStepStatus('config', 'completed', `${markingCount + ignoredCount}个`);
      showToast(`已保存 ${markingCount} 个标记配置，${ignoredCount} 个忽略元素`, 'success');
    } catch (error) {
      console.error('Save markings failed:', error);
      updateStatus('error', '保存失败');
      updateStepStatus('config', 'error', '失败');
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
        result.markings.forEach((m) => {
          if (m.index !== undefined) {
            state.manualMarkings[m.index] = m.type;
          }
        });
      }

      // 加载忽略元素
      if (result.ignoredElements && result.ignoredElements.length > 0) {
        state.ignoredElements = {};
        result.ignoredElements.forEach((idx) => {
          state.ignoredElements[idx] = true;
        });
      }

      // 加载元素分组
      if (result.elementGroups && Object.keys(result.elementGroups).length > 0) {
        state.elementGroups = result.elementGroups;
      }

      // 加载忽略的分组
      if (result.ignoredGroups && result.ignoredGroups.length > 0) {
        state.ignoredGroups = {};
        result.ignoredGroups.forEach((groupId) => {
          state.ignoredGroups[groupId] = true;
        });
      }

      // 如果当前在结构视图且xmlStructure已解析，重新渲染
      if (state.currentSourceView === 'structure' && state.xmlStructure) {
        renderStructureTree();
      }

      // 更新配置状态
      const markingCount = Object.keys(state.manualMarkings || {}).length;
      const ignoredCount = Object.keys(state.ignoredElements || {}).length;
      if (markingCount > 0 || ignoredCount > 0) {
        updateStepStatus('config', 'completed', `${markingCount + ignoredCount}个`);
        updateStatus('idle', '已保存配置，等待生成');
      }
    } catch (error) {
      console.error('Load markings failed:', error);
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
        // 如果有保存的配置，显示它并更新状态
        if (state.currentSourceView === 'structure') {
          displayAIConfigResult({ templateConfig: result.templateConfig });
        }
        // 更新步骤状态显示生成已完成
        updateStepStatus('generate', 'completed', '已完成');
        // 更新状态文本
        updateStatus('success', '模版配置已加载');
        // 启用验证按钮
        if (elements.aiVerifyBtn) {
          elements.aiVerifyBtn.disabled = false;
          elements.aiVerifyBtn.classList.remove('disabled');
        }
        console.log('Loaded saved template config:', result.templateConfig);
      } else {
        // 没有保存的配置时，显示等待生成状态
        updateStepStatus('generate', 'pending', '等待生成');
        updateStatus('pending', '等待生成模版配置');
      }
      // 加载已保存的验证结果
      loadSavedVerifyResult();
    } catch (error) {
      console.error('Load template config failed:', error);
    }
  }

  /**
   * Load saved verify result
   * 加载已保存的AI验证结果
   */
  async function loadSavedVerifyResult() {
    if (!state.selectedTemplate) return;

    try {
      // 获取模版元数据，其中包含verifyResult
      const result = await apiRequest(`/templates/${state.selectedTemplate.id}`);

      if (result.verifyResult) {
        const verifyResult = result.verifyResult;
        console.log('Loaded saved verify result:', verifyResult);

        // 更新步骤状态显示验证已完成
        updateStepStatus('verify', 'completed', '已完成');

        // 在验证结果区域显示保存的结果
        if (elements.verifyResultSection) {
          elements.verifyResultSection.style.display = 'block';
          elements.verifyResultSection.classList.add('expanded');
        }
        if (elements.verifyResult) {
          // 显示验证完成标题
          let fullResultHtml =
            '<div style="background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 4px; padding: 12px; margin-bottom: 15px;">';
          fullResultHtml +=
            '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">';
          fullResultHtml += '<i class="fas fa-check-circle" style="color: #52c41a;"></i>';
          fullResultHtml += '<strong style="color: #52c41a;">验证完成</strong>';
          if (verifyResult.verifiedAt) {
            const verifiedDate = new Date(verifyResult.verifiedAt);
            fullResultHtml += `<span style="color: #666; font-size: 12px;">(${verifiedDate.toLocaleString()})</span>`;
          }
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
            pdfBtn.addEventListener('click', () => openPdfPreviewPopup(verifyResult.previewUrl));
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
      } else {
        // 没有保存的验证结果时，显示等待验证状态
        updateStepStatus('verify', 'pending', '等待验证');
        if (elements.verifyResultSection) {
          elements.verifyResultSection.style.display = 'none';
        }
        if (elements.verifyResult) {
          elements.verifyResult.innerHTML = '';
        }
      }
    } catch (error) {
      console.error('Load verify result failed:', error);
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
      config.staticElements.forEach((el) => {
        html += `<li><code>${el.content || ''}</code> - ${el.reason || ''}</li>`;
      });
      html += '</ul></div>';
    }

    // 显示循环配置
    if (config.tableLoops && config.tableLoops.length > 0) {
      html += `<div class="config-section">
                <h4><i class="fas fa-repeat"></i> 循环表格 (${config.tableLoops.length})</h4>
                <ul>`;
      config.tableLoops.forEach((loop) => {
        html += `<li>
                    <code>${loop.arrayPath}</code> - ${loop.reason}
                    <br><small>列映射: ${loop.columnMappings?.map((c) => c.headerName + '→' + c.variablePath).join(', ')}</small>
                </li>`;
      });
      html += '</ul></div>';
    }

    // 显示组合变量
    if (config.combinedVariables && config.combinedVariables.length > 0) {
      html += `<div class="config-section">
                <h4><i class="fas fa-images"></i> 组合变量 (${config.combinedVariables.length})</h4>
                <ul>`;
      config.combinedVariables.forEach((cv) => {
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
      config.variableMappings.forEach((vm) => {
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
