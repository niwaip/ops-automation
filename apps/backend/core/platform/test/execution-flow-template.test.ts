import { ExecutionFlowTemplateService } from '../src/workflow-registry/flow-template';

describe('ExecutionFlowTemplateService', () => {
  const createService = () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    const executionFlowValidationService = {
      validateTemplate: jest.fn(),
    };

    const service = new ExecutionFlowTemplateService(
      prisma as any,
      executionFlowValidationService as any
    );
    return { service, prisma, executionFlowValidationService };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores inputPolicy inside params_schema and returns it as a dedicated dto field', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        id: 'flow-1',
        name: '合同流程',
        description: 'desc',
        goal: 'goal',
        expectedResult: 'result',
        paramsSchema: {
          properties: {
            contractNo: {
              type: 'string',
              description: '合同编号',
              default: 'HT-001',
            },
          },
          required: ['contractNo'],
          inputPolicy: {
            params: {
              contractNo: {
                enabled: true,
                requiredMode: 'conditional',
                defaultValue: 'HT-001',
                templateBinding: 'contract.no',
                valueSourcePriority: ['user_input', 'external'],
                confirmationThreshold: 1,
              },
            },
          },
        },
        category: 'document',
        steps: [{ id: 'step-1', type: 'text', name: '收集参数' }],
        executionFlowKeys: ['合同'],
        usageCount: 0,
        isPublic: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await service.createTemplate({
      name: '合同流程',
      paramsSchema: {
        properties: {
          contractNo: {
            type: 'string',
            description: '合同编号',
            default: 'HT-001',
          },
        },
        required: ['contractNo'],
      },
      inputPolicy: {
        params: {
          contractNo: {
            requiredMode: 'conditional',
            templateBinding: 'contract.no',
            valueSourcePriority: [' user_input ', '', 'external'],
            confirmationThreshold: 3,
          },
        },
      },
      steps: [{ type: 'text', name: '收集参数' }],
    });

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO execution_flow_templates'),
      expect.any(String),
      '合同流程',
      null,
      null,
      null,
      expect.any(String),
      'document',
      expect.any(String),
      JSON.stringify([]),
      true,
      '00000000-0000-0000-0000-000000000000'
    );
    expect(JSON.parse(prisma.$queryRawUnsafe.mock.calls[0][6])).toEqual({
      properties: {
        contractNo: {
          type: 'string',
          description: '合同编号',
          default: 'HT-001',
        },
      },
      required: ['contractNo'],
      inputPolicy: {
        params: {
          contractNo: {
            enabled: true,
            requiredMode: 'conditional',
            defaultValue: 'HT-001',
            templateBinding: 'contract.no',
            valueSourcePriority: ['user_input', 'external'],
            confirmationThreshold: 1,
          },
        },
      },
    });

    expect(result.paramsSchema).toEqual({
      properties: {
        contractNo: {
          type: 'string',
          description: '合同编号',
          default: 'HT-001',
        },
      },
      required: ['contractNo'],
    });
    expect(result.inputPolicy).toEqual({
      params: {
        contractNo: {
          enabled: true,
          requiredMode: 'conditional',
          defaultValue: 'HT-001',
          templateBinding: 'contract.no',
          valueSourcePriority: ['user_input', 'external'],
          confirmationThreshold: 1,
        },
      },
    });
  });

  it('updates only inputPolicy while preserving existing paramsSchema', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'flow-1',
          name: '合同流程',
          paramsSchema: {
            properties: {
              contractNo: {
                type: 'string',
                description: '合同编号',
              },
            },
            required: ['contractNo'],
          },
          category: 'document',
          steps: [],
          executionFlowKeys: [],
          usageCount: 0,
          isPublic: true,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'flow-1',
          name: '合同流程',
          paramsSchema: {
            properties: {
              contractNo: {
                type: 'string',
                description: '合同编号',
              },
            },
            required: ['contractNo'],
            inputPolicy: {
              params: {
                contractNo: {
                  enabled: true,
                  requiredMode: 'always',
                  templateBinding: 'contract.no',
                },
              },
            },
          },
          category: 'document',
          steps: [],
          executionFlowKeys: [],
          usageCount: 0,
          isPublic: true,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

    const result = await service.updateTemplate('flow-1', {
      inputPolicy: {
        params: {
          contractNo: {
            requiredMode: 'always',
            templateBinding: 'contract.no',
          },
        },
      },
    });

    expect(prisma.$queryRawUnsafe).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE execution_flow_templates SET'),
      JSON.stringify({
        properties: {
          contractNo: {
            type: 'string',
            description: '合同编号',
          },
        },
        required: ['contractNo'],
        inputPolicy: {
          params: {
            contractNo: {
              enabled: true,
              requiredMode: 'always',
              templateBinding: 'contract.no',
            },
          },
        },
      }),
      'flow-1'
    );
    expect(result?.paramsSchema).toEqual({
      properties: {
        contractNo: {
          type: 'string',
          description: '合同编号',
        },
      },
      required: ['contractNo'],
    });
    expect(result?.inputPolicy).toEqual({
      params: {
        contractNo: {
          enabled: true,
          requiredMode: 'always',
          templateBinding: 'contract.no',
        },
      },
    });
  });

  it('rejects inputPolicy keys that are not declared in paramsSchema', async () => {
    const { service } = createService();

    await expect(
      service.createTemplate({
        name: '非法流程',
        paramsSchema: {
          properties: {
            contractNo: {
              type: 'string',
              description: '合同编号',
            },
          },
          required: ['contractNo'],
        },
        inputPolicy: {
          params: {
            unknownField: {
              requiredMode: 'always',
            },
          },
        },
        steps: [{ type: 'text', name: '收集参数' }],
      })
    ).rejects.toThrow('inputPolicy.params 包含未注册参数: unknownField');
  });

  it('keeps legacy schema strategy fields in generated inputPolicy during migration', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        id: 'flow-legacy-1',
        name: '迁移中合同流程',
        paramsSchema: {
          properties: {
            contractNo: {
              type: 'string',
              description: '合同编号',
              default: 'HT-001',
              previewBlocking: true,
              confirmationThreshold: 0.85,
            },
          },
          required: ['contractNo'],
          inputPolicy: {
            params: {
              contractNo: {
                enabled: true,
                requiredMode: 'always',
                defaultValue: 'HT-001',
                previewBlocking: true,
                confirmationThreshold: 0.85,
              },
            },
          },
        },
        category: 'document',
        steps: [{ id: 'step-1', type: 'text', name: '收集参数' }],
        executionFlowKeys: ['合同'],
        usageCount: 0,
        isPublic: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await service.createTemplate({
      name: '迁移中合同流程',
      paramsSchema: {
        properties: {
          contractNo: {
            type: 'string',
            description: '合同编号',
            default: 'HT-001',
            previewBlocking: true,
            confirmationThreshold: 0.85,
          },
        },
        required: ['contractNo'],
      },
      steps: [{ type: 'text', name: '收集参数' }],
    });

    expect(JSON.parse(prisma.$queryRawUnsafe.mock.calls[0][6])).toEqual({
      properties: {
        contractNo: {
          type: 'string',
          description: '合同编号',
          default: 'HT-001',
          previewBlocking: true,
          confirmationThreshold: 0.85,
        },
      },
      required: ['contractNo'],
      inputPolicy: {
        params: {
          contractNo: {
            enabled: true,
            requiredMode: 'always',
            defaultValue: 'HT-001',
            previewBlocking: true,
            confirmationThreshold: 0.85,
          },
        },
      },
    });
    expect(result.inputPolicy).toEqual({
      params: {
        contractNo: {
          enabled: true,
          requiredMode: 'always',
          defaultValue: 'HT-001',
          previewBlocking: true,
          confirmationThreshold: 0.85,
        },
      },
    });
  });

  it('rejects illegal strategy fields inside inputPolicy param entries', async () => {
    const { service } = createService();

    await expect(
      service.createTemplate({
        name: '非法策略字段流程',
        paramsSchema: {
          properties: {
            contractNo: {
              type: 'string',
              description: '合同编号',
            },
          },
          required: ['contractNo'],
        },
        inputPolicy: {
          params: {
            contractNo: {
              required: true,
            } as any,
          },
        },
        steps: [{ type: 'text', name: '收集参数' }],
      })
    ).rejects.toThrow('inputPolicy.params.contractNo 包含非法字段: required');
  });

  it('rejects inputPolicy defaultValue that does not match the declared param type', async () => {
    const { service } = createService();

    await expect(
      service.createTemplate({
        name: '非法默认值流程',
        paramsSchema: {
          properties: {
            retryCount: {
              type: 'number',
              description: '重试次数',
            },
          },
          required: [],
        },
        inputPolicy: {
          params: {
            retryCount: {
              defaultValue: '3',
            },
          },
        },
        steps: [{ type: 'text', name: '收集参数' }],
      })
    ).rejects.toThrow('inputPolicy.params.retryCount.defaultValue 与参数类型 number 不兼容');
  });

  it('syncs default document flow template to render-resolved endpoint on module init', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockImplementation(async (sql: string, ...params: any[]) => {
      if (sql.includes('SELECT id FROM execution_flow_templates')) {
        return [];
      }

      if (sql.includes('INSERT INTO execution_flow_templates')) {
        return [
          {
            id: params[0],
            name: params[1],
            description: params[2],
            goal: params[3],
            expectedResult: params[4],
            paramsSchema: JSON.parse(params[5]),
            category: params[6],
            steps: JSON.parse(params[7]),
            executionFlowKeys: JSON.parse(params[8]),
            usageCount: 0,
            isPublic: params[9],
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    await service.onModuleInit();

    const insertCalls = prisma.$queryRawUnsafe.mock.calls.filter((call) => {
      return (
        typeof call[0] === 'string' && call[0].includes('INSERT INTO execution_flow_templates')
      );
    });
    expect(insertCalls).toHaveLength(2);

    const createdDocumentFlowSteps = JSON.parse(insertCalls[1][8]);
    expect(createdDocumentFlowSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'api',
          name: '渲染文档',
          api: expect.objectContaining({
            endpoint: '/api/carbone/render-resolved',
            method: 'POST',
          }),
        }),
      ])
    );
  });
});
