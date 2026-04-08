/**
 * Carbone Engine - XML DOM Processor
 * 使用DOM操作进行更安全的XML处理
 * 避免字符串替换带来的潜在问题
 */

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export interface XmlNodeInfo {
  nodeName: string;
  nodeValue: string | null;
  nodeType: number;
  children: XmlNodeInfo[];
  attributes: Record<string, string>;
  position: { start: number; end: number };
}

export interface LoopTemplate {
  startNode: string;   // 循环开始节点XPath或标识
  endNode: string;     // 循环结束节点XPath或标识
  templateNodes: XmlNodeInfo[];  // 模板节点列表
  arrayPath: string;   // 数组数据路径
}

// 使用any类型避免DOM类型冲突
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XmlNode = any;

export class XmlDomProcessor {
  private domParser: DOMParser;
  private xmlSerializer: XMLSerializer;

  constructor() {
    this.domParser = new DOMParser();
    this.xmlSerializer = new XMLSerializer();
  }

  /**
   * 解析XML字符串为DOM文档
   */
  parse(xmlString: string): XmlNode {
    return this.domParser.parseFromString(xmlString, 'text/xml');
  }

  /**
   * 将DOM文档序列化为XML字符串
   */
  serialize(doc: XmlNode): string {
    return this.xmlSerializer.serializeToString(doc);
  }

  /**
   * 使用XPath查找节点（简化版）
   * Office XML通常使用命名空间，这里提供简化查找
   */
  findNodes(doc: XmlNode, tagName: string, namespace?: string): XmlNode[] {
    const nodes: XmlNode[] = [];
    const selector = namespace ? `${namespace}:${tagName}` : tagName;

    const elements = doc.getElementsByTagName(selector);
    for (let i = 0; i < elements.length; i++) {
      nodes.push(elements[i]);
    }

    // 同时查找无命名空间的版本
    if (namespace) {
      const noNsElements = doc.getElementsByTagName(tagName);
      for (let i = 0; i < noNsElements.length; i++) {
        nodes.push(noNsElements[i]);
      }
    }

    return nodes;
  }

  /**
   * 查找包含特定文本的节点
   */
  findNodesByText(doc: XmlNode, searchText: string, tagName: string = 'w:t'): XmlNode[] {
    const allNodes = this.findNodes(doc, tagName, 'w');
    const matchingNodes: XmlNode[] = [];

    for (const node of allNodes) {
      if (node.textContent?.includes(searchText)) {
        matchingNodes.push(node);
      }
    }

    return matchingNodes;
  }

  /**
   * 查找包含Carbone标记的节点
   */
  findMarkerNodes(doc: XmlNode, textTagName: string = 't'): XmlNode[] {
    // 首先尝试带命名空间的标签，然后尝试不带命名空间的
    let allTextNodes = this.findNodes(doc, textTagName, 'w');
    if (allTextNodes.length === 0) {
      allTextNodes = this.findNodes(doc, textTagName);
    }

    const markerNodes: XmlNode[] = [];

    for (const node of allTextNodes) {
      const text = node.textContent || '';
      // 检查是否包含Carbone标记
      if (text.match(/\{[cdt]\./) || text.match(/\{#[cdt]\./) || text.match(/\{\/[cdt]\./)) {
        markerNodes.push(node);
      }
    }

    return markerNodes;
  }

  /**
   * 安全替换节点文本内容
   */
  replaceNodeText(node: XmlNode, newText: string): void {
    // 清除所有子节点
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
    // 创建新文本节点
    const textNode = node.ownerDocument?.createTextNode(newText);
    if (textNode) {
      node.appendChild(textNode);
    }
  }

  /**
   * 克隆节点
   */
  cloneNode(node: XmlNode, deep: boolean = true): XmlNode {
    return node.cloneNode(deep);
  }

  /**
   * 插入节点到指定位置
   */
  insertAfter(parent: XmlNode, newNode: XmlNode, referenceNode: XmlNode | null): void {
    if (referenceNode?.nextSibling) {
      parent.insertBefore(newNode, referenceNode.nextSibling);
    } else {
      parent.appendChild(newNode);
    }
  }

  /**
   * 使用DOM处理循环
   * 更安全地复制模板行并替换变量
   */
  processTableLoop(
    doc: XmlNode,
    tableElement: XmlNode,
    templateRow: XmlNode,
    dataArray: any[],
    variableReplacements: Map<string, (item: any, index: number) => string>
  ): void {
    // 获取表格的tbody或直接操作表格
    const tbody = tableElement.getElementsByTagName('w:tbl')[0] || tableElement;

    // 找到模板行的位置
    const rows = tbody.getElementsByTagName('w:tr');
    let templateRowIndex = -1;

    for (let i = 0; i < rows.length; i++) {
      if (rows[i] === templateRow) {
        templateRowIndex = i;
        break;
      }
    }

    if (templateRowIndex === -1) return;

    // 为每个数据项克隆模板行
    for (let i = 0; i < dataArray.length; i++) {
      const clonedRow = this.cloneNode(templateRow);
      this.applyReplacementsToRow(clonedRow, dataArray[i], i, variableReplacements);

      // 插入克隆的行
      if (i === dataArray.length - 1) {
        // 最后一个替换原模板行
        tbody.replaceChild(clonedRow, templateRow);
      } else {
        // 其他插入到模板行后面
        this.insertAfter(tbody, clonedRow, templateRow);
      }
    }
  }

  /**
   * 对行应用变量替换
   */
  private applyReplacementsToRow(
    row: XmlNode,
    dataItem: any,
    index: number,
    replacements: Map<string, (item: any, idx: number) => string>
  ): void {
    const textNodes = this.findNodes(row, 't', 'w');

    for (const textNode of textNodes) {
      const text = textNode.textContent || '';

      // 检查每个替换规则
      for (const [pattern, replacer] of replacements) {
        if (text.includes(pattern)) {
          const newText = text.replace(pattern, replacer(dataItem, index));
          this.replaceNodeText(textNode, newText);
        }
      }
    }
  }

  /**
   * 合并相邻的文本节点（处理Word拆分问题）
   */
  mergeAdjacentTextNodes(parent: XmlNode, textTagName: string = 't'): void {
    // 尝试带命名空间和不带命名空间的run元素
    let runElements = this.findNodes(parent, 'r', 'w');
    if (runElements.length === 0) {
      runElements = this.findNodes(parent, 'run');
    }

    for (const run of runElements) {
      const textNodes: XmlNode[] = [];

      // 收集所有文本节点（尝试带命名空间和不带命名空间的）
      for (let i = 0; i < run.childNodes.length; i++) {
        const child = run.childNodes[i];
        if (child.nodeType === 1) {
          const tagName = child.tagName;
          // 匹配 w:t 或 text 标签
          if (tagName === `w:${textTagName}` || tagName === textTagName) {
            textNodes.push(child);
          }
        }
      }

      // 合并相邻节点
      if (textNodes.length > 1) {
        let mergedText = '';
        for (const tn of textNodes) {
          mergedText += tn.textContent || '';
          // 移除节点（除了第一个）
          if (tn !== textNodes[0]) {
            run.removeChild(tn);
          }
        }

        // 设置合并后的文本
        this.replaceNodeText(textNodes[0], mergedText);
      }
    }
  }

  /**
   * 提取节点信息
   */
  extractNodeInfo(node: XmlNode, position: { start: number; end: number }): XmlNodeInfo {
    const info: XmlNodeInfo = {
      nodeName: node.nodeName,
      nodeValue: node.nodeValue,
      nodeType: node.nodeType,
      children: [],
      attributes: {},
      position
    };

    if (node.nodeType === 1 && node.attributes) {
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        info.attributes[attr.name] = attr.value;
      }
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      info.children.push(this.extractNodeInfo(node.childNodes[i], { start: position.start + i, end: position.end }));
    }

    return info;
  }

  /**
   * 使用DOM安全地处理XML（完整流程）
   */
  processXML(xml: string, data: any, textTagName: string = 't'): string {
    const doc = this.parse(xml);

    // 合并拆分的文本节点（尝试带命名空间和不带命名空间的）
    let bodyElements = this.findNodes(doc, 'body', 'w');
    if (bodyElements.length === 0) {
      bodyElements = this.findNodes(doc, 'body');
    }
    for (const body of bodyElements) {
      this.mergeAdjacentTextNodes(body, textTagName);
    }

    // 查找并处理标记
    const markerNodes = this.findMarkerNodes(doc, textTagName);

    for (const markerNode of markerNodes) {
      let text = markerNode.textContent || '';

      // 处理所有 {d.xxx} 变量
      const matches = text.matchAll(/\{d\.([^}]+)\}/g);
      for (const match of matches) {
        const fullMatch = match[0];
        const path = match[1];
        const value = this.getValueAtPath(data, path);
        if (value !== undefined) {
          text = text.replace(fullMatch, String(value));
        }
      }

      // 更新节点文本
      if (text !== markerNode.textContent) {
        this.replaceNodeText(markerNode, text);
      }
    }

    return this.serialize(doc);
  }

  /**
   * 获取路径对应的值
   */
  private getValueAtPath(data: any, path: string): any {
    const parts = path.split('.');
    let current = data;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * 移除节点
   */
  removeNode(node: XmlNode): void {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }

  /**
   * 添加属性
   */
  addAttribute(node: XmlNode, name: string, value: string): void {
    node.setAttribute(name, value);
  }

  /**
   * 获取节点文本
   */
  getNodeText(node: XmlNode): string {
    return node.textContent || '';
  }

  /**
   * 检查节点是否包含Carbone标记
   */
  containsMarker(node: XmlNode): boolean {
    const text = this.getNodeText(node);
    return /\{[cdt]\.[^}]+\}/.test(text) ||
           /\{#[cdt]\.[^}]+\}/.test(text) ||
           /\{\/[cdt]\.[^}]+\}/.test(text);
  }
}