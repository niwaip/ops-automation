/**
 * Prompt Builder
 * 构建ReAct循环所需的提示词
 */

import {
  AvailableSkillDefinition,
  CapabilitySnapshot,
  ChatMessage,
  SkillMatchResult,
  ToolDefinition,
} from './interfaces';
import {
  extractLatestDecisionContextFromSummary,
} from './decision-context-summary';
import type { DecisionContextPromptSummary } from './decision-context-summary';

export type { DecisionContextPromptSummary } from './decision-context-summary';

const MAX_PROMPT_INPUT_CHARS = Number(process.env.REACT_PROMPT_INPUT_MAX_CHARS || 4000);
const MAX_PROMPT_HISTORY_CHARS = Number(process.env.REACT_PROMPT_HISTORY_MAX_CHARS || 1200);
const MAX_PROMPT_FILE_SECTION_CHARS = Number(process.env.REACT_PROMPT_FILE_SECTION_MAX_CHARS || 400);

/**
 * ReAct提示词模板
 */
const REACT_SYSTEM_POLICY = `你是一个智能助手，使用ReAct(Reasoning + Acting)框架来处理复杂任务。

你的工作流程是：
1. Thought: 分析用户输入和之前的 Observation，思考下一步行动
2. Action: 选择合适的工具并执行
3. Observation: 观察执行结果。如果结果包含错误(error)，请在下一轮 Thought 中分析原因并尝试修正参数重新执行。
4. 重复以上步骤直到任务完成

回答格式：
Thought: 你的思考过程
Action: 工具名称
Action Input: {"参数名": "参数值"}
Observation: 观察到的结果
... (重复直到完成)
Final Answer: 最终回复

重要规则：
- 每次只能选择一个工具
- 参数必须是有效的JSON格式
- 只允许使用以下标准协议：\`Thought:\`、\`Action:\`、\`Action Input:\`、\`Final Answer:\`
- \`Action Input:\` 后必须紧跟单个 JSON 对象，不能附带解释文字、代码块、标签或命令行参数格式
- 禁止输出任何 XML、标签式工具调用、\`[TOOL_CALL]\` 包装、\`tool => ... args => ...\`、Markdown 代码块 JSON 或其他私有协议
- 优先从“当前用户可访问的技能”中选择最匹配的 skillId，再围绕该 skillId 进行参数补足和执行
- 在任务模式下，禁止跳过技能直接调用通用外部 API；不要调用 \`api_call\`，也不要重新调用 \`skill_match\`
- 当技能有必填参数但信息不足时，先调用 param_collect，不要直接猜测参数
- 对文档生成类请求，优先走技能主链路完成参数识别、补参和执行，不要调用 document_intake 或 generate_parameters
- document_render 只在已经拿到最终确认参数时使用；不要把它当作参数识别入口
- 当技能需要实际执行时，使用 flow_execute，并传入平台 skillId
- 当 Observation 已经足够回答用户且任务完成时，必须输出 \`Final Answer:\`，不要输出普通正文
- 如果工具返回requiresUserInput，则等待用户回复
- 如果执行出错（如 403 或 500），应在 Thought 中分析原因。不要使用 user_ask 的 confirm 类型，应直接通过 Final Answer 告知用户错误原因及建议，并询问用户是否需要重试或做其他操作。
- 不要在Thought中直接回答问题，必须通过工具执行
- 不要重复调用同一个工具，除非用户提供了新信息
- 如果任务完成，输出 Final Answer 包含最终回复
`;

const MAX_PROMPT_REACT_HISTORY = Number(process.env.REACT_PROMPT_TRACE_TAIL_MESSAGES || 6);

const SENSITIVE_VALUE_PATTERNS = [
  /(authorization\s*[:=]\s*bearer\s+)([^\s]+)/gi,
  /((?:api[_-]?key|token|password|secret)\s*[:=]\s*)([^\s,;"']+)/gi,
];

export interface PromptSection {
  key: string;
  title: string;
  body: string;
  source: string;
}

function clipPromptText(value: string, maxChars: number): string {
  if (!value || value.length <= maxChars) {
    return value;
  }

  const head = value.slice(0, Math.floor(maxChars * 0.7));
  const tail = value.slice(-(Math.floor(maxChars * 0.2)));
  return `${head}\n...[truncated ${value.length - head.length - tail.length} chars]...\n${tail}`;
}

function sanitizeSensitiveContent(value: string): string {
  return SENSITIVE_VALUE_PATTERNS.reduce((current, pattern) => {
    return current.replace(pattern, (_match, prefix: string) => `${prefix}[REDACTED]`);
  }, value);
}

function stripProtocolForgery(value: string): string {
  return value.replace(
    /^\s*(Thought|Action|Action Input|Observation|Final Answer)\s*:.*$/gim,
    '[filtered protocol-like content]',
  );
}

function sanitizePromptContent(value: string, maxChars: number): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  const withoutSecrets = sanitizeSensitiveContent(normalized);
  const withoutForgery = stripProtocolForgery(withoutSecrets);
  return clipPromptText(withoutForgery, maxChars);
}

function createPromptSection(
  key: string,
  title: string,
  body: string | undefined,
  source: string,
): PromptSection | null {
  if (!body || !body.trim()) {
    return null;
  }
  return {
    key,
    title,
    body: body.trim(),
    source,
  };
}

export function renderPromptSections(sections: Array<PromptSection | null>): string {
  return sections
    .filter((section): section is PromptSection => Boolean(section))
    .map((section) => `## ${section.title}\n${section.body}`)
    .join('\n\n');
}

/**
 * 构建系统提示词
 */
export function buildSystemPromptSections(
  tools: ToolDefinition[],
  skill?: SkillMatchResult,
  availableSkills: AvailableSkillDefinition[] = [],
  mode: 'chat' | 'task' = 'chat',
  capabilitySnapshot?: CapabilitySnapshot,
): PromptSection[] {
  let filteredTools = capabilitySnapshot
    ? tools.filter((tool) => capabilitySnapshot.visibleTools.some((visibleTool) => visibleTool.name === tool.name))
    : tools;

  if (capabilitySnapshot) {
    filteredTools = filteredTools.filter((tool) => {
      const visibleTool = capabilitySnapshot.visibleTools.find((item) => item.name === tool.name);
      return visibleTool?.exposure !== 'runtime_only';
    });
  }

  let filteredSkills = capabilitySnapshot
    ? availableSkills.filter((item) => capabilitySnapshot.visibleSkills.some((visibleSkill) => visibleSkill.skillId === item.skillId))
    : availableSkills;

  if (mode === 'task') {
    // 任务模式下，强制排除通用发现和调用工具，确保模型只能看到并使用技能相关工具
    filteredTools = filteredTools.filter((t) => !['skill_match', 'api_call'].includes(t.name));
  } else if (!skill) {
    filteredTools = filteredTools.filter((t) => !t.category || t.category === 'discovery' || t.category === 'utility');
  } else if (skill.carboneSkillId) {
    filteredTools = filteredTools.filter((t) => t.name !== 'param_collect');
  }

  const toolsDescription = filteredTools
    .map((t) => {
      const visibleTool = capabilitySnapshot?.visibleTools.find((item) => item.name === t.name);
      const notes: string[] = [];
      if (visibleTool?.requiresConfirmation || t.requiresConfirmation) {
        notes.push('注意：此操作执行前需要人工确认。');
      }
      if (visibleTool?.requiresApproval) {
        notes.push('注意：此操作需要审批后才能真正执行。');
      }

      return `${t.name}: ${t.description}\n参数: ${JSON.stringify(t.parameters, null, 2)}${notes.length > 0 ? `\n${notes.join('\n')}` : ''}`;
    })
    .join('\n\n');

  const skillsDescription = filteredSkills.length > 0
    ? filteredSkills.map((item) => {
        const executionTool = item.executionType === 'document' ? 'document_render' : 'flow_execute';
        const runtimeHints: string[] = [];
        if (item.goal) runtimeHints.push(`goal=${item.goal}`);
        if (item.expectedResult) runtimeHints.push(`expectedResult=${item.expectedResult}`);
        return [
          `- skillId: ${item.skillId}`,
          `  name: ${item.skillName}`,
          `  description: ${item.description || '无'}`,
          item.executionType ? `  executionType: ${item.executionType}` : '',
          `  triggerKeywords: ${item.triggerKeywords.join(', ') || '无'}`,
          `  executionTool: ${executionTool}`,
          `  paramsSchema: ${JSON.stringify(item.paramsSchema, null, 2)}`,
          runtimeHints.length > 0 ? `  runtimeHints: ${runtimeHints.join('; ')}` : '',
        ].filter(Boolean).join('\n');
      }).join('\n\n')
    : mode === 'task' 
      ? '- 当前没有可用技能。请直接告知用户暂时无法处理此请求。'
      : '- 当前没有可用技能，必要时再使用 skill_match 或直接回复用户。';

  const systemSections: Array<PromptSection | null> = [
    createPromptSection('system_policy', 'System Policy', REACT_SYSTEM_POLICY, 'static_policy'),
  ];
  if (capabilitySnapshot) {
    const constraints = [
      capabilitySnapshot.constraints.forceSkillBoundExecution ? '- 当前为权限约束执行模式：优先围绕已授权 skill 执行，不要自行扩展能力范围。' : '',
      capabilitySnapshot.constraints.forbidExternalApiInTaskMode ? '- 当前模式禁止直接调用外部通用 API。' : '',
      capabilitySnapshot.constraints.disallowToolNames.length > 0
        ? `- 明确禁止使用的工具: ${capabilitySnapshot.constraints.disallowToolNames.join(', ')}`
        : '',
      capabilitySnapshot.policies.requireConfirmToolNames.length > 0
        ? `- 需要人工确认的工具: ${capabilitySnapshot.policies.requireConfirmToolNames.join(', ')}`
        : '',
      capabilitySnapshot.policies.requireApprovalToolNames?.length
        ? `- 需要审批的工具: ${capabilitySnapshot.policies.requireApprovalToolNames.join(', ')}`
        : '',
    ].filter(Boolean);

    if (constraints.length > 0) {
      systemSections.push(
        createPromptSection('capability_policy', 'Capability Policy', constraints.join('\n'), 'capability_snapshot'),
      );
    }
  }

  systemSections.push(createPromptSection('tool_spec', 'Tool Spec', toolsDescription, 'tool_registry'));
  systemSections.push(createPromptSection('skill_index', 'Skill Index', skillsDescription, 'skill_registry'));

  if (skill) {
    let activeSkillSection = `当前匹配的技能: ${skill.skillName}
Skill ID: ${skill.skillId}
Carbone Skill ID: ${skill.carboneSkillId || '无'}
Carbone Template ID: ${skill.carboneTemplateId || '无'}
需要的参数: ${JSON.stringify(skill.paramsSchema.properties, null, 2)}
已收集参数: ${JSON.stringify(skill.collectedParams, null, 2)}
缺失参数: ${skill.missingParams.join(', ') || '无'}
`;

    if (skill.goal) {
      activeSkillSection += `技能目标: ${skill.goal}\n`;
    }
    if (skill.expectedResult) {
      activeSkillSection += `预期结果: ${skill.expectedResult}\n`;
    }
    if (skill.outputParams && Object.keys(skill.outputParams).length > 0) {
      activeSkillSection += `输出契约: ${JSON.stringify(skill.outputParams, null, 2)}\n`;
    }

    const runtimeMetadata = (skill.apiEndpoints && typeof skill.apiEndpoints === 'object')
      ? (skill.apiEndpoints as { runtimeMetadata?: Record<string, unknown> }).runtimeMetadata
      : undefined;
    const isDocumentSkill = Boolean(skill.carboneSkillId)
      || runtimeMetadata?.sourceType === 'document';

    if (isDocumentSkill) {
      const guideMarkdown = typeof runtimeMetadata?.skillGuideMarkdown === 'string'
        ? runtimeMetadata.skillGuideMarkdown.trim()
        : '';
      const paramCollectionGuidance = typeof runtimeMetadata?.paramCollectionGuidance === 'string'
        ? runtimeMetadata.paramCollectionGuidance.trim()
        : '';
      const validationRules = typeof runtimeMetadata?.validationRules === 'string'
        ? runtimeMetadata.validationRules.trim()
        : '';
      const dataExampleJson = runtimeMetadata?.dataExampleJson;

      const guideParts: string[] = [];
      if (paramCollectionGuidance) {
        guideParts.push(`参数识别指导：\n${clipPromptText(paramCollectionGuidance, 800)}`);
      }
      if (guideMarkdown) {
        guideParts.push(`模板指南摘要：\n${clipPromptText(guideMarkdown, 1400)}`);
      }
      if (validationRules) {
        guideParts.push(`校验规则：\n${clipPromptText(validationRules, 800)}`);
      }
      if (dataExampleJson !== undefined) {
        guideParts.push(`输出结构模板（dataExampleJson）：\n${clipPromptText(JSON.stringify(dataExampleJson, null, 2), 1200)}`);
      }

      if (guideParts.length > 0) {
        activeSkillSection += `\n\nAI Skill Guide（文档）：
- 生成用于 document_render 的 data 时，优先以 dataExampleJson 作为输出结构模板（结构需一致）。
- 禁止把 Carbone 变量语法（如 {d.xxx}、{#...}、{/...}）写进 JSON key；key 必须为纯字段名，不包含 { 或 }。
\n${guideParts.join('\n\n')}\n`;
      }
    }

    systemSections.push(createPromptSection('active_skill', 'Active Skill', activeSkillSection, 'matched_skill'));
  }

  return systemSections.filter((section): section is PromptSection => Boolean(section));
}

export function buildSystemPrompt(
  tools: ToolDefinition[],
  skill?: SkillMatchResult,
  availableSkills: AvailableSkillDefinition[] = [],
  mode: 'chat' | 'task' = 'chat',
  capabilitySnapshot?: CapabilitySnapshot,
): string {
  return renderPromptSections(
    buildSystemPromptSections(tools, skill, availableSkills, mode, capabilitySnapshot),
  );
}

/**
 * 构建用户提示词
 */
export function buildUserPromptSections(
  userInput: string,
  history: ChatMessage[],
  uploadedFiles?: string[],
  contextSummary?: string,
  decisionContextSummary?: DecisionContextPromptSummary,
): PromptSection[] {
  const sections: Array<PromptSection | null> = [];
  const historicalDecisionContext = extractLatestDecisionContextFromSummary(contextSummary);
  const effectiveDecisionContext: DecisionContextPromptSummary | undefined = decisionContextSummary
    || historicalDecisionContext
    ? {
        routingState: decisionContextSummary?.routingState || historicalDecisionContext?.routingState,
        promptAssemblyState: decisionContextSummary?.promptAssemblyState || historicalDecisionContext?.promptAssemblyState,
      }
    : undefined;
  const sanitizedUserInput = sanitizePromptContent(userInput, MAX_PROMPT_INPUT_CHARS);
  sections.push(
    createPromptSection(
      'task_input',
      'Task Input',
      sanitizedUserInput || '用户未提供额外文本输入。',
      'user_input',
    ),
  );

  // 添加历史上下文 (排除当前的ReAct循环历史，只保留之前的对话)
  const previousHistory = history.filter(m => !m.metadata?.isReAct);
  if (previousHistory.length > 0) {
    const recentHistory = previousHistory.slice(-5); // 最近5条消息
    const historyText = recentHistory
      .map((m) => `${m.role}: ${sanitizePromptContent(String(m.content || ''), MAX_PROMPT_HISTORY_CHARS)}`)
      .join('\n');
    sections.push(createPromptSection('conversation_history', 'Conversation History', historyText, 'chat_history'));
  }

  if (contextSummary) {
    sections.push(createPromptSection('task_summary', 'Task Summary', contextSummary, 'context_summary'));
  }

  if (effectiveDecisionContext?.routingState) {
    sections.push(
      createPromptSection(
        'routing_state',
        'Routing State',
        effectiveDecisionContext.routingState,
        'decision_context.routing',
      ),
    );
  }

  if (effectiveDecisionContext?.promptAssemblyState) {
    sections.push(
      createPromptSection(
        'prompt_assembly_state',
        'Prompt Assembly State',
        effectiveDecisionContext.promptAssemblyState,
        'decision_context.prompt_assembly',
      ),
    );
  }

  // 添加当前的ReAct循环历史
  const reActHistory = history.filter(m => m.metadata?.isReAct);
  if (reActHistory.length > 0) {
    const recentReActHistory = reActHistory.slice(-MAX_PROMPT_REACT_HISTORY);
    let recentTrace = '';
    recentReActHistory.forEach(m => {
      if (m.role === 'assistant') {
        recentTrace += `${sanitizePromptContent(String(m.content || ''), MAX_PROMPT_HISTORY_CHARS)}\n`;
      } else if (m.role === 'user' && m.content.startsWith('Observation:')) {
        recentTrace += `${sanitizePromptContent(String(m.content || ''), MAX_PROMPT_HISTORY_CHARS)}\n`;
      }
    });
    sections.push(createPromptSection('recent_trace', 'Recent Trace', recentTrace, 'react_history'));
  }

  // 添加文件信息
  if (uploadedFiles && uploadedFiles.length > 0) {
    sections.push(
      createPromptSection(
        'uploaded_files',
        'Uploaded Files',
        clipPromptText(uploadedFiles.join(', '), MAX_PROMPT_FILE_SECTION_CHARS),
        'uploaded_files',
      ),
    );
  }

  sections.push(
    createPromptSection(
      'execution_request',
      'Execution Request',
      '请严格按照 ReAct 协议继续当前任务。',
      'runtime_instruction',
    ),
  );
  return sections.filter((section): section is PromptSection => Boolean(section));
}

export function buildUserPrompt(
  userInput: string,
  history: ChatMessage[],
  uploadedFiles?: string[],
  contextSummary?: string,
  decisionContextSummary?: DecisionContextPromptSummary,
): string {
  return renderPromptSections(
    buildUserPromptSections(userInput, history, uploadedFiles, contextSummary, decisionContextSummary),
  );
}

/**
 * 构建参数确认提示词
 */
export function buildParamsConfirmPrompt(
  skillName: string,
  params: Record<string, unknown>,
): string {
  const paramsList = Object.entries(params)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');

  return `技能 "${skillName}" 的参数已收集完成，请确认：

${paramsList}

确认后我将开始执行。请回复"确认"或指出需要修改的参数。`;
}

/**
 * 解析AI响应中的Action
 */
export function parseActionResponse(response: string): {
  thought: string;
  action: string;
  actionInput: Record<string, unknown>;
} | null {

  let cleanedResponse = response
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<｜[\s\S]*?｜>/g, '')
    .replace(/<think[\s\S]*?<\/think>/gi, '')
    .trim();

  cleanedResponse = cleanedResponse.replace(
    /^\s*\*\*(Thought|Action|Action Input|Observation|Final Answer)\*\*\s*:/gim,
    '$1:'
  );
  cleanedResponse = cleanedResponse
    .replace(/<\/?think>/gi, '')
    .trim();


  // 提取Thought
  const thoughtMatch = cleanedResponse.match(/Thought:\s*([\s\S]+?)(?=Action:|$)/);
  const thought = thoughtMatch?.[1]?.trim() ?? '';

  // 提取Action
  const actionMatch = cleanedResponse.match(/Action:\s*([^\n]+)/);
  const action = actionMatch?.[1]?.trim() ?? '';


  // 提取Action Input
  const actionInputMatch = cleanedResponse.match(/Action Input:\s*([\s\S]+?)(?=Observation|Final Answer|$)/);
  let actionInput: Record<string, unknown> = {};

  if (actionInputMatch) {
    const rawInput = actionInputMatch[1]?.trim() ?? '';
    if (!rawInput.startsWith('{') || !rawInput.endsWith('}')) {
      return null;
    }

    try {
      const parsedInput = JSON.parse(rawInput);
      if (!parsedInput || typeof parsedInput !== 'object' || Array.isArray(parsedInput)) {
        return null;
      }
      actionInput = parsedInput as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  if (action) {
    return { thought, action, actionInput };
  }

  // 检查是否有Final Answer
  const finalMatch = cleanedResponse.match(/Final Answer:\s*([\s\S]+)/);
  if (finalMatch) {
    return {
      thought: thought || '任务已完成',
      action: 'finish',
      actionInput: { answer: finalMatch[1]?.trim() ?? '' },
    };
  }

  return null;
}

/**
 * 构建Observation提示词
 */
export function buildObservationPrompt(
  observation: string,
  iteration: number,
  maxIterations: number,
): string {
  return `Observation: ${observation}`;
}
