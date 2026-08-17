import { Injectable, Logger } from '@nestjs/common';
import { ModelService } from '../model/model.service';
import {
  ReviewUserWorkflowDto,
  UserWorkflowReviewIssue,
  UserWorkflowReviewResult,
} from './user-workflow-review.dto';

@Injectable()
export class UserWorkflowReviewService {
  private readonly logger = new Logger(UserWorkflowReviewService.name);

  constructor(private readonly modelService: ModelService) {}

  async review(dto: ReviewUserWorkflowDto): Promise<UserWorkflowReviewResult> {
    const model = this.modelService.getDefaultModel();
    if (!model) {
      return this.buildWarningResult(
        'AI_REVIEW_MODEL_UNAVAILABLE',
        '当前没有可用的默认模型，已完成确定性检查，但 AI 审查未执行。'
      );
    }

    try {
      const response = await this.modelService.callModel(
        model.id,
        this.buildPrompt(dto),
        'reasoning'
      );
      return this.normalizeReview(response.content, model.name || model.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`User workflow AI review failed: ${message}`);
      return this.buildWarningResult(
        'AI_REVIEW_FAILED',
        `AI 审查暂时不可用：${message}`,
        model.name || model.id
      );
    }
  }

  private buildPrompt(dto: ReviewUserWorkflowDto): string {
    const payload = JSON.stringify(
      {
        sourceExecutionId: dto.sourceExecutionId,
        planSnapshot: dto.planSnapshot,
        fixedInput: dto.fixedInput,
        businessResult: dto.businessResult,
      },
      null,
      2
    ).slice(0, 60000);

    return [
      '你是用户私有定时工作流的只读审查器。',
      '任务：判断一个已经成功执行的固定多步骤计划是否适合无人值守重复执行。',
      '禁止重新规划、禁止修改节点、禁止修改依赖、禁止修改输入绑定、禁止输出新计划。',
      '重点检查：仍需人工输入、验证码/登录/人工接管、瞬态 session/execution 标识、临时 URL、明文凭证、节点绑定缺失、最终业务结果不稳定。',
      '返回严格 JSON，不要 Markdown：',
      '{"decision":"pass|warning|block","summary":"简短中文结论","issues":[{"code":"CODE","severity":"warning|error","path":"可选路径","message":"中文说明"}]}',
      '只有明确无法无人值守执行时才 block；可接受风险使用 warning。',
      payload,
    ].join('\n\n');
  }

  private normalizeReview(content: string, model: string): UserWorkflowReviewResult {
    const parsed = this.parseJsonObject(content);
    if (!parsed) {
      return this.buildWarningResult(
        'AI_REVIEW_OUTPUT_INVALID',
        'AI 审查结果不是有效 JSON，需要用户确认后保存。',
        model
      );
    }

    const rawDecision = String(parsed.decision || '').toLowerCase();
    const decision: UserWorkflowReviewResult['decision'] =
      rawDecision === 'block' ? 'block' : rawDecision === 'warning' ? 'warning' : 'pass';
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues
          .map((issue) => this.normalizeIssue(issue))
          .filter((issue): issue is UserWorkflowReviewIssue => Boolean(issue))
      : [];

    return {
      decision,
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim().slice(0, 1000)
          : decision === 'pass'
            ? '固定多步骤计划适合无人值守重复执行。'
            : '固定多步骤计划存在需要关注的问题。',
      planChanged: false,
      reviewedAt: new Date().toISOString(),
      model,
      issues,
    };
  }

  private normalizeIssue(value: unknown): UserWorkflowReviewIssue | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const issue = value as Record<string, unknown>;
    if (typeof issue.message !== 'string' || !issue.message.trim()) {
      return null;
    }
    return {
      code:
        typeof issue.code === 'string' && issue.code.trim()
          ? issue.code.trim().slice(0, 100)
          : 'AI_REVIEW_WARNING',
      severity: issue.severity === 'error' ? 'error' : 'warning',
      ...(typeof issue.path === 'string' && issue.path.trim()
        ? { path: issue.path.trim().slice(0, 500) }
        : {}),
      message: issue.message.trim().slice(0, 1000),
    };
  }

  private parseJsonObject(content: string): Record<string, unknown> | null {
    const normalized = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start < 0 || end <= start) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(normalized.slice(start, end + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private buildWarningResult(
    code: string,
    message: string,
    model?: string
  ): UserWorkflowReviewResult {
    return {
      decision: 'warning',
      summary: message,
      planChanged: false,
      reviewedAt: new Date().toISOString(),
      ...(model ? { model } : {}),
      issues: [{ code, severity: 'warning', message }],
    };
  }
}
