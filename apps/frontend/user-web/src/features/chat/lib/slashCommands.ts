export interface SlashCommandDefinition {
  command: string;
  aliases?: string[];
  title: string;
  description: string;
  skillId?: string;
  badge?: string;
  placeholderHint?: string;
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
    badge: '内置技能',
    placeholderHint: '输入文档问题或关键词，如 /doc SWE-CI 双代理架构是什么',
  },
  {
    command: '/search',
    aliases: ['/web'],
    title: '联网搜索',
    description: '检索公开互联网最新资讯与网页，返回可引用的来源',
    skillId: 'platform.search.web',
    badge: '内置技能',
    placeholderHint: '输入搜索内容，如 /search 最新 AI 模型发布',
  },
  {
    command: '/extract',
    aliases: ['/pdf'],
    title: '文档内容提取',
    description: '解析提取 PDF、PPTX、Word 文档的全文与元数据',
    skillId: 'platform.document.pdf-content-extractor',
    badge: '内置技能',
    placeholderHint: '上传或指定文档进行结构化文本提取',
  },
  {
    command: '/email',
    aliases: [],
    title: '工作邮件助手',
    description: '快速查询收件箱邮件并支持邮件整理与发送',
    skillId: 'platform.email.messages',
    badge: '内置技能',
    placeholderHint: '如 /email 帮我查看今天收到的最新汇报',
  },
];

/**
 * 根据用户输入的命令前缀（如 "/d" 或 "/doc"）匹配候选命令
 */
export function matchSlashCommands(input: string): SlashCommandDefinition[] {
  const clean = input.trim().toLowerCase();
  if (!clean || clean === '/' || clean === '、') {
    return BUILTIN_SLASH_COMMANDS;
  }

  const query = clean.startsWith('/') || clean.startsWith('、') ? clean.slice(1) : clean;

  return BUILTIN_SLASH_COMMANDS.filter((cmd) => {
    const mainCmd = cmd.command.slice(1).toLowerCase();
    if (mainCmd.includes(query)) return true;
    if (cmd.title.toLowerCase().includes(query)) return true;
    if (cmd.description.toLowerCase().includes(query)) return true;
    if (cmd.aliases?.some((a) => a.slice(1).toLowerCase().includes(query))) return true;
    return false;
  });
}
