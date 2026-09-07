import { message as antdMessage } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SPEECH_LANGUAGE_STORAGE_KEY,
  mergeSpeechText,
  normalizeSpeechLanguage,
  transcribeAudio,
} from '../lib/chatComposerMedia';

interface UseChatSpeechRecorderProps {
  draft: string;
  onDraftChange: (text: string) => void;
  onFocusInput?: () => void;
}

export function useChatSpeechRecorder({
  draft,
  onDraftChange,
  onFocusInput,
}: UseChatSpeechRecorderProps) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechLanguage] = useState(() => {
    if (typeof window === 'undefined') {
      return 'zh-CN';
    }
    const saved = window.localStorage.getItem(SPEECH_LANGUAGE_STORAGE_KEY);
    return normalizeSpeechLanguage(saved || navigator.language);
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const stopListening = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  useEffect(() => {
    setSpeechSupported(typeof window !== 'undefined' && 'MediaRecorder' in window);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SPEECH_LANGUAGE_STORAGE_KEY, speechLanguage);
  }, [speechLanguage]);

  useEffect(
    () => () => {
      stopListening();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [stopListening]
  );

  const handleSpeechToggle = useCallback(async () => {
    if (isListening) {
      stopListening();
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
        void antdMessage.info(
          `正在录音（${speechLanguage}），再次点击按钮停止并转写...`
        );
      };

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        setIsTranscribing(true);
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm',
        });
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;

        try {
          const text = await transcribeAudio(audioBlob, 'default');
          if (!text.trim()) {
            void antdMessage.warning('未识别到语音内容，请重试并靠近麦克风。');
            return;
          }
          onDraftChange(mergeSpeechText(draft, text));
          onFocusInput?.();
        } catch (error: unknown) {
          void antdMessage.error(
            error instanceof Error ? error.message : '语音识别失败'
          );
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
    } catch (error: unknown) {
      console.error('Speech recording start failed:', error);
      void antdMessage.error('无法访问麦克风，请检查浏览器权限。');
      setIsListening(false);
    }
  }, [
    draft,
    isListening,
    onDraftChange,
    onFocusInput,
    speechLanguage,
    stopListening,
  ]);

  return {
    isListening,
    isTranscribing,
    speechSupported,
    speechLanguage,
    handleSpeechToggle,
  };
}
