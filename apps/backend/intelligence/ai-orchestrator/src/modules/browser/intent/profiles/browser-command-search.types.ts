import type { BrowserCommandContext, ParseBrowserCommandResponse } from '../browser-command.types';

export type SearchIntentKind =
  | 'search'
  | 'smart_search'
  | 'list_results'
  | 'click_result'
  | 'engine_search';

export interface SearchProfileTermEntry {
  term: string;
  ruleId?: string;
}

export interface SearchProfile {
  searchTerms: SearchProfileTermEntry[];
  smartSearchTerms: SearchProfileTermEntry[];
  listResultTerms: SearchProfileTermEntry[];
  clickResultTerms: SearchProfileTermEntry[];
  localeHints: string[];
}

export interface SearchParseResult {
  status: 'success' | 'no_match';
  response?: ParseBrowserCommandResponse;
}

export interface SearchParseContext {
  input: string;
  commandContext: BrowserCommandContext;
}
