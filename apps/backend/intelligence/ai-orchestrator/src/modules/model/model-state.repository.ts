import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  AIModelDTO,
  AIModelConfig,
  AIProviderConfigDTO,
  CreateProviderConfigDTO,
  APIKeyReference,
} from '../../interfaces';
import { LLMClient } from '../../client/llm-client';
import { SecretCryptoUtil } from '../../common/crypto/secret-crypto.util';
import { buildModelClient } from './model-client.factory';
import { normalizeModelConfig } from './model-config.helpers';
import {
  API_KEYS_FILE,
  MODEL_STORAGE_DATA_DIR,
  MODELS_FILE,
  PROVIDER_API_KEYS_FILE,
  PROVIDERS_FILE,
  type PersistedApiKey,
  type PersistedModel,
  type PersistedProvider,
  type PersistedProviderApiKey,
} from './model-storage.constants';

export class ModelStateRepository {
  constructor(
    private readonly models: Map<string, AIModelDTO>,
    private readonly providers: Map<string, AIProviderConfigDTO>,
    private readonly apiKeyReferences: Map<string, APIKeyReference>,
    private readonly providerApiKeyReferences: Map<string, APIKeyReference>,
    private readonly apiKeys: Map<string, string>,
    private readonly providerApiKeys: Map<string, string>,
    private readonly clients: Map<string, LLMClient>,
    private readonly logger: Logger
  ) {}
  findProviderConfig(provider: string, apiEndpoint: string): AIProviderConfigDTO | null {
    for (const providerConfig of this.providers.values()) {
      if (providerConfig.provider === provider && providerConfig.api_endpoint === apiEndpoint) {
        return providerConfig;
      }
    }

    return null;
  }

  getProviderConfigForModel(model: AIModelDTO): AIProviderConfigDTO | null {
    if (model.providerConfigId) {
      const providerConfig = this.providers.get(model.providerConfigId);
      if (providerConfig) {
        return providerConfig;
      }
    }

    return this.findProviderConfig(model.provider, model.api_endpoint);
  }

  getProviderGroupingKey(model: AIModelDTO): string {
    const providerConfig = this.getProviderConfigForModel(model);
    return providerConfig?.id || `${model.provider}::${model.api_endpoint}`;
  }

  resolveProviderCredential(providerId: string): string | null {
    if (this.providerApiKeys.has(providerId)) {
      return this.providerApiKeys.get(providerId) || null;
    }

    const ref = this.providerApiKeyReferences.get(providerId);
    if (!ref) {
      return null;
    }

    return this.resolveApiKey(ref);
  }

  hasConfiguredProviderCredential(providerId: string): boolean {
    return Boolean(this.resolveProviderCredential(providerId));
  }

  upsertProviderConfig(dto: CreateProviderConfigDTO): AIProviderConfigDTO {
    const existing = this.findProviderConfig(dto.provider, dto.api_endpoint);
    const now = new Date();

    if (existing) {
      if (dto.name !== undefined) {
        existing.name = dto.name;
      }
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
        name: dto.name !== undefined ? dto.name : existing.name,
        updated_at: now,
      };
      this.providers.set(existing.id, updated);
      return updated;
    }

    const providerConfig: AIProviderConfigDTO = {
      id: uuidv4(),
      name: dto.name,
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

  syncProviderConfigFromModel(modelId: string, model: AIModelDTO): void {
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

  clearDefaultScopeOnOtherModels(targetModelId: string, config: AIModelConfig): void {
    const targetScope = config.default_scope;
    if (
      !targetScope?.global &&
      !targetScope?.admin_chat &&
      !targetScope?.admin_task &&
      !targetScope?.audio_transcription &&
      !targetScope?.ocr &&
      !targetScope?.image_generation
    ) {
      return;
    }

    for (const [modelId, existingModel] of this.models) {
      if (modelId === targetModelId) {
        continue;
      }

      const nextConfig = normalizeModelConfig(existingModel.config);
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
      if (targetScope.ocr && nextConfig.default_scope?.ocr) {
        nextConfig.default_scope.ocr = false;
        changed = true;
      }
      if (targetScope.image_generation && nextConfig.default_scope?.image_generation) {
        nextConfig.default_scope.image_generation = false;
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

  hasConfiguredCredential(id: string): boolean {
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

  findReusableProviderCredential(
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

  buildModelApiKeyRef(modelId: string, config?: AIModelConfig): APIKeyReference {
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

  clearModelCredential(id: string): void {
    this.apiKeys.delete(id);
    this.apiKeyReferences.delete(id);
  }

  async migrateAndSecureFiles(): Promise<void> {
    const files = [PROVIDER_API_KEYS_FILE, API_KEYS_FILE, PROVIDERS_FILE, MODELS_FILE];

    for (const file of files) {
      if (!fs.existsSync(file)) continue;

      try {
        fs.chmodSync(file, 0o600);
      } catch {
        // ignore
      }

      if (file === PROVIDER_API_KEYS_FILE || file === API_KEYS_FILE) {
        try {
          const raw = fs.readFileSync(file, 'utf-8');
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            let changed = false;
            for (const item of list) {
              if (item.apiKey && !SecretCryptoUtil.isEncrypted(item.apiKey)) {
                item.apiKey = SecretCryptoUtil.encrypt(item.apiKey);
                changed = true;
              }
            }
            if (changed) {
              SecretCryptoUtil.writeSecureJsonFile(file, list);
              this.logger.log(`Migrated plaintext keys in ${file} to AES-256-GCM`);
            }
          }
        } catch (e: any) {
          this.logger.warn(`Failed to migrate keys in ${file}: ${e.message}`);
        }
      }
    }
  }

  async loadPersistedModels(): Promise<void> {
    try {
      this.logger.log(`Checking for persisted models in ${MODELS_FILE}`);

      // Load models
      if (fs.existsSync(MODELS_FILE)) {
        const data = fs.readFileSync(MODELS_FILE, 'utf-8');
        const persisted: PersistedModel[] = JSON.parse(data);

        for (const item of persisted) {
          this.models.set(item.model.id, item.model);
          item.model.config = normalizeModelConfig(item.model.config);
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
          this.apiKeys.set(item.id, SecretCryptoUtil.decrypt(item.apiKey));
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
          const client = buildModelClient(model, apiKey);
          this.clients.set(id, client);
          this.logger.log(`Client initialized for model ${model.name} (${id})`);
        }
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to load persisted models: ${errorMsg}`);
    }
  }

  async loadPersistedProviders(): Promise<void> {
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
          this.providerApiKeys.set(item.id, SecretCryptoUtil.decrypt(item.apiKey));
        }
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to load persisted providers: ${errorMsg}`);
    }
  }

  async persistModels(): Promise<void> {
    try {
      // Ensure data directory exists with restricted permissions (0700)
      if (!fs.existsSync(MODEL_STORAGE_DATA_DIR)) {
        fs.mkdirSync(MODEL_STORAGE_DATA_DIR, { recursive: true, mode: 0o700 });
        this.logger.log(`Created data directory: ${MODEL_STORAGE_DATA_DIR}`);
      }

      // Persist models
      const modelsData: PersistedModel[] = [];
      for (const [id, model] of this.models) {
        const apiKeyRef = this.apiKeyReferences.get(id);
        modelsData.push({ model, apiKeyRef });
      }
      SecretCryptoUtil.writeSecureJsonFile(MODELS_FILE, modelsData);
      this.logger.log(`Wrote ${modelsData.length} models to ${MODELS_FILE}`);

      // Persist API keys (encrypted with AES-256-GCM, mode 0600)
      const keysData: PersistedApiKey[] = [];
      for (const [id, apiKey] of this.apiKeys) {
        keysData.push({ id, apiKey: SecretCryptoUtil.encrypt(apiKey) });
      }
      SecretCryptoUtil.writeSecureJsonFile(API_KEYS_FILE, keysData);
      this.logger.log(`Wrote ${keysData.length} API keys to ${API_KEYS_FILE}`);

      const providersData: PersistedProvider[] = [];
      for (const [id, provider] of this.providers) {
        const apiKeyRef = this.providerApiKeyReferences.get(id);
        if (apiKeyRef) {
          providersData.push({ provider, apiKeyRef });
        }
      }
      SecretCryptoUtil.writeSecureJsonFile(PROVIDERS_FILE, providersData);

      const providerKeysData: PersistedProviderApiKey[] = [];
      for (const [id, apiKey] of this.providerApiKeys) {
        providerKeysData.push({ id, apiKey: SecretCryptoUtil.encrypt(apiKey) });
      }
      SecretCryptoUtil.writeSecureJsonFile(PROVIDER_API_KEYS_FILE, providerKeysData);

      this.logger.log(
        `Persisted ${modelsData.length} models, ${keysData.length} model API keys and ${providersData.length} providers`
      );
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to persist models: ${errorMsg}`);
    }
  }

  resolveApiKey(ref: APIKeyReference, modelId?: string): string | null {
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
}
