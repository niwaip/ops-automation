export type SemanticRuleSetStatus =
  | 'DRAFT'
  | 'VALIDATING'
  | 'CANARY'
  | 'ACTIVE'
  | 'ARCHIVED'
  | 'ROLLED_BACK';

export type SemanticRuleType =
  | 'INTENT_ALIAS'
  | 'FIELD_ALIAS'
  | 'REGION_ALIAS'
  | 'ENTITY_ALIAS'
  | 'ROW_REFERENCE'
  | 'READ_INTENT'
  | 'LOGIN_PHRASE';

export type SemanticRuleCategory =
  | 'LOGIN'
  | 'NAVIGATION'
  | 'FIELD_FILL'
  | 'MENU_SELECTION'
  | 'DETAIL_OPEN'
  | 'READ_VALUE'
  | 'ROW_ACTION'
  | 'SEARCH'
  | 'GENERIC_ALIAS';

export interface SemanticRuleDTO {
  id?: string;
  type: SemanticRuleType;
  category?: SemanticRuleCategory;
  name: string;
  enabled: boolean;
  priority: number;
  stop_on_match?: boolean;
  flags?: string;
  patterns: string[];
  outputs: Record<string, unknown>;
  examples?: string[];
  negative_examples?: string[];
  tags?: string[];
  note?: string;
}
