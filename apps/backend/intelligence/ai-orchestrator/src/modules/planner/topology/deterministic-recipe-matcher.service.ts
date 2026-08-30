import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  createBuiltinRoutingPolicySnapshot,
  hasRoutingSignal,
} from '../routing/routing-policy.matcher';
import { RoutingPolicyService } from '../routing/routing-policy.service';

export type RecipeType =
  | 'document_extract'
  | 'grounded_text_transform'
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
    role: 'search' | 'summarize' | 'transform' | 'markdown_writer' | 'document_extract';
    inputShape?: 'list' | 'text';
    dependsOn: string[];
  }>;
  finalNodeRef: string;
  requiresExternalData: boolean;
}

@Injectable()
export class DeterministicRecipeMatcherService {
  private readonly logger = new Logger(DeterministicRecipeMatcherService.name);

  constructor(@Optional() private readonly routingPolicy?: RoutingPolicyService) {}

  public matchRecipe(
    userRequest: string,
    context?: { hasPreviousResult?: boolean }
  ): MatchedRecipe | null {
    const policy = this.routingPolicy?.getSnapshot() || createBuiltinRoutingPolicySnapshot();
    const hasSearch = hasRoutingSignal(userRequest, 'search', policy);
    const hasSummarize = hasRoutingSignal(userRequest, 'summarize', policy);
    const hasProcessing = hasRoutingSignal(userRequest, 'processing', policy);
    const hasGeneration = hasRoutingSignal(userRequest, 'generation', policy);
    const hasMarkdown = hasRoutingSignal(userRequest, 'markdown', policy);
    const hasPdfExport =
      (hasRoutingSignal(userRequest, 'artifact', policy) || /pdf/i.test(userRequest)) &&
      /生成\s*pdf|输出\s*pdf|导出\s*pdf|create\s*pdf|制作\s*pdf/i.test(userRequest);
    const hasPdfSplit = /拆分|拆页|分割|抽页|split/i.test(userRequest);
    const hasPdfMerge = /合并|拼接|merge/i.test(userRequest);
    const hasWeb = /网页|网站|url|http|打开|浏览/i.test(userRequest);
    const hasPdf =
      !hasPdfExport &&
      !hasPdfSplit &&
      !hasPdfMerge &&
      !hasWeb &&
      hasRoutingSignal(userRequest, 'documentSource', policy);
    const hasUncoveredAction = hasRoutingSignal(userRequest, 'uncoveredAction', policy);

    // 模式 0：在已有可信结果之上做单次 LLM 变换。该 Recipe 跳过
    // Skill 匹配模型和拓扑模型，并由参数绑定器把不可变结果快照绑定到 content。
    if (
      context?.hasPreviousResult === true &&
      (hasGeneration || hasProcessing) &&
      !hasSummarize &&
      !hasSearch &&
      !hasMarkdown &&
      !hasPdf &&
      !hasPdfSplit &&
      !hasPdfMerge &&
      !hasPdfExport &&
      !hasUncoveredAction
    ) {
      this.logger.log(`Matched Recipe: grounded_text_transform for request: "${userRequest}"`);
      return {
        recipeName: 'grounded_text_transform',
        objective: userRequest,
        steps: [
          {
            ref: 'n1',
            kind: 'llm_operation',
            role: 'transform',
            inputShape: 'text',
            dependsOn: [],
          },
        ],
        finalNodeRef: 'n1',
        requiresExternalData: false,
      };
    }

    // 模式 1：PDF/附件文本提取 + 摘要。提取与生成式处理保持为两个
    // 独立能力，其他文档提取器后续可复用同一编排形态。
    if (hasSummarize && hasPdf) {
      this.logger.log(
        `Matched Recipe: document_extract_then_summarize for request: "${userRequest}"`
      );
      return {
        recipeName: 'document_extract_then_summarize',
        objective: userRequest,
        steps: [
          { ref: 'n1', kind: 'skill', role: 'document_extract', dependsOn: [] },
          {
            ref: 'n2',
            kind: 'llm_operation',
            role: 'summarize',
            inputShape: 'text',
            dependsOn: ['n1'],
          },
        ],
        finalNodeRef: 'n2',
        requiresExternalData: true,
      };
    }

    if (hasPdf) {
      this.logger.log(`Matched Recipe: document_extract for request: "${userRequest}"`);
      return {
        recipeName: 'document_extract',
        objective: userRequest,
        steps: [{ ref: 'n1', kind: 'skill', role: 'document_extract', dependsOn: [] }],
        finalNodeRef: 'n1',
        requiresExternalData: true,
      };
    }

    // 模式 1：搜索 + 总结 + 输出 Markdown 文件
    if (hasSearch && hasSummarize && hasMarkdown) {
      this.logger.log(
        `Matched Recipe: search_summarize_write_markdown for request: "${userRequest}"`
      );
      return {
        recipeName: 'search_summarize_write_markdown',
        objective: userRequest,
        steps: [
          { ref: 'n1', kind: 'skill', role: 'search', dependsOn: [] },
          {
            ref: 'n2',
            kind: 'llm_operation',
            role: 'summarize',
            inputShape: 'list',
            dependsOn: ['n1'],
          },
          { ref: 'n3', kind: 'skill', role: 'markdown_writer', dependsOn: ['n2'] },
        ],
        finalNodeRef: 'n3',
        requiresExternalData: true,
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
          {
            ref: 'n2',
            kind: 'llm_operation',
            role: 'summarize',
            inputShape: 'list',
            dependsOn: ['n1'],
          },
        ],
        finalNodeRef: 'n2',
        requiresExternalData: true,
      };
    }

    // 模式 3：总结 + 输出 Markdown 文件
    if (hasSummarize && hasMarkdown && !hasSearch) {
      this.logger.log(
        `Matched Recipe: summarize_then_write_markdown for request: "${userRequest}"`
      );
      return {
        recipeName: 'summarize_then_write_markdown',
        objective: userRequest,
        steps: [
          {
            ref: 'n1',
            kind: 'llm_operation',
            role: 'summarize',
            inputShape: 'text',
            dependsOn: [],
          },
          { ref: 'n2', kind: 'skill', role: 'markdown_writer', dependsOn: ['n1'] },
        ],
        finalNodeRef: 'n2',
        requiresExternalData: false,
      };
    }

    return null;
  }
}
