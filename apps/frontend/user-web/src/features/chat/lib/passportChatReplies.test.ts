import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@ops/user-core';
import { PassportChatReplies } from './passportChatReplies';

const seed = (id='assistant-1',mode: 'chat'|'task'='chat'): ChatMessage => ({id,sessionId:'session-1',role:'assistant',content:'',timestamp:new Date().toISOString(),isStreaming:true,metadata:{mode}});
describe('device reply correlation', () => {
  it('returns only the exact device-originated assistant reply, once it finishes', () => {
    const replies=new PassportChatReplies(), receive=vi.fn();
    replies.capture(receive,()=>replies.start('session-1',seed()));
    replies.patch('other-session','assistant-1',{content:'别人的结果',isStreaming:false});
    replies.patch('session-1','assistant-1',{content:'部分答案'});
    expect(receive).toHaveBeenCalledTimes(1);
    replies.patch('session-1','assistant-1',{content:'这是最终答案',isStreaming:false});
    replies.patch('session-1','assistant-1',{content:'这是最终答案',isStreaming:false});
    expect(receive).toHaveBeenCalledTimes(2);
    expect(receive).toHaveBeenLastCalledWith({status:'completed',text:'这是最终答案'});
  });
  it.each(['failed','pending_approval','waiting_input','cancelled'] as const)('reports %s without a success notification', (status) => {
    const replies=new PassportChatReplies(),receive=vi.fn();
    replies.capture(receive,()=>replies.start('session-1',seed('assistant-1','task')));
    replies.patch('session-1','assistant-1',{isStreaming:false,metadata:{executionStatus:status,errorMessage:status==='failed'?'模型连接失败':undefined}});
    expect(receive.mock.lastCall?.[0].status).toBe(status);
    expect(receive.mock.calls.some(([reply])=>reply.status==='completed')).toBe(false);
  });
  it('does not return unrelated keyboard messages or old-account results', () => {
    const replies=new PassportChatReplies(),receive=vi.fn();
    replies.start('session-1',seed('keyboard'));
    replies.capture(receive,()=>replies.start('session-1',seed()));
    replies.clear();
    replies.patch('session-1','assistant-1',{content:'旧账户答案',isStreaming:false});
    expect(receive).toHaveBeenCalledTimes(1);
  });
  it('keeps a background task running until a terminal execution state arrives', () => {
    const replies=new PassportChatReplies(),receive=vi.fn();
    replies.capture(receive,()=>replies.start('session-1',seed('assistant-1','task')));
    replies.patch('session-1','assistant-1',{isStreaming:false,content:'任务已转后台',metadata:{taskStatus:'running'}});
    expect(receive).toHaveBeenCalledTimes(1);
    replies.patch('session-1','assistant-1',{metadata:{executionStatus:'succeeded',finalResult:'后台完成'}});
    expect(receive).toHaveBeenLastCalledWith({status:'completed',text:'后台完成'});
  });
});
