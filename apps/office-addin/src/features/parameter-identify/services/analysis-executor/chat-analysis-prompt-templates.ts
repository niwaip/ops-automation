interface GlobalPromptInput {
  host: string;
  documentType: string;
  context?: string;
  visibleSheetSummary: string;
  businessExcerpt: string;
}

interface GeneralPromptInput {
  host: string;
  documentType: string;
  templateType: string;
  context?: string;
  compactDocumentContext: string;
  serializedContent: string;
}

export function buildGlobalUnderstandingPromptTemplate(input: GlobalPromptInput): string {
  return `【系统提示词】
你是文档理解助手。请根据提供的文档内容，输出结构化的文档理解摘要。

请注意：
1. 仅基于提供的内容进行理解，不要假设缺失内容。
2. 强制按照下方要求的 Markdown 列表格式输出，不要输出 JSON 或代码块。
3. 输出应尽量抽象化和通用化，不要把文档中的具体实例值直接写进理解结果（如张三、2023-01-01等，应改写为“姓名”、“日期”）。

输出格式要求：
## 文档类型与用途
- 简述文档的业务类型和主要使用场景。

## 核心业务实体
- 列出 3-5 个核心实体（如：基本信息、商品明细、付款条款）。

## Sheet 职责划分 (如果适用)
- 简述各 sheet 的数据承载作用。

【用户提示词】
宿主: ${input.host}
文档类型: ${input.documentType}
文档线索: ${input.context || '无'}

可见 sheet 列表:
${input.visibleSheetSummary}

文档内容摘录:
${input.businessExcerpt || '未提取到有效业务摘录'}
`;
}

export function buildGeneralPromptTemplate(input: GeneralPromptInput): string {
  return `你是模板参数分析器。请输出严格 JSON，包含 suggestions 数组。

【任务上下文】
宿主: ${input.host}
模板类型: ${input.templateType}
分析说明: ${input.context || '无'}

【Office 结构摘要】
${input.compactDocumentContext}

【内容摘录】
${input.serializedContent}

请返回以下 JSON 结构示例：
{
  "suggestions": [
    {
      "id": "param_1",
      "type": "variable",
      "elementPath": "位置描述",
      "suggestedName": "d.fieldName",
      "originalText": "原始值",
      "confidence": 0.9,
      "details": {
        "description": "参数描述",
        "fieldType": "text",
        "chapter": "所属章节"
      }
    }
  ]
}`;
}
