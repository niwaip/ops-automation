import { Injectable, Logger } from '@nestjs/common';
import { BranchAnalysisService } from '../branch-analysis/branch-analysis.service';
import type {
  AnalyzeBranchConditionResponseDto,
  BranchNextActionDto,
} from '../branch-analysis/branch-analysis.dto';
import type { BrowserCommand, BrowserCommandCandidate } from './browser-command.types';

interface ObservationLike {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  buttons: Array<Record<string, unknown>>;
  headings: string[];
  links: string[];
  candidates?: BrowserCommandCandidate[];
}

interface BrowserExecuteResponseLike {
  success: boolean;
  results?: Array<{
    command?: string;
    text?: string;
    stdout?: string;
    data?: {
      text?: string;
    };
  }>;
}

export interface ConditionalBranchPlan {
  branchAnalysis: AnalyzeBranchConditionResponseDto;
  branchValue: string;
  matched: boolean | null;
  command?: BrowserCommand;
}

@Injectable()
export class RecorderConditionalBranchService {
  private readonly logger = new Logger(RecorderConditionalBranchService.name);

  constructor(private readonly branchAnalysisService: BranchAnalysisService) {}

  async plan(input: {
    runtimeSessionId: string;
    currentPageUrl?: string;
    effectiveMessage: string;
    observation: ObservationLike;
    executeBrowserCommands: (
      commands: BrowserCommand[],
      options?: { timeoutMs?: number; skipValidation?: boolean }
    ) => Promise<BrowserExecuteResponseLike>;
  }): Promise<ConditionalBranchPlan> {
    const branchAnalysis = await this.branchAnalysisService.analyzeBranchCondition({
      runtimeSessionId: input.runtimeSessionId,
      userIntent: input.effectiveMessage,
      onMismatch: 'takeover',
      pageSignals: {
        buttons: input.observation.buttons
          .map((button) => (typeof button.text === 'string' ? button.text.trim() : ''))
          .filter(Boolean),
        headings: input.observation.headings,
        links: input.observation.links,
        currentPageUrl: input.observation.currentPageUrl || input.currentPageUrl,
        pageTitle: input.observation.title,
        pageText: input.observation.text,
      },
    });

    const branchValue = await this.readBranchValue({
      branchAnalysis,
      observation: input.observation,
      userIntent: input.effectiveMessage,
      executeBrowserCommands: input.executeBrowserCommands,
    });
    const matched = this.evaluateBranchCondition(
      branchAnalysis.branchStepSpec.conditionFn,
      branchAnalysis.branchStepSpec.outputVar,
      branchValue
    );
    const command =
      matched === true
        ? this.buildCommandFromNextAction(branchAnalysis.nextAction, input.observation)
        : undefined;

    return {
      branchAnalysis,
      branchValue,
      matched,
      ...(command ? { command } : {}),
    };
  }

  private async readBranchValue(input: {
    branchAnalysis: AnalyzeBranchConditionResponseDto;
    observation: ObservationLike;
    userIntent: string;
    executeBrowserCommands: (
      commands: BrowserCommand[],
      options?: { timeoutMs?: number; skipValidation?: boolean }
    ) => Promise<BrowserExecuteResponseLike>;
  }): Promise<string> {
    const selectors = this.resolveReadSelectors(input);

    for (const selector of selectors) {
      const trimmedSelector = selector.trim();
      if (!trimmedSelector) {
        continue;
      }
      if (/^(body|html)$/i.test(trimmedSelector) && input.observation.text?.trim()) {
        return input.observation.text.trim();
      }

      try {
        const response = await input.executeBrowserCommands(
          [
            {
              tool: 'read_page',
              params: {
                selector: trimmedSelector,
                method: input.branchAnalysis.branchStepSpec.readMethod,
                max_length: /^(body|html)$/i.test(trimmedSelector) ? 12000 : 2000,
              },
              description: `读取条件值：${input.branchAnalysis.branchStepSpec.description}`,
            },
          ],
          {
            timeoutMs: 15000,
            skipValidation: true,
          }
        );
        const extracted = this.extractReadText(response.results?.[0]);
        if (extracted.trim()) {
          return extracted.trim();
        }
      } catch (error) {
        this.logger.warn(
          `Failed to read conditional branch value from "${trimmedSelector}": ${
            error instanceof Error ? error.message : 'unknown error'
          }`
        );
      }
    }

    return input.observation.text?.trim() || '';
  }

  private resolveReadSelectors(input: {
    branchAnalysis: AnalyzeBranchConditionResponseDto;
    observation: ObservationLike;
    userIntent: string;
  }): string[] {
    const selectors: string[] = [];
    const candidateSelector = this.resolveCandidateReadSelector(input);
    if (candidateSelector) {
      selectors.push(candidateSelector);
    }

    for (const selector of input.branchAnalysis.branchStepSpec.readSelectors) {
      if (typeof selector !== 'string' || !selector.trim()) {
        continue;
      }
      if (!selectors.includes(selector.trim())) {
        selectors.push(selector.trim());
      }
    }

    if (!selectors.some((selector) => /^(body|html)$/i.test(selector))) {
      selectors.push('body');
    }
    return selectors;
  }

  private resolveCandidateReadSelector(input: {
    branchAnalysis: AnalyzeBranchConditionResponseDto;
    observation: ObservationLike;
    userIntent: string;
  }): string | undefined {
    const hints = [
      input.userIntent,
      input.branchAnalysis.branchStepSpec.description,
      input.branchAnalysis.branchStepSpec.outputVar,
      ...input.branchAnalysis.branchStepSpec.readSelectors,
    ]
      .map((value) => this.normalize(value))
      .filter(Boolean);

    const scoredCandidates = (input.observation.candidates || [])
      .filter((candidate) => candidate.kind === 'field')
      .map((candidate) => ({
        candidate,
        selector: this.buildReadSelectorFromCandidate(candidate),
        score: this.scoreReadCandidate(candidate, hints),
      }))
      .filter((entry) => entry.selector && entry.score > 0)
      .sort((left, right) => right.score - left.score);

    return scoredCandidates[0]?.selector;
  }

  private buildReadSelectorFromCandidate(candidate: BrowserCommandCandidate): string | undefined {
    if (candidate.preferredLocator?.type === 'testid' && candidate.preferredLocator.value.trim()) {
      return `[data-testid="${candidate.preferredLocator.value.trim()}"]`;
    }
    if (candidate.dataTestId?.trim()) {
      return `[data-testid="${candidate.dataTestId.trim()}"]`;
    }
    if (candidate.elementId?.trim()) {
      return `#${candidate.elementId.trim()}`;
    }
    if (candidate.preferredLocator?.type === 'css' && candidate.preferredLocator.value.trim()) {
      return candidate.preferredLocator.value.trim();
    }
    return undefined;
  }

  private scoreReadCandidate(candidate: BrowserCommandCandidate, hints: string[]): number {
    const values = [
      candidate.field,
      candidate.label,
      candidate.text,
      candidate.summary,
      candidate.elementId,
      candidate.dataTestId,
      candidate.preferredLocator?.value,
    ].map((value) => this.normalize(value));
    let score = candidate.kind === 'field' ? 20 : 0;

    for (const hint of hints) {
      if (!hint) {
        continue;
      }
      if (this.matchesGrossMarginFamily(candidate, hint)) {
        score += 220;
        continue;
      }
      if (
        values.some(
          (value) =>
            value.length > 0 &&
            (value.includes(hint) || hint.includes(value))
        )
      ) {
        score += 60;
      }
    }

    if (candidate.preferredLocator?.type === 'testid') {
      score += 20;
    } else if (candidate.elementId || candidate.dataTestId) {
      score += 10;
    }

    return score;
  }

  private matchesGrossMarginFamily(candidate: BrowserCommandCandidate, hint: string): boolean {
    const grossMarginHint = /(gross.?margin|profit.?margin|毛利率|粗利率)/i;
    if (!grossMarginHint.test(hint)) {
      return false;
    }
    return [
      candidate.field,
      candidate.label,
      candidate.text,
      candidate.summary,
      candidate.elementId,
      candidate.dataTestId,
      candidate.preferredLocator?.value,
    ]
      .map((value) => this.normalize(value))
      .some((value) => /(gross.?margin|profit.?margin|毛利率|粗利率)/i.test(value));
  }

  private extractReadText(
    result?: NonNullable<BrowserExecuteResponseLike['results']>[number]
  ): string {
    const raw =
      typeof result?.data?.text === 'string'
        ? result.data.text
        : typeof result?.text === 'string'
          ? result.text
          : typeof result?.stdout === 'string'
            ? result.stdout
            : '';
    const match = raw.match(/^### Result\s+"([\s\S]*?)"\s*### Ran Playwright code/m);
    if (!match?.[1]) {
      return raw;
    }
    try {
      return JSON.parse(`"${match[1]}"`) as string;
    } catch {
      return match[1];
    }
  }

  private evaluateBranchCondition(
    conditionFn: string | undefined,
    outputVar: string | undefined,
    branchValue: string
  ): boolean | null {
    const normalizedCondition = conditionFn?.trim();
    const normalizedOutputVar = outputVar?.trim();
    if (!normalizedCondition || !normalizedOutputVar) {
      return null;
    }

    try {
      const evaluator = new Function(`return (${normalizedCondition});`)() as (
        ctx: Record<string, unknown>
      ) => unknown;
      return Boolean(evaluator({ [normalizedOutputVar]: branchValue }));
    } catch (error) {
      this.logger.warn(
        `Failed to evaluate branch condition: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      return null;
    }
  }

  private buildCommandFromNextAction(
    nextAction: BranchNextActionDto | undefined,
    observation: ObservationLike
  ): BrowserCommand | undefined {
    if (nextAction?.action !== 'click') {
      return undefined;
    }

    const matchedCandidate = this.findMatchingCandidate(nextAction, observation.candidates || []);
    if (matchedCandidate?.ref) {
      return {
        tool: 'click',
        params: {
          target: matchedCandidate.ref,
          ...(nextAction.text ? { text: nextAction.text } : {}),
        },
        description: nextAction.description,
        locator: {
          strategy: 'ref',
          value: matchedCandidate.ref,
          matchedCandidateId: matchedCandidate.candidateId,
          resolutionMode: 'conditional_branch_next_action',
        },
      };
    }

    if (nextAction.selector) {
      return {
        tool: 'click',
        params: {
          target: nextAction.selector,
        },
        description: nextAction.description,
      };
    }

    if (nextAction.text) {
      return {
        tool: 'click',
        params: {
          text: nextAction.text,
        },
        description: nextAction.description,
      };
    }

    return undefined;
  }

  private findMatchingCandidate(
    nextAction: BranchNextActionDto,
    candidates: BrowserCommandCandidate[]
  ): BrowserCommandCandidate | undefined {
    const targetText = this.normalize(nextAction.text);
    const targetSelector = this.normalize(nextAction.selector);

    const scoredCandidates = candidates
      .filter((candidate) => candidate.kind === 'action')
      .map((candidate) => ({
        candidate,
        score: this.scoreCandidate(candidate, targetText, targetSelector),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score);

    return scoredCandidates[0]?.candidate;
  }

  private scoreCandidate(
    candidate: BrowserCommandCandidate,
    targetText: string,
    targetSelector: string
  ): number {
    const values = [
      candidate.ref,
      candidate.label,
      candidate.text,
      candidate.action,
      candidate.summary,
      candidate.stableName,
      candidate.preferredLocator?.value,
    ].map((value) => this.normalize(value));
    let score = 0;

    if (targetSelector) {
      if (values.includes(targetSelector)) {
        score += 200;
      }
      if (candidate.ref && this.normalize(candidate.ref) === targetSelector) {
        score += 100;
      }
    }

    if (targetText) {
      if (values.includes(targetText)) {
        score += 160;
      }
      if (
        values.some(
          (value) =>
            value.length > 0 &&
            (value.includes(targetText) || targetText.includes(value) || this.isActionAliasMatch(value, targetText))
        )
      ) {
        score += 80;
      }
    }

    if (candidate.ref) {
      score += 20;
    }
    if (candidate.preferredLocator?.type === 'ref') {
      score += 10;
    }
    return score;
  }

  private isActionAliasMatch(value: string, targetText: string): boolean {
    const approvePattern = /(approve|承认|承認|承認する)/i;
    const rejectPattern = /(reject|却下|否决|驳回)/i;
    return (
      (approvePattern.test(value) && approvePattern.test(targetText)) ||
      (rejectPattern.test(value) && rejectPattern.test(targetText))
    );
  }

  private normalize(value: unknown): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }
}
