import { Test, TestingModule } from '@nestjs/testing';
import { OpenAICompatibleClient } from '../../client/openai-compatible';
import { PromptDebugSettingsService } from '../debug-settings/prompt-debug-settings.service';
import { ModelController } from './model.controller';
import { ModelService } from './model.service';

describe('ModelController provider governance', () => {
  let controller: ModelController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModelController],
      providers: [
        ModelService,
        {
          provide: PromptDebugSettingsService,
          useValue: {
            getSettings: jest.fn().mockReturnValue({ promptDebugEnabled: false }),
            updateSettings: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ModelController>(ModelController);
  });

  it('creates a provider, binds a model to providerConfigId, and checks provider health', async () => {
    const provider = await controller.createProviderConfig({
      provider: 'openai',
      api_endpoint: 'https://api.openai.com/v1',
      api_key: 'provider-key',
    });

    const model = await controller.createModel({
      name: 'gpt-4o',
      provider: 'ignored-provider',
      api_endpoint: 'https://ignored.example.com/v1',
      providerConfigId: provider.id,
      config: {
        capability_tier: 'advanced',
      },
    });

    const listModelsSpy = jest
      .spyOn(OpenAICompatibleClient.prototype, 'listModels')
      .mockResolvedValue(['gpt-4o']);

    const health = await controller.checkProviderHealth(provider.id);

    expect(model).toMatchObject({
      name: 'gpt-4o',
      provider: 'openai',
      api_endpoint: 'https://api.openai.com/v1',
      providerConfigId: provider.id,
      config: expect.objectContaining({
        capability_tier: 'advanced',
      }),
    });
    expect(health).toEqual({
      success: true,
      response: 'Successfully connected. Found 1 models available.',
    });

    listModelsSpy.mockRestore();
  });

  it('loads provider model names through the controller', async () => {
    const provider = await controller.createProviderConfig({
      provider: 'minimax',
      api_endpoint: 'https://api.minimax.chat/v1',
      api_key: 'provider-key',
    });

    const listModelsSpy = jest
      .spyOn(OpenAICompatibleClient.prototype, 'listModels')
      .mockResolvedValue(['abab6.5-chat', 'MiniMax-M2.7']);

    const result = await controller.listProviderModels(provider.id);

    expect(result).toEqual({
      providerConfigId: provider.id,
      models: ['abab6.5-chat', 'MiniMax-M2.7'],
    });

    listModelsSpy.mockRestore();
  });

  it('tests the configured default model through the default alias', async () => {
    await controller.createModel({
      name: 'gpt-4o-default',
      provider: 'openai',
      api_endpoint: 'https://api.openai.com/v1',
      api_key: 'model-key',
      config: {
        default_scope: {
          global: true,
        },
      },
    });

    const chatCompletionSpy = jest
      .spyOn(OpenAICompatibleClient.prototype, 'chatCompletion')
      .mockResolvedValue({
        content: '{"ok":true}',
      });

    const result = await controller.testModel('default', { prompt: 'ping' });

    expect(result).toEqual({
      success: true,
      response: '{"ok":true}',
    });
    expect(chatCompletionSpy).toHaveBeenCalledWith([{ role: 'user', content: 'ping' }]);

    chatCompletionSpy.mockRestore();
  });

  it('prefers the task default model over audio transcription when testing the default alias', async () => {
    await controller.createModel({
      name: 'speech-model',
      provider: 'openai',
      api_endpoint: 'https://api.openai.com/v1',
      api_key: 'speech-key',
      config: {
        default_scope: {
          audio_transcription: true,
        },
      },
    });
    const taskModel = await controller.createModel({
      name: 'task-model',
      provider: 'openai',
      api_endpoint: 'https://api.openai.com/v1',
      api_key: 'task-key',
      config: {
        default_scope: {
          admin_task: true,
        },
      },
    });

    const chatCompletionSpy = jest
      .spyOn(OpenAICompatibleClient.prototype, 'chatCompletion')
      .mockResolvedValue({
        content: '{"ok":true}',
      });

    const result = await controller.testModel('default', { prompt: 'ping' });

    expect(result).toEqual({
      success: true,
      response: '{"ok":true}',
    });
    expect(chatCompletionSpy).toHaveBeenCalledTimes(1);
    expect((chatCompletionSpy.mock.instances[0] as any)?.model).toBe(taskModel.name);

    chatCompletionSpy.mockRestore();
  });

  it('checks health of all registered models in batch', async () => {
    await controller.createModel({
      name: 'batch-model-1',
      provider: 'openai',
      api_endpoint: 'https://api.openai.com/v1',
      api_key: 'key-1',
    });

    const chatCompletionSpy = jest
      .spyOn(OpenAICompatibleClient.prototype, 'chatCompletion')
      .mockResolvedValue({
        content: 'OK',
      });

    const result = await controller.checkAllModelsHealth();

    expect(result.total).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0]).toMatchObject({
      modelName: 'batch-model-1',
      success: true,
      response: 'OK',
    });

    chatCompletionSpy.mockRestore();
  });
});
