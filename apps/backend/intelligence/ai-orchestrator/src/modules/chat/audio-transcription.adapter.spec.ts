import axios from 'axios';
import { requestAudioTranscription, resolveAudioTranscriptionUrl } from './audio-transcription.adapter';

describe('ASR endpoint resolution', () => {
  it.each([
    'https://api.siliconflow.cn',
    'https://api.siliconflow.cn/v1',
    'https://api.siliconflow.cn/v1/',
    'https://api.siliconflow.cn/v1/chat/completions',
    'https://api.siliconflow.cn/v1/chat/completions/',
    'https://api.siliconflow.cn/v1/audio/transcriptions',
    'https://api.siliconflow.cn/v1/audio/transcriptions/',
  ])('resolves %s without duplicating the audio path', (url) => {
    expect(resolveAudioTranscriptionUrl(url)).toBe('https://api.siliconflow.cn/v1/audio/transcriptions');
  });
  it('honors the model override without changing the provider base URL', () => {
    expect(resolveAudioTranscriptionUrl('https://chat.example/v1','https://asr.example/custom/transcribe')).toBe('https://asr.example/custom/transcribe');
  });
  it('preserves other provider paths and rejects invalid URLs', () => {
    expect(resolveAudioTranscriptionUrl('https://example.com/openai/v1')).toBe('https://example.com/openai/v1/audio/transcriptions');
    expect(() => resolveAudioTranscriptionUrl('file:///tmp/audio')).toThrow();
    expect(() => resolveAudioTranscriptionUrl('https://secret@example.com/v1')).toThrow();
  });
});

describe('ASR multipart request', () => {
  afterEach(() => jest.restoreAllMocks());
  const file = { originalname:'device.wav',mimetype:'audio/wav',buffer:Buffer.from('RIFF') } as Express.Multer.File;
  it('posts the exact XingChen model identifier and audio file using the shared credential', async () => {
    const post=jest.spyOn(axios,'post').mockResolvedValue({ data:{ text:'识别成功' } } as any);
    const result=await requestAudioTranscription(file,{url:'https://api.siliconflow.cn/v1/audio/transcriptions',model:'XingChenAGI/XingChenASR-V3.2',apiKey:'test-key'});
    expect(result).toEqual({text:'识别成功'});
    const [url,body,options]=post.mock.calls[0]!;
    expect(url).toBe('https://api.siliconflow.cn/v1/audio/transcriptions');
    expect((body as FormData).get('model')).toBe('XingChenAGI/XingChenASR-V3.2');
    expect(((body as FormData).get('file') as File).name).toBe('device.wav');
    expect(options?.headers?.Authorization).toBe('Bearer test-key');
  });
  it('does not turn unexpected provider JSON into a chat instruction', async () => {
    jest.spyOn(axios,'post').mockResolvedValue({data:{code:123,message:'not a transcript'}} as any);
    await expect(requestAudioTranscription(file,{url:'https://example.com/asr',model:'asr',apiKey:'test'})).rejects.toThrow('未返回有效');
  });
});
