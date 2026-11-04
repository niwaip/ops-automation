import { useEffect, useRef } from 'react';
import { passportChatInbox } from '../lib/passportChatInbox';
import { useChatStore } from '../chatStore';
import { mergeSpeechText } from '../lib/chatComposerMedia';
import { passportChatReplies } from '../lib/passportChatReplies';

interface Options {
  selectedSessionId: string | null;
  busy: boolean;
  draft: string;
  setDraft(text: string): void;
  send(text: string): boolean;
}

export function usePassportChatInbox(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    const tick = () => passportChatInbox.consume((item) => {
      const current = latest.current;
      if (item.sessionId && item.sessionId !== useChatStore.getState().currentSession?.id) throw new Error('当前聊天会话已切换，语音未提交，请重新发送');
      if (item.sessionId && item.sessionId !== current.selectedSessionId) return false;
      if (current.busy) return false;
      if (!item.send) { current.setDraft(mergeSpeechText(current.draft, item.text)); return true; }
      const accepted = passportChatReplies.capture(item.onReply, () => current.send(item.text));
      // A device message must not erase a draft the user was typing.
      if (accepted && current.draft) current.setDraft(current.draft);
      return accepted;
    });
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, []);
}
