export type ReviewElementCategory =
  | 'FORM_AND_VALIDITY' // 形式完整与生效要件
  | 'DISPUTE_AND_GOVERNING' // 争议管辖与适用法
  | 'LIABILITY_AND_REMEDY' // 违约责任与救济
  | 'INTELLECTUAL_PROPERTY' // 知识产权与归属
  | 'CONFIDENTIALITY' // 保密范围与期限
  | 'DELIVERY_AND_ACCEPTANCE' // 交付履行与验收
  | 'PAYMENT_AND_SETTLEMENT' // 付款结算与账期
  | 'TERMINATION_AND_SURVIVAL' // 合同解除与存续
  | 'GENERAL_COMMERCIAL'; // 通用商事要件

export type StandardContractType =
  | 'nda'
  | 'software_development'
  | 'procurement'
  | 'employment'
  | 'lease'
  | 'general';

export type PartyPosition = 'buyer' | 'seller' | 'neutral';

export type ReviewSeverity = 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS';

export interface ExtractedLegalFacts {
  // 工期要素
  deliveryDays?: number;
  deliveryDayType?: 'working_day' | 'calendar_day' | 'unspecified';
  
  // 保密期限要素
  confidentialityYears?: number;
  isPerpetualDuration?: boolean;
  isTradeSecretSurvivalDifferentiated?: boolean;
  
  // 责任限额要素
  hasLiabilityCap?: boolean;
  liabilityCapType?: 'percentage' | 'fixed_amount' | 'unlimited' | 'paid_amount';
  capPercentage?: number;
  excludesGrossNegligence?: boolean;
  
  // 争议管辖要素
  forumType?: 'court' | 'arbitration' | 'unspecified';
  forumLocation?: 'buyer_venue' | 'seller_venue' | 'neutral_venue' | 'unspecified';
  
  // 交付验收要素
  hasSourceCodeDelivery?: boolean;
  trialPeriodDays?: number;
  isDeemedAcceptedEnabled?: boolean;
  
  // 知识产权归属
  ipOwnershipType?: 'custom_exclusive' | 'shared' | 'supplier_retained' | 'license_only';
  hasThirdPartyInfringementIndemnity?: boolean;
  
  // 违约金费率要素
  dailyDamagesRate?: number; // 每日违约金费率（如 0.0005 表示 0.05%）

  // 付款结算
  isPaymentTiedToInternalAudit?: boolean;
  paymentTermsDays?: number;
}

export interface ClauseLegalFinding {
  id?: string;
  elementId?: string;
  elementCode?: string;
  category: string;
  severity: ReviewSeverity;
  title: string;
  riskSummary: string;
  legalAdvice?: string;
  recommendedRevision?: string;
  evidenceQuote?: string;
  charStart?: number;
  charEnd?: number;
  matchedFacts?: Partial<ExtractedLegalFacts>;
}

export interface ReviewElement {
  id: string; // 要件唯一标识，如 "soft_source_code_delivery"
  code: string; // 规范编码，如 "SOFT-01"
  title: string; // 要件名称
  category: ReviewElementCategory;
  applicableContractTypes: StandardContractType[];
  applicablePosition: 'buyer' | 'seller' | 'both';
  severity: ReviewSeverity;
  checkType: 'PRESENCE' | 'SUBSTANTIVE' | 'FORM'; // 必备存在性 / 实质合理性 / 形式规范

  /**
   * 结构化事实匹配条件
   */
  factMatcher?: (facts: ExtractedLegalFacts, clauseText: string, clauseTitle: string) => boolean;

  /**
   * 正则文本匹配兜底
   */
  textMatcher?: (clauseText: string, clauseTitle: string) => boolean;

  /**
   * 必备要件在全合同文本中的覆盖检测函数（返回 true 表示该要件缺失）
   */
  missingDetector?: (fullText: string) => boolean;

  /**
   * 风险事实描述与研判说明
   */
  riskSummary: string;
  legalAdvice: string;

  /**
   * 标准示范修改条款
   */
  recommendedRevision?: string | ((originalText: string) => string);

  /**
   * 声明式配置参数
   */
  version?: string;
  thresholds?: any;
  criteria?: any;
  positionPolarity?: any;
  compareRule?: any;
}

export * from './review-element-config.types';
