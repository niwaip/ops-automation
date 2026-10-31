import { PDF_COMMAND_HELP } from './chat-pdf-help';

export interface ParsedChatSlashCommand {
  mode: 'chat' | 'task';
  message: string;
  isNewSession?: boolean;
  systemReply?: string;
  isCommandOnly?: boolean;
}

/**
 * 工作模式专属的 Slash 技能指令列表与匹配正则（企业知识库、文档内容提取与邮件）
 */
export const WORK_SLASH_COMMAND_REGEX =
  /^\s*\/(?:doc|workspace|rag|extract|email|pdf-extract)(?:\s+|$)([\s\S]*)/i;

/**
 * 工作空间探索指令集合（统一 SSOT）
 */
export const WORKSPACE_EXPLORE_COMMANDS = ['doc', 'workspace', 'rag'] as const;

/**
 * 检测是否为工作空间探索指令（/doc, /workspace, /rag）
 */
export function isWorkspaceExploreCommand(text: string): boolean {
  return /^\s*\/(?:doc|workspace|rag)(?:\s+|$)/i.test((text || '').trim());
}

/**
 * 检测是否为文档提取指令（/extract, /pdf-extract）
 */
export function isDocumentExtractCommand(text: string): boolean {
  return /^\s*\/(?:extract|pdf-extract)(?:\s+|$)/i.test((text || '').trim());
}

/**
 * 检测是否为联网搜索指令（/search）
 */
export function isWebSearchCommand(text: string): boolean {
  return /^\s*\/search(?:\s+|$)/i.test((text || '').trim());
}

/**
 * 检测消息是否为工作模式专属的 Slash 指令
 */
export function isWorkSlashCommand(text: string): boolean {
  return WORK_SLASH_COMMAND_REGEX.test(text || '');
}

/**
 * 个人模式专属的 Slash 工具指令（由沙箱 Agent 自主解析与执行）
 */
export const PERSONAL_SLASH_COMMAND_REGEX =
  /^\s*\/(?:ppt|slides|deck|research|deepsearch|last30days|调研|excel|xlsx|table|表格|word|docx|pdf|form|image|draw|生图|design|ui|prototype|report)(?:\s+|$)([\s\S]*)/i;

/**
 * 检测消息是否为个人沙箱专属的 Slash 指令
 */
export function isPersonalSlashCommand(text: string): boolean {
  return PERSONAL_SLASH_COMMAND_REGEX.test(text || '');
}

export function parseChatSlashCommand(
  rawMessage: string,
  initialMode: 'chat' | 'task' = 'chat'
): ParsedChatSlashCommand {
  const text = (rawMessage || '').trim();

  if (/^\/pdf$/i.test(text)) {
    return {
      mode: initialMode,
      message: '',
      isCommandOnly: true,
      systemReply: PDF_COMMAND_HELP,
    };
  }

  // 1. Help command
  if (/^\s*\/(?:help|\?|帮助)(?:\s+|$)/i.test(text)) {
    const isWorkMode = initialMode === 'task';
    const systemReply = isWorkMode
      ? '💡 快捷指令帮助（工作模式）：\n\n' +
        '🏢 企业工作能力（当前已就绪）：\n' +
        '• `/doc <问题>`：工作空间文档探索，自主研读知识库文档、代码与规范（别名：`/workspace`, `/rag`）\n' +
        '• `/extract [文档]`：文档内容提取，结构化解析 PDF、Word、PPTX 文档与元数据\n' +
        '• `/email <指令>`：工作邮件助手，快速查询收件箱、邮件整理与起草\n\n' +
        '🌐 常用会话指令：\n' +
        '• `/search <内容>`：联网检索公开最新资讯与网页来源（别名：`/web`）\n' +
        '• `/clear` 或 `/n`：清空上下文并开启全新会话（别名：`/new`, `/reset`）\n' +
        '• `/help`：查看指令帮助\n\n' +
        '💡 如需体验 PPT 制作、深度技术调研、Excel/Word 生产力工具或生图，请在左下方切换至【个人模式】。'
      : '💡 快捷指令帮助（个人模式）：\n\n' +
        '🛠️ 生产力创作与沙箱工具：\n' +
        '• `/ppt <主题>`：商业汇报幻灯片与交互报告（别名：`/slides`, `/deck`）\n' +
        '• `/research <主题>`：深度全网多源技术调研（Web + GitHub + HackerNews，别名：`/last30days`, `/调研`）\n' +
        '• `/excel <需求>`：Excel 电子表格与数据计算，支持公式重算校验（别名：`/xlsx`, `/table`, `/表格`）\n' +
        '• `/word <需求>`：Word 文档起草、合同合规审查与批注留痕（别名：`/docx`）\n' +
        '• `/pdf [需求]`：PDF 排版设计与生成；直接输入 `/pdf` 查看排版示例（别名：`/form`）\n' +
        '• `/image <画面>`：AI 图像创作与海报设计（别名：`/draw`, `/生图`）\n' +
        '• `/design <构想>`：前端单页交互原型与数据大屏设计（别名：`/ui`, `/prototype`）\n\n' +
        '🌐 常用会话指令：\n' +
        '• `/search <内容>`：联网检索公开最新资讯与网页来源（别名：`/web`）\n' +
        '• `/clear` 或 `/n`：清空上下文并开启全新会话（别名：`/new`, `/reset`）\n' +
        '• `/help`：查看指令帮助\n\n' +
        '💡 如需使用企业工作能力（`/doc`、`/extract`、`/email`），需在左下方切换至【工作模式】使用。';

    return {
      mode: initialMode,
      message: '',
      isCommandOnly: true,
      systemReply,
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
