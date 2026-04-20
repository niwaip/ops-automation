/**
 * Prompt Builder
 * 构建ReAct循环所需的提示词
 */

import { ChatMessage, SkillMatchResult, ToolDefinition, ReActConfig } from './interfaces';

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
- 如果工具返回requiresUserInput，则等待用户回复
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
): string {
  // 动态工具过滤：
  // 1. 如果没有匹配到技能，主要显示 discovery 分类的工具
  // 2. 如果已经匹配到技能，显示与该阶段相关的工具，并优先展示 flow 工具
  let filteredTools = tools;

  if (!skill) {
    // 尚未匹配技能，优先显示发现类工具
    filteredTools = tools.filter(t => !t.category || t.category === 'discovery' || t.category === 'utility');
  } else {
    // 已匹配技能，根据技能特性过滤
    // 检查是否有对应的 flow 工具 (Shadow Tool / Macro Tool)
    const hasFlowTool = tools.some(t => t.category === 'flow' && (t.name.includes(skill.skillId.replace(/-/g, '_')) || t.name.includes(skill.skillName)));
    
    if (hasFlowTool) {
      // 如果有对应的预编译流程工具，优先展示它
      filteredTools = tools.filter(t => 
        t.category === 'flow' || 
        t.category === 'utility' ||
        (t.category === 'execution' && t.name === 'user_ask')
      );
    } else if (skill.carboneSkillId) {
      // Carbone 流程：排除手动采参，保留 AI 采参和执行
      filteredTools = tools.filter(t => t.name !== 'param_collect');
    } else {
      // 普通流程：保留手动采参，排除 AI 采参
      filteredTools = tools.filter(t => t.name !== 'generate_parameters');
    }
  }

  const toolsDescription = filteredTools
    .map((t) => `${t.name}: ${t.description}\n参数: ${JSON.stringify(t.parameters, null, 2)}${t.requiresConfirmation ? '\n注意：此操作执行前需要人工确认。' : ''}`)
    .join('\n\n');

  let systemPrompt = REACT_SYSTEM_PROMPT.replace('{tools}', toolsDescription);

  // 如果有匹配的Skill，添加额外提示
  if (skill) {
    systemPrompt += `\n\n当前匹配的技能: ${skill.skillName}
Carbone Skill ID: ${skill.carboneSkillId || '无'}
Carbone Template ID: ${skill.carboneTemplateId || '无'}
需要的参数: ${JSON.stringify(skill.paramsSchema.properties, null, 2)}
已收集参数: ${JSON.stringify(skill.collectedParams, null, 2)}
缺失参数: ${skill.missingParams.join(', ') || '无'}
`;

    // 如果有carboneSkillId，明确提示下一步使用generate_parameters
    if (skill.carboneSkillId) {
      systemPrompt += `\n重要提示：此技能已配置Carbone AI参数生成，下一步必须调用 generate_parameters 工具，参数为:
{
  "skillId": "${skill.carboneSkillId}",
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

确认后我将生成文档。请回复"确认"或指出需要修改的参数。`;
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

  // 过滤掉思考标签内容，否则会干扰正则匹配
  // 支持多种思考标签格式: <think>、<｜User｜>、<｜Model｜>等
  let cleanedResponse = response
    // 匹配 <think>...</think> 格式（MiniMax等模型常用）
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    // 匹配 <｜...｜> 格式
    .replace(/<｜[\s\S]*?｜>/g, '')
    // 匹配其他可能的思考标签格式（不区分大小写）
    .replace(/<think[\s\S]*?<\/think>/gi, '')
    .trim();

  console.log('[DEBUG parseActionResponse] Cleaned response preview:', cleanedResponse?.substring(0, 500));

  // 尝试直接解析JSON
  try {
    const cleaned = cleanedResponse.trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.action) {
      return {
        thought: parsed.thought || '',
        action: parsed.action,
        actionInput: parsed.actionInput || {},
      };
    }

    if (parsed.finalAnswer) {
      return {
        thought: parsed.thought || '任务已完成',
        action: 'finish',
        actionInput: { answer: parsed.finalAnswer },
      };
    }
  } catch (e) {
    // JSON解析失败，尝试传统的正则提取（兼容模式）
  }

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
    try {
      // 尝试解析JSON
      const inputStr = actionInputMatch[1]?.trim() ?? '';
      // 处理可能的多行JSON
      const jsonMatch = inputStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        actionInput = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // JSON解析失败，尝试清洗JSON字符串
      const cleaned = actionInputMatch[1]?.trim() ?? '';
      const cleanedJson = cleaned.replace(/```json|```/g, '').trim();
      try {
        actionInput = JSON.parse(cleanedJson);
      } catch {
        // 仍然失败
      }
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
