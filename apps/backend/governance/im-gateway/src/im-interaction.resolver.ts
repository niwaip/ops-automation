export type InteractionMode = 'auto' | 'chat' | 'task';

export interface ImInteractionResolution {
  type: 'ai' | 'system_reply';
  mode: 'chat' | 'task';
  message: string;
  isNewSession?: boolean;
  systemReplyText?: string;
}

export function resolveImInteraction(
  text: string,
  configuredMode: InteractionMode = 'chat'
): ImInteractionResolution {
  const raw = text.trim();

  // 1. Help command: /help, /?, /帮助
  if (/^\s*\/(?:help|\?|帮助)(?:\s+|$)/i.test(raw)) {
    return {
      type: 'system_reply',
      mode: 'chat',
      message: '',
      systemReplyText:
        '💡 快捷指令帮助：\n' +
        '• `/c` 或 `/chat <问题>`：个人问答模式（默认，安全沙箱与自由问答）\n' +
        '• `/t` 或 `/task <指令>`：工作任务模式（多步技能编排、自动化任务）\n' +
        '• `/n` 或 `/new [指令]`：重置并开启全新会话\n' +
        '• `/cancel` 或 `/取消`：清空已暂存的待处理图片或文件\n' +
        '• `/next` 或 `/继续`：补发因频率限制暂存的消息\n' +
        '• `/help`：查看指令帮助',
    };
  }

  // 2. New session command: /n, /new, /reset, /clear, /新会话
  const newMatch = raw.match(/^\s*\/(?:n|new|reset|clear|新会话)(?:\s+|$)([\s\S]*)/i);
  if (newMatch) {
    const remaining = (newMatch[1] || '').trim();
    if (!remaining) {
      return {
        type: 'system_reply',
        mode: 'chat',
        message: '',
        isNewSession: true,
        systemReplyText: '✨ 已为你开启全新会话，历史上下文已重置。请问有什么我可以帮你的？',
      };
    }
    const sub = resolveImInteraction(remaining, configuredMode);
    return {
      ...sub,
      isNewSession: true,
    };
  }

  // 3. Task mode command: /t, /task, /任务
  const taskMatch = raw.match(/^\s*\/(?:t|task|任务)(?:\s+|$)([\s\S]*)/i);
  if (taskMatch) {
    const remaining = (taskMatch[1] || '').trim();
    if (!remaining) {
      return {
        type: 'system_reply',
        mode: 'task',
        message: '',
        systemReplyText:
          '🤖 已切换至【工作任务模式】。\n后续输入将直接进入任务规划模式执行。你可以直接向我发送任务指令（例如：`生成保密合同`、`拆分PDF文件`）。如需切回问答模式请输入 `/c`。',
      };
    }
    return {
      type: 'ai',
      mode: 'task',
      message: remaining,
    };
  }

  // 4. Chat mode command: /c, /chat, /聊天
  const chatMatch = raw.match(/^\s*\/(?:c|chat|聊天)(?:\s+|$)([\s\S]*)/i);
  if (chatMatch) {
    const remaining = (chatMatch[1] || '').trim();
    if (!remaining) {
      return {
        type: 'system_reply',
        mode: 'chat',
        message: '',
        systemReplyText:
          '💬 已切换至【个人问答模式】。\n后续输入将以个人问答模式执行。如需切回任务模式请输入 `/t`。',
      };
    }
    return {
      type: 'ai',
      mode: 'chat',
      message: remaining,
    };
  }

  // 5. Configured / Default mode
  // 智能工作流与技能意图识别：
  // 若消息以 !/！ 开头，或包含明确的工作流/技能意图，自动进入 task 规划模式
  const isExplicitWorkflow =
    /^[!！]/.test(raw) ||
    /^(?:生成|起草|拟定|拟写|创建|审查|比对)(?:保密合同|保密协议|合同|协议)/i.test(raw) ||
    /(?:生成保密合同|保密合同起草|合同合规审查)/i.test(raw);

  const resolvedMode: InteractionMode = isExplicitWorkflow ? 'task' : 'chat';

  return {
    type: 'ai',
    mode: resolvedMode,
    message: raw.replace(/^[!！]\s*/, ''),
  };
}
