export interface RecognizedModelProfile {
  matchedKey?: string;
  display_name?: string;
  capability_tier?: 'standard' | 'advanced';
  supports_reasoning?: boolean;
  reasoning_effort?: 'low' | 'medium' | 'high';
  input?: string[];
  routing_tags?: string[];
  defaultScopes?: string[];
  prefer_for_code?: boolean;
  description?: string;
  highlights?: string[];
}

export const MODALITY_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  text: { label: '文本 (Text)', icon: '📝', color: 'blue' },
  image: { label: '视觉/图像 (Vision)', icon: '👁️', color: 'cyan' },
  audio: { label: '语音/音频 (Audio)', icon: '🎙️', color: 'orange' },
  document: { label: '长文档解析 (Doc)', icon: '📄', color: 'purple' },
  video: { label: '视频理解 (Video)', icon: '🎬', color: 'magenta' },
};

/**
 * 预置知名大模型知识库（支持关键词/精确匹配）
 */
const PRESET_MODEL_CATALOG: Array<{
  matcher: (norm: string) => boolean;
  profile: RecognizedModelProfile;
}> = [
  // --- DeepSeek 系列 ---
  {
    matcher: (n) => n.includes('deepseek-reasoner') || n.includes('deepseek-r1') || n.endsWith('/r1'),
    profile: {
      display_name: 'DeepSeek R1 (深度推理)',
      capability_tier: 'advanced',
      supports_reasoning: true,
      reasoning_effort: 'high',
      input: ['text'],
      routing_tags: ['chat', 'code'],
      defaultScopes: ['admin_chat', 'admin_task'],
      prefer_for_code: true,
      description: 'DeepSeek 开源顶级强化学习推理大模型，具备原生完整思维链，在数学、科学和复杂代码生成上表现卓越。',
      highlights: ['🧠 原生深度推理', '💻 卓越代码', '📐 数理推演'],
    },
  },
  {
    matcher: (n) => n.includes('deepseek-chat') || n.includes('deepseek-v3'),
    profile: {
      display_name: 'DeepSeek V3 (通用大模型)',
      capability_tier: 'standard',
      supports_reasoning: false,
      input: ['text'],
      routing_tags: ['chat', 'code'],
      defaultScopes: ['global', 'admin_chat'],
      prefer_for_code: true,
      description: 'DeepSeek 混合专家多任务语言大模型，兼顾超高响应吞吐与极高性价比，适合通用业务问答与日常代码编写。',
      highlights: ['⚡ 极高性价比', '💬 通用对话', '💻 编程辅助'],
    },
  },
  {
    matcher: (n) => n.includes('deepseek-coder'),
    profile: {
      display_name: 'DeepSeek Coder (代码专家)',
      capability_tier: 'advanced',
      supports_reasoning: false,
      input: ['text'],
      routing_tags: ['code', 'chat'],
      defaultScopes: ['admin_task'],
      prefer_for_code: true,
      description: '专注于代码理解、补全、单测生成与复杂漏洞审查的代码专精大模型。',
      highlights: ['💻 代码专精', '🔍 语法树理解', '🛠️ 工程重构'],
    },
  },

  // --- OpenAI 系列 ---
  {
    matcher: (n) => n.includes('o3-mini'),
    profile: {
      display_name: 'OpenAI o3-mini (深度推理)',
      capability_tier: 'advanced',
      supports_reasoning: true,
      reasoning_effort: 'high',
      input: ['text'],
      routing_tags: ['chat', 'code'],
      defaultScopes: ['admin_chat', 'admin_task'],
      prefer_for_code: true,
      description: 'OpenAI 新一代高阶原生推理轻量模型，专为极致数理证明、科学推导与极限代码生成打造。',
      highlights: ['🧠 原生深度推理', '💻 极强代码能力', '⚡ 低延迟响应'],
    },
  },
  {
    matcher: (n) => n === 'o1' || n.includes('o1-2024') || n.includes('o1-preview'),
    profile: {
      display_name: 'OpenAI o1 (旗舰深度推理)',
      capability_tier: 'advanced',
      supports_reasoning: true,
      reasoning_effort: 'high',
      input: ['text', 'image'],
      routing_tags: ['chat', 'code', 'multimodal'],
      defaultScopes: ['admin_chat', 'admin_task'],
      prefer_for_code: true,
      description: 'OpenAI 旗舰强化学习慢思考大模型，多模态长思维链，在复杂多步骤规划决策与前沿探索任务上首屈一指。',
      highlights: ['🧠 顶级推理规划', '👁️ 视觉思维链', '🏆 旗舰层级'],
    },
  },
  {
    matcher: (n) => n.includes('o1-mini'),
    profile: {
      display_name: 'OpenAI o1-mini (推理小钢炮)',
      capability_tier: 'standard',
      supports_reasoning: true,
      reasoning_effort: 'medium',
      input: ['text'],
      routing_tags: ['chat', 'code'],
      defaultScopes: ['admin_chat'],
      prefer_for_code: true,
      description: 'OpenAI 高速轻量原生推理模型，适合代码单测、错误诊断及中等难度数学推导。',
      highlights: ['🧠 原生思考', '⚡ 高速生成', '💰 经济实惠'],
    },
  },
  {
    matcher: (n) => n.includes('gpt-4o-mini'),
    profile: {
      display_name: 'GPT-4o Mini (轻量多模态)',
      capability_tier: 'standard',
      supports_reasoning: false,
      input: ['text', 'image'],
      routing_tags: ['chat', 'multimodal'],
      defaultScopes: ['global', 'ocr'],
      description: 'OpenAI 官方主推高性价比全能轻量多模态模型，支持图片理解、日常对话与文档摘要。',
      highlights: ['👁️ 视觉支持', '💰 超高性价比', '🌐 通用默认推荐'],
    },
  },
  {
    matcher: (n) => n.includes('gpt-4o') || n.includes('chatgpt-4o'),
    profile: {
      display_name: 'GPT-4o (全模态旗舰)',
      capability_tier: 'advanced',
      supports_reasoning: false,
      input: ['text', 'image', 'audio'],
      routing_tags: ['chat', 'multimodal', 'code'],
      defaultScopes: ['admin_chat', 'ocr'],
      prefer_for_code: true,
      description: 'OpenAI 全模态旗舰模型，原生融合高分辨率视觉、语音交互与强大多语言理解。',
      highlights: ['👁️ 全多模态', '⚡ 极速响应', '🏆 旗舰综合性能'],
    },
  },
  {
    matcher: (n) => n.includes('dall-e-3'),
    profile: {
      display_name: 'DALL-E 3 (文生图)',
      capability_tier: 'standard',
      supports_reasoning: false,
      input: ['text'],
      routing_tags: ['image_generation'],
      defaultScopes: ['image_generation'],
      description: 'OpenAI 顶级文本生成高清图像大模型，精细还原复杂 Prompt 构图细节与意境。',
      highlights: ['🎨 创意文生图', '🖼️ 高清视觉细节'],
    },
  },
  {
    matcher: (n) => n.includes('whisper'),
    profile: {
      display_name: 'Whisper (语音转录)',
      capability_tier: 'standard',
      supports_reasoning: false,
      input: ['audio'],
      routing_tags: ['audio_transcription'],
      defaultScopes: ['audio_transcription'],
      description: 'OpenAI 多语言语音识别与时间戳转录模型，准确识别音频并转化为文本。',
      highlights: ['🎙️ 语音识别', '🌍 多语言高精度'],
    },
  },

  // --- Anthropic Claude 系列 ---
  {
    matcher: (n) => n.includes('claude-3-7-sonnet'),
    profile: {
      display_name: 'Claude 3.7 Sonnet (混合思考旗舰)',
      capability_tier: 'advanced',
      supports_reasoning: true,
      reasoning_effort: 'high',
      input: ['text', 'image', 'document'],
      routing_tags: ['chat', 'code', 'multimodal', 'document'],
      defaultScopes: ['admin_chat', 'admin_task', 'ocr'],
      prefer_for_code: true,
      description: 'Anthropic 业界领先混合推理模型，兼具超强编码生成、复杂长文档分析与可控原生思维链。',
      highlights: ['🧠 自适应混合思考', '💻 行业顶尖代码', '👁️ 视觉与长文档'],
    },
  },
  {
    matcher: (n) => n.includes('claude-3-5-sonnet'),
    profile: {
      display_name: 'Claude 3.5 Sonnet (代码视觉旗舰)',
      capability_tier: 'advanced',
      supports_reasoning: false,
      input: ['text', 'image', 'document'],
      routing_tags: ['chat', 'code', 'multimodal', 'document'],
      defaultScopes: ['admin_chat', 'admin_task', 'ocr'],
      prefer_for_code: true,
      description: 'Anthropic 标杆大模型，代码编写、上下文推理和精细图表图像解析能力卓越。',
      highlights: ['💻 代码王牌', '👁️ 图表/图像理解', '📄 长文本解析'],
    },
  },
  {
    matcher: (n) => n.includes('claude-3-5-haiku'),
    profile: {
      display_name: 'Claude 3.5 Haiku (轻快多模态)',
      capability_tier: 'standard',
      supports_reasoning: false,
      input: ['text', 'image'],
      routing_tags: ['chat', 'multimodal'],
      defaultScopes: ['global'],
      description: '超快响应与低延迟执行，适用于代码补全、快速总结与轻量自动化工作流。',
      highlights: ['⚡ 极低延迟', '👁️ 视觉理解', '🌐 适合默认日常'],
    },
  },

  // --- Google Gemini 系列 ---
  {
    matcher: (n) => n.includes('gemini-2.5-pro'),
    profile: {
      display_name: 'Gemini 2.5 Pro (深度推理旗舰)',
      capability_tier: 'advanced',
      supports_reasoning: true,
      reasoning_effort: 'high',
      input: ['text', 'image', 'audio', 'video', 'document'],
      routing_tags: ['chat', 'multimodal', 'code', 'document'],
      defaultScopes: ['admin_chat', 'admin_task', 'ocr'],
      prefer_for_code: true,
      description: 'Google 新一代旗舰模型，原生思考推理与全模态多任务架构，支持百万级超长上下文与深层逻辑推演。',
      highlights: ['🧠 原生思考推理', '🌐 全模态原生支持', '📚 百万级上下文'],
    },
  },
  {
    matcher: (n) => n.includes('gemini-2.5-flash'),
    profile: {
      display_name: 'Gemini 2.5 Flash (极速思考与多模态)',
      capability_tier: 'standard',
      supports_reasoning: true,
      reasoning_effort: 'medium',
      input: ['text', 'image', 'audio', 'video', 'document'],
      routing_tags: ['chat', 'multimodal', 'code'],
      defaultScopes: ['global', 'ocr'],
      description: 'Google 超高速多模态思考模型，平衡高吞吐与思维链推理深度，具备极高性价比。',
      highlights: ['🧠 自适应思考', '👁️ 原生多模态', '⚡ 极速低成本'],
    },
  },
  {
    matcher: (n) => n.includes('gemini-2.0-flash-thinking'),
    profile: {
      display_name: 'Gemini 2.0 Flash Thinking (思考版)',
      capability_tier: 'advanced',
      supports_reasoning: true,
      reasoning_effort: 'high',
      input: ['text', 'image'],
      routing_tags: ['chat', 'code', 'multimodal'],
      defaultScopes: ['admin_chat'],
      prefer_for_code: true,
      description: '具备显式思维链生成的 Gemini 实验性思考模型，强化复杂数学与算法推理。',
      highlights: ['🧠 显式思维链', '📐 数学与逻辑'],
    },
  },
  {
    matcher: (n) => n.includes('gemini-2.0-flash'),
    profile: {
      display_name: 'Gemini 2.0 Flash (新一代多模态)',
      capability_tier: 'standard',
      supports_reasoning: false,
      input: ['text', 'image', 'audio', 'video'],
      routing_tags: ['chat', 'multimodal', 'code'],
      defaultScopes: ['global', 'ocr'],
      description: 'Google 实时多模态交互模型，支持图文语音流式输入与高质量快速生成。',
      highlights: ['👁️ 全多模态', '⚡ 实时高吞吐'],
    },
  },
  {
    matcher: (n) => n.includes('gemini-1.5-pro'),
    profile: {
      display_name: 'Gemini 1.5 Pro (超长上下文)',
      capability_tier: 'advanced',
      supports_reasoning: false,
      input: ['text', 'image', 'audio', 'video', 'document'],
      routing_tags: ['chat', 'multimodal', 'document'],
      defaultScopes: ['admin_chat', 'ocr'],
      description: '突破性 200 万 token 超长上下文，支持全仓代码库与长视频整体解析。',
      highlights: ['📚 200万上下文', '👁️ 音视频图文'],
    },
  },
  {
    matcher: (n) => n.includes('imagen-3'),
    profile: {
      display_name: 'Google Imagen 3 (文生图)',
      capability_tier: 'standard',
      supports_reasoning: false,
      input: ['text'],
      routing_tags: ['image_generation'],
      defaultScopes: ['image_generation'],
      description: 'Google 顶尖图像生成模型，具备生动的光影质感与准确的文字呈现。',
      highlights: ['🎨 逼真光影生图', '🖼️ 高清视觉细节'],
    },
  },

  // --- 阿里百炼 / 通义千问 系列 ---
  {
    matcher: (n) => n.includes('qwq') || n.includes('qwen-qwq'),
    profile: {
      display_name: 'Qwen QwQ 32B (深度推理)',
      capability_tier: 'advanced',
      supports_reasoning: true,
      reasoning_effort: 'high',
      input: ['text'],
      routing_tags: ['chat', 'code'],
      defaultScopes: ['admin_chat', 'admin_task'],
      prefer_for_code: true,
      description: '通义千问强化学习推理大模型，对标 DeepSeek R1 与 o1，具备极强数理推演与算法解题能力。',
      highlights: ['🧠 原生深度推理', '📐 数理推演', '💻 算法分析'],
    },
  },
  {
    matcher: (n) => n.includes('qwen-max'),
    profile: {
      display_name: '通义千问 Max (旗舰版)',
      capability_tier: 'advanced',
      supports_reasoning: false,
      input: ['text'],
      routing_tags: ['chat', 'code'],
      defaultScopes: ['admin_chat'],
      description: '通义千问千亿参数商业旗舰模型，各项能力指标位于国内商业模型第一梯队。',
      highlights: ['🏆 旗舰大模型', '💬 复杂语义理解'],
    },
  },
  {
    matcher: (n) => n.includes('qwen-coder') || n.includes('qwen2.5-coder'),
    profile: {
      display_name: '通义千问 Coder (代码专家)',
      capability_tier: 'advanced',
      supports_reasoning: false,
      input: ['text'],
      routing_tags: ['code', 'chat'],
      defaultScopes: ['admin_task'],
      prefer_for_code: true,
      description: '专门优化的开源顶级代码大模型，对长上下文仓库解析与代码重构表现优异。',
      highlights: ['💻 代码王牌', '🔧 架构重构', '🏆 开源登顶'],
    },
  },
  {
    matcher: (n) => n.includes('qwen-vl') || n.includes('qwen2.5-vl'),
    profile: {
      display_name: '通义千问 VL (多模态视觉)',
      capability_tier: 'advanced',
      supports_reasoning: false,
      input: ['text', 'image', 'video'],
      routing_tags: ['multimodal', 'chat'],
      defaultScopes: ['ocr'],
      description: '通义千问新一代视觉语言模型，精细理解图像、表格、OCR 图文及短视频。',
      highlights: ['👁️ 细粒度OCR', '📊 表格图表识别'],
    },
  },
  {
    matcher: (n) => n.includes('qwen-plus'),
    profile: {
      display_name: '通义千问 Plus (通用均衡)',
      capability_tier: 'standard',
      supports_reasoning: false,
      input: ['text'],
      routing_tags: ['chat'],
      defaultScopes: ['global'],
      description: '综合能力出色的高性价比通用大模型，适合常规业务对话与文档摘要。',
      highlights: ['🌐 通用推荐', '💰 平衡性价比'],
    },
  },
  {
    matcher: (n) => n.includes('wanx'),
    profile: {
      display_name: '通义万相 (生图)',
      capability_tier: 'standard',
      supports_reasoning: false,
      input: ['text'],
      routing_tags: ['image_generation'],
      defaultScopes: ['image_generation'],
      description: '阿里云官方文生图与图像设计生成模型。',
      highlights: ['🎨 中文文生图', '🖼️ 商业设计'],
    },
  },

  // --- 智谱 GLM / BigModel ---
  {
    matcher: (n) => n.includes('glm-4-plus'),
    profile: {
      display_name: 'GLM-4 Plus (智谱旗舰)',
      capability_tier: 'advanced',
      supports_reasoning: false,
      input: ['text'],
      routing_tags: ['chat', 'code'],
      defaultScopes: ['admin_chat'],
      description: '智谱 AI 旗舰大语言模型，长文本处理、智能体编排与逻辑推理全面升级。',
      highlights: ['🏆 智谱旗舰', '🤖 Agent编排'],
    },
  },
  {
    matcher: (n) => n.includes('glm-4v'),
    profile: {
      display_name: 'GLM-4V (多模态视觉)',
      capability_tier: 'standard',
      supports_reasoning: false,
      input: ['text', 'image'],
      routing_tags: ['multimodal', 'chat'],
      defaultScopes: ['ocr'],
      description: '智谱多模态大模型，具备高精度图像理解与图表分析能力。',
      highlights: ['👁️ 多模态视觉', '📊 图表解析'],
    },
  },
  {
    matcher: (n) => n.includes('cogview'),
    profile: {
      display_name: 'CogView (智谱文生图)',
      capability_tier: 'standard',
      supports_reasoning: false,
      input: ['text'],
      routing_tags: ['image_generation'],
      defaultScopes: ['image_generation'],
      description: '智谱 AI 图像生成大模型，支持精准的中文 Prompt 理解与构图渲染。',
      highlights: ['🎨 中文图像生成'],
    },
  },

  // --- 开源开源生态 / 通用生图 (Flux / SD) ---
  {
    matcher: (n) => n.includes('flux') || n.includes('stable-diffusion') || n.includes('sdxl'),
    profile: {
      display_name: 'FLUX / SD (图像生成)',
      capability_tier: 'standard',
      supports_reasoning: false,
      input: ['text'],
      routing_tags: ['image_generation'],
      defaultScopes: ['image_generation'],
      description: '高质量开源文生图模型，支持细腻材质与逼真光影生成。',
      highlights: ['🎨 开源画质标杆'],
    },
  },
];

/**
 * 智能启发式规则匹配引擎（对未收录或新命名的模型进行特征探测）
 */
export function recognizeModelProfile(
  rawName: string,
  _providerKey?: string
): RecognizedModelProfile {
  if (!rawName || !rawName.trim()) {
    return {
      display_name: '',
      capability_tier: 'standard',
      supports_reasoning: false,
      reasoning_effort: 'medium',
      input: ['text'],
      routing_tags: ['chat'],
      defaultScopes: [],
      prefer_for_code: false,
      highlights: [],
    };
  }

  const norm = rawName.trim().toLowerCase();

  // 1. 优先查阅预置目录
  for (const item of PRESET_MODEL_CATALOG) {
    if (item.matcher(norm)) {
      return {
        matchedKey: rawName,
        ...item.profile,
      };
    }
  }

  // 2. 启发式特征提取
  const highlights: string[] = [];
  const routing_tags: string[] = ['chat'];
  const input: string[] = ['text'];
  const defaultScopes: string[] = [];

  // 判断是否为推理/思维链模型
  const isReasoning = /(?:reasoner|reasoning|thinking|\br1\b|\bo1\b|\bo3\b|qwq)/i.test(norm);
  if (isReasoning) {
    highlights.push('🧠 原生深度推理');
    routing_tags.push('code');
  }

  // 判断是否为多模态 / 视觉模型
  const isVision = /(?:vl|vision|omni|image|ocr|visual|4o|gemini)/i.test(norm);
  if (isVision) {
    input.push('image');
    routing_tags.push('multimodal');
    highlights.push('👁️ 多模态视觉');
    if (!defaultScopes.includes('ocr')) defaultScopes.push('ocr');
  }

  // 判断是否为语音识别模型
  const isAudio = /(?:audio|whisper|voice|speech|asr|sound)/i.test(norm);
  if (isAudio) {
    if (!input.includes('audio')) input.push('audio');
    routing_tags.push('audio_transcription');
    defaultScopes.push('audio_transcription');
    highlights.push('🎙️ 语音处理');
  }

  // 判断是否为生图模型
  const isImageGen = /(?:dall-e|imagen|wanx|cogview|flux|midjourney|sd|stable-diffusion)/i.test(norm);
  if (isImageGen) {
    routing_tags.push('image_generation');
    defaultScopes.push('image_generation');
    highlights.push('🎨 图像生成');
  }

  // 判断是否代码模型
  const isCode = /(?:coder|coding|starcoder|codellama)/i.test(norm);
  if (isCode) {
    if (!routing_tags.includes('code')) routing_tags.push('code');
    highlights.push('💻 代码专精');
    if (!defaultScopes.includes('admin_task')) defaultScopes.push('admin_task');
  }

  // 能力层级评估 (大型/深度模型归为 advanced)
  const isAdvanced =
    isReasoning ||
    /(?:large|max|pro|plus|ultra|opus|70b|72b|405b|236b)/i.test(norm);
  if (isAdvanced) {
    highlights.push('🏆 高级深度层级');
  }

  // 格式化别名
  const cleanDisplayName = rawName
    .split('/')
    .pop()!
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    matchedKey: rawName,
    display_name: cleanDisplayName,
    capability_tier: isAdvanced ? 'advanced' : 'standard',
    supports_reasoning: isReasoning,
    reasoning_effort: isReasoning ? 'high' : 'medium',
    input: Array.from(new Set(input)),
    routing_tags: Array.from(new Set(routing_tags)),
    defaultScopes: Array.from(new Set(defaultScopes)),
    prefer_for_code: isCode || isReasoning,
    description: `自动识别适配：${rawName}，具备 ${highlights.join('、') || '标准语言处理'} 能力。`,
    highlights,
  };
}
