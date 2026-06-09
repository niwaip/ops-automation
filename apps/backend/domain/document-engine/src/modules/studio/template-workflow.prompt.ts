export interface WorkflowUnderstandingPromptInput {
  documentType: string;
  sourceLanguage: string;
  targetLanguages: string[];
  sampleFileName: string;
  fallbackSectionHints: string[];
  fallbackLayoutFeatures: string[];
  templateExcerpt: string;
  sampleText: string;
}

export function buildWorkflowUnderstandingPromptText(input: WorkflowUnderstandingPromptInput): string {
  const targetLanguageText = input.targetLanguages.length > 0
    ? input.targetLanguages.join(', ')
    : 'single_language';

  return `【系统提示词】
你是文档理解助手。请根据提供的 Word 文档内容，输出结构化的文档理解摘要。

请注意：
1. 仅基于提供的内容进行理解，不要假设缺失内容。
2. 强制按照下方要求的 Markdown 列表格式输出，不要输出 JSON 或代码块。
3. 样本文档只用于帮助理解文档内容与结构，不要把样本中的具体公司名、金额、日期、账号、地址等实例值直接写进理解结果，应改写为“合同主体”“金额条款”“日期信息”“地址信息”等通用描述。
4. 只需要识别 Word 文档的主要内容，不要提取参数、字段名、变量路径、候选项，也不要讨论参数命名。
5. 摘要必须简明扼要，避免过长。

输出格式要求：
## 文档类型与用途
- 简述这是一类什么 Word 文档、主要适用场景是什么（1-2句话）。

## 核心业务实体
- 列出 2-3 个最核心的主体或业务对象即可，用极简的语言说明关系。

## 章节职责划分
- 仅概括最核心的 3-5 个章节内容，不要罗列所有条款。

【用户提示词】
宿主: word
文档类型: ${input.documentType || 'word_document'}
文档线索: sourceLanguage=${input.sourceLanguage}; targetLanguages=${targetLanguageText}; sampleFileName=${input.sampleFileName || 'unknown'}
章节提示: ${input.fallbackSectionHints.join(' | ') || 'none'}
版式特征: ${input.fallbackLayoutFeatures.join(' | ') || 'none'}

模板结构摘录:
${input.templateExcerpt || '无'}

文档内容摘录:
${input.sampleText ? input.sampleText.slice(0, 6000) : '无样本文本'}
`;
}