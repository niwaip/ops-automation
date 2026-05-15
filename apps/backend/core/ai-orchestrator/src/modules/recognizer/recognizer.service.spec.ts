import { Test, TestingModule } from '@nestjs/testing';
import { RecognizerService } from './recognizer.service';
import { ModelService } from '../model/model.service';

describe('RecognizerService model routing', () => {
  let service: RecognizerService;
  let modelService: {
    getClient: jest.Mock;
    getDefaultModel: jest.Mock;
    resolveModelId: jest.Mock;
  };

  beforeEach(async () => {
    modelService = {
      getClient: jest.fn(),
      getDefaultModel: jest.fn(),
      resolveModelId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecognizerService,
        { provide: ModelService, useValue: modelService },
      ],
    }).compile();

    service = module.get<RecognizerService>(RecognizerService);
  });

  it('uses the requested modelId before falling back to default', async () => {
    const requestedModelId = 'requested-model-id';
    const defaultModelId = 'default-model-id';
    const requestedClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: '{"params":{"username":"alice"},"confidence":0.9}',
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    service.registerTemplate({
      template_id: 'test-template',
      name: 'Test Template',
      params_schema: {
        properties: {
          username: { type: 'string' },
        },
      },
    });

    modelService.resolveModelId.mockResolvedValue(requestedModelId);
    modelService.getClient.mockImplementation((id: string) => {
      if (id === requestedModelId) {
        return requestedClient;
      }
      return null;
    });
    modelService.getDefaultModel.mockReturnValue({ id: defaultModelId });

    const result = await service.recognizeParams({
      template_id: 'test-template',
      user_input: 'username: alice',
      modelId: requestedModelId,
    });

    expect(modelService.resolveModelId).toHaveBeenCalledWith(requestedModelId);
    expect(modelService.getDefaultModel).not.toHaveBeenCalled();
    expect(requestedClient.chatCompletion).toHaveBeenCalled();
    expect(result.params).toEqual({ username: 'alice' });
  });

  it('normalizes scalar array values and supplements single-row document arrays from user input', async () => {
    const requestedModelId = 'requested-model-id';
    const requestedClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          params: {
            'items[].code': 'A001',
          },
          confidence: 0.88,
        }),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    service.registerTemplate({
      template_id: 'doc-template',
      name: 'Doc Template',
      params_schema: {
        properties: {
          'items[].code': { type: 'string' },
          'deliveryItems[].location': {
            type: 'string',
            description: '交付收货地址，指导供应商发货和物流安排',
          },
          'deliveryItems[].acceptanceType': {
            type: 'string',
            description: '验收方式，如到货验收、安装验收或到货+安装验收',
          },
        },
      },
    });

    modelService.resolveModelId.mockResolvedValue(requestedModelId);
    modelService.getClient.mockImplementation((id: string) => (id === requestedModelId ? requestedClient : null));
    modelService.getDefaultModel.mockReturnValue({ id: 'default-model-id' });

    const result = await service.recognizeParams({
      template_id: 'doc-template',
      user_input: '交付地点为江苏省苏州市工业园区 2 号厂房，到货后先验收，安装调试完成后再做性能验收。',
      modelId: requestedModelId,
    });

    expect(result.params).toEqual({
      'items[].code': ['A001'],
      'deliveryItems[].location': ['江苏省苏州市工业园区 2 号厂房'],
      'deliveryItems[].acceptanceType': ['到货+安装验收'],
    });
    expect(result.field_confidences).toEqual({
      'items[].code': 0.76,
      'deliveryItems[].location': 0.58,
      'deliveryItems[].acceptanceType': 0.58,
    });
  });

  it('requests evidence-based extraction and preserves field confidence metadata', async () => {
    const requestedModelId = 'requested-model-id';
    const requestedClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          params: {
            amount: 1000,
          },
          confidence: 0.42,
          field_confidences: {
            amount: 0.41,
          },
          uncertain_fields: ['amount', 'paymentSchedule[].amount'],
        }),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    service.registerTemplate({
      template_id: 'payment-template',
      name: 'Payment Template',
      params_schema: {
        properties: {
          amount: { type: 'number', description: '合同总金额' },
          'paymentSchedule[].amount': { type: 'number', description: '付款节点金额' },
        },
      },
    });

    modelService.resolveModelId.mockResolvedValue(requestedModelId);
    modelService.getClient.mockImplementation((id: string) => (id === requestedModelId ? requestedClient : null));
    modelService.getDefaultModel.mockReturnValue({ id: 'default-model-id' });

    const result = await service.recognizeParams({
      template_id: 'payment-template',
      user_input: '合同总金额 1000 元，请先生成。',
      modelId: requestedModelId,
    });

    const systemPrompt = requestedClient.chatCompletion.mock.calls[0]?.[0]?.[0]?.content as string;
    expect(systemPrompt).toContain('禁止根据常见业务惯例');
    expect(systemPrompt).toContain('uncertain_fields');
    expect(result.field_confidences).toEqual({
      amount: 0.41,
    });
    expect(result.uncertain_fields).toEqual(['amount']);
  });

  it('does not include empty placeholder defaults in recognizer prompt text', () => {
    const prompt = (service as any).buildSystemPromptFromSchema(
      'Prompt Template',
      {
        notes: {
          type: 'string',
          description: '备注',
          default: '',
        },
        signDate: {
          type: 'date',
          description: '签订日期',
          default: '',
        },
        timeout: {
          type: 'number',
          description: '超时时间',
          default: 30,
        },
      },
      undefined,
    );

    expect(prompt).not.toContain('notes: string - 备注 (默认值: )');
    expect(prompt).not.toContain('signDate: date - 签订日期 (默认值: )');
    expect(prompt).toContain('timeout: number - 超时时间 (默认值: 30)');
  });

  it('drops placeholder text values and prunes uncertain fields that no longer have candidate values', async () => {
    const requestedModelId = 'requested-model-id';
    const requestedClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          params: {
            notes: '未提供',
            installationCondition: '待补充',
            'items[].unit': ['N/A'],
            'info.partyA': '上海星联',
          },
          confidence: 0.66,
          field_confidences: {
            notes: 0.1,
            installationCondition: 0.2,
            'items[].unit': 0.1,
            'info.partyA': 1,
          },
          uncertain_fields: ['notes', 'installationCondition', 'items[].unit', 'info.partyA'],
        }),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    service.registerTemplate({
      template_id: 'placeholder-template',
      name: 'Placeholder Template',
      params_schema: {
        properties: {
          notes: { type: 'string', description: '备注' },
          installationCondition: { type: 'string', description: '安装条件' },
          'items[].unit': { type: 'string', description: '设备单位' },
          'info.partyA': { type: 'string', description: '甲方名称' },
        },
      },
    });

    modelService.resolveModelId.mockResolvedValue(requestedModelId);
    modelService.getClient.mockImplementation((id: string) => (id === requestedModelId ? requestedClient : null));
    modelService.getDefaultModel.mockReturnValue({ id: 'default-model-id' });

    const result = await service.recognizeParams({
      template_id: 'placeholder-template',
      user_input: '甲方是上海星联，其他内容暂未提供。',
      modelId: requestedModelId,
    });

    expect(result.params).toEqual({
      'info.partyA': '上海星联',
    });
    expect(result.field_confidences).toEqual({
      'info.partyA': 1,
    });
    expect(result.uncertain_fields).toEqual(['info.partyA']);
  });

  it('filters common placeholder variants while preserving real values in mixed arrays', async () => {
    const requestedModelId = 'requested-model-id';
    const requestedClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          params: {
            notes: '暂无数据',
            installationCondition: '不详',
            'items[].unit': ['台', '--', 'N.A.', '  暂未提供  '],
            'items[].remark': ['未说明。', '需现场安装'],
          },
          confidence: 0.73,
          field_confidences: {
            notes: 0.2,
            installationCondition: 0.2,
            'items[].unit': 0.55,
            'items[].remark': 0.56,
          },
          uncertain_fields: ['notes', 'installationCondition', 'items[].unit', 'items[].remark'],
        }),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    service.registerTemplate({
      template_id: 'placeholder-variants-template',
      name: 'Placeholder Variants Template',
      params_schema: {
        properties: {
          notes: { type: 'string', description: '备注' },
          installationCondition: { type: 'string', description: '安装条件' },
          'items[].unit': { type: 'string', description: '设备单位' },
          'items[].remark': { type: 'string', description: '物料备注' },
        },
      },
    });

    modelService.resolveModelId.mockResolvedValue(requestedModelId);
    modelService.getClient.mockImplementation((id: string) => (id === requestedModelId ? requestedClient : null));
    modelService.getDefaultModel.mockReturnValue({ id: 'default-model-id' });

    const result = await service.recognizeParams({
      template_id: 'placeholder-variants-template',
      user_input: '设备单位是台，备注为需现场安装，其余信息暂未明确。',
      modelId: requestedModelId,
    });

    expect(result.params).toEqual({
      'items[].unit': ['台'],
      'items[].remark': ['需现场安装'],
    });
    expect(result.field_confidences).toEqual({
      'items[].unit': 0.55,
      'items[].remark': 0.56,
    });
    expect(result.uncertain_fields).toEqual(['items[].unit', 'items[].remark']);
  });

  it('prefers schema semanticRole for array field supplementation over field name heuristics', async () => {
    const requestedModelId = 'requested-model-id';
    const requestedClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          params: {},
          confidence: 0.86,
        }),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    service.registerTemplate({
      template_id: 'semantic-role-template',
      name: 'Semantic Role Template',
      params_schema: {
        properties: {
          'milestone[].foo': {
            type: 'date',
            description: '节点日期',
            semanticRole: 'arrival_date',
          },
        },
      },
    });

    modelService.resolveModelId.mockResolvedValue(requestedModelId);
    modelService.getClient.mockImplementation((id: string) => (id === requestedModelId ? requestedClient : null));
    modelService.getDefaultModel.mockReturnValue({ id: 'default-model-id' });

    const result = await service.recognizeParams({
      template_id: 'semantic-role-template',
      user_input: '首批设备计划于 2026-06-20 到货，请据此安排后续流程。',
      modelId: requestedModelId,
    });

    expect(result.params).toEqual({
      'milestone[].foo': ['2026-06-20'],
    });
  });

  it('supplements missing scalar fields from explicit semanticRole signals', async () => {
    const requestedModelId = 'requested-model-id';
    const requestedClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          params: {},
          confidence: 0.83,
        }),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    service.registerTemplate({
      template_id: 'scalar-semantic-role-template',
      name: 'Scalar Semantic Role Template',
      params_schema: {
        properties: {
          installationDate: {
            type: 'date',
            description: '计划安装完成日期',
            semanticRole: 'installation_date',
          },
        },
      },
    });

    modelService.resolveModelId.mockResolvedValue(requestedModelId);
    modelService.getClient.mockImplementation((id: string) => (id === requestedModelId ? requestedClient : null));
    modelService.getDefaultModel.mockReturnValue({ id: 'default-model-id' });

    const result = await service.recognizeParams({
      template_id: 'scalar-semantic-role-template',
      user_input: '设备预计 2026-08-18 完成安装调试，请提前准备验收。',
      modelId: requestedModelId,
    });

    expect(result.params).toEqual({
      installationDate: '2026-08-18',
    });
    expect(result.field_confidences).toEqual({
      installationDate: 0.62,
    });
  });

  it('does not cross-fill installation date from arrival date when installation date is only a placeholder', async () => {
    const requestedModelId = 'requested-model-id';
    const requestedClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          params: {
            arrivalDate: '2026-06-20',
            installationDate: 'N/A',
          },
          confidence: 0.8,
          field_confidences: {
            arrivalDate: 1,
            installationDate: 0.4,
          },
          uncertain_fields: ['installationDate'],
        }),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    service.registerTemplate({
      template_id: 'installation-date-guard-template',
      name: 'Installation Date Guard Template',
      params_schema: {
        properties: {
          arrivalDate: {
            type: 'date',
            description: '计划到货日期',
            semanticRole: 'arrival_date',
          },
          installationDate: {
            type: 'date',
            description: '安装完成日期',
            semanticRole: 'installation_date',
          },
        },
      },
    });

    modelService.resolveModelId.mockResolvedValue(requestedModelId);
    modelService.getClient.mockImplementation((id: string) => (id === requestedModelId ? requestedClient : null));
    modelService.getDefaultModel.mockReturnValue({ id: 'default-model-id' });

    const result = await service.recognizeParams({
      template_id: 'installation-date-guard-template',
      user_input: '首批设备到货日期为 2026-06-20，安装完成日期 N/A，验收方式为到货后验收、安装完成后再做性能验收。',
      modelId: requestedModelId,
    });

    expect(result.params).toEqual({
      arrivalDate: '2026-06-20',
    });
    expect(result.field_confidences).toEqual({
      arrivalDate: 1,
    });
    expect(result.uncertain_fields).toEqual([]);
  });

  it('does not infer acceptance standard or payment stage from broad semantic hint overlap', async () => {
    const requestedModelId = 'requested-model-id';
    const requestedClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          params: {},
          confidence: 0.74,
        }),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    service.registerTemplate({
      template_id: 'semantic-hint-guard-template',
      name: 'Semantic Hint Guard Template',
      params_schema: {
        properties: {
          acceptanceStandard: {
            type: 'string',
            description: '验收标准',
          },
          'paymentSchedule[].paymentStage': {
            type: 'string',
            description: '付款阶段标识，如预付款、到货款、验收款、质保金等',
          },
        },
      },
    });

    modelService.resolveModelId.mockResolvedValue(requestedModelId);
    modelService.getClient.mockImplementation((id: string) => (id === requestedModelId ? requestedClient : null));
    modelService.getDefaultModel.mockReturnValue({ id: 'default-model-id' });

    const result = await service.recognizeParams({
      template_id: 'semantic-hint-guard-template',
      user_input: '到货日期为 2026-06-20，验收方式为到货后验收、安装完成后再做性能验收。',
      modelId: requestedModelId,
    });

    expect(result.params).toEqual({});
    expect(result.field_confidences).toEqual({});
    expect(result.uncertain_fields).toEqual([]);
  });

  it('drops model outputs that are semantically incompatible with standard or stage fields', async () => {
    const requestedModelId = 'requested-model-id';
    const requestedClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          params: {
            acceptanceStandard: '到货后验收、安装完成后再做性能验收',
            'paymentSchedule[].paymentStage': ['2026-06-20'],
            'deliveryItems[].acceptanceType': ['到货后验收、安装完成后再做性能验收'],
          },
          confidence: 0.71,
          field_confidences: {
            acceptanceStandard: 1,
            'paymentSchedule[].paymentStage': 1,
            'deliveryItems[].acceptanceType': 1,
          },
          uncertain_fields: [],
        }),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    service.registerTemplate({
      template_id: 'semantic-compatibility-template',
      name: 'Semantic Compatibility Template',
      params_schema: {
        properties: {
          acceptanceStandard: {
            type: 'string',
            description: '验收标准',
          },
          'paymentSchedule[].paymentStage': {
            type: 'string',
            description: '付款阶段标识，如预付款、到货款、验收款、质保金等',
          },
          'deliveryItems[].acceptanceType': {
            type: 'string',
            description: '验收方式',
            extractionHints: ['验收类型', '到货验收', '安装验收'],
          },
        },
      },
    });

    modelService.resolveModelId.mockResolvedValue(requestedModelId);
    modelService.getClient.mockImplementation((id: string) => (id === requestedModelId ? requestedClient : null));
    modelService.getDefaultModel.mockReturnValue({ id: 'default-model-id' });

    const result = await service.recognizeParams({
      template_id: 'semantic-compatibility-template',
      user_input: '到货日期为 2026-06-20，验收方式为到货后验收、安装完成后再做性能验收。',
      modelId: requestedModelId,
    });

    expect(result.params).toEqual({
      'deliveryItems[].acceptanceType': ['到货后验收、安装完成后再做性能验收'],
    });
    expect(result.field_confidences).toEqual({
      'deliveryItems[].acceptanceType': 1,
    });
  });

  it('infers semantic extraction strategy from configured schema hints when semanticRole is absent', async () => {
    const requestedModelId = 'requested-model-id';
    const requestedClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          params: {},
          confidence: 0.84,
        }),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    service.registerTemplate({
      template_id: 'semantic-hint-template',
      name: 'Semantic Hint Template',
      params_schema: {
        properties: {
          'deliveryPlan[].scheduledAt': {
            type: 'date',
            description: '计划到货日期',
            extractionHints: ['到货日期', '交付日期'],
          },
        },
      },
    });

    modelService.resolveModelId.mockResolvedValue(requestedModelId);
    modelService.getClient.mockImplementation((id: string) => (id === requestedModelId ? requestedClient : null));
    modelService.getDefaultModel.mockReturnValue({ id: 'default-model-id' });

    const result = await service.recognizeParams({
      template_id: 'semantic-hint-template',
      user_input: '第一批设备预计 2026-07-15 到货，请提前安排现场收货。',
      modelId: requestedModelId,
    });

    expect(result.params).toEqual({
      'deliveryPlan[].scheduledAt': ['2026-07-15'],
    });
  });

  it('supplements missing scalar fields from configured extraction hints when semanticRole is absent', async () => {
    const requestedModelId = 'requested-model-id';
    const requestedClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          params: {},
          confidence: 0.81,
        }),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    service.registerTemplate({
      template_id: 'scalar-semantic-hint-template',
      name: 'Scalar Semantic Hint Template',
      params_schema: {
        properties: {
          acceptanceType: {
            type: 'string',
            description: '验收方式',
            extractionHints: ['验收类型', '到货验收', '安装验收'],
          },
        },
      },
    });

    modelService.resolveModelId.mockResolvedValue(requestedModelId);
    modelService.getClient.mockImplementation((id: string) => (id === requestedModelId ? requestedClient : null));
    modelService.getDefaultModel.mockReturnValue({ id: 'default-model-id' });

    const result = await service.recognizeParams({
      template_id: 'scalar-semantic-hint-template',
      user_input: '本次设备到货后先做外观与数量验收，安装调试完成后再做性能验收。',
      modelId: requestedModelId,
    });

    expect(result.params).toEqual({
      acceptanceType: '到货+安装验收',
    });
    expect(result.field_confidences).toEqual({
      acceptanceType: 0.62,
    });
  });

  it('preserves zero confidence returned by the model for downstream follow-up decisions', async () => {
    const requestedModelId = 'requested-model-id';
    const requestedClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          params: {},
          confidence: 0,
        }),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    service.registerTemplate({
      template_id: 'zero-confidence-template',
      name: 'Zero Confidence Template',
      params_schema: {
        properties: {
          amount: { type: 'number', description: '合同金额' },
        },
      },
    });

    modelService.resolveModelId.mockResolvedValue(requestedModelId);
    modelService.getClient.mockImplementation((id: string) => (id === requestedModelId ? requestedClient : null));
    modelService.getDefaultModel.mockReturnValue({ id: 'default-model-id' });

    const result = await service.recognizeParams({
      template_id: 'zero-confidence-template',
      user_input: '这个问题我也不确定，先别假设金额。',
      modelId: requestedModelId,
    });

    expect(result.confidence).toBe(0);
  });

  it('drops empty arrays and null date arrays so required document fields stay unresolved', async () => {
    const requestedModelId = 'requested-model-id';
    const requestedClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          params: {
            'items[].code': [],
            'items[].spec': [],
            'deliveryItems[].arrivalDate': [null],
            'items[].name': ['六轴机械臂'],
          },
          confidence: 0.86,
        }),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    service.registerTemplate({
      template_id: 'empty-array-template',
      name: 'Empty Array Template',
      params_schema: {
        properties: {
          'items[].code': { type: 'string', description: '物料编码' },
          'items[].spec': { type: 'string', description: '规格型号' },
          'deliveryItems[].arrivalDate': { type: 'date', description: '到货日期' },
          'items[].name': { type: 'string', description: '设备名称' },
        },
      },
    });

    modelService.resolveModelId.mockResolvedValue(requestedModelId);
    modelService.getClient.mockImplementation((id: string) => (id === requestedModelId ? requestedClient : null));
    modelService.getDefaultModel.mockReturnValue({ id: 'default-model-id' });

    const result = await service.recognizeParams({
      template_id: 'empty-array-template',
      user_input: '生成采购合同，设备名称是六轴机械臂。',
      modelId: requestedModelId,
    });

    expect(result.params).toEqual({
      'items[].name': ['六轴机械臂'],
    });
    expect(result.field_confidences).toEqual({
      'items[].name': 0.76,
    });
  });
});
