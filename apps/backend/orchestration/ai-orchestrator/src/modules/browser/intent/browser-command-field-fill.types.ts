import type {
  BrowserCommandCandidate,
  BrowserCommandContext,
  BrowserCommandCandidateLocator,
  ParseBrowserCommandResponse,
} from './browser-command.types';

export interface FieldFillProfileEntry {
  ruleId?: string;
  fieldTerms: string[];
  canonicalField?: string;
  regionTerms: string[];
  valueHints: string[];
  intentTerms: string[];
  localeHints: string[];
}

export interface FieldFillProfile {
  intentTerms: string[];
  entries: FieldFillProfileEntry[];
}

export interface FieldFillCommandHelpers {
  getAvailableCandidates: () => BrowserCommandCandidate[];
  getAvailableInputs: () => string[];
}

export interface FieldFillParseResult {
  status: 'success' | 'no_match';
  response?: ParseBrowserCommandResponse;
}

export interface FieldFillParseContext {
  input: string;
  commandContext: BrowserCommandContext;
  helpers: FieldFillCommandHelpers;
}

export interface ParsedFieldFillCandidate {
  candidateId: string;
  kind: 'input' | 'field';
  label?: string;
  summary?: string;
  field?: string;
  region?: string;
  text?: string;
  elementId?: string;
  dataTestId?: string;
  preferredLocator?: BrowserCommandCandidateLocator;
  selector?: string;
}
