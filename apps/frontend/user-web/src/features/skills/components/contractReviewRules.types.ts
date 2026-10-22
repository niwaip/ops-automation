export type RuleScope = 'org' | 'personal';

export type PartyPosition = 'party_a' | 'party_b' | 'both';

export type ContractTypeKey =
  | 'software_development'
  | 'procurement'
  | 'employment'
  | 'lease'
  | 'nda'
  | 'general';

export interface BuiltinRuleCheckpoint {
  title: string;
  category: string;
  severity: 'HIGH' | 'MEDIUM';
  position: PartyPosition; // party_a (甲方委托方), party_b (乙方受托方), both (双方通用)
  rationale: string;
  recommendation: string;
}

export interface UserCustomRule {
  id: string;
  scope: RuleScope; // 'org' (企业组织级红线) | 'personal' (个人专属要点)
  applicablePosition: PartyPosition; // 'party_a' (甲方重点) | 'party_b' (乙方重点) | 'both' (双方通用)
  title: string;
  category: string;
  contractType: string; // 'all' | ContractTypeKey
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  rule: string;
  recommendedRevision?: string;
  enabled: boolean;
  creator?: string;
  createdAt?: string;
}

export interface EnterpriseLegalProfile {
  legalEntityName: string;
  aliases: string[];
  creditCode?: string;
  defaultContractRole: 'seller' | 'buyer' | 'neutral';
}

export const STORAGE_KEY_USER_RULES = 'ops_user_contract_checkpoints';
export const STORAGE_KEY_ORG_RULES = 'ops_org_contract_checkpoints';
export const STORAGE_KEY_LEGAL_PROFILE = 'ops_enterprise_legal_profile';
export const LEGACY_STORAGE_KEY = 'ops_custom_contract_checkpoints';

export const DEFAULT_ENTERPRISE_PROFILE: EnterpriseLegalProfile = {
  legalEntityName: '富士通（中国）信息系统有限公司',
  aliases: ['富士通', '富士通（中国）', '富士通信息', 'Fujitsu', 'Fujitsu China', '富士通株式会社'],
  creditCode: '913100006072834521',
  defaultContractRole: 'seller',
};
