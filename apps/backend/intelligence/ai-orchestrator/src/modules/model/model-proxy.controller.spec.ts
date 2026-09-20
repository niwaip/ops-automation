import { HttpException, HttpStatus } from '@nestjs/common';
import { ModelProxyController } from './model-proxy.controller';
import { ModelService } from './model.service';

jest.mock('../../common/guards/ai-auth.guard', () => ({
  parseAndVerifySandboxToken: jest.fn().mockReturnValue('test-user'),
}));

describe('ModelProxyController', () => {
  let controller: ModelProxyController;
  let modelService: jest.Mocked<ModelService>;
  const validAuthHeader = 'Bearer dummy-token';

  beforeEach(() => {
    modelService = {
      getClient: jest.fn(),
      getPreferredVisionModel: jest.fn(),
      getPreferredDefaultModel: jest.fn(),
      getDefaultModel: jest.fn(),
      listActiveModelsForRouting: jest.fn(),
      isVisionCapableModel: jest.fn(),
      listModels: jest.fn(),
    } as any;

    controller = new ModelProxyController(modelService);
  });

  function createMockResponse() {
    const res: any = {
      setHeader: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      headersSent: false,
    };
    return res;
  }

  describe('chatCompletions fallback behavior', () => {
    it('falls back to resilient client when body.model matches default chat model UUID in streaming mode', async () => {
      const defaultChatModel = { id: 'uuid-default-chat-1234', name: 'qwen36-35b-a3b' };
      modelService.getPreferredDefaultModel.mockReturnValue(defaultChatModel as any);
      modelService.getDefaultModel.mockReturnValue(defaultChatModel as any);

      const failingClient = {
        chatCompletionStream: jest.fn().mockRejectedValue(new Error('Client network socket disconnected')),
      };
      const fallbackClient = {
        chatCompletionStream: jest.fn().mockImplementation(async (_opts: any, cb: any) => {
          cb('Fallback chunk');
        }),
      };

      modelService.getClient.mockImplementation((id: string) => {
        if (id === defaultChatModel.id) return failingClient as any;
        return null;
      });

      modelService.listActiveModelsForRouting.mockReturnValue([
        { id: 'uuid-fallback-5678', name: 'gemini-3.7-flash' } as any,
      ]);
      (controller as any).getResilientFallbackClients = jest.fn().mockReturnValue([
        { id: 'gemini-3.7-flash', client: fallbackClient },
      ]);

      const res = createMockResponse();
      await controller.chatCompletions(
        validAuthHeader,
        { model: 'uuid-default-chat-1234', stream: true },
        {} as any,
        res
      );

      expect(failingClient.chatCompletionStream).toHaveBeenCalled();
      expect(fallbackClient.chatCompletionStream).toHaveBeenCalled();
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('Fallback chunk'));
      expect(res.end).toHaveBeenCalled();
    });

    it('falls back to resilient client when body.model matches default chat model UUID in non-streaming mode', async () => {
      const defaultChatModel = { id: 'uuid-default-chat-1234', name: 'qwen36-35b-a3b' };
      modelService.getPreferredDefaultModel.mockReturnValue(defaultChatModel as any);
      modelService.getDefaultModel.mockReturnValue(defaultChatModel as any);

      const failingClient = {
        chatCompletion: jest.fn().mockRejectedValue(new Error('Connection reset by peer')),
      };
      const fallbackClient = {
        chatCompletion: jest.fn().mockResolvedValue({
          content: 'Hello from fallback resilient model',
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      };

      modelService.getClient.mockImplementation((id: string) => {
        if (id === defaultChatModel.id) return failingClient as any;
        return null;
      });

      (controller as any).getResilientFallbackClients = jest.fn().mockReturnValue([
        { id: 'gemini-3.7-flash', client: fallbackClient },
      ]);

      const res = createMockResponse();
      await controller.chatCompletions(
        validAuthHeader,
        { model: 'uuid-default-chat-1234', stream: false },
        {} as any,
        res
      );

      expect(failingClient.chatCompletion).toHaveBeenCalled();
      expect(fallbackClient.chatCompletion).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          choices: [
            expect.objectContaining({
              message: expect.objectContaining({
                content: 'Hello from fallback resilient model',
              }),
            }),
          ],
        })
      );
    });

    it('does NOT fallback when an explicit non-default model fails', async () => {
      const defaultChatModel = { id: 'uuid-default-chat-1234', name: 'qwen36-35b-a3b' };
      modelService.getPreferredDefaultModel.mockReturnValue(defaultChatModel as any);
      modelService.getDefaultModel.mockReturnValue(defaultChatModel as any);

      const explicitFailingClient = {
        chatCompletion: jest.fn().mockRejectedValue(new Error('Explicit model upstream timeout')),
      };

      modelService.getClient.mockImplementation((id: string) => {
        if (id === 'explicit-user-chosen-model') return explicitFailingClient as any;
        return null;
      });

      const res = createMockResponse();
      await expect(
        controller.chatCompletions(
          validAuthHeader,
          { model: 'explicit-user-chosen-model', stream: false },
          {} as any,
          res
        )
      ).rejects.toThrow('Sandbox model execution error: Explicit model upstream timeout');
    });
  });
});
