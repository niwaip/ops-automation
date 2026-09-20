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
 * 工作模式（企业协同）专属 Slash 指令注册表
 * 保留现有工作模式下的企业技能与工作空间探查能力
 */
export const WORK_SLASH_COMMANDS: SlashCommandDefinition[] = [
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
    aliases: [],
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
    description: '查看工作协同模式下的可用指令与能力说明',
    badge: '指令帮助',
    placeholderHint: '输入 /help 查看指令帮助',
    scope: 'all',
  },
];

/**
 * 个人模式（个人安全沙箱）独立 Slash 指令注册表
 * 独立工具链：追加 /ppt, /research 以及沙箱核心生产力技能
 */
export const PERSONAL_SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    command: '/ppt',
    aliases: ['/slides', '/deck'],
    title: '演示文稿与交互报告',
    description: '生成高品质商业汇报 PPT、幻灯片或自包含交互式 HTML 演示报告',
    skillId: 'guizang-ppt',
    badge: '沙箱生产力',
    placeholderHint: '输入主题或大纲，如 /ppt 2026年Q3业务增长复盘',
    scope: 'personal',
  },
  {
    command: '/research',
    aliases: ['/last30days', '/调研'],
    title: '深度多源技术调研',
    description: '全网多源（Web + GitHub + HackerNews）时效动态采集与真实口碑深度调研',
    skillId: 'research',
    badge: '沙箱调研',
    placeholderHint: '输入调研主题，如 /research Qwen 3.8 27B 最近30天动态与社区评价',
    scope: 'personal',
  },
  {
    command: '/excel',
    aliases: ['/xlsx', '/table', '/表格'],
    title: 'Excel 电子表格与数据计算',
    description: '创建专业 xlsx 表格、整理数据、编写动态公式并执行无头重算校验',
    skillId: 'xlsx',
    badge: '沙箱生产力',
    placeholderHint: '输入表格需求，如 /excel 制作销售提成核算表并加入计算公式',
    scope: 'personal',
  },
  {
    command: '/word',
    aliases: ['/docx', '/word文档'],
    title: 'Word 文档起草与合同审阅',
    description: '起草 docx 专业文档、审查合同合规风险、注入原生批注与修订留痕',
    skillId: 'docx',
    badge: '沙箱生产力',
    placeholderHint: '输入文档或合同需求，如 /word 审查保密协议并标注风险条款',
    scope: 'personal',
  },
  {
    command: '/pdf',
    aliases: ['/form'],
    title: 'PDF 报表与交互式表单',
    description: '生成排版精美 PDF 报表、填充并导出交互式 AcroForm 表单',
    skillId: 'pdf',
    badge: '沙箱生产力',
    placeholderHint: '输入 PDF 需求，如 /pdf 导出员工录用审批表单',
    scope: 'personal',
  },
  {
    command: '/image',
    aliases: ['/draw', '/生图'],
    title: 'AI 图像创作与海报设计',
    description: '对话式文生图、以图生图、设计海报插画与 Logo 资产',
    skillId: 'image-gen',
    badge: '沙箱生图',
    placeholderHint: '输入生图画面描述，如 /image 科技感赛博朋克风插画',
    scope: 'personal',
  },
  {
    command: '/design',
    aliases: ['/ui', '/prototype'],
    title: '前端页面与交互原型',
    description: '设计单页面 Web 原型、数据大屏看板或交互小游戏（自包含单文件）',
    skillId: 'frontend-design',
    badge: '沙箱原型',
    placeholderHint: '输入原型构想，如 /design 制作一个暗黑风数据监控大屏',
    scope: 'personal',
  },
  {
    command: '/search',
    aliases: ['/web'],
    title: '沙箱联网检索',
    description: '调用沙箱实时互联网搜索引擎获取最新公开资讯',
    skillId: 'sandbox.search',
    badge: '沙箱检索',
    placeholderHint: '输入检索内容，如 /search 最新 AI 大模型发布动向',
    scope: 'personal',
  },
  {
    command: '/clear',
    aliases: ['/new', '/reset', '/新会话'],
    title: '重置并开启新会话',
    description: '清空当前沙箱上下文并开启全新独立对话',
    badge: '会话管理',
    placeholderHint: '输入 /clear 开启全新沙箱会话',
    scope: 'personal',
  },
  {
    command: '/help',
    aliases: ['/?', '/帮助'],
    title: '沙箱指令帮助',
    description: '查看个人模式下所有可用的沙箱技能与工具说明',
    badge: '指令帮助',
    placeholderHint: '输入 /help 查看沙箱可用指令',
    scope: 'personal',
  },
];

/**
 * 完整指令集合（向下兼容）
 */
export const BUILTIN_SLASH_COMMANDS: SlashCommandDefinition[] = [
  ...WORK_SLASH_COMMANDS,
  ...PERSONAL_SLASH_COMMANDS,
];

/**
 * 工作模式专属的 Slash 命令匹配正则表达式（个人模式下输入将给予针对性引导）
 */
export const WORK_SLASH_COMMAND_REGEX =
  /^\s*\/(?:doc|workspace|rag|extract|email|t|task|任务)(?:\s+|$)/i;

/**
 * 个人模式专属的 Slash 命令匹配正则表达式（工作模式下输入将给予针对性引导）
 */
export const PERSONAL_SLASH_COMMAND_REGEX =
  /^\s*\/(?:ppt|slides|deck|research|last30days|调研|excel|xlsx|table|表格|word|docx|pdf|form|image|draw|生图|design|ui|prototype)(?:\s+|$)/i;

/**
 * 检测消息是否为工作模式专属的 Slash 指令
 */
export function isWorkSlashCommand(text: string): boolean {
  return WORK_SLASH_COMMAND_REGEX.test(text || '');
}

/**
 * 检测消息是否为个人沙箱模式专属的 Slash 指令
 */
export function isPersonalSlashCommand(text: string): boolean {
  return PERSONAL_SLASH_COMMAND_REGEX.test(text || '');
}

/**
 * 根据用户输入的命令前缀和当前模式匹配候选命令
 * 个人模式和工作模式彻底解耦，各自呈现独立工具链
 */
export function matchSlashCommands(
  input: string,
  mode: 'chat' | 'task' = 'task'
): SlashCommandDefinition[] {
  const clean = input.trim().toLowerCase();
  const isAll = !clean || clean === '/' || clean === '、';
  const query = clean.startsWith('/') || clean.startsWith('、') ? clean.slice(1) : clean;

  // 两个模式完全解耦：个人模式走个人沙箱工具链，工作模式走工作协同工具链
  const commandSource = mode === 'chat' ? PERSONAL_SLASH_COMMANDS : WORK_SLASH_COMMANDS;

  return commandSource.filter((cmd) => {
    if (isAll) return true;
    const mainCmd = cmd.command.slice(1).toLowerCase();
    if (mainCmd.includes(query)) return true;
    if (cmd.aliases?.some((a) => a.slice(1).toLowerCase().includes(query))) return true;
    if (cmd.title.toLowerCase().includes(query)) return true;
    // 仅当查询词为中文或较长词组时匹配长描述，避免短字母缩写（如 pp）误伤描述中的英文单词
    if (query.length >= 3 && !/^[a-z]{1,4}$/.test(query) && cmd.description.toLowerCase().includes(query)) {
      return true;
    }
    return false;
  });
}
