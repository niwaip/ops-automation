import { parseChatSlashCommand, isWorkSlashCommand } from './chat-slash-command.util';

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

  describe('Personal mode work slash command restrictions', () => {
    it('blocks /doc and its aliases (/workspace, /rag) in chat mode', () => {
      const p1 = parseChatSlashCommand('/doc 研读SWE-CI架构', 'chat');
      expect(p1.mode).toBe('chat');
      expect(p1.isCommandOnly).toBe(true);
      expect(p1.systemReply).toContain('个人模式下不能调用工作能力');
      expect(p1.systemReply).toContain('/doc');

      const p2 = parseChatSlashCommand('/workspace 搜索规范', 'chat');
      expect(p2.isCommandOnly).toBe(true);
      expect(p2.systemReply).toContain('个人模式下不能调用工作能力');

      const p3 = parseChatSlashCommand('/rag 知识检索', 'chat');
      expect(p3.isCommandOnly).toBe(true);
      expect(p3.systemReply).toContain('个人模式下不能调用工作能力');
    });

    it('blocks /extract and /pdf in chat mode', () => {
      const p1 = parseChatSlashCommand('/extract 提取文档', 'chat');
      expect(p1.isCommandOnly).toBe(true);
      expect(p1.systemReply).toContain('个人模式下不能调用工作能力');

      const p2 = parseChatSlashCommand('/pdf 解析报告.pdf', 'chat');
      expect(p2.isCommandOnly).toBe(true);
      expect(p2.systemReply).toContain('个人模式下不能调用工作能力');
    });

    it('blocks /email in chat mode', () => {
      const p = parseChatSlashCommand('/email 查询最新邮件', 'chat');
      expect(p.isCommandOnly).toBe(true);
      expect(p.systemReply).toContain('个人模式下不能调用工作能力');
    });

    it('blocks /t when attempting to call work slash command from chat mode', () => {
      const p = parseChatSlashCommand('/t /doc 研读架构', 'chat');
      expect(p.isCommandOnly).toBe(true);
      expect(p.systemReply).toContain('个人模式下不能调用工作能力');
    });

    it('allows /doc in task mode', () => {
      const p = parseChatSlashCommand('/doc 研读架构', 'task');
      expect(p.mode).toBe('task');
      expect(p.message).toBe('/doc 研读架构');
      expect(p.isCommandOnly).toBe(false);
    });

    it('allows /search in chat mode', () => {
      const p = parseChatSlashCommand('/search 2026 AI 新闻', 'chat');
      expect(p.mode).toBe('chat');
      expect(p.message).toBe('/search 2026 AI 新闻');
      expect(p.isCommandOnly).toBe(false);
    });

    it('correctly identifies work slash commands using isWorkSlashCommand', () => {
      expect(isWorkSlashCommand('/doc xxx')).toBe(true);
      expect(isWorkSlashCommand('/workspace')).toBe(true);
      expect(isWorkSlashCommand('/extract')).toBe(true);
      expect(isWorkSlashCommand('/pdf sample.pdf')).toBe(true);
      expect(isWorkSlashCommand('/email')).toBe(true);
      expect(isWorkSlashCommand('/search xxx')).toBe(false);
      expect(isWorkSlashCommand('/help')).toBe(false);
      expect(isWorkSlashCommand('普通文本 /doc')).toBe(false);
    });
  });
});
