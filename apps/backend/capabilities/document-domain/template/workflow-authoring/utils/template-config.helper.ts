import { DocumentElement } from '../document-structure.service';
import {
  TemplateConfig,
  TableLoop,
  ColumnMapping,
  CombinedVariable,
  GroupLoop,
  ContentPattern,
  UserIntent,
} from './types';
import {
  inferTableArrayPath,
  generateColumnMappings,
  calculateTableConfidence,
} from './table-loop-helper';
export {
  matchPathPattern,
  normalizeColumnPath,
  normalizeFieldName,
  normalizeTemplateConfig,
  normalizeVariablePath,
  shouldSkipProtectedTitleVariableMapping,
  validateVariableMappings,
} from './template-config-path.helper';

/**
 * 解析用户上下文，提取意图
 */
export function parseUserContext(context: string): UserIntent {
  const intent: UserIntent = {
    preserveTitles: true, // 默认保留标题
    preserveHeadings: true, // 默认保留标题
    tableLoops: true, // 默认启用表格循环
    imageLoops: false,
    customLoops: [],
    summary: context || '通用模版分析',
  };

  const lowerContext = context.toLowerCase();

  // 检测保留标题的意图（默认保留，除非明确要求替换）
  if (
    lowerContext.includes('保留title') ||
    lowerContext.includes('保留标题') ||
    lowerContext.includes('keep title')
  ) {
    intent.preserveTitles = true;
  }

  // 如果要求标题也作为参数
  if (
    lowerContext.includes('标题参数') ||
    lowerContext.includes('title参数') ||
    lowerContext.includes('替换标题')
  ) {
    intent.preserveTitles = false;
  }

  // 检测保留标题的意图
  if (
    lowerContext.includes('保留heading') ||
    lowerContext.includes('保留标题') ||
    lowerContext.includes('keep heading')
  ) {
    intent.preserveHeadings = true;
  }

  // 检测表格循环意图
  if (
    lowerContext.includes('表格循环') ||
    lowerContext.includes('table loop') ||
    lowerContext.includes('循环表格')
  ) {
    intent.tableLoops = true;
  }

  // 检测图片循环意图
  if (
    lowerContext.includes('图片循环') ||
    lowerContext.includes('image loop') ||
    lowerContext.includes('循环图片') ||
    lowerContext.includes('screenshot') ||
    (lowerContext.includes('图片') && lowerContext.includes('循环')) ||
    (lowerContext.includes('image') && lowerContext.includes('loop'))
  ) {
    intent.imageLoops = true;
  }

  // 检测特定循环路径
  const loopMatches = context.match(/循环[:：]\s*(\w+)/g);
  if (loopMatches) {
    for (const match of loopMatches) {
      const path = match.replace(/循环[:：]\s*/, '');
      intent.customLoops.push(path);
    }
  }

  return intent;
}

/**
 * 分析内容模式 - 识别标题、表格、截图等模式
 * 返回的内容会被转换为参数或保留
 */
export function analyzeContentPattern(text: string): ContentPattern {
  // 1. 首先检查步骤模式: Step 3: screenshot + 图片
  // 这是最重要的模式，应该优先检测
  const stepMatch = text.match(/Step\s*(\d+)[:：]\s*(.+)/i);
  if (stepMatch) {
    return {
      type: 'step',
      matched: true,
      extractedValue: stepMatch[2].trim(),
      arrayPath: 'd.steps',
    };
  }

  // 2. 检查是否是纯标题模式（以#开头）
  // 只有以#开头的才是真正的标题，应该保留
  if (/^#{1,6}\s+/.test(text)) {
    return {
      type: 'heading',
      matched: true,
      extractedValue: text.replace(/^#{1,6}\s+/, '').trim(),
    };
  }

  // 3. 检查图片/截图模式
  if (text.toLowerCase().includes('screenshot') || text.includes('截图') || text.includes('图片')) {
    return {
      type: 'image',
      matched: true,
      extractedValue: text,
    };
  }

  // 4. 检查表格模式
  if (text.includes('|') && text.split('|').length > 2) {
    return {
      type: 'table',
      matched: true,
      extractedValue: text,
    };
  }

  // 5. 检查总结/日志模式
  if (
    text.includes('总结') ||
    text.includes('执行上下文') ||
    text.includes('日志') ||
    text.includes('log') ||
    text.includes('summary')
  ) {
    return {
      type: 'summary',
      matched: true,
      extractedValue: text,
    };
  }

  return {
    type: 'heading',
    matched: false,
  };
}

/**
 * 基于文档结构生成模版配置
 * 根据 preserve 标记决定元素的分类：
 * - preserve static → 静态保留
 * - preserve loop → 循环表格
 * - preserve variable / step-screenshot → 变量
 */
export function generateTemplateConfig(
  elements: DocumentElement[],
  userIntent: UserIntent
): TemplateConfig {
  const config: TemplateConfig = {
    templateType: detectTemplateType(elements),
    staticElements: [],
    tableLoops: [],
    imageLoops: [],
    combinedVariables: [],
    variableMappings: [],
    analysisNotes: [],
  };

  // 收集所有步骤截图，用于生成数组参数
  const stepScreenshots: { stepNum: number; text: string; imageId: string }[] = [];

  for (const el of elements) {
    const preserveMarker = el.preserveMarker;

    // 1. 处理 step-screenshot 类型（组合元素）
    if (el.type === 'step-screenshot') {
      // Step X: screenshot + 图片 的组合变量
      stepScreenshots.push({
        stepNum: el.stepNumber || stepScreenshots.length + 1,
        text: el.content,
        imageId: el.combinedImage?.imageId || '',
      });

      config.combinedVariables.push({
        id: el.id,
        type: 'step-screenshot',
        stepNumber: el.stepNumber || stepScreenshots.length,
        textContent: el.content,
        imageId: el.combinedImage?.imageId || '',
        imagePath: `d.steps[${(el.stepNumber || stepScreenshots.length) - 1}].screenshot`,
        reason: '段落文本与图片的组合，作为步骤截图变量',
      });
      continue;
    }

    // 2. 根据 preserve 标记决定分类
    if (preserveMarker) {
      switch (preserveMarker.type) {
        case 'static':
          // preserve static → 保留为静态元素
          config.staticElements.push({
            type:
              el.type === 'heading1' || el.type === 'heading2' || el.type === 'heading3'
                ? 'heading'
                : 'paragraph',
            content: el.text,
            reason: `根据 preserve 标记保留为静态内容: ${preserveMarker.text || ''}`,
          });
          continue;

        case 'loop':
          // preserve loop → 循环表格（在表格处理中继续）
          break;

        case 'step-screenshot':
          // 已经在上面处理了
          continue;

        case 'variable':
          // preserve variable → 变量
          config.variableMappings.push({
            path: generateVariablePath(el),
            sampleValue: el.text,
            index: el.index,
            type: detectVariableType(el),
            reason: `根据 preserve 标记作为变量: ${preserveMarker.text || ''}`,
          });
          continue;
      }
    }

    // 3. 处理标题（默认保留，除非有 preserve variable 标记）
    if (el.type === 'title') {
      if (!preserveMarker || preserveMarker.type !== 'variable') {
        if (userIntent.preserveTitles) {
          config.staticElements.push({
            type: 'title',
            content: el.text,
            reason: '文档标题，保留作为静态内容',
          });
        }
      }
      continue;
    }

    // 4. 处理标题级别 - 纯标题（### 开头）保留
    if (el.type === 'heading1' || el.type === 'heading2' || el.type === 'heading3') {
      const pattern = analyzeContentPattern(el.text);

      if (pattern.matched && pattern.type === 'heading') {
        // 纯标题（### 开头），保留
        if (!preserveMarker || preserveMarker.type !== 'variable') {
          if (userIntent.preserveHeadings) {
            config.staticElements.push({
              type: 'heading',
              content: el.text,
              reason: '章节标题，保留作为静态内容',
            });
          }
        }
      } else if (pattern.matched && pattern.type === 'step') {
        // 标题中包含 Step X 内容，但不是组合类型，作为变量
        config.variableMappings.push({
          path: `d.steps[${pattern.extractedValue || 'content'}]`,
          sampleValue: el.text,
          index: el.index,
          type: 'text',
          reason: '检测到步骤相关标题，建议作为参数',
        });
      }
      continue;
    }

    // 5. 处理表格 - 根据 preserve loop 标记决定是否循环
    if (el.type === 'table') {
      const tableHasLoopMarker =
        preserveMarker?.type === 'loop' || el.attributes?.hasLoopMarker === 'true';

      if (tableHasLoopMarker || userIntent.tableLoops) {
        const dataRows = el.dataRows || [];
        const headerRow = el.headerRow || '';
        const arrayPath = inferTableArrayPath(headerRow, config.templateType, el.index);
        const columnMappings = generateColumnMappings(headerRow, arrayPath);

        config.tableLoops.push({
          tableIndex: el.index, // <--- Corrected to el.index
          headerRow,
          dataRowCount: dataRows.length,
          arrayPath,
          columnMappings,
          reason: tableHasLoopMarker
            ? `根据 preserve 循环标记，建议循环处理`
            : `检测到数据表格，包含 ${dataRows.length} 行数据，建议循环`,
          confidence: tableHasLoopMarker ? 0.95 : calculateTableConfidence(el),
        });
      }
      continue;
    }

    // 6. 处理段落 - 检测特殊内容模式
    if (el.type === 'paragraph') {
      const pattern = analyzeContentPattern(el.text);

      if (pattern.matched && pattern.type === 'summary') {
        // 总结/日志类内容，建议变量化
        config.variableMappings.push({
          path: 'd.contextLog',
          sampleValue: el.text,
          index: el.index,
          type: 'text',
          reason: '检测到执行上下文日志内容，建议作为参数',
        });
      } else if (pattern.matched && pattern.type === 'image') {
        // 图片相关段落（但不是组合类型）
        config.variableMappings.push({
          path: `d.${slugify(pattern.extractedValue || 'screenshot')}`,
          sampleValue: el.text,
          index: el.index,
          type: 'image',
          reason: '检测到图片/截图内容，建议作为参数',
        });
      }
      continue;
    }

    // 7. 处理图片（非组合类型）
    if (el.type === 'image') {
      if (userIntent.imageLoops) {
        config.imageLoops.push({
          imageIndex: el.index, // <--- Corrected to el.index
          imageId: el.imageId || '',
          altText: el.altText || '',
          arrayPath: 'd.screenshots',
          reason: '检测到图片，建议作为数组循环',
          confidence: 0.8,
        });
      } else {
        config.variableMappings.push({
          path: `d.screenshot${config.imageLoops.length + 1}`,
          sampleValue: el.altText || 'Image',
          index: el.index,
          type: 'image',
          reason: '检测到图片，建议作为参数',
        });
      }
    }
  }

  // 8. 如果收集到步骤截图，生成步骤数组参数
  if (stepScreenshots.length > 0) {
    for (const step of stepScreenshots) {
      config.variableMappings.push({
        path: `d.steps[${step.stepNum - 1}].screenshot`,
        sampleValue: step.text,
        index: -1, // No specific index for this derived mapping
        type: 'image',
        reason: `步骤${step.stepNum}的截图参数 (imageId: ${step.imageId})`,
      });
    }
    config.analysisNotes.push(`检测到 ${stepScreenshots.length} 个步骤截图组合变量`);
  }

  // 9. 添加分析说明
  const tables = elements.filter((e) => e.type === 'table');
  config.analysisNotes.push(`检测到 ${tables.length} 个表格`);
  if (config.tableLoops.length > 0) {
    config.analysisNotes.push(`建议 ${config.tableLoops.length} 个表格使用循环`);
  }
  if (config.combinedVariables.length > 0) {
    config.analysisNotes.push(`检测到 ${config.combinedVariables.length} 个组合变量（文本+图片）`);
  }

  return config;
}

/**
 * 生成变量路径
 */
export function generateVariablePath(el: DocumentElement): string {
  const text = el.text;

  // 根据内容生成路径
  if (text.includes('上下文') || text.includes('日志')) {
    return 'd.contextLog';
  }

  if (text.includes('总结')) {
    return 'd.summary';
  }

  // 使用 slugify 生成路径
  return `d.${slugify(text)}`;
}

/**
 * 检测变量类型
 */
export function detectVariableType(
  el: DocumentElement
): 'text' | 'number' | 'date' | 'image' | 'heading' {
  const text = el.text.toLowerCase();

  if (text.includes('screenshot') || text.includes('截图') || text.includes('图片')) {
    return 'image';
  }

  if (text.includes('日期') || text.includes('date')) {
    return 'date';
  }

  if (/^\d/.test(text)) {
    return 'number';
  }

  return 'text';
}

/**
 * 检测模版类型
 */
export function detectTemplateType(elements: DocumentElement[]): string {
  const text = elements
    .map((e) => e.text || '')
    .join(' ')
    .toLowerCase();

  if (
    text.includes('step') ||
    text.includes('步骤') ||
    text.includes('action') ||
    text.includes('操作')
  ) {
    return '运维自动化报告';
  }

  if (
    text.includes('订单') ||
    text.includes('order') ||
    text.includes('商品') ||
    text.includes('product')
  ) {
    return '订单报告';
  }

  if (text.includes('报告') || text.includes('report')) {
    return '分析报告';
  }

  return '通用文档';
}
export function detectStepContentType(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes('screenshot') || lower.includes('截图') || lower.includes('图片')) {
    return 'screenshot';
  }
  return 'text';
}

/**
 * 将文本转换为变量名
 * screenshot + 图片 → screenshot
 * 基于提供的执行上下文日志 → contextLog
 */
export function slugify(text: string): string {
  // 移除特殊字符，转小写
  let result = text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, '') // 保留字母数字下划线和中文
    .trim();

  // 中文关键词映射
  const chineseKeywords: Record<string, string> = {
    截图: 'screenshot',
    图片: 'image',
    日志: 'log',
    上下文: 'context',
    执行: 'execution',
    总结: 'summary',
    步骤: 'step',
    操作: 'operation',
  };

  // 替换中文关键词
  for (const [chinese, english] of Object.entries(chineseKeywords)) {
    if (result.includes(chinese)) {
      result = result.replace(chinese, english);
    }
  }

  // 如果还有中文或空白，移除
  result = result.replace(/[\u4e00-\u9fa5]/g, '').replace(/\s+/g, '_');

  // 如果结果为空，使用默认值
  if (!result) {
    result = 'value';
  }

  return result;
}

/**
 * 验证并补充分组循环配置
 */
export function validateGroupLoops(groupLoops: any[]): GroupLoop[] {
  const result: GroupLoop[] = [];

  for (const gl of groupLoops) {
    if (gl.groupIndices && Array.isArray(gl.groupIndices) && gl.groupIndices.length > 0) {
      result.push({
        groupId: gl.groupId,
        groupIndices: gl.groupIndices,
        arrayPath: gl.arrayPath || 'd.items',
        textElement: gl.textElement,
        imageElement: gl.imageElement,
        reason: gl.reason || '用户创建的分组循环',
      });
    }
  }

  return result;
}

/**
 * 验证并补充组合变量配置
 * 合并AI生成的组合变量和文档中检测到的step-screenshot元素
 */
export function validateCombinedVariables(
  combinedVars: any[],
  elements: DocumentElement[]
): CombinedVariable[] {
  const result: CombinedVariable[] = [];
  const existingStepNumbers = new Set<number>();

  // 1. 先添加AI生成的组合变量
  for (const cv of combinedVars) {
    const stepNumber = cv.stepNumber || 0;
    existingStepNumbers.add(stepNumber);
    result.push({
      id: `combined-${stepNumber}`,
      type: 'step-screenshot',
      stepNumber: stepNumber,
      textContent: cv.textContent || '',
      imageId: cv.imageId || '',
      imagePath: `d.steps[${stepNumber - 1}].screenshot`,
      reason: cv.reason || 'AI 识别的组合变量',
    });
  }

  // 2. 添加文档中检测到的step-screenshot元素（如果不在AI结果中）
  for (const el of elements) {
    if (el.type === 'step-screenshot' && el.stepNumber) {
      if (!existingStepNumbers.has(el.stepNumber)) {
        existingStepNumbers.add(el.stepNumber);
        result.push({
          id: el.id,
          type: 'step-screenshot',
          stepNumber: el.stepNumber,
          textContent: el.content || '',
          imageId: el.combinedImage?.imageId || '',
          imagePath: `d.steps[${el.stepNumber - 1}].screenshot`,
          reason: '文档解析检测到的step-screenshot组合元素',
        });
      }
    }
  }

  // 按步骤号排序
  result.sort((a, b) => a.stepNumber - b.stepNumber);

  return result;
}
