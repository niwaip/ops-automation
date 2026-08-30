export interface ParsedChatSlashCommand {
  mode: 'chat' | 'task';
  message: string;
  isNewSession?: boolean;
  systemReply?: string;
  isCommandOnly?: boolean;
}

export function parseChatSlashCommand(
  rawMessage: string,
  initialMode: 'chat' | 'task' = 'chat'
): ParsedChatSlashCommand {
  const text = (rawMessage || '').trim();

  // 1. Help command
  if (/^\s*\/(?:help|\?|帮助)(?:\s+|$)/i.test(text)) {
    return {
      mode: initialMode,
      message: '',
      isCommandOnly: true,
      systemReply:
        '💡 快捷指令帮助：\n' +
        '• `/t` 或 `/task <指令>`：任务执行模式（执行文件处理、搜索、自动化等）\n' +
        '• `/c` 或 `/chat <问题>`：直接聊天模式（知识问答、自由闲聊）\n' +
        '• `/n` 或 `/new [指令]`：重置并开启全新会话\n' +
        '• `/help`：查看指令帮助',
    };
  }

  // 2. New session command: /n, /new, /reset, /clear, /新会话
  const newMatch = text.match(/^\s*\/(?:n|new|reset|clear|新会话)(?:\s+|$)([\s\S]*)/i);
  if (newMatch) {
    const remaining = (newMatch[1] || '').trim();
    if (!remaining) {
      return {
        mode: initialMode,
        message: '',
        isNewSession: true,
        isCommandOnly: true,
        systemReply: '✨ 已为你开启全新会话，历史上下文已重置。请问有什么我可以帮你的？',
      };
    }
    const sub = parseChatSlashCommand(remaining, initialMode);
    return {
      ...sub,
      isNewSession: true,
    };
  }

  // 3. Task mode command: /t, /task, /任务
  const taskMatch = text.match(/^\s*\/(?:t|task|任务)(?:\s+|$)([\s\S]*)/i);
  if (taskMatch) {
    const remaining = (taskMatch[1] || '').trim();
    if (!remaining) {
      return {
        mode: 'task',
        message: '',
        isCommandOnly: true,
        systemReply:
          '🤖 已切换至【任务执行模式】。\n你可以直接向我发送任务指令（例如：`/t 拆分PDF文件`、`/t 查询北京天气`）。',
      };
    }
    return {
      mode: 'task',
      message: remaining,
      isCommandOnly: false,
    };
  }

  // 4. Chat mode command: /c, /chat, /聊天
  const chatMatch = text.match(/^\s*\/(?:c|chat|聊天)(?:\s+|$)([\s\S]*)/i);
  if (chatMatch) {
    const remaining = (chatMatch[1] || '').trim();
    if (!remaining) {
      return {
        mode: 'chat',
        message: '',
        isCommandOnly: true,
        systemReply: '💬 已切换至【日常聊天模式】。\n接下来你可以和我自由对话、咨询问题。',
      };
    }
    return {
      mode: 'chat',
      message: remaining,
      isCommandOnly: false,
    };
  }

  return {
    mode: initialMode,
    message: text,
    isCommandOnly: false,
  };
}
