import type { StructuredAnalyzeRequest } from '../analysis-executor';
import { buildPromptShortContext } from './shared';

export function buildPairAnalysisChatPrompt(request: StructuredAnalyzeRequest): string {
  const shortContext = buildPromptShortContext(request);

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
