import { computeContractDigest } from '@ops/backend-runtime-capability-contract';
import type { LlmOperationIdV1 } from '@ops/backend-deterministic-plan';
import type { LlmOperationTemplate } from './llm-operation.registry';
import { computeOperationDigest } from './operation-digest.util';

const USER_PROMPT_TEMPLATES: Record<LlmOperationIdV1, string> = {
  summarize_list: '请对以下内容做结构化总结：\n\n{{items}}',
  rewrite_to_markdown: '请重写并格式化以下内容：\n\n{{content}}',
  summarize_text: '请按系统要求对以下文本进行总结：\n\n{{text}}',
  extract_structured_fields: '文本：\n\n{{text}}',
  classify_intent_label: '文本：\n\n{{text}}',
  merge_multi_source_notes: '源数据：\n\n{{sources}}',
};

export function buildOperationManifest(
  operationId: LlmOperationIdV1,
  template: LlmOperationTemplate,
  version: string,
): Record<string, unknown> {
  const { systemPrompt } = template.buildPrompt({});
  const variables = Object.keys(template.inputSchema?.properties || {});

  return {
    version,
    inputSchema: closeTopLevelObjectSchema(template.inputSchema),
    outputSchema: closeTopLevelObjectSchema(template.outputSchema),
    prompt: {
      systemTemplate: systemPrompt,
      userTemplate: USER_PROMPT_TEMPLATES[operationId],
      variables,
      type: 'chat',
    },
    promptTemplateId: template.promptTemplateId,
    modelPolicyId: template.modelPolicyId,
    temperature: template.temperature,
    maxInputTokens: template.maxInputTokens,
    maxOutputTokens: template.maxOutputTokens,
    timeoutMs: 180000,
    repair: {
      enabled: true,
      maxAttempts: 1,
      promptTemplate: 'schema-repair-v1',
    },
    executionPolicy: {
      tools: 'disabled',
      externalAccess: 'denied',
      sideEffects: 'none',
    },
  };
}

function closeTopLevelObjectSchema(
  schema: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!schema) return null;
  return {
    ...schema,
    additionalProperties: false,
  };
}

export function computeOperationDigestFromManifest(
  manifest: Record<string, unknown>,
  version: string,
): string {
  const prompt = (manifest.prompt as Record<string, unknown>) || {};
  const repair = (manifest.repair as Record<string, unknown>) || {};
  const executionPolicy = (manifest.executionPolicy as Record<string, unknown>) || {};

  return computeOperationDigest({
    inputSchema: (manifest.inputSchema as Record<string, unknown> | null) ?? null,
    outputSchema: (manifest.outputSchema as Record<string, unknown> | null) ?? null,
    promptSystemTemplate: String(prompt.systemTemplate || ''),
    promptUserTemplate: String(prompt.userTemplate || ''),
    promptVariables: Array.isArray(prompt.variables)
      ? prompt.variables.filter((item): item is string => typeof item === 'string')
      : [],
    promptTemplateId: String(manifest.promptTemplateId || ''),
    version,
    modelPolicyId: String(manifest.modelPolicyId || ''),
    temperature: Number(manifest.temperature ?? 0),
    maxInputTokens: Number(manifest.maxInputTokens ?? 0),
    maxOutputTokens: Number(manifest.maxOutputTokens ?? 0),
    repairPromptTemplate:
      typeof repair.promptTemplate === 'string' ? repair.promptTemplate : undefined,
    executionPolicyTools: executionPolicy.tools === 'enabled' ? 'enabled' : 'disabled',
  });
}

export function computeOperationContractDigest(
  operationId: string,
  version: string,
  manifest: Record<string, unknown>,
): string {
  return computeContractDigest({
    apiVersion: 'ops-automation/v2',
    kind: 'Capability',
    metadata: {
      id: operationId,
      version,
      sourceType: 'llm_operation',
    },
    contracts: {
      input: {
        schema: (manifest.inputSchema as Record<string, unknown> | null) ?? {},
      },
      output: {
        schema: (manifest.outputSchema as Record<string, unknown> | null) ?? {},
      },
    },
    runtime: { type: 'llm_operation' },
  });
}
