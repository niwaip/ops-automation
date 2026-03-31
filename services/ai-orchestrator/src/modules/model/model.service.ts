import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AIModelDTO, CreateModelDTO, APIKeyReference } from '../../interfaces';
import { OpenAICompatibleClient } from '../../client/openai-compatible';

/**
 * Model Service
 * Manages AI model registration, configuration, and health status
 * API Keys are stored as references (not plaintext)
 */
@Injectable()
export class ModelService {
  private models: Map<string, AIModelDTO> = new Map();
  private apiKeyReferences: Map<string, APIKeyReference> = new Map();
  private clients: Map<string, OpenAICompatibleClient> = new Map();

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
   * API Key should be stored securely (reference only in config)
   */
  async createModel(dto: CreateModelDTO): Promise<AIModelDTO> {
    const id = uuidv4();
    const now = new Date();

    // Create API key reference (not storing plaintext)
    const apiKeyRef: APIKeyReference = {
      reference_id: uuidv4(),
      secret_type: dto.config?.secret_type as string || 'env',
    };

    const model: AIModelDTO = {
      id,
      name: dto.name,
      provider: dto.provider,
      api_endpoint: dto.api_endpoint,
      config: dto.config,
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    this.models.set(id, model);
    this.apiKeyReferences.set(id, apiKeyRef);

    // Initialize client for the model
    const apiKey = this.resolveApiKey(apiKeyRef);
    if (apiKey) {
      const client = new OpenAICompatibleClient({
        baseURL: dto.api_endpoint,
        apiKey,
        model: dto.name,
      });
      this.clients.set(id, client);
    }

    return model;
  }

  /**
   * Update model configuration
   */
  async updateModel(id: string, updates: Partial<CreateModelDTO>): Promise<AIModelDTO | null> {
    const model = this.models.get(id);
    if (!model) return null;

    const updatedModel: AIModelDTO = {
      ...model,
      ...updates,
      updated_at: new Date(),
    };

    this.models.set(id, updatedModel);

    // Reinitialize client if endpoint or model changed
    if (updates.api_endpoint || updates.name) {
      const apiKeyRef = this.apiKeyReferences.get(id);
      if (apiKeyRef) {
        const apiKey = this.resolveApiKey(apiKeyRef);
        if (apiKey) {
          const client = new OpenAICompatibleClient({
            baseURL: updates.api_endpoint || model.api_endpoint,
            apiKey,
            model: updates.name || model.name,
          });
          this.clients.set(id, client);
        }
      }
    }

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
      this.clients.delete(id);
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
   * In production, this would integrate with Vault, K8s secrets, or env variables
   */
  private resolveApiKey(ref: APIKeyReference): string | null {
    switch (ref.secret_type) {
      case 'env':
        // Get from environment variable
        const envKey = `AI_API_KEY_${ref.reference_id}`;
        return process.env[envKey] || null;
      case 'vault':
        // Would integrate with HashiCorp Vault in production
        // Placeholder for vault integration
        return null;
      case 'k8s_secret':
        // Would integrate with Kubernetes secrets in production
        // Placeholder for K8s secret integration
        return null;
      default:
        return null;
    }
  }

  /**
   * Get API key reference for a model (for management purposes)
   */
  getApiKeyReference(id: string): APIKeyReference | null {
    return this.apiKeyReferences.get(id) || null;
  }
}