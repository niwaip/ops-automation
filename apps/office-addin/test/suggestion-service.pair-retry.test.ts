import { analyzeDocumentWithAI } from '../src/features/parameter-identify/services/suggestion/suggestion.service';
import { DocumentIR } from '../src/host/adapters/document-ir';
import { AISuggestion } from '../src/app/store';

function buildSseResponse(content: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'result', content })}\n\n`)
      );
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

function normalizeSuggestionNames(suggestions: AISuggestion[]): string[] {
  return suggestions.map((suggestion) => suggestion.suggestedName.replace(/[{}]/g, ''));
}

function createWorkbookDocumentIR(): DocumentIR {
  const tableMeta = {
    name: 'tblItems',
    address: 'A4:H7',
    headerAddress: 'A4:H4',
    dataBodyAddress: 'A5:H7',
  };

  const headerValues = [
    '序号',
    '物料编码',
    '设备名称',
    '规格型号',
    '单位',
    '数量',
    '含税单价',
    '含税小计',
  ];
  const dataRows = [
    ['1', 'RB-6A-001', '六轴工业机器人', 'XR-600', '台', '4', '185000', '740000'],
    ['2', 'SG-2B-010', '伺服滑台模组', 'SGM-220', '套', '3', '96000', '288000'],
    ['3', 'VS-9C-120', '视觉检测工站', 'VIS-900', '套', '1', '132000', '132000'],
  ];

  const elements: DocumentIR['elements'] = [
    {
      id: 'sheet-template',
      type: 'sheet',
      text: '采购明细_模板',
      hostData: {
        sheetIndex: 0,
        sheetName: '采购明细_模板',
        sheetRole: 'mock',
        pairIndex: 0,
        tables: [tableMeta],
      },
    },
    {
      id: 'sheet-data',
      type: 'sheet',
      text: '采购明细_数据',
      hostData: {
        sheetIndex: 1,
        sheetName: '采购明细_数据',
        sheetRole: 'data',
        pairIndex: 0,
        tables: [tableMeta],
      },
    },
  ];

  headerValues.forEach((value, colIndex) => {
    elements.push({
      id: `template-header-${colIndex}`,
      type: 'cell',
      text: value,
      hostData: {
        sheetIndex: 0,
        sheetName: '采购明细_模板',
        sheetRole: 'mock',
        pairIndex: 0,
        rowIndex: 3,
        colIndex,
      },
    });
    elements.push({
      id: `data-header-${colIndex}`,
      type: 'cell',
      text: value,
      hostData: {
        sheetIndex: 1,
        sheetName: '采购明细_数据',
        sheetRole: 'data',
        pairIndex: 0,
        rowIndex: 3,
        colIndex,
      },
    });
  });

  dataRows.forEach((row, rowOffset) => {
    row.forEach((value, colIndex) => {
      elements.push({
        id: `template-cell-${rowOffset}-${colIndex}`,
        type: 'cell',
        text: '',
        hostData: {
          sheetIndex: 0,
          sheetName: '采购明细_模板',
          sheetRole: 'mock',
          pairIndex: 0,
          rowIndex: 4 + rowOffset,
          colIndex,
        },
      });
      elements.push({
        id: `data-cell-${rowOffset}-${colIndex}`,
        type: 'cell',
        text: value,
        hostData: {
          sheetIndex: 1,
          sheetName: '采购明细_数据',
          sheetRole: 'data',
          pairIndex: 0,
          rowIndex: 4 + rowOffset,
          colIndex,
        },
      });
    });
  });

  return {
    host: 'excel',
    metadata: {
      title: '采购明细识别验证',
      language: 'zh-CN',
    },
    elements,
    anchors: [],
    stats: {
      sheetCount: 2,
      sheetPairCount: 1,
      tableCount: 2,
      cellCount: elements.filter((element) => element.type === 'cell').length,
    },
  };
}

describe('analyzeDocumentWithAI Excel pair retry', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('保留 prompt 构造并在坏 JSON 时仅重试当前 pair，最终采用重试后的正确结果', async () => {
    const documentIR = createWorkbookDocumentIR();
    const adapter = {
      host: 'excel',
      getCapabilities: async () => ({ supportsAI: true }),
      extractDocument: async () => documentIR,
      extractSelection: async () => null,
      previewSuggestion: async () => {},
      applySuggestion: async () => {},
      createTemplateSource: async () => ({
        format: 'xlsx',
        content: '',
        mode: 'json',
        isBinaryFile: false,
      }),
      extractOutline: async () => [],
      getDocumentMetadata: async () => ({}),
    } as any;

    const malformedResponse = `[result] <think>
分析采购明细参数
</think>
\`\`\`json
{
  "suggestions": [
    {
      "id": "param_items_loop",
      "type": "loop",
      "elementPath": "采购明细_模板!A4:H7",
      "suggestedName": "{#d.items}{/d.items}",
      "originalText": "采购明细列表",
      "confidence": 0.95,
      "details": {
        "fieldType": "loop",
        "arrayPath": "d.items",
        "chapter": "采购明细_模板",
        "description": "合同标的条款，定义采购设备的具体种类、型号规格及配套服务内容",
        "significance": "用于填写采购范围，明确乙方向甲方提供设备的具体内容，为后续条款提供基础前提"
      }
    },
    {
      "id": "param_items_sequence",
      "type": "variable",
      "elementPath": "采购明细_模板!A5",
      "suggestedName": "d.items[].sequenceNo",
      "originalText": "1",
      "confidence": 0.96,
      "details": {
        "fieldType": "number",
        "arrayPath": "d.items[]",
        "chapter": "采购明细_模板",
        "description": "明细序号字段，用于标识采购列表中的行次",
        "significance": "用于在模板中保持明细排序，便于阅读和逐项核对"
      }
    },
    {
      "id": "param_items_materialCode",
      "type": "variable",
      "elementPath": "采购明细_模板!B5",
      "suggestedName": "d.items[].materialCode",
      "originalText": "RB-6A-001",
      "confidence": 0.96,
      "details": {
        "fieldType": "text",
        "arrayPath": "d.items[]",
        "chapter": "采购明细_模板",
        "description": "采购物料编码，用于唯一标识当前明细中的设备或物料",
        "significance": "用于将业务系统中的物料主数据映射到模板明细行，确保渲染结果可追溯和可对账"
      }
    },
    {
      "id": "param_items_deviceName",
      "type": "variable",
      "elementPath": "采购明细_模板!C5",
      "suggestedName": "d.items[].deviceName",
      "originalText": "六轴工业机器人",
      "confidence": 0.96,
      "details": {
        "fieldType": "text",
        "arrayPath": "d.items[]",
        "chapter": "采购明细_模板",
        "description": "采购设备名称，表示当前明细行对应的设备或物料名称",
        "significance": "用于在模板中展示采购对象，明确合同标的的具体内容"
      }
    },
    {
      "id": "param_items_specification",
      "type": "variable",
      "elementPath": "采购明细_模板!D5",
      "suggestedName": "d.items[].specification",
      "originalText": "XR-600",
      "confidence": 0.96,
      "details": {
        "fieldType": "text",
        "arrayPath": "d.items[]",
        "chapter": "采购明细_模板",
        "description": "设备规格型号字段，用于描述采购设备的型号与技术规格",
        "significance": "用于细化合同标的，确保供货内容与技术要求一致"
      }
    },
    {
      "id": "param_items_unit",
      "type": "variable",
      "elementPath": "采购明细_模板!E5",
      "suggestedName": "d.items[].unit",
      "originalText": "台",
      "confidence": 0.96,
      "details": {
        "fieldType": "text",
        "arrayPath": "d.items[]",
        "chapter": "采购明细_模板",
        "description": "计量单位字段，用于表示采购数量的单位",
        "significance": "用于确保数量解释准确，避免在结算和交付时产生歧义"
      }
    },
    {
      "id": "param_items_quantity",
      "type": "variable",
      "elementPath": "采购明细_模板!F5",
      "suggestedName": "d.items[].quantity",
      "originalText": "4",
      "confidence": 0.96,
      "details": {
        "fieldType": "number",
        "arrayPath": "d.items[]",
        "chapter": "采购明细_模板",
        "description": "采购数量字段，用于表示当前设备或物料的采购数量",
        "significance": "用于计算明细金额、统计采购规模并支持后续对账"
      }
    },
    {
      "id": "param_items_unitPriceTax",
      "type": "variable",
      "elementPath": "采购明细_模板!G5",
      "suggestedName": "d.items[].unit": "含税单价"
    },
    {
      "id": "param_items_subtotalTax",
      "type": "variable",
      "elementPath": "采购明细_模板!H5",
      "suggestedName": "d.items[].subtotalTax",
      "originalText": "740000",
      "confidence": 0.96,
      "details": { "fieldType": "number", "arrayPath": "d.items[]", "chapter": "采购明细_模板" }
    }
  ]
}
\`\`\``;

    const validResponse = JSON.stringify({
      suggestions: [
        {
          id: 'param_items_loop',
          type: 'loop',
          elementPath: '采购明细_模板!A4:H7',
          suggestedName: '{#d.items}{/d.items}',
          originalText: '采购明细列表',
          confidence: 0.95,
          details: {
            fieldType: 'loop',
            arrayPath: 'd.items',
            chapter: '采购明细_模板',
            description: '合同标的条款，定义采购设备的具体种类、型号规格及配套服务内容',
            significance:
              '用于填写采购范围，明确乙方向甲方提供设备的具体内容，为后续条款提供基础前提',
          },
        },
        {
          id: 'param_items_sequence',
          type: 'variable',
          elementPath: '采购明细_模板!A5',
          suggestedName: 'd.items[].sequenceNo',
          originalText: '1',
          confidence: 0.96,
          details: {
            fieldType: 'number',
            arrayPath: 'd.items[]',
            chapter: '采购明细_模板',
            description: '明细序号字段，用于标识采购列表中的行次',
            significance: '用于在模板中保持明细排序，便于阅读和逐项核对',
          },
        },
        {
          id: 'param_items_materialCode',
          type: 'variable',
          elementPath: '采购明细_模板!B5',
          suggestedName: 'd.items[].materialCode',
          originalText: 'RB-6A-001',
          confidence: 0.96,
          details: {
            fieldType: 'text',
            arrayPath: 'd.items[]',
            chapter: '采购明细_模板',
            description: '采购物料编码，用于唯一标识当前明细中的设备或物料',
            significance:
              '用于将业务系统中的物料主数据映射到模板明细行，确保渲染结果可追溯和可对账',
          },
        },
        {
          id: 'param_items_deviceName',
          type: 'variable',
          elementPath: '采购明细_模板!C5',
          suggestedName: 'd.items[].deviceName',
          originalText: '六轴工业机器人',
          confidence: 0.96,
          details: {
            fieldType: 'text',
            arrayPath: 'd.items[]',
            chapter: '采购明细_模板',
            description: '采购设备名称，表示当前明细行对应的设备或物料名称',
            significance: '用于在模板中展示采购对象，明确合同标的的具体内容',
          },
        },
        {
          id: 'param_items_specification',
          type: 'variable',
          elementPath: '采购明细_模板!D5',
          suggestedName: 'd.items[].specification',
          originalText: 'XR-600',
          confidence: 0.96,
          details: {
            fieldType: 'text',
            arrayPath: 'd.items[]',
            chapter: '采购明细_模板',
            description: '设备规格型号字段，用于描述采购设备的型号与技术规格',
            significance: '用于细化合同标的，确保供货内容与技术要求一致',
          },
        },
        {
          id: 'param_items_unit',
          type: 'variable',
          elementPath: '采购明细_模板!E5',
          suggestedName: 'd.items[].unit',
          originalText: '台',
          confidence: 0.96,
          details: {
            fieldType: 'text',
            arrayPath: 'd.items[]',
            chapter: '采购明细_模板',
            description: '计量单位字段，用于表示采购数量的单位',
            significance: '用于确保数量解释准确，避免在结算和交付时产生歧义',
          },
        },
        {
          id: 'param_items_quantity',
          type: 'variable',
          elementPath: '采购明细_模板!F5',
          suggestedName: 'd.items[].quantity',
          originalText: '4',
          confidence: 0.96,
          details: {
            fieldType: 'number',
            arrayPath: 'd.items[]',
            chapter: '采购明细_模板',
            description: '采购数量字段，用于表示当前设备或物料的采购数量',
            significance: '用于计算明细金额、统计采购规模并支持后续对账',
          },
        },
        {
          id: 'param_items_unitPriceTax',
          type: 'variable',
          elementPath: '采购明细_模板!G5',
          suggestedName: 'd.items[].unitPriceTax',
          originalText: '185000',
          confidence: 0.96,
          details: {
            fieldType: 'number',
            arrayPath: 'd.items[]',
            chapter: '采购明细_模板',
            description: '含税单价字段，用于表示单个设备或物料的含税价格',
            significance: '用于计算采购成本并支撑合同金额与结算金额核对',
          },
        },
        {
          id: 'param_items_subtotalTax',
          type: 'variable',
          elementPath: '采购明细_模板!H5',
          suggestedName: 'd.items[].subtotalTax',
          originalText: '740000',
          confidence: 0.96,
          details: {
            fieldType: 'number',
            arrayPath: 'd.items[]',
            chapter: '采购明细_模板',
            description: '含税小计字段，用于表示当前明细行的含税金额汇总',
            significance: '用于展示单行采购金额，并为合计金额汇总提供基础数据',
          },
        },
      ],
    });

    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValueOnce(buildSseResponse(malformedResponse))
      .mockResolvedValueOnce(buildSseResponse(validResponse));

    const result = await analyzeDocumentWithAI(adapter, {
      apiBaseUrl: 'http://localhost:3000',
      templateType: 'contract',
      useMultiStage: false,
      analysisExecutor: 'chat',
      thinking: false,
      aiOrchestratorBaseUrl: 'http://mock-ai-orchestrator',
      excelGlobalUnderstandingCache: {
        summary: '采购明细数据记录表，包含采购物料、数量、价格与合计金额等信息。',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstRequestInit = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const firstRequestBody = JSON.parse(String(firstRequestInit?.body || '{}'));
    expect(firstRequestBody.message).toContain('你是 Excel 模板参数分析助手');
    expect(firstRequestBody.message).toContain('请只返回严格的 JSON 对象');
    expect(firstRequestBody.message).toContain('每个 suggestion 的 `details` 都必须包含');
    expect(firstRequestBody.message).toContain('参数描述');
    expect(firstRequestBody.message).toContain('用途说明');
    expect(firstRequestBody.message).toContain(
      '合同标的条款，定义采购设备的具体种类、型号规格及配套服务内容'
    );
    expect(firstRequestBody.message).toContain('字段名称：含税单价，示例值：185000，位置：G5');
    expect(firstRequestBody.config.thinking).toBe(false);

    const retryRequestInit = fetchMock.mock.calls[1][1] as RequestInit | undefined;
    const retryRequestBody = JSON.parse(String(retryRequestInit?.body || '{}'));
    expect(retryRequestBody.config.thinking).toBe(true);

    const normalizedNames = normalizeSuggestionNames(result.suggestions);
    expect(normalizedNames).toContain('d.items[].unitPriceTax');
    expect(normalizedNames).toContain('d.items[].subtotalTax');
    expect(result.suggestions).toHaveLength(9);
    expect(
      result.suggestions
        .find((suggestion) => suggestion.elementPath === '采购明细_模板!G5')
        ?.suggestedName.replace(/[{}]/g, '')
    ).toBe('d.items[].unitPriceTax');
    expect(
      result.suggestions.find((suggestion) => suggestion.elementPath === '采购明细_模板!G5')
        ?.details?.description
    ).toBe('含税单价字段，用于表示单个设备或物料的含税价格');
    expect(
      result.suggestions.find((suggestion) => suggestion.elementPath === '采购明细_模板!G5')
        ?.details?.significance
    ).toBe('用于计算采购成本并支撑合同金额与结算金额核对');

    expect(result.contextAnalysis?.pairResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pairLabel: '采购明细_模板 ↔ 采购明细_数据',
          suggestionCount: 9,
          localRetryCount: 1,
          salvagedMalformedJson: false,
        }),
      ])
    );
  });
});
