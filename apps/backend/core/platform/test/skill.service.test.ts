import { SkillService } from '../src/modules/skill/skill.service';

describe('SkillService workflow input policy enrichment', () => {
  const createService = () => {
    const prisma = {
      skillConfig: {
        findMany: jest.fn(),
      },
    };
    const executionFlowService = {
      getTemplate: jest.fn(),
    };
    const toolCatalogService = {} as any;

    const service = new SkillService(prisma as any, executionFlowService as any, toolCatalogService);
    return { service, prisma, executionFlowService };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('merges template workflow input policy into existing runtime metadata and lets template values win', async () => {
    const { service, executionFlowService } = createService();
    executionFlowService.getTemplate.mockResolvedValue({
      inputPolicy: {
        params: {
          contractNo: {
            requiredMode: 'always',
            templateBinding: 'contract.no',
          },
          buyerName: {
            enabled: true,
            templateBinding: 'contract.buyer.name',
          },
        },
      },
    });

    const result = await (service as any).enrichSkillWithWorkflowInputPolicy(
      {
        id: 'skill-1',
        name: '合同生成',
        description: 'desc',
        triggerKeywords: ['合同'],
        paramsSchema: { properties: {}, required: [] },
        executionFlowTemplateIds: ['flow-1'],
        executionFlow: [],
        tools: [],
        isActive: true,
        isPublished: false,
        apiEndpoints: {
          runtimeMetadata: {
            workflowInputPolicy: {
              params: {
                contractNo: {
                  requiredMode: 'optional',
                  valueSourcePriority: ['user_input', 'workflow_default'],
                  confirmationThreshold: 0.8,
                },
              },
            },
          },
        },
      },
      {
        executionFlowTemplateIds: ['flow-1'],
      },
    );

    expect(result.apiEndpoints?.runtimeMetadata?.workflowInputPolicy).toEqual({
      params: {
        contractNo: {
          requiredMode: 'always',
          valueSourcePriority: ['user_input', 'workflow_default'],
          confirmationThreshold: 0.8,
          templateBinding: 'contract.no',
        },
        buyerName: {
          enabled: true,
          templateBinding: 'contract.buyer.name',
        },
      },
    });
  });

  it('keeps existing runtime metadata when linked templates do not provide workflow input policy', async () => {
    const { service, executionFlowService } = createService();
    executionFlowService.getTemplate.mockResolvedValue({
      inputPolicy: undefined,
    });

    const skill = {
      id: 'skill-2',
      name: '合同生成',
      description: 'desc',
      triggerKeywords: ['合同'],
      paramsSchema: { properties: {}, required: [] },
      executionFlowTemplateIds: ['flow-2'],
      executionFlow: [],
      tools: [],
      isActive: true,
      isPublished: false,
      apiEndpoints: {
        runtimeMetadata: {
          workflowInputPolicy: {
            params: {
              contractNo: {
                requiredMode: 'optional',
              },
            },
          },
        },
      },
    };

    const result = await (service as any).enrichSkillWithWorkflowInputPolicy(
      skill,
      {
        executionFlowTemplateIds: ['flow-2'],
      },
    );

    expect(result).toEqual(skill);
  });

  it('hydrates document renderPath metadata from carbone mapping hints', async () => {
    const { service } = createService();

    const paramsSchema = {
      properties: {
        'contract.partyA': {
          type: 'string',
          description: '甲方',
        },
        'items[].quantity': {
          type: 'number',
          description: '数量',
        },
        'otherTerms.title': {
          type: 'string',
          description: '其他约定事项标题',
        },
        unchanged: {
          type: 'string',
          description: '保持原样',
          renderPath: 'custom.value',
        },
      },
      required: [],
    };
    const hydrated = (service as any).hydrateParamsSchemaRenderPaths(paramsSchema, {
      mappingHints: [
        { parameter: 'contract.partyA_cn', path: '{d.contract.partyA_cn}' },
        { parameter: 'contract.partyA_jp', path: '{d.contract.partyA_jp}' },
        { parameter: 'items[].quantity_cn', path: '{d.items[].quantity_cn}' },
        { parameter: 'items[].quantity_jp', path: '{d.items[].quantity_jp}' },
        { parameter: 'otherTerms.title_jp', path: '{d.otherTerms.title_jp}' },
      ],
    });
    expect(hydrated.properties['contract.partyA'].renderPath).toEqual([
      'contract.partyA_cn',
      'contract.partyA_jp',
    ]);
    expect(hydrated.properties['items[].quantity'].renderPath).toEqual([
      'items[].quantity_cn',
      'items[].quantity_jp',
    ]);
    expect(hydrated.properties['otherTerms.title'].renderPath).toBe('otherTerms.title_jp');
    expect(hydrated.properties.unchanged.renderPath).toBe('custom.value');
  });
});
