import { BadRequestException } from '@nestjs/common';
import axios from 'axios';

export async function fetchReferenceUrlExcerpt(referenceUrl: string): Promise<string> {
  const normalizedUrl = normalizeReferenceUrl(referenceUrl);
  const response = await axios.get<string>(normalizedUrl, {
    timeout: 30000,
    responseType: 'text',
    headers: {
      'User-Agent': 'ops-automation-ai-draft/1.0',
      Accept: 'text/html, text/plain, application/json;q=0.9, */*;q=0.8',
    },
  });

  const contentType = String(response.headers?.['content-type'] || '');
  const rawText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  const normalizedText = contentType.includes('html') ? stripHtmlToText(rawText) : rawText;

  return normalizedText.replace(/\s+/g, ' ').trim().slice(0, 12000);
}

function normalizeReferenceUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new BadRequestException('参考 URL 格式无效');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new BadRequestException('参考 URL 只支持 http 或 https');
  }

  const hostname = url.hostname.toLowerCase();
  const isPrivateIpv4 =
    /^10\.|^127\.|^192\.168\.|^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    isPrivateIpv4
  ) {
    throw new BadRequestException('参考 URL 不允许访问本地或内网地址');
  }

  return url.toString();
}

function stripHtmlToText(value: string): string {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}
