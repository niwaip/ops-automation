import type { UploadedFileDescriptor } from '@ops/user-core';
import { apiClient, runtimeConfig } from '../../../api';
import { authStore } from '../../../adapters/auth/authStore';

export const SPEECH_LANGUAGE_STORAGE_KEY = 'user-chat.speech.lang';

export const normalizeSpeechLanguage = (value?: string | null): string => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized.startsWith('zh')) {
    return 'zh-CN';
  }
  if (normalized.startsWith('en')) {
    return 'en-US';
  }
  if (normalized.startsWith('ja')) {
    return 'ja-JP';
  }
  return 'zh-CN';
};

export const resolveAiPath = (path: string): string => {
  const baseUrl = runtimeConfig.aiApiBaseUrl?.trim() || '/api/ai';
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
};

export const mergeSpeechText = (baseText: string, speechText: string): string => {
  const normalizedSpeechText = speechText.trim();
  if (!normalizedSpeechText) {
    return baseText;
  }
  if (!baseText.trim()) {
    return normalizedSpeechText;
  }
  return `${baseText.replace(/\s+$/, '')}\n${normalizedSpeechText}`;
};

export function isImageFile(fileName?: string, mimeType?: string): boolean {
  if (mimeType && mimeType.startsWith('image/')) {
    return true;
  }
  if (!fileName) return false;
  return /\.(jpe?g|png|gif|webp|svg|bmp|ico)$/i.test(fileName);
}

export function resolveChatFilePreviewUrl(file: UploadedFileDescriptor | Record<string, any>): string | undefined {
  if (!file) return undefined;
  if (file.previewUrl) return file.previewUrl;
  if (typeof file.url === 'string' && (file.url.startsWith('blob:') || file.url.startsWith('data:') || file.url.startsWith('http://') || file.url.startsWith('https://'))) {
    return file.url;
  }
  if (typeof file.fileUrl === 'string' && (file.fileUrl.startsWith('blob:') || file.fileUrl.startsWith('data:') || file.fileUrl.startsWith('http://') || file.fileUrl.startsWith('https://'))) {
    return file.fileUrl;
  }
  if (file.fileId) {
    const base = resolveAiPath(`/chat/files/${file.fileId}`);
    return file.ticket ? `${base}?ticket=${encodeURIComponent(file.ticket)}` : base;
  }
  if (file.url && typeof file.url === 'string') {
    return file.url;
  }
  return undefined;
}

export async function uploadChatFile(file: File): Promise<UploadedFileDescriptor> {
  const formData = new FormData();
  formData.append('file', file);

  let localPreviewUrl: string | undefined;
  if (file.type?.startsWith('image/')) {
    try {
      localPreviewUrl = URL.createObjectURL(file);
    } catch {
      // ignore
    }
  }

  const token = (await apiClient.ensureFreshAccessToken()) || authStore.getState().accessToken;
  const response = await fetch(resolveAiPath('/chat/upload'), {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!response.ok) {
    let errMsg = `HTTP error: ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.message) {
        errMsg = Array.isArray(errJson.message) ? errJson.message.join(', ') : errJson.message;
      }
    } catch {
      const errText = await response.text().catch(() => '');
      if (errText) errMsg = `${errMsg} ${errText}`;
    }
    throw new Error(errMsg);
  }

  const payload = (await response.json()) as { fileId?: string; url?: string; ticket?: string };
  if (!payload?.fileId) {
    throw new Error('Invalid upload response');
  }

  return {
    fileId: payload.fileId,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    previewUrl: localPreviewUrl,
    url: payload.url,
    ticket: payload.ticket,
  };
}

export async function transcribeAudio(file: Blob | File, modelId: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file, 'audio.webm');
  formData.append('modelId', modelId);

  const token = (await apiClient.ensureFreshAccessToken()) || authStore.getState().accessToken;
  const response = await fetch(resolveAiPath('/chat/audio/transcriptions'), {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`HTTP error: ${response.status} ${errText}`);
  }

  const payload = (await response.json()) as { text?: string };
  if (typeof payload?.text !== 'string') {
    throw new Error('Invalid transcription response');
  }

  return payload.text;
}
