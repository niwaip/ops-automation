import { Injectable, Logger, Optional } from '@nestjs/common';
import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';
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
    operationId?: string;
    dependsOn: string[];
  }>;
  finalNodeRef: string;
}

@Injectable()
export class DeterministicRecipeMatcherService {
  private readonly logger = new Logger(DeterministicRecipeMatcherService.name);

  constructor(@Optional() private readonly routingPolicy?: RoutingPolicyService) {}

  public matchRecipe(
    userRequest: string,
    skillCards: CompactCapabilityCardV1[],
    llmOperationCards: CompactCapabilityCardV1[],
    context?: { hasPreviousResult?: boolean }
  ): MatchedRecipe | null {
    void skillCards;
    void llmOperationCards;
    const policy = this.routingPolicy?.getSnapshot() || createBuiltinRoutingPolicySnapshot();
    const hasSearch = hasRoutingSignal(userRequest, 'search', policy);
    const hasSummarize = hasRoutingSignal(userRequest, 'summarize', policy);
    const hasProcessing = hasRoutingSignal(userRequest, 'processing', policy);
    const hasGeneration = hasRoutingSignal(userRequest, 'generation', policy);
    const hasMarkdown = hasRoutingSignal(userRequest, 'markdown', policy);
    const hasPdf = hasRoutingSignal(userRequest, 'documentSource', policy);
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
            operationId: 'transform_text',
            dependsOn: [],
          },
        ],
        finalNodeRef: 'n1',
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
            operationId: 'summarize_text',
            dependsOn: ['n1'],
          },
        ],
        finalNodeRef: 'n2',
      };
    }

    if (hasPdf) {
      this.logger.log(`Matched Recipe: document_extract for request: "${userRequest}"`);
      return {
        recipeName: 'document_extract',
        objective: userRequest,
        steps: [{ ref: 'n1', kind: 'skill', role: 'document_extract', dependsOn: [] }],
        finalNodeRef: 'n1',
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
            operationId: 'summarize_list',
            dependsOn: ['n1'],
          },
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
          {
            ref: 'n2',
            kind: 'llm_operation',
            role: 'summarize',
            operationId: 'summarize_list',
            dependsOn: ['n1'],
          },
        ],
        finalNodeRef: 'n2',
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
            operationId: 'summarize_text',
            dependsOn: [],
          },
          { ref: 'n2', kind: 'skill', role: 'markdown_writer', dependsOn: ['n1'] },
        ],
        finalNodeRef: 'n2',
      };
    }

    return null;
  }
}
