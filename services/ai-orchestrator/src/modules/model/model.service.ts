import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AIModelDTO, CreateModelDTO, APIKeyReference } from '../../interfaces';
import { OpenAICompatibleClient } from '../../client/openai-compatible';
import { PRESET_MODELS, PresetModelConfig } from '../../config/preset-models';

// Persistence file paths
const DATA_DIR = process.env.AI_MODELS_DATA_DIR || '/app/data';
const MODELS_FILE = path.join(DATA_DIR, 'ai-models.json');
const API_KEYS_FILE = path.join(DATA_DIR, 'ai-api-keys.json');

interface PersistedModel {
  model: AIModelDTO;
  apiKeyRef: APIKeyReference;
}

interface PersistedApiKey {
  id: string;
  apiKey: string;
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
  private apiKeyReferences: Map<string, APIKeyReference> = new Map();
  private apiKeys: Map<string, string> = new Map();
  private clients: Map<string, OpenAICompatibleClient> = new Map();

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

    // Load persisted models first
    await this.loadPersistedModels();

    // Then initialize preset models (only those with env keys)
    await this.initializePresetModels();
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
          this.apiKeyReferences.set(item.model.id, item.apiKeyRef);
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

      // Initialize clients for loaded models
      for (const [id, model] of this.models) {
        const apiKey = this.apiKeys.get(id) || this.resolveApiKey(this.apiKeyReferences.get(id)!, id);
        if (apiKey) {
          const client = new OpenAICompatibleClient({
            baseURL: model.api_endpoint,
            apiKey,
            model: model.name,
          });
          this.clients.set(id, client);
          this.logger.log(`Client initialized for model ${model.name} (${id})`);
        }
      }

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to load persisted models: ${errorMsg}`);
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
        if (apiKeyRef) {
          modelsData.push({ model, apiKeyRef });
        }
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

      this.logger.log(`Persisted ${modelsData.length} models and ${keysData.length} API keys`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to persist models: ${errorMsg}`);
    }
  }

  /**
   * Initialize preset models from environment variables
   */
  private async initializePresetModels() {
    for (const preset of PRESET_MODELS) {
      const apiKey = process.env[preset.env_key];
      if (apiKey) {
        // Check if this preset model already exists
        const existingModel = Array.from(this.models.values()).find(
          m => m.config?.preset === true &&
               m.name === preset.model_id &&
               m.provider === preset.provider
        );

        if (!existingModel) {
          this.logger.log(`Initializing preset model: ${preset.name} (${preset.provider})`);
          try {
            await this.createModelFromPreset(preset, apiKey);
          } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to initialize preset model ${preset.name}: ${errorMsg}`);
          }
        } else {
          this.logger.debug(`Preset model ${preset.name} already exists, skipping`);
        }
      }
    }
  }

  /**
   * Create a model from preset configuration
   */
  private async createModelFromPreset(preset: PresetModelConfig, apiKey: string): Promise<AIModelDTO> {
    const id = uuidv4();
    const now = new Date();

    const apiKeyRef: APIKeyReference = {
      reference_id: preset.env_key,
      secret_type: 'env',
    };

    const model: AIModelDTO = {
      id,
      name: preset.model_id,
      provider: preset.provider,
      api_endpoint: preset.api_endpoint,
      config: {
        ...preset.config,
        display_name: preset.name,
        description: preset.description,
        preset: true,
      },
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    this.models.set(id, model);
    this.apiKeyReferences.set(id, apiKeyRef);

    const client = new OpenAICompatibleClient({
      baseURL: preset.api_endpoint,
      apiKey,
      model: preset.model_id,
    });
    this.clients.set(id, client);

    this.logger.log(`Preset model initialized: ${preset.name} (ID: ${id})`);
    await this.persistModels();

    return model;
  }

  /**
   * List all available preset model configurations
   */
  listPresetModels(): PresetModelConfig[] {
    return PRESET_MODELS;
  }

  /**
   * Check which preset models have API keys configured
   */
  checkPresetModelStatus(): { name: string; provider: string; configured: boolean; default?: boolean; description?: string }[] {
    return PRESET_MODELS.map(preset => ({
      name: preset.name,
      provider: preset.provider,
      configured: !!process.env[preset.env_key],
      default: preset.config?.default as boolean | undefined,
      description: preset.description,
    }));
  }

  /**
   * List all registered models
   */
  async listModels(): Promise<AIModelDTO[]> {
    return Array.from(this.models.values());
  }

  /**
   * Get a specific model by ID
   */
  async getModel(id: string): Promise<AIModelDTO | null> {
    return this.models.get(id) || null;
  }

  /**
   * Register a new AI model
   */
  async createModel(dto: CreateModelDTO): Promise<AIModelDTO> {
    const id = uuidv4();
    const now = new Date();

    let apiKey: string | null = null;
    let apiKeyRef: APIKeyReference;

    if (dto.api_key) {
      apiKey = dto.api_key;
      apiKeyRef = {
        reference_id: id,
        secret_type: 'env',
      };
      this.apiKeys.set(id, apiKey);
      this.logger.log(`Model ${dto.name} created with direct API key input`);
    } else {
      apiKeyRef = {
        reference_id: dto.config?.env_key as string || `AI_API_KEY_${id}`,
        secret_type: (dto.config?.secret_type as 'vault' | 'env' | 'k8s_secret') || 'env',
      };
      apiKey = this.resolveApiKey(apiKeyRef);
      if (!apiKey) {
        this.logger.warn(`No API key found for model ${dto.name}, client will not be initialized`);
      }
    }

    const model: AIModelDTO = {
      id,
      name: dto.name,
      provider: dto.provider,
      api_endpoint: dto.api_endpoint,
      config: dto.config || {},
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    this.models.set(id, model);
    this.apiKeyReferences.set(id, apiKeyRef);

    if (apiKey) {
      const client = new OpenAICompatibleClient({
        baseURL: dto.api_endpoint,
        apiKey,
        model: dto.name,
      });
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

    if (updates.api_key) {
      this.apiKeys.set(id, updates.api_key);
    }

    const updatedModel: AIModelDTO = {
      ...model,
      name: updates.name || model.name,
      api_endpoint: updates.api_endpoint || model.api_endpoint,
      config: updates.config || model.config,
      updated_at: new Date(),
    };

    this.models.set(id, updatedModel);

    // Reinitialize client if needed
    if (updates.api_endpoint || updates.name || updates.api_key) {
      const apiKey = this.apiKeys.get(id) || this.resolveApiKey(this.apiKeyReferences.get(id)!, id);
      if (apiKey) {
        const client = new OpenAICompatibleClient({
          baseURL: updatedModel.api_endpoint,
          apiKey,
          model: updatedModel.name,
        });
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
   * Get client for a model
   */
  getClient(id: string): OpenAICompatibleClient | null {
    return this.clients.get(id) || null;
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
      case 'env':
        if (ref.reference_id.includes('_')) {
          return process.env[ref.reference_id] || null;
        }
        const envKey = `AI_API_KEY_${ref.reference_id}`;
        return process.env[envKey] || null;
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
   * Call a model with a prompt
   */
  async callModel(id: string, prompt: string): Promise<string> {
    const client = this.clients.get(id);
    if (!client) {
      throw new Error(`No client initialized for model ${id}`);
    }

    const messages = [{ role: 'user' as const, content: prompt }];
    return client.chatCompletion(messages);
  }
}