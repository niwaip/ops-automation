import {
  calculateContextOverlap,
  extractBlankPatterns,
  inferVariablePath,
} from './blank-extractor';
import { extractFormatter } from './skill-parameter.helper';
import type {
  AIIdentifyResponse,
  DocumentUnderstanding,
  ProcessingStage,
  SectionParameterization,
} from './types';

type BlankCandidate = {
  text: string;
  beforeBlank: string;
  context: string;
  type: string;
  significance: string;
};

type QuickUnderlineInfo = {
  text: string;
  underlineType?: string;
  paragraphText: string;
  paragraphIndex?: number;
  position: { start: number; end: number };
};

type QuickParameterItem = {
  index: number;
  text: string;
  context: string;
  label: string;
  paragraph: string;
};

const CORE_KEYWORDS = [
  '甲方',
  '乙方',
  '地址',
  '名称',
  '签字',
  '盖章',
  '日期',
  '年份',
  '附件',
  '保密期限',
];

const PARAMETERIZATION_FALLBACK_CONFIDENCE = 0.5;

function checkNeedsParameterization(content: string): boolean {
  const patterns = [
    /[：:]\s+/,
    /[_＿]{2,}/,
    /[ 　]{4,}/,
    /[（【\(][　 ]*[）】\)]/,
    /[\s　]+年[\s　]+月[\s　]+日/,
  ];
  return patterns.some((pattern) => pattern.test(content));
}

export function buildDocumentUnderstandingPrompt(
  documentContent: string,
  templateType: string,
  context?: string
): string {
  return `你是一个专业的文档分析专家。请仔细阅读以下文档内容，分析并理解文档的整体结构、主题、关键实体和数据需求。

文档类型提示: ${templateType}
${context ? `用户说明: ${context}` : ''}

【文档内容】
${documentContent.substring(0, Math.min(3000, documentContent.length))}
${documentContent.length > 3000 ? '\n...(文档较长，已截取前3000字符)' : ''}

请返回JSON格式的分析结果：
{
  "documentType": "合同/协议/报告/证书等",
  "mainPurpose": "文档的主要用途和目的",
  "keyEntities": ["甲方", "乙方", "项目名称", "日期", "地点"],
  "dataSchema": "描述该文档建议的数据模型结构，例如：{ partyA: { name, address }, project: { name, duration } }",
  "sections": [
    {
      "name": "第一条 协议双方",
      "content": "该章节的主要内容摘要",
      "purpose": "该章节在文档中的作用",
      "needsParameterization": true,
      "estimatedParams": ["甲方名称", "甲方地址"]
    }
  ],
  "parties": [
    {
      "role": "甲方",
      "fieldsNeeded": ["名称", "地址", "代表人", "联系方式"]
    }
  ]
}

只返回JSON格式，不要其他解释。`;
}

export function normalizeDocumentUnderstandingResponse(
  aiResponse: any,
  templateType: string
): DocumentUnderstanding | null {
  if (!aiResponse?.documentType) {
    return null;
  }

  return {
    documentType: aiResponse.documentType || templateType,
    mainPurpose: aiResponse.mainPurpose || '文档模板化处理',
    keyEntities: aiResponse.keyEntities || [],
    dataSchema: aiResponse.dataSchema,
    sections: aiResponse.sections || [],
    parties: aiResponse.parties || [],
  };
}

export function buildBasicDocumentUnderstanding(
  content: string,
  templateType: string
): DocumentUnderstanding {
  const chapterStructure = extractBlankPatterns(content, templateType);
  const sections = chapterStructure.map((chapter) => ({
    name: chapter.chapter || '正文',
    content: content.substring(chapter.position, Math.min(content.length, chapter.position + 200)),
    purpose: '文档章节内容',
    needsParameterization: checkNeedsParameterization(content.substring(chapter.position)),
    estimatedParams: [],
  }));

  const parties = ['甲方', '乙方', '委托方', '受托方']
    .filter((keyword) => content.includes(keyword))
    .map((role) => ({
      role,
      fieldsNeeded: ['名称', '地址'],
    }));

  return {
    documentType: templateType,
    mainPurpose: '文档模板化处理',
    sections,
    parties,
  };
}

export function buildSectionParameterizationPrompt(
  sectionName: string,
  sectionContent: string,
  documentUnderstanding: DocumentUnderstanding,
  preExtractedBlanks: BlankCandidate[]
): string {
  const relevantParties = documentUnderstanding.parties;
  const keyEntitiesInfo = documentUnderstanding.keyEntities
    ? `【关键实体】: ${documentUnderstanding.keyEntities.join(', ')}`
    : '';
  const dataSchemaInfo = documentUnderstanding.dataSchema
    ? `【建议数据架构】: ${documentUnderstanding.dataSchema}`
    : '';

  const preBlanksList =
    preExtractedBlanks.length > 0
      ? `\n【已识别的空白填充位置】（共${preExtractedBlanks.length}个，每个位置都需要填写内容）\n${preExtractedBlanks
          .map(
            (b, i) =>
              `[${i + 1}] 空白内容: "${b.text}"\n    前文: "${b.beforeBlank}"\n    上下文片段: "${b.context}"\n    类型: ${b.type}\n    建议意义: "${b.significance}"`
          )
          .join('\n')}\n\n请根据上下文为每个空白位置生成合适的变量名，变量名应反映其业务含义。`
      : '';

  return `你是一个专业的文档模板化专家。请分析以下章节内容，为每个空白填充位置生成语义化变量。

【核心原则】
- 只有”下划线+空格”才是需要填写内容的参数位置
- 变量名应反映空白所在位置的标签文字（如空白前是”甲方”则变量名应包含partyA）
- context字段必须包含空白内容本身，方便后续精确定位和替换

文档类型: ${documentUnderstanding.documentType}
章节名称: ${sectionName}
章节用途: ${documentUnderstanding.mainPurpose}
${keyEntitiesInfo}
${dataSchemaInfo}

【当事人信息】
${relevantParties.map((p) => `${p.role} 需要字段: ${p.fieldsNeeded.join(', ')}`).join('\n')}

【已识别的空白位置】
${preBlanksList || '无空白位置'}

【章节内容】
${sectionContent}

请返回JSON格式的分析结果：
{
  "sectionName": "${sectionName}",
  "suggestions": [
    {
      "originalText": "空白内容本身（如______）",
      "variablePath": "d.partyA.name",
      "variableName": "甲方名称",
      "fieldType": "text/date/number/amount/enum",
      "significance": "根据上下文推断的业务意义",
      "context": "前文标签 + 空白内容 + 后文（如：甲方：______（签章））",
      "confidence": 0.95
    }
  ]
}

【重要提示】
1. originalText必须是空白内容本身（下划线或空格），不包含标签文字
2. context格式：【标签】空白内容【后文】，用于精确定位
3. 为每个空白位置生成合适的变量名

只返回JSON格式，不要其他解释。`;
}

export function normalizeSectionAiSuggestions(
  aiResponse: any,
  sectionContent: string
): SectionParameterization['suggestions'] | null {
  if (!Array.isArray(aiResponse?.suggestions)) {
    return null;
  }

  return aiResponse.suggestions.map((suggestion: any) => ({
    originalText: suggestion.originalText || '',
    variablePath: suggestion.variablePath || 'd.unknown',
    variableName: suggestion.variableName || '未知字段',
    fieldType: suggestion.fieldType || 'text',
    significance: suggestion.significance || '文档填充字段',
    context: suggestion.context || sectionContent.substring(0, 50),
    confidence: suggestion.confidence || 0.7,
  }));
}

export function buildFallbackSectionSuggestions(
  preExtractedBlanks: BlankCandidate[],
  templateType: string
): SectionParameterization['suggestions'] {
  return preExtractedBlanks.map((blank) => ({
    originalText: blank.text,
    variablePath: inferVariablePath(blank.beforeBlank, blank.type, templateType),
    variableName: blank.beforeBlank || '未知字段',
    significance: blank.significance,
    context: blank.context,
    confidence: PARAMETERIZATION_FALLBACK_CONFIDENCE,
  }));
}

export function mergeMissingBlankSuggestions(
  aiSuggestions: SectionParameterization['suggestions'],
  preExtractedBlanks: BlankCandidate[],
  templateType: string
): SectionParameterization['suggestions'] {
  const nextSuggestions = [...aiSuggestions];

  const missingBlanks = preExtractedBlanks.filter((pre) => {
    const inferredPath = inferVariablePath(pre.beforeBlank, pre.type, templateType);
    return !nextSuggestions.some((aiSuggestion) => {
      if (aiSuggestion.variablePath === inferredPath) {
        return true;
      }

      const preKeyword = CORE_KEYWORDS.find((keyword) => pre.beforeBlank.includes(keyword));
      const aiKeyword = CORE_KEYWORDS.find(
        (keyword) =>
          aiSuggestion.variablePath.includes(keyword) || aiSuggestion.variableName?.includes(keyword)
      );

      if (preKeyword && aiKeyword && preKeyword === aiKeyword) {
        const contextOverlap = calculateContextOverlap(pre.context, aiSuggestion.context || '');
        return contextOverlap > 0.5;
      }

      return false;
    });
  });

  for (const blank of missingBlanks) {
    nextSuggestions.push({
      originalText: blank.text,
      variablePath: inferVariablePath(blank.beforeBlank, blank.type, templateType),
      variableName: blank.beforeBlank || '未知字段',
      significance: blank.significance,
      context: blank.context,
      confidence: 0.6,
    });
  }

  return nextSuggestions;
}

export function buildIntegrationPrompt(
  documentUnderstanding: DocumentUnderstanding,
  allSuggestions: SectionParameterization['suggestions'],
  fullContent: string
): string {
  return `你是一个专业的文档模板化审核专家。请审核以下识别结果，进行整合和确认。

文档类型: ${documentUnderstanding.documentType}
文档用途: ${documentUnderstanding.mainPurpose}

【已识别的所有参数】（共${allSuggestions.length}个，可能存在重复或冲突）
${JSON.stringify(allSuggestions, null, 2)}

【文档背景内容】
${fullContent.substring(0, Math.min(1000, fullContent.length))}

请返回JSON格式的最终确认结果：
{
  "confirmedSuggestions": [
    {
      "originalText": "原文内容",
      "variablePath": "最终确认的变量路径 (使用d.前缀，点号分隔)",
      "variableName": "变量名称 (简短中文)",
      "fieldType": "text/date/number/amount/enum",
      "significance": "【用途说明】: 该参数的详细用途；【填写示例】: 示例值；【校验规则】: 格式或逻辑要求",
      "context": "原文上下文 (格式：【前文 _____ 后文】)",
      "confidence": 0.95,
      "chapter": "所在章节名称"
    }
  ],
  "removedDuplicates": ["说明哪些参数被合并或删除及其原因"]
}

只返回JSON格式，不要其他解释。`;
}

export function formatIntegratedSuggestions(aiResponse: any): any[] | null {
  if (!Array.isArray(aiResponse?.confirmedSuggestions)) {
    return null;
  }

  return aiResponse.confirmedSuggestions.map((suggestion: any, idx: number) => ({
    id: `sugg-${Date.now()}-${idx}`,
    type: 'variable',
    elementPath: suggestion.context || `【${suggestion.originalText}】`,
    suggestedName: suggestion.variablePath,
    originalText: suggestion.originalText,
    confidence: suggestion.confidence || 0.8,
    applied: false,
    context: suggestion.context,
    details: {
      chapter: suggestion.chapter || '正文',
      significance: suggestion.significance,
      usage: suggestion.usage,
      variableName: suggestion.variableName,
      fieldType: suggestion.fieldType || 'text',
      formatter: extractFormatter(suggestion.variablePath),
    },
  }));
}

export function buildQuickNamingParameterList(
  underlineInfo: QuickUnderlineInfo[]
): QuickParameterItem[] {
  return underlineInfo.map((info, idx) => {
    const paragraphText = info.paragraphText;
    const start = Math.max(0, info.position.start - 10);
    const end = Math.min(paragraphText.length, info.position.end + 10);
    const context = paragraphText.substring(start, end);
    const beforeBlank = paragraphText.substring(0, info.position.start);
    const labelMatch = beforeBlank.match(/([^\s：:]+)[：:]?\s*$/);

    return {
      index: idx + 1,
      text: info.text,
      context,
      label: labelMatch ? labelMatch[1].trim() : '',
      paragraph: `${paragraphText.substring(0, 50)}...`,
    };
  });
}

export function buildQuickNamingPrompt(
  parameterList: QuickParameterItem[],
  templateType: string
): string {
  return `你是一个专业的合同模板参数命名专家。请根据以下参数位置的上下文信息，为每个参数生成合适的变量名称和说明。

模板类型: ${templateType}

【参数位置列表】
${parameterList
  .map(
    (parameter) => `
#${parameter.index}
- 上下文: "${parameter.context}"
- 前置标签: "${parameter.label}"
- 段落: "${parameter.paragraph}"
`
  )
  .join('\n')}

请返回JSON数组，为每个参数生成：
[
  {
    "index": 1,
    "variablePath": "{d.partyA.name}",
    "variableName": "partyA_name",
    "significance": "甲方公司名称",
    "fieldType": "text",
    "chapter": "第一章 协议双方",
    "confidence": 0.95
  }
]

只返回JSON数组，不要其他解释。`;
}

export function resolveQuickNamingResults(aiResponseObj: any, expectedCount: number): any[] {
  let namingResults: any[] = aiResponseObj?.suggestions || [];

  if (namingResults.length === 0 && aiResponseObj?.response) {
    const arrayMatch = String(aiResponseObj.response).match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      namingResults = JSON.parse(arrayMatch[0]);
    }
  }

  if (namingResults.length < expectedCount) {
    for (let i = namingResults.length; i < expectedCount; i += 1) {
      namingResults.push({
        index: i + 1,
        variablePath: `{d.field_${i + 1}}`,
        variableName: `field_${i + 1}`,
        significance: '待填写内容',
        fieldType: 'text',
        confidence: 0.7,
      });
    }
  }

  return namingResults;
}

export function mapQuickNamingSuggestions(
  namingResults: any[],
  underlineInfo: QuickUnderlineInfo[],
  parameterList: QuickParameterItem[]
): any[] {
  return namingResults.map((result, idx) => {
    const info = underlineInfo[idx];
    const paragraphText = info?.paragraphText || '';
    const positionStart = info?.position?.start || 0;
    const positionEnd = info?.position?.end || 0;
    const context = paragraphText.substring(
      Math.max(0, positionStart - 15),
      Math.min(paragraphText.length, positionEnd + 15)
    );

    return {
      id: `sugg-${Date.now()}-${idx}`,
      type: 'variable',
      elementPath: `【${context}】`,
      suggestedName: result.variablePath || `{d.field_${idx + 1}}`,
      originalText: underlineInfo[idx]?.text || '',
      confidence: result.confidence || 0.8,
      applied: false,
      context,
      underlineInfo: {
        paragraphIndex: info?.paragraphIndex,
        position: info?.position,
        paragraphText: info?.paragraphText,
        underlineType: info?.underlineType,
      },
      details: {
        chapter: result.chapter || '正文',
        significance: result.significance || '文档填充字段',
        variableName: result.variableName,
        fieldType: result.fieldType || 'text',
        displayPosition: context,
        beforeBlank: parameterList[idx]?.label || '',
        afterBlank: paragraphText.substring(
          positionEnd,
          Math.min(paragraphText.length, positionEnd + 10)
        ),
        formatter: extractFormatter(result.variablePath),
      },
    };
  });
}

export function buildFallbackQuickSuggestions(underlineInfo: QuickUnderlineInfo[]): any[] {
  return underlineInfo.map((info, idx) => ({
    id: `sugg-${Date.now()}-${idx}`,
    type: 'variable',
    elementPath: `【${info.paragraphText.substring(0, 30)}...】`,
    suggestedName: `{d.field_${idx + 1}}`,
    originalText: info.text,
    confidence: 0.7,
    applied: false,
    context: info.paragraphText.substring(0, 50),
    details: {
      chapter: '正文',
      significance: '待填写内容',
      variableName: `field_${idx + 1}`,
      fieldType: 'text',
    },
  }));
}

export function buildQuickIdentifyResponse(input: {
  templateType: string;
  suggestionRecords: any[];
  aiOrchestratorUrl: string;
  usedAI: boolean;
  analysisNotes: string[];
  userIntent: string;
  flowType?: 'quick' | 'multi-stage';
}): AIIdentifyResponse {
  const { templateType, suggestionRecords, aiOrchestratorUrl, usedAI, analysisNotes, userIntent, flowType } =
    input;

  return {
    templateConfig: {
      templateType,
      staticElements: [],
      tableLoops: [],
      imageLoops: [],
      combinedVariables: [],
      variableMappings: [],
      analysisNotes,
    },
    suggestions: suggestionRecords.map((suggestion, idx) => ({
      path: suggestion.suggestedName,
      sampleValue: suggestion.originalText,
      index: idx,
      type: 'text',
      reason: suggestion.details?.significance,
      fieldType: suggestion.details?.fieldType,
    })),
    rawSuggestions: suggestionRecords,
    loops: [],
    images: [],
    combinedVariables: [],
    analyzedAt: new Date().toISOString(),
    documentStats: {
      totalElements: suggestionRecords.length,
      tables: 0,
      images: 0,
      stepScreenshots: 0,
      potentialLoops: 0,
    },
    contextAnalysis: {
      detectedTemplateType: templateType,
      userIntent,
      usedAI,
      aiServiceUrl: aiOrchestratorUrl,
      flowType,
    },
  };
}

export function buildQuickProgressInfo(
  stage: ProcessingStage,
  stageName: string,
  progress: number,
  message: string
) {
  return { stage, stageName, progress, message };
}
