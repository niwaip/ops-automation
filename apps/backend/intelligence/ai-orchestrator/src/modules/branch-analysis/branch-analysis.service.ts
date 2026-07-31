import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getBrowserWorkerUrl } from '../../config/service-endpoints';
import { ModelService } from '../model/model.service';
import {
  AnalyzeBranchConditionDto,
  AnalyzeBranchConditionResponseDto,
  BranchNextActionDto,
  BranchStepSpecDto,
} from './branch-analysis.dto';

interface BrowserInspectStateResponse {
  runtimeSessionId: string;
  pageUrl?: string;
  pageTitle?: string;
}

interface BrowserExecuteResponse {
  success?: boolean;
  message?: string;
  results?: Array<{
    status?: string;
    command?: string;
    text?: string;
    stdout?: string;
    data?: {
      text?: string;
    };
  }>;
}

interface BrowserPageContext {
  pageUrl?: string;
  pageTitle?: string;
  pageText?: string;
  buttons?: string[];
  headings?: string[];
  links?: string[];
}

@Injectable()
export class BranchAnalysisService {
  private readonly logger = new Logger(BranchAnalysisService.name);
  private readonly browserWorkerUrl = getBrowserWorkerUrl();

  constructor(private readonly modelService: ModelService) {}

  async analyzeBranchCondition(
    input: AnalyzeBranchConditionDto
  ): Promise<AnalyzeBranchConditionResponseDto> {
    const pageContext = await this.loadPageContext(input);
    const preferredModel = this.modelService.getPreferredDefaultModel({ mode: 'task' });

    if (!preferredModel) {
      const branchStepSpec = await this.stabilizeBranchStepSpec(
        input,
        this.buildFallbackSpec(input.userIntent, input.onMismatch, pageContext.pageText),
        pageContext.pageText
      );
      return {
        branchStepSpec,
        nextAction: this.buildFallbackNextAction(input.userIntent, pageContext.buttons),
        analysisSource: 'fallback',
        pageContext: {
          pageUrl: pageContext.pageUrl,
          pageTitle: pageContext.pageTitle,
        },
      };
    }

    try {
      const prompt = this.buildPrompt(input, pageContext);
      const result = await this.modelService.callModel(preferredModel.id, prompt);
      const parsed = this.parseBranchAnalysisPayload(result.content || '');
      const branchStepSpec = await this.stabilizeBranchStepSpec(
        input,
        this.normalizeSpec(parsed, input.userIntent, pageContext.pageText, input.onMismatch),
        pageContext.pageText
      );
      return {
        branchStepSpec,
        ...(this.normalizeNextAction(parsed.nextAction)
          ? { nextAction: this.normalizeNextAction(parsed.nextAction) }
          : {}),
        analysisSource: 'llm',
        pageContext: {
          pageUrl: pageContext.pageUrl,
          pageTitle: pageContext.pageTitle,
        },
      };
    } catch (error) {
      this.logger.warn(
        `Failed to analyze branch condition with model: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      const branchStepSpec = await this.stabilizeBranchStepSpec(
        input,
        this.buildFallbackSpec(input.userIntent, input.onMismatch, pageContext.pageText),
        pageContext.pageText
      );
      return {
        branchStepSpec,
        nextAction: this.buildFallbackNextAction(input.userIntent, pageContext.buttons),
        analysisSource: 'fallback',
        pageContext: {
          pageUrl: pageContext.pageUrl,
          pageTitle: pageContext.pageTitle,
        },
      };
    }
  }

  private async loadPageContext(input: AnalyzeBranchConditionDto): Promise<BrowserPageContext> {
    const fallbackPageContext: BrowserPageContext = {
      pageUrl: input.pageSignals?.currentPageUrl,
      pageTitle: input.pageSignals?.pageTitle,
      pageText: input.pageSignals?.pageText,
      buttons: input.pageSignals?.buttons || [],
      headings: input.pageSignals?.headings || [],
      links: input.pageSignals?.links || [],
    };
    const hasFallbackPageContext = Boolean(
      fallbackPageContext.pageUrl ||
      fallbackPageContext.pageTitle ||
      fallbackPageContext.pageText ||
      fallbackPageContext.buttons?.length ||
      fallbackPageContext.headings?.length ||
      fallbackPageContext.links?.length
    );

    // #region debug-point approvals-export-500:load-context
    this.reportDebugEvent('A', 'branch-analysis.service.ts:95', '[DEBUG] loadPageContext start', {
      runtimeSessionId: input.runtimeSessionId,
      browserWorkerUrl: this.browserWorkerUrl,
      hasPageSignals: Boolean(input.pageSignals),
      pageSignalUrl: input.pageSignals?.currentPageUrl,
    });
    // #endregion

    let inspectResponse;
    let readResponse;
    try {
      [inspectResponse, readResponse] = await Promise.all([
        axios.post<BrowserInspectStateResponse>(`${this.browserWorkerUrl}/browser/inspect-state`, {
          runtimeSessionId: input.runtimeSessionId,
          backend: 'cli',
        }),
        axios.post<BrowserExecuteResponse>(`${this.browserWorkerUrl}/browser/execute`, {
          runtimeSessionId: input.runtimeSessionId,
          backend: 'cli',
          commands: [
            {
              tool: 'read_page',
              params: {
                max_length: 4000,
              },
            },
          ],
        }),
      ]);
    } catch (error) {
      const axiosError = (error as any)?.response ? (error as any) : undefined;
      // #region debug-point approvals-export-500:load-context-failed
      this.reportDebugEvent(
        'B',
        'branch-analysis.service.ts:117',
        '[DEBUG] loadPageContext failed',
        {
          runtimeSessionId: input.runtimeSessionId,
          browserWorkerUrl: this.browserWorkerUrl,
          errorMessage: error instanceof Error ? error.message : 'unknown error',
          status: axiosError?.response?.status,
          responseData: axiosError?.response?.data,
          hasFallbackPageContext,
        }
      );
      // #endregion
      if (hasFallbackPageContext) {
        // #region debug-point approvals-export-500:load-context-fallback
        this.reportDebugEvent(
          'C',
          'branch-analysis.service.ts:132',
          '[DEBUG] loadPageContext fallback to pageSignals',
          {
            runtimeSessionId: input.runtimeSessionId,
            pageUrl: fallbackPageContext.pageUrl,
            hasPageText: Boolean(fallbackPageContext.pageText),
            buttonCount: fallbackPageContext.buttons?.length || 0,
            headingCount: fallbackPageContext.headings?.length || 0,
            linkCount: fallbackPageContext.links?.length || 0,
          }
        );
        // #endregion
        return fallbackPageContext;
      }
      throw error;
    }

    const rawText = readResponse.data.results?.[0];
    const pageSignals = input.pageSignals;
    return {
      pageUrl: pageSignals?.currentPageUrl || inspectResponse.data.pageUrl,
      pageTitle: pageSignals?.pageTitle || inspectResponse.data.pageTitle,
      pageText:
        pageSignals?.pageText ||
        (typeof rawText?.data?.text === 'string'
          ? rawText.data.text
          : typeof rawText?.text === 'string'
            ? rawText.text
            : rawText?.stdout),
      buttons: pageSignals?.buttons || [],
      headings: pageSignals?.headings || [],
      links: pageSignals?.links || [],
    };
  }

  // #region debug-point approvals-export-500:report-event
  private reportDebugEvent(
    hypothesisId: 'A' | 'B' | 'C' | 'D',
    location: string,
    msg: string,
    data: Record<string, unknown>
  ): void {
    const isContainerRuntime =
      process.env.DOCKER_ENV === 'true' ||
      process.env.NODE_ENV === 'production' ||
      process.env.BROWSER_WORKER_URL?.includes('browser-worker') ||
      process.env.CONTROL_PLANE_URL?.includes('control-plane');
    const debugServerUrl =
      process.env.DEBUG_SERVER_URL?.trim() ||
      (isContainerRuntime
        ? 'http://host.docker.internal:7777/event'
        : 'http://127.0.0.1:7777/event');

    void fetch(debugServerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'approvals-export-500',
        runId: 'pre-fix',
        hypothesisId,
        location,
        msg,
        data,
        ts: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion

  private buildPrompt(input: AnalyzeBranchConditionDto, pageContext: BrowserPageContext): string {
    return [
      '你是浏览器模板条件分歧助手。',
      '请基于用户意图和当前页面文本，输出一个适合浏览器模板的条件分歧规范。',
      '要求：',
      '1. 只返回 JSON，不要解释。',
      '2. readSelectors 提供 1-3 个 CSS 选择器候选，优先按钮、提示文案、状态文案。',
      '3. readMethod 只能是 innerText、textContent、value 之一。',
      '4. outputVar 使用英文驼峰命名。',
      '5. conditionFn 必须是形如 (ctx) => Boolean(...) 的可执行函数字符串，并读取 ctx[outputVar]。',
      '6. onMatch 只能是 continue 或 stop。',
      '7. onMismatch 使用用户传入值；如果缺失则默认 takeover。',
      '8. takeoverReason 和 description 用中文。',
      '9. 如果用户意图明确要求“条件满足后继续点击/承认/提交/执行下一步”，请返回 nextAction。',
      '10. nextAction 目前只允许 click；优先返回稳定 selector，否则返回可见按钮文本 text。',
      '',
      `userIntent: ${input.userIntent}`,
      `onMismatch: ${input.onMismatch || 'takeover'}`,
      `pageUrl: ${pageContext.pageUrl || ''}`,
      `pageTitle: ${pageContext.pageTitle || ''}`,
      `pageText: ${(pageContext.pageText || '').slice(0, 3000)}`,
      `buttons: ${(pageContext.buttons || []).join(' | ')}`,
      `headings: ${(pageContext.headings || []).join(' | ')}`,
      `links: ${(pageContext.links || []).join(' | ')}`,
      '',
      '返回格式：',
      '{"readSelectors":["body"],"readMethod":"innerText","outputVar":"pageState","conditionFn":"(ctx) => String(ctx.pageState || \'\').includes(\'成功\')","takeoverReason":"页面未满足预期条件，需要人工接管","onMismatch":"takeover","onMatch":"continue","description":"检查页面是否出现预期结果","nextAction":{"action":"click","text":"承認する (Approve)","description":"条件满足后点击承认按钮"}}',
    ].join('\n');
  }

  private parseBranchAnalysisPayload(content: string): Partial<BranchStepSpecDto> & {
    nextAction?: Partial<BranchNextActionDto> | null;
  } {
    const cleaned = content.replace(/```json|```/g, '').trim();
    const jsonCandidate = cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned;
    return JSON.parse(jsonCandidate) as Partial<BranchStepSpecDto> & {
      nextAction?: Partial<BranchNextActionDto> | null;
    };
  }

  private normalizeSpec(
    spec: Partial<BranchStepSpecDto>,
    userIntent: string,
    pageText?: string,
    onMismatchOverride?: BranchStepSpecDto['onMismatch']
  ): BranchStepSpecDto {
    const outputVar = this.normalizeOutputVar(spec.outputVar || 'pageState');
    const readSelectors = Array.isArray(spec.readSelectors)
      ? spec.readSelectors.filter(
          (value): value is string => typeof value === 'string' && value.trim().length > 0
        )
      : [];
    const onMismatch = onMismatchOverride || spec.onMismatch || 'takeover';
    const onMatch = spec.onMatch === 'stop' ? 'stop' : 'continue';
    const readMethod =
      spec.readMethod === 'value' || spec.readMethod === 'textContent'
        ? spec.readMethod
        : 'innerText';
    const defaultConditionFn = this.buildIntentAwareConditionFn(
      userIntent,
      pageText,
      outputVar,
      `(ctx) => String(ctx.${outputVar} || '').trim().length > 0`
    );

    return {
      readSelectors: readSelectors.length > 0 ? readSelectors.slice(0, 3) : ['body'],
      readMethod,
      outputVar,
      conditionFn: this.ensureConditionFn(
        spec.conditionFn,
        userIntent,
        pageText,
        outputVar,
        defaultConditionFn
      ),
      takeoverReason: (spec.takeoverReason || '页面未满足预期条件，需要人工接管').trim(),
      onMismatch,
      onMatch,
      description: (spec.description || '检查页面是否满足预期条件').trim(),
    };
  }

  private buildFallbackSpec(
    userIntent: string,
    onMismatch: BranchStepSpecDto['onMismatch'] = 'takeover',
    pageText?: string
  ): BranchStepSpecDto {
    const normalizedIntent = userIntent.trim() || '检查页面状态';
    const outputVar = this.normalizeOutputVar(this.extractOutputVar(userIntent, pageText));
    const keyword = this.pickIntentKeyword(userIntent, pageText);
    const quotedKeyword = JSON.stringify(keyword);

    return {
      readSelectors: this.pickFallbackSelectors(userIntent, pageText),
      readMethod: 'innerText',
      outputVar,
      conditionFn: keyword
        ? `(ctx) => String(ctx.${outputVar} || '').includes(${quotedKeyword})`
        : `(ctx) => String(ctx.${outputVar} || '').trim().length > 0`,
      takeoverReason: `${normalizedIntent}未满足，需要人工接管`,
      onMismatch,
      onMatch: 'continue',
      description: normalizedIntent,
    };
  }

  private normalizeNextAction(
    nextAction?: Partial<BranchNextActionDto> | null
  ): BranchNextActionDto | undefined {
    if (!nextAction || nextAction.action !== 'click') {
      return undefined;
    }
    const selector =
      typeof nextAction.selector === 'string' && nextAction.selector.trim()
        ? nextAction.selector.trim()
        : undefined;
    const text =
      typeof nextAction.text === 'string' && nextAction.text.trim()
        ? nextAction.text.trim()
        : undefined;
    if (!selector && !text) {
      return undefined;
    }
    return {
      action: 'click',
      ...(selector ? { selector } : {}),
      ...(text ? { text } : {}),
      description: (nextAction.description || '条件满足后执行下一步动作').trim(),
    };
  }

  private buildFallbackNextAction(
    userIntent: string,
    buttons?: string[]
  ): BranchNextActionDto | undefined {
    const normalizedIntent = userIntent.trim();
    if (
      !/(直接执行|自动执行|直接承认|自动承认|自动审批|自动批准|点击|继续执行|approve|承認する|提交|确认)/i.test(
        normalizedIntent
      )
    ) {
      return undefined;
    }

    const buttonCandidates = buttons || [];
    const matchedText = buttonCandidates.find((button) =>
      /(承認|Approve|提交|确认|保存|继续|下一步|执行)/i.test(button)
    );

    if (!matchedText) {
      return undefined;
    }

    return {
      action: 'click',
      text: matchedText,
      description: `条件满足后点击${matchedText}`,
    };
  }

  private ensureConditionFn(
    conditionFn: string | undefined,
    userIntent: string,
    pageText: string | undefined,
    outputVar: string,
    fallback: string
  ): string {
    const normalized = conditionFn?.trim();
    if (!normalized) {
      return fallback;
    }
    if (
      !/^\(?\s*ctx\s*\)?\s*=>/.test(normalized) &&
      !/^function\s*\(\s*ctx\s*\)/.test(normalized)
    ) {
      return fallback;
    }
    if (
      !normalized.includes(outputVar) &&
      !normalized.includes(`ctx['${outputVar}']`) &&
      !normalized.includes(`ctx["${outputVar}"]`)
    ) {
      return fallback;
    }
    return this.buildIntentAwareConditionFn(userIntent, pageText, outputVar, fallback, normalized);
  }

  private normalizeOutputVar(value: string): string {
    const cleaned = value.replace(/[^a-zA-Z0-9_$]+/g, ' ').trim();
    if (!cleaned) {
      return 'pageState';
    }

    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
      const [singleWord] = words;
      if (!singleWord) {
        return 'pageState';
      }
      const normalized = `${singleWord.charAt(0).toLowerCase()}${singleWord.slice(1)}`;
      return /^[a-zA-Z_$]/.test(normalized)
        ? normalized
        : `page${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
    }

    const camel = words
      .map((word, index) => {
        const normalized = word.replace(/[^a-zA-Z0-9_$]/g, '');
        if (!normalized) {
          return '';
        }
        return index === 0
          ? `${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`
          : `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
      })
      .join('');

    if (!camel) {
      return 'pageState';
    }

    return /^[a-zA-Z_$]/.test(camel)
      ? camel
      : `page${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
  }

  private extractOutputVar(userIntent: string, pageText?: string): string {
    const source = `${userIntent} ${pageText || ''}`;
    if (/毛利率|粗利率|gross margin|margin rate/i.test(source)) {
      return 'grossMarginRaw';
    }
    if (/库存|stock/i.test(source)) {
      return 'stockStatus';
    }
    if (/登录|login|signin/i.test(source)) {
      return 'loginState';
    }
    if (/验证码|otp|verification/i.test(source)) {
      return 'verificationState';
    }
    if (/结果|success|成功/i.test(source)) {
      return 'resultState';
    }
    return 'pageState';
  }

  private buildIntentAwareConditionFn(
    userIntent: string,
    pageText: string | undefined,
    outputVar: string,
    fallback: string,
    currentCondition?: string
  ): string {
    const threshold = this.extractThresholdRule(userIntent);
    if (!threshold) {
      return currentCondition?.trim() || fallback;
    }

    const numericCondition = `(ctx) => { const value = Number(String(ctx.${outputVar} || '').replace(/[^0-9.-]+/g, '')); return Number.isFinite(value) && value ${threshold.operator} ${threshold.value}; }`;
    const normalizedCurrent = currentCondition?.trim() || '';
    if (!normalizedCurrent) {
      return numericCondition;
    }

    if (/trim\(\)\.length/.test(normalizedCurrent)) {
      return numericCondition;
    }
    if (!normalizedCurrent.includes(String(threshold.value))) {
      return numericCondition;
    }

    const source = `${userIntent} ${pageText || ''}`;
    if (/毛利率|粗利率|percentage|percent|率|阈值|以上|以下|大于|小于|低于|高于/i.test(source)) {
      return numericCondition;
    }
    return normalizedCurrent;
  }

  private extractThresholdRule(
    userIntent: string
  ): { operator: '>' | '>=' | '<' | '<='; value: number } | undefined {
    const normalized = userIntent.replace(/\s+/g, '');
    const match = normalized.match(/(\d+(?:\.\d+)?)(?:%|％)?/);
    if (!match?.[1]) {
      return undefined;
    }
    const value = Number(match[1]);
    if (!Number.isFinite(value)) {
      return undefined;
    }

    if (/(大于等于|不低于|不少于|至少|以上|>=|≥)/.test(normalized)) {
      return { operator: '>=', value };
    }
    if (/(小于等于|不高于|不超过|至多|以下|<=|≤)/.test(normalized)) {
      return { operator: '<=', value };
    }
    if (/(大于|高于|超过|morethan|greaterthan|>)/i.test(normalized)) {
      return { operator: '>', value };
    }
    if (/(小于|低于|少于|lessthan|<)/i.test(normalized)) {
      return { operator: '<', value };
    }

    return undefined;
  }

  private pickIntentKeyword(userIntent: string, pageText?: string): string {
    const quoted = userIntent.match(/[“"](.*?)[”"]/);
    if (quoted?.[1]?.trim()) {
      return quoted[1].trim();
    }

    const pageLines = (pageText || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const keyword = pageLines.find(
      (line) =>
        line.length >= 2 &&
        line.length <= 24 &&
        (userIntent.includes(line) ||
          /成功|失败|异常|已完成|未完成|登录|验证码|下一步|提交|确认/.test(line))
    );
    return keyword || '';
  }

  private pickFallbackSelectors(userIntent: string, pageText?: string): string[] {
    const selectors = ['body'];
    const source = `${userIntent} ${pageText || ''}`;
    if (/验证码|otp|verification/i.test(source)) {
      selectors.unshift('input', '[name*=code i]');
    } else if (/登录|login|signin/i.test(source)) {
      selectors.unshift('body', 'form');
    } else if (/弹窗|modal|dialog/i.test(source)) {
      selectors.unshift('[role="dialog"]', '.modal');
    } else if (/结果|成功|失败|状态|提示/i.test(source)) {
      selectors.unshift('.result', '.status');
    }
    return [...new Set(selectors)].slice(0, 3);
  }

  private async stabilizeBranchStepSpec(
    input: AnalyzeBranchConditionDto,
    spec: BranchStepSpecDto,
    pageText?: string
  ): Promise<BranchStepSpecDto> {
    const selectorCandidates = this.buildSelectorProbeCandidates(
      spec.readSelectors,
      input.userIntent,
      pageText
    );
    if (!selectorCandidates.length) {
      return spec;
    }

    const probeScores = await this.probeSelectorCandidates(
      input.runtimeSessionId,
      selectorCandidates
    );
    if (!probeScores.size) {
      return {
        ...spec,
        readSelectors: selectorCandidates.slice(0, 3),
      };
    }

    const orderedSelectors = selectorCandidates
      .map((selector, index) => ({
        selector,
        index,
        score: this.computeSelectorPriority(selector, probeScores.get(selector) || 0),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.index - right.index;
      })
      .map((entry) => entry.selector);

    return {
      ...spec,
      readSelectors: orderedSelectors.slice(0, 3),
    };
  }

  private buildSelectorProbeCandidates(
    selectors: string[],
    userIntent: string,
    pageText?: string
  ): string[] {
    const candidates = selectors.filter(
      (value) =>
        typeof value === 'string' && value.trim().length > 0 && !value.includes(':nth-match(')
    );
    const source = `${userIntent} ${pageText || ''}`;
    if (
      /(状态|status|审批|批准|承认|承認|approve|pending|approved|保留中|承認済み|却下済み)/i.test(
        source
      )
    ) {
      candidates.push(
        '[id*="status" i]',
        '[data-status]',
        '[data-field*="status" i]',
        '[data-ai-field*="status" i]',
        '[class*="status" i]',
        '.badge'
      );
    }
    candidates.push('body');
    return [...new Set(candidates.map((value) => value.trim()).filter(Boolean))];
  }

  private async probeSelectorCandidates(
    runtimeSessionId: string,
    selectors: string[]
  ): Promise<Map<string, number>> {
    if (!runtimeSessionId || !selectors.length) {
      return new Map();
    }

    try {
      const response = await axios.post<BrowserExecuteResponse>(
        `${this.browserWorkerUrl}/browser/execute`,
        {
          runtimeSessionId,
          backend: 'cli',
          commands: selectors.map((selector) => ({
            tool: 'read_page',
            params: {
              selector,
              max_length: /^(body|html)$/i.test(selector) ? 12000 : 2000,
            },
          })),
        }
      );
      const results = response.data.results || [];
      return new Map(
        selectors.map((selector, index) => {
          const text = this.extractBrowserReadText(results[index]);
          return [selector, text.trim().length];
        })
      );
    } catch (error) {
      this.logger.warn(
        `Failed to probe branch selectors: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      return new Map();
    }
  }

  private extractBrowserReadText(
    result?: NonNullable<BrowserExecuteResponse['results']>[number]
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
    if (match?.[1]) {
      try {
        return JSON.parse(`"${match[1]}"`) as string;
      } catch {
        return match[1];
      }
    }
    return raw;
  }

  private computeSelectorPriority(selector: string, textLength: number): number {
    const trimmed = selector.trim();
    let score = textLength > 0 ? 1000 : 0;
    if (/^(body|html)$/i.test(trimmed)) {
      score -= 100;
    }
    if (trimmed.startsWith('#')) {
      score += 80;
    } else if (/^\[data-/i.test(trimmed)) {
      score += 60;
    } else if (trimmed.startsWith('.')) {
      score += 40;
    }
    if (/(status|badge|result|alert|message)/i.test(trimmed)) {
      score += 30;
    }
    if (textLength > 0 && textLength <= 64) {
      score += 20;
    }
    return score;
  }
}
