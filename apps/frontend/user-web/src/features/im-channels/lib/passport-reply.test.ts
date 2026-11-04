import { describe, expect, it, vi } from 'vitest';
import { deviceText, PassportReplyRelay } from './passport-reply';
import { encodePassportMessage } from './passport-protocol';
import type { PassportMessage } from './passport-protocol';

describe('Passport reply downlink', () => {
  it('defers the result while the user is recording so firmware does not discard it', async () => {
    const send=vi.fn(async (_m:PassportMessage)=>{});
    const relay=new PassportReplyRelay(send,vi.fn());
    relay.setRecording(true);
    const pending=relay.publish({status:'completed',text:'答案'});
    await Promise.resolve(); expect(send).not.toHaveBeenCalled();
    relay.setRecording(false); await pending;
    expect(send).toHaveBeenCalledWith(expect.objectContaining({type:'task.state',state:'completed'}));
  });
  it('returns a UTF-8 safe reply summary within both frame and firmware limits', async () => {
    const send=vi.fn(async (_m:PassportMessage)=>{}),report=vi.fn();
    const relay=new PassportReplyRelay(send,report);
    await relay.publish({status:'completed',text:'<think>内部推理不发设备</think>这是中文答案'.repeat(15)});
    const messages=send.mock.calls.map(([m])=>m);
    expect(messages[0]).toMatchObject({type:'task.state',state:'completed'});
    expect(new TextEncoder().encode(String(messages[0].title)).length).toBeLessThanOrEqual(60);
    expect(String(messages[0].title)).not.toContain('内部推理');
    for(const m of messages) expect(()=>encodePassportMessage(m,1)).not.toThrow();
    expect(report).toHaveBeenLastCalledWith(expect.stringContaining('已送达'),false);
    expect(deviceText('中文'.repeat(100),60)).toMatch(/…$/);
  });
  it('uses waiting and failure states rather than showing failed work as completed', async () => {
    const send=vi.fn(async (_m:PassportMessage)=>{});
    const relay=new PassportReplyRelay(send,vi.fn());
    await relay.publish({status:'pending_approval',text:'需要审批'});
    await relay.publish({status:'failed',text:'模型连接失败'});
    const messages=send.mock.calls.map(([m])=>m);
    expect(messages[0]).toMatchObject({state:'waiting_approval'});
    expect(messages.some(m=>m.state==='completed')).toBe(false);
    expect(messages.at(-1)).toMatchObject({type:'toast',urgent:true});
  });
  it('reports downlink errors without claiming the device received a reply', async () => {
    const send=vi.fn(async()=>{throw new Error('no ACK')}),report=vi.fn();
    await new PassportReplyRelay(send,report).publish({status:'completed',text:'答案'});
    expect(report).toHaveBeenCalledWith(expect.stringContaining('未确认接收'),true);
  });
  it('does not send an old queued result after disconnect', async () => {
    const send=vi.fn(async (_m:PassportMessage)=>{});
    const relay=new PassportReplyRelay(send,vi.fn());
    const pending=relay.publish({status:'completed',text:'旧答案'});
    relay.reset(); await pending;
    expect(send).not.toHaveBeenCalled();
  });
});
