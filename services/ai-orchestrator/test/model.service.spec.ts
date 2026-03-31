import { Test, TestingModule } from '@nestjs/testing';
import { ModelService } from '../src/modules/model/model.service';
import { AIModelDTO, CreateModelDTO } from '../src/interfaces';

describe('ModelService', () => {
  let service: ModelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ModelService],
    }).compile();

    service = module.get<ModelService>(ModelService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createModel', () => {
    it('should create a model successfully', async () => {
      const dto: CreateModelDTO = {
        name: 'gpt-4',
        provider: 'openai',
        api_endpoint: 'https://api.openai.com',
        config: { secret_type: 'env' },
      };

      const result = await service.createModel(dto);

      expect(result.id).toBeDefined();
      expect(result.name).toBe(dto.name);
      expect(result.provider).toBe(dto.provider);
      expect(result.status).toBe('active');
    });
  });

  describe('listModels', () => {
    it('should return empty list when no models', async () => {
      const result = await service.listModels();
      expect(result).toEqual([]);
    });

    it('should return list of models after creation', async () => {
      await service.createModel({
        name: 'gpt-4',
        provider: 'openai',
        api_endpoint: 'https://api.openai.com',
        config: {},
      });

      const result = await service.listModels();
      expect(result.length).toBe(1);
    });
  });

  describe('getModel', () => {
    it('should return null for non-existent model', async () => {
      const result = await service.getModel('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return model after creation', async () => {
      const created = await service.createModel({
        name: 'gpt-4',
        provider: 'openai',
        api_endpoint: 'https://api.openai.com',
        config: {},
      });

      const result = await service.getModel(created.id);
      expect(result).toEqual(created);
    });
  });

  describe('setModelStatus', () => {
    it('should update model status', async () => {
      const created = await service.createModel({
        name: 'gpt-4',
        provider: 'openai',
        api_endpoint: 'https://api.openai.com',
        config: {},
      });

      const result = await service.setModelStatus(created.id, 'inactive');
      expect(result?.status).toBe('inactive');
    });

    it('should return null for non-existent model', async () => {
      const result = await service.setModelStatus('non-existent', 'inactive');
      expect(result).toBeNull();
    });
  });

  describe('deleteModel', () => {
    it('should delete existing model', async () => {
      const created = await service.createModel({
        name: 'gpt-4',
        provider: 'openai',
        api_endpoint: 'https://api.openai.com',
        config: {},
      });

      const result = await service.deleteModel(created.id);
      expect(result).toBe(true);

      const deleted = await service.getModel(created.id);
      expect(deleted).toBeNull();
    });

    it('should return false for non-existent model', async () => {
      const result = await service.deleteModel('non-existent');
      expect(result).toBe(false);
    });
  });
});