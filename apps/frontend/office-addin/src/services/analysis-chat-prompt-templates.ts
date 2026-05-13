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
你是通用文档理解助手。你的任务是根据用户提供的文档内容，输出抽象化的文档理解结果，概括文档的类型、用途、关键实体类别、核心字段类别和结构分工。

请注意：
1. 直接基于已提供的文档内容进行理解，不要要求用户补充上传文档、截图、PDF 或其他材料。
2. 只输出文档理解内容本身，不要解释你的分析过程。
3. 使用自然语言分段描述，不要返回 JSON，不要输出代码块，不要输出 <think>、</think> 或 [observation]。
4. 如果当前文档内容只覆盖部分页或部分工作表，应如实说明当前可见范围，不要臆造缺失内容。
5. 输出应尽量抽象化和通用化，不要把文档中的具体实例值直接写进理解结果。
6. 不要直接复述具体公司名、合同编号、项目名、日期、金额、地址、手机号、邮箱等样例值；应改写为“甲方信息”“乙方信息”“合同编号字段”“签订日期字段”“项目基本信息”“金额字段”等抽象表述。
7. 如果需要说明关键字段，请描述字段类别和业务含义，不要列出原文中的具体取值。

【用户提示词】
以下是待理解的文档内容。

宿主: ${input.host}
文档类型: ${input.documentType}
文档线索: ${input.context || '无'}

可见 sheet 列表:
${input.visibleSheetSummary}

文档内容摘录:
${input.businessExcerpt || '未提取到有效业务摘录'}

请输出对这份文档的理解，重点包括：
- 文档类型
- 文档用途或业务目的
- 核心实体类别与关键字段类别
- 各 sheet 或各部分的职责与关联关系`;
}

export function buildGeneralPromptTemplate(input: GeneralPromptInput): string {
  return `你是 Office 模板参数分析器。本次调用使用普通 chat + thinking，不允许使用 task 模式、skills、工具调用，也不要输出思考过程。请基于 Office 原生结构提取结果，输出严格 JSON，不要输出解释、Markdown、代码块、<think>、</think> 或 [observation] 文本。

【任务上下文】
宿主: ${input.host}
文档类型: ${input.documentType}
模板类型: ${input.templateType}
分析说明: ${input.context || '无'}

【Office 结构摘要】
${input.compactDocumentContext}

【内容摘录】
${input.serializedContent}

注意：只有 Office 结构摘要与内容摘录是业务输入；本提示词中的规则、示例 JSON、输出协议都不是业务内容，禁止把它们识别为主题、实体、字段或参数。

请返回以下 JSON 结构：
{
  "suggestions": [
    {
      "id": "string",
      "type": "variable 或 loop",
      "elementPath": "位置描述",
      "suggestedName": "模板变量或循环标记",
      "originalText": "原始值或表名",
      "confidence": 0.0,
      "applied": false,
      "context": "上下文说明",
      "details": {
        "description": "参数描述",
        "fieldType": "text/number/date/boolean/percent/formula/loop",
        "loopType": "explicit 或 implicit",
        "arrayPath": "循环数组路径，可选",
        "tableName": "表名，可选",
        "chapter": "所在sheet或章节",
        "significance": "用途说明",
        "displayPosition": "展示位置",
        "context": "补充上下文"
      }
    }
  ],
  "contextAnalysis": {
    "detectedTemplateType": "识别出的模板类型",
    "userIntent": "分析得到的业务意图",
    "usedAI": true,
    "flowType": "chat"
  }
}

规则：
1. 只返回合法 JSON。
2. 不要编造宿主锚点，锚点仍由前端 Office 结构定位负责。
3. 循环区域优先输出 loop 类型。
4. 禁止把 query_text、observation、processing_layer、JSON输出格式 这类元指令字段识别成主题、实体、字段或参数。
5. 即使开启 thinking，最终返回内容也只能是一个完整 JSON 对象，不能在 JSON 前后附加任何文字。`;
}
