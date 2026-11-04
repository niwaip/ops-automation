import axios from 'axios';
import { ChatMediaService } from './chat-media.service';

describe('configured ASR routing', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each([undefined, 'https://asr.example/custom/transcribe'])('routes the default ASR model with override %s', async (override) => {
    const post=jest.spyOn(axios,'post').mockResolvedValue({data:{text:'测试录音'}} as any);
    const models = {
      getPreferredDefaultModel: jest.fn(() => ({id:'asr-model'})),
      getModel: jest.fn(async () => ({name:'XingChenAGI/XingChenASR-V3.2',api_endpoint:'https://api.siliconflow.cn/v1',config:{audio_transcription_endpoint:override}})),
      getClient: jest.fn(() => ({getConfig:() => ({baseURL:'https://other-chat.example/v1/chat/completions',apiKey:'shared-provider-key'})})),
    };
    const service=new ChatMediaService(models as any);
    const response=await service.transcribeAudio({originalname:'device.wav',mimetype:'audio/wav',buffer:Buffer.from('RIFF')} as Express.Multer.File,'default');
    expect(response.text).toBe('测试录音');
    expect(models.getPreferredDefaultModel).toHaveBeenCalledWith({mode:'audio_transcription'});
    expect(post.mock.calls[0]?.[0]).toBe(override || 'https://api.siliconflow.cn/v1/audio/transcriptions');
    expect(post.mock.calls[0]?.[2]?.headers?.Authorization).toBe('Bearer shared-provider-key');
  });
});
