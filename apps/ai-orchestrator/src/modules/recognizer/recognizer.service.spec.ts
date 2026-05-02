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
});
