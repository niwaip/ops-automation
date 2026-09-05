export interface ParsedChatSlashCommand {
  mode: 'chat' | 'task';
  message: string;
  isNewSession?: boolean;
  systemReply?: string;
  isCommandOnly?: boolean;
}

/**
 * 工作模式专属的 Slash 技能指令列表与匹配正则
 */
export const WORK_SLASH_COMMAND_REGEX =
  /^\s*\/(?:doc|workspace|rag|extract|pdf|email)(?:\s+|$)([\s\S]*)/i;

/**
 * 检测消息是否为工作模式专属的 Slash 指令
 */
export function isWorkSlashCommand(text: string): boolean {
  return WORK_SLASH_COMMAND_REGEX.test(text || '');
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
        '• `/search <内容>`：联网检索公开资讯与网页来源\n' +
        '• `/clear` 或 `/n`：清空上下文并开启全新会话\n' +
        '• `/help`：查看指令帮助\n' +
        '• 工作模式专属能力（`/doc` 工作空间探索、`/extract` 文档提取、`/email` 邮件助手）需在左下方切换至【工作模式】使用。',
    };
  }

  // 2. 个人模式下禁止调用工作模式专属的 Slash 技能能力
  if (initialMode === 'chat' && WORK_SLASH_COMMAND_REGEX.test(text)) {
    return {
      mode: 'chat',
      message: '',
      isCommandOnly: true,
      systemReply:
        '⚠️ 个人模式下不能调用工作能力（如工作空间文档探索 `/doc`、工作邮件助手 `/email`、文档内容提取 `/extract` 等企业技能）。\n\n' +
        '💡 如需使用企业技能与自动化工作流，请在界面左下方切换至【工作模式】。',
    };
  }

  // 3. New session command: /n, /new, /reset, /clear, /新会话
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

  // 4. Task mode command: /t, /task, /任务
  const taskMatch = text.match(/^\s*\/(?:t|task|任务)(?:\s+|$)([\s\S]*)/i);
  if (taskMatch) {
    const remaining = (taskMatch[1] || '').trim();
    // 如果在个人模式下，且带有工作 slash 指令，拦截
    if (initialMode === 'chat' && WORK_SLASH_COMMAND_REGEX.test(remaining)) {
      return {
        mode: 'chat',
        message: '',
        isCommandOnly: true,
        systemReply:
          '⚠️ 个人模式下不能调用工作能力（如工作空间文档探索 `/doc`、工作邮件助手 `/email`、文档内容提取 `/extract` 等企业技能）。\n\n' +
          '💡 如需使用企业技能与自动化工作流，请在界面左下方切换至【工作模式】。',
      };
    }
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

  // 5. Chat mode command: /c, /chat, /聊天
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
