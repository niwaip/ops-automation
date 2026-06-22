import { Injectable } from '@nestjs/common';
import type { RuntimeSemanticRule } from '../../../client/browser-semantics.client';
import { BrowserCommandNavigationService } from './browser-command-navigation.service';
import { BrowserCommandSearchService } from './browser-command-search.service';
import type { BrowserCommand, ParseBrowserCommandResponse } from './browser-command.types';

type SequentialCommandOptions = {
  runtimeRules: RuntimeSemanticRule[];
  currentPageUrl?: string;
  resolveUrl: (target: string) => string;
  getKnownTargets: () => Record<string, string>;
};

@Injectable()
export class BrowserCommandSequentialService {
  constructor(
    private readonly browserCommandNavigationService: BrowserCommandNavigationService,
    private readonly browserCommandSearchService: BrowserCommandSearchService
  ) {}

  parseSequentialCommands(
    input: string,
    options: SequentialCommandOptions
  ): ParseBrowserCommandResponse | null {
    const normalizedInput = input
      .replace(/[，。；]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalizedInput) {
      return null;
    }

    const commands: BrowserCommand[] = [];
    const explanations: string[] = [];
    let parserMetadata: Record<string, unknown> | undefined;
    let remaining = normalizedInput;

    const navigationStep = this.parseSequentialNavigationStep(remaining, options);
    if (navigationStep) {
      commands.push(navigationStep.command);
      explanations.push(`打开 ${navigationStep.url}`);
      parserMetadata = this.mergeParserMetadata(parserMetadata, navigationStep.parserMetadata);
      remaining = this.stripLeadingConnector(remaining.slice(navigationStep.consumedLength));
    }

    if (remaining) {
      const searchResult = this.browserCommandSearchService.parseSearchCommandDetailed(
        remaining,
        {},
        { runtimeRules: options.runtimeRules }
      );
      if (searchResult.status === 'success' && searchResult.response) {
        commands.push(...searchResult.response.commands);
        parserMetadata = this.mergeParserMetadata(
          parserMetadata,
          searchResult.response.parserMetadata
        );
        const normalizedExplanation = searchResult.response.explanation
          .replace(/^将依次/, '')
          .replace(/^将/, '')
          .trim();
        if (normalizedExplanation) {
          explanations.push(normalizedExplanation);
        }
        remaining = '';
      }
    }

    if (commands.length >= 2 && remaining.length === 0) {
      return {
        success: true,
        commands,
        explanation: `将依次${explanations.join('，')}`,
        parserMetadata,
      };
    }

    return null;
  }

  private stripLeadingConnector(text: string): string {
    return text.replace(/^(?:\s|并且|并|然后|再|后|接着)+/i, '').trim();
  }

  private parseSequentialNavigationStep(
    input: string,
    options: SequentialCommandOptions
  ): {
    command: BrowserCommand;
    url: string;
    consumedLength: number;
    parserMetadata?: Record<string, unknown>;
  } | null {
    const prefixMatch = input.match(
      /^(?:打开|导航到|访问|前往|goto|open|navigate|go\s*to|visit)\s*/i
    );
    if (!prefixMatch) {
      return null;
    }

    const navigationPrefix = prefixMatch[0].trim();
    const rest = input.slice(prefixMatch[0].length);
    const tryParseNavigationTarget = (
      target: string,
      consumedLength: number
    ): {
      command: BrowserCommand;
      url: string;
      consumedLength: number;
      parserMetadata?: Record<string, unknown>;
    } | null => {
      const navigationInput = `${navigationPrefix} ${target}`.trim();
      const result = this.browserCommandNavigationService.parseNavigationCommandDetailed(
        navigationInput,
        {
          currentPageUrl: options.currentPageUrl,
        },
        {
          resolveUrl: options.resolveUrl,
          getKnownTargets: options.getKnownTargets,
        },
        {
          runtimeRules: options.runtimeRules,
        }
      );
      const command = result.response?.commands[0];
      const url =
        command?.tool === 'navigate' && typeof command.params?.url === 'string'
          ? command.params.url
          : undefined;
      if (!url || !command) {
        return null;
      }

      return {
        command,
        url,
        consumedLength,
        parserMetadata: result.response?.parserMetadata,
      };
    };

    const firstToken = rest.match(/^([^\s]+)/)?.[1];
    if (firstToken) {
      const firstTokenResult = tryParseNavigationTarget(
        firstToken,
        prefixMatch[0].length + firstToken.length
      );
      if (firstTokenResult) {
        return firstTokenResult;
      }
    }

    const fallbackMatch = rest.match(
      /^(.+?)(?=\s*(?:并|然后|再|后|接着)?\s*(?:智搜|智能搜索|搜索|search|点击|选择|click)|$)/i
    );
    if (!fallbackMatch?.[1]) {
      return null;
    }

    return tryParseNavigationTarget(
      fallbackMatch[1].trim(),
      prefixMatch[0].length + fallbackMatch[0].length
    );
  }

  private mergeParserMetadata(
    current: Record<string, unknown> | undefined,
    next: Record<string, unknown> | undefined
  ): Record<string, unknown> | undefined {
    if (!current) {
      return next;
    }
    if (!next) {
      return current;
    }

    return {
      ...current,
      ...next,
    };
  }
}
