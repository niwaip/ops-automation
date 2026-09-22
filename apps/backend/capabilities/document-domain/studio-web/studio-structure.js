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
          dataRowCount: apiTable.dataRowCount || (apiTable.dataRows ? apiTable.dataRows.length : 0),
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
              hasPreserve: false,
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
            hasPreserve: child.outerHTML.includes('preserve'),
          });
        }
      }
      // 对于sectPr等非内容元素，跳过
      else if (
        localName === 'sectPr' ||
        localName === 'pPr' ||
        localName === 'rPr' ||
        tagName.includes('sectPr') ||
        tagName.includes('pPr') ||
        tagName.includes('rPr')
      ) {
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
      preserveElements: [],
    };

    // 使用后端API返回的结构化数据来丰富表格信息
    const apiTables = state.documentElements.filter((el) => el.type === 'table');
    const apiImages = state.documentElements.filter((el) => el.type === 'image');
    const tableIndex = { value: 0 };

    // 遍历body下的所有直接子元素，按文档顺序收集
    const body = xmlDoc.getElementsByTagNameNS('*', 'body')[0];
    if (body) {
      collectElementsInOrder(body, state.xmlStructure, apiTables, tableIndex);
    }

    // 合并后端API返回的图片数据到orderedElements
    if (apiImages.length > 0) {
      // 找到orderedElements中的图片元素并更新数据
      const imageElements = state.xmlStructure.orderedElements.filter((el) => el.type === 'image');
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
    state.xmlStructure.orderedElements.forEach((el) => {
      if (el.type === 'table') {
        state.xmlStructure.tables.push(el);
      }
    });

    // 更新paragraphs数组（保持兼容）
    state.xmlStructure.orderedElements.forEach((el) => {
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
          tagName: el.tagName,
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
    let paramCount = 0,
      loopCount = 0,
      staticCount = 0,
      ignoredCount = Object.keys(ignored).length;
    Object.values(markings).forEach((type) => {
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
        const groupInfo = inGroup
          ? `<span class="group-tag" title="分组 ${inGroup[0].substring(0, 4)}"><i class="fas fa-layer-group"></i></span>`
          : '';

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
                        ${
                          marking && !isGroupMember
                            ? `<button class="node-action-btn btn-clear"
                                data-action="clear" data-index="${idx}" title="清除标记">
                            <i class="fas fa-times"></i>
                        </button>`
                            : ''
                        }
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
            html += `<div class="structure-node table-data-node ${dataLoopClass}" data-type="table-data" data-table="${el.index}" data-row-count="${rowCount}">
                            <span class="node-label">🔄 数据行</span>
                            ${marking === 'loop' ? '<span class="node-attr" style="color:#155724;background:#d4edda;padding:2px 6px;border-radius:3px;">将循环</span>' : '<span class="node-attr">可循环</span>'}
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
                                <span class="node-text">... 更多数据</span>
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
          const sizeInfo = el.attributes?.widthPx
            ? `${el.attributes.widthPx}×${el.attributes.heightPx}px`
            : '';
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
    elements.structureTree.querySelectorAll('.node-action-btn').forEach((btn) => {
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
    elements.structureTree.querySelectorAll('.node-checkbox').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const index = parseInt(cb.dataset.index);
        if (cb.checked) {
          if (!state.selectedElementIndices.includes(index)) {
            state.selectedElementIndices.push(index);
          }
        } else {
          state.selectedElementIndices = state.selectedElementIndices.filter((i) => i !== index);
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
    elements.structureTree.querySelectorAll('.btn-remove-group').forEach((btn) => {
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
    elements.structureTree.querySelectorAll('.btn-toggle-ignore').forEach((btn) => {
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
    elements.structureTree.querySelectorAll('.structure-node[data-order-index]').forEach((node) => {
      node.addEventListener('click', () => {
        // Remove previous selection
        elements.structureTree
          .querySelectorAll('.selected')
          .forEach((el) => el.classList.remove('selected'));
        node.classList.add('selected');

        const orderIndex = parseInt(node.dataset.orderIndex);

        // 获取xmlStructure中对应元素的文本
        const xmlElement = state.xmlStructure?.orderedElements?.[orderIndex];
        if (xmlElement && xmlElement.text) {
          // 通过文本内容匹配documentElements中的元素
          const element = state.documentElements.find((el) => {
            // 对于表格，匹配标题行
            if (xmlElement.type === 'table' && el.type === 'table') {
              return (
                el.headerRow &&
                xmlElement.headerRow &&
                el.headerRow.includes(xmlElement.headerRow.substring(0, 30))
              );
            }
            // 对于段落，匹配文本内容
            return (
              el.text &&
              xmlElement.text &&
              (el.text === xmlElement.text ||
                el.text.includes(xmlElement.text.substring(0, 50)) ||
                xmlElement.text.includes(el.text.substring(0, 50)))
            );
          });

          if (element) {
            selectDocumentElement(element);
          } else {
            showToast(
              `Selected ${xmlElement.type}: "${xmlElement.text.substring(0, 30)}..."`,
              'info'
            );
          }
        }
      });
    });
  }
