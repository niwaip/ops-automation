import { parseChatSlashCommand } from './chat-slash-command.util';

describe('parseChatSlashCommand', () => {
  it('parses /t short command and switches to task mode', () => {
    const parsed = parseChatSlashCommand('/t 帮我拆分PDF文件');
    expect(parsed.mode).toBe('task');
    expect(parsed.message).toBe('帮我拆分PDF文件');
    expect(parsed.isCommandOnly).toBe(false);
  });

  it('parses /task and /任务 command aliases', () => {
    const p1 = parseChatSlashCommand('/task 查询天气');
    expect(p1.mode).toBe('task');
    expect(p1.message).toBe('查询天气');

    const p2 = parseChatSlashCommand('/任务 导出报表');
    expect(p2.mode).toBe('task');
    expect(p2.message).toBe('导出报表');
  });

  it('handles /t command only without message and provides system reply', () => {
    const parsed = parseChatSlashCommand('/t');
    expect(parsed.mode).toBe('task');
    expect(parsed.isCommandOnly).toBe(true);
    expect(parsed.systemReply).toContain('任务执行模式');
  });

  it('parses /c short command and switches to chat mode', () => {
    const parsed = parseChatSlashCommand('/c 请介绍一下量子力学', 'task');
    expect(parsed.mode).toBe('chat');
    expect(parsed.message).toBe('请介绍一下量子力学');
    expect(parsed.isCommandOnly).toBe(false);
  });

  it('handles /c command only without message and provides system reply', () => {
    const parsed = parseChatSlashCommand('/c');
    expect(parsed.mode).toBe('chat');
    expect(parsed.isCommandOnly).toBe(true);
    expect(parsed.systemReply).toContain('日常聊天模式');
  });

  it('parses /n short command and indicates new session reset', () => {
    const parsed = parseChatSlashCommand('/n');
    expect(parsed.isNewSession).toBe(true);
    expect(parsed.isCommandOnly).toBe(true);
    expect(parsed.systemReply).toContain('全新会话');
  });

  it('parses /n followed by a task command', () => {
    const parsed = parseChatSlashCommand('/n /t 总结这个报告');
    expect(parsed.isNewSession).toBe(true);
    expect(parsed.mode).toBe('task');
    expect(parsed.message).toBe('总结这个报告');
    expect(parsed.isCommandOnly).toBe(false);
  });

  it('parses /help command and returns help guide', () => {
    const parsed = parseChatSlashCommand('/help');
    expect(parsed.isCommandOnly).toBe(true);
    expect(parsed.systemReply).toContain('快捷指令帮助');
  });

  it('leaves regular text untouched with default mode', () => {
    const parsed = parseChatSlashCommand('普通消息', 'task');
    expect(parsed.mode).toBe('task');
    expect(parsed.message).toBe('普通消息');
    expect(parsed.isCommandOnly).toBe(false);
  });
});
