import { jsonSchemaValidator } from '@ops/backend-runtime-capability-contract';
import type { LlmOperationIdV1 } from '@ops/backend-deterministic-plan';

export interface LlmOperationTemplate {
  operationId: LlmOperationIdV1;
  promptTemplateId: string;
  version: string;
  modelPolicyId: string;
  temperature: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  /** Oversize input policy: 'reject' (fail-closed, default) or 'truncate' (keep the budget-sized prefix + notice). */
  oversizeInput?: 'reject' | 'truncate';
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  buildPrompt: (input: Record<string, any>) => { systemPrompt: string; userPrompt: string };
  parseAndValidateOutput: (rawText: string) => Record<string, any>;
}

export const LLM_OPERATION_TEMPLATES: { [K in LlmOperationIdV1]: LlmOperationTemplate } = {
  summarize_list: {
    operationId: 'summarize_list',
    promptTemplateId: 'news-summary',
    version: '1',
    modelPolicyId: 'task-default',
    temperature: 0,
    maxInputTokens: 8000,
    maxOutputTokens: 4000,
    inputSchema: {
      type: 'object',
      required: ['items'],
      properties: {
        items: { type: 'array' },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['markdown_content'],
      properties: {
        markdown_content: { type: 'string' },
      },
    },
    buildPrompt: (input: Record<string, any>) => {
      const items = Array.isArray(input.items) ? input.items : [input.items || ''];
      const textBlock = items
        .slice(0, 10)
        .map((item: any, idx: number) => {
          if (typeof item === 'object' && item !== null) {
            const title = String(item.title || item.name || item.heading || '').trim();
            const body = String(
              item.summary || item.snippet || item.content || item.description || item.text || ''
            ).trim();
            const cleanBody = body || (item.raw_content ? String(item.raw_content).slice(0, 800) : '');
            const truncatedBody = cleanBody.length > 1200 ? `${cleanBody.slice(0, 1200)}...` : cleanBody;
            return `[条目 ${idx + 1}] ${title ? `标题: ${title}\n` : ''}${truncatedBody}`;
          }
          const strVal = String(item).trim();
          return `[条目 ${idx + 1}] ${strVal.length > 1200 ? `${strVal.slice(0, 1200)}...` : strVal}`;
        })
        .join('\n\n');

      return {
        systemPrompt: `你是一个专业的总结分析助手。请对传入的列表条目进行客观、严谨、要点清晰的 Markdown 结构化总结。
输出要求：
1. 语言简炼、结构规范，使用 Markdown 标题、列表或表格。
2. 保持客观事实，禁止无中生有。
3. 摘要正文控制在 800 个中文字符以内，合并重复信息，禁止复述大段原文。
4. 必须输出合法 JSON，格式为: {"markdown_content": "# 标题\\n\\n总结正文..."}`,
        userPrompt: `请对以下内容做结构化总结：\n\n${textBlock}`,
      };
    },
    parseAndValidateOutput: (rawText: string) => {
      const json = parseJsonFromText(rawText);
      const markdownContent = json.markdown_content || json.markdown || json.content;
      if (!markdownContent) {
        throw new Error("Missing mandatory 'markdown_content' field in LLM operation output JSON");
      }
      const res = { markdown_content: String(markdownContent) };
      const val = jsonSchemaValidator.validate(res, LLM_OPERATION_TEMPLATES.summarize_list.outputSchema!);
      if (!val.valid) {
        throw new Error(`OUTPUT_SCHEMA_VIOLATION: ${val.errors?.map(e => e.message).join(', ')}`);
      }
      return res;
    },
  },

  rewrite_to_markdown: {
    operationId: 'rewrite_to_markdown',
    promptTemplateId: 'rewrite-to-markdown',
    version: '1',
    modelPolicyId: 'task-default',
    temperature: 0,
    maxInputTokens: 4000,
    maxOutputTokens: 8000,
    inputSchema: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { type: 'string' },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['markdown_content'],
      properties: {
        markdown_content: { type: 'string' },
      },
    },
    buildPrompt: (input: Record<string, any>) => {
      const content = typeof input.content === 'string' ? input.content : JSON.stringify(input.content || '');
      return {
        systemPrompt: `你是一个 Markdown 格式化专家。请将输入内容重写为美观、符合 GitHub Flavored Markdown 规范的文本。
必须输出合法 JSON，格式为: {"markdown_content": "# Markdown正文..."}`,
        userPrompt: `请重写并格式化以下内容：\n\n${content}`,
      };
    },
    parseAndValidateOutput: (rawText: string) => {
      const json = parseJsonFromText(rawText);
      const markdownContent = json.markdown_content || json.markdown || json.content;
      if (!markdownContent) {
        throw new Error("Missing mandatory 'markdown_content' field in LLM operation output JSON");
      }
      const res = { markdown_content: String(markdownContent) };
      const val = jsonSchemaValidator.validate(res, LLM_OPERATION_TEMPLATES.rewrite_to_markdown.outputSchema!);
      if (!val.valid) {
        throw new Error(`OUTPUT_SCHEMA_VIOLATION: ${val.errors?.map(e => e.message).join(', ')}`);
      }
      return res;
    },
  },

  summarize_text: {
    operationId: 'summarize_text',
    promptTemplateId: 'summarize-text',
    version: '1',
    modelPolicyId: 'task-default',
    temperature: 0,
    maxInputTokens: 48000,
    maxOutputTokens: 2000,
    oversizeInput: 'truncate',
    inputSchema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string' },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['summary'],
      properties: {
        summary: { type: 'string' },
      },
    },
    buildPrompt: (input: Record<string, any>) => {
      const text = String(input.text || '');
      return {
        systemPrompt: `你是一位专业的内容总结助手。请对输入的文本做高质量总结。

## 内容要求
1. 忠实原文：只使用原文中明确存在的信息，不猜测、不补造、不添加观点或评论。
2. 覆盖核心：先梳理原文的主题结构，再逐主题提炼要点；核心主题不可遗漏，次要细节可省略。
3. 事实保真：保留原文中的数值、单位、日期、人名、机构名、专有名词等关键事实，不得改写或近似。
4. 核心观点与结论：原文中若有作者的核心观点、判断或结论性表述，必须提炼并忠实呈现，不得曲解立场；原文没有明确观点或结论时，不要强行添加。
5. 简洁：去掉寒暄、重复、冗余和铺垫性表述，直接呈现结论与要点。
6. 语言：使用简体中文；原文为其他语言时翻译为中文，关键专有名词可保留原文。

## 格式要求
1. 必须使用 Markdown 结构化呈现，禁止把多个要点用分号（；）串联成一大段连续文字。
2. 单一主题：输出一段简洁总结。
3. 多个要点：使用 Markdown 列表（- ），每个要点独占一行。
4. 多个主题或章节：使用 ## 小标题分段，段内要点用列表呈现。
5. 适合对比的数据：使用 Markdown 表格。
6. 总结以一句总括开头（说明文档/文本的性质与主题），再展开要点。
7. 提炼出的核心观点与结论，用「核心观点与结论」小节单独呈现，放于要点之后。

## 输出格式
必须输出合法 JSON：{"summary": "Markdown 总结内容"}，不要输出其他任何内容。`,
        userPrompt: `文本：\n\n${text}`,
      };
    },
    parseAndValidateOutput: (rawText: string) => {
      const json = parseJsonFromText(rawText);
      if (!json.summary) {
        throw new Error("Missing mandatory 'summary' field in LLM operation output JSON");
      }
      const res = { summary: String(json.summary) };
      const val = jsonSchemaValidator.validate(res, LLM_OPERATION_TEMPLATES.summarize_text.outputSchema!);
      if (!val.valid) {
        throw new Error(`OUTPUT_SCHEMA_VIOLATION: ${val.errors?.map(e => e.message).join(', ')}`);
      }
      return res;
    },
  },

  extract_structured_fields: {
    operationId: 'extract_structured_fields',
    promptTemplateId: 'extract-structured-fields',
    version: '1',
    modelPolicyId: 'task-default',
    temperature: 0,
    maxInputTokens: 4000,
    maxOutputTokens: 1500,
    inputSchema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string' },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['fields'],
      properties: {
        fields: { type: 'object' },
      },
    },
    buildPrompt: (input: Record<string, any>) => {
      const text = String(input.text || '');
      return {
        systemPrompt: `请从文本中提取结构化字段。输出 JSON 格式: {"fields": { ... }}`,
        userPrompt: `文本：\n\n${text}`,
      };
    },
    parseAndValidateOutput: (rawText: string) => {
      const json = parseJsonFromText(rawText);
      if (!json.fields) {
        throw new Error("Missing mandatory 'fields' field in LLM operation output JSON");
      }
      const res = { fields: json.fields };
      const val = jsonSchemaValidator.validate(res, LLM_OPERATION_TEMPLATES.extract_structured_fields.outputSchema!);
      if (!val.valid) {
        throw new Error(`OUTPUT_SCHEMA_VIOLATION: ${val.errors?.map(e => e.message).join(', ')}`);
      }
      return res;
    },
  },

  classify_intent_label: {
    operationId: 'classify_intent_label',
    promptTemplateId: 'classify-intent-label',
    version: '1',
    modelPolicyId: 'task-default',
    temperature: 0,
    maxInputTokens: 2000,
    maxOutputTokens: 500,
    inputSchema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string' },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['label'],
      properties: {
        label: { type: 'string' },
        confidence: { type: 'number' },
      },
    },
    buildPrompt: (input: Record<string, any>) => {
      const text = String(input.text || '');
      return {
        systemPrompt: `请分类意图标签。输出 JSON 格式: {"label": "标签", "confidence": 0.95}`,
        userPrompt: `文本：\n\n${text}`,
      };
    },
    parseAndValidateOutput: (rawText: string) => {
      const json = parseJsonFromText(rawText);
      if (!json.label) {
        throw new Error("Missing mandatory 'label' field in LLM operation output JSON");
      }
      const res = { label: String(json.label), confidence: Number(json.confidence || 1.0) };
      const val = jsonSchemaValidator.validate(res, LLM_OPERATION_TEMPLATES.classify_intent_label.outputSchema!);
      if (!val.valid) {
        throw new Error(`OUTPUT_SCHEMA_VIOLATION: ${val.errors?.map(e => e.message).join(', ')}`);
      }
      return res;
    },
  },

  merge_multi_source_notes: {
    operationId: 'merge_multi_source_notes',
    promptTemplateId: 'merge-multi-source-notes',
    version: '1',
    modelPolicyId: 'task-default',
    temperature: 0,
    maxInputTokens: 4000,
    maxOutputTokens: 8000,
    inputSchema: {
      type: 'object',
      required: ['sources'],
      properties: {
        sources: { type: 'array' },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['markdown_content'],
      properties: {
        markdown_content: { type: 'string' },
      },
    },
    buildPrompt: (input: Record<string, any>) => {
      const sources = Array.isArray(input.sources) ? input.sources : [input.sources || ''];
      return {
        systemPrompt: `请整合多源笔记内容。输出 JSON 格式: {"markdown_content": "# 整合笔记\\n..."}`,
        userPrompt: `源数据：\n\n${JSON.stringify(sources)}`,
      };
    },
    parseAndValidateOutput: (rawText: string) => {
      const json = parseJsonFromText(rawText);
      const markdownContent = json.markdown_content || json.markdown || json.content;
      if (!markdownContent) {
        throw new Error("Missing mandatory 'markdown_content' field in LLM operation output JSON");
      }
      const res = { markdown_content: String(markdownContent) };
      const val = jsonSchemaValidator.validate(res, LLM_OPERATION_TEMPLATES.merge_multi_source_notes.outputSchema!);
      if (!val.valid) {
        throw new Error(`OUTPUT_SCHEMA_VIOLATION: ${val.errors?.map(e => e.message).join(', ')}`);
      }
      return res;
    },
  },
};

function parseJsonFromText(text: string): Record<string, any> {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json/i, '').replace(/```$/i, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```/i, '').replace(/```$/i, '').trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Ignored
      }
    }
    throw new Error('LLM response text is not valid JSON format');
  }
}
