export interface SlashCommandDefinition {
  command: string;
  aliases?: string[];
  title: string;
  description: string;
  skillId?: string;
  badge?: string;
  placeholderHint?: string;
  scope?: 'work' | 'personal' | 'all';
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * 系统内置技能与快捷指令注册表
 * 后续新增的内置技能可直接在此声明对应的 Slash 命令
 */
export const BUILTIN_SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    command: '/doc',
    aliases: ['/workspace', '/rag'],
    title: '工作空间文档探索',
    description: '自主检索并研读工作空间中的知识文档、代码与规范（多步 Agent 探查）',
    skillId: 'platform.workspace.explorer',
    badge: '工作专属',
    placeholderHint: '输入文档问题或关键词，如 /doc SWE-CI 双代理架构是什么',
    scope: 'work',
  },
  {
    command: '/extract',
    aliases: ['/pdf'],
    title: '文档内容提取',
    description: '解析提取 PDF、PPTX、Word 文档的全文与元数据',
    skillId: 'platform.document.pdf-content-extractor',
    badge: '工作专属',
    placeholderHint: '上传或指定文档进行结构化文本提取',
    scope: 'work',
  },
  {
    command: '/email',
    aliases: [],
    title: '工作邮件助手',
    description: '快速查询收件箱邮件并支持邮件整理与发送',
    skillId: 'platform.email.messages',
    badge: '工作专属',
    placeholderHint: '如 /email 帮我查看今天收到的最新汇报',
    scope: 'work',
  },
  {
    command: '/search',
    aliases: ['/web'],
    title: '联网搜索',
    description: '检索公开互联网最新资讯与网页，返回可引用的来源',
    skillId: 'platform.search.web',
    badge: '通用搜索',
    placeholderHint: '输入搜索内容，如 /search 最新 AI 模型发布',
    scope: 'all',
  },
  {
    command: '/clear',
    aliases: ['/new', '/reset', '/新会话'],
    title: '重置并开启新会话',
    description: '清空当前上下文并开启全新独立对话',
    badge: '会话管理',
    placeholderHint: '输入 /clear 开启全新会话',
    scope: 'all',
  },
  {
    command: '/help',
    aliases: ['/?', '/帮助'],
    title: '快捷指令帮助',
    description: '查看当前模式下的可用指令与能力说明',
    badge: '指令帮助',
    placeholderHint: '输入 /help 查看指令帮助',
    scope: 'all',
  },
];

/**
 * 工作模式专属的 Slash 命令匹配正则表达式
 */
export const WORK_SLASH_COMMAND_REGEX =
  /^\s*\/(?:doc|workspace|rag|extract|pdf|email|t|task|任务)(?:\s+|$)/i;

/**
 * 检测消息是否为工作模式专属的 Slash 指令
 */
export function isWorkSlashCommand(text: string): boolean {
  return WORK_SLASH_COMMAND_REGEX.test(text || '');
}

/**
 * 根据用户输入的命令前缀（如 "/d" 或 "/doc"）和当前模式匹配候选命令
 */
export function matchSlashCommands(
  input: string,
  mode: 'chat' | 'task' = 'task'
): SlashCommandDefinition[] {
  const clean = input.trim().toLowerCase();
  const isAll = !clean || clean === '/' || clean === '、';
  const query = clean.startsWith('/') || clean.startsWith('、') ? clean.slice(1) : clean;

  const candidates = BUILTIN_SLASH_COMMANDS.filter((cmd) => {
    if (isAll) return true;
    const mainCmd = cmd.command.slice(1).toLowerCase();
    if (mainCmd.includes(query)) return true;
    if (cmd.title.toLowerCase().includes(query)) return true;
    if (cmd.description.toLowerCase().includes(query)) return true;
    if (cmd.aliases?.some((a) => a.slice(1).toLowerCase().includes(query))) return true;
    return false;
  });

  // 在个人模式下，将工作专属命令标记为 disabled 并提供禁用说明
  if (mode === 'chat') {
    return candidates.map((cmd) => {
      if (cmd.scope === 'work') {
        return {
          ...cmd,
          disabled: true,
          disabledReason: '工作模式专属技能（个人模式下已禁用）',
        };
      }
      return cmd;
    });
  }

  return candidates;
}
