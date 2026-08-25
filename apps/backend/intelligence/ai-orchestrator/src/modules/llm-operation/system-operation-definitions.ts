import type { LlmOperationIdV1 } from '@ops/backend-deterministic-plan';
import type { LlmOperationStatus } from './registry/types';

export interface SystemOperationDefinition {
  displayName: string;
  description: string;
  goals: string[];
  status: LlmOperationStatus;
}

/** Single metadata source for seeding, catalog projection, and lifecycle. */
export const SYSTEM_OPERATION_DEFINITIONS: Record<LlmOperationIdV1, SystemOperationDefinition> = {
  summarize_list: {
    displayName: '列表摘要',
    description: '对列表文本、搜索结果或文章项集合做精炼要点总结',
    goals: ['summarize', 'news_summary', 'list_summary'],
    status: 'active',
  },
  summarize_text: {
    displayName: '文本摘要',
    description: '对长文本段落做关键摘要提取',
    goals: ['summarize_text', 'summarize'],
    status: 'active',
  },
  generate_text: {
    displayName: '标准 LLM 文本生成',
    description: '在禁用工具、外部访问和副作用的契约内，根据用户指令及可选可信上下文生成文本',
    goals: [
      'generate_text',
      'general_response',
      'grounded_advice',
      'recommendation',
      'explain',
      'draft',
      'compose',
      'reasoning',
    ],
    status: 'active',
  },
  transform_text: {
    displayName: '标准 LLM 文本变换',
    description:
      '在禁用工具和外部访问的契约内，将用户提示词作为指令，对给定文本或上一执行结果进行分析、建议、翻译、改写、润色、提取、合并或格式化',
    goals: [
      'text_processing',
      'transform_text',
      'analyze_text',
      'grounded_advice',
      'recommendation',
      'translate',
      'rewrite',
      'format_markdown',
      'merge_notes',
    ],
    status: 'active',
  },
  extract_structured_fields: {
    displayName: '结构化字段提取',
    description: '按照明确字段清单从非结构化文本中提取结构化 JSON',
    goals: ['extract_fields', 'structured_extraction'],
    status: 'active',
  },
  rewrite_to_markdown: {
    displayName: 'Markdown 格式化（兼容）',
    description: '旧版 Markdown 格式化；新规划使用 transform_text',
    goals: ['format_markdown', 'rewrite'],
    status: 'deprecated',
  },
  classify_intent_label: {
    displayName: '意图标签分类（兼容）',
    description: '旧版用户可执行意图分类；意图分类现由路由器内部负责',
    goals: ['classify_intent'],
    status: 'deprecated',
  },
  merge_multi_source_notes: {
    displayName: '多源笔记合并（兼容）',
    description: '旧版多源合并；新规划使用 transform_text',
    goals: ['merge_notes'],
    status: 'deprecated',
  },
};

export function listActiveSystemOperationIds(): LlmOperationIdV1[] {
  return (Object.keys(SYSTEM_OPERATION_DEFINITIONS) as LlmOperationIdV1[])
    .filter((operationId) => SYSTEM_OPERATION_DEFINITIONS[operationId].status === 'active')
    .sort();
}
