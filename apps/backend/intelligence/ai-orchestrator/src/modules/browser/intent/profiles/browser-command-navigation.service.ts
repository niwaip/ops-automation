import { Injectable } from '@nestjs/common';
import {
  buildNavigationProfile,
  canonicalizeNavigationText,
} from './browser-command-navigation.profile';
import type {
  NavigationCommandHelpers,
  NavigationParseContext,
  NavigationParseResult,
  NavigationProfileEntry,
} from './browser-command-navigation.types';
import type { RuntimeSemanticRule } from '../../../../client/browser-semantics.client';

@Injectable()
export class BrowserCommandNavigationService {
  parseNavigationCommandDetailed(
    input: string,
    commandContext: NavigationParseContext['commandContext'],
    helpers: NavigationCommandHelpers,
    options?: { runtimeRules?: RuntimeSemanticRule[] }
  ): NavigationParseResult {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    if (!normalizedInput) {
      return { status: 'no_match' };
    }

    const profile = buildNavigationProfile(options?.runtimeRules || []);
    const parsedTarget = this.extractNavigationTarget(normalizedInput, profile.intentTerms);
    if (!parsedTarget) {
      return { status: 'no_match' };
    }

    const directResolution = this.resolveDirectTarget(
      parsedTarget,
      commandContext.currentPageUrl,
      helpers
    );
    if (directResolution) {
      return {
        status: 'success',
        response: {
          success: true,
          commands: [
            {
              tool: 'navigate',
              params: { url: directResolution.url },
              description: `导航到 ${parsedTarget}`,
            },
          ],
          explanation: `将导航到 ${directResolution.url}`,
          parserMetadata: {
            navigation: {
              status: 'success',
              reason: directResolution.reason,
              resolvedTarget: parsedTarget,
              resolvedUrl: directResolution.url,
              usedRuntimeProfile: false,
              matchedRuntimeRuleIds: [],
            },
          },
        },
      };
    }

    const matchedEntry = this.matchNavigationEntry(parsedTarget, profile.entries);
    if (!matchedEntry) {
      return { status: 'no_match' };
    }

    const resolvedUrl = this.resolveProfileEntryUrl(matchedEntry, commandContext.currentPageUrl);
    if (!resolvedUrl) {
      return { status: 'no_match' };
    }

    return {
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'navigate',
            params: { url: resolvedUrl },
            description: `导航到 ${parsedTarget}`,
          },
        ],
        explanation: `将导航到 ${resolvedUrl}`,
        parserMetadata: {
          navigation: {
            status: 'success',
            reason: matchedEntry.destinationUrl ? 'navigation-runtime-url' : 'navigation-runtime-path',
            resolvedTarget: parsedTarget,
            resolvedUrl,
            usedRuntimeProfile: true,
            matchedRuntimeRuleIds: matchedEntry.ruleId ? [matchedEntry.ruleId] : [],
          },
        },
      },
    };
  }

  private extractNavigationTarget(input: string, intentTerms: string[]): string | null {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    const sortedIntentTerms = [...intentTerms].sort((left, right) => right.length - left.length);

    for (const intentTerm of sortedIntentTerms) {
      if (!intentTerm) {
        continue;
      }

      const lowerInput = normalizedInput.toLowerCase();
      const lowerIntentTerm = intentTerm.toLowerCase();
      if (!lowerInput.startsWith(lowerIntentTerm)) {
        continue;
      }

      const rest = normalizedInput.slice(intentTerm.length).trim();
      if (!rest) {
        continue;
      }

      return rest.replace(/^(?:到|去)\s*/i, '').trim();
    }

    return null;
  }

  private resolveDirectTarget(
    target: string,
    currentPageUrl: string | undefined,
    helpers: NavigationCommandHelpers
  ): { url: string; reason: string } | null {
    const normalizedTarget = target.trim();
    if (!normalizedTarget) {
      return null;
    }

    if (/^[#/?]/.test(normalizedTarget)) {
      if (!currentPageUrl) {
        return null;
      }

      try {
        return {
          url: new URL(normalizedTarget, currentPageUrl).toString(),
          reason: 'navigation-direct-path',
        };
      } catch {
        return null;
      }
    }

    if (/^https?:\/\//i.test(normalizedTarget) || /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(normalizedTarget)) {
      return {
        url: helpers.resolveUrl(normalizedTarget),
        reason: 'navigation-direct-url',
      };
    }

    const matchedKnownTarget = this.matchKnownTarget(normalizedTarget, helpers.getKnownTargets());
    return matchedKnownTarget
      ? {
          url: helpers.resolveUrl(matchedKnownTarget),
          reason: 'navigation-known-site',
        }
      : null;
  }

  private matchKnownTarget(target: string, knownTargets: Record<string, string>): string | null {
    const normalizedTarget = canonicalizeNavigationText(target);
    for (const key of Object.keys(knownTargets)) {
      if (canonicalizeNavigationText(key) === normalizedTarget) {
        return key;
      }
    }

    return null;
  }

  private matchNavigationEntry(
    target: string,
    entries: NavigationProfileEntry[]
  ): NavigationProfileEntry | null {
    const normalizedTarget = canonicalizeNavigationText(target);
    if (!normalizedTarget) {
      return null;
    }

    const scoredEntries = entries
      .map((entry) => ({
        entry,
        score: Math.max(
          ...entry.targetTerms.map((term) => {
            const normalizedTerm = canonicalizeNavigationText(term);
            if (!normalizedTerm) {
              return 0;
            }
            if (normalizedTarget === normalizedTerm) {
              return 300;
            }
            if (normalizedTarget.startsWith(normalizedTerm) || normalizedTerm.startsWith(normalizedTarget)) {
              return 150;
            }
            return 0;
          })
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);

    return scoredEntries[0]?.entry || null;
  }

  private resolveProfileEntryUrl(
    entry: NavigationProfileEntry,
    currentPageUrl: string | undefined
  ): string | null {
    if (entry.destinationUrl) {
      return entry.destinationUrl;
    }

    if (!entry.destinationPath || !currentPageUrl) {
      return null;
    }

    try {
      return new URL(entry.destinationPath, currentPageUrl).toString();
    } catch {
      return null;
    }
  }
}
