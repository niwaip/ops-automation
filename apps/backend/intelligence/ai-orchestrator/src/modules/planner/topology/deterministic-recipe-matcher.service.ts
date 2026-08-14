import { Injectable, Logger } from '@nestjs/common';
import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';

export type RecipeType =
  | 'document_extract'
  | 'search_then_summarize'
  | 'search_summarize_write_markdown'
  | 'summarize_then_write_markdown'
  | 'document_extract_then_summarize';

export interface MatchedRecipe {
  recipeName: RecipeType;
  objective: string;
  steps: Array<{
    ref: string;
    kind: 'skill' | 'llm_operation';
    role: 'search' | 'summarize' | 'markdown_writer' | 'document_extract';
    operationId?: string;
    dependsOn: string[];
  }>;
  finalNodeRef: string;
}

@Injectable()
export class DeterministicRecipeMatcherService {
  private readonly logger = new Logger(DeterministicRecipeMatcherService.name);

  public matchRecipe(
    userRequest: string,
    skillCards: CompactCapabilityCardV1[],
    llmOperationCards: CompactCapabilityCardV1[],
  ): MatchedRecipe | null {
    const req = userRequest.toLowerCase();
    const hasSearch =
      req.includes('搜索') ||
      req.includes('search') ||
      req.includes('查找') ||
      req.includes('查一下') ||
      req.includes('查询') ||
      req.includes('查看') ||
      req.includes('新闻') ||
      req.includes('最新') ||
      req.includes('查') ||
      req.includes('news') ||
      req.includes('latest') ||
      req.includes('检索');
    const hasSummarize =
      req.includes('总结') ||
      req.includes('摘要') ||
      req.includes('归纳') ||
      req.includes('概括') ||
      req.includes('汇总') ||
      req.includes('summarize') ||
      req.includes('summary');
    const hasMarkdown =
      req.includes('markdown') ||
      req.includes('md') ||
      req.includes('文件') ||
      req.includes('文档') ||
      req.includes('报告');
    const hasPdf = req.includes('pdf');

    // 模式 0：PDF/附件文本提取 + 摘要。提取与生成式处理保持为两个
    // 独立能力，其他文档提取器后续可复用同一编排形态。
    if (hasSummarize && hasPdf) {
      this.logger.log(`Matched Recipe: document_extract_then_summarize for request: "${userRequest}"`);
      return {
        recipeName: 'document_extract_then_summarize',
        objective: userRequest,
        steps: [
          { ref: 'n1', kind: 'skill', role: 'document_extract', dependsOn: [] },
          { ref: 'n2', kind: 'llm_operation', role: 'summarize', operationId: 'summarize_text', dependsOn: ['n1'] },
        ],
        finalNodeRef: 'n2',
      };
    }

    if (hasPdf) {
      this.logger.log(`Matched Recipe: document_extract for request: "${userRequest}"`);
      return {
        recipeName: 'document_extract',
        objective: userRequest,
        steps: [
          { ref: 'n1', kind: 'skill', role: 'document_extract', dependsOn: [] },
        ],
        finalNodeRef: 'n1',
      };
    }

    // 模式 1：搜索 + 总结 + 输出 Markdown 文件
    if (hasSearch && hasSummarize && hasMarkdown) {
      this.logger.log(`Matched Recipe: search_summarize_write_markdown for request: "${userRequest}"`);
      return {
        recipeName: 'search_summarize_write_markdown',
        objective: userRequest,
        steps: [
          { ref: 'n1', kind: 'skill', role: 'search', dependsOn: [] },
          { ref: 'n2', kind: 'llm_operation', role: 'summarize', operationId: 'summarize_list', dependsOn: ['n1'] },
          { ref: 'n3', kind: 'skill', role: 'markdown_writer', dependsOn: ['n2'] },
        ],
        finalNodeRef: 'n3',
      };
    }

    // 模式 2：搜索 + 总结
    if (hasSearch && hasSummarize) {
      this.logger.log(`Matched Recipe: search_then_summarize for request: "${userRequest}"`);
      return {
        recipeName: 'search_then_summarize',
        objective: userRequest,
        steps: [
          { ref: 'n1', kind: 'skill', role: 'search', dependsOn: [] },
          { ref: 'n2', kind: 'llm_operation', role: 'summarize', operationId: 'summarize_list', dependsOn: ['n1'] },
        ],
        finalNodeRef: 'n2',
      };
    }

    // 模式 3：总结 + 输出 Markdown 文件
    if (hasSummarize && hasMarkdown && !hasSearch) {
      this.logger.log(`Matched Recipe: summarize_then_write_markdown for request: "${userRequest}"`);
      return {
        recipeName: 'summarize_then_write_markdown',
        objective: userRequest,
        steps: [
          { ref: 'n1', kind: 'llm_operation', role: 'summarize', operationId: 'summarize_text', dependsOn: [] },
          { ref: 'n2', kind: 'skill', role: 'markdown_writer', dependsOn: ['n1'] },
        ],
        finalNodeRef: 'n2',
      };
    }

    return null;
  }
}
