/**
 * Prompt Builder
 * 构建ReAct循环所需的提示词
 */

import { AvailableSkillDefinition, ChatMessage, SkillMatchResult, ToolDefinition } from './interfaces';

/**
 * ReAct提示词模板
 */
const REACT_SYSTEM_PROMPT = `你是一个智能助手，使用ReAct(Reasoning + Acting)框架来处理复杂任务。

你的工作流程是：
1. Thought: 分析用户输入和之前的 Observation，思考下一步行动
2. Action: 选择合适的工具并执行
3. Observation: 观察执行结果。如果结果包含错误(error)，请在下一轮 Thought 中分析原因并尝试修正参数重新执行。
4. 重复以上步骤直到任务完成

可用的工具：
{tools}

当前用户可访问的技能：
{skills}

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
- 当技能配置了 \`carboneSkillId\` 时，使用 generate_parameters，并传入平台 skillId
- 当技能需要实际执行时，使用 flow_execute，并传入平台 skillId
- 当 Observation 已经足够回答用户且任务完成时，必须输出 \`Final Answer:\`，不要输出普通正文
- 如果工具返回requiresUserInput，则等待用户回复
- 如果执行出错（如 403 或 500），应在 Thought 中分析原因。不要使用 user_ask 的 confirm 类型，应直接通过 Final Answer 告知用户错误原因及建议，并询问用户是否需要重试或做其他操作。
- 不要在Thought中直接回答问题，必须通过工具执行
- 不要重复调用同一个工具，除非用户提供了新信息
- 如果任务完成，输出 Final Answer 包含最终回复
`;

const REACT_USER_PROMPT_TEMPLATE = `用户输入: {userInput}

请按照ReAct框架处理这个请求。`;

/**
 * 构建系统提示词
 */
export function buildSystemPrompt(
  tools: ToolDefinition[],
  skill?: SkillMatchResult,
  availableSkills: AvailableSkillDefinition[] = [],
  mode: 'chat' | 'task' = 'chat',
): string {
  let filteredTools = tools;

  if (mode === 'task') {
    // 任务模式下，强制排除通用发现和调用工具，确保模型只能看到并使用技能相关工具
    filteredTools = tools.filter((t) => !['skill_match', 'api_call'].includes(t.name));
  } else if (!skill) {
    filteredTools = tools.filter((t) => !t.category || t.category === 'discovery' || t.category === 'utility');
  } else if (skill.carboneSkillId) {
    filteredTools = tools.filter((t) => t.name !== 'param_collect');
  } else {
    filteredTools = tools.filter((t) => t.name !== 'generate_parameters');
  }

  const toolsDescription = filteredTools
    .map((t) => `${t.name}: ${t.description}\n参数: ${JSON.stringify(t.parameters, null, 2)}${t.requiresConfirmation ? '\n注意：此操作执行前需要人工确认。' : ''}`)
    .join('\n\n');

  const skillsDescription = availableSkills.length > 0
    ? availableSkills.map((item) => {
        const executionTool = item.carboneSkillId ? 'generate_parameters -> document_render' : 'flow_execute';
        const runtimeHints: string[] = [];
        if (item.goal) runtimeHints.push(`goal=${item.goal}`);
        if (item.expectedResult) runtimeHints.push(`expectedResult=${item.expectedResult}`);
        return [
          `- skillId: ${item.skillId}`,
          `  name: ${item.skillName}`,
          `  description: ${item.description || '无'}`,
          `  triggerKeywords: ${item.triggerKeywords.join(', ') || '无'}`,
          `  executionTool: ${executionTool}`,
          `  paramsSchema: ${JSON.stringify(item.paramsSchema, null, 2)}`,
          runtimeHints.length > 0 ? `  runtimeHints: ${runtimeHints.join('; ')}` : '',
        ].filter(Boolean).join('\n');
      }).join('\n\n')
    : mode === 'task' 
      ? '- 当前没有可用技能。请直接告知用户暂时无法处理此请求。'
      : '- 当前没有可用技能，必要时再使用 skill_match 或直接回复用户。';

  let systemPrompt = REACT_SYSTEM_PROMPT
    .replace('{tools}', toolsDescription)
    .replace('{skills}', skillsDescription);

  if (skill) {
    systemPrompt += `\n\n当前匹配的技能: ${skill.skillName}
Skill ID: ${skill.skillId}
Carbone Skill ID: ${skill.carboneSkillId || '无'}
Carbone Template ID: ${skill.carboneTemplateId || '无'}
需要的参数: ${JSON.stringify(skill.paramsSchema.properties, null, 2)}
已收集参数: ${JSON.stringify(skill.collectedParams, null, 2)}
缺失参数: ${skill.missingParams.join(', ') || '无'}
`;

    if (skill.goal) {
      systemPrompt += `技能目标: ${skill.goal}\n`;
    }
    if (skill.expectedResult) {
      systemPrompt += `预期结果: ${skill.expectedResult}\n`;
    }
    if (skill.outputParams && Object.keys(skill.outputParams).length > 0) {
      systemPrompt += `输出契约: ${JSON.stringify(skill.outputParams, null, 2)}\n`;
    }

    if (skill.carboneSkillId) {
      systemPrompt += `\n重要提示：此技能已配置Carbone AI参数生成，下一步优先调用 generate_parameters 工具，参数为:
{
  "skillId": "${skill.skillId}",
  "description": "用户的完整描述内容"
}
不要调用 param_collect，直接使用 generate_parameters 从用户描述中提取参数。`;
    }
  }

  return systemPrompt;
}

/**
 * 构建用户提示词
 */
export function buildUserPrompt(
  userInput: string,
  history: ChatMessage[],
  uploadedFiles?: string[],
): string {
  let prompt = REACT_USER_PROMPT_TEMPLATE.replace('{userInput}', userInput);

  // 添加历史上下文 (排除当前的ReAct循环历史，只保留之前的对话)
  const previousHistory = history.filter(m => !m.metadata?.isReAct);
  if (previousHistory.length > 0) {
    const recentHistory = previousHistory.slice(-5); // 最近5条消息
    const historyText = recentHistory
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');
    prompt += `\n\n对话历史:\n${historyText}`;
  }

  // 添加当前的ReAct循环历史
  const reActHistory = history.filter(m => m.metadata?.isReAct);
  if (reActHistory.length > 0) {
    prompt += `\n\n当前任务进展:\n`;
    reActHistory.forEach(m => {
      if (m.role === 'assistant') {
        prompt += `${m.content}\n`;
      } else if (m.role === 'user' && m.content.startsWith('Observation:')) {
        prompt += `${m.content}\n`;
      }
    });
  }

  // 添加文件信息
  if (uploadedFiles && uploadedFiles.length > 0) {
    prompt += `\n\n上传的文件: ${uploadedFiles.join(', ')}`;
  }

  return prompt;
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
  // 调试日志
  console.log('[DEBUG parseActionResponse] Raw response length:', response?.length);
  console.log('[DEBUG parseActionResponse] Raw response preview:', response?.substring(0, 500));

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

  console.log('[DEBUG parseActionResponse] Cleaned response preview:', cleanedResponse?.substring(0, 500));

  // 提取Thought
  const thoughtMatch = cleanedResponse.match(/Thought:\s*([\s\S]+?)(?=Action:|$)/);
  const thought = thoughtMatch?.[1]?.trim() ?? '';

  // 提取Action
  const actionMatch = cleanedResponse.match(/Action:\s*([^\n]+)/);
  const action = actionMatch?.[1]?.trim() ?? '';

  console.log('[DEBUG parseActionResponse] Extracted thought:', thought?.substring(0, 200));
  console.log('[DEBUG parseActionResponse] Extracted action:', action?.substring(0, 200));

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
