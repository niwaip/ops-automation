import {
  WORD_PARAMETER_RULE_NAMES,
  type WordParameterRuleName,
} from './detect-rule-registry';

export type { WordParameterRuleName } from './detect-rule-registry';

export type WordDocumentParameterRuleProfile = {
  documentType: string;
  compareCandidateRules: WordParameterRuleName[];
  parameterCheckRules: WordParameterRuleName[];
};

export type HeaderFieldSpec = {
  key: string;
  aliases: string[];
};

export const DEFAULT_WORD_PARAMETER_RULE_PROFILE: WordDocumentParameterRuleProfile = {
  documentType: 'report',
  compareCandidateRules: [],
  parameterCheckRules: [],
};

export const ALL_WORD_PARAMETER_RULE_NAMES: WordParameterRuleName[] = [...WORD_PARAMETER_RULE_NAMES];

export const WORD_DOCUMENT_PARAMETER_RULE_PROFILES: Record<string, WordDocumentParameterRuleProfile> = {
  contract: {
    documentType: 'contract',
    compareCandidateRules: [...ALL_WORD_PARAMETER_RULE_NAMES],
    parameterCheckRules: [...ALL_WORD_PARAMETER_RULE_NAMES],
  },
  report: DEFAULT_WORD_PARAMETER_RULE_PROFILE,
};

export const HEADER_FIELD_SPECS: HeaderFieldSpec[] = [
  { key: 'contractNo', aliases: ['合同编号', '合同号', '契約番号', '契約no', 'no.', 'contract no'] },
  { key: 'signingDate', aliases: ['签订日期', '签约日期', '締結日', '契約締結日', 'dated', 'date'] },
  { key: 'signingPlace', aliases: ['签订地点', '签约地点', '締結場所', '契約締結場所'] },
  { key: 'partyAName', aliases: ['委托方', '甲方', '委託者', 'entrusting party', 'party a'] },
  { key: 'partyBName', aliases: ['受托方', '乙方', '受託者', 'entrusted party', 'party b'] },
  { key: 'serviceName', aliases: ['服务名称', '服务内容', '服务项目', '服务项目名称', 'サービス名称', 'サービス名', '業務名称', '業務名'] },
  { key: 'projectName', aliases: ['项目名称', '项目', 'プロジェクト名', 'プロジェクト'] },
  { key: 'serviceLocation', aliases: ['服务地点', '服务地址', '履行地点', '系统设置场所', '系统设定场所', '系统安装场所', 'サービス場所', '履行場所', '技術サービスの場所', 'システム設置場所', 'システム設定場所', 'システム導入場所'] },
];
