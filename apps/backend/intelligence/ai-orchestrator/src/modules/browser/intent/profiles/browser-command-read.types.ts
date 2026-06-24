import type {
  BrowserCommandCandidate,
  BrowserCommandContext,
  ParseBrowserCommandResponse,
} from '../browser-command.types';

export interface ReadProfileEntry {
  ruleId?: string;
  targetTerms: string[];
  fieldTerms: string[];
  regionTerms: string[];
  intentTerms: string[];
  localeHints: string[];
}

export interface ReadProfile {
  intentTerms: string[];
  entries: ReadProfileEntry[];
}

export interface ReadCommandHelpers {
  getAvailableCandidates: () => BrowserCommandCandidate[];
}

export interface ReadParseResult {
  status: 'success' | 'no_match';
  response?: ParseBrowserCommandResponse;
}

export interface ReadParseContext {
  input: string;
  commandContext: BrowserCommandContext;
  helpers: ReadCommandHelpers;
}
