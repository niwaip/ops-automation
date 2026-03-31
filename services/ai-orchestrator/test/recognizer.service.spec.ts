import { Test, TestingModule } from '@nestjs/testing';
import { RecognizerService } from '../src/modules/recognizer/recognizer.service';
import { RecognizeParamsDTO, RecognizeParamsResponseDTO } from '../src/interfaces';

describe('RecognizerService', () => {
  let service: RecognizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecognizerService],
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