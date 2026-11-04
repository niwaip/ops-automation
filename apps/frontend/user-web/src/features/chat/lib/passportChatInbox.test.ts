import { afterEach, describe, expect, it, vi } from 'vitest';
import { PassportChatInbox, type PassportChatItem } from './passportChatInbox';

afterEach(() => { vi.useRealTimers(); });
describe('Passport chat inbox', () => {
  it('retains a busy message and acknowledges it only when the normal chat sender accepts it', async () => {
    const inbox = new PassportChatInbox();
    const delivered = vi.fn();
    const pending = inbox.enqueue({ text:'测试消息', send:true, sessionId:'session-1' }).then(delivered);
    inbox.consume(() => false);
    await Promise.resolve(); expect(delivered).not.toHaveBeenCalled();
    const send = vi.fn((_item: PassportChatItem) => true);
    inbox.consume(send); inbox.consume(send);
    await pending;
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ text:'测试消息',sessionId:'session-1' });
    expect(delivered).toHaveBeenCalledOnce();
  });
  it('cancels pending work on disconnect instead of sending into another account', async () => {
    const inbox = new PassportChatInbox();
    const pending = inbox.enqueue({ text:'测试消息',send:true,sessionId:null });
    const assertion = expect(pending).rejects.toThrow('取消');
    inbox.clear(); await assertion;
    const send=vi.fn(() => true); inbox.consume(send); expect(send).not.toHaveBeenCalled();
  });
  it('rejects a changed session and never leaves the message available for a second sender', async () => {
    const inbox = new PassportChatInbox();
    const pending = inbox.enqueue({ text:'测试消息',send:true,sessionId:'old-session' });
    const assertion = expect(pending).rejects.toThrow('会话');
    inbox.consume(() => { throw new Error('会话已变化'); });
    await assertion;
    const send=vi.fn(() => true); inbox.consume(send); expect(send).not.toHaveBeenCalled();
  });
});
