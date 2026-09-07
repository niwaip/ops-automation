import { Injectable } from '@nestjs/common';
import {
  InboxActionItemRecommendation,
  InboxAiClarification,
  IngestInboxItemDto,
  TodoPriority,
  TodoSourceType,
  UnifiedInboxContent,
} from './dto/workbench-inbox.dto';

export interface NormalizedIngestResult {
  title: string;
  unifiedPayload: UnifiedInboxContent;
  initialClarification: InboxAiClarification;
}

@Injectable()
export class WorkbenchInboxIngestionService {
  /**
   * 将多源异构输入统一归一化为标准 UnifiedInboxContent 协议，并给出置信度初评
   */
  normalizeIngestPayload(
    dto: IngestInboxItemDto,
    availableWorkflows: Array<{ id: string; name: string; description?: string }> = []
  ): NormalizedIngestResult {
    const raw = dto.rawContent.trim();
    const sourceType = dto.sourceType || TodoSourceType.manual;

    // 1. 提炼标题
    let title = dto.title?.trim();
    if (!title) {
      title = this.extractTitleFromContent(raw, dto.sourceTitle);
    }

    // 2. 构造统一协议 UnifiedInboxContent
    const unifiedPayload: UnifiedInboxContent = {
      title,
      rawContent: raw,
      summary: raw.slice(0, 150).replace(/\n+/g, ' '),
      source: {
        type: sourceType,
        refId: dto.sourceRefId,
        title: dto.sourceTitle,
        sender: dto.sourceSender,
        senderType: sourceType === 'chat' ? 'assistant' : sourceType === 'manual' ? 'user' : 'external',
        timestamp: new Date().toISOString(),
      },
      extra: dto.extra || {},
    };

    // 3. 计算要素置信度 (Confidence Score 0.0 ~ 1.0)
    const initialClarification = this.evaluateHeuristicClarification(
      title,
      raw,
      availableWorkflows
    );

    return {
      title,
      unifiedPayload,
      initialClarification,
    };
  }

  /**
   * 基于文本结构与特征给出初步置信度打分与 5W1H 判定
   */
  evaluateHeuristicClarification(
    title: string,
    rawText: string,
    availableWorkflows: Array<{ id: string; name: string; description?: string }> = []
  ): InboxAiClarification {
    let score = 0.5; // 基准分
    const actionVerbs = /(备份|导出|生成|修复|重启|部署|巡检|审核|发送|同步|清理|配置|排查|升级|优化|迁移|扩容|上线|处理|解决)/i;
    const timePatterns = /(今天|明天|后天|周[一二三四五六日]|下周|月底|下班前|\d{1,2}月\d{1,2}日|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i;
    const peoplePatterns = /@([\w\u4e00-\u9fa5]+)|(由|请|让|麻烦)([\w\u4e00-\u9fa5]{2,4})(处理|负责|跟进)/i;

    const hasAction = actionVerbs.test(rawText) || actionVerbs.test(title);
    if (hasAction) score += 0.25;

    const hasTime = timePatterns.test(rawText);
    if (hasTime) score += 0.15;

    const hasPeople = peoplePatterns.test(rawText);
    if (hasPeople) score += 0.1;

    // 若文本过长过杂或充满疑问语气，降低置信度
    if (rawText.length > 500 && !/todo|待办|任务/i.test(rawText)) {
      score -= 0.2;
    }
    if (/(吗[？?]|怎么看|是什么意思|不知道)/.test(rawText)) {
      score -= 0.15;
    }

    // 夹取 0.1 ~ 0.95 范围
    const finalConfidence = Math.max(0.1, Math.min(0.95, parseFloat(score.toFixed(2))));
    const needsRefinement = finalConfidence < 0.75;

    // 初步推断优先级
    let priority: TodoPriority = TodoPriority.medium;
    if (/紧急|立刻|马上|尽快|高优|asap|严重|故障|报警|p0|p1/i.test(rawText)) {
      priority = TodoPriority.high;
    } else if (/有空|低优|不急|后续|参考|排期/i.test(rawText)) {
      priority = TodoPriority.low;
    }

    // 匹配自动化工作流
    let matchedWorkflowId: string | undefined;
    let matchedWorkflowName: string | undefined;
    if (availableWorkflows.length > 0) {
      const matched = availableWorkflows.find((wf) => {
        const coreName = wf.name.replace(/(工作流|自动化|流程|任务|技能|脚本)+$/g, '').trim();
        return coreName.length >= 2 && (rawText.includes(coreName) || title.includes(coreName));
      });
      if (matched) {
        matchedWorkflowId = matched.id;
        matchedWorkflowName = matched.name;
      }
    }

    const actionItem: InboxActionItemRecommendation = {
      title,
      description: rawText,
      priority,
      suggestedWorkflowId: matchedWorkflowId,
      suggestedWorkflowName: matchedWorkflowName,
    };

    return {
      isActionable: hasAction,
      confidence: finalConfidence,
      needsRefinement,
      refinementNotes: needsRefinement
        ? '该条目要素（动作/时间/主体）不够清晰，建议点击「AI 智能整理」使用大模型进行深度厘清。'
        : '条目要素相对明确，可直接转为待办任务。',
      actionItem,
      suggestedCategory: hasAction ? 'task' : 'reference',
    };
  }

  private extractTitleFromContent(raw: string, fallbackTitle?: string): string {
    if (fallbackTitle?.trim()) return fallbackTitle.trim();
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0] || '收件箱新条目';
    const cleaned = firstLine.replace(/^[#\-*>\d.\s]+/, '').replace(/^(todo|待办|任务|请|提醒)[:：\s]*/i, '');
    return cleaned.slice(0, 40) || '收件箱新条目';
  }
}
