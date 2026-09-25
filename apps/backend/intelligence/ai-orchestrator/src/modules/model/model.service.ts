import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  AIModelDTO,
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
import { LLMClient, PromptCachingConfig } from '../../client/llm-client';
import {
  ModelInvocationTelemetryService,
  type ModelInvocationContext,
} from './model-invocation-telemetry.service';
import {
  getCapabilityWeight,
  getDefaultScopeWeight,
  getPromptCachingConfigForModel,
  normalizeModelConfig,
} from './model-config.helpers';
import {
  MODEL_STORAGE_DATA_DIR,
} from './model-storage.constants';
import { buildModelClient } from './model-client.factory';
import { ModelStateRepository } from './model-state.repository';

export interface ModelSelectionPolicyContext {
  mode?: 'chat' | 'task' | 'audio_transcription' | 'ocr' | 'vision' | 'image_generation';
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

  private readonly stateRepository: ModelStateRepository;

  constructor(@Optional() private readonly invocationTelemetry?: ModelInvocationTelemetryService) {
    this.stateRepository = new ModelStateRepository(
      this.models,
      this.providers,
      this.apiKeyReferences,
      this.providerApiKeyReferences,
      this.apiKeys,
      this.providerApiKeys,
      this.clients,
      this.logger
    );
  }

  selectScopedDefaultModel(
    scope:
      | 'global'
      | 'admin_chat'
      | 'admin_task'
      | 'audio_transcription'
      | 'ocr'
      | 'image_generation'
  ): AIModelDTO | null {
    const activeModels = this.getActiveModelsWithClients();
    return activeModels.find((model) => model.config.default_scope?.[scope] === true) || null;
  }

  getPreferredDefaultModel(context?: ModelSelectionPolicyContext): AIModelDTO | null {
    const userRoles = context?.userRoles || [];
    const isAdmin = userRoles.includes('admin');

    if (context?.mode === 'image_generation') {
      return (
        this.selectScopedDefaultModel('image_generation') ||
        this.getPreferredImageGenerationModel(context)
      );
    }

    if (context?.mode === 'audio_transcription') {
      return this.selectScopedDefaultModel('audio_transcription') || this.getDefaultModel();
    }

    if (context?.mode === 'ocr' || context?.mode === 'vision') {
      return (
        this.selectScopedDefaultModel('ocr') ||
        this.getPreferredVisionModel(context) ||
        this.getDefaultModel()
      );
    }

    if (context?.mode === 'task') {
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

    // Ensure data directory exists with restricted permissions (0700)
    if (!fs.existsSync(MODEL_STORAGE_DATA_DIR)) {
      fs.mkdirSync(MODEL_STORAGE_DATA_DIR, { recursive: true, mode: 0o700 });
      try {
        fs.chmodSync(MODEL_STORAGE_DATA_DIR, 0o700);
      } catch {
        // Best-effort permission hardening; storage still works when chmod is unavailable.
      }
      this.logger.log(`Created data directory: ${MODEL_STORAGE_DATA_DIR}`);
    }

    // Run migration and permission enforcement on existing storage files
    await this.stateRepository.migrateAndSecureFiles();

    // Load persisted provider configs first
    await this.stateRepository.loadPersistedProviders();

    // Load persisted models first
    await this.stateRepository.loadPersistedModels();
  }

  /**
   * Load persisted models from file
   */

  /**
   * Persist models to file
   */

  /**
   * List all registered models (only active ones for chat selector)
   */
  async listModels(): Promise<AIModelDTO[]> {
    return Array.from(this.models.values())
      .filter((m) => m.status === 'active')
      .map((m) => ({ ...m, hasApiKey: this.stateRepository.hasConfiguredCredential(m.id) }));
  }

  /**
   * List all registered models for admin (including inactive)
   */
  async listModelsForAdmin(): Promise<AIModelDTO[]> {
    return Array.from(this.models.values()).map((m) => ({
      ...m,
      hasApiKey: this.stateRepository.hasConfiguredCredential(m.id),
    }));
  }

  listProviderSummaries(): AIProviderSummaryDTO[] {
    const grouped = new Map<string, AIProviderSummaryDTO>();
    for (const providerConfig of this.providers.values()) {
      grouped.set(providerConfig.id, {
        id: providerConfig.id,
        name: providerConfig.name,
        provider: providerConfig.provider,
        api_endpoint: providerConfig.api_endpoint,
        modelCount: 0,
        activeModelCount: 0,
        hasCredential: this.stateRepository.hasConfiguredProviderCredential(providerConfig.id),
        advancedModelCount: 0,
        defaultScopes: [],
      });
    }

    for (const model of this.models.values()) {
      const groupKey = this.stateRepository.getProviderGroupingKey(model);
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
      existing.hasCredential =
        existing.hasCredential || this.stateRepository.hasConfiguredCredential(model.id);
      existing.advancedModelCount += model.config.capability_tier === 'advanced' ? 1 : 0;
      const scopeKeys = (
        [
          'global',
          'admin_chat',
          'admin_task',
          'audio_transcription',
          'ocr',
          'image_generation',
        ] as const
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
      return (left.name || left.provider).localeCompare(right.name || right.provider);
    });
  }

  async listProviderConfigs(): Promise<AIProviderConfigDTO[]> {
    return Array.from(this.providers.values()).map((provider) => ({
      ...provider,
      hasCredential: this.stateRepository.hasConfiguredProviderCredential(provider.id),
    }));
  }

  async getProviderConfig(id: string): Promise<AIProviderConfigDTO | null> {
    const provider = this.providers.get(id);
    if (!provider) {
      return null;
    }

    return {
      ...provider,
      hasCredential: this.stateRepository.hasConfiguredProviderCredential(provider.id),
    };
  }

  async createProviderConfig(dto: CreateProviderConfigDTO): Promise<AIProviderConfigDTO> {
    const provider = this.stateRepository.upsertProviderConfig(dto);
    await this.stateRepository.persistModels();
    return {
      ...provider,
      hasCredential: this.stateRepository.hasConfiguredProviderCredential(provider.id),
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

    const nextName = updates.name !== undefined ? updates.name : existing.name;
    const nextProvider = updates.provider || existing.provider;
    const nextEndpoint = updates.api_endpoint || existing.api_endpoint;
    const duplicate = this.stateRepository.findProviderConfig(nextProvider, nextEndpoint);
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
      name: nextName,
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
        this.stateRepository.resolveProviderCredential(id) ||
        this.apiKeys.get(modelId) ||
        (modelRef ? this.stateRepository.resolveApiKey(modelRef, modelId) : null);
      if (apiKey) {
        this.clients.set(modelId, buildModelClient(updatedModel, apiKey));
      }
    }

    await this.stateRepository.persistModels();
    return {
      ...updatedProvider,
      hasCredential: this.stateRepository.hasConfiguredProviderCredential(id),
    };
  }

  async checkProviderHealth(
    id: string
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    const provider = this.providers.get(id);
    if (!provider) {
      return { success: false, error: 'Provider not found' };
    }

    const apiKey = this.stateRepository.resolveProviderCredential(id);
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

    const apiKey = this.stateRepository.resolveProviderCredential(id);
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
    return { ...model, hasApiKey: this.stateRepository.hasConfiguredCredential(id) };
  }

  /**
   * Get model by name
   */
  async getModelByName(name: string): Promise<AIModelDTO | null> {
    for (const [id, model] of this.models) {
      if (model.name === name) {
        return { ...model, hasApiKey: this.stateRepository.hasConfiguredCredential(id) };
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

  resolveModelEntity(id: string): AIModelDTO | null {
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

  isVisionCapableModel(model: AIModelDTO | null | undefined): boolean {
    if (!model || model.status !== 'active') {
      return false;
    }
    if (model.config?.default_scope?.['ocr'] === true) {
      return true;
    }
    const tags = (model.config?.routing_tags || []).map((t) => String(t).toLowerCase());
    if (
      tags.some(
        (t) =>
          t.includes('vision') ||
          t.includes('multimodal') ||
          t.includes('image') ||
          t.includes('ocr')
      )
    ) {
      return true;
    }
    const name = (model.name || '').toLowerCase();
    const provider = (model.provider || '').toLowerCase();
    if (provider === 'gemini' || name.includes('gemini')) {
      return true;
    }
    if (
      name.includes('vision') ||
      name.includes('-vl') ||
      name.includes('vl-') ||
      name.includes('gpt-4o') ||
      name.includes('claude-3') ||
      name.includes('omni')
    ) {
      return true;
    }
    return false;
  }

  getPreferredVisionModel(context?: ModelSelectionPolicyContext): AIModelDTO | null {
    // 1. Check if an OCR-scoped default model is configured and active
    const ocrModel = this.selectScopedDefaultModel('ocr');
    if (ocrModel && this.isVisionCapableModel(ocrModel) && this.clients.has(ocrModel.id)) {
      return ocrModel;
    }

    // 2. Check if the default chat model is vision-capable
    const defaultChat = this.getPreferredDefaultModel({
      mode: 'chat',
      userRoles: context?.userRoles,
    });
    if (defaultChat && this.isVisionCapableModel(defaultChat) && this.clients.has(defaultChat.id)) {
      return defaultChat;
    }

    // 3. Search all active models with initialized clients for any vision-capable model
    const activeModels = this.listActiveModelsForRouting();
    const visionCandidate = activeModels.find(
      (m) => this.isVisionCapableModel(m) && this.clients.has(m.id)
    );
    if (visionCandidate) {
      return visionCandidate;
    }

    // 4. Fallback to general default model
    return this.getDefaultModel();
  }

  getPreferredImageGenerationModel(_context?: ModelSelectionPolicyContext): AIModelDTO | null {
    // 1. Check if an image_generation-scoped default model is configured and active
    const scopedModel = this.selectScopedDefaultModel('image_generation');
    if (scopedModel) {
      return scopedModel;
    }

    // 2. Search active models with routing tags or known image generation names
    const activeModels = this.getActiveModelsWithClients();
    const candidate = activeModels.find((m) => {
      const tags = (m.config?.routing_tags || []).map((t) => String(t).toLowerCase());
      const name = (m.name || '').toLowerCase();
      return (
        tags.includes('image_generation') ||
        tags.includes('image') ||
        name.includes('imagen') ||
        name.includes('dall-e') ||
        name.includes('flux') ||
        name.includes('wanx') ||
        name.includes('cogview')
      );
    });
    return candidate || null;
  }

  private getActiveModelsWithClients(): AIModelDTO[] {
    return Array.from(this.models.values()).filter((model) => {
      return model.status === 'active' && this.clients.has(model.id);
    });
  }

  private sortFallbackCandidates(models: AIModelDTO[]): AIModelDTO[] {
    return [...models].sort((left, right) => {
      const scopeDelta = getDefaultScopeWeight(right) - getDefaultScopeWeight(left);
      if (scopeDelta !== 0) {
        return scopeDelta;
      }
      const capabilityDelta = getCapabilityWeight(right) - getCapabilityWeight(left);
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
          this.stateRepository.getProviderGroupingKey(model) ===
            this.stateRepository.getProviderGroupingKey(currentModel)
        );
      })
    );
    const crossProviderModels = this.sortFallbackCandidates(
      activeModels.filter((model) => {
        return (
          model.id !== currentModel.id &&
          this.stateRepository.getProviderGroupingKey(model) !==
            this.stateRepository.getProviderGroupingKey(currentModel)
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
    const apiKeyRef: APIKeyReference = this.stateRepository.buildModelApiKeyRef(id, dto.config);

    const existingProviderConfig = dto.providerConfigId
      ? this.providers.get(dto.providerConfigId)
      : null;
    const providerConfig = existingProviderConfig
      ? this.stateRepository.upsertProviderConfig({
          provider: existingProviderConfig.provider,
          api_endpoint: existingProviderConfig.api_endpoint,
          ...(dto.api_key ? { api_key: dto.api_key } : {}),
          ...(dto.config?.env_key ? { env_key: dto.config.env_key as string } : {}),
          ...(dto.config?.secret_type
            ? { secret_type: dto.config.secret_type as 'vault' | 'env' | 'k8s_secret' }
            : {}),
        })
      : this.stateRepository.upsertProviderConfig({
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
        apiKey = this.stateRepository.resolveApiKey(apiKeyRef);
      } else {
        const providerCredential = this.stateRepository.resolveProviderCredential(
          providerConfig.id
        );
        if (providerCredential) {
          apiKey = providerCredential;
          this.logger.log(
            `Model ${dto.name} reusing provider credentials from provider ${providerConfig.provider}`
          );
        } else {
          const reusableCredential = this.stateRepository.findReusableProviderCredential(
            dto.provider,
            dto.api_endpoint
          );
          if (reusableCredential) {
            apiKey = reusableCredential.apiKey;
            this.logger.log(
              `Model ${dto.name} reusing provider credentials from model ${reusableCredential.sourceModelId}`
            );
          } else {
            apiKey = this.stateRepository.resolveApiKey(apiKeyRef);
          }
        }
      }

      if (!apiKey) {
        this.logger.warn(`No API key found for model ${dto.name}, client will not be initialized`);
      }
    }

    const normalizedConfig = normalizeModelConfig(dto.config);
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

    this.stateRepository.clearDefaultScopeOnOtherModels(id, normalizedConfig);
    this.models.set(id, model);
    if (dto.api_key || dto.config?.env_key) {
      this.apiKeyReferences.set(id, apiKeyRef);
    } else {
      this.stateRepository.clearModelCredential(id);
    }

    if (apiKey) {
      const client = buildModelClient(model, apiKey);
      this.clients.set(id, client);
      this.logger.log(`Client initialized for model ${dto.name} (ID: ${id})`);
    }

    // Persist changes
    await this.stateRepository.persistModels();

    return model;
  }

  /**
   * Update model configuration
   */
  async updateModel(id: string, updates: Partial<CreateModelDTO>): Promise<AIModelDTO | null> {
    const model = this.models.get(id);
    if (!model) return null;

    const currentProviderConfig = this.stateRepository.getProviderConfigForModel(model);
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
    const providerConfig = this.stateRepository.upsertProviderConfig({
      provider: targetProvider,
      api_endpoint: targetEndpoint,
      ...(updates.api_key ? { api_key: updates.api_key } : {}),
    });

    const normalizedConfig = updates.config
      ? normalizeModelConfig({
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

    this.stateRepository.clearDefaultScopeOnOtherModels(id, normalizedConfig);
    this.models.set(id, updatedModel);

    if (updates.api_key) {
      if (updatedModel.providerConfigId) {
        this.stateRepository.clearModelCredential(id);
      } else {
        this.apiKeys.set(id, updates.api_key);
        this.apiKeyReferences.set(
          id,
          this.stateRepository.buildModelApiKeyRef(id, normalizedConfig)
        );
      }
    } else if (updates.config?.env_key) {
      this.apiKeys.delete(id);
      this.apiKeyReferences.set(id, this.stateRepository.buildModelApiKeyRef(id, normalizedConfig));
    } else if (updatedModel.providerConfigId) {
      this.stateRepository.clearModelCredential(id);
    }

    // Reinitialize client if needed
    if (updates.api_endpoint || updates.name || updates.api_key || updates.providerConfigId) {
      const modelRef = this.apiKeyReferences.get(id);
      const apiKey =
        this.stateRepository.resolveProviderCredential(providerConfig.id) ||
        this.apiKeys.get(id) ||
        (modelRef ? this.stateRepository.resolveApiKey(modelRef, id) : null);
      if (apiKey) {
        const client = buildModelClient(updatedModel, apiKey);
        this.clients.set(id, client);
        this.logger.log(`Client reinitialized for model ${updatedModel.name} (ID: ${id})`);
      }
    }

    // Persist changes
    await this.stateRepository.persistModels();

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
    await this.stateRepository.persistModels();

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
      await this.stateRepository.persistModels();
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

      await this.stateRepository.persistModels();
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
    return model ? getPromptCachingConfigForModel(model) : undefined;
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

  /**
   * Resolve plaintext API key for a model, checking direct keys, references, and provider keys
   */
  getResolvedApiKeyForModel(modelId: string): string | null {
    const model = this.models.get(modelId);
    if (!model) return null;
    if (this.apiKeys.has(modelId)) {
      return this.apiKeys.get(modelId) || null;
    }
    const ref = this.apiKeyReferences.get(modelId);
    if (ref) {
      const k = this.stateRepository.resolveApiKey(ref, modelId);
      if (k) return k;
    }
    const providerConfig = this.stateRepository.getProviderConfigForModel(model);
    if (providerConfig) {
      if (this.providerApiKeys.has(providerConfig.id)) {
        return this.providerApiKeys.get(providerConfig.id) || null;
      }
      const pRef = this.providerApiKeyReferences.get(providerConfig.id);
      if (pRef) {
        return this.stateRepository.resolveApiKey(pRef);
      }
    }
    return null;
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
      telemetry?: ModelInvocationContext;
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

    const model = this.resolveModelEntity(id);
    await this.invocationTelemetry?.record({
      modelId: model?.id || id,
      provider: model?.provider || 'unknown',
      prompt,
      response: result,
      context: options?.telemetry,
    });

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
      telemetry?: ModelInvocationContext;
      maxOutputTokens?: number;
      temperature?: number;
    }
  ): Promise<LLMResponse> {
    const client = this.getClient(id);
    if (!client) {
      throw new Error(`No client initialized for model ${id}`);
    }

    const model = this.resolveModelEntity(id);
    const configuredMaxOutputTokens =
      options?.maxOutputTokens ??
      (model?.config as any)?.max_output_tokens ??
      (model?.config as any)?.maxOutputTokens ??
      Number(process.env.DEFAULT_CHAT_MAX_OUTPUT_TOKENS || 8192);

    const requestPayload: any = {
      messages,
      maxOutputTokens: configuredMaxOutputTokens,
      reasoning: options?.reasoning,
    };
    if (typeof options?.temperature === 'number') {
      requestPayload.temperature = options.temperature;
    }

    const result = await client.chatCompletionStream(
      requestPayload,
      onChunk,
      options?.reasoning
    );
    result.content = this.stripThinkingTags(result.content);
    await this.invocationTelemetry?.record({
      modelId: model?.id || id,
      provider: model?.provider || 'unknown',
      prompt: JSON.stringify(messages),
      response: result,
      context: options?.telemetry,
    });

    return result;
  }

  /**
   * Batch test health and connectivity of all registered models
   */
  async checkAllModelsHealth(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: Array<{
      modelId: string;
      modelName: string;
      displayName?: string;
      provider: string;
      status: string;
      success: boolean;
      latencyMs: number;
      response?: string;
      error?: string;
      checkedAt: string;
    }>;
  }> {
    const models = Array.from(this.models.values());
    const results = await Promise.all(
      models.map(async (model) => {
        const startTime = Date.now();
        const client = this.getClient(model.id);
        if (!client) {
          return {
            modelId: model.id,
            modelName: model.name,
            displayName: model.config?.display_name,
            provider: model.provider,
            status: model.status,
            success: false,
            latencyMs: 0,
            error: '未配置有效 API Key 或模型客户端未初始化',
            checkedAt: new Date().toISOString(),
          };
        }

        try {
          const response = await this.callModel(model.id, 'Ping. Please reply with "OK".');
          const latencyMs = Date.now() - startTime;
          return {
            modelId: model.id,
            modelName: model.name,
            displayName: model.config?.display_name,
            provider: model.provider,
            status: model.status,
            success: true,
            latencyMs,
            response: (response.content || 'OK').slice(0, 120),
            checkedAt: new Date().toISOString(),
          };
        } catch (err: unknown) {
          const latencyMs = Date.now() - startTime;
          const errorMsg = err instanceof Error ? err.message : String(err);
          return {
            modelId: model.id,
            modelName: model.name,
            displayName: model.config?.display_name,
            provider: model.provider,
            status: model.status,
            success: false,
            latencyMs,
            error: errorMsg,
            checkedAt: new Date().toISOString(),
          };
        }
      })
    );

    const passed = results.filter((r) => r.success).length;
    const failed = results.length - passed;

    return {
      total: results.length,
      passed,
      failed,
      results,
    };
  }
}
