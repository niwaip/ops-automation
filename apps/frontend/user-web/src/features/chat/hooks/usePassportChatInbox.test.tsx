/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePassportChatInbox } from './usePassportChatInbox';
import { passportChatInbox } from '../lib/passportChatInbox';
import { useChatStore } from '../chatStore';
import { passportChatReplies } from '../lib/passportChatReplies';

vi.mock('../lib/chatComposerMedia', () => ({ mergeSpeechText: (base: string, text: string) => base ? `${base}\n${text}` : text }));
let root: Root | undefined;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); });
afterEach(() => { act(() => root?.unmount()); root = undefined; passportChatInbox.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function mount(options: Parameters<typeof usePassportChatInbox>[0]) {
  const container = document.createElement('div');
  root = createRoot(container);
  function Harness() { usePassportChatInbox(options); return null; }
  act(() => root!.render(<Harness />));
}

describe('chat window Bluetooth delivery', () => {
  it('keeps the reply callback bound to the actual assistant created by the sender', async () => {
    const session=useChatStore.getState().createSession();
    const onReply=vi.fn();
    const pending=passportChatInbox.enqueue({text:'设备提问',send:true,sessionId:session.id,onReply});
    mount({selectedSessionId:session.id,busy:false,draft:'',setDraft:vi.fn(),send:()=>{
      passportChatReplies.start(session.id,{id:'device-assistant',sessionId:session.id,role:'assistant',content:'',timestamp:new Date().toISOString(),isStreaming:true,metadata:{mode:'chat'}});
      return true;
    }});
    await pending;
    passportChatReplies.patch(session.id,'device-assistant',{content:'AI 的真实回复',isStreaming:false});
    expect(onReply).toHaveBeenLastCalledWith({status:'completed',text:'AI 的真实回复'});
    passportChatReplies.clear();
  });
  it('uses the normal sender and preserves the typed draft', async () => {
    const session=useChatStore.getState().createSession();
    const pending=passportChatInbox.enqueue({ text:'蓝牙消息',send:true,sessionId:session.id });
    const send=vi.fn(() => true); const setDraft=vi.fn();
    mount({ selectedSessionId:session.id,busy:false,draft:'未发送的草稿',setDraft,send });
    await pending;
    expect(send).toHaveBeenCalledWith('蓝牙消息');
    expect(setDraft).toHaveBeenCalledWith('未发送的草稿');
  });
  it('keeps waiting when the normal sender is busy rather than dropping the message', async () => {
    vi.useFakeTimers();
    const session=useChatStore.getState().createSession();
    const pending=passportChatInbox.enqueue({ text:'蓝牙消息',send:true,sessionId:session.id });
    const send=vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    mount({ selectedSessionId:session.id,busy:false,draft:'',setDraft:vi.fn(),send });
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    await pending;
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('does not deliver into a different chat session', async () => {
    useChatStore.getState().createSession();
    const pending=passportChatInbox.enqueue({ text:'旧会话语音',send:true,sessionId:'previous' });
    const assertion=expect(pending).rejects.toThrow('会话已切换');
    const send=vi.fn(() => true);
    mount({ selectedSessionId:'current',busy:false,draft:'',setDraft:vi.fn(),send });
    await assertion; expect(send).not.toHaveBeenCalled();
  });
});
