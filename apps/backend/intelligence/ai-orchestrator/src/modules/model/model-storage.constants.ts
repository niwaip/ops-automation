import * as fs from 'fs';
import * as path from 'path';
import type { AIModelDTO, AIProviderConfigDTO, APIKeyReference } from '../../interfaces';

function resolveDefaultDataDir(): string {
  if (process.env.NODE_ENV === 'test') {
    return path.join(process.cwd(), '.tmp', 'ai-models');
  }

  let cursor = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(cursor, 'apps', 'backend', 'var', 'cache', 'ai-orchestrator');
    if (cursor === path.dirname(cursor)) break;
    if (fs.existsSync(path.join(cursor, 'apps', 'backend'))) {
      return candidate;
    }
    cursor = path.dirname(cursor);
  }

  return '/app/data';
}

export const MODEL_STORAGE_DATA_DIR = process.env.AI_MODELS_DATA_DIR || resolveDefaultDataDir();
export const MODELS_FILE = path.join(MODEL_STORAGE_DATA_DIR, 'ai-models.json');
export const API_KEYS_FILE = path.join(MODEL_STORAGE_DATA_DIR, 'ai-api-keys.json');
export const PROVIDERS_FILE = path.join(MODEL_STORAGE_DATA_DIR, 'ai-providers.json');
export const PROVIDER_API_KEYS_FILE = path.join(
  MODEL_STORAGE_DATA_DIR,
  'ai-provider-api-keys.json'
);

export interface PersistedModel {
  model: AIModelDTO;
  apiKeyRef?: APIKeyReference;
}

export interface PersistedApiKey {
  id: string;
  apiKey: string;
}

export interface PersistedProvider {
  provider: AIProviderConfigDTO;
  apiKeyRef: APIKeyReference;
}

export interface PersistedProviderApiKey {
  id: string;
  apiKey: string;
}
