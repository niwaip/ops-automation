import { v4 as uuidv4 } from 'uuid';
import {
  buildSkillTableLoops,
  normalizeSkillParameterPath,
  isPlaceholderSkillParameterPath,
  inferFieldType,
  buildSkillExampleValue,
  resolveSuggestionGroupMeta,
  extractLoopColumnMappings,
  getDefaultFormatter,
  generateExtractionHint,
  getValidationRules,
  inferParameterUsage,
  generateTemplateDescription,
  buildDataExampleJson,
  buildSkillCarboneSyntax,
  getSearchKeywords,
  getExtractionPattern,
  buildCompleteAIInstructions,
  buildSkillGuideMarkdown,
  sanitizeSkillDataExample
} from './parameter.helper';

import {
  stringifyAiResponse,
  normalizeJsonLikeText,
  tryNormalizeGeneratedParameters,
  extractJsonCandidate,
  tryParseJsonValue
} from './ai-json-normalizer';

/**
 * 生成 AI 技能指南
 */
export async function generateAISkillGuide(
  suggestions: any[],
  templateConfig: any,
  templateType: string,
  documentDescription?: string
): Promise<any> {
  const appliedSuggestions = Array.isArray(suggestions)
    ? suggestions.filter((s) => s?.applied)
    : [];
  const effectiveTableLoops = buildSkillTableLoops(appliedSuggestions, templateConfig);

  const parameterMap = new Map<string, any>();
  const registerParameter = (parameter: any) => {
    const cleanName = normalizeSkillParameterPath(parameter?.name || '');
    if (!cleanName || isPlaceholderSkillParameterPath(cleanName)) {
      return;
    }

    const normalizedParameter = {
      ...parameter,
      name: cleanName,
      displayName: parameter?.displayName || cleanName,
    };

    if (!normalizedParameter.groupLabel) {
      delete normalizedParameter.groupLabel;
    }
    if (!normalizedParameter.sheetName) {
      delete normalizedParameter.sheetName;
    }

    const existing = parameterMap.get(cleanName);
    if (!existing) {
      parameterMap.set(cleanName, normalizedParameter);
      return;
    }

    parameterMap.set(cleanName, {
      ...existing,
      ...normalizedParameter,
      usage: normalizedParameter.usage || existing.usage,
      formatter: normalizedParameter.formatter || existing.formatter,
      extractionHint: normalizedParameter.extractionHint || existing.extractionHint,
      example: normalizedParameter.example || existing.example,
      validation: normalizedParameter.validation || existing.validation,
      groupLabel: normalizedParameter.groupLabel || existing.groupLabel,
      sheetName: normalizedParameter.sheetName || existing.sheetName,
    });
  };

  for (const suggestion of appliedSuggestions) {
    const variableName = suggestion?.suggestedName || suggestion?.details?.variableName || '';
    const fieldType = suggestion?.details?.fieldType || inferFieldType(variableName, suggestion?.originalText || '');
    const exampleValue = buildSkillExampleValue(suggestion?.originalText, fieldType, variableName);
    const groupMeta = resolveSuggestionGroupMeta(suggestion);

    if (suggestion?.type === 'loop' || fieldType === 'loop') {
      const arrayPath = suggestion?.details?.arrayPath || variableName;
      const loopColumns = extractLoopColumnMappings(suggestion, effectiveTableLoops, arrayPath);

      if (loopColumns.length > 0) {
        const tableName = suggestion?.details?.tableName || suggestion?.originalText || '明细表';
        for (const column of loopColumns) {
          const cleanName = normalizeSkillParameterPath(column.variablePath || '');
          if (!cleanName || isPlaceholderSkillParameterPath(cleanName)) {
            continue;
          }
          const columnFieldType = inferFieldType(column.headerName || cleanName, column.sampleValue || '');
          const columnExample = buildSkillExampleValue(column.sampleValue, columnFieldType, cleanName);

          registerParameter({
            name: cleanName,
            originalText: column.sampleValue || suggestion?.originalText || '',
            displayName: `${tableName}.${column.headerName || cleanName}`,
            groupLabel: groupMeta.groupLabel,
            sheetName: groupMeta.sheetName,
            usage:
              suggestion?.details?.significance
                ? `${suggestion.details.significance} 其中字段“${column.headerName || cleanName}”用于表格列填充`
                : `用于填写 ${tableName} 中“${column.headerName || cleanName}”这一列的值`,
            dataType: columnFieldType,
            formatter: getDefaultFormatter(columnFieldType),
            extractionHint: generateExtractionHint(
              column.headerName || cleanName,
              columnFieldType,
              column.sampleValue || suggestion?.originalText || '',
              templateType
            ),
            example: columnExample,
            validation: getValidationRules(columnFieldType, cleanName),
            required: true,
          });
        }
        continue;
      }
    }

    registerParameter({
      name: variableName,
      originalText: suggestion?.originalText,
      displayName: suggestion?.details?.variableName || normalizeSkillParameterPath(variableName),
      groupLabel: groupMeta.groupLabel,
      sheetName: groupMeta.sheetName,
      usage:
        suggestion?.details?.reason ||
        suggestion?.details?.significance ||
        inferParameterUsage(normalizeSkillParameterPath(variableName), fieldType, templateType),
      dataType: fieldType,
      formatter: suggestion?.details?.formatter || getDefaultFormatter(fieldType),
      extractionHint: generateExtractionHint(
        normalizeSkillParameterPath(variableName),
        fieldType,
        suggestion?.originalText || '',
        templateType
      ),
      example: exampleValue,
      validation: getValidationRules(fieldType, normalizeSkillParameterPath(variableName)),
      required: true,
    });
  }

  const parameters = Array.from(parameterMap.values());

  // 根据模板类型生成特定的AI指导
  const templateDescription = generateTemplateDescription(templateType, documentDescription, parameters);

  // 构建数据示例JSON（完整可用的数据结构）
  const dataExampleJson = buildDataExampleJson(parameters, effectiveTableLoops);

  // 构建完整的skill结构
  const skill = {
    id: uuidv4(),
    version: '1.0',
    templateType,

    // 模板描述（是什么，用途）
    templateDescription,

    // 参数列表（包含用途和提取指导）
    parameters,

    // 参数解析指导（如何从内容/文件中解析参数）
    parsingGuide: {
      overview: `本模板共有 ${parameters.length} 个参数需要填充。AI需要从用户提供的内容或文件中提取以下参数：`,
      extractionSteps: [
        '1. 分析用户提供的原始内容/文件',
        '2. 根据参数用途识别对应的内容段落',
        '3. 提取关键信息并映射到对应参数',
        '4. 应用格式化器处理特殊类型（日期、金额等）',
        '5. 验证提取结果是否符合参数要求',
      ],
      extractionRules: parameters.map((p) => ({
        parameter: p.name,
        searchKeywords: getSearchKeywords(p.name, p.dataType),
        extractionPattern: getExtractionPattern(p.dataType),
        fallbackStrategy: p.dataType === 'date' ? '使用当前日期' : '标记为需要用户提供',
      })),
    },

    // 数据解析指导
    dataParsing: {
      sourceType: 'json',
      mappingHints: parameters.map((p) => ({
        parameter: p.name,
        path: buildSkillCarboneSyntax(p.name, p.dataType),
        description: p.usage,
        example: p.example,
      })),
    },

    // 完整的数据示例JSON（可直接用于渲染模板）
    dataExampleJson,

    // 特殊处理规则
    specialRules: {
      dateFormat: 'YYYY-MM-DD',
      amountFormat: '保留两位小数，使用逗号分隔千位',
      tableLoops: effectiveTableLoops,
    },

    // 验证规则
    validation: {
      requiredFields: parameters.filter((p) => p.required).map((p) => p.name),
      preConditions: [
        '确保数据源包含所有必填字段',
        '检查日期格式是否正确',
        '验证金额字段为数值类型',
      ],
      postConditions: [
        '生成文档后检查变量是否正确填充',
        '确认无遗漏的下划线或空白',
      ],
    },

    // AI使用提示（完整指导）
    aiInstructions: buildCompleteAIInstructions(templateType, parameters, documentDescription),

    // 完整的Markdown格式Skill指南（自包含、可独立阅读）
    skillGuideMarkdown: buildSkillGuideMarkdown(templateType, templateDescription, parameters, dataExampleJson),

    createdAt: new Date().toISOString(),
  };

  return skill;
}

/**
 * 基于描述生成参数
 */
export async function generateParametersFromDescription(
  description: string,
  skill: any,
  callAIService: (prompt: string) => Promise<any>
): Promise<{
  success: boolean;
  generatedData?: any;
  error?: string;
  debugInfo?: {
    rawAiResponse?: string;
    cleanedAiResponse?: string;
    extractedJson?: string;
    parseError?: string;
    upstreamError?: string;
  };
}> {
  const sanitizedParameters = Array.isArray(skill.parameters)
    ? skill.parameters.filter((p: any) => !isPlaceholderSkillParameterPath(p?.name || ''))
    : [];
  const sanitizedDataExampleJson = sanitizeSkillDataExample(skill.dataExampleJson || {});
  const templateType = typeof skill.templateType === 'string' && skill.templateType.trim()
    ? skill.templateType
    : 'custom';
  const templateDescription = typeof skill.templateDescription === 'string'
    ? skill.templateDescription
    : '';

  // 获取dataExampleJson作为输出格式参考
  const dataExampleJson = sanitizedDataExampleJson;
  const dataExampleStr = JSON.stringify(dataExampleJson, null, 2);

  // Skill Guide Markdown作为参数定义参考
  const skillGuideMarkdown = sanitizedParameters.length > 0
    ? buildSkillGuideMarkdown(templateType, templateDescription, sanitizedParameters, dataExampleStr)
    : (skill.skillGuideMarkdown || '');

  // 如果Skill Guide不存在，尝试从parameters构建简要指南（后备方案）
  let fallbackGuide = '';
  if (!skillGuideMarkdown) {
    const paramList = sanitizedParameters.map((p: any) => {
      return `- ${p.name}: ${p.usage || '需要填写'} (示例: ${p.example || '无'})`;
    }).join('\n');
    fallbackGuide = `## 参数列表\n${paramList}`;
  }

  // 构建清晰的提示词，明确输出格式
  const prompt = `你是一个文档数据生成助手。请根据用户描述，生成用于填充模板的JSON数据。

## 重要说明：JSON数据格式
模板使用Carbone引擎，变量语法是 \`{d.xxx}\`，这是模板语法，不是JSON语法。
你输出的JSON数据中，键名不应该包含 \`{d.\` 或 \`}\` 这些符号。

正确的JSON格式示例：
{
  "partyA": { "name": "公司名称", "address": "地址" },
  "partyB": { "name": "公司名称", "address": "地址" },
  "project": { "name": "项目名称" },
  "contract": { "sign_date_year": "2026", "sign_date_month": "04" }
}

错误格式（不要这样写）：
{
  "{d": { "partyA": { "name}": "公司名称" } }  // 这是错误的！
}

## 参考数据结构（你的输出必须符合这个结构）
${dataExampleStr}

## 参数定义参考
${skillGuideMarkdown || fallbackGuide}

## 用户需求描述
${description}

---
请根据以上信息生成JSON数据。要求：
1. 输出结构必须与"参考数据结构"完全一致
2. 键名不要包含 \`{d.\` 或 \`}\`，使用纯字段名如 partyA、name、address
3. 日期格式 YYYY-MM-DD，今天是 ${new Date().toISOString().split('T')[0]}
4. 优先使用用户描述、参数示例值、参考数据结构中的真实业务值；只有确实缺失时，才补充合理的业务默认值
5. 不要生成“示例值”“测试数据”“xxx公司”这类空泛占位内容，尽量保持公司名、项目名、物料编码、金额、日期等值贴近参考示例
6. 如果参考数据结构里存在数组/循环字段，除非用户明确要求仅 1 条，否则至少生成 2 条数据，并让不同条目在编号、名称、编码、数量、金额等关键字段上有合理差异
7. 只返回JSON对象，不要解释文字，不要markdown代码块`;

  try {
    const response = await callAIService(prompt);

    // 兼容可能的回调响应格式
    const hasSuccessFlag = response && typeof response === 'object' && 'success' in response;
    const isSuccess = hasSuccessFlag ? response.success : true;
    const rawResponse = (response && typeof response === 'object' && 'response' in response)
      ? response.response
      : response;

    if (isSuccess === false) {
      const upstreamError = String(response?.error || 'AI service returned unsuccessful response');
      return {
        success: false,
        error: `Failed to generate parameters: ${upstreamError}`,
        debugInfo: {
          rawAiResponse: stringifyAiResponse(rawResponse).slice(0, 4000),
          cleanedAiResponse: normalizeJsonLikeText(stringifyAiResponse(rawResponse)).slice(0, 4000),
          upstreamError,
        },
      };
    }

    const directObject = tryNormalizeGeneratedParameters(rawResponse);
    if (directObject !== undefined) {
      return {
        success: true,
        generatedData: directObject,
        debugInfo: {
          rawAiResponse: stringifyAiResponse(rawResponse).slice(0, 4000),
          cleanedAiResponse: stringifyAiResponse(rawResponse).slice(0, 4000),
        },
      };
    }

    const rawContent = stringifyAiResponse(rawResponse);
    const content = normalizeJsonLikeText(rawContent);

    const debugInfo = {
      rawAiResponse: rawContent.slice(0, 4000),
      cleanedAiResponse: content.slice(0, 4000),
      upstreamError: (response && typeof response === 'object' && 'error' in response) ? String(response.error) : undefined,
    };

    if (!content.trim()) {
      const emptyResponseError = (response && typeof response === 'object' && 'error' in response && response.error)
        ? `AI returned empty response: ${String(response.error)}`
        : 'AI returned empty response';
      return {
        success: false,
        error: `Failed to generate parameters: ${emptyResponseError}`,
        debugInfo,
      };
    }

    // 直接解析 JSON 对象
    try {
      const generatedData = JSON.parse(content);
      return {
        success: true,
        generatedData,
        debugInfo,
      };
    } catch (parseError) {
      // 尝试提取首个平衡的 JSON 对象（后备方案）
      const extractedObject = extractJsonCandidate(rawContent);
      if (extractedObject) {
        try {
          const extractedData = JSON.parse(normalizeJsonLikeText(extractedObject));
          return {
            success: true,
            generatedData: extractedData,
            debugInfo: {
              ...debugInfo,
              extractedJson: extractedObject.slice(0, 4000),
            },
          };
        } catch (e) {
          return {
            success: false,
            error: 'Failed to parse AI generated parameters',
            debugInfo: {
              ...debugInfo,
              extractedJson: extractedObject.slice(0, 4000),
              parseError: String(e),
            },
          };
        }
      }

      return {
        success: false,
        error: 'Failed to parse AI generated parameters',
        debugInfo: {
          ...debugInfo,
          parseError: String(parseError),
        },
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to generate parameters: ${error.message}`,
    };
  }
}
