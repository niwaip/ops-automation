import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { App } from 'antd';
import { useAuthStore } from '@/shared/store/authStore';
import { useChatStore } from '@/features/chat/chatStore';
import { transcribeAudio } from '@/features/chat/lib/chatComposerMedia';
import { passportChatInbox } from '@/features/chat/lib/passportChatInbox';
import { passportChatReplies } from '@/features/chat/lib/passportChatReplies';
import { PassportBluetoothClient, type PairingState, type PassportBluetooth, type TrustStore } from '../lib/passport-bluetooth';
import { PassportVoice } from '../lib/passport-voice';
import { PassportReplyRelay } from '../lib/passport-reply';

interface PassportSession {
  client: PassportBluetoothClient | null;
  state: PairingState;
  voiceStatus: string;
  voiceError: boolean;
  transcript: string;
  bluetoothAvailable: boolean;
}
const Context = createContext<PassportSession | null>(null);
export function usePassportSession() { return useContext(Context); }

function sessionTrust(userId: string): TrustStore {
  const key = (id: string) => `ops:passport:${userId}:${id}`;
  return {
    load(id) {
      try {
        const value = JSON.parse(sessionStorage.getItem(key(id)) || 'null');
        return value && typeof value.deviceId === 'string' && typeof value.token === 'string' && /^[a-f0-9]{32}$/i.test(value.token) ? value : null;
      } catch { return null; }
    },
    save(id, trust) { sessionStorage.setItem(key(id), JSON.stringify(trust)); },
    remove(id) { sessionStorage.removeItem(key(id)); },
  };
}

export function PassportProvider({ children }: { children: ReactNode }) {
  const userId = useAuthStore((s) => s.user?.id);
  return userId ? <Session key={userId} userId={userId}>{children}</Session> : <>{children}</>;
}

function Session({ userId, children }: { userId: string; children: ReactNode }) {
  const { message: toast } = App.useApp();
  const [state, setState] = useState<PairingState>({ status: 'disconnected' });
  const [voiceStatus, setVoiceStatus] = useState('');
  const [voiceError, setVoiceError] = useState(false);
  const [transcript, setTranscript] = useState('');
  const bluetooth = (navigator as Navigator & { bluetooth?: PassportBluetooth }).bluetooth;
  const runtime = useMemo(() => {
    if (!bluetooth) return null;
    let client: PassportBluetoothClient;
    const checkUser = () => { if (useAuthStore.getState().user?.id !== userId) throw new Error('登录账户已变化'); };
    const report = (text: string, error = false) => { setVoiceStatus(text); setVoiceError(error); if (error) { replies.setRecording(false); void toast.error(text); } };
    const replies = new PassportReplyRelay((message) => { checkUser(); return client.sendControl(message); }, report);
    const voice = new PassportVoice({
      send: (message) => client.sendControl(message),
      transcribe: async (audio, signal) => {
        checkUser();
        const text = await transcribeAudio(audio, 'default', signal);
        checkUser();
        if (!signal.aborted) setTranscript(text);
        return text;
      },
      deliver: (text, send) => {
        checkUser();
        const chat = useChatStore.getState();
        const result = passportChatInbox.enqueue({ text, send, sessionId: chat.currentSession?.id ?? null, onReply: (reply) => { void replies.publish(reply); } });
        chat.setOpen(true);
        return result;
      },
      status: report,
    });
    client = new PassportBluetoothClient(bluetooth, sessionTrust(userId), setState, {
      message: (message) => {
        voice.message(message);
        if (message.type === 'voice.begin') replies.setRecording(voice.isRecording);
        if (message.type === 'voice.end') replies.setRecording(false);
      }, audio: (frame) => voice.audio(frame),
      disconnect: () => { voice.reset(); replies.reset(); passportChatReplies.clear(); passportChatInbox.clear(); setVoiceStatus(''); },
    });
    return { client, voice };
  }, [bluetooth, userId, toast]);
  useEffect(() => () => { runtime?.client.disconnect(); passportChatInbox.clear(); }, [runtime]);
  return <Context.Provider value={{ client: runtime?.client ?? null, state, voiceStatus, voiceError, transcript, bluetoothAvailable: Boolean(bluetooth) }}>{children}</Context.Provider>;
}
