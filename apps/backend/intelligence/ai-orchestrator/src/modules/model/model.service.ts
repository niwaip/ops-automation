import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  AIModelDTO,
  AIModelConfig,
  ModelReasoningConfig,
  AIProviderConfigDTO,
  AIProviderSummaryDTO,
  CreateModelDTO,
  CreateProviderConfigDTO,
  UpdateProviderConfigDTO,
  APIKeyReference,
  ChatMessage,
  LLMResponse,
  AIProviderModelListDTO,
} from '../../interfaces';
import { OpenAICompatibleClient } from '../../client/openai-compatible';
import { AnthropicMessagesClient } from '../../client/anthropic-messages';
import { LLMClient, PromptCachingConfig } from '../../client/llm-client';

// Persistence file paths. Resolution order:
//   1. AI_MODELS_DATA_DIR env var (explicit override, used by docker-compose.full.yml)
//   2. <repo>/apps/backend/var/cache/ai-orchestrator (walked from process.cwd())
//   3. /app/data (legacy fallback when the package is mounted at /app)
// The previous hardcoded `/app/data` caused silent data loss in stacks where the
// container's working_dir is /workspace rather than /app, because the volume mount
// only exposed the cache directory under the workspace path.
const resolveDefaultDataDir = (): string => {
  if (process.env.NODE_ENV === 'test') {
    return path.join(process.cwd(), '.tmp', 'ai-models');
  }
  // Walk up from cwd until we find the monorepo root that owns apps/backend.
  let cursor = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(cursor, 'apps', 'backend', 'var', 'cache', 'ai-orchestrator');
    if (cursor === path.dirname(cursor)) break; // reached filesystem root
    // Prefer the first monorepo-shaped path that actually exists on disk.
    if (fs.existsSync(path.join(cursor, 'apps', 'backend'))) {
      return candidate;
    }
    cursor = path.dirname(cursor);
  }
  // Fall back to the legacy /app/data path which still works for stacks that
  // bind-mount /workspace/.../cache → /app/data (e.g. docker-compose.base.yml).
  return '/app/data';
};
const DATA_DIR = process.env.AI_MODELS_DATA_DIR || resolveDefaultDataDir();
const MODELS_FILE = path.join(DATA_DIR, 'ai-models.json');
const API_KEYS_FILE = path.join(DATA_DIR, 'ai-api-keys.json');
const PROVIDERS_FILE = path.join(DATA_DIR, 'ai-providers.json');
const PROVIDER_API_KEYS_FILE = path.join(DATA_DIR, 'ai-provider-api-keys.json');

interface PersistedModel {
  model: AIModelDTO;
  apiKeyRef?: APIKeyReference;
}

interface PersistedApiKey {
  id: string;
  apiKey: string;
}

interface PersistedProvider {
  provider: AIProviderConfigDTO;
  apiKeyRef: APIKeyReference;
}

interface PersistedProviderApiKey {
  id: string;
  apiKey: string;
}

export interface ModelSelectionPolicyContext {
  mode?: 'chat' | 'task' | 'audio_transcription';
  userRoles?: string[];
}

/**
 * Model Service
 * Manages AI model registration, configuration, and health status
 * API Keys and models are persisted to files for restart survival
 */
@Injectable()
export class ModelService implements OnModuleInit {
  private readonly logger = new Logger(ModelService.name);
  private models: Map<string, AIModelDTO> = new Map();
  private providers: Map<string, AIProviderConfigDTO> = new Map();
  private apiKeyReferences: Map<string, APIKeyReference> = new Map();
  private providerApiKeyReferences: Map<string, APIKeyReference> = new Map();
  private apiKeys: Map<string, string> = new Map();
  private providerApiKeys: Map<string, string> = new Map();
  private clients: Map<string, LLMClient> = new Map();

  private normalizeModelConfig(config?: AIModelConfig): AIModelConfig {
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
    };

    const routingPreferences =
      typeof normalized.routing_preferences === 'object' && normalized.routing_preferences
        ? normalized.routing_preferences
        : {};
    normalized.routing_preferences = {
      prefer_for_code: routingPreferences.prefer_for_code === true,
    };

    const invocation =
      typeof normalized.invocation === 'object' && normalized.invocation
        ? normalized.invocation
        : {};
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

    normalized.capability_tier =
      normalized.capability_tier === 'advanced' ? 'advanced' : 'standard';
    normalized.default = normalized.default_scope.global === true;

    return normalized;
  }

  private buildClient(model: AIModelDTO, apiKey: string): LLMClient {
    const transport =
      model.config.invocation?.transport ||
      (model.provider === 'anthropic' ? 'anthropic_messages' : 'openai_chat_completions');
    const promptCaching = this.getPromptCachingConfigForModel(model);

    if (transport === 'anthropic_messages') {
      return new AnthropicMessagesClient({
        baseURL: model.api_endpoint,
        apiKey,
        model: model.name,
        provider: model.provider,
        promptCacheRetention: promptCaching?.retention,
      });
    }

    return new OpenAICompatibleClient({
      baseURL: model.api_endpoint,
      apiKey,
      model: model.name,
      provider: model.provider,
      promptCacheRetention: promptCaching?.retention,
    });
  }

  private getPromptCachingConfigForModel(model: AIModelDTO): PromptCachingConfig | undefined {
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

  private getDefaultScopeWeight(model: AIModelDTO): number {
    const scope = model.config.default_scope;
    return (
      (scope?.global ? 4 : 0) +
      (scope?.admin_chat ? 3 : 0) +
      (scope?.admin_task ? 3 : 0) +
      (scope?.audio_transcription ? 3 : 0) +
      (model.config.default === true ? 1 : 0)
    );
  }

  private getCapabilityWeight(model: AIModelDTO): number {
    return model.config.capability_tier === 'advanced' ? 2 : 0;
  }

  private findProviderConfig(provider: string, apiEndpoint: string): AIProviderConfigDTO | null {
    for (const providerConfig of this.providers.values()) {
      if (providerConfig.provider === provider && providerConfig.api_endpoint === apiEndpoint) {
        return providerConfig;
      }
    }

    return null;
  }

  private getProviderConfigForModel(model: AIModelDTO): AIProviderConfigDTO | null {
    if (model.providerConfigId) {
      const providerConfig = this.providers.get(model.providerConfigId);
      if (providerConfig) {
        return providerConfig;
      }
    }

    return this.findProviderConfig(model.provider, model.api_endpoint);
  }

  private getProviderGroupingKey(model: AIModelDTO): string {
    const providerConfig = this.getProviderConfigForModel(model);
    return providerConfig?.id || `${model.provider}::${model.api_endpoint}`;
  }

  private resolveProviderCredential(providerId: string): string | null {
    if (this.providerApiKeys.has(providerId)) {
      return this.providerApiKeys.get(providerId) || null;
    }

    const ref = this.providerApiKeyReferences.get(providerId);
    if (!ref) {
      return null;
    }

    return this.resolveApiKey(ref);
  }

  private hasConfiguredProviderCredential(providerId: string): boolean {
    return Boolean(this.resolveProviderCredential(providerId));
  }

  private upsertProviderConfig(dto: CreateProviderConfigDTO): AIProviderConfigDTO {
    const existing = this.findProviderConfig(dto.provider, dto.api_endpoint);
    const now = new Date();

    if (existing) {
      if (dto.api_key) {
        this.providerApiKeys.set(existing.id, dto.api_key);
      }
      if (dto.env_key || dto.secret_type) {
        this.providerApiKeyReferences.set(existing.id, {
          reference_id:
            dto.env_key ||
            this.providerApiKeyReferences.get(existing.id)?.reference_id ||
            existing.id,
          secret_type:
            dto.secret_type || this.providerApiKeyReferences.get(existing.id)?.secret_type || 'env',
        });
      }
      const updated = {
        ...existing,
        updated_at: now,
      };
      this.providers.set(existing.id, updated);
      return updated;
    }

    const providerConfig: AIProviderConfigDTO = {
      id: uuidv4(),
      provider: dto.provider,
      api_endpoint: dto.api_endpoint,
      created_at: now,
      updated_at: now,
    };
    this.providers.set(providerConfig.id, providerConfig);

    const ref: APIKeyReference = {
      reference_id: dto.env_key || providerConfig.id,
      secret_type: dto.secret_type || 'env',
    };
    this.providerApiKeyReferences.set(providerConfig.id, ref);
    if (dto.api_key) {
      this.providerApiKeys.set(providerConfig.id, dto.api_key);
    }

    return providerConfig;
  }

  private syncProviderConfigFromModel(modelId: string, model: AIModelDTO): void {
    const modelRef = this.apiKeyReferences.get(modelId);
    const apiKey = this.apiKeys.get(modelId) || (modelRef ? this.resolveApiKey(modelRef) : null);
    const providerConfig = this.upsertProviderConfig({
      provider: model.provider,
      api_endpoint: model.api_endpoint,
      ...(apiKey ? { api_key: apiKey } : {}),
      ...(modelRef
        ? {
            env_key: modelRef.reference_id,
            secret_type: modelRef.secret_type,
          }
        : {}),
    });
    if (model.providerConfigId !== providerConfig.id) {
      this.models.set(modelId, {
        ...model,
        providerConfigId: providerConfig.id,
      });
    }
  }

  private clearDefaultScopeOnOtherModels(targetModelId: string, config: AIModelConfig): void {
    const targetScope = config.default_scope;
    if (
      !targetScope?.global &&
      !targetScope?.admin_chat &&
      !targetScope?.admin_task &&
      !targetScope?.audio_transcription
    ) {
      return;
    }

    for (const [modelId, existingModel] of this.models) {
      if (modelId === targetModelId) {
        continue;
      }

      const nextConfig = this.normalizeModelConfig(existingModel.config);
      let changed = false;

      if (targetScope.global && nextConfig.default_scope?.global) {
        nextConfig.default_scope.global = false;
        nextConfig.default = false;
        changed = true;
      }
      if (targetScope.admin_chat && nextConfig.default_scope?.admin_chat) {
        nextConfig.default_scope.admin_chat = false;
        changed = true;
      }
      if (targetScope.admin_task && nextConfig.default_scope?.admin_task) {
        nextConfig.default_scope.admin_task = false;
        changed = true;
      }
      if (targetScope.audio_transcription && nextConfig.default_scope?.audio_transcription) {
        nextConfig.default_scope.audio_transcription = false;
        changed = true;
      }

      if (changed) {
        this.models.set(modelId, {
          ...existingModel,
          config: nextConfig,
          updated_at: new Date(),
        });
      }
    }
  }

  private selectScopedDefaultModel(
    scope: 'global' | 'admin_chat' | 'admin_task' | 'audio_transcription'
  ): AIModelDTO | null {
    const activeModels = this.getActiveModelsWithClients();
    return activeModels.find((model) => model.config.default_scope?.[scope] === true) || null;
  }

  private hasConfiguredCredential(id: string): boolean {
    const model = this.models.get(id);
    if (model) {
      const providerConfig = this.getProviderConfigForModel(model);
      if (providerConfig && this.hasConfiguredProviderCredential(providerConfig.id)) {
        return true;
      }
    }

    if (this.apiKeys.has(id)) {
      return true;
    }

    const ref = this.apiKeyReferences.get(id);
    if (!ref) {
      return false;
    }

    return Boolean(this.resolveApiKey(ref, id));
  }

  private findReusableProviderCredential(
    provider: string,
    apiEndpoint: string
  ): { sourceModelId: string; apiKey: string } | null {
    const candidates = Array.from(this.models.values()).filter((model) => {
      return model.provider === provider && model.api_endpoint === apiEndpoint;
    });

    for (const model of candidates) {
      const ref = this.apiKeyReferences.get(model.id);
      if (!ref) {
        continue;
      }
      const apiKey = this.apiKeys.get(model.id) || this.resolveApiKey(ref, model.id);
      if (apiKey) {
        return {
          sourceModelId: model.id,
          apiKey,
        };
      }
    }

    return null;
  }

  private buildModelApiKeyRef(modelId: string, config?: AIModelConfig): APIKeyReference {
    const explicitRefId = config?.env_key as string | undefined;
    if (explicitRefId) {
      return {
        reference_id: explicitRefId,
        secret_type: (config?.secret_type as 'vault' | 'env' | 'k8s_secret') || 'env',
      };
    }

    return {
      reference_id: `AI_API_KEY_${modelId}`,
      secret_type: 'env',
    };
  }

  private clearModelCredential(id: string): void {
    this.apiKeys.delete(id);
    this.apiKeyReferences.delete(id);
  }

  getPreferredDefaultModel(context?: ModelSelectionPolicyContext): AIModelDTO | null {
    const userRoles = context?.userRoles || [];
    const isAdmin = userRoles.includes('admin');

    if (context?.mode === 'audio_transcription') {
      return this.selectScopedDefaultModel('audio_transcription') || this.getDefaultModel();
    }

    if (isAdmin && context?.mode === 'task') {
      return (
        this.selectScopedDefaultModel('admin_task') ||
        this.selectScopedDefaultModel('admin_chat') ||
        this.selectScopedDefaultModel('global') ||
        this.getDefaultModel()
      );
    }

    if (isAdmin && context?.mode === 'chat') {
      return (
        this.selectScopedDefaultModel('admin_chat') ||
        this.selectScopedDefaultModel('global') ||
        this.getDefaultModel()
      );
    }

    return this.selectScopedDefaultModel('global') || this.getDefaultModel();
  }

  /**
   * Initialize on module init
   */
  async onModuleInit() {
    this.logger.log('Initializing model service...');

    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      this.logger.log(`Created data directory: ${DATA_DIR}`);
    }

    // Load persisted provider configs first
    await this.loadPersistedProviders();

    // Load persisted models first
    await this.loadPersistedModels();
  }

  /**
   * Load persisted models from file
   */
  private async loadPersistedModels(): Promise<void> {
    try {
      this.logger.log(`Checking for persisted models in ${MODELS_FILE}`);

      // Load models
      if (fs.existsSync(MODELS_FILE)) {
        const data = fs.readFileSync(MODELS_FILE, 'utf-8');
        const persisted: PersistedModel[] = JSON.parse(data);

        for (const item of persisted) {
          this.models.set(item.model.id, item.model);
          item.model.config = this.normalizeModelConfig(item.model.config);
          if (item.apiKeyRef) {
            this.apiKeyReferences.set(item.model.id, item.apiKeyRef);
          }
          this.logger.debug(`Loaded model: ${item.model.name} (${item.model.id})`);
        }

        this.logger.log(`Loaded ${persisted.length} persisted models from file`);
      } else {
        this.logger.log(`No persisted models file found at ${MODELS_FILE}`);
      }

      // Load API keys
      if (fs.existsSync(API_KEYS_FILE)) {
        const data = fs.readFileSync(API_KEYS_FILE, 'utf-8');
        const keys: PersistedApiKey[] = JSON.parse(data);

        for (const item of keys) {
          this.apiKeys.set(item.id, item.apiKey);
        }

        this.logger.log(`Loaded ${keys.length} persisted API keys from file`);
      } else {
        this.logger.log(`No persisted API keys file found at ${API_KEYS_FILE}`);
      }

      for (const [id, model] of this.models) {
        this.syncProviderConfigFromModel(id, model);
      }

      // Initialize clients for loaded models
      for (const [id, model] of this.models) {
        const providerConfig = this.getProviderConfigForModel(model);
        const modelRef = this.apiKeyReferences.get(id);
        const apiKey = providerConfig
          ? this.resolveProviderCredential(providerConfig.id)
          : this.apiKeys.get(id) || (modelRef ? this.resolveApiKey(modelRef, id) : null);
        if (apiKey) {
          const client = this.buildClient(model, apiKey);
          this.clients.set(id, client);
          this.logger.log(`Client initialized for model ${model.name} (${id})`);
        }
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to load persisted models: ${errorMsg}`);
    }
  }

  private async loadPersistedProviders(): Promise<void> {
    try {
      if (fs.existsSync(PROVIDERS_FILE)) {
        const data = fs.readFileSync(PROVIDERS_FILE, 'utf-8');
        const persisted: PersistedProvider[] = JSON.parse(data);
        for (const item of persisted) {
          this.providers.set(item.provider.id, item.provider);
          this.providerApiKeyReferences.set(item.provider.id, item.apiKeyRef);
        }
      }

      if (fs.existsSync(PROVIDER_API_KEYS_FILE)) {
        const data = fs.readFileSync(PROVIDER_API_KEYS_FILE, 'utf-8');
        const keys: PersistedProviderApiKey[] = JSON.parse(data);
        for (const item of keys) {
          this.providerApiKeys.set(item.id, item.apiKey);
        }
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to load persisted providers: ${errorMsg}`);
    }
  }

  /**
   * Persist models to file
   */
  private async persistModels(): Promise<void> {
    try {
      // Ensure data directory exists
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        this.logger.log(`Created data directory: ${DATA_DIR}`);
      }

      // Persist models
      const modelsData: PersistedModel[] = [];
      for (const [id, model] of this.models) {
        const apiKeyRef = this.apiKeyReferences.get(id);
        modelsData.push({ model, apiKeyRef });
      }
      fs.writeFileSync(MODELS_FILE, JSON.stringify(modelsData, null, 2));
      this.logger.log(`Wrote ${modelsData.length} models to ${MODELS_FILE}`);

      // Persist API keys (only those with direct key input)
      const keysData: PersistedApiKey[] = [];
      for (const [id, apiKey] of this.apiKeys) {
        keysData.push({ id, apiKey });
      }
      fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keysData, null, 2));
      this.logger.log(`Wrote ${keysData.length} API keys to ${API_KEYS_FILE}`);

      const providersData: PersistedProvider[] = [];
      for (const [id, provider] of this.providers) {
        const apiKeyRef = this.providerApiKeyReferences.get(id);
        if (apiKeyRef) {
          providersData.push({ provider, apiKeyRef });
        }
      }
      fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(providersData, null, 2));

      const providerKeysData: PersistedProviderApiKey[] = [];
      for (const [id, apiKey] of this.providerApiKeys) {
        providerKeysData.push({ id, apiKey });
      }
      fs.writeFileSync(PROVIDER_API_KEYS_FILE, JSON.stringify(providerKeysData, null, 2));

      this.logger.log(
        `Persisted ${modelsData.length} models, ${keysData.length} model API keys and ${providersData.length} providers`
      );
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to persist models: ${errorMsg}`);
    }
  }

  /**
   * List all registered models (only active ones for chat selector)
   */
  async listModels(): Promise<AIModelDTO[]> {
    return Array.from(this.models.values())
      .filter((m) => m.status === 'active')
      .map((m) => ({ ...m, hasApiKey: this.hasConfiguredCredential(m.id) }));
  }

  /**
   * List all registered models for admin (including inactive)
   */
  async listModelsForAdmin(): Promise<AIModelDTO[]> {
    return Array.from(this.models.values()).map((m) => ({
      ...m,
      hasApiKey: this.hasConfiguredCredential(m.id),
    }));
  }

  listProviderSummaries(): AIProviderSummaryDTO[] {
    const grouped = new Map<string, AIProviderSummaryDTO>();
    for (const providerConfig of this.providers.values()) {
      grouped.set(providerConfig.id, {
        id: providerConfig.id,
        provider: providerConfig.provider,
        api_endpoint: providerConfig.api_endpoint,
        modelCount: 0,
        activeModelCount: 0,
        hasCredential: this.hasConfiguredProviderCredential(providerConfig.id),
        advancedModelCount: 0,
        defaultScopes: [],
      });
    }

    for (const model of this.models.values()) {
      const groupKey = this.getProviderGroupingKey(model);
      const existing = grouped.get(groupKey) || {
        id: groupKey,
        provider: model.provider,
        api_endpoint: model.api_endpoint,
        modelCount: 0,
        activeModelCount: 0,
        hasCredential: false,
        advancedModelCount: 0,
        defaultScopes: [],
      };
      existing.modelCount += 1;
      existing.activeModelCount += model.status === 'active' ? 1 : 0;
      existing.hasCredential = existing.hasCredential || this.hasConfiguredCredential(model.id);
      existing.advancedModelCount += model.config.capability_tier === 'advanced' ? 1 : 0;
      const scopeKeys = (
        ['global', 'admin_chat', 'admin_task', 'audio_transcription'] as const
      ).filter((scope) => {
        return model.config.default_scope?.[scope] === true;
      });
      existing.defaultScopes = Array.from(
        new Set([...existing.defaultScopes, ...scopeKeys] as any)
      );
      grouped.set(groupKey, existing);
    }

    return Array.from(grouped.values()).sort((left, right) => {
      if (left.hasCredential !== right.hasCredential) {
        return left.hasCredential ? -1 : 1;
      }
      if (left.modelCount !== right.modelCount) {
        return right.modelCount - left.modelCount;
      }
      return left.provider.localeCompare(right.provider);
    });
  }

  async listProviderConfigs(): Promise<AIProviderConfigDTO[]> {
    return Array.from(this.providers.values()).map((provider) => ({
      ...provider,
      hasCredential: this.hasConfiguredProviderCredential(provider.id),
    }));
  }

  async getProviderConfig(id: string): Promise<AIProviderConfigDTO | null> {
    const provider = this.providers.get(id);
    if (!provider) {
      return null;
    }

    return {
      ...provider,
      hasCredential: this.hasConfiguredProviderCredential(provider.id),
    };
  }

  async createProviderConfig(dto: CreateProviderConfigDTO): Promise<AIProviderConfigDTO> {
    const provider = this.upsertProviderConfig(dto);
    await this.persistModels();
    return {
      ...provider,
      hasCredential: this.hasConfiguredProviderCredential(provider.id),
    };
  }

  async updateProviderConfig(
    id: string,
    updates: UpdateProviderConfigDTO
  ): Promise<AIProviderConfigDTO | null> {
    const existing = this.providers.get(id);
    if (!existing) {
      return null;
    }

    const nextProvider = updates.provider || existing.provider;
    const nextEndpoint = updates.api_endpoint || existing.api_endpoint;
    const duplicate = this.findProviderConfig(nextProvider, nextEndpoint);
    if (duplicate && duplicate.id !== id) {
      throw new Error(`Provider ${nextProvider} with endpoint ${nextEndpoint} already exists`);
    }

    if (updates.api_key) {
      this.providerApiKeys.set(id, updates.api_key);
    }

    if (updates.env_key || updates.secret_type) {
      const currentRef = this.providerApiKeyReferences.get(id);
      this.providerApiKeyReferences.set(id, {
        reference_id: updates.env_key || currentRef?.reference_id || id,
        secret_type: updates.secret_type || currentRef?.secret_type || 'env',
      });
    }

    const updatedProvider: AIProviderConfigDTO = {
      ...existing,
      provider: nextProvider,
      api_endpoint: nextEndpoint,
      updated_at: new Date(),
    };
    this.providers.set(id, updatedProvider);

    for (const [modelId, model] of this.models) {
      if (model.providerConfigId !== id) {
        continue;
      }
      if (
        !model.providerConfigId &&
        (model.provider !== existing.provider || model.api_endpoint !== existing.api_endpoint)
      ) {
        continue;
      }

      const updatedModel: AIModelDTO = {
        ...model,
        provider: nextProvider,
        api_endpoint: nextEndpoint,
        providerConfigId: id,
        updated_at: new Date(),
      };
      this.models.set(modelId, updatedModel);

      const modelRef = this.apiKeyReferences.get(modelId);
      const apiKey =
        this.resolveProviderCredential(id) ||
        this.apiKeys.get(modelId) ||
        (modelRef ? this.resolveApiKey(modelRef, modelId) : null);
      if (apiKey) {
        this.clients.set(modelId, this.buildClient(updatedModel, apiKey));
      }
    }

    await this.persistModels();
    return {
      ...updatedProvider,
      hasCredential: this.hasConfiguredProviderCredential(id),
    };
  }

  async checkProviderHealth(
    id: string
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    const provider = this.providers.get(id);
    if (!provider) {
      return { success: false, error: 'Provider not found' };
    }

    const apiKey = this.resolveProviderCredential(id);
    if (!apiKey) {
      return { success: false, error: 'No credential configured for this provider' };
    }

    try {
      const client = new OpenAICompatibleClient({
        baseURL: provider.api_endpoint,
        apiKey: apiKey,
        model: 'health-check', // dummy model name
      });

      const models = await client.listModels();
      return {
        success: true,
        response: `Successfully connected. Found ${models.length} models available.`,
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  async listProviderModels(id: string): Promise<AIProviderModelListDTO> {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const apiKey = this.resolveProviderCredential(id);
    if (!apiKey) {
      throw new Error('No credential configured for this provider');
    }

    const client = new OpenAICompatibleClient({
      baseURL: provider.api_endpoint,
      apiKey,
      model: 'model-discovery',
    });

    const models = await client.listModels();
    const uniqueModels = Array.from(new Set(models))
      .filter((model) => typeof model === 'string' && model.trim().length > 0)
      .sort((left, right) => left.localeCompare(right));

    return {
      providerConfigId: id,
      models: uniqueModels,
    };
  }

  /**
   * Get a specific model by ID
   */
  async getModel(id: string): Promise<AIModelDTO | null> {
    const model = this.models.get(id);
    if (!model) return null;
    return { ...model, hasApiKey: this.hasConfiguredCredential(id) };
  }

  /**
   * Get model by name
   */
  async getModelByName(name: string): Promise<AIModelDTO | null> {
    for (const [id, model] of this.models) {
      if (model.name === name) {
        return { ...model, hasApiKey: this.hasConfiguredCredential(id) };
      }
    }
    return null;
  }

  /**
   * Get the default model (the one marked as default in config, or the first active one with a client)
   */
  getDefaultModel(): AIModelDTO | null {
    // 1. Try to find the one explicitly marked as default
    for (const model of this.models.values()) {
      if (
        model.status === 'active' &&
        model.config.default_scope?.global === true &&
        this.clients.has(model.id)
      ) {
        return model;
      }
    }

    // 2. Try to find the first active model that has a client
    for (const model of this.models.values()) {
      if (model.status === 'active' && this.clients.has(model.id)) {
        return model;
      }
    }

    return null;
  }

  private resolveModelEntity(id: string): AIModelDTO | null {
    if (id === 'default') {
      return this.getDefaultModel();
    }

    const directModel = this.models.get(id);
    if (directModel) {
      return directModel;
    }

    for (const model of this.models.values()) {
      if (model.name === id) {
        return model;
      }
    }

    return null;
  }

  private getActiveModelsWithClients(): AIModelDTO[] {
    return Array.from(this.models.values()).filter((model) => {
      return model.status === 'active' && this.clients.has(model.id);
    });
  }

  private sortFallbackCandidates(models: AIModelDTO[]): AIModelDTO[] {
    return [...models].sort((left, right) => {
      const scopeDelta = this.getDefaultScopeWeight(right) - this.getDefaultScopeWeight(left);
      if (scopeDelta !== 0) {
        return scopeDelta;
      }
      const capabilityDelta = this.getCapabilityWeight(right) - this.getCapabilityWeight(left);
      if (capabilityDelta !== 0) {
        return capabilityDelta;
      }
      return 0;
    });
  }

  listActiveModelsForRouting(): AIModelDTO[] {
    return this.sortFallbackCandidates(this.getActiveModelsWithClients());
  }

  getFallbackModelIds(
    id: string,
    strategy?: {
      groupOrder: Array<'same_provider' | 'cross_provider'>;
      includeCurrentModel: boolean;
    }
  ): string[] {
    const activeModels = this.getActiveModelsWithClients();
    const currentModel = this.resolveModelEntity(id);
    if (!currentModel) {
      return this.sortFallbackCandidates(activeModels).map((model) => model.id);
    }

    const sameProviderModels = this.sortFallbackCandidates(
      activeModels.filter((model) => {
        return (
          model.id !== currentModel.id &&
          this.getProviderGroupingKey(model) === this.getProviderGroupingKey(currentModel)
        );
      })
    );
    const crossProviderModels = this.sortFallbackCandidates(
      activeModels.filter((model) => {
        return (
          model.id !== currentModel.id &&
          this.getProviderGroupingKey(model) !== this.getProviderGroupingKey(currentModel)
        );
      })
    );
    const groupedCandidates = {
      same_provider: sameProviderModels.map((model) => model.id),
      cross_provider: crossProviderModels.map((model) => model.id),
    };
    const groupOrder = strategy?.groupOrder || ['same_provider', 'cross_provider'];
    const orderedCandidates = groupOrder.flatMap((group) => groupedCandidates[group]);

    return [
      ...(strategy?.includeCurrentModel === false ? [] : [currentModel.id]),
      ...orderedCandidates,
    ];
  }

  /**
   * Resolve modelId (either name, UUID, or 'default') to actual UUID
   */
  async resolveModelId(modelId: string): Promise<string | null> {
    // Handle 'default'
    if (modelId === 'default') {
      const defaultModel = this.getDefaultModel();
      return defaultModel?.id || null;
    }

    // If it looks like a UUID, try to get directly
    if (modelId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      if (this.models.has(modelId)) {
        return modelId;
      }
    }
    // Try to find by name
    const model = await this.getModelByName(modelId);
    return model?.id || null;
  }

  /**
   * Register a new AI model
   */
  async createModel(dto: CreateModelDTO): Promise<AIModelDTO> {
    const id = uuidv4();
    const now = new Date();

    let apiKey: string | null = null;
    const apiKeyRef: APIKeyReference = this.buildModelApiKeyRef(id, dto.config);

    const existingProviderConfig = dto.providerConfigId
      ? this.providers.get(dto.providerConfigId)
      : null;
    const providerConfig = existingProviderConfig
      ? this.upsertProviderConfig({
          provider: existingProviderConfig.provider,
          api_endpoint: existingProviderConfig.api_endpoint,
          ...(dto.api_key ? { api_key: dto.api_key } : {}),
          ...(dto.config?.env_key ? { env_key: dto.config.env_key as string } : {}),
          ...(dto.config?.secret_type
            ? { secret_type: dto.config.secret_type as 'vault' | 'env' | 'k8s_secret' }
            : {}),
        })
      : this.upsertProviderConfig({
          provider: dto.provider,
          api_endpoint: dto.api_endpoint,
          ...(dto.api_key ? { api_key: dto.api_key } : {}),
          ...(dto.config?.env_key ? { env_key: dto.config.env_key as string } : {}),
          ...(dto.config?.secret_type
            ? { secret_type: dto.config.secret_type as 'vault' | 'env' | 'k8s_secret' }
            : {}),
        });

    if (dto.api_key) {
      apiKey = dto.api_key;
      this.apiKeys.set(id, apiKey);
      this.logger.log(`Model ${dto.name} created with direct API key input`);
    } else {
      const explicitRefId = dto.config?.env_key as string | undefined;
      if (explicitRefId) {
        apiKey = this.resolveApiKey(apiKeyRef);
      } else {
        const providerCredential = this.resolveProviderCredential(providerConfig.id);
        if (providerCredential) {
          apiKey = providerCredential;
          this.logger.log(
            `Model ${dto.name} reusing provider credentials from provider ${providerConfig.provider}`
          );
        } else {
          const reusableCredential = this.findReusableProviderCredential(
            dto.provider,
            dto.api_endpoint
          );
          if (reusableCredential) {
            apiKey = reusableCredential.apiKey;
            this.logger.log(
              `Model ${dto.name} reusing provider credentials from model ${reusableCredential.sourceModelId}`
            );
          } else {
            apiKey = this.resolveApiKey(apiKeyRef);
          }
        }
      }

      if (!apiKey) {
        this.logger.warn(`No API key found for model ${dto.name}, client will not be initialized`);
      }
    }

    const normalizedConfig = this.normalizeModelConfig(dto.config);
    const model: AIModelDTO = {
      id,
      name: dto.name,
      provider: providerConfig.provider,
      api_endpoint: providerConfig.api_endpoint,
      providerConfigId: providerConfig.id,
      config: normalizedConfig,
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    this.clearDefaultScopeOnOtherModels(id, normalizedConfig);
    this.models.set(id, model);
    if (dto.api_key || dto.config?.env_key) {
      this.apiKeyReferences.set(id, apiKeyRef);
    } else {
      this.clearModelCredential(id);
    }

    if (apiKey) {
      const client = this.buildClient(model, apiKey);
      this.clients.set(id, client);
      this.logger.log(`Client initialized for model ${dto.name} (ID: ${id})`);
    }

    // Persist changes
    await this.persistModels();

    return model;
  }

  /**
   * Update model configuration
   */
  async updateModel(id: string, updates: Partial<CreateModelDTO>): Promise<AIModelDTO | null> {
    const model = this.models.get(id);
    if (!model) return null;

    const currentProviderConfig = this.getProviderConfigForModel(model);
    const requestedProviderConfig = updates.providerConfigId
      ? this.providers.get(updates.providerConfigId) || null
      : null;
    if (updates.providerConfigId && !requestedProviderConfig) {
      throw new Error(`Provider config ${updates.providerConfigId} not found`);
    }

    const targetProvider =
      requestedProviderConfig?.provider ||
      updates.provider ||
      currentProviderConfig?.provider ||
      model.provider;
    const targetEndpoint =
      requestedProviderConfig?.api_endpoint ||
      updates.api_endpoint ||
      currentProviderConfig?.api_endpoint ||
      model.api_endpoint;
    const providerConfig = this.upsertProviderConfig({
      provider: targetProvider,
      api_endpoint: targetEndpoint,
      ...(updates.api_key ? { api_key: updates.api_key } : {}),
    });

    const normalizedConfig = updates.config
      ? this.normalizeModelConfig({
          ...model.config,
          ...updates.config,
        })
      : model.config;

    const updatedModel: AIModelDTO = {
      ...model,
      name: updates.name || model.name,
      provider: providerConfig.provider,
      api_endpoint: providerConfig.api_endpoint,
      providerConfigId: providerConfig.id,
      config: normalizedConfig,
      updated_at: new Date(),
    };

    this.clearDefaultScopeOnOtherModels(id, normalizedConfig);
    this.models.set(id, updatedModel);

    if (updates.api_key) {
      if (updatedModel.providerConfigId) {
        this.clearModelCredential(id);
      } else {
        this.apiKeys.set(id, updates.api_key);
        this.apiKeyReferences.set(id, this.buildModelApiKeyRef(id, normalizedConfig));
      }
    } else if (updates.config?.env_key) {
      this.apiKeys.delete(id);
      this.apiKeyReferences.set(id, this.buildModelApiKeyRef(id, normalizedConfig));
    } else if (updatedModel.providerConfigId) {
      this.clearModelCredential(id);
    }

    // Reinitialize client if needed
    if (updates.api_endpoint || updates.name || updates.api_key || updates.providerConfigId) {
      const modelRef = this.apiKeyReferences.get(id);
      const apiKey =
        this.resolveProviderCredential(providerConfig.id) ||
        this.apiKeys.get(id) ||
        (modelRef ? this.resolveApiKey(modelRef, id) : null);
      if (apiKey) {
        const client = this.buildClient(updatedModel, apiKey);
        this.clients.set(id, client);
        this.logger.log(`Client reinitialized for model ${updatedModel.name} (ID: ${id})`);
      }
    }

    // Persist changes
    await this.persistModels();

    return updatedModel;
  }

  /**
   * Set model status (active/inactive)
   */
  async setModelStatus(id: string, status: 'active' | 'inactive'): Promise<AIModelDTO | null> {
    const model = this.models.get(id);
    if (!model) return null;

    const updatedModel: AIModelDTO = {
      ...model,
      status,
      updated_at: new Date(),
    };

    this.models.set(id, updatedModel);

    // Persist changes
    await this.persistModels();

    return updatedModel;
  }

  /**
   * Delete a model
   */
  async deleteModel(id: string): Promise<boolean> {
    const exists = this.models.has(id);
    if (exists) {
      this.models.delete(id);
      this.apiKeyReferences.delete(id);
      this.apiKeys.delete(id);
      this.clients.delete(id);

      // Persist changes
      await this.persistModels();
    }
    return exists;
  }

  /**
   * Delete a provider config
   */
  async deleteProviderConfig(id: string): Promise<boolean> {
    const exists = this.providers.has(id);
    if (exists) {
      this.providers.delete(id);
      this.providerApiKeyReferences.delete(id);
      this.providerApiKeys.delete(id);

      for (const [modelId, model] of this.models) {
        if (model.providerConfigId === id) {
          this.models.set(modelId, {
            ...model,
            providerConfigId: undefined,
          });
        }
      }

      await this.persistModels();
      return true;
    }
    return false;
  }

  /**
   * Get client for a model (supports UUID, model name, or 'default')
   */
  getClient(id: string): LLMClient | null {
    // Handle 'default'
    if (id === 'default') {
      const defaultModel = this.getDefaultModel();
      if (defaultModel) {
        return this.clients.get(defaultModel.id) || null;
      }
      return null;
    }

    // First try direct UUID lookup
    const client = this.clients.get(id);
    if (client) return client;

    // Then try name lookup
    for (const [modelId, model] of this.models) {
      if (model.name === id) {
        return this.clients.get(modelId) || null;
      }
    }
    return null;
  }

  getPromptCachingConfig(id: string): PromptCachingConfig | undefined {
    const model = this.resolveModelEntity(id);
    return model ? this.getPromptCachingConfigForModel(model) : undefined;
  }

  /**
   * Check model health
   */
  async checkModelHealth(id: string): Promise<{ healthy: boolean; error?: string }> {
    const client = this.clients.get(id);
    if (!client) {
      return { healthy: false, error: 'No client initialized' };
    }

    try {
      const healthy = await client.healthCheck();
      return { healthy };
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve API key from reference
   */
  private resolveApiKey(ref: APIKeyReference, modelId?: string): string | null {
    if (modelId && this.apiKeys.has(modelId)) {
      return this.apiKeys.get(modelId) || null;
    }

    switch (ref.secret_type) {
      case 'env': {
        if (ref.reference_id.includes('_')) {
          return process.env[ref.reference_id] || null;
        }
        const envKey = `AI_API_KEY_${ref.reference_id}`;
        return process.env[envKey] || null;
      }
      default:
        return null;
    }
  }

  /**
   * Get API key reference for a model
   */
  getApiKeyReference(id: string): APIKeyReference | null {
    return this.apiKeyReferences.get(id) || null;
  }

  /**
   * Call a model with a prompt (supports both UUID and model name)
   */
  async callModel(
    id: string,
    prompt: string,
    _type: 'reasoning' | 'auxiliary' = 'reasoning',
    options?: {
      reasoning?: ModelReasoningConfig;
    }
  ): Promise<LLMResponse> {
    const client = this.getClient(id);
    if (!client) {
      throw new Error(`No client initialized for model ${id}`);
    }

    const messages = [{ role: 'user' as const, content: prompt }];
    const result = await client.chatCompletion(
      options?.reasoning ? { messages, reasoning: options.reasoning } : messages
    );

    // Strip thinking tags from MiniMax model response
    result.content = this.stripThinkingTags(result.content);

    return result;
  }

  /**
   * Strip <think> and </thinking> tags from model response
   * MiniMax models include thinking tags which can interfere with JSON parsing
   */
  stripThinkingTags(content: string): string {
    // Remove <think>...</think> blocks
    return content
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*$/gi, '')
      .replace(/<\/?think>/gi, '')
      .trim();
  }

  /**
   * Call a model with streaming support (supports both UUID and model name)
   * @param id Model ID or name
   * @param prompt Prompt to send
   * @param onChunk Callback for each chunk
   */
  async callModelStream(
    id: string,
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<LLMResponse> {
    const client = this.getClient(id);
    if (!client) {
      throw new Error(`No client initialized for model ${id}`);
    }

    const messages = [{ role: 'user' as const, content: prompt }];
    return client.chatCompletionStream(messages, onChunk);
  }

  /**
   * Call model with streaming support - supports multimodal messages (supports both UUID and model name)
   */
  async callModelStreamWithMessages(
    id: string,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: {
      reasoning?: ModelReasoningConfig;
    }
  ): Promise<LLMResponse> {
    const client = this.getClient(id);
    if (!client) {
      throw new Error(`No client initialized for model ${id}`);
    }

    const result = await client.chatCompletionStream(messages, onChunk, options?.reasoning);
    result.content = this.stripThinkingTags(result.content);

    return result;
  }
}
