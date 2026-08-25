import { computeContractDigest } from '@ops/backend-runtime-capability-contract';
import type { LlmOperationIdV1 } from '@ops/backend-deterministic-plan';
import type { LlmOperationTemplate } from './llm-operation.registry';
import { computeOperationDigest } from './operation-digest.util';

const USER_PROMPT_TEMPLATES: Record<LlmOperationIdV1, string> = {
  summarize_list: '请对以下内容做结构化总结：\n\n{{items}}',
  generate_text: '任务指令：{{instruction}}\n\n可用上下文：\n{{context}}',
  transform_text: '文本处理指令：{{instruction}}\n\n待处理内容：\n{{content}}',
  rewrite_to_markdown: '请重写并格式化以下内容：\n\n{{content}}',
  summarize_text: '请按系统要求对以下文本进行总结：\n\n{{text}}',
  extract_structured_fields: '目标字段：{{target_fields}}\n\n文本：\n\n{{text}}',
  classify_intent_label: '文本：\n\n{{text}}',
  merge_multi_source_notes: '源数据：\n\n{{sources}}',
};

export function buildOperationManifest(
  operationId: LlmOperationIdV1,
  template: LlmOperationTemplate,
  version: string
): Record<string, unknown> {
  const { systemPrompt } = template.buildPrompt({});
  const variables = Object.keys(template.inputSchema?.properties || {});

  // Negative eval categories that intentionally do not apply to this
  // operation's shape:
  // - 'invalid-json': single-string-output operations accept bare text via
  //   the output-validator graceful fallback, so non-JSON output is valid.
  // - 'over-budget': oversize 'truncate' operations degrade gracefully
  //   instead of throwing BUDGET_EXCEEDED.
  const exemptNegativeCategories: string[] = [];
  const outputProps = template.outputSchema?.properties as Record<string, unknown> | undefined;
  if (outputProps) {
    const declaredPrimaryOutput = template.outputSchema?.primaryOutput;
    const outputKeys = Object.keys(outputProps);
    const primaryOutput =
      typeof declaredPrimaryOutput === 'string' && declaredPrimaryOutput in outputProps
        ? declaredPrimaryOutput
        : outputKeys.length === 1
          ? outputKeys[0]
          : undefined;
    const primaryProperty = primaryOutput
      ? (outputProps[primaryOutput] as Record<string, unknown> | undefined)
      : undefined;
    const declaredType = primaryProperty?.type;
    if (
      declaredType === 'string' ||
      (Array.isArray(declaredType) && declaredType.includes('string'))
    ) {
      exemptNegativeCategories.push('invalid-json');
    }
  }
  if (template.oversizeInput === 'truncate') {
    exemptNegativeCategories.push('over-budget');
  }

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
    modelOutputMode: template.modelOutputMode ?? 'json',
    timeoutMs: 180000,
    repair: {
      enabled: true,
      maxAttempts: 1,
      promptTemplate: 'schema-repair-v1',
    },
    inputPolicy: {
      oversize: template.oversizeInput ?? 'reject',
    },
    evalPolicy: {
      exemptNegativeCategories,
    },
    executionPolicy: {
      tools: 'disabled',
      externalAccess: 'denied',
      sideEffects: 'none',
    },
  };
}

function closeTopLevelObjectSchema(
  schema: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  if (!schema) return null;
  return {
    ...schema,
    additionalProperties: false,
  };
}

export function computeOperationDigestFromManifest(
  manifest: Record<string, unknown>,
  version: string
): string {
  const prompt = (manifest.prompt as Record<string, unknown>) || {};
  const repair = (manifest.repair as Record<string, unknown>) || {};
  const executionPolicy = (manifest.executionPolicy as Record<string, unknown>) || {};
  const inputPolicy = (manifest.inputPolicy as Record<string, unknown>) || {};
  const evalPolicy = (manifest.evalPolicy as Record<string, unknown>) || {};
  const evalExempt = Array.isArray(evalPolicy.exemptNegativeCategories)
    ? (evalPolicy.exemptNegativeCategories as string[]).filter(
        (item): item is string => typeof item === 'string'
      )
    : [];

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
    modelOutputMode: manifest.modelOutputMode === 'text' ? 'text' : 'json',
    repairPromptTemplate:
      typeof repair.promptTemplate === 'string' ? repair.promptTemplate : undefined,
    inputPolicyOversize: inputPolicy.oversize === 'truncate' ? 'truncate' : 'reject',
    evalPolicyExempt: [...evalExempt].sort(),
    executionPolicyTools: executionPolicy.tools === 'enabled' ? 'enabled' : 'disabled',
  });
}

export function computeOperationContractDigest(
  operationId: string,
  version: string,
  manifest: Record<string, unknown>
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
