import type { StructuredAnalyzeRequest } from './analysis-executor';

export function buildPairAnalysisChatPrompt(request: StructuredAnalyzeRequest): string {
  return `【系统提示词】
你是 Excel 模板参数分析助手。请基于“文档理解结果”和“当前对照组差异”，识别后续模板生成真正需要的参数。

本次分析重点：
1. 判断候选内容在模板中的位置。
2. 判断参数类型（text/date/number/boolean/loop）。
3. 说明参数的业务含义。
4. 说明参数在后续渲染或自然语言取值中的用途。
5. 给出清晰、可复用、带业务语义的英文参数命名。

请把每个候选字段尽量转换成一个 suggestion，不要输出文档摘要、规则说明或字段清单。
如果当前对照组是“左侧标签 + 右侧值”的键值对结构，通常识别为 variable。
如果输入中同时出现“明细表”和“单独字段”，必须两部分都分析，不能只关注表格而遗漏单独字段。
如果输入中出现“明细表”，说明这是一个按行展开的数据区域，应输出 loop suggestion 和对应列字段 suggestions。
如果输入中出现“单独字段”，那部分是独立的单值字段，应逐条输出 variable suggestion，不能并入明细表字段。

对于数组/明细表，请严格遵守：
1. 明细表需要输出 loop suggestion，填写 details.fieldType=loop、arrayPath、tableName。
2. 明细列字段使用数组字段路径，格式如 \`d.xxxDetails[].fieldName\`。
3. 已明确是明细表、设备清单、付款节点、交付计划时，优先按数组处理。
4. elementPath 和 details.displayPosition 优先写模板 sheet 的字段位置，不要照抄数据 sheet 位置。
5. 只要能从表头判断业务含义，就必须输出有业务语义的字段名，不要输出 field1、field2 这类弱语义名称。
6. loop 的 suggestedName 必须是 \`{#d.arrayName}{/d.arrayName}\`，不能写成 \`{#d.arrayName[]}\` 或 \`{/d.arrayName[]}\`。
7. variable 的 suggestedName 才允许使用 \`[]\`，格式如 \`d.deliveryPlans[].plannedArrivalDate\`。

对于单独字段，请严格遵守：
1. “单独字段”里的每一项都要单独判断是否需要输出 variable suggestion。
2. 单独字段通常是表外说明、条款、标准、备注、条件等内容，容易被忽略，必须优先补全。
3. 单独字段不能写成数组字段，也不能并入 loop 的列字段。
4. 单独字段的 elementPath 和 details.displayPosition 优先使用给出的模板位置。

命名规则：
- 数组名使用业务语义复数名，如 d.procurementDetails、d.deliveryPlans、d.paymentTerms。
- 字段名使用列标题业务英文名，如 seq、materialCode、deviceName、model、unit、quantity、unitPrice、subtotal。
- suggestedName、details.arrayPath、details.columnMappings.variablePath 只能使用英文 ASCII 字符、数字、\`.\`、\`_\`、\`[]\`，禁止出现任何汉字。
- 不要把行号写进参数名，不要用 field1/col2/row5Value 这类弱语义命名，除非确实无法判断含义。

交付验收示例：
- 表头: 批次 | 交付地点 | 计划到货日 | 安装完成日 | 验收类型
- 正确 loop: \`{#d.deliveryPlans}{/d.deliveryPlans}\`
- 正确字段:
  - \`d.deliveryPlans[].batch\`
  - \`d.deliveryPlans[].deliveryLocation\`
  - \`d.deliveryPlans[].plannedArrivalDate\`
  - \`d.deliveryPlans[].installationCompletionDate\`
  - \`d.deliveryPlans[].acceptanceType\`
- 错误示例:
  - \`{#d.deliveryPlans[]}{/d.deliveryPlans[]}\`
  - \`d.deliveryPlans[].批次\`
  - \`d.deliveryPlans[].安装完成日\`

最小示例（明细表 + 单独字段）：
- 明细表:
  - 表头: 设备编号 | 数量
  - 示例值: RB-001 | 2
- 单独字段:
  - 验收标准 = 连续运行 72 小时无重大异常

正确输出应同时包含：
1. loop: {#d.procurementDetails}{/d.procurementDetails}
2. variable: d.procurementDetails[].materialCode
3. variable: d.procurementDetails[].quantity
4. variable: d.acceptanceStandard

示例 JSON：
{
  "suggestions": [
    {
      "id": "param_procurement_details_loop",
      "type": "loop",
      "elementPath": "采购明细_模板!A4:B6",
      "suggestedName": "{#d.procurementDetails}{/d.procurementDetails}",
      "originalText": "tblProcurementDetail",
      "confidence": 0.95,
      "applied": false,
      "context": "采购明细_模板 ↔ 采购明细_数据",
      "details": {
        "description": "采购明细循环表，每行代表一个采购项目",
        "fieldType": "loop",
        "loopType": "explicit",
        "arrayPath": "d.procurementDetails",
        "tableName": "tblProcurementDetail",
        "chapter": "采购明细_模板",
        "significance": "用于承载多条采购明细并在模板中按行循环渲染",
        "displayPosition": "采购明细_模板!A4:B6",
        "context": "采购明细表"
      }
    },
    {
      "id": "param_procurement_details_material_code",
      "type": "variable",
      "elementPath": "采购明细_模板!A5",
      "suggestedName": "d.procurementDetails[].materialCode",
      "originalText": "RB-001",
      "confidence": 0.96,
      "applied": false,
      "context": "采购明细_模板 ↔ 采购明细_数据",
      "details": {
        "description": "采购明细中的设备编号字段",
        "fieldType": "text",
        "loopType": null,
        "arrayPath": "d.procurementDetails[]",
        "tableName": "tblProcurementDetail",
        "chapter": "采购明细_模板",
        "significance": "用于填写采购明细中的设备编号",
        "displayPosition": "采购明细_模板!A5",
        "context": "标签=设备编号"
      }
    },
    {
      "id": "param_procurement_details_quantity",
      "type": "variable",
      "elementPath": "采购明细_模板!B5",
      "suggestedName": "d.procurementDetails[].quantity",
      "originalText": "2",
      "confidence": 0.96,
      "applied": false,
      "context": "采购明细_模板 ↔ 采购明细_数据",
      "details": {
        "description": "采购明细中的数量字段",
        "fieldType": "number",
        "loopType": null,
        "arrayPath": "d.procurementDetails[]",
        "tableName": "tblProcurementDetail",
        "chapter": "采购明细_模板",
        "significance": "用于填写采购明细中的数量",
        "displayPosition": "采购明细_模板!B5",
        "context": "标签=数量"
      }
    },
    {
      "id": "param_acceptance_standard",
      "type": "variable",
      "elementPath": "交付验收_模板!B9",
      "suggestedName": "d.acceptanceStandard",
      "originalText": "连续运行 72 小时无重大异常",
      "confidence": 0.95,
      "applied": false,
      "context": "交付验收_模板 ↔ 交付验收_数据",
      "details": {
        "description": "交付验收中的验收标准字段",
        "fieldType": "text",
        "chapter": "交付验收_模板",
        "significance": "用于填写交付验收相关的标准说明",
        "displayPosition": "交付验收_模板!B9",
        "context": "标签=验收标准"
      }
    }
  ]
}

再次强调：
- 明细表字段和单独字段都要输出，不能遗漏单独字段。
- 明细列字段使用数组路径，单独字段使用普通变量路径。
- 最终位置优先使用模板 sheet，而不是数据 sheet。

参数命名要体现业务语义，优先使用英文路径，如 d.contract.contractNo、d.contract.signDate、d.contract.buyerName。
位置描述要尽量保留 sheet 名和单元格地址。
章节归属要体现业务分组，如“合同基本信息”“采购明细”“交付验收”“付款违约”。
description 回答“这是什么参数”；significance 回答“这个参数后续为什么有用、如何从业务输入中获得”。

请只返回 JSON 对象本身，不要补充解释、Markdown、代码块或思考过程。

【用户提示词】
以下是第一步产出的文档理解结果，以及当前对照组的差异信息，请据此给出参数建议。

文档理解结果:
${request.globalUnderstandingSummary || '未提供'}

差异摘要:
${request.diffOverview || request.diffSummary || '未提供'}

候选字段列表:
${request.candidateFieldList || '未提供'}`;
}
