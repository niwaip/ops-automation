import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import type { SavedSkillReviewDto } from './saved-skill.dto';

@Injectable()
export class SavedSkillReviewClient {
  private readonly logger = new Logger(SavedSkillReviewClient.name);

  async review(input: {
    sourceExecutionId: string;
    planSnapshot: Record<string, unknown>;
    fixedInput: Record<string, unknown>;
    businessResult?: Record<string, unknown>;
  }): Promise<SavedSkillReviewDto> {
    const internalSecret = process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
    try {
      const response = await axios.post<SavedSkillReviewDto>(
        `${getAiOrchestratorUrl()}/ai/internal/user-workflows/review`,
        input,
        {
          timeout: 45000,
          headers: internalSecret
            ? {
                'X-Internal-Auth': internalSecret,
                'X-Internal-Secret': internalSecret,
              }
            : undefined,
        }
      );
      return {
        ...response.data,
        planChanged: false,
        issues: Array.isArray(response.data.issues) ? response.data.issues : [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`AI review request failed: ${message}`);
      return {
        decision: 'warning',
        summary: `AI 审查暂时不可用，已保留确定性检查结果：${message}`,
        planChanged: false,
        reviewedAt: new Date().toISOString(),
        issues: [
          {
            code: 'AI_REVIEW_UNAVAILABLE',
            severity: 'warning',
            message: 'AI 审查服务暂时不可用，工作流仍可作为用户私有能力保存。',
          },
        ],
      };
    }
  }
}
