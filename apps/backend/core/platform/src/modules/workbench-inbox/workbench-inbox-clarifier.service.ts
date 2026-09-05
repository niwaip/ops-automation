import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import {
  InboxAiClarification,
  TodoPriority,
  UnifiedInboxContent,
} from './dto/workbench-inbox.dto';

@Injectable()
export class WorkbenchInboxClarifierService {
  private readonly logger = new Logger(WorkbenchInboxClarifierService.name);

  /**
   * 使用 LLM 对收件箱中的内容进行深度 GTD 厘清与 5W1H 任务要素整理
   */
  async clarifyInboxItem(
    content: UnifiedInboxContent,
    availableWorkflows: Array<{ id: string; name: string; description?: string }> = []
  ): Promise<InboxAiClarification> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const workflowHints = availableWorkflows
      .slice(0, 20)
      .map((wf) => `ID: "${wf.id}", 名称: "${wf.name}", 说明: "${wf.description || '无'}"`)
      .join('\n');

    const prompt = [
      '你是一个遵循 GTD (Getting Things Done) 原则的企业任务规划与运维自动化专家。',
      '请对以下已录入收件箱 (Inbox) 的原始内容进行深度厘清 (Clarify)，判断是否为可执行任务，并提取结构化要素：',
      '',
      `【收件箱主题】: ${content.title}`,
      `【来源类型】: ${content.source.type}`,
      content.source.sender ? `【发起人】: ${content.source.sender}` : '',
      `【原始内容】:\n${content.rawContent.slice(0, 3000)}`,
      '',
      workflowHints ? `【可选的自动化工作流列表】:\n${workflowHints}\n` : '',
      '请严格输出单个合法的 JSON 对象（严禁输出 markdown 代码块以外的解释或文本），结构如下：',
      '{',
      '  "isActionable": true, // 是否为需要后续跟进处理的行动项；若是纯通知/备忘则填 false',
      '  "confidence": 0.95, // 整理置信度 (0.0 ~ 1.0)',
      '  "refinementNotes": "一句话整理结论（如：已提炼出明确的报表导出行动与截止日期）",',
      '  "suggestedCategory": "task", // task(待办) | reference(参考备忘) | archive(已读归档)',
      '  "actionItem": {',
      '    "title": "符合 GTD 原则的规范行动标题（以动词开头，明确具体，不超过30字，如：周五下午前备份主库并验证快照）",',
      '    "description": "整理后的任务背景、行动细节与关联说明",',
      '    "priority": "low | medium | high | urgent",',
      '    "dueDate": "若有明确截止日期转为 ISO 8601 格式，否则留空",',
      '    "who": ["责任人或涉及人员"],',
      '    "where": "环境、地点或系统（如生产环境、测试服、邮件系统）",',
      '    "why": "任务背景与目标",',
      '    "how": "建议的执行方式或步骤",',
      '    "suggestedWorkflowId": "若可选工作流中有能够自动执行该任务的ID，填入对应ID，否则留空",',
      '    "suggestedWorkflowName": "对应工作流名称，否则留空"',
      '  }',
      '}',
    ].filter(Boolean).join('\n');

    try {
      const response = await axios.post<{ response?: string }>(
        `${aiOrchestratorUrl}/ai/chat`,
        {
          message: prompt,
          systemPrompt: '你必须严格且仅输出单个合法 JSON 对象。',
          temperature: 0.1,
        },
        { timeout: 9000 }
      );

      const rawResponse = response.data?.response;
      if (rawResponse) {
        const cleaned = rawResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
          isActionable: parsed.isActionable !== false,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.95,
          needsRefinement: false,
          refinementNotes: parsed.refinementNotes || 'AI 深度整理完成',
          suggestedCategory: parsed.suggestedCategory || 'task',
          actionItem: parsed.actionItem
            ? {
                title: parsed.actionItem.title || content.title,
                description: parsed.actionItem.description,
                priority: (parsed.actionItem.priority as TodoPriority) || TodoPriority.medium,
                dueDate: parsed.actionItem.dueDate || undefined,
                who: Array.isArray(parsed.actionItem.who) ? parsed.actionItem.who : [],
                where: parsed.actionItem.where,
                why: parsed.actionItem.why,
                how: parsed.actionItem.how,
                suggestedWorkflowId: parsed.actionItem.suggestedWorkflowId || undefined,
                suggestedWorkflowName: parsed.actionItem.suggestedWorkflowName || undefined,
              }
            : undefined,
        };
      }
    } catch (err: any) {
      this.logger.warn(`AI Orchestrator clarification failed, falling back to local extractor: ${err?.message}`);
    }

    // 降级规则兜底
    return {
      isActionable: true,
      confidence: 0.8,
      needsRefinement: false,
      refinementNotes: '已完成快速规则整理',
      actionItem: {
        title: content.title,
        description: content.rawContent,
        priority: TodoPriority.medium,
      },
      suggestedCategory: 'task',
    };
  }
}
