import type {
  ExtractedLegalFacts,
  ReviewElementCategory,
  ReviewSeverity,
  StandardContractType,
} from './review-element.types';

export interface ReviewElementThresholds {
  /** 允许的工期缩短容忍比例（例如 0.2 表示缩短超过 20% 判定为高风险；未配置时使用严格比较） */
  durationReductionToleranceRatio?: number;
  /** 自然日与工作日的折算比例（如 0.7142857；若未配置，引擎判定为“不确定”，禁止代码中自行假设） */
  calendarToWorkDayRatio?: number;
  /** 每日违约金最高容忍费率（如 0.0005 表示 0.05%） */
  maxDailyDamagesRate?: number;
  /** 必备要件最少包含子项数量（如 NDA-04 必须全部覆盖 5 项法定除外） */
  minRequiredSubItemsCount?: number;
}

export interface PolarityOutcome {
  riskLevel: ReviewSeverity;
  summaryTemplate?: string;
  adviceTemplate?: string;
  elementId?: string;
  elementCode?: string;
}

export type PositionPolarityTarget = ReviewSeverity | PolarityOutcome;

export interface PositionPolarityRule {
  /**
   * 结构化字段取值到立场的映射
   * 例如：
   * {
   *   "seller_venue": { "seller": "LOW", "buyer": "HIGH" },
   *   "buyer_venue": { "buyer": "LOW", "seller": "HIGH" }
   * }
   */
  [fieldValue: string]: {
    seller?: PositionPolarityTarget;
    buyer?: PositionPolarityTarget;
    neutral?: PositionPolarityTarget;
    both?: PositionPolarityTarget;
    default?: PositionPolarityTarget;
  };
}

export interface CompareRuleConfig {
  /**
   * 比对研判模式：
   * - 'numeric_direction': 数值大小变化（工期天数、违约金费率等）
   * - 'polarity_lookup': 状态/枚举值变更通过 positionPolarity 查找
   * - 'damages_scope': 赔偿范围（支持排除条款识别）
   * - 'presence_deletion': 条款删除时的责任研判
   */
  mode: 'numeric_direction' | 'polarity_lookup' | 'damages_scope' | 'presence_deletion' | 'custom';
  numericDirection?: 'increase_is_risk' | 'decrease_is_risk';
  /** 针对删除场景的立场研判映射 */
  deletionPolarity?: {
    seller?: PositionPolarityTarget;
    buyer?: PositionPolarityTarget;
    both?: PositionPolarityTarget;
  };
  summaryTemplates?: {
    favorable?: string;
    unfavorable?: string;
    neutral?: string;
    uncertain?: string;
  };
  adviceTemplates?: {
    favorable?: string;
    unfavorable?: string;
    neutral?: string;
    uncertain?: string;
  };
}

export interface ReviewElementCriteriaConfig {
  /** 文本触发匹配正则表达式（字符串形式，便于序列化与配置传输） */
  patterns?: string[];
  /** 排除/否定句式正则（命中后不作为风险触发，或识别为正面合规排除） */
  negationPatterns?: string[];
  /** 必备要件子项正则表达式列表（如保密协议五大法定除外情形） */
  requiredSubItems?: string[];
  /** 肯定性交付约定识别正则（如源代码必须明确交付） */
  affirmativePatterns?: string[];
  /** 关联合同结构化事实字段 */
  factField?: keyof ExtractedLegalFacts;
  /** 结构化事实条件判定 */
  factCondition?: {
    operator: 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'isTrue' | 'isFalse' | 'exists';
    targetValue?: any;
  };
}

export interface ReviewElementConfig {
  /** 要件唯一标识，如 "soft_calendar_day_trap" */
  id: string;
  /** 业务规范编码，如 "SOFT-03" */
  code: string;
  /** 配置版本号，如 "1.0.0" */
  version: string;
  /** 要件标题 */
  title: string;
  /** 分类 */
  category: ReviewElementCategory;
  /** 适用的合同类型列表 */
  applicableContractTypes: StandardContractType[];
  /** 适用立场 */
  applicablePosition: 'buyer' | 'seller' | 'both';
  /** 风险严重等级 */
  severity: ReviewSeverity;
  /** 检查类型：必备存在性 / 实质合理性 / 形式规范 */
  checkType: 'PRESENCE' | 'SUBSTANTIVE' | 'FORM';
  /** 匹配准则 */
  criteria?: ReviewElementCriteriaConfig;
  /** 业务立场极性表（消除代码中硬编码 if (pos === 'seller')） */
  positionPolarity?: PositionPolarityRule;
  /** 红线比对规则（消除 Comparator 私有分支） */
  compareRule?: CompareRuleConfig;
  /** 阈值配置（如工期换算比例、缩短容忍度、违约金上限等） */
  thresholds?: ReviewElementThresholds;
  /** 风险事实描述与研判说明 */
  riskSummary: string;
  /** 法律建议 */
  legalAdvice: string;
  /** 标准示范修改条款 */
  recommendedRevision?: string;
}
