import { Test, TestingModule } from '@nestjs/testing';
import { ModelController } from './model.controller';
import { ModelService } from '../modules/model/model.service';
import { OpenAICompatibleClient } from '../client/openai-compatible';
import { PromptDebugSettingsService } from '../modules/debug-settings/prompt-debug-settings.service';

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
});
