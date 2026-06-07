/**
 * Carbone Engine - XML Preprocessor
 * 预处理XML，解决Word格式拆分问题
 */

/**
 * 虚拟文本节点 - 不修改实际XML的逻辑视图
 */
export interface VirtualTextNode {
  // 虚拟合并后的文本内容
  text: string;
  // 原始节点引用（用于后续替换）
  originalNodes: OriginalNode[];
  // 在原始XML中的位置范围
  startPos: number;
  endPos: number;
  // 是否包含Carbone标记
  hasMarker: boolean;
}

/**
 * 原始节点信息
 */
export interface OriginalNode {
  // 完整的XML标签
  fullMatch: string;
  // 位置
  position: number;
  // 文本内容
  text: string;
  // 属性
  attributes: string;
}

/**
 * 虚拟扁平化结果
 */
export interface VirtualFlattenResult {
  // 虚拟文本节点列表
  virtualNodes: VirtualTextNode[];
  // 映射：虚拟位置 -> 原始位置
  positionMap: Map<number, { originalPos: number; nodeIndex: number }>;
  // 原始XML
  originalXml: string;
}

export class XmlPreprocessor {
  private readonly carboneMarkerRegex = /\{[cdt][.#\/]?\.[^}]+\}/g;

  /**
   * 扁平化XML - 合并被拆分的文本节点
   * Word经常将 {d.name} 拆分成 <w:t>{d.</w:t><w:t>name}</w:t>
   * 或者被 <w:proofErr> 拆分成多个 <w:r> 元素
   * 此方法将这些节点合并，使正则匹配可以正常工作
   */
  flatten(xml: string): string {
    let result = xml;

    // 步骤1: 移除拼写检查标记 <w:proofErr>
    // 这些标记会打断文本节点，导致变量标记被拆分
    result = result.replace(/<w:proofErr[^>]*>/g, '');

    // 步骤2: 合并相邻的 <w:r> 元素中的 <w:t> 节点
    // 当 proofErr 被移除后，相邻的 <w:r> 元素可能需要合并
    // 多次迭代，处理多层嵌套的拆分
    for (let i = 0; i < 10; i++) {
      const previousResult = result;

      // 合并相邻的 <w:t> 节点（在同一个 <w:r> 内）
      // 模式: </w:t><w:t...> 表示相邻的文本节点
      result = result.replace(
        /<\/w:t>(\s*)<w:t([^>]*)>/g,
        (match, whitespace, attrs) => {
          // 如果新节点有特殊属性（如xml:space），保留它
          if (attrs.includes('xml:space')) {
            return match; // 保持原样
          }
          // 否则合并节点
          return '';
        }
      );

      // 步骤3: 合并被拆分的 Carbone 标记
      // 处理 {d.xxx} 被拆分成 {</w:t></w:r><w:r><w:t>d.xxx} 的情况
      // 合并 </w:r><w:r 中间没有内容的相邻 run 元素
      result = result.replace(
        /<\/w:r>(\s*)<w:r(\s[^>]*)?>/g,
        (match, whitespace, attrs) => {
          // 检查是否是空的相邻 run（没有格式属性）
          if (attrs && attrs.trim() === '') {
            return '';
          }
          return match;
        }
      );

      // 如果没有变化，停止迭代
      if (result === previousResult) break;
    }

    // 步骤4: 修复被拆分的 Carbone 标记
    // 处理 { 后面紧跟着 XML 结束标签的情况
    // 例如: {</w:t></w:r><w:r><w:t>d.xxx</w:t></w:r><w:r><w:t>}
    result = this.repairSplitCarboneMarkers(result);

    return result;
  }

  /**
   * 修复被拆分的 Carbone 标记
   * 处理标记被拆分成多个 XML 元素的情况
   */
  private repairSplitCarboneMarkers(xml: string): string {
    let result = xml;

    if (result.includes('<w:t')) {
      result = this.repairSplitCarboneMarkersInWordTextNodes(result);
    }
    if (this.looksLikeExcelXml(result)) {
      result = this.repairSplitCarboneMarkersInExcelTextNodes(result);
    }

    return result;
  }

  private looksLikeExcelXml(xml: string): boolean {
    return (
      xml.includes('http://schemas.openxmlformats.org/spreadsheetml')
      || xml.includes('<sst')
      || xml.includes('<worksheet')
      || xml.includes('<sheetData')
    );
  }

  private repairSplitCarboneMarkersInWordTextNodes(xml: string): string {
    let result = xml;
    const textNodes: Array<{ start: number; end: number; attributes: string; text: string }> = [];
    const textPattern = /<w:t([^>]*)>([^<]*)<\/w:t>/g;
    let textMatch: RegExpExecArray | null;
    while ((textMatch = textPattern.exec(result)) !== null) {
      textNodes.push({
        start: textMatch.index,
        end: textMatch.index + textMatch[0].length,
        attributes: textMatch[1],
        text: textMatch[2],
      });
    }

    for (let i = 0; i < textNodes.length; i++) {
      const nodeI = textNodes[i];
      if (!nodeI.text.includes('{')) {
        continue;
      }

      let windowText = nodeI.text;
      let endNodeIdx = -1;

      for (let j = i + 1; j < textNodes.length && j <= i + 12; j++) {
        windowText += textNodes[j].text;
        const markerMatches = Array.from(windowText.matchAll(this.carboneMarkerRegex));
        const crossesFirstNode = markerMatches.some((match) => {
          const start = match.index ?? -1;
          if (start < 0) return false;
          const end = start + match[0].length;
          return start < nodeI.text.length && end > nodeI.text.length;
        });
        if (crossesFirstNode) {
          endNodeIdx = j;
          break;
        }
        if (windowText.length > 512) {
          break;
        }
      }

      if (endNodeIdx === -1) {
        continue;
      }

      const updates: Array<{ start: number; end: number; attributes: string; text: string }> = [];
      updates.push({ ...nodeI, text: windowText });
      for (let j = i + 1; j <= endNodeIdx; j++) {
        updates.push({ ...textNodes[j], text: '' });
      }
      updates.sort((a, b) => b.start - a.start);
      for (const update of updates) {
        const newFullMatch = `<w:t${update.attributes}>${update.text}</w:t>`;
        result = result.substring(0, update.start) + newFullMatch + result.substring(update.end);
      }

      i = endNodeIdx;
    }

    return result;
  }

  private repairSplitCarboneMarkersInExcelTextNodes(xml: string): string {
    const repairContainer = (containerXml: string): string => {
      if (!containerXml.includes('<t')) {
        return containerXml;
      }
      const tNodes = Array.from(containerXml.matchAll(/<t([^>]*)>([\s\S]*?)<\/t>/g)).map((match) => ({
        full: match[0],
        attrs: match[1],
        text: match[2],
      }));
      if (tNodes.length <= 1) {
        return containerXml;
      }
      const combined = tNodes.map((node) => node.text).join('');
      if (!combined.includes('{')) {
        return containerXml;
      }
      if (!this.carboneMarkerRegex.test(combined)) {
        this.carboneMarkerRegex.lastIndex = 0;
        return containerXml;
      }
      this.carboneMarkerRegex.lastIndex = 0;
      const hasMarkerInSingleNode = tNodes.some((node) => {
        const hit = this.carboneMarkerRegex.test(node.text);
        this.carboneMarkerRegex.lastIndex = 0;
        return hit;
      });
      if (hasMarkerInSingleNode) {
        return containerXml;
      }
      let index = 0;
      return containerXml.replace(/<t([^>]*)>([\s\S]*?)<\/t>/g, (_match, attrs) => {
        index += 1;
        if (index === 1) {
          return `<t${attrs}>${combined}</t>`;
        }
        return `<t${attrs}></t>`;
      });
    };

    let result = xml;
    result = result.replace(/<si\b[\s\S]*?<\/si>/g, (match) => repairContainer(match));
    result = result.replace(/<is\b[\s\S]*?<\/is>/g, (match) => repairContainer(match));
    return result;
  }

  /**
   * 虚拟扁平化 - 不修改XML，创建逻辑视图
   * 保留原始样式节点，同时提供合并后的文本视图
   */
  virtualFlatten(xml: string): VirtualFlattenResult {
    const virtualNodes: VirtualTextNode[] = [];
    const positionMap = new Map<number, { originalPos: number; nodeIndex: number }>();

    // 查找所有 <w:r> 元素
    const runPattern = /<w:r[^>]*>([\s\S]*?)<\/w:r>/g;
    let runMatch;

    while ((runMatch = runPattern.exec(xml)) !== null) {
      const runStart = runMatch.index;
      const runContent = runMatch[1];

      // 在run内查找所有 <w:t> 元素
      const textNodes = this.extractTextNodes(runContent, runStart);

      if (textNodes.length === 0) continue;

      // 合并相邻的文本节点（虚拟合并）
      const mergedText = textNodes.map(n => n.text).join('');
      const hasMarker = /\{[cdt][.#\/]?\./.test(mergedText);

      const virtualNode: VirtualTextNode = {
        text: mergedText,
        originalNodes: textNodes,
        startPos: textNodes[0].position,
        endPos: textNodes[textNodes.length - 1].position + textNodes[textNodes.length - 1].fullMatch.length,
        hasMarker
      };

      virtualNodes.push(virtualNode);

      // 建立位置映射
      let virtualPos = 0;
      for (const node of textNodes) {
        for (let i = 0; i < node.text.length; i++) {
          positionMap.set(virtualPos, {
            originalPos: node.position + node.fullMatch.indexOf(node.text) + i,
            nodeIndex: virtualNodes.length - 1
          });
          virtualPos++;
        }
      }
    }

    return {
      virtualNodes,
      positionMap,
      originalXml: xml
    };
  }

  /**
   * 从run内容中提取所有文本节点
   */
  private extractTextNodes(runContent: string, runStart: number): OriginalNode[] {
    const nodes: OriginalNode[] = [];
    const textPattern = /<w:t([^>]*)>([^<]*)<\/w:t>/g;
    let match;

    while ((match = textPattern.exec(runContent)) !== null) {
      nodes.push({
        fullMatch: match[0],
        position: runStart + match.index,
        text: match[2],
        attributes: match[1]
      });
    }

    return nodes;
  }

  /**
   * 使用虚拟视图查找标记
   * 返回标记在虚拟视图和原始XML中的位置
   */
  findMarkersWithVirtualView(xml: string): { marker: string; virtualPos: number; originalPositions: number[] }[] {
    const result = this.virtualFlatten(xml);
    const markers: { marker: string; virtualPos: number; originalPositions: number[] }[] = [];

    // 在虚拟视图中查找标记
    const markerPattern = /\{[cdt][.#\/]?\.([^}]+)\}/g;
    let match;

    for (const vnode of result.virtualNodes) {
      while ((match = markerPattern.exec(vnode.text)) !== null) {
        const virtualPos = match.index;

        // 找到对应的原始位置
        const originalPositions: number[] = [];
        for (let i = 0; i < match[0].length; i++) {
          const mapping = result.positionMap.get(virtualPos + i);
          if (mapping) {
            originalPositions.push(mapping.originalPos);
          }
        }

        markers.push({
          marker: match[0],
          virtualPos,
          originalPositions
        });
      }
    }

    return markers;
  }

  /**
   * 使用虚拟视图安全替换标记
   * 保持原始XML结构不变，只替换文本内容
   */
  replaceWithVirtualView(
    xml: string,
    marker: string,
    replacement: string
  ): string {
    const result = this.virtualFlatten(xml);
    let modifiedXml = xml;

    for (const vnode of result.virtualNodes) {
      if (!vnode.text.includes(marker)) continue;

      // 找到标记在哪些原始节点中
      const markerStartInVirtual = vnode.text.indexOf(marker);

      // 确定需要修改哪些原始节点
      const affectedNodes: { node: OriginalNode; newText: string }[] = [];
      let currentPos = 0;

      for (const node of vnode.originalNodes) {
        const nodeStartInVirtual = currentPos;
        const nodeEndInVirtual = currentPos + node.text.length;

        // 检查这个节点是否包含标记的一部分
        if (nodeEndInVirtual > markerStartInVirtual &&
            nodeStartInVirtual < markerStartInVirtual + marker.length) {
          // 计算需要替换的部分
          const overlapStart = Math.max(0, markerStartInVirtual - nodeStartInVirtual);
          const overlapEnd = Math.min(node.text.length, markerStartInVirtual + marker.length - nodeStartInVirtual);

          // 如果整个节点都是标记的一部分
          if (overlapStart === 0 && overlapEnd === node.text.length && node.text === marker) {
            affectedNodes.push({ node, newText: replacement });
          } else {
            // 部分重叠，需要更精确的处理
            // 这种情况通常由虚拟合并引起，我们保持原始节点结构
            affectedNodes.push({ node, newText: node.text });
          }
        } else {
          // 不受影响的节点
          affectedNodes.push({ node, newText: node.text });
        }

        currentPos += node.text.length;
      }

      // 应用修改
      // 按位置倒序处理，避免位置偏移问题
      affectedNodes.sort((a, b) => b.node.position - a.node.position);

      for (const { node, newText } of affectedNodes) {
        if (newText !== node.text) {
          // 替换节点内容
          const nodeStart = node.position;
          const nodeEnd = node.position + node.fullMatch.length;
          const newFullMatch = `<w:t${node.attributes}>${newText}</w:t>`;

          modifiedXml = modifiedXml.substring(0, nodeStart) + newFullMatch + modifiedXml.substring(nodeEnd);
        }
      }
    }

    return modifiedXml;
  }

  /**
   * 预处理Carbone标记 - 处理可能被拆分的标记
   * 在扁平化后仍然可能有残留的问题，这个方法处理特殊情况
   */
  preprocessMarkers(xml: string): string {
    // 查找所有可能被拆分的Carbone标记片段
    // 例如: {d. ... name} 或 {#d. ... items} 等

    // 处理开始标记被拆分的情况 {d. 或 {#d. 或 {/d.
    let result = xml;

    // 修复开始标记 {d. -> {d.
    if (result.includes('<w:t')) {
      result = this.repairSplitMarkerStart(result);
    }

    // 修复结束标记 } -> }
    result = this.repairSplitMarkerEnd(result);

    if (this.looksLikeExcelXml(result)) {
      result = this.repairSplitCarboneMarkersInExcelTextNodes(result);
    }

    return result;
  }

  /**
   * 修复被拆分的开始标记
   */
  private repairSplitMarkerStart(xml: string): string {
    // 查找所有 { 后面跟着 XML 标签的情况
    // 例如: {</w:t><w:t>d.</w:t><w:t>name}
    const pattern = /\{([^}]*<[^>]+>[^}]*)\}/g;

    return xml.replace(pattern, (match) => {
      // 移除XML标签，只保留文本内容
      return match.replace(/<[^>]+>/g, '');
    });
  }

  /**
   * 修复被拆分的结束标记
   */
  private repairSplitMarkerEnd(xml: string): string {
    // 类似开始标记的处理
    return xml;
  }

  /**
   * 检测并报告可能的问题
   */
  detectIssues(xml: string): { type: string; message: string; position: number }[] {
    const issues: { type: string; message: string; position: number }[] = [];

    // 检测未闭合的标记
    const openBraces = (xml.match(/\{/g) || []).length;
    const closeBraces = (xml.match(/\}/g) || []).length;

    if (openBraces !== closeBraces) {
      issues.push({
        type: 'unbalanced_braces',
        message: `检测到不平衡的大括号: ${openBraces} 个 { 和 ${closeBraces} 个 }`,
        position: 0
      });
    }

    // 检测可能被拆分的标记
    const splitPattern = /\{[cdt]?\.\s*<\/w:t>|<w:t[^>]*>\s*\}/;
    if (splitPattern.test(xml)) {
      issues.push({
        type: 'split_marker',
        message: '检测到可能被拆分的Carbone标记',
        position: xml.search(splitPattern)
      });
    }

    return issues;
  }

  /**
   * 完整预处理流程
   */
  process(xml: string): { xml: string; issues: { type: string; message: string; position: number }[] } {
    // 1. 扁平化XML
    let processed = this.flatten(xml);

    // 2. 预处理标记
    processed = this.preprocessMarkers(processed);

    // 3. 检测问题
    const issues = this.detectIssues(processed);

    return { xml: processed, issues };
  }
}
