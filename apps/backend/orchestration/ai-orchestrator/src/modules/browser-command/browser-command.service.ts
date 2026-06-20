import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserExecutionPlannerService } from './browser-execution-planner.service';
import type {
  BrowserCommand,
  BrowserCommandCandidate,
  BrowserCommandCandidateLocator,
  BrowserCommandContext,
  BrowserPlanResponse,
  BrowserPlanStep,
  ParseBrowserCommandRequest,
  ParseBrowserCommandResponse,
} from './browser-command.types';
import {
  buildPendingClickIntent,
  inferSemanticHint,
  normalizePendingRoleHint,
  normalizePendingSemanticHint,
  type PendingActionIntent,
  type PendingActionIntentSource,
} from './action-intent.builder';
import {
  resolveActionIntentToLocator,
} from './action-target-resolver.service';
import { buildClickCommandFromResolvedTarget } from './click-command.factory';
export type {
  BrowserCommand,
  BrowserCommandCandidate,
  BrowserCommandCandidateLocator,
  BrowserCommandContext,
  BrowserCommandFailureContext,
  BrowserPlanAction,
  BrowserPlanResponse,
  BrowserPlanStep,
  ParseBrowserCommandRequest,
  ParseBrowserCommandResponse,
} from './browser-command.types';

interface ParsedCandidateHint {
  raw: string;
  candidateId?: string;
  ref?: string;
  row?: number;
  kind?: string;
  action?: string;
  stable?: string;
  label?: string;
  field?: string;
  region?: string;
  rowKey?: string;
  rowText?: string;
  text?: string;
  role?: string;
  elementId?: string;
  dataTestId?: string;
  preferredLocator?: BrowserCommandCandidateLocator;
}

export interface WebsiteConfig {
  name: string;
  url: string;
  aliases?: string[];
}

// Data directory for persistence
const DATA_DIR = process.env.AI_MODELS_DATA_DIR || '/app/data';
const WEBSITES_FILE = path.join(DATA_DIR, 'custom-websites.json');

// Common URL patterns
const URL_PATTERNS: Record<string, string> = {
  百度: 'https://www.baidu.com',
  百度首页: 'https://www.baidu.com',
  baidu: 'https://www.baidu.com',
  谷歌: 'https://www.google.com',
  google: 'https://www.google.com',
  必应: 'https://www.bing.com',
  bing: 'https://www.bing.com',
  github: 'https://github.com',
  淘宝: 'https://www.taobao.com',
  taobao: 'https://www.taobao.com',
  京东: 'https://www.jd.com',
  jd: 'https://www.jd.com',
};

@Injectable()
export class BrowserCommandService {
  private readonly logger = new Logger(BrowserCommandService.name);
  private customWebsites: Map<string, WebsiteConfig> = new Map();

  constructor(private readonly browserExecutionPlannerService: BrowserExecutionPlannerService) {
    this.loadCustomWebsites();
  }

  private loadCustomWebsites(): void {
    try {
      if (fs.existsSync(WEBSITES_FILE)) {
        const data = fs.readFileSync(WEBSITES_FILE, 'utf-8');
        const websites: WebsiteConfig[] = JSON.parse(data);
        for (const site of websites) {
          this.customWebsites.set(site.name.toLowerCase(), site);
          if (site.aliases) {
            for (const alias of site.aliases) {
              this.customWebsites.set(alias.toLowerCase(), site);
            }
          }
        }
        this.logger.log(`Loaded ${websites.length} custom websites`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to load custom websites: ${errorMsg}`);
    }
  }

  private saveCustomWebsites(): void {
    try {
      const websites: WebsiteConfig[] = [];
      const seen = new Set<string>();
      for (const [_, config] of this.customWebsites) {
        if (!seen.has(config.name)) {
          websites.push(config);
          seen.add(config.name);
        }
      }
      fs.writeFileSync(WEBSITES_FILE, JSON.stringify(websites, null, 2));
      this.logger.log(`Saved ${websites.length} custom websites`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to save custom websites: ${errorMsg}`);
    }
  }

  addWebsite(config: WebsiteConfig): void {
    this.customWebsites.set(config.name.toLowerCase(), config);
    if (config.aliases) {
      for (const alias of config.aliases) {
        this.customWebsites.set(alias.toLowerCase(), config);
      }
    }
    this.saveCustomWebsites();
  }

  removeWebsite(name: string): boolean {
    const config = this.customWebsites.get(name.toLowerCase());
    if (config) {
      this.customWebsites.delete(name.toLowerCase());
      if (config.aliases) {
        for (const alias of config.aliases) {
          this.customWebsites.delete(alias.toLowerCase());
        }
      }
      this.saveCustomWebsites();
      return true;
    }
    return false;
  }

  listWebsites(): WebsiteConfig[] {
    const seen = new Set<string>();
    const result: WebsiteConfig[] = [];
    for (const [_, config] of this.customWebsites) {
      if (!seen.has(config.name)) {
        result.push(config);
        seen.add(config.name);
      }
    }
    return result;
  }

  getUrlPatterns(): Record<string, string> {
    // Merge default and custom URL patterns
    const result: Record<string, string> = { ...URL_PATTERNS };
    for (const [_, config] of this.customWebsites) {
      result[config.name] = config.url;
    }
    return result;
  }

  async parseCommand(request: ParseBrowserCommandRequest): Promise<ParseBrowserCommandResponse> {
    const { input } = request;
    this.logger.log(`Parsing browser command: ${input}`);

    const commandContext = this.normalizeContext(request.context);
    if (commandContext.forceAI) {
      const aiPlanResult = await this.parseWithAIPlan(input, commandContext);
      if (aiPlanResult) {
        return aiPlanResult;
      }
      return await this.parseWithAI(input, commandContext);
    }

    const loginResult = this.parseLoginCommand(input, commandContext);
    if (loginResult) {
      return loginResult;
    }

    const candidateReadResult = this.parseCandidateReadIntent(input, commandContext);
    if (candidateReadResult) {
      return candidateReadResult;
    }

    if (this.shouldPreferAIForCandidateScopedIntent(input, commandContext)) {
      const aiPlanResult = await this.parseWithAIPlan(input, commandContext);
      if (aiPlanResult) {
        return aiPlanResult;
      }
    }

    const candidateScopedResult = this.parseCandidateScopedAction(input, commandContext);
    if (candidateScopedResult) {
      return candidateScopedResult;
    }

    const contextResult = this.parseWithCommandContext(input, commandContext);
    if (contextResult) {
      return contextResult;
    }

    const aiPlanResult = await this.parseWithAIPlan(input, commandContext);
    if (aiPlanResult) {
      return aiPlanResult;
    }

    const sequentialResult = this.parseSequentialCommands(input);
    if (sequentialResult) {
      return sequentialResult;
    }

    // Try to parse using pattern matching first
    const patternResult = this.parseWithPatterns(input, commandContext);
    if (patternResult) {
      return patternResult;
    }

    // If no pattern match, try using AI model
    try {
      return await this.parseWithAI(input, commandContext);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to parse with AI: ${errorMsg}`);
      return {
        success: false,
        commands: [],
        explanation: `无法解析命令: ${input}`,
      };
    }
  }

  private normalizeContext(context?: Record<string, unknown>): BrowserCommandContext {
    if (!context) {
      return {};
    }

    const availableInputs = Array.isArray(context.availableInputs)
      ? context.availableInputs.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : undefined;
    const availableButtons = Array.isArray(context.availableButtons)
      ? context.availableButtons.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : undefined;
    const availableCandidates = this.normalizeAvailableCandidates(context.availableCandidates);
    const rawFailureContext =
      context.lastFailureContext &&
      typeof context.lastFailureContext === 'object' &&
      !Array.isArray(context.lastFailureContext)
        ? (context.lastFailureContext as Record<string, unknown>)
        : undefined;

    return {
      forceAI: typeof context.forceAI === 'boolean' ? context.forceAI : undefined,
      commandType: typeof context.commandType === 'string' ? context.commandType : undefined,
      currentPageUrl:
        typeof context.currentPageUrl === 'string' ? context.currentPageUrl : undefined,
      backend: typeof context.backend === 'string' ? context.backend : undefined,
      lastObservationText:
        typeof context.lastObservationText === 'string' ? context.lastObservationText : undefined,
      availableInputs,
      availableButtons,
      availableCandidates,
      controlHints: Array.isArray(context.controlHints)
        ? context.controlHints.filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0
          )
        : undefined,
      lastFailureContext: rawFailureContext
        ? {
            lastAction:
              rawFailureContext.lastAction &&
              typeof rawFailureContext.lastAction === 'object' &&
              !Array.isArray(rawFailureContext.lastAction)
                ? (rawFailureContext.lastAction as Record<string, unknown>)
                : {},
            errorMessage:
              typeof rawFailureContext.errorMessage === 'string'
                ? rawFailureContext.errorMessage
                : '',
            errorType:
              typeof rawFailureContext.errorType === 'string'
                ? rawFailureContext.errorType
                : undefined,
            retryable:
              typeof rawFailureContext.retryable === 'boolean'
                ? rawFailureContext.retryable
                : undefined,
            failedStepIndex:
              typeof rawFailureContext.failedStepIndex === 'number'
                ? rawFailureContext.failedStepIndex
                : undefined,
          }
        : undefined,
    };
  }

  private normalizeAvailableCandidates(value: unknown): BrowserCommandCandidate[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const candidates = value
      .map((item, index) => this.normalizeCandidate(item, index))
      .filter((item): item is BrowserCommandCandidate => Boolean(item));

    return candidates.length > 0 ? candidates : undefined;
  }

  private normalizeCandidate(item: unknown, index: number): BrowserCommandCandidate | null {
    if (typeof item === 'string') {
      const parsed = this.parseStructuredCandidateHint(item);
      if (!parsed) {
        return null;
      }
      return {
        candidateId: parsed.candidateId || `candidate_${index + 1}`,
        kind: (parsed.kind as BrowserCommandCandidate['kind']) || 'action',
        label: parsed.label || parsed.text || parsed.field || parsed.action || parsed.raw,
        summary: parsed.raw,
        source: 'probe',
        ref: parsed.ref,
        role: parsed.role,
        elementId: parsed.elementId,
        dataTestId: parsed.dataTestId,
        text: parsed.text,
        action: parsed.action,
        field: parsed.field,
        stableName: parsed.stable,
        row: {
          index: parsed.row,
          key: parsed.rowKey,
          text: parsed.rowText,
        },
        region: {
          name: parsed.region,
        },
        preferredLocator:
          parsed.preferredLocator || (parsed.ref ? { type: 'ref', value: parsed.ref } : undefined),
      };
    }

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }

    const record = item as Record<string, unknown>;
    const candidateId =
      typeof record.candidateId === 'string' && record.candidateId.trim()
        ? record.candidateId.trim()
        : `candidate_${index + 1}`;
    const kind = typeof record.kind === 'string' ? record.kind : 'action';
    const label =
      typeof record.label === 'string' && record.label.trim() ? record.label.trim() : candidateId;
    const summary =
      typeof record.summary === 'string' && record.summary.trim() ? record.summary.trim() : label;
    const source = typeof record.source === 'string' ? record.source : 'probe';
    const preferredLocator = this.normalizePreferredLocator(record.preferredLocator);

    return {
      candidateId,
      kind: (kind as BrowserCommandCandidate['kind']) || 'action',
      label,
      summary,
      source: (source as BrowserCommandCandidate['source']) || 'probe',
      ref: typeof record.ref === 'string' ? record.ref : undefined,
      role: typeof record.role === 'string' ? record.role : undefined,
      elementId: typeof record.elementId === 'string' ? record.elementId : undefined,
      dataTestId: typeof record.dataTestId === 'string' ? record.dataTestId : undefined,
      text: typeof record.text === 'string' ? record.text : undefined,
      action: typeof record.action === 'string' ? record.action : undefined,
      field: typeof record.field === 'string' ? record.field : undefined,
      stableName: typeof record.stableName === 'string' ? record.stableName : undefined,
      row: this.normalizeCandidateRow(record.row),
      region: this.normalizeCandidateRegion(record.region),
      preferredLocator,
    };
  }

  private normalizePreferredLocator(value: unknown): BrowserCommandCandidateLocator | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.type !== 'string' || typeof record.value !== 'string') {
      return undefined;
    }
    return {
      type: record.type as BrowserCommandCandidateLocator['type'],
      value: record.value,
    };
  }

  private normalizeCandidateRow(value: unknown): BrowserCommandCandidate['row'] | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const row: BrowserCommandCandidate['row'] = {};
    if (typeof record.index === 'number' && Number.isFinite(record.index)) {
      row.index = record.index;
    }
    if (typeof record.key === 'string') {
      row.key = record.key;
    }
    if (typeof record.text === 'string') {
      row.text = record.text;
    }
    return Object.keys(row).length > 0 ? row : undefined;
  }

  private normalizeCandidateRegion(value: unknown): BrowserCommandCandidate['region'] | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const region: BrowserCommandCandidate['region'] = {};
    if (typeof record.name === 'string') {
      region.name = record.name;
    }
    if (typeof record.type === 'string') {
      region.type = record.type;
    }
    return Object.keys(region).length > 0 ? region : undefined;
  }

  private getActionResolverCandidates(context: BrowserCommandContext): BrowserCommandCandidate[] {
    if (context.availableCandidates?.length) {
      return context.availableCandidates;
    }

    return (context.availableButtons || [])
      .map((item, index) => this.normalizeCandidate(item, index))
      .filter((item): item is BrowserCommandCandidate => Boolean(item));
  }

  private resolvePendingClickIntent(
    intent: PendingActionIntent,
    context: BrowserCommandContext,
    description: string
  ): BrowserCommand | null {
    const resolvedTarget = resolveActionIntentToLocator(intent, {
      availableCandidates: this.getActionResolverCandidates(context),
      availableButtons: context.availableButtons,
      currentPageUrl: context.currentPageUrl,
      lastObservationText: context.lastObservationText,
    });
    if (!resolvedTarget) {
      return null;
    }

    return buildClickCommandFromResolvedTarget({
      intent,
      description,
      resolvedTarget,
    });
  }

  private buildPendingClickIntentFromParams(
    params: Record<string, unknown>,
    source: PendingActionIntentSource
  ): PendingActionIntent | null {
    const rawTargetFromText = typeof params.text === 'string' ? params.text.trim() : undefined;
    const rawTargetFromIntent =
      typeof params.rawTarget === 'string' ? params.rawTarget.trim() : undefined;
    const rawTargetFromTarget =
      typeof params.target === 'string'
        ? this.extractRawTargetFromTextLocator(params.target)
        : undefined;
    const candidateId =
      typeof params.candidateId === 'string' && params.candidateId.trim()
        ? params.candidateId.trim()
        : undefined;

    const rawTarget = rawTargetFromIntent || rawTargetFromText || rawTargetFromTarget;
    if (!rawTarget && !candidateId) {
      return null;
    }

    const row = this.normalizeCandidateRow(params.rowHint);

    return buildPendingClickIntent({
      source,
      rawTarget,
      candidateId,
      regionHint: typeof params.regionHint === 'string' ? params.regionHint : undefined,
      roleHint: normalizePendingRoleHint(params.roleHint),
      semanticHint:
        normalizePendingSemanticHint(params.semanticHint) || inferSemanticHint(rawTarget),
      rowHint: row
        ? {
            index: row.index,
            key: row.key,
            text: row.text,
          }
        : undefined,
    });
  }

  private extractRawTargetFromTextLocator(target: string): string | undefined {
    const normalized = target.trim();
    const quotedMatch = normalized.match(/^text\s*=\s*"(.+)"$/i);
    if (quotedMatch?.[1]) {
      return quotedMatch[1].trim();
    }
    const plainMatch = normalized.match(/^text\s*=\s*(.+)$/i);
    return plainMatch?.[1]?.trim();
  }

  private isExplicitNonTextClickTarget(target: string): boolean {
    const normalized = target.trim();
    if (!normalized) {
      return false;
    }

    if (/^text\s*=/i.test(normalized)) {
      return false;
    }

    return true;
  }

  private resolveClickCommandsWithContext(
    commands: BrowserCommand[],
    context: BrowserCommandContext,
    source: PendingActionIntentSource
  ): BrowserCommand[] {
    return commands.map((command) => {
      if (command.tool !== 'click') {
        return command;
      }

      const params = (command.params || {}) as Record<string, unknown>;
      if (typeof params.target === 'string' && this.isExplicitNonTextClickTarget(params.target)) {
        return command;
      }
      if (typeof params.selector === 'string' && params.selector.trim()) {
        return command;
      }

      const intent = this.buildPendingClickIntentFromParams(params, source);
      if (!intent) {
        return command;
      }

      const resolved = this.resolvePendingClickIntent(
        intent,
        context,
        command.description || `点击${intent.rawTarget || ''}`.trim()
      );
      return resolved || command;
    });
  }

  private parseSequentialCommands(input: string): ParseBrowserCommandResponse | null {
    const normalizedInput = input
      .replace(/[，。；]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalizedInput) {
      return null;
    }

    const commands: BrowserCommand[] = [];
    const explanations: string[] = [];
    let remaining = normalizedInput;

    const navigateTarget = this.extractSequentialNavigateTarget(remaining);
    if (navigateTarget) {
      const { target, consumedLength } = navigateTarget;
      const url = this.resolveUrl(target);
      commands.push({
        tool: 'navigate',
        params: { url },
        description: `导航到 ${target}`,
      });
      explanations.push(`打开 ${url}`);
      remaining = this.stripLeadingConnector(remaining.slice(consumedLength));
    }

    const smartSearchMatch = remaining.match(
      /^(?:智搜|智能搜索)\s*(.+?)(?=\s*(?:并|然后|再|后|接着)?\s*(?:点击|选择|click)|$)/i
    );
    if (smartSearchMatch?.[1]) {
      const query = smartSearchMatch[1].trim();
      commands.push({
        tool: 'smart_search',
        params: { query },
        description: `智搜 ${query}`,
      });
      explanations.push(`搜索 ${query}`);
      remaining = this.stripLeadingConnector(remaining.slice(smartSearchMatch[0].length));
    } else {
      const searchMatch = remaining.match(
        /^(?:搜索|search)\s*(.+?)(?=\s*(?:并|然后|再|后|接着)?\s*(?:点击|选择|click)|$)/i
      );
      if (searchMatch?.[1]) {
        const query = searchMatch[1].trim();
        commands.push({
          tool: 'smart_search',
          params: { query },
          description: `智搜 ${query}`,
        });
        explanations.push(`搜索 ${query}`);
        remaining = this.stripLeadingConnector(remaining.slice(searchMatch[0].length));
      }
    }

    const clickResultMatch = remaining.match(
      /^(?:点击|选择|click)\s*(第?[一二三四五六七八九十\d]+|first|second|third|fourth|fifth)\s*(?:个?结果|条?结果|搜索结果|result)?$/i
    );
    if (clickResultMatch?.[1]) {
      const index = this.resolveResultIndex(clickResultMatch[1]);
      if (index > 0) {
        commands.push({
          tool: 'click_result',
          params: { index },
          description: `点击第${index}个结果`,
        });
        explanations.push(`点击第${index}个结果`);
        remaining = this.stripLeadingConnector(remaining.slice(clickResultMatch[0].length));
      }
    }

    if (commands.length >= 2 && remaining.length === 0) {
      return {
        success: true,
        commands,
        explanation: `将依次${explanations.join('，')}`,
      };
    }

    return null;
  }

  private parseCandidateReadIntent(
    input: string,
    context: BrowserCommandContext
  ): ParseBrowserCommandResponse | null {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    if (!normalizedInput || !context.availableCandidates?.length) {
      return null;
    }

    const readMatch = normalizedInput.match(/^(读取|获取|查看|提取|read|get)\s*(.+)$/i);
    if (!readMatch?.[2]) {
      return null;
    }

    const rawTarget = readMatch[2].trim();
    const requestedTarget = rawTarget
      .replace(
        /(?:当前的|当前页的|当前页|当前案件的|当前案件|页面上的|页面中|页面里|页面|区域里的|区域中)/g,
        ''
      )
      .replace(/^的+/, '')
      .trim();
    const normalizedRequestedTarget = this.normalizeCandidateText(requestedTarget);
    if (!normalizedRequestedTarget) {
      return null;
    }

    const parsedCandidates = context.availableCandidates
      .filter((candidate) => candidate.kind === 'field' || candidate.kind === 'region')
      .map((item) => this.toParsedCandidateHint(item))
      .filter((item): item is ParsedCandidateHint => Boolean(item));

    const scored = parsedCandidates
      .map((candidate) => ({
        candidate,
        selector: this.buildReadSelectorFromCandidate(candidate),
        score: this.scoreReadCandidateHint(candidate, normalizedRequestedTarget),
      }))
      .filter((item) => item.score > 0 && Boolean(item.selector));

    const dedupedScored = [
      ...scored
        .reduce((map, item) => {
          const key = item.selector || item.candidate.candidateId || item.candidate.raw;
          const existing = map.get(key);
          if (!existing || item.score > existing.score) {
            map.set(key, item);
          }
          return map;
        }, new Map<string, (typeof scored)[number]>())
        .values(),
    ].sort((left, right) => right.score - left.score);

    const matchedCandidate = dedupedScored[0]?.candidate;
    const selector = dedupedScored[0]?.selector;
    const nextScore = dedupedScored[1]?.score || 0;
    const bestScore = dedupedScored[0]?.score || 0;
    if (
      !matchedCandidate ||
      !selector ||
      bestScore < 90 ||
      (dedupedScored.length > 1 && bestScore - nextScore < 15)
    ) {
      return null;
    }

    return {
      success: true,
      commands: [
        {
          tool: 'get_text',
          params: {
            selector,
            max_length: 1000,
          },
          description: `${readMatch[1]}${rawTarget}`,
          locator: {
            strategy: 'css',
            value: selector,
            generatedBy: 'context',
            confidence: 0.9,
          },
        },
      ],
      explanation: `将${readMatch[1]}${rawTarget}`,
    };
  }

  private parseScopedActionIntent(input: string): {
    verb: string;
    rawTarget: string;
    regionHint?: string;
  } | null {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    if (!normalizedInput) {
      return null;
    }

    const scopedMatch = normalizedInput.match(
      /^在(.+?)(?:区域|面板|模块|区块|部分)?(?:里|中)?\s*(点击|单击|选择|打开|进入|click)\s*(.+)$/i
    );
    if (scopedMatch?.[2] && scopedMatch[3]) {
      return {
        verb: scopedMatch[2],
        rawTarget: scopedMatch[3].trim(),
        regionHint: scopedMatch[1]?.trim() || undefined,
      };
    }

    const directMatch = normalizedInput.match(/^(点击|单击|选择|打开|进入|click)\s*(.+)$/i);
    if (!directMatch?.[2]) {
      return null;
    }

    const verb = directMatch[1]?.trim();
    const rawTarget = directMatch[2]?.trim();
    if (!verb || !rawTarget) {
      return null;
    }

    return {
      verb,
      rawTarget,
    };
  }

  private parseLoginCommand(
    input: string,
    context: BrowserCommandContext
  ): ParseBrowserCommandResponse | null {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    if (!normalizedInput) {
      return null;
    }

    const hasCredentialIntent =
      /(用户名|账号|账户|user(?:name)?|邮箱|email|手机号|mobile|phone|密码|password|pass|验证码|verification|otp|code)/i.test(
        normalizedInput
      );
    const hasSubmitIntent = /(登录|登入|sign\s*in|log\s*in|log\s*on|next|submit|提交)/i.test(
      normalizedInput
    );
    if (!hasCredentialIntent && !hasSubmitIntent) {
      return null;
    }

    const fieldMatches = [
      this.extractCredentialField(normalizedInput, {
        selector: '用户名',
        description: '填写用户名',
        patterns: [/(?:用户名|账号|账户|user(?:name)?)\s*(?:是|为|:)?\s*([^\s，。,；;]+)/i],
      }),
      this.extractCredentialField(normalizedInput, {
        selector: '密码',
        description: '填写密码',
        patterns: [/(?:密码|password|pass)\s*(?:是|为|:)?\s*([^\s，。,；;]+)/i],
      }),
      this.extractCredentialField(normalizedInput, {
        selector: '验证码',
        description: '填写验证码',
        patterns: [
          /(?:验证码|verification(?:\s+code)?|otp|code)\s*(?:是|为|:)?\s*([^\s，。,；;]+)/i,
        ],
      }),
    ].filter((item): item is { selector: string; value: string; description: string } =>
      Boolean(item)
    );

    if (fieldMatches.length === 0) {
      return null;
    }

    const commands: BrowserCommand[] = [];
    const explanations: string[] = [];

    const navigateTarget = this.extractSequentialNavigateTarget(normalizedInput);
    if (navigateTarget) {
      const url = this.resolveUrl(navigateTarget.target);
      commands.push({
        tool: 'navigate',
        params: { url },
        description: `打开 ${navigateTarget.target}`,
      });
      explanations.push(`打开 ${url}`);
    }

    commands.push(
      ...fieldMatches.map((field) => ({
        tool: 'fill',
        params: { selector: field.selector, value: field.value },
        description: field.description,
      }))
    );
    explanations.push(`填写${fieldMatches.map((field) => field.selector).join('和')}`);

    const submitTarget = this.extractLoginSubmitTarget(normalizedInput);
    if (submitTarget) {
      const submitIntent = buildPendingClickIntent({
        source: 'login-parser',
        rawTarget: submitTarget,
        semanticHint: 'submit',
        roleHint: 'button',
      });
      const clickCommand = this.resolvePendingClickIntent(
        submitIntent,
        context,
        `点击${submitTarget}`
      );
      if (clickCommand) {
        commands.push(clickCommand);
        explanations.push(`点击 ${submitTarget}`);
      }
    }

    const trailingAction = normalizedInput.match(
      /(?:然后|并|再|接着|之后|登录成功后)\s*(点击|打开|进入)\s*([^\s，。,；;]+)/i
    );
    if (
      trailingAction?.[2] &&
      (!submitTarget ||
        this.normalizeCandidateText(trailingAction[2]) !== this.normalizeCandidateText(submitTarget))
    ) {
      const targetText = trailingAction[2].trim();
      const trailingIntent = buildPendingClickIntent({
        source: 'login-parser',
        rawTarget: targetText,
        semanticHint: inferSemanticHint(targetText),
      });
      const trailingClick = this.resolvePendingClickIntent(
        trailingIntent,
        context,
        `点击${targetText}`
      );
      if (trailingClick) {
        commands.push(trailingClick);
        explanations.push(`点击 ${targetText}`);
      }
    }

    return {
      success: true,
      commands,
      explanation: `将依次${explanations.join('，')}`,
    };
  }

  private extractCredentialField(
    input: string,
    config: {
      selector: string;
      description: string;
      patterns: RegExp[];
    }
  ): { selector: string; value: string; description: string } | null {
    for (const pattern of config.patterns) {
      const match = input.match(pattern);
      const value = match?.[1]?.trim();
      if (value) {
        return {
          selector: config.selector,
          value,
          description: config.description,
        };
      }
    }
    return null;
  }

  private extractLoginSubmitTarget(input: string): string | undefined {
    if (/\bnext\b/i.test(input)) {
      return 'Next';
    }
    if (/log\s*on/i.test(input)) {
      return 'Log On';
    }
    if (/sign\s*in/i.test(input)) {
      return 'Sign In';
    }
    if (/log\s*in/i.test(input)) {
      return 'Log In';
    }
    if (/(登录|登入)/.test(input)) {
      return '登录';
    }
    if (/(提交|submit)/i.test(input)) {
      return '提交';
    }
    return undefined;
  }

  private parseCandidateScopedAction(
    input: string,
    context: BrowserCommandContext
  ): ParseBrowserCommandResponse | null {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    const candidates = this.getActionResolverCandidates(context);
    if (!normalizedInput || !candidates?.length) {
      return null;
    }

    const actionIntent = this.parseScopedActionIntent(normalizedInput);
    if (!actionIntent?.rawTarget) {
      return null;
    }

    const rawTarget = actionIntent.rawTarget;
    const rowMatch = rawTarget.match(
      /(?:第?([一二三四五六七八九十\d]+)\s*(?:条|个)?(?:记录|行|项目|数据|案件))/i
    );
    const rowIndex = rowMatch?.[1] ? this.resolveResultIndex(rowMatch[1]) : undefined;
    let requestedTarget = rawTarget
      .replace(/(?:一览的|列表的|表格里的|表格中|列表中|当前的|当前页的)/g, '')
      .replace(/第?\s*[一二三四五六七八九十\d]+\s*(?:条|个)?(?:记录|行|项目|数据|案件)/g, '')
      .replace(
        /(?:的)?(?:详细按钮|详情按钮|详情页|详细页|详细页面|详情页面|进入详细页面|进入详情页面|进入详细页|进入详情页|进入详细|进入详情|查看详情|打开详情|详细|详情|明细)/gi,
        '详情'
      )
      .replace(/^的+/, '')
      .trim();
    if (
      rowIndex &&
      (!requestedTarget ||
        /^(?:进入详细页面?|进入详情页面?|进入详细页?|进入详情页?|进入详细|进入详情|查看详情|打开详情)$/.test(
          requestedTarget
        ))
    ) {
      requestedTarget = '详情';
    }
    if (!requestedTarget) {
      return null;
    }

    const clickIntent = buildPendingClickIntent({
      source: 'candidate-parser',
      rawTarget: requestedTarget,
      regionHint: actionIntent.regionHint,
      rowHint: rowIndex ? { index: rowIndex } : undefined,
      semanticHint: inferSemanticHint(requestedTarget),
    });
    const clickCommand = this.resolvePendingClickIntent(
      clickIntent,
      {
        ...context,
        availableCandidates: candidates,
      },
      `${actionIntent.verb}${rawTarget}`
    );
    if (!clickCommand) {
      return null;
    }

    return {
      success: true,
      commands: [clickCommand],
      explanation: `将${actionIntent.verb}${rawTarget}`,
    };
  }

  private stripLeadingConnector(text: string): string {
    return text.replace(/^(?:\s|并且|并|然后|再|后|接着)+/i, '').trim();
  }

  private extractSequentialNavigateTarget(
    input: string
  ): { target: string; consumedLength: number } | null {
    const prefixMatch = input.match(
      /^(?:打开|导航到|访问|前往|goto|open|navigate|go\s*to|visit)\s*/i
    );
    if (!prefixMatch) {
      return null;
    }

    const rest = input.slice(prefixMatch[0].length);
    const firstToken = rest.match(/^([^\s]+)/)?.[1];
    if (firstToken) {
      const resolved = this.resolveUrl(firstToken);
      const looksLikeExplicitTarget =
        resolved !== `https://${firstToken}` ||
        /^https?:\/\//i.test(firstToken) ||
        /^[\w.-]+\.[a-z]{2,}/i.test(firstToken);
      if (looksLikeExplicitTarget) {
        return {
          target: firstToken,
          consumedLength: prefixMatch[0].length + firstToken.length,
        };
      }
    }

    const fallbackMatch = rest.match(
      /^(.+?)(?=\s*(?:并|然后|再|后|接着)?\s*(?:智搜|智能搜索|搜索|search|点击|选择|click)|$)/i
    );
    if (!fallbackMatch?.[1]) {
      return null;
    }

    return {
      target: fallbackMatch[1].trim(),
      consumedLength: prefixMatch[0].length + fallbackMatch[0].length,
    };
  }

  private resolveResultIndex(value: string): number {
    const indexMap: Record<string, number> = {
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
    };
    const normalized = value.replace(/^第/, '').replace(/个|条/g, '').toLowerCase();
    return indexMap[normalized] || parseInt(normalized, 10) || 0;
  }

  private shouldPreferAIForCandidateScopedIntent(
    input: string,
    context: BrowserCommandContext
  ): boolean {
    if (!context.availableCandidates?.length) {
      return false;
    }
    const scopedAction = this.parseScopedActionIntent(input);
    if (!scopedAction?.rawTarget) {
      return false;
    }

    const target = scopedAction.rawTarget;
    const hasOrdinalReference =
      /(?:第?[一二三四五六七八九十\d]+|当前|上一|下一)\s*(?:条|个)?(?:记录|行|项目|数据|案件)?/i.test(
        target
      );
    const hasDetailIntent =
      /(详情|详细|明细|详情页|详细页|详细页面|详情页面|詳細|detail|进入详细|进入详情|查看详情|打开详情)/i.test(
        target
      );
    return hasOrdinalReference && (hasDetailIntent || this.hasAmbiguousActionCandidates(context));
  }

  private hasAmbiguousActionCandidates(context: BrowserCommandContext): boolean {
    const candidates = this.getActionResolverCandidates(context).filter(
      (candidate) => candidate.kind === 'action'
    );
    if (candidates.length < 2) {
      return false;
    }

    const seen = new Map<string, number>();
    for (const candidate of candidates) {
      const signature = [
        this.normalizeCandidateText(candidate.action),
        this.normalizeCandidateText(candidate.stableName),
        this.normalizeCandidateText(candidate.label),
      ]
        .filter(Boolean)
        .join('|');
      if (!signature) {
        continue;
      }
      const count = (seen.get(signature) || 0) + 1;
      if (count >= 2) {
        return true;
      }
      seen.set(signature, count);
    }

    return false;
  }

  private validateAIResolvedCommands(
    input: string,
    context: BrowserCommandContext,
    commands: BrowserCommand[]
  ): BrowserCommand[] | null {
    if (!this.shouldPreferAIForCandidateScopedIntent(input, context)) {
      return commands;
    }

    const requestedRowIndex = this.extractRequestedRowIndex(input);
    const hasUngroundedClick = commands.some((command) => this.isUngroundedAIClick(command));
    const hasMismatchedRowScopedClick = commands.some((command) =>
      this.isMismatchedRowScopedDetailClick(command, context, requestedRowIndex)
    );
    return hasUngroundedClick || hasMismatchedRowScopedClick ? null : commands;
  }

  private isUngroundedAIClick(command: BrowserCommand): boolean {
    if (command.tool !== 'click') {
      return false;
    }

    if (command.locator?.generatedBy === 'fallback') {
      return true;
    }

    const params = (command.params || {}) as Record<string, unknown>;
    if (typeof params.text === 'string' && params.text.trim()) {
      return true;
    }

    if (typeof params.target === 'string' && /^text\s*=/i.test(params.target.trim())) {
      return true;
    }

    return false;
  }

  private extractRequestedRowIndex(input: string): number | undefined {
    const scopedAction = this.parseScopedActionIntent(input);
    if (!scopedAction?.rawTarget) {
      return undefined;
    }
    const rowMatch = scopedAction.rawTarget.match(
      /(?:第?([一二三四五六七八九十\d]+)\s*(?:条|个)?(?:记录|行|项目|数据|案件))/i
    );
    return rowMatch?.[1] ? this.resolveResultIndex(rowMatch[1]) : undefined;
  }

  private isMismatchedRowScopedDetailClick(
    command: BrowserCommand,
    context: BrowserCommandContext,
    requestedRowIndex?: number
  ): boolean {
    if (command.tool !== 'click' || !requestedRowIndex) {
      return false;
    }
    const scopedAction = this.parseScopedActionIntent(command.description || '');
    const detailLikeInput =
      /(详情|详细|明细|详情页|详细页|详细页面|详情页面|詳細|detail|进入详细|进入详情|查看详情|打开详情)/i.test(
        scopedAction?.rawTarget || command.description || ''
      );
    if (!detailLikeInput) {
      return false;
    }

    const candidates = this.getActionResolverCandidates(context);
    const hasExpectedRowDetailCandidate = candidates.some(
      (candidate) =>
        candidate.kind === 'action' &&
        candidate.row?.index === requestedRowIndex &&
        this.isDetailLikeCandidate(candidate)
    );
    if (!hasExpectedRowDetailCandidate) {
      return false;
    }

    const matchedCandidateId = command.locator?.matchedCandidateId;
    if (!matchedCandidateId) {
      return true;
    }
    const matchedCandidate = candidates.find((candidate) => candidate.candidateId === matchedCandidateId);
    return matchedCandidate?.row?.index !== requestedRowIndex;
  }

  private isDetailLikeCandidate(candidate: BrowserCommandCandidate): boolean {
    const combined = [
      candidate.action,
      candidate.stableName,
      candidate.label,
      candidate.text,
      candidate.summary,
    ]
      .map((value) => this.normalizeCandidateText(value))
      .join('|');
    return combined.includes('detail');
  }

  private parseStructuredCandidateHint(value: string): ParsedCandidateHint | null {
    const raw = value.trim();
    if (!raw) {
      return null;
    }
    const ref = this.extractStructuredHintToken(raw, 'ref');
    const candidateId = this.extractStructuredHintToken(raw, 'candidateId');
    const row = this.extractStructuredHintToken(raw, 'row');
    const kind = this.extractStructuredHintToken(raw, 'kind');
    const action = this.extractStructuredHintToken(raw, 'action');
    const stable = this.extractStructuredHintToken(raw, 'stable');
    const label = this.extractStructuredHintToken(raw, 'label');
    const field = this.extractStructuredHintToken(raw, 'field');
    const region = this.extractStructuredHintToken(raw, 'region');
    const rowKey = this.extractStructuredHintToken(raw, 'rowKey');
    const rowText = this.extractStructuredHintToken(raw, 'rowText');
    const text = this.extractStructuredHintToken(raw, 'text');
    const role = this.extractStructuredHintToken(raw, 'role');
    const elementId = this.extractStructuredHintToken(raw, 'id');
    const dataTestId = this.extractStructuredHintToken(raw, 'testid');

    return {
      raw,
      candidateId,
      ref,
      row: row && /^\d+$/.test(row) ? Number(row) : undefined,
      kind,
      action,
      stable,
      label,
      field,
      region,
      rowKey,
      rowText,
      text,
      role,
      elementId,
      dataTestId,
    };
  }

  private toParsedCandidateHint(candidate: BrowserCommandCandidate): ParsedCandidateHint {
    return {
      raw: candidate.summary,
      candidateId: candidate.candidateId,
      ref: candidate.ref,
      row: candidate.row?.index,
      kind: candidate.kind,
      action: candidate.action,
      stable: candidate.stableName,
      label: candidate.label,
      field: candidate.field,
      region: candidate.region?.name,
      rowKey: candidate.row?.key,
      rowText: candidate.row?.text,
      text: candidate.text,
      role: candidate.role,
      elementId: candidate.elementId,
      dataTestId: candidate.dataTestId,
      preferredLocator: candidate.preferredLocator,
    };
  }

  private buildReadSelectorFromCandidate(candidate: ParsedCandidateHint): string | undefined {
    if (candidate.preferredLocator?.type === 'css' || candidate.preferredLocator?.type === 'text') {
      return candidate.preferredLocator.value;
    }
    if (candidate.dataTestId) {
      return `[data-testid="${candidate.dataTestId}"]`;
    }
    if (candidate.elementId) {
      return `#${candidate.elementId}`;
    }
    if (candidate.field && candidate.region) {
      return `[data-ai-region="${candidate.region}"] [data-ai-field="${candidate.field}"]`;
    }
    if (candidate.field) {
      return `[data-ai-field="${candidate.field}"]`;
    }
    if (candidate.region) {
      return `[data-ai-region="${candidate.region}"]`;
    }
    return undefined;
  }

  private extractStructuredHintToken(value: string, key: string): string | undefined {
    const match = value.match(new RegExp(`${key}=([^|]+)`));
    return match?.[1]?.trim();
  }

  private scoreCandidateHint(
    candidate: ParsedCandidateHint,
    normalizedRequestedTarget: string,
    rowIndex?: number,
    normalizedRegionHint?: string
  ): number {
    if (!normalizedRequestedTarget) {
      return 0;
    }

    let score = 0;
    if (rowIndex) {
      if (candidate.row === rowIndex) {
        score += 80;
      } else {
        score -= 60;
      }
    }

    const tokens = [
      candidate.action,
      candidate.stable,
      candidate.label,
      candidate.field,
      candidate.region,
      candidate.rowKey,
      candidate.rowText,
      candidate.text,
      candidate.role,
      candidate.raw,
    ]
      .map((value) => this.normalizeCandidateText(value))
      .filter((value): value is string => Boolean(value));

    for (const token of tokens) {
      if (token === normalizedRequestedTarget) {
        score = Math.max(score, 140);
      } else if (token.includes(normalizedRequestedTarget)) {
        score = Math.max(score, 115);
      } else if (normalizedRequestedTarget.includes(token) && token.length >= 3) {
        score = Math.max(score, 95);
      }
    }

    if (candidate.ref) {
      score += 10;
    }
    if (candidate.kind === 'action') {
      score += 8;
    }
    if (candidate.preferredLocator) {
      score += 6;
    }
    if (normalizedRegionHint) {
      const regionToken = this.normalizeCandidateText(candidate.region);
      if (regionToken === normalizedRegionHint) {
        score += 55;
      } else if (
        regionToken &&
        (regionToken.includes(normalizedRegionHint) || normalizedRegionHint.includes(regionToken))
      ) {
        score += 35;
      } else {
        score -= 30;
      }
    }

    return score;
  }

  private scoreReadCandidateHint(
    candidate: ParsedCandidateHint,
    normalizedRequestedTarget: string
  ): number {
    let score = this.scoreCandidateHint(candidate, normalizedRequestedTarget);
    if (candidate.kind === 'field') {
      score += 20;
    }
    if (
      candidate.preferredLocator?.type === 'testid' ||
      candidate.preferredLocator?.type === 'css'
    ) {
      score += 10;
    }
    return score;
  }

  private normalizeCandidateText(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    return value
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/案件粗利率|粗利率|毛利率|gross[\s_-]*margin/g, 'grossmargin')
      .replace(/详情|詳細/g, 'detail')
      .replace(/承认する|承認する|承认|承認|approve/g, 'approve')
      .replace(/批准|审批通过|审批|通过/g, 'approve')
      .replace(/却下する|却下|拒绝|拒否|reject/g, 'reject')
      .replace(/打开|进入|点击|单击|选择/g, '')
      .replace(/按钮|按键|链接|入口|字段|输入框|文本框|区域|面板|模块|区块|部分/g, '')
      .replace(/[的"'\s:=|]/g, '')
      .trim();
  }

  private parseWithCommandContext(
    input: string,
    context: BrowserCommandContext
  ): ParseBrowserCommandResponse | null {
    const commandType = context.commandType?.trim().toLowerCase();
    if (!commandType) {
      return null;
    }

    const strippedInput = this.stripCommandPrefix(input, commandType);
    if (!strippedInput) {
      return null;
    }

    switch (commandType) {
      case 'navigate': {
        const url = this.resolveUrl(strippedInput);
        return {
          success: true,
          commands: [
            {
              tool: 'navigate',
              params: { url },
              description: `导航到 ${strippedInput}`,
            },
          ],
          explanation: `将打开 ${url}`,
        };
      }
      case 'click':
        const clickIntent = buildPendingClickIntent({
          source: 'context-parser',
          rawTarget: strippedInput,
          semanticHint: inferSemanticHint(strippedInput),
        });
        const clickCommand = this.resolvePendingClickIntent(
          clickIntent,
          context,
          `点击${strippedInput}`
        );
        if (!clickCommand) {
          return null;
        }
        return {
          success: true,
          commands: [clickCommand],
          explanation: `将点击${strippedInput}`,
        };
      case 'search':
        return {
          success: true,
          commands: [
            {
              tool: 'search',
              params: { query: strippedInput },
              description: `搜索 ${strippedInput}`,
            },
          ],
          explanation: context.currentPageUrl
            ? `将使用当前页面的搜索入口搜索 ${strippedInput}`
            : `将搜索 ${strippedInput}`,
        };
      case 'smart_search':
        return {
          success: true,
          commands: [
            {
              tool: 'smart_search',
              params: { query: strippedInput },
              description: `智搜 ${strippedInput}`,
            },
          ],
          explanation: `将智能查找当前页面的搜索入口并搜索 ${strippedInput}`,
        };
      default:
        return null;
    }
  }

  private stripCommandPrefix(input: string, commandType: string): string {
    const normalized = input.trim();
    const prefixMap: Record<string, RegExp[]> = {
      navigate: [/^(?:打开|导航到|访问|前往|goto|open|navigate|go\s*to|visit)\s*/i],
      click: [/^(?:点击|click)\s*/i],
      search: [/^(?:搜索|search)\s*/i],
      smart_search: [/^(?:智搜|智能搜索|smart\s*search)\s*/i],
    };

    const patterns = prefixMap[commandType] || [];
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        return normalized.replace(pattern, '').trim();
      }
    }

    return normalized;
  }

  private parseWithPatterns(
    input: string,
    context: BrowserCommandContext
  ): ParseBrowserCommandResponse | null {
    // Try pattern matching for all common commands first

    // Pattern: Navigate to known sites
    const navigatePatterns = [
      /^(?:打开|导航到|访问|前往|goto)\s*(.+)$/i,
      /^(?:open|navigate|go\s*to|visit)\s+(.+)$/i,
    ];

    for (const pattern of navigatePatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        const target = match[1].trim();
        const url = this.resolveUrl(target);
        // Only use pattern if we resolved to a known URL
        if (url && url !== `https://${target}`) {
          return {
            success: true,
            commands: [
              {
                tool: 'navigate',
                params: { url },
                description: `导航到 ${target}`,
              },
            ],
            explanation: `将打开 ${url}`,
          };
        }
        // If not a known URL, return null to let AI handle it
        // AI can handle more complex navigation like "打开微博搜索xxx"
        return null;
      }
    }

    // Pattern: Search on specific search engines (explicit engine specified)
    // Generic "搜索 xxx" will go through AI for page-aware search
    const searchPatterns = [
      /^(?:在?\s*(百度|baidu)\s*搜索)\s*(.+)$/i,
      /^(?:在?\s*(谷歌|google)\s*搜索)\s*(.+)$/i,
      /^(?:在?\s*(必应|bing)\s*搜索)\s*(.+)$/i,
      /^(?:search\s+(?:on\s+)?(baidu|google|bing)\s*:?\s*)(.+)$/i,
    ];

    for (const pattern of searchPatterns) {
      const match = input.match(pattern);
      if (match && match[1] && match[2]) {
        const engine = match[1].toLowerCase();
        const query = match[2].trim();

        const searchUrls: Record<string, string> = {
          百度: 'https://www.baidu.com/s?wd=',
          baidu: 'https://www.baidu.com/s?wd=',
          谷歌: 'https://www.google.com/search?q=',
          google: 'https://www.google.com/search?q=',
          必应: 'https://www.bing.com/search?q=',
          bing: 'https://www.bing.com/search?q=',
        };
        const baseUrl = searchUrls[engine] || searchUrls['百度'];
        return {
          success: true,
          commands: [
            {
              tool: 'navigate',
              params: { url: `${baseUrl}${encodeURIComponent(query)}` },
              description: `在${engine}搜索 ${query}`,
            },
          ],
          explanation: `将在${engine}搜索 ${query}`,
        };
      }
    }

    // Pattern: Click by result index (点击第一个结果 etc.)
    const clickResultPatterns = [
      /^(?:点击|选择)\s*(第?[一二三四五六七八九十\d]+)\s*(?:个?结果|条?结果|搜索结果)$/i,
      /^click\s+(?:the\s+)?(?:first|second|third|fourth|fifth|\d+th)?\s*result$/i,
    ];

    const indexMap: Record<string, number> = {
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
    };

    for (const pattern of clickResultPatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        const indexStr = match[1]
          .replace('第', '')
          .replace('个', '')
          .replace('条', '')
          .toLowerCase();
        const index = indexMap[indexStr] || parseInt(indexStr, 10);
        if (index > 0) {
          return {
            success: true,
            commands: [
              {
                tool: 'click_result',
                params: { index },
                description: `点击第${index}个结果`,
              },
            ],
            explanation: `将点击第${index}个搜索结果`,
          };
        }
      }
    }

    const listSearchResultsPatterns = [
      /^(?:列出|查看|显示)\s*(?:搜索)?(?:结果|候选结果|搜索结果)$/i,
      /^(?:show|list|inspect)\s+(?:search\s+)?results?$/i,
    ];

    for (const pattern of listSearchResultsPatterns) {
      if (pattern.test(input.trim())) {
        return {
          success: true,
          commands: [
            {
              tool: 'list_search_results',
              params: { limit: 8 },
              description: '列出当前页面搜索结果候选',
            },
          ],
          explanation: '将列出当前页面可点击的搜索结果候选',
        };
      }
    }

    // Pattern: switch to latest tab/page
    const switchLatestTabPatterns = [
      /^(?:切到|切换到|切换至|聚焦到|显示)\s*(?:最新|最后)\s*(?:标签页|页签|tab|页面)$/i,
      /^(?:切到|切换到|切换至|聚焦到|显示)\s*新(?:标签页|页签|tab|页面)$/i,
      /^(?:switch|focus)\s+(?:to\s+)?(?:the\s+)?(?:latest|last|newest)\s+(?:tab|page)$/i,
    ];

    for (const pattern of switchLatestTabPatterns) {
      if (pattern.test(input.trim())) {
        return {
          success: true,
          commands: [
            {
              tool: 'switch_latest_tab',
              params: {},
              description: '切换到最新标签页',
            },
          ],
          explanation: '将切换到当前浏览器会话中的最新标签页',
        };
      }
    }

    // Pattern: Click by text (点击登录按钮 etc.)
    const clickPatterns = [
      /^(?:点击|单击|按下)\s*(.+?)(?:按钮|链接|元素)?$/i,
      /^click\s+(?:on\s+)?(.+)$/i,
    ];

    for (const pattern of clickPatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        const text = match[1].trim();
        // Don't match if it looks like a result index (handled above)
        if (
          !text.match(/第?[一二三四五六七八九十\d]+\s*(?:个?结果|条?结果)/) &&
          !text.match(/第?[一二三四五六七八九十\d]+\s*(?:条|个)?(?:记录|行|项目)/)
        ) {
          const clickIntent = buildPendingClickIntent({
            source: 'pattern-parser',
            rawTarget: text,
            semanticHint: inferSemanticHint(text),
          });
          const clickCommand = this.resolvePendingClickIntent(
            clickIntent,
            context,
            `点击 ${text}`
          );
          if (!clickCommand) {
            return null;
          }
          return {
            success: true,
            commands: [clickCommand],
            explanation: `将点击 ${text}`,
          };
        }
      }
    }

    // Pattern: Scroll - fixed command
    const scrollPatterns = [
      /^(?:滚动|scroll)\s*(向下|下|up|down|向上|上|top|bottom|顶部|底部)?$/i,
      /^(?:向下|向下滚动|向下翻页)$/i,
      /^(?:向上|向上滚动|向上翻页)$/i,
      /^(?:滚动到|scroll\s*to)\s*(顶部|底部|top|bottom)$/i,
    ];

    for (const pattern of scrollPatterns) {
      const match = input.match(pattern);
      if (match) {
        let direction = 'down';
        const text = match[1]?.toLowerCase() || '';
        if (
          text.includes('向上') ||
          text.includes('上') ||
          text.includes('up') ||
          text.includes('top') ||
          text.includes('顶部')
        ) {
          direction = 'up';
        } else if (text.includes('底部') || text.includes('bottom')) {
          direction = 'bottom';
        } else if (text.includes('顶部')) {
          direction = 'top';
        }
        return {
          success: true,
          commands: [
            {
              tool: 'scroll',
              params: { direction },
              description: `滚动页面 ${direction}`,
            },
          ],
          explanation: `将向${direction === 'down' ? '下' : direction === 'up' ? '上' : direction}滚动页面`,
        };
      }
    }

    // Pattern: Screenshot - fixed command, no AI needed
    const screenshotPatterns = [/^(?:截图|截屏|截图保存|capture|screenshot)$/i];

    for (const pattern of screenshotPatterns) {
      if (pattern.test(input)) {
        return {
          success: true,
          commands: [
            {
              tool: 'screenshot',
              params: {},
              description: '截取当前页面',
            },
          ],
          explanation: '将截取当前页面截图',
        };
      }
    }

    // Pattern: Snapshot (accessibility tree) - fixed command, no AI needed
    const snapshotPatterns = [
      /^(?:快照|页面结构|获取页面|take\s*snapshot|snapshot)$/i,
      /^(?:查看|分析)\s*(?:页面|结构)$/i,
    ];

    for (const pattern of snapshotPatterns) {
      if (pattern.test(input)) {
        return {
          success: true,
          commands: [
            {
              tool: 'snapshot',
              params: {},
              description: '获取页面结构快照',
            },
          ],
          explanation: '将获取页面可访问性结构快照',
        };
      }
    }

    // Pattern: Get text - fixed command
    const getTextPatterns = [/^(?:获取文本|读取文本|获取页面文本|get\s*text)$/i];

    for (const pattern of getTextPatterns) {
      if (pattern.test(input)) {
        return {
          success: true,
          commands: [
            {
              tool: 'get_text',
              params: {},
              description: '获取页面文本',
            },
          ],
          explanation: '将获取页面所有可见文本',
        };
      }
    }

    // Pattern: Wait - fixed command, no AI needed
    const waitPatterns = [
      /^(?:等待|等)\s*(\d+)\s*(?:秒|毫秒|ms|s)?$/i,
      /^wait\s+(?:for\s+)?(\d+)\s*(?:seconds?|ms|milliseconds?)?$/i,
    ];

    for (const pattern of waitPatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        let duration = parseInt(match[1], 10);
        // Convert to ms if seconds
        if (input.includes('秒') || input.toLowerCase().includes('second')) {
          duration *= 1000;
        }
        return {
          success: true,
          commands: [
            {
              tool: 'wait',
              params: { duration },
              description: `等待 ${duration}ms`,
            },
          ],
          explanation: `将等待 ${duration} 毫秒`,
        };
      }
    }

    // Pattern: Press key - fixed command, no AI needed
    const keyPatterns = [/^(?:按下|按)\s*(.+?)\s*(?:键)?$/i, /^press\s+(.+?)(?:\s+key)?$/i];

    for (const pattern of keyPatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        let key = match[1].trim();
        // Map common key names
        const keyMap: Record<string, string> = {
          回车: 'Enter',
          确定: 'Enter',
          enter: 'Enter',
          tab: 'Tab',
          制表符: 'Tab',
          esc: 'Escape',
          escape: 'Escape',
          退出: 'Escape',
          空格: 'Space',
          space: 'Space',
        };
        key = keyMap[key.toLowerCase()] || key;

        return {
          success: true,
          commands: [
            {
              tool: 'press_key',
              params: { key },
              description: `按下 ${key} 键`,
            },
          ],
          explanation: `将按下 ${key} 键`,
        };
      }
    }

    // If no pattern matched, return null to let AI handle it
    // AI can handle more complex commands like:
    // - "打开微博并搜索xxx"
    // - "点击那个蓝色的按钮"
    // - "在输入框输入xxx然后点击搜索"
    return null;
  }

  private async parseWithAI(
    input: string,
    context: BrowserCommandContext
  ): Promise<ParseBrowserCommandResponse> {
    const result = await this.browserExecutionPlannerService.parseCommands(
      input,
      context,
      this.getUrlPatterns()
    );
    const commands = this.resolveClickCommandsWithContext(
      result.commands as BrowserCommand[],
      context,
      'ai-parser'
    );
    const validatedCommands = this.validateAIResolvedCommands(input, context, commands);
    if (!validatedCommands) {
      return {
        success: false,
        commands: [],
        explanation: result.explanation || 'AI 返回了未完成 grounding 的点击动作',
      };
    }

    return {
      success: result.success,
      commands: validatedCommands,
      explanation: result.explanation,
    };
  }

  private async parseWithAIPlan(
    input: string,
    context: BrowserCommandContext
  ): Promise<ParseBrowserCommandResponse | null> {
    const plan = await this.buildAIPlan(input, context);
    if (!plan || plan.steps.length === 0) {
      return null;
    }

    const commands = this.mapPlanStepsToCommands(plan.steps, context);
    if (commands.length === 0) {
      return null;
    }
    const validatedCommands = this.validateAIResolvedCommands(input, context, commands);
    if (!validatedCommands?.length) {
      return null;
    }

    return {
      success: true,
      commands: validatedCommands,
      explanation: plan.explanation || `将执行 ${validatedCommands.length} 个步骤`,
    };
  }

  private async buildAIPlan(
    input: string,
    context: BrowserCommandContext
  ): Promise<BrowserPlanResponse | null> {
    return this.browserExecutionPlannerService.buildPlan(input, context, this.getUrlPatterns());
  }

  private mapPlanStepsToCommands(
    steps: BrowserPlanStep[],
    context?: BrowserCommandContext
  ): BrowserCommand[] {
    return steps
      .map((step) => this.mapPlanStepToCommand(step, context))
      .filter((command): command is BrowserCommand => Boolean(command));
  }

  private mapPlanStepToCommand(
    step: BrowserPlanStep,
    context?: BrowserCommandContext
  ): BrowserCommand | null {
    const action = step.action;
    const params = step.params || {};
    const description = step.description || String(action);

    switch (action) {
      case 'navigate':
        if (typeof params.url !== 'string') {
          return null;
        }
        return {
          tool: 'navigate',
          params: { url: this.resolveUrl(String(params.url)) },
          description,
        };
      case 'search':
      case 'smart_search':
        if (typeof params.query !== 'string') {
          return null;
        }
        return {
          tool: action,
          params: { query: String(params.query) },
          description,
        };
      case 'click_result':
        if (typeof params.index !== 'number') {
          return null;
        }
        return {
          tool: 'click_result',
          params: { index: params.index },
          description,
        };
      case 'list_search_results':
        return {
          tool: 'list_search_results',
          params: {
            ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
          },
          description,
        };
      case 'switch_latest_tab':
        return {
          tool: 'switch_latest_tab',
          params: {},
          description,
        };
      case 'click':
        if (typeof params.target === 'string') {
          if (this.isExplicitNonTextClickTarget(params.target)) {
            return { tool: 'click', params: { target: params.target }, description };
          }
        }
        if (!context) {
          if (typeof params.text === 'string') {
            return { tool: 'click', params: { text: params.text }, description };
          }
          if (typeof params.target === 'string') {
            return { tool: 'click', params: { target: params.target }, description };
          }
        }
        if (typeof params.selector === 'string') {
          return { tool: 'click', params: { selector: params.selector }, description };
        }
        const intent = this.buildPendingClickIntentFromParams(
          params as Record<string, unknown>,
          'ai-plan'
        );
        if (!intent || !context) {
          return null;
        }
        return this.resolvePendingClickIntent(intent, context, description);
      case 'fill':
        if (typeof params.selector === 'string' && typeof params.value === 'string') {
          return {
            tool: 'fill',
            params: { selector: params.selector, value: params.value },
            description,
          };
        }
        return null;
      case 'screenshot':
      case 'snapshot':
      case 'get_text':
        return { tool: action, params: {}, description };
      case 'read_page':
      case 'scroll':
      case 'type_text':
      case 'wait':
      case 'hover':
      case 'press_key':
        return { tool: action, params, description };
      default:
        return null;
    }
  }

  private resolveUrl(input: string): string {
    // Check if it's a known site
    const normalizedInput = input.toLowerCase().trim();
    if (URL_PATTERNS[normalizedInput]) {
      return URL_PATTERNS[normalizedInput];
    }

    // Check for partial matches
    for (const [key, url] of Object.entries(URL_PATTERNS)) {
      if (normalizedInput.includes(key.toLowerCase())) {
        return url;
      }
    }

    // Check if it's already a URL
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return input;
    }

    // Add https://
    return `https://${input}`;
  }
}
