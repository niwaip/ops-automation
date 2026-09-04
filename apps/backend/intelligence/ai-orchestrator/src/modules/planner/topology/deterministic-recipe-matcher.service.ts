import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  createBuiltinRoutingPolicySnapshot,
  extractTerminalActions,
  hasRoutingSignal,
} from '../routing/routing-policy.matcher';
import { RoutingPolicyService } from '../routing/routing-policy.service';

export type RecipeType = string;

export interface MatchedRecipe {
  source?: 'policy' | 'builtin';
  recipeName: RecipeType;
  objective: string;
  steps: Array<{
    ref: string;
    kind: 'skill' | 'llm_operation';
    role:
      | 'search'
      | 'summarize'
      | 'transform'
      | 'markdown_writer'
      | 'document_extract'
      | 'web_extract'
      | 'generate'
      | 'notify';
    inputShape?: 'list' | 'text';
    dependsOn: string[];
  }>;
  finalNodeRef: string;
  requiresExternalData: boolean;
  completionClaims?: string[];
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
    const isExplicitFileExport =
      /(?:生成|输出|导出|保存|写入|创建)\s*(?:为|成)?\s*(?:markdown|md|文档|文件|.*\.md)|\b(?:markdown|md)\s*(?:文件|交付件|文档)|\.md\b/i.test(
        userRequest
      );
    const isJustFormatConstraint =
      /(?:用|以|按|按照)?\s*markdown\s*格式(?:总结|回复|输出|回答|提炼|概括)?/i.test(userRequest) &&
      !/(?:生成|导出|保存|写入)\s*(?:为|成)?\s*.*\.md|\.md\b/i.test(userRequest);
    const hasMarkdownFile = isExplicitFileExport && !isJustFormatConstraint;
    const hasMarkdown = hasMarkdownFile;
    const hasPdfExport =
      (hasRoutingSignal(userRequest, 'artifact', policy) || /pdf/i.test(userRequest)) &&
      /生成\s*pdf|输出\s*pdf|导出\s*pdf|create\s*pdf|制作\s*pdf/i.test(userRequest);
    const hasPdfSplit = /拆分|拆页|分割|抽页|split/i.test(userRequest);
    const hasPdfMerge = /合并|拼接|merge/i.test(userRequest);
    const hasWeb = hasRoutingSignal(userRequest, 'webSource', policy);
    const hasDocumentExtract =
      !hasPdfExport &&
      !hasPdfSplit &&
      !hasPdfMerge &&
      !hasWeb &&
      hasRoutingSignal(userRequest, 'documentSource', policy);
    const hasUncoveredAction = hasRoutingSignal(userRequest, 'uncoveredAction', policy);
    const terminalActions = extractTerminalActions(userRequest, policy);
    const hasTerminalNotify = terminalActions.some((a) => ['bark', 'email', 'sms'].includes(a));
    const hasNotifyAction =
      hasTerminalNotify ||
      (hasUncoveredAction && /(?:推送|通知|发送|发给|发信|bark)/i.test(userRequest));

    // 搜索/查询 + 总结 + 通知/推送
    if (hasSearch && hasSummarize && hasNotifyAction) {
      this.logger.log(`Matched Recipe: search_summarize_notify for request: "${userRequest}"`);
      return {
        recipeName: 'search_summarize_notify',
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
          { ref: 'n3', kind: 'skill', role: 'notify', dependsOn: ['n2'] },
        ],
        finalNodeRef: 'n3',
        requiresExternalData: true,
      };
    }

    // 搜索/查询 + 通知/推送 (如 天气查询 -> Bark推送)
    if (hasSearch && hasNotifyAction && !hasSummarize) {
      this.logger.log(`Matched Recipe: search_then_notify for request: "${userRequest}"`);
      return {
        recipeName: 'search_then_notify',
        objective: userRequest,
        steps: [
          { ref: 'n1', kind: 'skill', role: 'search', dependsOn: [] },
          { ref: 'n2', kind: 'skill', role: 'notify', dependsOn: ['n1'] },
        ],
        finalNodeRef: 'n2',
        requiresExternalData: true,
      };
    }

    // 网页抓取 + 总结 + 通知/推送
    if (hasWeb && hasSummarize && hasNotifyAction) {
      this.logger.log(`Matched Recipe: web_extract_summarize_notify for request: "${userRequest}"`);
      return {
        recipeName: 'web_extract_summarize_notify',
        objective: userRequest,
        steps: [
          { ref: 'n1', kind: 'skill', role: 'web_extract', dependsOn: [] },
          {
            ref: 'n2',
            kind: 'llm_operation',
            role: 'summarize',
            inputShape: 'text',
            dependsOn: ['n1'],
          },
          { ref: 'n3', kind: 'skill', role: 'notify', dependsOn: ['n2'] },
        ],
        finalNodeRef: 'n3',
        requiresExternalData: true,
      };
    }

    // 网页抓取 + 通知/推送
    if (hasWeb && hasNotifyAction && !hasSummarize) {
      this.logger.log(`Matched Recipe: web_extract_then_notify for request: "${userRequest}"`);
      return {
        recipeName: 'web_extract_then_notify',
        objective: userRequest,
        steps: [
          { ref: 'n1', kind: 'skill', role: 'web_extract', dependsOn: [] },
          { ref: 'n2', kind: 'skill', role: 'notify', dependsOn: ['n1'] },
        ],
        finalNodeRef: 'n2',
        requiresExternalData: true,
      };
    }

    // 网页获取 + 总结是高频且拓扑稳定的组合：使用固定 Recipe
    // 保留 Skill 执行的稳定性，同时避免单 Skill 只覆盖“打开”就宣告整体完成。
    if (hasWeb && hasSummarize) {
      this.logger.log(
        `Matched Recipe: web_extract_then_summarize for request: "${userRequest}"`
      );
      return {
        recipeName: 'web_extract_then_summarize',
        objective: userRequest,
        steps: [
          { ref: 'n1', kind: 'skill', role: 'web_extract', dependsOn: [] },
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

    // 模式 0：在已有可信结果之上做单次 LLM 变换或摘要。该 Recipe 跳过
    // Skill 匹配模型和拓扑模型，并由参数绑定器把不可变结果快照绑定到 content。
    if (
      context?.hasPreviousResult === true &&
      (hasGeneration || hasProcessing || hasSummarize) &&
      !hasWeb &&
      !hasSearch &&
      !hasMarkdownFile &&
      !hasDocumentExtract &&
      !hasPdfSplit &&
      !hasPdfMerge &&
      !hasPdfExport &&
      !hasUncoveredAction &&
      !/(?:https?:\/\/|www\.)[^\s]+/i.test(userRequest)
    ) {
      this.logger.log(`Matched Recipe: grounded_text_transform for request: "${userRequest}"`);
      return {
        recipeName: 'grounded_text_transform',
        objective: userRequest,
        steps: [
          {
            ref: 'n1',
            kind: 'llm_operation',
            role: hasSummarize ? 'summarize' : hasGeneration ? 'generate' : 'transform',
            inputShape: 'text',
            dependsOn: [],
          },
        ],
        finalNodeRef: 'n1',
        requiresExternalData: false,
      };
    }

    // 模式 1：文档/附件文本提取 + 摘要。提取与生成式处理保持为两个
    // 独立能力，支持 PDF/Word/PPTX/TXT 等文档提取器复用同一编排形态。
    if (hasSummarize && hasDocumentExtract) {
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

    if (hasDocumentExtract) {
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
    if (hasSummarize && hasMarkdownFile && !hasSearch) {
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

    // 模式 4：标准 LLM 文本生成/建议/见解/创作（纯文本无工具依赖）
    if (
      hasGeneration &&
      !hasWeb &&
      !hasSearch &&
      !hasMarkdownFile &&
      !hasDocumentExtract &&
      !hasPdfSplit &&
      !hasPdfMerge &&
      !hasPdfExport &&
      !hasUncoveredAction &&
      !/(?:https?:\/\/|www\.)[^\s]+/i.test(userRequest)
    ) {
      this.logger.log(`Matched Recipe: standard_text_generation for request: "${userRequest}"`);
      return {
        recipeName: 'standard_text_generation',
        objective: userRequest,
        steps: [
          {
            ref: 'n1',
            kind: 'llm_operation',
            role: 'generate',
            inputShape: 'text',
            dependsOn: [],
          },
        ],
        finalNodeRef: 'n1',
        requiresExternalData: false,
      };
    }

    return null;
  }
}
