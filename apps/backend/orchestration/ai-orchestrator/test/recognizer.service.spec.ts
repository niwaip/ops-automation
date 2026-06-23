import { Test, TestingModule } from '@nestjs/testing';
import { RecognizerService } from '../src/modules/recognizer/recognizer.service';
import { RecognizeParamsDTO } from '../src/interfaces';
import { ModelService } from '../src/modules/model/model.service';

describe('RecognizerService', () => {
  let service: RecognizerService;
  let modelService: {
    listModels: jest.Mock;
    getClient: jest.Mock;
    getDefaultModel: jest.Mock;
    resolveModelId: jest.Mock;
  };

  beforeEach(async () => {
    modelService = {
      listModels: jest.fn(),
      getClient: jest.fn(),
      getDefaultModel: jest.fn(),
      resolveModelId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RecognizerService, { provide: ModelService, useValue: modelService }],
    }).compile();

    service = module.get<RecognizerService>(RecognizerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerTemplate', () => {
    it('should register a template', () => {
      const template = {
        template_id: 'test-template',
        name: 'Test Template',
        params_schema: {
          properties: {
            username: { type: 'string', description: 'User name' },
            amount: { type: 'number', description: 'Transaction amount' },
          },
          required: ['username'],
        },
      };

      service.registerTemplate(template);

      const result = service.getTemplate('test-template');
      expect(result).toEqual(template);
    });
  });

  describe('recognizeParams', () => {
    it('should return empty params with zero confidence when template not found', async () => {
      const dto: RecognizeParamsDTO = {
        template_id: 'non-existent-template',
        user_input: 'some input',
      };

      const result = await service.recognizeParams(dto);

      expect(result.params).toEqual({});
      expect(result.confidence).toBe(0);
    });

    it('should use basic pattern matching when no AI client', async () => {
      // Register template
      service.registerTemplate({
        template_id: 'test-template',
        name: 'Test Template',
        params_schema: {
          properties: {
            username: { type: 'string' },
            amount: { type: 'number' },
          },
        },
      });

      const dto: RecognizeParamsDTO = {
        template_id: 'test-template',
        user_input: 'username: john, amount: 100',
      };

      const result = await service.recognizeParams(dto);

      // Basic pattern matching should extract parameters
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle context parameter', async () => {
      service.registerTemplate({
        template_id: 'test-template',
        name: 'Test Template',
        params_schema: {
          properties: {
            username: { type: 'string' },
          },
        },
      });

      const dto: RecognizeParamsDTO = {
        template_id: 'test-template',
        user_input: 'username: alice',
        context: { previous_action: 'login' },
      };

      const result = await service.recognizeParams(dto);

      expect(result).toBeDefined();
    });

    it('should prefer the requested modelId over the default model', async () => {
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

      const dto: RecognizeParamsDTO = {
        template_id: 'test-template',
        user_input: 'username: alice',
        modelId: requestedModelId,
      };

      const result = await service.recognizeParams(dto);

      expect(modelService.resolveModelId).toHaveBeenCalledWith(requestedModelId);
      expect(modelService.getDefaultModel).not.toHaveBeenCalled();
      expect(requestedClient.chatCompletion).toHaveBeenCalled();
      expect(result.params).toEqual({ username: 'alice' });
    });
  });

  describe('batchRecognizeParams', () => {
    it('should process multiple inputs', async () => {
      service.registerTemplate({
        template_id: 'test-template',
        name: 'Test Template',
        params_schema: {
          properties: {
            username: { type: 'string' },
          },
        },
      });

      const inputs: RecognizeParamsDTO[] = [
        { template_id: 'test-template', user_input: 'username: user1' },
        { template_id: 'test-template', user_input: 'username: user2' },
      ];

      const results = await service.batchRecognizeParams(inputs);

      expect(results.length).toBe(2);
    });
  });
});
