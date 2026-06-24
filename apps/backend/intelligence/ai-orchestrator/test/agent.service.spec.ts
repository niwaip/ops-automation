import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from '../src/modules/agent/agent.service';
import { AIAgentDTO, CreateAgentDTO } from '../src/interfaces';

describe('AgentService', () => {
  let service: AgentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentService],
    }).compile();

    service = module.get<AgentService>(AgentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAgent', () => {
    it('should create an agent successfully', async () => {
      const dto: CreateAgentDTO = {
        model_id: 'test-model-id',
      };

      const result = await service.createAgent(dto);

      expect(result.id).toBeDefined();
      expect(result.model_id).toBe(dto.model_id);
      expect(result.status).toBe('idle');
    });

    it('should create an agent with session binding', async () => {
      const dto: CreateAgentDTO = {
        model_id: 'test-model-id',
        session_id: 'test-session-id',
      };

      const result = await service.createAgent(dto);

      expect(result.session_id).toBe(dto.session_id);
    });
  });

  describe('getAgent', () => {
    it('should return null for non-existent agent', async () => {
      const result = await service.getAgent('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return agent after creation', async () => {
      const created = await service.createAgent({
        model_id: 'test-model-id',
      });

      const result = await service.getAgent(created.id);
      expect(result).toEqual(created);
    });
  });

  describe('setAgentStatus', () => {
    it('should update agent status', async () => {
      const created = await service.createAgent({
        model_id: 'test-model-id',
      });

      const result = await service.setAgentStatus(created.id, 'active');
      expect(result?.status).toBe('active');
    });

    it('should return null for non-existent agent', async () => {
      const result = await service.setAgentStatus('non-existent', 'active');
      expect(result).toBeNull();
    });
  });

  describe('bindToSession', () => {
    it('should bind agent to session', async () => {
      const created = await service.createAgent({
        model_id: 'test-model-id',
      });

      const result = await service.bindToSession(created.id, 'new-session-id');
      expect(result?.session_id).toBe('new-session-id');
    });
  });

  describe('unbindFromSession', () => {
    it('should unbind agent from session', async () => {
      const created = await service.createAgent({
        model_id: 'test-model-id',
        session_id: 'existing-session',
      });

      const result = await service.unbindFromSession(created.id);
      expect(result?.session_id).toBeUndefined();
    });
  });

  describe('getContext', () => {
    it('should return empty context for new agent', async () => {
      const created = await service.createAgent({
        model_id: 'test-model-id',
      });

      const context = service.getContext(created.id);
      expect(context).toEqual([]);
    });
  });

  describe('deleteAgent', () => {
    it('should delete existing agent', async () => {
      const created = await service.createAgent({
        model_id: 'test-model-id',
      });

      const result = await service.deleteAgent(created.id);
      expect(result).toBe(true);

      const deleted = await service.getAgent(created.id);
      expect(deleted).toBeNull();
    });
  });
});
