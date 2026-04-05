/**
 * Carbone Engine - XML Preprocessor
 * 预处理XML，解决Word格式拆分问题
 */

export class XmlPreprocessor {
  /**
   * 扁平化XML - 合并被拆分的文本节点
   * Word经常将 {d.name} 拆分成 <w:t>{d.</w:t><w:t>name}</w:t>
   * 此方法将这些节点合并，使正则匹配可以正常工作
   */
  flatten(xml: string): string {
    let result = xml;

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

      // 如果没有变化，停止迭代
      if (result === previousResult) break;
    }

    return result;
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
    result = this.repairSplitMarkerStart(result);

    // 修复结束标记 } -> }
    result = this.repairSplitMarkerEnd(result);

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