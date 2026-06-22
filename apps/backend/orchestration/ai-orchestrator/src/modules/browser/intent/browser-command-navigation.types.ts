import type {
  BrowserCommandContext,
  ParseBrowserCommandResponse,
} from './browser-command.types';

export interface NavigationProfileEntry {
  ruleId?: string;
  targetTerms: string[];
  destinationUrl?: string;
  destinationPath?: string;
  intentTerms: string[];
  localeHints: string[];
}

export interface NavigationProfile {
  intentTerms: string[];
  entries: NavigationProfileEntry[];
}

export interface NavigationCommandHelpers {
  resolveUrl: (target: string) => string;
  getKnownTargets: () => Record<string, string>;
}

export interface NavigationParseResult {
  status: 'success' | 'no_match';
  response?: ParseBrowserCommandResponse;
}

export interface NavigationParseContext {
  input: string;
  commandContext: BrowserCommandContext;
  helpers: NavigationCommandHelpers;
}
