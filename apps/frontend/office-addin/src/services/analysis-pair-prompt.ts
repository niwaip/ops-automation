import type { StructuredAnalyzeRequest } from './analysis-executor';

export function buildPairAnalysisChatPrompt(request: StructuredAnalyzeRequest): string {
  // 从全局理解中提取简短摘要，避免 AI 被过长的背景干扰
  const shortContext = String(request.globalUnderstandingSummary || '')
    .split('\n')
    .filter(line => line.trim().length > 0 && !line.includes('##'))[0] || '未提供';

  return `【系统提示词】
你是 Excel 模板参数分析助手。请基于“文档理解”和“当前差异”，识别模板生成真正需要的参数。

核心规则：
1. 请只返回严格的 JSON 对象，包含 \`suggestions\` 数组，不要输出 markdown、思考过程或其他解释。
2. 参数命名 (suggestedName) 必须是带业务语义的英文 ASCII 路径 (如 d.info.name, d.items[].code)。禁止使用行号或汉字。
3. 数组/明细表：
   - 必须输出一个 loop 类型的 suggestion，\`suggestedName\` 格式为 \`{#d.arrayName}{/d.arrayName}\`。
   - 必须为其内部的列字段输出 variable 类型的 suggestion，\`suggestedName\` 格式为 \`d.arrayName[].fieldName\`。
4. 单独字段：不能并入数组，必须输出独立的 variable (如 \`d.remark\`)。
5. 每个 suggestion 的 \`details\` 都必须包含：
   - \`description\`：参数描述，说明该参数在业务上的含义。
   - \`significance\`：用途说明，说明该参数在模板渲染或业务流程中的用途。

输出 JSON 格式示例：
{
  "suggestions": [
    {
      "id": "param_items_loop",
      "type": "loop",
      "elementPath": "列表_模板!A4:B6",
      "suggestedName": "{#d.items}{/d.items}",
      "originalText": "tblItems",
      "confidence": 0.95,
      "details": {
        "fieldType": "loop",
        "arrayPath": "d.items",
        "chapter": "列表_模板",
        "description": "合同标的条款，定义采购设备的具体种类、型号规格及配套服务内容",
        "significance": "用于填写采购范围，明确乙方向甲方提供设备的具体内容，为后续条款提供基础前提"
      }
    },
    {
      "id": "param_items_code",
      "type": "variable",
      "elementPath": "列表_模板!A5",
      "suggestedName": "d.items[].code",
      "originalText": "A-001",
      "confidence": 0.96,
      "details": {
        "fieldType": "text",
        "arrayPath": "d.items[]",
        "chapter": "列表_模板",
        "description": "采购物料编码，用于唯一标识当前明细中的设备或物料",
        "significance": "用于将业务系统中的物料主数据映射到模板明细行，确保渲染结果可追溯和可对账"
      }
    },
    {
      "id": "param_remark",
      "type": "variable",
      "elementPath": "列表_模板!B9",
      "suggestedName": "d.remark",
      "originalText": "此处为独立文本说明",
      "confidence": 0.95,
      "details": {
        "fieldType": "text",
        "chapter": "列表_模板",
        "description": "补充说明字段，用于承载合同执行中的特殊备注或补充文本",
        "significance": "用于填写独立说明内容，补充主表之外但需要在模板中展示的业务信息"
      }
    }
  ]
}

【用户提示词】
文档背景概要:
${shortContext}

当前工作表及范围:
${request.pairLabel || '未命名'}

当前差异摘要:
${request.diffOverview || request.diffSummary || '未提供'}

候选字段列表:
${request.candidateFieldList || '未提供'}`;
}

export function buildWordSectionAnalysisChatPrompt(request: StructuredAnalyzeRequest): string {
  // 从全局理解中提取简短摘要，避免 AI 被过长的背景干扰
  const shortContext = String(request.globalUnderstandingSummary || '')
    .split('\n')
    .filter(line => line.trim().length > 0 && !line.includes('##'))[0] || '未提供';

  const documentContentText = String(request.documentContent || request.diffOverview || request.diffSummary || '')
    .replace(/\s+/g, ' ')
    .trim();
  const chapterContext = documentContentText
    ? (documentContentText.length > 1200 ? `${documentContentText.slice(0, 1200).trim()}...` : documentContentText)
    : '未提供';
  const structuredCandidates = Array.isArray(request.wordSectionCandidates) ? request.wordSectionCandidates : [];
  const structuredBilingualGroups = Array.isArray(request.wordSectionBilingualGroups) ? request.wordSectionBilingualGroups : [];
  const acceptedSuggestions = Array.isArray(request.wordSectionAcceptedSuggestions) ? request.wordSectionAcceptedSuggestions : [];
  const roundIndex = typeof request.wordSectionRoundIndex === 'number' ? request.wordSectionRoundIndex : 1;
  const maxRounds = typeof request.wordSectionMaxRounds === 'number' ? request.wordSectionMaxRounds : 5;
  const candidatesPayload = structuredCandidates.length > 0
    ? JSON.stringify(structuredCandidates, null, 2)
    : (request.candidateFieldList || '未提供');
  const bilingualGroupsPayload = structuredBilingualGroups.length > 0
    ? JSON.stringify(structuredBilingualGroups, null, 2)
    : (request.bilingualCandidatePairs || '未提供');
  const acceptedSuggestionsPayload = acceptedSuggestions.length > 0
    ? JSON.stringify(acceptedSuggestions, null, 2)
    : '[]';

  return `【系统提示词】
你是 Word 模板参数建模专家。任务：仅根据当前章节的 candidates，为每个 candidateId 分配一个合理的、带业务语义的 JSON 字段路径。

核心规则：
1. 必须输出严格的 JSON 对象，包含 \`suggestions\` 数组，严禁输出 markdown、思考过程或解释。
2. 绝对的一对一映射：candidates 中有多少个 candidateId，\`suggestions\` 数组就必须返回多少个对象，不多不少，且每项都必须带上 \`details.candidateId\`。
3. 命名规范：
   - \`suggestedName\` 必须是带业务语义的英文 ASCII 路径，例如 \`d.payment.days\`、\`d.contract.amount\`。
   - 严禁把整句话拼音或直译作为变量名，必须围绕 \`parameterSlot\` 中 \`[参数]\` 所在位置的真实业务含义来命名。
4. 双语字段处理：
   - 如果模板本身就是中日两个独立占位符，允许为同一业务含义生成成对的 \`_cn\` / \`_jp\` 字段，例如 \`d.payment.method_cn\` 与 \`d.payment.method_jp\`。
   - 这一类 \`_cn\` / \`_jp\` 字段已经是最终模板变量名，严禁再追加第二层 \`_zh\` / \`_ja\` 后缀。
   - 只有当 bilingualGroups 明确表示两侧文本应共享同一个业务槽位时，才共享同一个 JSON 字段路径（例如都使用 \`d.partyA.name\`）。
   - 严禁同时输出“共享字段”与“_cn/_jp 拆分字段”两套命名；同一业务含义只能选择一种表达方式。
5. 循环（Loop）的使用极其严格：
   - 只有当候选明显属于表格列或重复列表时，才能输出 \`type: "loop"\`。
   - 普通段落中的句内填空必须作为独立 \`variable\`，不能错误嵌套进循环。
   - 如果 candidate 的 \`candidateType\` 为 \`loop_column\`，说明它属于循环表格的列字段，命名时应优先使用 \`d.arrayName[].fieldName\` 形式。
   - 同一个 \`loopGroupKey\` 下的所有 \`loop_column\` 候选，必须共享同一个数组前缀；例如统一命名为 \`d.items[].projectName\`、\`d.items[].productName\`、\`d.items[].quantity\`。
   - 当前前端传入的 \`loop_column\` 候选本身是“循环内部字段”，不是单独的 loop 容器占位；除非上下文明确存在容器候选，否则不要把每个列字段都错误输出成 \`type: "loop"\`。
6. 字段属性：
   - 必须将候选的 \`anchorText\` 原样填入 suggestion 的 \`originalText\` 字段。
   - \`fieldType\` 请根据语境推断（如 text/number/date/currency）。
   - \`description\` 和 \`significance\` 需简明扼要说明该填空位的业务含义。
7. 去重与抗干扰：
   - 如果多个候选对应同一个业务含义，请为它们分配相同的基准路径。
   - 只处理 candidates 中列出的项，不要从 chapterContext 自行新增参数。
8. 冲突裁决优先级：
   - 当 \`parameterSlot\`、\`anchorText\`、\`chapterContext\`、\`sampleValue\`、\`fieldIdHint\` 之间冲突时，优先级必须是：\`parameterSlot\` > \`anchorText\` > \`chapterContext\` > \`sampleValue\` > \`fieldIdHint\` / \`generationPolicyHint\`。
   - \`sampleValue\`、\`fieldIdHint\`、\`generationPolicyHint\` 只可作为辅助线索，不能覆盖 \`parameterSlot\` 的真实业务语义。

输出 JSON 示例：
{
  "suggestions": [
    {
      "id": "word_delivery_days",
      "type": "variable",
      "elementPath": "第三条 交付标准",
      "suggestedName": "d.delivery.daysAfterOrder",
      "originalText": "下单之日起",
      "confidence": 0.95,
      "details": {
        "candidateId": "frontend-word-query-99",
        "chapter": "第三条 交付标准",
        "fieldType": "number",
        "description": "订单确认后需交付的天数",
        "significance": "用于渲染交付时间节点的具体天数要求"
      }
    },
    {
      "id": "word_delivery_ratio",
      "type": "variable",
      "elementPath": "第三条 交付标准",
      "suggestedName": "d.delivery.firstRatio",
      "originalText": "首批交付之",
      "confidence": 0.95,
      "details": {
        "candidateId": "frontend-word-query-100",
        "chapter": "第三条 交付标准",
        "fieldType": "number",
        "description": "首批交付占总量的百分比",
        "significance": "用于计算和展示首批交付比例"
      }
    }
  ]
}

【用户提示词】
文档背景概要:
${shortContext}

当前章节:
${request.pairLabel || '未命名章节'}

当前轮次:
第 ${roundIndex} / ${maxRounds} 轮

章节上下文摘要（仅供理解，不要新增候选）:
${chapterContext}

已确认保留的历史结果（不要改写这些 candidateId 的结论）:
${acceptedSuggestionsPayload}

结构化双语配对组:
${bilingualGroupsPayload}

结构化候选参数:
${candidatesPayload}

请严格基于以上 candidates 输出识别结果，确保 candidateId 一一对应，并优先利用 bilingualGroups 对齐中日同义字段。`;
}
