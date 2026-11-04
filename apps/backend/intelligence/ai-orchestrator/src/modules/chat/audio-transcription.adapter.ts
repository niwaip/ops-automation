import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

export function resolveAudioTranscriptionUrl(endpoint: string, override?: string): string {
  if (override !== undefined && typeof override !== 'string') throw new BadRequestException('语音转写接口 URL 必须是字符串');
  const value = override?.trim() || endpoint?.trim();
  let url: URL;
  try { url = new URL(value); } catch { throw new BadRequestException('语音转写接口 URL 无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new BadRequestException('语音转写接口须为 HTTP(S) URL，不能包含凭据或片段');
  if (!override?.trim()) {
    let path = url.pathname.replace(/\/+$/, '');
    if (!path.endsWith('/audio/transcriptions')) {
      path = path.replace(/\/chat\/completions$/, '');
      if (!path && ['api.siliconflow.cn','api.siliconflow.com'].includes(url.hostname)) path = '/v1';
      path += '/audio/transcriptions';
    }
    url.pathname = path;
  }
  return url.toString();
}

export async function requestAudioTranscription(
  file: Express.Multer.File,
  options: { url: string; model: string; apiKey: string }
): Promise<{ text: string }> {
  const body = new FormData();
  body.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);
  body.append('model', options.model);
  try {
    const requestConfig = {
      headers: { Authorization: `Bearer ${options.apiKey}` },
      timeout: 60000, maxRedirects: 0, maxBodyLength: Infinity, maxContentLength: Infinity,
    };
    const { data } = await axios.post<unknown>(options.url, body, requestConfig);
    const result = data as { text?: unknown; result?: unknown; data?: { text?: unknown } } | null;
    const text = typeof data === 'string' ? data : result?.text ?? result?.result ?? result?.data?.text;
    if (typeof text !== 'string') throw new HttpException('语音服务未返回有效的转写文字', HttpStatus.BAD_GATEWAY);
    return { text };
  } catch (error: any) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(error.response?.data?.error?.message || error.response?.data?.message || 'Audio transcription failed', error.response?.status || HttpStatus.BAD_GATEWAY);
  }
}
