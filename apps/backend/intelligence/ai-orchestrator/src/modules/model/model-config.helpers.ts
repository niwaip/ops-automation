import type { AIModelConfig, AIModelDTO } from '../../interfaces';
import type { PromptCachingConfig } from '../../client/llm-client';

export function normalizeModelConfig(config?: AIModelConfig): AIModelConfig {
  const normalized: AIModelConfig = {
    ...(config || {}),
  };

  const defaultScope =
    typeof normalized.default_scope === 'object' && normalized.default_scope
      ? normalized.default_scope
      : {};
  normalized.default_scope = {
    global: defaultScope.global === true || normalized.default === true,
    admin_chat: defaultScope.admin_chat === true,
    admin_task: defaultScope.admin_task === true,
    audio_transcription: defaultScope.audio_transcription === true,
    ocr: defaultScope.ocr === true,
    image_generation: defaultScope.image_generation === true,
  };

  const routingPreferences =
    typeof normalized.routing_preferences === 'object' && normalized.routing_preferences
      ? normalized.routing_preferences
      : {};
  normalized.routing_preferences = {
    prefer_for_code: routingPreferences.prefer_for_code === true,
  };

  const invocation =
    typeof normalized.invocation === 'object' && normalized.invocation ? normalized.invocation : {};
  const promptCaching =
    typeof invocation.prompt_caching === 'object' && invocation.prompt_caching
      ? invocation.prompt_caching
      : {};
  normalized.invocation = {
    transport: invocation.transport,
    prompt_caching: {
      enabled: promptCaching.enabled !== false,
      mode: promptCaching.mode,
      retention: promptCaching.retention,
      min_tokens: typeof promptCaching.min_tokens === 'number' ? promptCaching.min_tokens : 1024,
    },
  };

  normalized.capability_tier = normalized.capability_tier === 'advanced' ? 'advanced' : 'standard';
  normalized.default = normalized.default_scope.global === true;

  return normalized;
}

export function getPromptCachingConfigForModel(model: AIModelDTO): PromptCachingConfig | undefined {
  const configured = model.config.invocation?.prompt_caching;
  if (configured?.enabled === false) {
    return configured;
  }

  return {
    enabled: configured?.enabled ?? true,
    mode:
      configured?.mode || (model.provider === 'anthropic' ? 'anthropic_explicit' : 'openai_auto'),
    retention: configured?.retention || (model.provider === 'anthropic' ? '5m' : 'in_memory'),
    min_tokens: typeof configured?.min_tokens === 'number' ? configured.min_tokens : 1024,
  };
}

export function getDefaultScopeWeight(model: AIModelDTO): number {
  const scope = model.config.default_scope;
  return (
    (scope?.global ? 4 : 0) +
    (scope?.admin_chat ? 3 : 0) +
    (scope?.admin_task ? 3 : 0) +
    (scope?.audio_transcription ? 3 : 0) +
    (scope?.ocr ? 3 : 0) +
    (scope?.image_generation ? 3 : 0) +
    (model.config.default === true ? 1 : 0)
  );
}

export function getCapabilityWeight(model: AIModelDTO): number {
  return model.config.capability_tier === 'advanced' ? 2 : 0;
}
