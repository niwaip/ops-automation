import { useState, useRef, useEffect, useCallback } from 'react';
import { message } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { transcribeAudio } from '@/features/chat/chatApi';

export interface UseRecorderSpeechOptions {
  setParamInput: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<TextAreaRef>;
}

export const useRecorderSpeech = ({
  setParamInput,
  inputRef,
}: UseRecorderSpeechOptions) => {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    setSpeechSupported(typeof window !== 'undefined' && 'MediaRecorder' in window);
  }, []);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const mergeSpeechText = useCallback((baseText: string, speechText: string) => {
    const normalizedSpeechText = speechText.trim();
    if (!normalizedSpeechText) {
      return baseText;
    }
    if (!baseText.trim()) {
      return normalizedSpeechText;
    }
    return `${baseText.replace(/\s+$/, '')}\n${normalizedSpeechText}`;
  }, []);

  const handleSpeechToggle = useCallback(async () => {
    if (isListening) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        void message.error(
          '浏览器安全限制：非 HTTPS 或非 localhost 环境无法调用麦克风，请改用 localhost 访问。'
        );
      } else {
        void message.error('当前浏览器环境不支持麦克风录音功能。');
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        setIsListening(true);
        void message.info('正在录音，请开始说话，再次点击按钮停止并转写...');
      };

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        setIsTranscribing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;

        try {
          const text = await transcribeAudio(audioBlob, 'default');
          if (!text.trim()) {
            void message.warning('未识别到语音内容，请重试并靠近麦克风。');
            return;
          }

          setParamInput((prev) => mergeSpeechText(prev, text));
          inputRef.current?.focus();
        } catch (error: unknown) {
          void message.error(error instanceof Error ? error.message : '语音识别失败');
        } finally {
          setIsTranscribing(false);
          mediaRecorderRef.current = null;
        }
      };

      mediaRecorder.start();
    } catch (error) {
      console.error('Failed to start MediaRecorder:', error);
      const errName = error instanceof Error ? error.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        void message.error('麦克风权限被拒绝，请在浏览器地址栏或系统“隐私与安全性”中允许访问麦克风。');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        void message.error('未检测到可用麦克风，请检查音频输入设备连接。');
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        void message.error('麦克风被其他应用程序占用，请关闭会议等应用后重试。');
      } else {
        void message.error('无法访问麦克风，请检查浏览器权限设置。');
      }
    }
  }, [isListening, mergeSpeechText, setParamInput, inputRef]);

  return {
    isListening,
    isTranscribing,
    speechSupported,
    handleSpeechToggle,
  };
};
