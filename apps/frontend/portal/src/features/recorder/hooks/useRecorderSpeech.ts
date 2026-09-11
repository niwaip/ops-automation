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
      void message.error('无法访问麦克风，请检查浏览器权限设置。');
    }
  }, [isListening, mergeSpeechText, setParamInput, inputRef]);

  return {
    isListening,
    isTranscribing,
    speechSupported,
    handleSpeechToggle,
  };
};
