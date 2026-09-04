import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import {
  ExtractTodoPreviewDto,
  Todo5W1HContextDto,
  TodoPriority,
  TodoSourceType,
} from './dto/workbench-todo.dto';

export interface ExtractedTodoPreview {
  title: string;
  description: string;
  priority: TodoPriority;
  dueDate?: string;
  sourceType: TodoSourceType;
  sourceRefId?: string;
  sourceTitle?: string;
  contextData: {
    w5h1: Todo5W1HContextDto;
    [key: string]: any;
  };
  suggestedWorkflowId?: string;
  suggestedWorkflowName?: string;
}

@Injectable()
export class WorkbenchTodoParserService {
  private readonly logger = new Logger(WorkbenchTodoParserService.name);

  /**
   * 提取 5W1H 任务要素并生成待办草稿预览
   */
  async extractTodoPreview(
    dto: ExtractTodoPreviewDto,
    availableWorkflows: Array<{ id: string; name: string; description?: string }> = []
  ): Promise<ExtractedTodoPreview> {
    const rawText = dto.text.trim();
    if (!rawText) {
      return this.buildFallbackPreview(dto, { what: '新建待办事项' });
    }

    // 优先尝试通过 AI Orchestrator 进行高精度 5W1H 提炼
    try {
      const aiResult = await this.extractWithAi(rawText, availableWorkflows);
      if (aiResult) {
        return this.assemblePreview(dto, aiResult, availableWorkflows);
      }
    } catch (err: any) {
      this.logger.warn(`AI extraction failed or unavailable, falling back to heuristic parser: ${err?.message}`);
    }

    // 离线/降级启发式规则解析
    const heuristicResult = this.extractWithHeuristics(rawText);
    return this.assemblePreview(dto, heuristicResult, availableWorkflows);
  }

  /**
   * 基于 LLM 进行结构化 5W1H 要素抽取
   */
  private async extractWithAi(
    rawText: string,
    availableWorkflows: Array<{ id: string; name: string; description?: string }>
  ): Promise<Todo5W1HContextDto | null> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const workflowHints = availableWorkflows
      .slice(0, 20)
      .map((wf) => `ID: "${wf.id}", 名称: "${wf.name}", 说明: "${wf.description || '无'}"`)
      .join('\n');

    const prompt = [
      '你是一个专业的企业运维与办公任务规划专家。',
      '请分析以下文本（可能来源于即时通讯消息、工作邮件或AI对话），将其提炼拆解为 5W1H 待办任务要素：',
      '',
      `【原始文本】:\n${rawText.slice(0, 3000)}`,
      '',
      workflowHints ? `【可选的自动化工作流列表】:\n${workflowHints}\n` : '',
      '请严格输出合法 JSON（不含任何外部说明或标记），结构如下：',
      '{',
      '  "what": "简洁有力的待办标题与动作描述，不超过30字（如：下周一下午前导出运维报表并发送邮件）",',
      '  "why": "任务背景、目标或动因",',
      '  "who": ["提及的相关人员或责任人，如：张三"],',
      '  "when": "提到的时间点或截止日期文本，如：明天下午5点前",',
      '  "dueDateIso": "如果能解析出明确时间，转换为 ISO 8601 格式（如 2026-09-05T17:00:00+08:00），否则填 null",',
      '  "where": "环境或地点，如生产机房、测试服、邮件系统",',
      '  "how": "完成方式或执行建议",',
      '  "priority": "high | medium | low",',
      '  "suggestedWorkflowId": "如果可选工作流中存在能自动执行此任务的ID，填入对应ID，否则填 null",',
      '  "suggestedWorkflowName": "对应工作流名称，否则填 null"',
      '}',
    ].filter(Boolean).join('\n');

    const response = await axios.post<{ response?: string }>(
      `${aiOrchestratorUrl}/ai/chat`,
      {
        message: prompt,
        systemPrompt: '你必须严格且仅输出单个合法 JSON 对象。',
        temperature: 0.1,
      },
      { timeout: 8000 }
    );

    const rawResponse = response.data?.response;
    if (!rawResponse) return null;

    const cleaned = rawResponse
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(cleaned);

    return {
      what: parsed.what || undefined,
      why: parsed.why || undefined,
      who: Array.isArray(parsed.who) ? parsed.who : [],
      when: parsed.when || undefined,
      where: parsed.where || undefined,
      how: parsed.how || undefined,
      rawText,
      suggestedWorkflowId: parsed.suggestedWorkflowId || undefined,
      suggestedWorkflowName: parsed.suggestedWorkflowName || undefined,
      confidence: 0.95,
      ...parsed,
    };
  }

  /**
   * 启发式规则解析器（5W1H + 正则 + 关键字）
   */
  extractWithHeuristics(rawText: string): Todo5W1HContextDto & { priority?: TodoPriority; dueDateIso?: string } {
    const lines = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const firstLine = lines[0] || rawText;

    // 1. Who (提取 @成员 或 姓名标识)
    const whoMatches = rawText.match(/@([\w\u4e00-\u9fa5]+)/g) || [];
    const who = whoMatches.map((m) => m.replace(/^@/, ''));

    // 2. When & DueDate
    const whenResult = this.parseTimeHeuristic(rawText);

    // 3. Priority
    const priority = this.inferPriority(rawText);

    // 4. What
    let what = firstLine.slice(0, 60);
    // 去除类似 "TODO:", "待办:", "请协助:" 等前缀
    what = what.replace(/^(todo|待办|任务|请|提醒|麻烦)[:：\s]*/i, '').trim();

    return {
      what: what || '新建待办事项',
      rawText,
      who,
      when: whenResult.whenText,
      dueDateIso: whenResult.dueDateIso,
      priority,
      confidence: 0.7,
    };
  }

  private parseTimeHeuristic(text: string): { whenText?: string; dueDateIso?: string } {
    const now = new Date();
    let dueDate: Date | null = null;
    let whenText: string | undefined;

    if (/今天|今晚|下班前/.test(text)) {
      whenText = '今天下班前';
      dueDate = new Date(now);
      dueDate.setHours(18, 0, 0, 0);
    } else if (/明天|次日/.test(text)) {
      whenText = '明天下午';
      dueDate = new Date(now.getTime() + 24 * 3600 * 1000);
      dueDate.setHours(18, 0, 0, 0);
    } else if (/后天/.test(text)) {
      whenText = '后天下午';
      dueDate = new Date(now.getTime() + 48 * 3600 * 1000);
      dueDate.setHours(18, 0, 0, 0);
    } else if (/下周一/.test(text)) {
      whenText = '下周一';
      const day = now.getDay();
      const diff = day === 0 ? 1 : 8 - day;
      dueDate = new Date(now.getTime() + diff * 24 * 3600 * 1000);
      dueDate.setHours(12, 0, 0, 0);
    } else if (/本周五|周五/.test(text)) {
      whenText = '本周五';
      const day = now.getDay();
      const diff = (5 - day + 7) % 7;
      dueDate = new Date(now.getTime() + (diff === 0 ? 7 : diff) * 24 * 3600 * 1000);
      dueDate.setHours(18, 0, 0, 0);
    }

    // 匹配 YYYY-MM-DD 或 MM-DD 或 MM月DD日
    const dateMatch = text.match(/(\d{4}[-/年])?(\d{1,2})[-/月](\d{1,2})日?/);
    if (dateMatch) {
      const year = dateMatch[1] ? parseInt(dateMatch[1].replace(/\D/g, ''), 10) : now.getFullYear();
      const month = parseInt(dateMatch[2], 10) - 1;
      const day = parseInt(dateMatch[3], 10);
      dueDate = new Date(year, month, day, 18, 0, 0);
      whenText = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    return {
      whenText,
      dueDateIso: dueDate ? dueDate.toISOString() : undefined,
    };
  }

  private inferPriority(text: string): TodoPriority {
    if (/紧急|立刻|马上|尽快|高优|asap|严重|故障|报警|p0|p1|宕机|崩溃/i.test(text)) {
      return TodoPriority.high;
    }
    if (/有空|低优|不急|后续|参考|排期|p3|建议/i.test(text)) {
      return TodoPriority.low;
    }
    return TodoPriority.medium;
  }

  private assemblePreview(
    dto: ExtractTodoPreviewDto,
    extracted: any,
    availableWorkflows: Array<{ id: string; name: string; description?: string }>
  ): ExtractedTodoPreview {
    const title = extracted.what || dto.sourceTitle || '新建待办事项';
    const priority = (extracted.priority as TodoPriority) || TodoPriority.medium;
    const dueDate = extracted.dueDateIso || undefined;

    // 工作流匹配（若 AI 未匹配，使用关键词匹配）
    let suggestedWorkflowId = extracted.suggestedWorkflowId;
    let suggestedWorkflowName = extracted.suggestedWorkflowName;

    if (!suggestedWorkflowId && availableWorkflows.length > 0) {
      const matched = availableWorkflows.find((wf) => {
        const coreName = wf.name.replace(/(工作流|自动化|流程|任务|技能|脚本)$/, '').trim();
        if (coreName.length >= 2 && (title.includes(coreName) || dto.text.includes(coreName))) {
          return true;
        }
        const words = wf.name.split(/[\s_-]+/);
        return words.some((w) => w.length >= 2 && (title.includes(w) || dto.text.includes(w)));
      });
      if (matched) {
        suggestedWorkflowId = matched.id;
        suggestedWorkflowName = matched.name;
      }
    }

    const description = [
      extracted.why ? `【目标/动因】: ${extracted.why}` : null,
      extracted.who && extracted.who.length > 0 ? `【相关人员】: ${extracted.who.join(', ')}` : null,
      extracted.where ? `【环境地点】: ${extracted.where}` : null,
      extracted.how ? `【执行方式】: ${extracted.how}` : null,
      dto.text !== title ? `\n---\n原始消息：\n${dto.text}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      title,
      description,
      priority,
      dueDate,
      sourceType: dto.sourceType || TodoSourceType.chat,
      sourceRefId: dto.sourceRefId,
      sourceTitle: dto.sourceTitle,
      contextData: {
        w5h1: {
          what: extracted.what,
          why: extracted.why,
          who: extracted.who,
          when: extracted.when,
          where: extracted.where,
          how: extracted.how,
          rawText: dto.text,
          suggestedWorkflowId,
          suggestedWorkflowName,
          confidence: extracted.confidence || 0.8,
        },
      },
      suggestedWorkflowId,
      suggestedWorkflowName,
    };
  }

  private buildFallbackPreview(
    dto: ExtractTodoPreviewDto,
    overrides: Partial<Todo5W1HContextDto> = {}
  ): ExtractedTodoPreview {
    return {
      title: overrides.what || dto.sourceTitle || '待办任务',
      description: dto.text,
      priority: TodoPriority.medium,
      sourceType: dto.sourceType || TodoSourceType.manual,
      sourceRefId: dto.sourceRefId,
      sourceTitle: dto.sourceTitle,
      contextData: {
        w5h1: {
          what: overrides.what || '待办任务',
          rawText: dto.text,
        },
      },
    };
  }
}
