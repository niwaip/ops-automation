import { sandboxCompletion } from './sandbox-completion-response';
import { ModelProxyController } from './model-proxy.controller';

jest.mock('../../common/guards/ai-auth.guard', () => ({
  parseAndVerifySandboxToken: jest.fn().mockReturnValue('test-user'),
}));

describe('sandbox vision completion boundary', () => {
  it('rejects reasoning-only vision output instead of reporting successful OCR', () => {
    expect(() => sandboxCompletion({content:'', reasoningContent:'thinking',finishReason:'length'},'vision-a',true))
      .toThrow('reasoning_only=true');
    expect(sandboxCompletion({content:'PASS',finishReason:'length'},'vision-a',true).finishReason).toBe('length');
  });

  it('keeps tool-only chat completions intact', () => {
    const tools = [{id:'call',function:{name:'render_pdf'}}];
    expect(sandboxCompletion({content:'',tool_calls:tools,finishReason:'tool_calls'},'chat',false).tools).toBe(tools);
  });

  it('preserves thinking=false, actual fallback model and finish reason', async () => {
    const primary = {chatCompletion:jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))};
    const fallback = {chatCompletion:jest.fn().mockResolvedValue({content:'PASS',finishReason:'length',usage:{total_tokens:9}})};
    const service:any = {
      getPreferredDefaultModel:jest.fn().mockReturnValue({id:'chat'}),
      getDefaultModel:jest.fn().mockReturnValue({id:'chat'}),
      getPreferredVisionModel:jest.fn().mockReturnValue({id:'vision-a',name:'vision-a'}),
      listActiveModelsForRouting:jest.fn().mockReturnValue([{id:'vision-b',name:'vision-b'}]),
      isVisionCapableModel:jest.fn().mockReturnValue(true),
      getClient:jest.fn((id:string)=>id==='vision-a'?primary:id==='vision-b'?fallback:null),
    };
    const controller:any = new ModelProxyController(service);
    controller.resolveUpstreamCredentials=jest.fn().mockResolvedValue({apiKey:'key',baseUrl:'http://test'});
    const res:any = {status:jest.fn().mockReturnThis(),json:jest.fn(),headersSent:false};
    await controller.chatCompletions('Bearer dummy', {model:'vision',thinking:false,stream:false,
      max_tokens:1200,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,eA=='}}]}]}, {},res);
    expect(fallback.chatCompletion).toHaveBeenCalledWith(expect.objectContaining({reasoning:{enabled:false},max_tokens:1200}));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({model:'vision-b',choices:[expect.objectContaining({finish_reason:'length'})]}));
  });

  it('never uses an unverified default text client as a vision fallback', () => {
    const service:any = {getPreferredVisionModel:()=>null,listActiveModelsForRouting:()=>[],getClient:()=>({})};
    const controller:any = new ModelProxyController(service);
    expect(controller.getResilientFallbackClients(true, {})).toEqual([]);
  });
});
