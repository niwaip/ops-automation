import { SandboxFallbackPolicy } from './sandbox-fallback.policy';

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
});
