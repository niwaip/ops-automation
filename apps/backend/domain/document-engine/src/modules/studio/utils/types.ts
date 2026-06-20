// Carbone Engine - Studio AI Types

import { DocumentElement, DocumentStructure } from '../document-structure.service';

type AiModelDescriptor = {
  id: string;
  status: string;
  [key: string]: unknown;
};

type AiModelsResponse = {
  models?: AiModelDescriptor[];
};

type AiTestResponse = {
  success?: boolean;
  response?: any;
  error?: string;
};

/**
 * 处理阶段枚举
 */
export enum ProcessingStage {
  DOCUMENT_UNDERSTANDING = 'document_understanding',
  SECTION_ANALYSIS = 'section_analysis',
  INTEGRATION = 'integration',
  COMPLETE = 'complete',
}

/**
 * 进度信息
 */
export interface ProcessingProgress {
  stage: ProcessingStage;
  stageName: string; // 中文阶段名称
  progress: number; // 0-100
  message: string; // 详细进度消息
  currentSection?: string; // 当前处理的章节
}

/**
 * 文档理解结果
 */
export interface DocumentUnderstanding {
  documentType: string; // 文档类型判断
  mainPurpose: string; // 文档主要用途
  keyEntities?: string[]; // 关键实体（如：甲方、乙方、项目）
  dataSchema?: string; // 建议的数据架构描述
  sections: Array<{
    name: string; // 章节名称（如"第一条"、"第二条"）
    content: string; // 章节内容摘要
    purpose: string; // 章节用途说明
    needsParameterization: boolean; // 是否需要参数化
    estimatedParams: string[]; // 预估可能需要的参数
  }>;
  parties: Array<{
    role: string; // 角色（甲方、乙方）
    fieldsNeeded: string[]; // 需要的字段（名称、地址等）
  }>;
}

/**
 * 章节参数化结果
 */
export interface SectionParameterization {
  sectionName: string;
  suggestions: Array<{
    originalText: string;
    variablePath: string;
    variableName: string;
    fieldType?: string; // 字段类型 (text, date, number, amount, etc.)
    significance: string; // 字段意义说明
    usage?: string; // 【自动填充说明】: 如何识别并获取此内容
    context: string; // 原文上下文
    confidence: number;
  }>;
}

/**
 * 参数路径映射规则
 * 用于将AI生成的变量路径规范化为标准路径
 */
export interface PathMappingRule {
  patterns: string[]; // 匹配模式（支持通配符）
  standardPath: string; // 标准路径
  description: string; // 描述
}

/**
 * 默认参数路径映射表
 * 定义AI可能生成的变量路径到标准路径的映射
 */
export const DEFAULT_PATH_MAPPINGS: PathMappingRule[] = [
  // 执行摘要/总结相关
  {
    patterns: [
      'd.executionSummary',
      'd.executionsummary',
      'd.execution_summary',
      'd.summaryText',
      'd.summarytext',
    ],
    standardPath: 'd.summary',
    description: '执行摘要/总结内容',
  },
  // 分析报告相关
  {
    patterns: [
      'd.analysisReport',
      'd.analysisreport',
      'd.analysis_report',
      'd.analysisText',
      'd.analysistext',
      'd.analysisResult',
      'd.analysisresult',
    ],
    standardPath: 'd.analysis',
    description: '分析报告内容',
  },
  // 日期/时间相关
  {
    patterns: [
      'd.generatedDate',
      'd.generateddate',
      'd.generated_date',
      'd.datetime',
      'd.timestamp',
      'd.createTime',
      'd.createtime',
      'd.createdAt',
    ],
    standardPath: 'd.date',
    description: '日期/时间',
  },
  // 标题相关
  {
    patterns: [
      'd.docTitle',
      'd.doctitle',
      'd.doc_title',
      'd.reportTitle',
      'd.reporttitle',
      'd.mainTitle',
      'd.maintitle',
    ],
    standardPath: 'd.title',
    description: '文档标题',
  },
  // 内容相关
  {
    patterns: [
      'd.mainContent',
      'd.maincontent',
      'd.main_content',
      'd.bodyContent',
      'd.bodycontent',
      'd.contentText',
      'd.contenttext',
    ],
    standardPath: 'd.content',
    description: '主要内容',
  },
  // 描述相关
  {
    patterns: ['d.descriptionText', 'd.descriptiontext', 'd.desc', 'd.detail', 'd.details'],
    standardPath: 'd.description',
    description: '描述内容',
  },
  // 结果相关
  {
    patterns: ['d.resultText', 'd.resulttext', 'd.outcome', 'd.conclusion'],
    standardPath: 'd.result',
    description: '结果内容',
  },
  // 备注相关
  {
    patterns: ['d.noteText', 'd.notetext', 'd.comment', 'd.comments', 'd.remark'],
    standardPath: 'd.notes',
    description: '备注/注释',
  },
];

/**
 * 模版配置 - 描述整个模版的结构和变量映射
 */
export interface TemplateConfig {
  // 模版类型（根据文档内容自动识别）
  templateType: string;
  // 需要保留的静态元素（如标题）
  staticElements: StaticElement[];
  // 需要循环的表格
  tableLoops: TableLoop[];
  // 需要循环的图片
  imageLoops: ImageLoop[];
  // 组合变量（如 Step X: screenshot + 图片）
  combinedVariables: CombinedVariable[];
  // 变量映射建议
  variableMappings: VariableMapping[];
  // 分组循环（用户手动指定的一组连续元素作为循环）
  groupLoops?: GroupLoop[];
  // 分组循环（用户手动指定的一组连续元素作为循环）
  elementGroups?: Record<string, number[]>;
  // 忽略的元素索引
  ignoredElements?: number[];
  // 忽略的分组ID
  ignoredGroups?: string[];
  // 分析说明
  analysisNotes: string[];
}

/**
 * 分组循环配置
 * 用户手动创建的一组元素，作为循环体
 */
export interface GroupLoop {
  // 分组ID
  groupId?: string;
  // 元素索引列表
  groupIndices: number[];
  // 循环数组路径
  arrayPath: string;
  // 文本元素索引（如果分组中包含文本）
  textElement?: number;
  // 图片元素索引（如果分组中包含图片）
  imageElement?: number;
  // 原因说明
  reason: string;
}

export interface CombinedVariable {
  id: string;
  type: 'step-screenshot';
  stepNumber: number;
  textContent: string;
  imageId: string;
  imagePath: string; // 如 d.steps[0].screenshot
  reason: string;
}

export interface StaticElement {
  type: 'title' | 'heading' | 'paragraph';
  content: string;
  reason: string;
}

export interface TableLoop {
  tableIndex: number;
  headerRow: string;
  dataRowCount: number;
  arrayPath: string; // 如 d.steps
  columnMappings: ColumnMapping[];
  reason: string;
  confidence: number;
}

export interface ColumnMapping {
  headerName: string;
  variablePath: string; // 如 d.steps[].action
  sampleValue: string;
  columnIndex?: number; // 列索引（可选）
}

export interface ImageLoop {
  imageIndex: number;
  imageId: string;
  altText: string;
  arrayPath: string; // 如 d.screenshots
  reason: string;
  confidence: number;
}

export interface VariableMapping {
  path: string;
  sampleValue: string;
  index: number;
  type: 'text' | 'number' | 'date' | 'image' | 'heading' | 'amount' | 'enum';
  reason: string;
  usage?: string;
  fieldType?: string;
}

/**
 * 内容模式识别结果
 */
export interface ContentPattern {
  type: 'heading' | 'table' | 'image' | 'step' | 'summary';
  matched: boolean;
  extractedValue?: string;
  arrayPath?: string;
}

export interface AIIdentifyResponse {
  templateConfig: TemplateConfig;
  suggestions: VariableMapping[];
  rawSuggestions?: any[]; // 原始建议数据，用于前端显示更详细的信息
  loops: TableLoop[];
  images: ImageLoop[];
  combinedVariables: CombinedVariable[]; // 组合变量（文本+图片）
  analyzedAt: string;
  documentStats: {
    totalElements: number;
    tables: number;
    images: number;
    stepScreenshots: number; // 步骤截图组合变量数量
    potentialLoops: number;
  };
  contextAnalysis?: {
    detectedTemplateType: string;
    userIntent: string;
    usedAI?: boolean; // 是否使用了AI分析
    aiServiceUrl?: string; // AI服务地址
    flowType?: 'quick' | 'multi-stage'; // 处理流程类型：快速流程（有underlineInfo）或多阶段流程
  };
}

/**
 * 用户意图
 */
export interface UserIntent {
  preserveTitles: boolean;
  preserveHeadings: boolean;
  tableLoops: boolean;
  imageLoops: boolean;
  customLoops: string[];
  summary: string;
}
