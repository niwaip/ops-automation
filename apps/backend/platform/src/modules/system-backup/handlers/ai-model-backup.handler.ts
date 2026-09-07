import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  BackupConflictItem,
  BackupImportStrategy,
  BackupModulePreview,
} from '../interfaces/system-backup.interface';

@Injectable()
export class AIModelBackupHandler {
  private readonly logger = new Logger(AIModelBackupHandler.name);

  private resolveDataDir(): string {
    if (process.env.AI_MODELS_DATA_DIR) {
      return process.env.AI_MODELS_DATA_DIR;
    }
    let cursor = process.cwd();
    for (let depth = 0; depth < 6; depth += 1) {
      const candidate = path.join(cursor, 'apps', 'backend', 'var', 'cache', 'ai-orchestrator');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      if (cursor === path.dirname(cursor)) break;
      cursor = path.dirname(cursor);
    }
    return '/app/data';
  }

  private readJsonFile<T>(filename: string, fallback: T): T {
    try {
      const fullPath = path.join(this.resolveDataDir(), filename);
      if (!fs.existsSync(fullPath)) {
        return fallback;
      }
      const raw = fs.readFileSync(fullPath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(`Failed to read AI cache file ${filename}: ${err}`);
      return fallback;
    }
  }

  private writeJsonFile(filename: string, data: unknown): void {
    try {
      const dir = this.resolveDataDir();
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const fullPath = path.join(dir, filename);
      fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error(`Failed to write AI cache file ${filename}: ${err}`);
      throw err;
    }
  }

  async count(): Promise<number> {
    const models = this.readJsonFile<any[]>('ai-models.json', []);
    return Array.isArray(models) ? models.length : 0;
  }

  async export(): Promise<{
    models: any[];
    providers: any[];
    apiKeys: any[];
    providerApiKeys: any[];
  }> {
    const models = this.readJsonFile<any[]>('ai-models.json', []);
    const providers = this.readJsonFile<any[]>('ai-providers.json', []);
    const apiKeys = this.readJsonFile<any[]>('ai-api-keys.json', []);
    const providerApiKeys = this.readJsonFile<any[]>('ai-provider-api-keys.json', []);

    return {
      models: Array.isArray(models) ? models : [],
      providers: Array.isArray(providers) ? providers : [],
      apiKeys: Array.isArray(apiKeys) ? apiKeys : [],
      providerApiKeys: Array.isArray(providerApiKeys) ? providerApiKeys : [],
    };
  }

  async preview(backupData?: {
    models?: any[];
    providers?: any[];
    apiKeys?: any[];
    providerApiKeys?: any[];
  }): Promise<BackupModulePreview> {
    const backupModels = backupData?.models || [];
    const currentModels = this.readJsonFile<any[]>('ai-models.json', []);
    const currentMap = new Map<string, any>();
    for (const item of currentModels) {
      const m = item.model || item;
      if (m?.id) currentMap.set(m.id, m);
      if (m?.name) currentMap.set(`name:${m.name}`, m);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of backupModels) {
      const m = item.model || item;
      const id = m?.id || 'unknown';
      const name = m?.name || id;
      const exists = currentMap.has(id) || currentMap.has(`name:${name}`);
      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `AI Model: ${name} (${m?.provider || 'custom'})`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `AI Model: ${name} (${m?.provider || 'custom'})`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'aiModels',
      totalInBackup: backupModels.length,
      newCount,
      conflictCount,
      items,
    };
  }

  async import(
    backupData: {
      models?: any[];
      providers?: any[];
      apiKeys?: any[];
      providerApiKeys?: any[];
    },
    strategy: BackupImportStrategy
  ): Promise<{ created: number; updated: number; skipped: number }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    const incomingModels = backupData.models || [];
    const incomingProviders = backupData.providers || [];
    const incomingApiKeys = backupData.apiKeys || [];
    const incomingProviderApiKeys = backupData.providerApiKeys || [];

    // 1. Providers & Provider API keys
    const currentProviders = this.readJsonFile<any[]>('ai-providers.json', []);
    const providerMap = new Map<string, any>(
      currentProviders.map((p) => [p.provider?.id || p.id, p])
    );

    for (const item of incomingProviders) {
      const pId = item.provider?.id || item.id;
      if (!pId) continue;
      if (providerMap.has(pId)) {
        if (strategy === 'merge_override') {
          providerMap.set(pId, item);
        }
      } else {
        providerMap.set(pId, item);
      }
    }
    this.writeJsonFile('ai-providers.json', Array.from(providerMap.values()));

    // 2. Provider API keys
    const currentProviderApiKeys = this.readJsonFile<any[]>('ai-provider-api-keys.json', []);
    const providerKeyMap = new Map<string, any>(
      currentProviderApiKeys.map((k) => [k.id, k])
    );
    for (const item of incomingProviderApiKeys) {
      if (!item?.id) continue;
      if (providerKeyMap.has(item.id)) {
        if (strategy === 'merge_override') {
          providerKeyMap.set(item.id, item);
        }
      } else {
        providerKeyMap.set(item.id, item);
      }
    }
    this.writeJsonFile('ai-provider-api-keys.json', Array.from(providerKeyMap.values()));

    // 3. Models
    const currentModels = this.readJsonFile<any[]>('ai-models.json', []);
    const modelMap = new Map<string, any>(
      currentModels.map((m) => [m.model?.id || m.id, m])
    );

    for (const item of incomingModels) {
      const mId = item.model?.id || item.id;
      if (!mId) continue;
      if (modelMap.has(mId)) {
        if (strategy === 'merge_override') {
          modelMap.set(mId, item);
          updated += 1;
        } else {
          skipped += 1;
        }
      } else {
        modelMap.set(mId, item);
        created += 1;
      }
    }
    this.writeJsonFile('ai-models.json', Array.from(modelMap.values()));

    // 4. API keys
    const currentApiKeys = this.readJsonFile<any[]>('ai-api-keys.json', []);
    const apiKeyMap = new Map<string, any>(currentApiKeys.map((k) => [k.id, k]));
    for (const item of incomingApiKeys) {
      if (!item?.id) continue;
      if (apiKeyMap.has(item.id)) {
        if (strategy === 'merge_override') {
          apiKeyMap.set(item.id, item);
        }
      } else {
        apiKeyMap.set(item.id, item);
      }
    }
    this.writeJsonFile('ai-api-keys.json', Array.from(apiKeyMap.values()));

    return { created, updated, skipped };
  }
}
