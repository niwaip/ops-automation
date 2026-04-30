import { ModelRouterService } from './model-router.service';
import { ToolResult } from './interfaces';

describe('ModelRouterService', () => {
  it('resolves initial model from fallback chain head', () => {
    const modelService = {
      getFallbackModelIds: jest.fn().mockReturnValue(['m-1', 'm-2']),
    } as any;

    const service = new ModelRouterService(modelService);
    expect(service.resolveInitialModel('default')).toEqual({
      modelId: 'm-1',
      attemptedModelIds: ['m-1'],
      reason: 'resolved_default_model',
    });
  });

  it('prefers document-capable model for document tasks when default model is requested', () => {
    const modelService = {
      getFallbackModelIds: jest.fn().mockReturnValue(['chat-model', 'doc-model', 'coder-model']),
      listActiveModelsForRouting: jest.fn().mockReturnValue([
        {
          id: 'chat-model',
          name: 'abab6.5s-chat',
          provider: 'minimax',
          api_endpoint: 'https://example.com',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
          config: {
            description: '对话模型',
            default: true,
          },
        },
        {
          id: 'doc-model',
          name: 'gpt-4o',
          provider: 'openai',
          api_endpoint: 'https://example.com',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
          config: {
            description: '多模态模型',
            input: ['text', 'image'],
          },
        },
        {
          id: 'coder-model',
          name: 'qwen3-coder-plus',
          provider: 'alibaba-coding',
          api_endpoint: 'https://example.com',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
          config: {
            description: '编程模型',
          },
        },
      ]),
    } as any;

    const service = new ModelRouterService(modelService);
    expect(service.resolveInitialModel('default', undefined, undefined, {
      mode: 'task',
      userInput: '生成合同文档并导出 PDF',
      availableSkills: [
        {
          skillId: 'skill-1',
          skillName: '合同文档生成',
          triggerKeywords: ['合同', '文档'],
          paramsSchema: { properties: {}, required: [] },
          executionType: 'document',
        },
      ],
    })).toEqual({
      modelId: 'doc-model',
      attemptedModelIds: ['doc-model'],
      reason: 'task_type_document',
    });
  });

  it('prefers coder model for flow-like automation tasks', () => {
    const modelService = {
      getFallbackModelIds: jest.fn().mockReturnValue(['general-model', 'coder-model']),
      listActiveModelsForRouting: jest.fn().mockReturnValue([
        {
          id: 'general-model',
          name: 'MiniMax-M2.7',
          provider: 'minimax',
          api_endpoint: 'https://example.com',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
          config: {
            description: '默认模型',
            default: true,
          },
        },
        {
          id: 'coder-model',
          name: 'deepseek-coder',
          provider: 'deepseek',
          api_endpoint: 'https://example.com',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
          config: {
            description: '编程专用模型',
          },
        },
      ]),
    } as any;

    const service = new ModelRouterService(modelService);
    expect(service.resolveInitialModel('default', undefined, undefined, {
      mode: 'task',
      userInput: '执行浏览器自动化流程并修复接口脚本',
    })).toEqual({
      modelId: 'coder-model',
      attemptedModelIds: ['coder-model'],
      reason: 'task_type_code',
    });
  });

  it('uses cross-provider-first order for provider errors', () => {
    const modelService = {
      getFallbackModelIds: jest.fn().mockImplementation((_id: string, strategy?: { groupOrder: string[] }) => {
        if (strategy?.groupOrder?.[0] === 'cross_provider') {
          return ['primary', 'cross-backup', 'same-backup'];
        }
        return ['primary', 'same-backup', 'cross-backup'];
      }),
    } as any;

    const service = new ModelRouterService(modelService);
    const result: ToolResult = {
      success: false,
      output: 'AI调用失败',
      code: 'provider_error',
      data: {
        errorCategory: 'provider_error',
      },
    };

    expect(service.resolveFallbackModel('primary', ['primary'], result)).toEqual({
      modelId: 'cross-backup',
      attemptedModelIds: ['primary', 'cross-backup'],
      reason: 'provider_error',
      strategy: {
        groupOrder: ['cross_provider', 'same_provider'],
        includeCurrentModel: true,
        reason: 'provider_error',
      },
    });
  });
});
