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
    maxInputTokens: 4000,
    maxOutputTokens: 2000,
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
      const textBlock = items.map((item: any, idx: number) => {
        if (typeof item === 'object' && item !== null) {
          return `[条目 ${idx + 1}] ${item.title || item.name || ''}\n${item.summary || item.content || item.snippet || JSON.stringify(item)}`;
        }
        return `[条目 ${idx + 1}] ${String(item)}`;
      }).join('\n\n');

      return {
        systemPrompt: `你是一个专业的总结分析助手。请对传入的列表条目进行客观、严谨、要点清晰的 Markdown 结构化总结。
输出要求：
1. 语言简炼、结构规范，使用 Markdown 标题、列表或表格。
2. 保持客观事实，禁止无中生有。
3. 必须输出合法 JSON，格式为: {"markdown_content": "# 标题\\n\\n总结正文..."}`,
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
    maxOutputTokens: 2000,
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
    maxInputTokens: 4000,
    maxOutputTokens: 1000,
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
        systemPrompt: `请提取文本的关键摘要。输出 JSON 格式: {"summary": "摘要内容"}`,
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
    maxOutputTokens: 2000,
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
