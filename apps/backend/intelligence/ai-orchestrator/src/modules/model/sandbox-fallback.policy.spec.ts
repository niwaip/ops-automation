import { SandboxFallbackPolicy, isPermanentFallbackError } from './sandbox-fallback.policy';

describe('bounded sandbox fallback', () => {
  it('excludes audio/image-only and missing credentials, caps attempts and cools down failures', () => {
    const models = [
      {id:'audio',config:{input:['audio']}}, {id:'image',config:{input:['text'],output:['image']}},
      {id:'no-key',hasApiKey:false,config:{}}, ...['one','two','three'].map(id=>({id,config:{input:['text']}})),
    ];
    const clients = Object.fromEntries(models.map(m=>[m.id,{}]));
    const service = {listActiveModelsForRouting:()=>models,getClient:(id:string)=>clients[id]};
    const policy = new SandboxFallbackPolicy();
    expect(policy.select(service,false,{}).map(c=>c.id)).toEqual(['one','two']);
    policy.failed(clients.one,{status:401});
    expect(policy.select(service,false,{}).map(c=>c.id)).toEqual(['two','three']);
  });

  it('excludes non-chat scoped/tagged models even when text input is listed and respects custom limit', () => {
    const models = [
      {
        id: 'asr-with-text-input',
        config: {
          input: ['audio', 'text'],
          output: ['text'],
          default_scope: { audio_transcription: true },
          routing_tags: ['audio_transcription'],
        },
      },
      {
        id: 'embed-with-text-input',
        config: { input: ['text'], output: ['text'], routing_tags: ['embedding'] },
      },
      { id: 'chat-a', config: { input: ['text'], output: ['text'], routing_tags: ['chat'] } },
      { id: 'chat-b', config: { input: ['text'], output: ['text'] } },
      { id: 'chat-c', config: { input: ['text'], output: ['text'] } },
    ];
    const clients = Object.fromEntries(models.map((m) => [m.id, {}]));
    const service = { listActiveModelsForRouting: () => models, getClient: (id: string) => clients[id] };
    const policy = new SandboxFallbackPolicy();

    expect(policy.select(service, false, {}).map((c) => c.id)).toEqual(['chat-a', 'chat-b']);
    expect(policy.select(service, false, {}, 10).map((c) => c.id)).toEqual(['chat-a', 'chat-b', 'chat-c']);
  });

  it('classifies permanent config/auth errors separately from transient transport errors', () => {
    expect(isPermanentFallbackError({ status: 401, message: 'Incorrect API key provided' })).toBe(true);
    expect(isPermanentFallbackError({ message: 'Model does not exist' })).toBe(true);
    expect(isPermanentFallbackError({ message: 'Missing Authentication header' })).toBe(true);
    expect(isPermanentFallbackError({ status: 503, message: 'Service temporarily unavailable' })).toBe(false);
    expect(isPermanentFallbackError({ message: 'aborted' })).toBe(false);

    const policy = new SandboxFallbackPolicy();
    const permClient = {};
    const transClient = {};
    const models = [
      { id: 'perm', config: { input: ['text'] } },
      { id: 'trans', config: { input: ['text'] } },
    ];
    const clients: Record<string, object> = { perm: permClient, trans: transClient };
    const service = { listActiveModelsForRouting: () => models, getClient: (id: string) => clients[id] };

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      policy.failed(permClient, { status: 401, message: 'Invalid API key' });
      policy.failed(transClient, { message: 'aborted' });

      // After 2 minutes: transient cooldown expired, permanent cooldown still active.
      nowSpy.mockReturnValue(1_000_000 + 120_000);
      expect(policy.select(service, false, {}, 10).map((c) => c.id)).toEqual(['trans']);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
