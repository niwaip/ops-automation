import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { RuntimeSemanticRule } from '../../../client/browser-semantics.client';
import { BrowserExecutionPlannerService } from './ai-planner/browser-execution-planner.service';
import type {
  BrowserCommand,
  BrowserCommandCandidate,
  BrowserCommandContext,
  BrowserPlanResponse,
  BrowserPlanStep,
  ParseBrowserCommandRequest,
  ParseBrowserCommandResponse,
} from './browser-command.types';
import {
  buildPendingClickIntent,
  inferSemanticHint,
  type PendingActionIntent,
  type PendingActionIntentSource,
} from './atomic-parsers/action-intent.builder';
import { BrowserCommandLoginService } from './profiles/browser-command-login.service';
import { BrowserCommandNavigationService } from './profiles/browser-command-navigation.service';
import { BrowserCommandReadService } from './profiles/browser-command-read.service';
import { BrowserCommandActionService } from './profiles/browser-command-action.service';
import { BrowserCommandSearchService } from './profiles/browser-command-search.service';
import { BrowserCommandFieldFillService } from './profiles/browser-command-field-fill.service';
import { BrowserCommandAtomicService } from './atomic-parsers/browser-command-atomic.service';
import { BrowserCommandSequentialService } from './atomic-parsers/browser-command-sequential.service';
import { BrowserCommandSemanticLogService } from './browser-command-semantic-log.service';
import {
  BrowserCommandSemanticRuntimeService,
  type ResolvedSemanticRuntime,
} from './browser-command-semantic-runtime.service';
import { BrowserCommandContextNormalizerService } from './atomic-parsers/browser-command-context-normalizer.service';
import { BrowserCommandClickContextService } from './atomic-parsers/browser-command-click-context.service';
export type {
  BrowserCommand,
  BrowserCommandCandidate,
  BrowserCommandContext,
  BrowserCommandFailureContext,
  BrowserPlanAction,
  BrowserPlanResponse,
  BrowserPlanStep,
  ParseBrowserCommandRequest,
  ParseBrowserCommandResponse,
} from './browser-command.types';

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

  constructor(
    private readonly browserExecutionPlannerService: BrowserExecutionPlannerService,
    private readonly browserCommandLoginService: BrowserCommandLoginService,
    private readonly browserCommandNavigationService: BrowserCommandNavigationService,
    private readonly browserCommandReadService: BrowserCommandReadService,
    private readonly browserCommandActionService: BrowserCommandActionService,
    private readonly browserCommandSearchService: BrowserCommandSearchService,
    private readonly browserCommandFieldFillService: BrowserCommandFieldFillService,
    private readonly browserCommandAtomicService: BrowserCommandAtomicService,
    private readonly browserCommandSequentialService: BrowserCommandSequentialService,
    private readonly browserCommandSemanticLogService: BrowserCommandSemanticLogService,
    private readonly browserCommandSemanticRuntimeService: BrowserCommandSemanticRuntimeService,
    private readonly browserCommandContextNormalizerService: BrowserCommandContextNormalizerService,
    private readonly browserCommandClickContextService: BrowserCommandClickContextService
  ) {
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

    const commandContext = this.browserCommandContextNormalizerService.normalizeContext(
      request.context
    );
    const semanticRuntime = await this.resolveSemanticRuntime(input, commandContext);
    const effectiveInput = semanticRuntime.normalizedInput;
    let loginFallbackFailureMetadata: Record<string, unknown> | undefined;

    if (commandContext.forceAI) {
      const aiPlanResult = await this.parseWithAIPlan(effectiveInput, commandContext);
      if (aiPlanResult) {
        return this.finalizeParseResult({
          originalInput: input,
          normalizedInput: effectiveInput,
          context: commandContext,
          semanticRuntime,
          result: aiPlanResult,
          parserSource: 'ai-plan',
        });
      }
      const aiResult = await this.parseWithAI(effectiveInput, commandContext);
      return this.finalizeParseResult({
        originalInput: input,
        normalizedInput: effectiveInput,
        context: commandContext,
        semanticRuntime,
        result: aiResult,
        parserSource: 'ai',
      });
    }

    const dynamicLoginResult = this.browserCommandLoginService.parseLoginCommandDetailed(
      effectiveInput,
      commandContext,
      {
        resolveUrl: (target) => this.resolveUrl(target),
        resolvePendingClickIntent: (intent, context, description) =>
          this.resolvePendingClickIntent(intent, context, description),
      },
      {
        runtimeRules: semanticRuntime.ruleSet?.rules || [],
      }
    );
    if (dynamicLoginResult.status === 'takeover_required' && dynamicLoginResult.response) {
      return this.finalizeParseResult({
        originalInput: input,
        normalizedInput: effectiveInput,
        context: commandContext,
        semanticRuntime,
        result: dynamicLoginResult.response,
        parserSource: 'login-takeover',
      });
    }

    if (
      (dynamicLoginResult.status === 'success' || dynamicLoginResult.status === 'partial') &&
      dynamicLoginResult.response
    ) {
      return this.finalizeParseResult({
        originalInput: input,
        normalizedInput: effectiveInput,
        context: commandContext,
        semanticRuntime,
        result: dynamicLoginResult.response,
        parserSource:
          dynamicLoginResult.status === 'partial' ? 'login-profile-partial' : 'login-profile',
      });
    }

    if (dynamicLoginResult.status === 'profile_miss') {
      const loginFallbackResult = await this.parseWithLoginAIPlan(
        effectiveInput,
        commandContext,
        dynamicLoginResult.reason
      );
      if (loginFallbackResult) {
        return this.finalizeParseResult({
          originalInput: input,
          normalizedInput: effectiveInput,
          context: commandContext,
          semanticRuntime,
          result: loginFallbackResult,
          parserSource: 'login-ai-plan',
        });
      }
      loginFallbackFailureMetadata = {
        login: {
          status: dynamicLoginResult.status,
          reason: 'login-ai-fallback-failed',
          triggerReason: dynamicLoginResult.reason,
          fallbackUsed: true,
        },
      };
    }

    const readProfileResult = this.browserCommandReadService.parseReadCommandDetailed(
      effectiveInput,
      commandContext,
      {
        getAvailableCandidates: () => commandContext.availableCandidates || [],
      },
      {
        runtimeRules: semanticRuntime.ruleSet?.rules || [],
      }
    );
    if (readProfileResult.status === 'success' && readProfileResult.response) {
      return this.finalizeParseResult({
        originalInput: input,
        normalizedInput: effectiveInput,
        context: commandContext,
        semanticRuntime,
        result: readProfileResult.response,
        parserSource: 'read-profile',
      });
    }

    const sequentialResult = this.browserCommandSequentialService.parseSequentialCommands(
      effectiveInput,
      {
      runtimeRules: semanticRuntime.ruleSet?.rules || [],
      currentPageUrl: commandContext.currentPageUrl,
        resolveUrl: (target) => this.resolveUrl(target),
        getKnownTargets: () => this.getUrlPatterns(),
      }
    );
    if (sequentialResult) {
      return this.finalizeParseResult({
        originalInput: input,
        normalizedInput: effectiveInput,
        context: commandContext,
        semanticRuntime,
        result: sequentialResult,
        parserSource: 'sequential-pattern',
      });
    }

    const navigationProfileResult =
      this.browserCommandNavigationService.parseNavigationCommandDetailed(
        effectiveInput,
        commandContext,
        {
          resolveUrl: (target) => this.resolveUrl(target),
          getKnownTargets: () => this.getUrlPatterns(),
        },
        {
          runtimeRules: semanticRuntime.ruleSet?.rules || [],
        }
      );
    if (navigationProfileResult.status === 'success' && navigationProfileResult.response) {
      return this.finalizeParseResult({
        originalInput: input,
        normalizedInput: effectiveInput,
        context: commandContext,
        semanticRuntime,
        result: navigationProfileResult.response,
        parserSource: 'navigation-profile',
      });
    }

    const preferAIForCandidateScopedIntent =
      this.browserCommandClickContextService.shouldPreferAIForCandidateScopedIntent(
        effectiveInput,
        commandContext
      );
    const actionProfileResult = this.browserCommandActionService.parseActionCommandDetailed(
      effectiveInput,
      commandContext,
      {
        getActionCandidates: () => this.getActionResolverCandidates(commandContext),
        resolvePendingClickIntent: (intent, description) =>
          this.resolvePendingClickIntent(intent, commandContext, description),
      },
      {
        runtimeRules: semanticRuntime.ruleSet?.rules || [],
        allowDefaultFallback: !preferAIForCandidateScopedIntent,
      }
    );
    if (actionProfileResult.status === 'success' && actionProfileResult.response) {
      return this.finalizeParseResult({
        originalInput: input,
        normalizedInput: effectiveInput,
        context: commandContext,
        semanticRuntime,
        result: actionProfileResult.response,
        parserSource: 'action-profile',
      });
    }

    if (preferAIForCandidateScopedIntent) {
      const aiPlanResult = await this.parseWithAIPlan(effectiveInput, commandContext);
      if (aiPlanResult) {
        return this.finalizeParseResult({
          originalInput: input,
          normalizedInput: effectiveInput,
          context: commandContext,
          semanticRuntime,
          result: aiPlanResult,
          parserSource: 'ai-plan',
        });
      }

      const actionFallbackResult = this.browserCommandActionService.parseActionCommandDetailed(
        effectiveInput,
        commandContext,
        {
          getActionCandidates: () => this.getActionResolverCandidates(commandContext),
          resolvePendingClickIntent: (intent, description) =>
            this.resolvePendingClickIntent(intent, commandContext, description),
        },
        {
          runtimeRules: semanticRuntime.ruleSet?.rules || [],
          allowDefaultFallback: true,
        }
      );
      if (actionFallbackResult.status === 'success' && actionFallbackResult.response) {
        return this.finalizeParseResult({
          originalInput: input,
          normalizedInput: effectiveInput,
          context: commandContext,
          semanticRuntime,
          result: actionFallbackResult.response,
          parserSource: 'action-profile',
        });
      }
    }

    const searchProfileResult = this.browserCommandSearchService.parseSearchCommandDetailed(
      effectiveInput,
      commandContext,
      {
        runtimeRules: semanticRuntime.ruleSet?.rules || [],
      }
    );
    if (searchProfileResult.status === 'success' && searchProfileResult.response) {
      return this.finalizeParseResult({
        originalInput: input,
        normalizedInput: effectiveInput,
        context: commandContext,
        semanticRuntime,
        result: searchProfileResult.response,
        parserSource: 'search-profile',
      });
    }

    const fieldFillProfileResult =
      this.browserCommandFieldFillService.parseFieldFillCommandDetailed(
        effectiveInput,
        commandContext,
        {
          getAvailableCandidates: () => commandContext.availableCandidates || [],
          getAvailableInputs: () => commandContext.availableInputs || [],
        },
        {
          runtimeRules: semanticRuntime.ruleSet?.rules || [],
        }
      );
    if (fieldFillProfileResult.status === 'success' && fieldFillProfileResult.response) {
      return this.finalizeParseResult({
        originalInput: input,
        normalizedInput: effectiveInput,
        context: commandContext,
        semanticRuntime,
        result: fieldFillProfileResult.response,
        parserSource: 'field-fill-profile',
      });
    }

    const contextResult = this.parseWithCommandContext(
      effectiveInput,
      commandContext,
      semanticRuntime.ruleSet?.rules || []
    );
    if (contextResult) {
      return this.finalizeParseResult({
        originalInput: input,
        normalizedInput: effectiveInput,
        context: commandContext,
        semanticRuntime,
        result: contextResult,
        parserSource: 'context-parser',
      });
    }

    const aiPlanResult = await this.parseWithAIPlan(effectiveInput, commandContext);
    if (aiPlanResult) {
      return this.finalizeParseResult({
        originalInput: input,
        normalizedInput: effectiveInput,
        context: commandContext,
        semanticRuntime,
        result: aiPlanResult,
        parserSource: 'ai-plan',
      });
    }

    const patternResult = this.browserCommandAtomicService.parseAtomicCommand(effectiveInput);
    if (patternResult) {
      return this.finalizeParseResult({
        originalInput: input,
        normalizedInput: effectiveInput,
        context: commandContext,
        semanticRuntime,
        result: patternResult,
        parserSource: 'pattern-parser',
      });
    }

    try {
      const aiResult = await this.parseWithAI(effectiveInput, commandContext);
      return this.finalizeParseResult({
        originalInput: input,
        normalizedInput: effectiveInput,
        context: commandContext,
        semanticRuntime,
        result:
          !aiResult.success && loginFallbackFailureMetadata
            ? this.withParserMetadata(aiResult, loginFallbackFailureMetadata)
            : aiResult,
        parserSource: 'ai',
      });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to parse with AI: ${errorMsg}`);
      return this.finalizeParseResult({
        originalInput: input,
        normalizedInput: effectiveInput,
        context: commandContext,
        semanticRuntime,
        parserSource: 'ai',
        result: this.withParserMetadata(
          {
            success: false,
            commands: [],
            explanation: `无法解析命令: ${input}`,
          },
          loginFallbackFailureMetadata
        ),
      });
    }
  }

  private async finalizeParseResult(options: {
    originalInput: string;
    normalizedInput: string;
    context: BrowserCommandContext;
    semanticRuntime: ResolvedSemanticRuntime;
    parserSource: string;
    result: ParseBrowserCommandResponse;
  }): Promise<ParseBrowserCommandResponse> {
    return this.browserCommandSemanticLogService.finalizeParseResult(options);
  }

  private withParserMetadata(
    result: ParseBrowserCommandResponse,
    parserMetadata?: Record<string, unknown>
  ): ParseBrowserCommandResponse {
    if (!parserMetadata) {
      return result;
    }

    return {
      ...result,
      parserMetadata: {
        ...(result.parserMetadata || {}),
        ...parserMetadata,
      },
    };
  }

  private async resolveSemanticRuntime(
    input: string,
    context: BrowserCommandContext
  ): Promise<ResolvedSemanticRuntime> {
    return this.browserCommandSemanticRuntimeService.resolveSemanticRuntime(input, context);
  }

  private getActionResolverCandidates(context: BrowserCommandContext): BrowserCommandCandidate[] {
    return this.browserCommandClickContextService.getActionResolverCandidates(context);
  }

  private resolvePendingClickIntent(
    intent: PendingActionIntent,
    context: BrowserCommandContext,
    description: string
  ): BrowserCommand | null {
    return this.browserCommandClickContextService.resolvePendingClickIntent(
      intent,
      context,
      description
    );
  }

  private buildPendingClickIntentFromParams(
    params: Record<string, unknown>,
    source: PendingActionIntentSource
  ): PendingActionIntent | null {
    return this.browserCommandClickContextService.buildPendingClickIntentFromParams(params, source);
  }

  private isExplicitNonTextClickTarget(target: string): boolean {
    return this.browserCommandClickContextService.isExplicitNonTextClickTarget(target);
  }

  private resolveClickCommandsWithContext(
    commands: BrowserCommand[],
    context: BrowserCommandContext,
    source: PendingActionIntentSource
  ): BrowserCommand[] {
    return this.browserCommandClickContextService.resolveClickCommandsWithContext(
      commands,
      context,
      source
    );
  }

  private parseWithCommandContext(
    input: string,
    context: BrowserCommandContext,
    runtimeRules: RuntimeSemanticRule[]
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
        const navigationResult = this.browserCommandNavigationService.parseNavigationCommandDetailed(
          `打开 ${strippedInput}`,
          context,
          {
            resolveUrl: (target) => this.resolveUrl(target),
            getKnownTargets: () => this.getUrlPatterns(),
          },
          {
            runtimeRules,
          }
        );
        if (navigationResult.status === 'success' && navigationResult.response) {
          return navigationResult.response;
        }

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
        const actionResult = this.browserCommandActionService.parseActionCommandDetailed(
          `点击 ${strippedInput}`,
          context,
          {
            getActionCandidates: () => this.getActionResolverCandidates(context),
            resolvePendingClickIntent: (intent, description) =>
              this.resolvePendingClickIntent(intent, context, description),
          },
          {
            runtimeRules,
            allowDefaultFallback: true,
          }
        );
        if (actionResult.status === 'success' && actionResult.response) {
          return actionResult.response;
        }

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
      case 'smart_search': {
        const searchResult = this.browserCommandSearchService.parseSearchCommandDetailed(
          `${commandType === 'smart_search' ? '智搜' : '搜索'} ${strippedInput}`,
          context,
          {
            runtimeRules,
          }
        );
        if (searchResult.status === 'success' && searchResult.response) {
          return searchResult.response;
        }
        return null;
      }
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

  private validateAIResolvedCommands(
    input: string,
    context: BrowserCommandContext,
    commands: BrowserCommand[]
  ): BrowserCommand[] | null {
    return this.browserCommandClickContextService.validateAIResolvedCommands(
      input,
      context,
      commands
    );
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

  private async parseWithLoginAIPlan(
    input: string,
    context: BrowserCommandContext,
    triggerReason?: string
  ): Promise<ParseBrowserCommandResponse | null> {
    const plan = await this.browserExecutionPlannerService.buildLoginFallbackPlan(
      input,
      context,
      this.getUrlPatterns()
    );
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
      explanation: plan.explanation || `将执行 ${validatedCommands.length} 个登录步骤`,
      parserMetadata: {
        login: {
          status: 'success',
          reason: 'login-ai-fallback-used',
          triggerReason,
          fallbackUsed: true,
        },
      },
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
