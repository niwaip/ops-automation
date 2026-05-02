import { Test, TestingModule } from '@nestjs/testing';
import { ModelService } from './model.service';
import { OpenAICompatibleClient } from '../../client/openai-compatible';

describe('ModelService provider credential reuse', () => {
  let service: ModelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ModelService],
    }).compile();

    service = module.get<ModelService>(ModelService);
  });

  it('reuses existing provider credentials when appending another model under the same provider', async () => {
    const existing = await service.createModel({
      name: 'gpt-4o',
      provider: 'openai',
      api_endpoint: 'https://api.openai.com/v1',
      api_key: 'shared-provider-key',
      config: {},
    });

    const appended = await service.createModel({
      name: 'gpt-4.1',
      provider: 'openai',
      api_endpoint: 'https://api.openai.com/v1',
      config: {},
    });

    const appendedModel = await service.getModel(appended.id);

    expect(existing.id).not.toBe(appended.id);
    expect(appendedModel?.providerConfigId).toBe(existing.providerConfigId);
    expect(appendedModel?.hasApiKey).toBe(true);
    expect(service.getClient(appended.id)).not.toBeNull();
  });

  it('builds provider-level summaries for governance views', async () => {
    await service.createModel({
      name: 'gpt-4o',
      provider: 'openai',
      api_endpoint: 'https://api.openai.com/v1',
      api_key: 'shared-provider-key',
      config: {
        capability_tier: 'advanced',
        default_scope: {
          admin_chat: true,
        },
      },
    });

    await service.createModel({
      name: 'gpt-4.1-mini',
      provider: 'openai',
      api_endpoint: 'https://api.openai.com/v1',
      config: {
        default_scope: {
          global: true,
        },
      },
    });

    const summaries = service.listProviderSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      provider: 'openai',
      api_endpoint: 'https://api.openai.com/v1',
      modelCount: 2,
      activeModelCount: 2,
      hasCredential: true,
      advancedModelCount: 1,
      defaultScopes: expect.arrayContaining(['global', 'admin_chat']),
    });
  });

  it('creates standalone provider configs for provider-first governance', async () => {
    const provider = await service.createProviderConfig({
      provider: 'siliconflow',
      api_endpoint: 'https://api.siliconflow.cn/v1',
      api_key: 'provider-only-key',
    });

    const providers = await service.listProviderConfigs();

    expect(providers).toHaveLength(1);
    expect(provider).toMatchObject({
      provider: 'siliconflow',
      api_endpoint: 'https://api.siliconflow.cn/v1',
      hasCredential: true,
    });
    expect(providers[0]).toMatchObject({
      id: provider.id,
      provider: 'siliconflow',
      hasCredential: true,
    });
  });

  it('updates provider configs and propagates endpoint changes to attached models', async () => {
    const model = await service.createModel({
      name: 'gpt-4o',
      provider: 'openai',
      api_endpoint: 'https://api.openai.com/v1',
      api_key: 'shared-provider-key',
      config: {},
    });

    const providers = await service.listProviderConfigs();
    expect(providers).toHaveLength(1);
    const provider = providers[0]!;

    const updatedProvider = await service.updateProviderConfig(provider.id, {
      api_endpoint: 'https://gateway.example.com/openai/v1',
    });
    const updatedModel = await service.getModel(model.id);

    expect(updatedProvider).toMatchObject({
      id: provider.id,
      api_endpoint: 'https://gateway.example.com/openai/v1',
      hasCredential: true,
    });
    expect(updatedModel).toMatchObject({
      id: model.id,
      api_endpoint: 'https://gateway.example.com/openai/v1',
      providerConfigId: provider.id,
    });
    expect(service.getClient(model.id)).not.toBeNull();
  });

  it('binds models to an explicit providerConfigId when creating from a provider config', async () => {
    const provider = await service.createProviderConfig({
      provider: 'deepseek',
      api_endpoint: 'https://api.deepseek.com/v1',
      api_key: 'provider-key',
    });

    const model = await service.createModel({
      name: 'deepseek-chat',
      provider: 'ignored-provider',
      api_endpoint: 'https://ignored.example.com/v1',
      providerConfigId: provider.id,
      config: {},
    });

    expect(model).toMatchObject({
      provider: 'deepseek',
      api_endpoint: 'https://api.deepseek.com/v1',
      providerConfigId: provider.id,
    });
    expect(service.getClient(model.id)).not.toBeNull();
  });

  it('groups same-provider fallback by provider config instead of provider name only', async () => {
    const primary = await service.createModel({
      name: 'gpt-4o',
      provider: 'openai',
      api_endpoint: 'https://gateway-a.example.com/v1',
      api_key: 'gateway-a-key',
      config: {},
    });

    const sameProviderConfig = await service.createModel({
      name: 'gpt-4.1',
      provider: 'openai',
      api_endpoint: 'https://gateway-a.example.com/v1',
      config: {},
    });

    const differentProviderConfig = await service.createModel({
      name: 'gpt-4o-mini',
      provider: 'openai',
      api_endpoint: 'https://gateway-b.example.com/v1',
      api_key: 'gateway-b-key',
      config: {},
    });

    expect(service.getFallbackModelIds(primary.id, {
      groupOrder: ['same_provider', 'cross_provider'],
      includeCurrentModel: false,
    })).toEqual([sameProviderConfig.id, differentProviderConfig.id]);
  });

  it('checks provider health through the bound provider credential', async () => {
    const provider = await service.createProviderConfig({
      provider: 'openai',
      api_endpoint: 'https://api.openai.com/v1',
      api_key: 'provider-health-key',
    });

    const listModelsSpy = jest
      .spyOn(OpenAICompatibleClient.prototype, 'listModels')
      .mockResolvedValue(['gpt-4o', 'gpt-4.1']);

    const result = await service.checkProviderHealth(provider.id);

    expect(result).toEqual({
      success: true,
      response: 'Successfully connected. Found 2 models available.',
    });
    expect(listModelsSpy).toHaveBeenCalledTimes(1);

    listModelsSpy.mockRestore();
  });

  it('fails provider health check when the provider has no credential', async () => {
    const provider = await service.createProviderConfig({
      provider: 'siliconflow',
      api_endpoint: 'https://api.siliconflow.cn/v1',
    });

    await expect(service.checkProviderHealth(provider.id)).resolves.toEqual({
      success: false,
      error: 'No credential configured for this provider',
    });
  });

  it('loads provider model names from the remote provider and returns a sorted unique list', async () => {
    const provider = await service.createProviderConfig({
      provider: 'minimax',
      api_endpoint: 'https://api.minimax.chat/v1',
      api_key: 'provider-model-list-key',
    });

    const listModelsSpy = jest
      .spyOn(OpenAICompatibleClient.prototype, 'listModels')
      .mockResolvedValue(['abab6.5-chat', 'MiniMax-M2.7', 'abab6.5-chat', 'MiniMax-Text-01']);

    const result = await service.listProviderModels(provider.id);

    expect(result).toEqual({
      providerConfigId: provider.id,
      models: ['abab6.5-chat', 'MiniMax-M2.7', 'MiniMax-Text-01'],
    });

    listModelsSpy.mockRestore();
  });
});
