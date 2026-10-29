import { PassThrough } from 'node:stream';
import { OpenAICompatibleClient } from './openai-compatible';

describe('OpenAI transport cancellation', () => {
  function createClient() {
    return new OpenAICompatibleClient({ baseURL: 'https://example.invalid/v1', apiKey: 'test', model: 'test' });
  }

  it('passes a non-stream cancellation signal to axios without serializing it into provider JSON', async () => {
    const client = createClient();
    const controller = new AbortController();
    const post = jest.fn().mockResolvedValue({ data: { choices: [{ message: { content: 'ok' } }] }, headers: {} });
    (client as any).client.post = post;
    await client.chatCompletion({ messages: [{ role: 'user', content: 'test' }], signal: controller.signal });
    expect(post.mock.calls[0][2].signal).toBe(controller.signal);
    expect(post.mock.calls[0][1]).not.toHaveProperty('signal');
  });

  it('destroys an active stream immediately on cancellation and rejects rather than waiting for idle timeout', async () => {
    const client = createClient();
    const controller = new AbortController();
    const stream = new PassThrough();
    const post = jest.fn().mockResolvedValue({ data: stream, headers: {} });
    (client as any).client.post = post;
    const pending = client.chatCompletionStream({
      messages: [{ role: 'user', content: 'test' }], signal: controller.signal, streamIdleTimeoutMs: 60000,
    }, jest.fn());
    const rejected = expect(pending).rejects.toThrow('cancelled');
    await new Promise<void>(resolve => setImmediate(resolve));
    controller.abort();
    await rejected;
    expect(stream.destroyed).toBe(true);
    expect(post.mock.calls[0][2].signal).toBe(controller.signal);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('honors a signal cancelled while the streaming response headers were arriving', async () => {
    const client = createClient();
    const controller = new AbortController();
    const stream = new PassThrough();
    (client as any).client.post = jest.fn().mockImplementation(async () => {
      controller.abort();
      return { data: stream, headers: {} };
    });
    await expect(client.chatCompletionStream({ messages: [], signal: controller.signal }, jest.fn()))
      .rejects.toThrow('cancelled');
    expect(stream.destroyed).toBe(true);
  });
});
