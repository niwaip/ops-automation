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

export async function uploadChatFile(file: File): Promise<UploadedFileDescriptor> {
  const formData = new FormData();
  formData.append('file', file);

  const token = (await apiClient.ensureFreshAccessToken()) || authStore.getState().accessToken;
  const response = await fetch(resolveAiPath('/chat/upload'), {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`HTTP error: ${response.status} ${errText}`);
  }

  const payload = (await response.json()) as { fileId?: string };
  if (!payload?.fileId) {
    throw new Error('Invalid upload response');
  }

  return {
    fileId: payload.fileId,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
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
