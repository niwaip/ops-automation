import { Logger } from '@nestjs/common';
import { DocumentElement } from '../document-structure.service';
import { TableLoop, ColumnMapping, VariableMapping, TemplateConfig, PathMappingRule } from './types';

const logger = new Logger('StudioTableLoopHelper');

export function inferTableArrayPath(headerRow: string, templateType: string, tableIndex: number) : string {
    const headerLower = headerRow.toLowerCase();

    // 基于表头内容推断
    if (headerLower.includes('step') || headerLower.includes('步骤')) {
      return 'd.steps';
    }
    if (headerLower.includes('action') || headerLower.includes('操作')) {
      return 'd.actions';
    }
    if (headerLower.includes('item') || headerLower.includes('项目') || headerLower.includes('商品')) {
      return 'd.items';
    }
    if (headerLower.includes('product') || headerLower.includes('产品')) {
      return 'd.products';
    }
    if (headerLower.includes('user') || headerLower.includes('用户')) {
      return 'd.users';
    }
    if (headerLower.includes('result') || headerLower.includes('结果')) {
      return 'd.results';
    }

    // 基于模版类型推断
    if (templateType === '运维自动化报告') {
      return tableIndex === 0 ? 'd.steps' : `d.table${tableIndex + 1}`;
    }

    if (templateType === '订单报告') {
      return 'd.items';
    }

    return `d.items`;
  }

  /**
   * 生成列映射
   */
export function generateColumnMappings(headerRow: string, arrayPath: string) : ColumnMapping[] {
    // 支持多种分隔符：| , ，以及空格分隔的驼峰格式
    let headers: string[];
    if (headerRow.includes('|')) {
      headers = headerRow.split('|').map(h => h.trim()).filter(h => h);
    } else if (headerRow.includes(',')) {
      headers = headerRow.split(',').map(h => h.trim()).filter(h => h);
    } else {
      // 尝试按空格或大写字母分割（驼峰格式）
      headers = headerRow.split(/\s+/).filter(h => h);
    }

    const mappings: ColumnMapping[] = [];

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const varName = headerToVariableName(header);
      mappings.push({
        headerName: header,
        variablePath: `${arrayPath}[].${varName}`,
        sampleValue: getSampleValue(varName),
        columnIndex: i,
      });
    }

    return mappings;
  }

  /**
   * 表头名称转变量名
   */
export function headerToVariableName(header: string) : string {
    const mappings: Record<string, string> = {
      'start': 'start',
      '开始': 'start',
      '起始': 'start',
      'step': 'step',
      '步骤': 'step',
      'action': 'action',
      '操作': 'action',
      'result': 'result',
      '结果': 'result',
      'status': 'status',
      '状态': 'status',
      'name': 'name',
      '名称': 'name',
      'date': 'date',
      '日期': 'date',
      'time': 'time',
      '时间': 'time',
      'description': 'description',
      '描述': 'description',
      'note': 'note',
      '备注': 'note',
      'comment': 'comment',
      '评论': 'comment'
    };

    const lower = header.toLowerCase();
    return mappings[lower] || mappings[header] || lower.replace(/\s+/g, '_');
  }

  /**
   * 获取示例值
   */
export function getSampleValue(varName: string) : string {
    const samples: Record<string, string> = {
      'start': '开始执行',
      'step': '1',
      'action': '点击按钮',
      'result': '成功',
      'status': 'completed',
      'name': '示例名称',
      'date': '2024-01-01',
      'time': '10:00:00',
      'description': '示例描述',
      'note': '示例备注'
    };
    return samples[varName] || '示例值';
  }

  /**
   * 推断图片数组路径
   */
export function inferImageArrayPath(templateType: string) : string {
    if (templateType === '运维自动化报告') {
      return 'd.screenshots';
    }
    return 'd.images';
  }

  /**
   * 计算表格置信度
   */
export function calculateTableConfidence(table: DocumentElement) : number {
    let confidence = 0.5;
    const dataRows = table.dataRows || [];

    // 数据行越多，置信度越高
    if (dataRows.length > 5) confidence += 0.3;
    else if (dataRows.length > 2) confidence += 0.2;
    else if (dataRows.length > 0) confidence += 0.1;

    // 表头包含常见关键词
    const headerLower = (table.headerRow || '').toLowerCase();
    const keywords = ['step', 'action', 'result', 'status', 'name', '步骤', '操作', '结果', '状态', '名称'];
    for (const keyword of keywords) {
      if (headerLower.includes(keyword)) {
        confidence += 0.15;
        break;
      }
    }

    return Math.min(confidence, 0.95);
  }

  /**
   * 生成变量建议
   */
export function generateVariableSuggestions(elements: DocumentElement[], config: TemplateConfig) : VariableMapping[] {
    const suggestions: VariableMapping[] = [];

    // 从表格循环中提取变量
    for (const loop of config.tableLoops) {
      for (const col of loop.columnMappings) {
        suggestions.push({
          path: col.variablePath,
          sampleValue: col.sampleValue,
          index: -1,
          type: 'text',
          reason: `来自表格 "${loop.headerRow}" 的列 "${col.headerName}"`
        });
      }
    }

    // 从图片循环中提取变量
    for (const img of config.imageLoops) {
      suggestions.push({
        path: `${img.arrayPath}[].url`,
        sampleValue: img.altText || 'image.png',
        index: -1,
        type: 'image',
        reason: '图片URL变量'
      });
    }

    return suggestions;
  }
export function validateTableLoops(tableLoops: any[], elements: DocumentElement[], pathMappings?: PathMappingRule[]) : TableLoop[] {
    const result: TableLoop[] = [];

    for (const loop of tableLoops) {
      // AI返回的索引可能是 1-based (elementIndex)
      const elementIndex = loop.elementIndex !== undefined ? loop.elementIndex - 1 : loop.tableIndex;

      // 直接通过索引检查元素是否存在且为表格
      if (elementIndex >= 0 && elementIndex < elements.length) {
        const tableElement = elements[elementIndex];

        if (tableElement && tableElement.type === 'table') {
          // 检查列映射是否是AI自动生成的通用名称（如 "Column 1", "col0" 等）
          const isGenericColumnNames = (mappings: any[]): boolean => {
            if (!mappings || mappings.length === 0) return true;
            // 检查是否有真实的表头名称（非 "Column N" 或 "colN" 格式）
            const hasRealHeaderNames = mappings.some(m => {
              const header = m.headerName || '';
              const varPath = m.variablePath || '';
              // 如果headerName不是 "Column N" 格式，且variablePath不是 "colN" 结尾
              const isGenericHeader = /^Column\s+\d+$/i.test(header);
              const isGenericVarPath = /\[\]\.col\d+$/.test(varPath);
              return !isGenericHeader && !isGenericVarPath;
            });
            return !hasRealHeaderNames;
          };

          let columnMappings = loop.columnMappings;
          // 如果没有列映射，或者列映射是通用名称，则从实际表头重新生成
          if (!columnMappings || columnMappings.length === 0 ||
              (columnMappings.length === 1 && !hasCompositeTableHeader(columnMappings[0].headerName)) ||
              isGenericColumnNames(columnMappings)) {
            // 使用表格结构中的表头信息生成列映射
            columnMappings = generateColumnMappingsFromHeaders(tableElement, loop.arrayPath || 'd.items');
          } else {
            // 规范化AI返回的列映射
            columnMappings = normalizeColumnMappings(columnMappings, loop.arrayPath || 'd.items');
          }

          logger.debug(
            `[table-loop] normalized tableIndex=${elementIndex} arrayPath=${loop.arrayPath || 'd.items'} columns=${columnMappings.length}`,
          );

          result.push({
            tableIndex: elementIndex,
            headerRow: tableElement.headerRow || '',
            dataRowCount: tableElement.dataRows?.length || tableElement.dataRowCount || 0,
            arrayPath: loop.arrayPath || 'd.items',
            columnMappings: columnMappings,
            reason: loop.reason || 'AI 识别的循环表格',
            confidence: 0.9,
          });
        }
      }
    }

    return result;
  }

  /**
   * 从表格结构生成列映射
   */
export function generateColumnMappingsFromHeaders(tableElement: DocumentElement, arrayPath: string) : ColumnMapping[] {
    const headers = tableElement.tableHeaders || [];
    const mappings: ColumnMapping[] = [];

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].text || '';
      mappings.push(...expandColumnMappingsForHeader(header, arrayPath, i));
    }

    // 如果没有tableHeaders，从headerRow解析
    if (mappings.length === 0 && tableElement.headerRow) {
      return generateColumnMappings(tableElement.headerRow, arrayPath);
    }

    return mappings;
  }

  /**
   * 规范化AI返回的列映射
   */
  /**
   * 规范化AI返回的列映射
   * 使用参数对照表规范化变量路径
   */
export function normalizeColumnMappings(mappings: any[], arrayPath: string) : ColumnMapping[] {
    return mappings.flatMap((mapping, index) => {
      // 使用columnIndex（优先AI返回的，否则使用数组索引）
      const columnIndex = mapping.columnIndex !== undefined ? mapping.columnIndex : index;

      return expandColumnMappingsForHeader(
        mapping.headerName || `Column ${columnIndex + 1}`,
        arrayPath,
        columnIndex,
        mapping.variablePath,
        mapping.sampleValue,
      );
    });
  }
export function expandColumnMappingsForHeader(rawHeader: string,
    arrayPath: string,
    columnIndex: number,
    originalVariablePath?: string,
    sampleValue?: string,) : ColumnMapping[] {
    const headerSegments = splitCompositeTableHeader(rawHeader);
    const preferredBaseName = extractTableLoopBaseVarName(originalVariablePath);
    const usedNames = new Set<string>();

    return headerSegments.map((header, segmentIndex) => {
      const language = detectTableHeaderLanguage(header);
      const derivedBaseName = preferredBaseName || headerToVariableName(header);
      const varName = buildTableLoopVarName(
        derivedBaseName,
        language,
        usedNames,
        segmentIndex,
      );
      usedNames.add(varName);

      return {
        headerName: header,
        variablePath: `${arrayPath}[].${varName}`,
        sampleValue: sampleValue || getSampleValue(derivedBaseName),
        columnIndex,
      };
    });
  }
export function splitCompositeTableHeader(rawHeader: string) : string[] {
    const normalizedHeader = String(rawHeader || '')
      .replace(/\r/g, '\n')
      .trim();
    if (!normalizedHeader) {
      return [''];
    }

    const parts = normalizedHeader
      .split(/\n+|\|/u)
      .map((part) => part.trim())
      .filter(Boolean);

    return parts.length > 0 ? parts : [normalizedHeader];
  }
export function hasCompositeTableHeader(rawHeader: unknown) : boolean {
    return splitCompositeTableHeader(String(rawHeader || '')).length > 1;
  }
export function extractTableLoopBaseVarName(variablePath?: string) : string | undefined {
    const fieldMatch = String(variablePath || '').match(/\[\]\.(\w+)$/);
    if (!fieldMatch) {
      return undefined;
    }
    return fieldMatch[1].replace(/_(zh|ja|en)$/i, '');
  }
export function detectTableHeaderLanguage(header: string) : 'zh' | 'ja' | 'en' | undefined {
    const normalized = String(header || '')
      .replace(/[_＿\-—.·:：|/\\()[\]{}<>\d\s]+/gu, '')
      .trim();
    if (!normalized) {
      return undefined;
    }

    const hasKana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(normalized);
    const hasHan = /\p{Script=Han}/u.test(normalized);
    const hasLatin = /[A-Za-z]/u.test(normalized);

    if (hasKana) {
      return 'ja';
    }
    if (hasHan && !hasLatin) {
      return 'zh';
    }
    if (hasLatin && !hasHan) {
      return 'en';
    }
    return undefined;
  }
export function buildTableLoopVarName(baseName: string,
    language: 'zh' | 'ja' | 'en' | undefined,
    usedNames: Set<string>,
    segmentIndex: number,) : string {
    const normalizedBase = baseName || `col${segmentIndex}`;
    if (language) {
      const languageScopedName = `${normalizedBase}_${language}`;
      if (!usedNames.has(languageScopedName)) {
        return languageScopedName;
      }
    }
    if (!usedNames.has(normalizedBase)) {
      return normalizedBase;
    }
    return `${normalizedBase}_${segmentIndex + 1}`;
  }
