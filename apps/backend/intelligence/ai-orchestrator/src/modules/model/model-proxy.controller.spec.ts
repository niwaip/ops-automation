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
    it('keeps reasoning disabled when thinking=false is combined with an inherited effort', async () => {
      const explicitModel = { id: 'explicit-qwen-reasoning-off', name: 'qwen36-35b-a3b' };
      const client = {
        chatCompletionStream: jest.fn().mockImplementation(async (_opts: any, cb: any) => {
          cb('done');
        }),
      };
      modelService.listModels.mockReturnValue([explicitModel] as any);
      modelService.getClient.mockReturnValue(client as any);
      const res = createMockResponse();

      await controller.chatCompletions(
        validAuthHeader,
        {
          model: explicitModel.id,
          stream: true,
          thinking: false,
          reasoning_effort: 'medium',
        },
        {} as any,
        res
      );

      expect(client.chatCompletionStream).toHaveBeenCalledWith(
        expect.objectContaining({ reasoning: { enabled: false } }),
        expect.any(Function),
        { enabled: false }
      );
    });

    it('retries after whitespace-only stream chunks because no visible answer was committed', async () => {
      const explicitModel = { id: 'explicit-qwen-whitespace', name: 'qwen36-35b-a3b' };
      const client = {
        chatCompletionStream: jest
          .fn()
          .mockImplementationOnce(async (_opts: any, cb: any) => {
            cb('  \n');
            throw new Error('OpenAI API Stream idle timeout');
          })
          .mockImplementationOnce(async (_opts: any, cb: any) => {
            cb('生成完成');
          }),
      };
      modelService.listModels.mockReturnValue([explicitModel] as any);
      modelService.getClient.mockReturnValue(client as any);
      const res = createMockResponse();

      await controller.chatCompletions(
        validAuthHeader,
        { model: explicitModel.id, stream: true },
        {} as any,
        res
      );

      expect(client.chatCompletionStream).toHaveBeenCalledTimes(2);
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('生成完成'));
    });

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

  describe('hardening retry mechanism with strict upper bound', () => {
    it('recovers from transient "aborted" error when chunksSent === 0 and succeeds on retry', async () => {
      const streamClient = {
        chatCompletionStream: jest
          .fn()
          .mockRejectedValueOnce(new Error('aborted'))
          .mockImplementationOnce(async (_opts: any, cb: any) => {
            cb('Snake game code initialized');
          }),
      };

      modelService.getClient.mockImplementation((id: string) => {
        if (id === 'explicit-qwen-35b') return streamClient as any;
        return null;
      });

      const res = createMockResponse();
      await controller.chatCompletions(
        validAuthHeader,
        { model: 'explicit-qwen-35b', stream: true },
        {} as any,
        res
      );

      // Attempt 0 failed with aborted, attempt 1 succeeded
      expect(streamClient.chatCompletionStream).toHaveBeenCalledTimes(2);
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('Snake game code initialized'));
      expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
      expect(res.end).toHaveBeenCalled();
    });

    it('strictly caps retries to maxStreamRetries (default 1 retry = 2 attempts total) on repeated "aborted" errors', async () => {
      const streamClient = {
        chatCompletionStream: jest.fn().mockRejectedValue(new Error('aborted')),
      };

      modelService.getClient.mockImplementation((id: string) => {
        if (id === 'explicit-qwen-35b') return streamClient as any;
        return null;
      });

      const res = createMockResponse();
      await expect(
        controller.chatCompletions(
          validAuthHeader,
          { model: 'explicit-qwen-35b', stream: true },
          {} as any,
          res
        )
      ).rejects.toThrow('Sandbox model execution error: aborted');

      // Attempt 0 + retry 1 = exactly 2 attempts (strictly capped, no infinite loop)
      expect(streamClient.chatCompletionStream).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry in-stream when chunks were already sent, avoiding duplicate chunks', async () => {
      let callCount = 0;
      const streamClient = {
        chatCompletionStream: jest.fn().mockImplementation(async (_opts: any, cb: any) => {
          callCount++;
          if (callCount === 1) {
            cb('First partial token');
            throw new Error('aborted mid-stream');
          }
          cb('Duplicate token that must NOT be sent');
        }),
      };

      modelService.getClient.mockImplementation((id: string) => {
        if (id === 'explicit-qwen-35b') return streamClient as any;
        return null;
      });

      const res = createMockResponse();
      await controller.chatCompletions(
        validAuthHeader,
        { model: 'explicit-qwen-35b', stream: true },
        {} as any,
        res
      );

      // Crucial: Must NOT retry in the same stream because partial chunks were already sent
      expect(streamClient.chatCompletionStream).toHaveBeenCalledTimes(1);
      // Writes initial chunk
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('First partial token'));
      // Writes SSE error event with [DONE]
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('Sandbox model execution error: aborted mid-stream'));
      expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
      expect(res.end).toHaveBeenCalled();
      // Verifies duplicate token was never written
      expect(res.write).not.toHaveBeenCalledWith(expect.stringContaining('Duplicate token that must NOT be sent'));
    });

    it('buffers internal tool rounds and safely retries after visible partial content', async () => {
      let callCount = 0;
      const streamClient = {
        chatCompletionStream: jest.fn().mockImplementation(async (_opts: any, cb: any) => {
          callCount++;
          if (callCount === 1) {
            cb('partial internal plan');
            throw new Error('aborted');
          }
          cb('', {
            delta: {
              tool_calls: [{ index: 0, function: { name: 'bash', arguments: '{}' } }],
            },
          });
        }),
      };
      modelService.getClient.mockImplementation((id: string) => {
        if (id === 'explicit-qwen-35b') return streamClient as any;
        return null;
      });
      jest.spyOn(controller as any, 'delay').mockResolvedValue(undefined);

      const res = createMockResponse();
      await controller.chatCompletions(
        validAuthHeader,
        {
          model: 'explicit-qwen-35b',
          stream: true,
          stream_visibility: 'internal',
          tools: [{ type: 'function', function: { name: 'bash' } }],
        },
        {} as any,
        res
      );

      expect(streamClient.chatCompletionStream).toHaveBeenCalledTimes(2);
      expect(res.write).not.toHaveBeenCalledWith(expect.stringContaining('partial internal plan'));
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('tool_calls'));
      expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
    });

    it('retries safely when only reasoning chunks were sent before a transient abort', async () => {
      let callCount = 0;
      const streamClient = {
        chatCompletionStream: jest.fn().mockImplementation(async (_opts: any, cb: any) => {
          callCount++;
          if (callCount === 1) {
            cb('', { reasoning_content: '正在规划单页布局' });
            throw new Error('aborted');
          }
          cb('Recovered visible answer');
        }),
      };

      modelService.getClient.mockImplementation((id: string) => {
        if (id === 'explicit-qwen-35b') return streamClient as any;
        return null;
      });

      const res = createMockResponse();
      await controller.chatCompletions(
        validAuthHeader,
        { model: 'explicit-qwen-35b', stream: true, thinking: true },
        {} as any,
        res
      );

      expect(streamClient.chatCompletionStream).toHaveBeenCalledTimes(2);
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('Recovered visible answer'));
      expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
    });

    it('does NOT retry on non-transient errors (e.g. 400 Bad Request)', async () => {
      const nonTransientErr: any = new Error('Invalid prompt structure');
      nonTransientErr.status = 400;

      const nonStreamClient = {
        chatCompletion: jest.fn().mockRejectedValue(nonTransientErr),
      };

      modelService.getClient.mockImplementation((id: string) => {
        if (id === 'explicit-model') return nonStreamClient as any;
        return null;
      });

      const res = createMockResponse();
      await expect(
        controller.chatCompletions(
          validAuthHeader,
          { model: 'explicit-model', stream: false },
          {} as any,
          res
        )
      ).rejects.toThrow('Sandbox model execution error: Invalid prompt structure');

      // Non-transient error must fail on attempt 0 immediately without retrying
      expect(nonStreamClient.chatCompletion).toHaveBeenCalledTimes(1);
    });

    it('hard caps resolveMaxRetries at ABSOLUTE_MAX_RETRIES (3) even if env variable is set very high', () => {
      const originalEnv = process.env.MODEL_PROXY_MAX_RETRIES;
      try {
        process.env.MODEL_PROXY_MAX_RETRIES = '999';
        expect(controller.resolveMaxRetries()).toBe(3);

        process.env.MODEL_PROXY_MAX_RETRIES = '0';
        expect(controller.resolveMaxRetries()).toBe(0);

        delete process.env.MODEL_PROXY_MAX_RETRIES;
        expect(controller.resolveMaxRetries()).toBe(1);
      } finally {
        if (originalEnv !== undefined) {
          process.env.MODEL_PROXY_MAX_RETRIES = originalEnv;
        } else {
          delete process.env.MODEL_PROXY_MAX_RETRIES;
        }
      }
    });

    it('uses a longer attempt timeout for generation and web-search synthesis', () => {
      const originalEnv = process.env.SANDBOX_MODEL_ATTEMPT_TIMEOUT_MS;
      try {
        delete process.env.SANDBOX_MODEL_ATTEMPT_TIMEOUT_MS;
        expect(controller.resolveAttemptTimeoutMs({ tools: [{}, {}, {}] })).toBe(30_000);
        expect(controller.resolveAttemptTimeoutMs({ tools: Array.from({ length: 8 }, () => ({})) })).toBe(60_000);
        expect(controller.resolveStreamIdleTimeoutMs({ tools: [{}, {}, {}] })).toBe(30_000);
        expect(controller.resolveStreamIdleTimeoutMs({ tools: Array.from({ length: 8 }, () => ({})) })).toBe(60_000);
        expect(controller.resolveAttemptTimeoutMs({ request_context: 'web_search_synthesis' })).toBe(60_000);
        expect(controller.resolveStreamIdleTimeoutMs({ request_context: 'web_search_synthesis' })).toBe(60_000);

        process.env.SANDBOX_MODEL_ATTEMPT_TIMEOUT_MS = '45000';
        expect(controller.resolveAttemptTimeoutMs({ tools: Array.from({ length: 8 }, () => ({})) })).toBe(45_000);
      } finally {
        if (originalEnv !== undefined) {
          process.env.SANDBOX_MODEL_ATTEMPT_TIMEOUT_MS = originalEnv;
        } else {
          delete process.env.SANDBOX_MODEL_ATTEMPT_TIMEOUT_MS;
        }
      }
    });

    it('aborts retries early if client socket disconnected (res.destroyed = true)', async () => {
      const res = createMockResponse();
      const streamClient = {
        chatCompletionStream: jest.fn().mockImplementation(async () => {
          // Client disconnects during first attempt
          res.destroyed = true;
          throw new Error('aborted');
        }),
      };

      modelService.getClient.mockImplementation((id: string) => {
        if (id === 'explicit-model') return streamClient as any;
        return null;
      });

      const req: any = {};

      await expect(
        controller.chatCompletions(
          validAuthHeader,
          { model: 'explicit-model', stream: true },
          req,
          res
        )
      ).rejects.toThrow('Sandbox model execution error: aborted');

      // Attempt 0 ran; when client disconnected (res.destroyed = true), subsequent retries were aborted!
      expect(streamClient.chatCompletionStream).toHaveBeenCalledTimes(1);
    });
  });
});
