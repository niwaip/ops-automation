import { Logger } from '@nestjs/common';
import { DocumentElement } from '../document-structure.service';
import {
  TemplateConfig,
  VariableMapping,
  TableLoop,
  CombinedVariable,
  GroupLoop,
  PathMappingRule,
  DEFAULT_PATH_MAPPINGS,
} from './types';
import { validateTableLoops } from './table-loop-helper';
import {
  validateGroupLoops,
  validateCombinedVariables,
  validateVariableMappings,
  extractFormatter,
  generateFallbackSuggestions,
} from './parameter.helper';

const logger = new Logger('StudioAiPromptBuilder');

export async function analyzeBlankPatternsWithAI(
  patterns: Array<{
    text: string;
    context: string;
    beforeBlank?: string;
    position: number;
    type: string;
    chapter?: string;
    significance?: string;
  }>,
  fullContent: string,
  templateType: string,
  context: string | undefined,
  customRules: Array<{ pattern: string; targetPath: string; description?: string }> | undefined,
  skill: any,
  callAIService: (prompt: string) => Promise<any>
): Promise<{ suggestions: any[]; usedAI: boolean }> {
  if (patterns.length === 0) {
    return { suggestions: [], usedAI: false };
  }

  // 构建AI提示并调用AI服务
  // 如果空白数量较多，分段调用AI以减少复杂度
  try {
    let suggestions: any[] = [];

    // 分段调用策略：每次最多处理15个空白
    const batchSize = 15;
    const batches = [];

    for (let i = 0; i < patterns.length; i += batchSize) {
      batches.push(patterns.slice(i, i + batchSize));
    }

    logger.log(`将${patterns.length}个空白分成${batches.length}批进行AI分析`);

    // 对每批调用AI
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batchPatterns = batches[batchIndex];
      logger.debug(`处理第${batchIndex + 1}批，共${batchPatterns.length}个空白`);

      // 构建针对这批空白的提示（包含完整文档上下文）
      const prompt = buildAIPromptForBlanks(
        batchPatterns,
        fullContent,
        templateType,
        context,
        customRules,
        batchIndex * batchSize,
        skill
      );

      try {
        const aiResponse = await callAIService(prompt);
        const batchSuggestions = parseAIResponseToSuggestions(
          aiResponse,
          batchPatterns,
          batchIndex * batchSize
        );
        suggestions = suggestions.concat(batchSuggestions);
        logger.debug(`第${batchIndex + 1}批AI分析完成，返回${batchSuggestions.length}个建议`);
      } catch (batchError) {
        logger.warn(`第${batchIndex + 1}批AI分析失败，使用规则后备`);
        const fallbackSuggestions = generateFallbackSuggestions(
          batchPatterns,
          templateType,
          batchIndex * batchSize
        );
        suggestions = suggestions.concat(fallbackSuggestions);
      }
    }

    // 如果总建议数量太少，使用规则补充
    if (suggestions.length < Math.min(patterns.length, 3)) {
      logger.warn(`AI总建议数量不足(${suggestions.length}/${patterns.length})，使用规则补充`);
      const fallbackSuggestions = generateFallbackSuggestions(patterns, templateType, 0);
      const mergedSuggestions = mergeSuggestions(suggestions, fallbackSuggestions, patterns);
      return { suggestions: mergedSuggestions, usedAI: suggestions.length > 0 };
    }

    return { suggestions, usedAI: true };
  } catch (error) {
    logger.error(`AI analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    logger.warn('使用规则匹配作为后备方案');
    const suggestions = generateFallbackSuggestions(patterns, templateType, 0);
    return { suggestions, usedAI: false };
  }
}

/**
 * 合并AI建议和规则建议
 * AI建议优先，规则建议补充缺失的部分
 */
export function mergeSuggestions(
  aiSuggestions: any[],
  fallbackSuggestions: any[],
  patterns: any[]
): any[] {
  const result: any[] = [...aiSuggestions];

  // 对于AI没有覆盖的空白模式，使用规则建议
  const coveredIndices = new Set(
    aiSuggestions.map((s) => {
      const match = s.id.match(/sugg-\d+-(\d+)/);
      return match ? parseInt(match[1]) : -1;
    })
  );

  for (let i = 0; i < fallbackSuggestions.length; i++) {
    if (!coveredIndices.has(i)) {
      result.push(fallbackSuggestions[i]);
    }
  }

  // 按原始顺序排序
  result.sort((a, b) => {
    const aIdx = parseInt(a.id.match(/sugg-\d+-(\d+)/)?.[1] || '0');
    const bIdx = parseInt(b.id.match(/sugg-\d+-(\d+)/)?.[1] || '0');
    return aIdx - bIdx;
  });

  return result;
}
export function buildAIPromptForBlanks(
  patterns: Array<{
    text: string;
    context: string;
    beforeBlank?: string;
    position: number;
    type: string;
  }>,
  fullContent: string,
  templateType: string,
  context?: string,
  customRules?: Array<{ pattern: string; targetPath: string; description?: string }>,
  startIndex: number = 0, // 空白的起始索引（用于分批处理）
  skill?: any
): string {
  const templateTypeDescriptions: Record<string, string> = {
    report: '报告文档，包含标题、日期、正文、总结等',
    invoice: '发票/账单，包含金额、日期、项目、公司信息等',
    certificate: '证书/证明，包含姓名、日期、证书编号、内容等',
    contract: '合同/协议，包含甲方乙方、签署日期、条款内容、违约金额等',
    letter: '信函/通知，包含收件人、日期、正文、签名等',
    custom: '自定义模板',
  };

  const typeDesc = templateTypeDescriptions[templateType] || templateTypeDescriptions['report'];

  // 提取 Skill 中的参数情报
  const skillParameters = skill?.parameters || [];
  const skillHints = Array.isArray(skillParameters)
    ? skillParameters
        .map((p: any) => `- ${p.name}: ${p.usage || ''} | 提取提示: ${p.extractionHint || ''}`)
        .join('\n')
    : '';
  const skillDescription = skill?.templateDescription || '';

  // 提取文档前800字符作为背景（增加上下文长度）
  const background = fullContent.substring(0, Math.min(800, fullContent.length));

  // 构建空白部分列表（包含更详细的信息）
  const blankList = patterns
    .map(
      (p, i) =>
        `[${startIndex + i + 1}] 类型: ${p.type}\n    空白内容: "${p.text}"\n    前文标签: "${p.beforeBlank || '未知'}"\n    上下文片段: "${p.context}"\n    位置: ${p.position}`
    )
    .join('\n\n');

  // 自定义规则提示
  const customRulesPrompt =
    customRules && customRules.length > 0
      ? `\n自定义规则:\n${customRules.map((r) => `- 如果上下文包含"${r.pattern}", 变量路径使用 "${r.targetPath}"`).join('\n')}`
      : '';

  // 合同特殊语义说明
  const contractSemanticGuide =
    templateType === 'contract'
      ? `
【合同特殊语义识别规则】
1. 地址+名称组合模式：
   - "位于____的____公司(以下称为甲方)" → 第一个空白是甲方地址(d.partyA.address)，第二个空白是甲方名称(d.partyA.name)
   - "位于____的____公司(以下称为乙方)" → 第一个空白是乙方地址(d.partyB.address)，第二个空白是乙方名称(d.partyB.name)

2. 项目/合作名称：
   - "就有关____合作过程中" → 项目名称(d.projectName)

3. 金额填写：
   - "支付违约金人民币____万元" → 违约金额(d.penaltyAmount)

4. 签署位置：
   - "甲方：" 后的空白 → 甲方签署名称(d.partyA.signature)
   - "乙方：" 后的空白 → 乙方签署名称(d.partyB.signature)

请根据上下文语义准确判断每个空白的具体含义，不要仅根据位置推断。
`
      : '';

  return `你是一个专业的文档模板化专家。请仔细分析以下文档中的空白填充部分，根据上下文语义为每个空白建议合适的Carbone模板变量。

${skillDescription ? `【AI 指南：文档背景】\n${skillDescription}\n` : ''}

文档类型: ${typeDesc}
${context ? `用户说明: ${context}` : ''}
${customRulesPrompt}
${contractSemanticGuide}

【文档背景内容】
${background}

${skillHints ? `【AI 指南：参数情报（优先参考）】\n如果文档内容符合以下参数描述，请务必映射到对应的参数名：\n${skillHints}\n` : ''}

【需要分析的空白部分】（共${patterns.length}个）
${blankList}

请为每个空白返回JSON格式的建议：
{
  "suggestions": [
    {
      "index": ${startIndex + 1},
      "variablePath": "d.xxx",
      "variableName": "变量中文名称",
      "confidence": 0.85,
      "reason": "基于上下文'...'的语义分析，这是XX字段，用于填写..."
    }
  ]
}

【变量路径规范】
- 合同甲方: d.partyA.name, d.partyA.address, d.partyA.phone, d.partyA.representative
- 合同乙方: d.partyB.name, d.partyB.address, d.partyB.phone, d.partyB.representative
- 项目信息: d.projectName, d.projectDescription
- 日期时间: d.signDate, d.effectiveDate, d.endDate (使用:formatDate(YYYY-MM-DD))
- 金额数值: d.contractAmount, d.penaltyAmount (使用:formatNumber(#,##0.00))

【输出要求】
1. 只返回JSON格式，不要其他解释
2. 每个空白必须有对应的建议
3. reason字段必须说明该空白在文档中的具体用途
4. 根据上下文语义而非仅位置来推断变量含义`;
}
export function parseAIResponseToSuggestions(
  aiResponse: any,
  patterns: Array<{
    text: string;
    context: string;
    position: number;
    type: string;
    beforeBlank?: string;
  }>,
  startIndex: number = 0
): any[] {
  const suggestions: any[] = [];

  if (!aiResponse.suggestions || !Array.isArray(aiResponse.suggestions)) {
    return suggestions;
  }

  for (const aiSuggestion of aiResponse.suggestions) {
    // AI返回的index是全局索引（从startIndex开始），需要转换为批次内的索引
    const globalIndex = aiSuggestion.index - 1; // 转换为0-based
    const patternIndex = globalIndex - startIndex;

    if (patternIndex < 0 || patternIndex >= patterns.length) {
      logger.warn(
        `AI suggestion index ${aiSuggestion.index} out of range for batch (start=${startIndex}, size=${patterns.length})`
      );
      continue;
    }

    const pattern = patterns[patternIndex];
    suggestions.push({
      id: `sugg-${Date.now()}-${globalIndex}`,
      type: 'variable',
      elementPath: `【${pattern.beforeBlank || pattern.context?.slice(0, 10) || ''} _____ ${pattern.context?.slice(-10) || ''}】`,
      suggestedName: aiSuggestion.variablePath,
      originalText: pattern.text,
      confidence: aiSuggestion.confidence || 0.7,
      applied: false,
      context: pattern.context,
      details: {
        formatter: extractFormatter(aiSuggestion.variablePath),
        variableName: aiSuggestion.variableName,
        reason: aiSuggestion.reason,
        significance: aiSuggestion.reason || `文档中的${aiSuggestion.variableName || '填充字段'}`,
      },
    });
  }

  return suggestions;
}
export function buildAIAnalysisPrompt(
  elements: DocumentElement[],
  context?: string,
  manualMarkings?: Record<string, string>,
  markingSummary?: string
): string {
  // 构建文档元素摘要（简化版）
  const elementSummary = elements
    .map((el, idx) => {
      const marking = manualMarkings?.[idx.toString()];
      const markingTag = marking ? ` [用户标记: ${marking}]` : '';

      if (el.type === 'table') {
        const headers = el.tableHeaders?.map((h) => h.text).join(', ') || el.headerRow || '';
        return `${idx + 1}. [TABLE] headers=[${headers}], rows=${el.attributes?.rows || el.dataRows?.length || 0}${markingTag}`;
      } else if (el.type === 'image') {
        return `${idx + 1}. [IMAGE] id="${el.imageId}"${markingTag}`;
      } else {
        const text = (el.text || '').substring(0, 80);
        return `${idx + 1}. [${el.type.toUpperCase()}] ${text}${markingTag}`;
      }
    })
    .join('\n');

  // 如果有手动标记，使用更详细的提示词
  if (manualMarkings && Object.keys(manualMarkings).length > 0) {
    return `用户已经手动标记了以下元素：

${markingSummary || ''}

文档元素列表（每行开头的数字是 elementIndex）：
${elementSummary}

请按两步完成分析：

## 第一步：生成参数对照表
分析文档内容，推断可能的参数路径变体，生成标准化对照表。
例如：
- "执行摘要"、"总结"、"summary" → d.summary
- "分析报告"、"分析"、"analysis" → d.analysis
- "日期"、"时间"、"date" → d.date

## 第二步：使用对照表生成模版配置
根据用户的手动标记和第一步的对照表，生成具体配置。

规则：
1. 用户标记为"param"的元素 → variableMappings，使用对照表中的标准路径
2. 用户标记为"loop"的元素 → tableLoops，生成循环路径和列映射
3. 用户标记为"static"的元素 → staticElements，保留不变
4. 图片类型的元素使用 path 格式：d.images[].url 或 d.steps[].screenshot
5. **分组循环（重要）**：如果标记摘要中有"元素分组（循环）"，表示用户创建了一组元素作为循环体
   - 这组元素应该生成 groupLoops 配置
   - 例如：分组包含 "Step 3: screenshot" 文本 + 图片，表示每个步骤都有截图
   - 应该生成：groupLoops 中包含这组元素，使用 arrayPath 如 d.steps
   - 这样在渲染时，每个步骤都会显示对应的截图
6. **标题保护（重要）**：文档 title/主标题/封面标题 默认必须放进 staticElements，不要同时放进 variableMappings；只有用户明确要求“标题可替换/标题参数化”时，才允许输出标题变量
7. **单独元素替换（重要）**：非表格、非分组循环的单个段落/单元格替换，必须输出到 variableMappings；如果同一个元素里有多个参数，允许输出多条 variableMappings，并且这些记录共享同一个 elementIndex，不要合并丢失

表格循环配置：
- 步骤表格使用 arrayPath: d.steps
- 列映射必须包含 columnIndex，对应表格列的位置（从0开始）
- 列映射示例：columnIndex=0 → d.steps[].step, columnIndex=1 → d.steps[].action
- 循环列要尽量完整覆盖模板行中的字段，不要只给循环开始/结束标记；如果表头或正文里出现“开始/起始/start”“结果/result”“状态/status”“名称/name”等字段，也要补充到 columnMappings 中

分组循环配置：
- 当用户创建分组时，这组元素应该作为循环体重复出现
- 例如：分组索引[7,8]包含 "Step X: screenshot" 文本 + 图片
- 应该生成 groupLoops: [{"groupIndices": [7,8], "arrayPath": "d.steps", "textElement": 7, "imageElement": 8, "reason": "每个步骤显示截图"}]

返回JSON格式：
{
  "parameterMappings": [
    {"patterns": ["可能的路径变体"], "standardPath": "d.xxx", "description": "用途描述"}
  ],
  "templateType": "类型",
  "staticElements": [{"type": "heading", "content": "...", "reason": "..."}],
  "tableLoops": [{"elementIndex": N, "arrayPath": "d.steps", "reason": "...", "columnMappings": [{"columnIndex": 0, "headerName": "Step", "variablePath": "d.steps[].step"}]}],
  "groupLoops": [{"groupIndices": [7,8], "arrayPath": "d.steps", "textElement": 7, "imageElement": 8, "reason": "每个步骤显示截图"}],
  "combinedVariables": [{"stepNumber": N, "textContent": "...", "imageId": "...", "reason": "..."}],
  "variableMappings": [{"elementIndex": N, "path": "d.xxx", "content": "...", "type": "text|image", "reason": "..."}],
  "analysisNotes": ["..."]
}

注意：
- elementIndex 是列表左侧的编号（1-based）
- columnIndex 是表格列的索引（0-based）
- 分组循环优先级高于单独的 combinedVariables，如果用户创建了分组，应该在 groupLoops 中处理
- 不要把 staticElements 中的 title 再重复输出到 variableMappings
- 只返回JSON，不要解释`;
  }

  return `分析以下文档结构，按两步完成：

## 第一步：生成参数对照表
分析文档内容语义，推断参数路径可能的变化形式，生成标准化对照表。
例如文档中有"执行总结"内容，可能对应路径：
- d.executionSummary、d.summaryText、d.executionsummary → 都应该标准化为 d.summary

## 第二步：使用对照表生成模版配置
根据第一步的对照表和文档结构，生成模版配置。

文档元素列表（每行开头的数字是 elementIndex）：
${elementSummary}

规则：
1. "### xxx" 标题、title、主标题、封面标题 → staticElements (保留)，默认不要放进 variableMappings
2. 表格 → tableLoops (循环)，必须包含 elementIndex 和 columnMappings（带 columnIndex）
3. 图片 → variableMappings (type=image)，路径格式如 d.screenshots[].url
4. 含"日志/上下文/总结/分析"的段落 → variableMappings，使用对照表标准路径
5. 单个段落/单元格如果需要替换，必须写入 variableMappings；同一 elementIndex 可以有多条 variableMappings，表示该元素内有多个替换参数
6. 对于步骤/流程/明细类循环，columnMappings 要尽量完整列出正文中的字段；遇到“开始/起始/start”“结果/result”“状态/status”“名称/name”等列时，不要遗漏

返回JSON格式：
{
  "parameterMappings": [
    {"patterns": ["可能的路径变体"], "standardPath": "d.xxx", "description": "用途描述"}
  ],
  "templateType": "类型",
  "staticElements": [],
  "tableLoops": [{"elementIndex": N, "arrayPath": "d.steps", "columnMappings": [{"columnIndex": 0, "headerName": "Step", "variablePath": "d.steps[].step"}]}],
  "combinedVariables": [],
  "variableMappings": [{"elementIndex": N, "path": "d.xxx", "type": "text|image"}],
  "analysisNotes": []
}

注意：
- elementIndex 是列表左侧的编号（1-based）
- columnIndex 是表格列的索引（0-based）
- 图片类型标记为 type: "image"
- 只返回JSON，不要解释`;
}

/**
 * 解析 AI 分析响应
 * 处理AI生成的参数对照表和模版配置
 */
export function parseAIAnalysisResponse(
  response: string,
  elements: DocumentElement[]
): TemplateConfig {
  try {
    // 尝试提取 JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // 1. 提取并应用AI生成的参数对照表
    let pathMappings: PathMappingRule[] = [];
    if (parsed.parameterMappings && Array.isArray(parsed.parameterMappings)) {
      pathMappings = parseAIParameterMappings(parsed.parameterMappings);
      logger.debug(`AI generated ${pathMappings.length} parameter mapping rules`);
    }

    // 2. 合并AI生成的对照表和默认对照表（AI生成的优先）
    const mergedMappings = mergePathMappings(pathMappings, DEFAULT_PATH_MAPPINGS);

    // 3. 使用合并后的对照表规范化配置中的路径
    const staticElements = Array.isArray(parsed.staticElements) ? parsed.staticElements : [];
    const rawVariableMappings = Array.isArray(parsed.variableMappings)
      ? parsed.variableMappings
      : Array.isArray(parsed.mappings)
        ? parsed.mappings
        : [];
    const config: TemplateConfig = {
      templateType: parsed.templateType || '通用文档',
      staticElements,
      tableLoops: validateTableLoops(parsed.tableLoops || [], elements, mergedMappings),
      imageLoops: [],
      groupLoops: validateGroupLoops(parsed.groupLoops || []),
      combinedVariables: validateCombinedVariables(parsed.combinedVariables || [], elements),
      variableMappings: validateVariableMappings(
        rawVariableMappings,
        elements,
        mergedMappings,
        staticElements
      ),
      analysisNotes: parsed.analysisNotes || [],
    };

    // 保存参数对照表到配置中（供后续使用）
    (config as any).parameterMappings = mergedMappings;

    return config;
  } catch (error) {
    logger.error(
      `Failed to parse AI response: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * 解析AI生成的参数对照表
 */
export function parseAIParameterMappings(aiMappings: any[]): PathMappingRule[] {
  const mappings: PathMappingRule[] = [];

  for (const mapping of aiMappings) {
    if (mapping.patterns && Array.isArray(mapping.patterns) && mapping.standardPath) {
      mappings.push({
        patterns: mapping.patterns,
        standardPath: mapping.standardPath,
        description: mapping.description || '',
      });
    }
  }

  return mappings;
}

/**
 * 合并AI生成的参数对照表和默认对照表
 * AI生成的规则优先（排在前面）
 */
export function mergePathMappings(
  aiMappings: PathMappingRule[],
  defaultMappings: PathMappingRule[]
): PathMappingRule[] {
  const merged: PathMappingRule[] = [...aiMappings];

  // 添加默认映射，但跳过已被AI覆盖的标准路径
  const aiStandardPaths = new Set(aiMappings.map((m) => m.standardPath));

  for (const defaultMapping of defaultMappings) {
    if (!aiStandardPaths.has(defaultMapping.standardPath)) {
      merged.push(defaultMapping);
    }
  }

  return merged;
}
