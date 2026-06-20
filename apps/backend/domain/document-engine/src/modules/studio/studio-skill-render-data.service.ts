import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { SkillRepository } from './skill.repository';
import { TemplateRepository } from './template.repository';

export interface GenerateRenderDataWithSkillInput {
  templateId?: string;
  skillId?: string;
  skill?: Record<string, unknown>;
  simulatedData?: Record<string, unknown>;
}

export interface GenerateRenderDataWithSkillResult {
  templateId?: string;
  skillId?: string;
  skillUsed: Record<string, unknown>;
  generatedData: Record<string, unknown>;
  debugLogs: string[];
}

@Injectable()
export class StudioSkillRenderDataService {
  constructor(
    private readonly templateRepository: TemplateRepository,
    private readonly skillRepository: SkillRepository
  ) {}

  async generate(
    input: GenerateRenderDataWithSkillInput
  ): Promise<GenerateRenderDataWithSkillResult> {
    const debugLogs: string[] = [];
    const addLog = (message: string) => {
      debugLogs.push(message);
    };

    const skill = await this.resolveSkill(input, addLog);
    if (!skill) {
      throw new Error('Skill not found');
    }

    const resolvedTemplateId = this.resolveTemplateId(input.templateId, skill);
    const resolvedSkillId = this.resolveRenderSkillId(resolvedTemplateId, skill, addLog);

    let generatedData = input.simulatedData;
    if (!generatedData || !this.hasNonEmptySampleData(generatedData)) {
      const seedData = this.buildHydratedSkillSampleData(skill);
      if (seedData) {
        generatedData = seedData;
        addLog('使用 skill.dataExampleJson 及生成示例构造标准数据');
      } else {
        generatedData = this.generateSimulatedData(skill);
        addLog('skill.dataExampleJson 不可用，回退到 generateSimulatedData');
      }
    } else {
      addLog('使用调用方提供的 simulatedData 生成标准数据');
    }

    const normalizedData = this.normalizeRenderData(
      (generatedData || {}) as Record<string, unknown>
    );
    addLog(`标准数据已归一化，顶层键: ${Object.keys(normalizedData).join(', ')}`);

    return {
      templateId: resolvedTemplateId,
      skillId: resolvedSkillId,
      skillUsed: skill,
      generatedData: normalizedData,
      debugLogs,
    };
  }

  private get templatesDir(): string {
    return process.env.TEMPLATES_DIR || path.join(process.cwd(), 'templates');
  }

  private isPlainObject(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private hasNonEmptySampleData(value: unknown): boolean {
    return this.isPlainObject(value) && Object.keys(value).length > 0;
  }

  private parsePathSegments(pathValue: string): Array<string | number> {
    const segments: Array<string | number> = [];
    const matches = pathValue.match(/[^.[\]]+|\[(\d+)\]/g) || [];

    for (const match of matches) {
      if (match.startsWith('[') && match.endsWith(']')) {
        segments.push(Number(match.slice(1, -1)));
      } else {
        segments.push(match);
      }
    }

    return segments;
  }

  private setNestedValue(target: Record<string, any>, pathValue: string, value: unknown): void {
    const segments = this.parsePathSegments(pathValue);
    if (segments.length === 0) {
      return;
    }

    let current: any = target;
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      const nextSegment = segments[i + 1];

      if (isLast) {
        if (typeof segment === 'number') {
          if (!Array.isArray(current)) {
            return;
          }
          current[segment] = value;
        } else {
          current[segment] = value;
        }
        return;
      }

      if (typeof segment === 'number') {
        if (!Array.isArray(current)) {
          return;
        }
        if (current[segment] === undefined) {
          current[segment] = typeof nextSegment === 'number' ? [] : {};
        }
        current = current[segment];
        continue;
      }

      if (current[segment] === undefined) {
        current[segment] = typeof nextSegment === 'number' ? [] : {};
      }
      current = current[segment];
    }
  }

  private mergeObjects(
    target: Record<string, any>,
    source: Record<string, any>
  ): Record<string, any> {
    for (const [key, value] of Object.entries(source)) {
      if (this.isPlainObject(value) && this.isPlainObject(target[key])) {
        this.mergeObjects(target[key], value);
      } else {
        target[key] = value;
      }
    }

    return target;
  }

  private normalizeRenderValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) =>
        this.isPlainObject(item) ? this.normalizeRenderData(item) : item
      );
    }
    if (this.isPlainObject(value)) {
      return this.normalizeRenderData(value);
    }
    return value;
  }

  private normalizeRenderData(data: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = {};
    const arrayGroups = new Map<string, Record<string, unknown>>();

    for (const [key, value] of Object.entries(data || {})) {
      if (key === 'd' && this.isPlainObject(value)) {
        this.mergeObjects(normalized, this.normalizeRenderData(value));
        continue;
      }

      if (key.includes('[]')) {
        const [rawPrefix, rawSuffix] = key.split('[]', 2);
        const prefix = rawPrefix.replace(/\.$/, '').trim();
        const suffix = String(rawSuffix || '')
          .replace(/^\./, '')
          .trim();
        if (prefix && suffix) {
          const entry = arrayGroups.get(prefix) || {};
          entry[suffix] = this.normalizeRenderValue(value);
          arrayGroups.set(prefix, entry);
          continue;
        }
      }

      if (key.includes('.')) {
        normalized[key] = this.normalizeRenderValue(value);
        continue;
      }

      if (this.isPlainObject(value)) {
        const existing = normalized[key];
        if (this.isPlainObject(existing)) {
          this.mergeObjects(existing, this.normalizeRenderData(value));
        } else {
          normalized[key] = this.normalizeRenderData(value);
        }
        continue;
      }

      normalized[key] = value;
    }

    for (const [prefix, fields] of arrayGroups.entries()) {
      const fieldEntries = Object.entries(fields);
      if (fieldEntries.length === 0) {
        continue;
      }

      const maxLen = fieldEntries.reduce((acc, [, raw]) => {
        if (Array.isArray(raw)) {
          return Math.max(acc, raw.length);
        }
        return Math.max(acc, 1);
      }, 0);

      const rows: Array<Record<string, unknown>> = [];
      for (let i = 0; i < maxLen; i += 1) {
        const row: Record<string, unknown> = {};
        for (const [fieldPath, raw] of fieldEntries) {
          const valueAtIndex = Array.isArray(raw) ? raw[i] : i === 0 ? raw : undefined;
          if (valueAtIndex === undefined) {
            continue;
          }
          row[fieldPath] = valueAtIndex;
        }
        rows.push(row);
      }

      normalized[prefix] = rows;
    }

    return normalized;
  }

  private getPreviewSeedDataFromSkill(skill: Record<string, unknown>): Record<string, any> | null {
    const raw = skill?.dataExampleJson;
    if (!raw) {
      return null;
    }

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return this.isPlainObject(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }

    return this.isPlainObject(raw) ? raw : null;
  }

  private buildHydratedSkillSampleData(skill: Record<string, unknown>): Record<string, any> | null {
    const seedData = this.getPreviewSeedDataFromSkill(skill);
    const generatedData = this.generateSimulatedData(skill);

    if (seedData && this.hasNonEmptySampleData(generatedData)) {
      const merged = this.normalizeRenderData(JSON.parse(JSON.stringify(seedData)));
      this.mergeObjects(merged, generatedData);
      return merged;
    }

    if (seedData) {
      return this.normalizeRenderData(seedData);
    }

    return this.hasNonEmptySampleData(generatedData) ? generatedData : null;
  }

  private generateExampleValue(type: string | undefined, fieldName: string): unknown {
    const normalizedType = String(type || '').toLowerCase();
    if (normalizedType === 'number' || normalizedType === 'integer') {
      return 1;
    }
    if (normalizedType === 'currency' || normalizedType === 'amount') {
      return 1000.5;
    }
    if (normalizedType === 'boolean') {
      return true;
    }
    if (normalizedType === 'date') {
      return '2026-06-03';
    }
    return fieldName.split('.').pop() || 'sample';
  }

  private coerceSkillExampleValue(rawValue: unknown, type: string | undefined): unknown {
    const normalizedType = String(type || '').toLowerCase();
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return this.generateExampleValue(type, 'sample');
    }

    if (normalizedType === 'number' || normalizedType === 'integer') {
      const parsed = Number(rawValue);
      return Number.isFinite(parsed) ? parsed : rawValue;
    }

    if (normalizedType === 'currency' || normalizedType === 'amount') {
      if (typeof rawValue === 'number') {
        return rawValue;
      }
      const normalized = String(rawValue).replace(/,/g, '').trim();
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : rawValue;
    }

    if (normalizedType === 'boolean') {
      if (typeof rawValue === 'boolean') {
        return rawValue;
      }
      const normalized = String(rawValue).trim().toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'n'].includes(normalized)) {
        return false;
      }
      return rawValue;
    }

    if (normalizedType === 'date') {
      if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
        return rawValue.toISOString().slice(0, 10);
      }
      const normalized = String(rawValue).trim();
      const parsed = new Date(normalized);
      return Number.isNaN(parsed.getTime()) ? normalized : parsed.toISOString().slice(0, 10);
    }

    return rawValue;
  }

  private generateSimulatedData(skill: Record<string, any>): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const variables = skill.parameters || skill.parameterization?.variables || [];

    for (const variable of variables) {
      const rawExampleValue =
        variable.example ??
        this.generateExampleValue(variable.dataType || variable.fieldType, variable.name);
      const exampleValue = this.coerceSkillExampleValue(
        rawExampleValue,
        variable.dataType || variable.fieldType
      );

      let varPath = String(variable.name || '');
      varPath = varPath.replace(/^\{/, '').replace(/\}$/, '');
      varPath = varPath.replace(/^([cdt])\./, '');
      varPath = varPath.replace(/\[\]/g, '[0]');

      if (varPath && (varPath.includes('.') || varPath.includes('['))) {
        this.setNestedValue(data, varPath, exampleValue);
      } else if (varPath) {
        data[varPath] = exampleValue;
      }
    }

    return data;
  }

  private resolveTemplateId(
    templateId: string | undefined,
    skill: Record<string, unknown>
  ): string | undefined {
    const requestedTemplateId =
      typeof templateId === 'string' && templateId.trim() ? templateId.trim() : undefined;
    if (requestedTemplateId) {
      return requestedTemplateId;
    }

    return typeof skill.templateId === 'string' && skill.templateId.trim()
      ? skill.templateId.trim()
      : undefined;
  }

  private resolveRenderSkillId(
    templateId: string | undefined,
    skill: Record<string, unknown>,
    addLog: (message: string) => void
  ): string | undefined {
    const skillId = typeof skill.id === 'string' && skill.id.trim() ? skill.id.trim() : undefined;
    const skillTemplateId =
      typeof skill.templateId === 'string' && skill.templateId.trim()
        ? skill.templateId.trim()
        : undefined;

    if (!skillId) {
      return undefined;
    }

    if (!templateId || !skillTemplateId || skillTemplateId === templateId) {
      return skillId;
    }

    addLog(
      `skill.templateId=${skillTemplateId} 与请求 templateId=${templateId} 不一致，render-resolved 将仅使用 templateId`
    );
    return undefined;
  }

  private async resolveSkill(
    input: GenerateRenderDataWithSkillInput,
    addLog: (message: string) => void
  ): Promise<Record<string, unknown> | null> {
    if (this.isPlainObject(input.skill)) {
      addLog('使用请求中直接提供的 skill');
      return input.skill;
    }

    if (typeof input.skillId === 'string' && input.skillId.trim()) {
      const loadedById = await this.getSkillWithDbFallback(input.skillId.trim());
      if (loadedById) {
        addLog(`通过 skillId=${input.skillId.trim()} 加载 skill`);
        return loadedById;
      }
    }

    if (typeof input.templateId === 'string' && input.templateId.trim()) {
      const meta = await this.getTemplateMetaWithDbFallback(input.templateId.trim());
      const metaSkillId =
        typeof meta?.skillId === 'string' && meta.skillId.trim() ? meta.skillId.trim() : undefined;
      if (metaSkillId) {
        const loadedByTemplateMeta = await this.getSkillWithDbFallback(metaSkillId);
        if (loadedByTemplateMeta) {
          addLog(
            `通过 templateId=${input.templateId.trim()} 关联的 skillId=${metaSkillId} 加载 skill`
          );
          return loadedByTemplateMeta;
        }
      }
    }

    return null;
  }

  private async getTemplateMetaWithDbFallback(id: string): Promise<Record<string, unknown> | null> {
    const dbMeta = await this.templateRepository.findById(id);
    if (dbMeta) {
      return dbMeta as unknown as Record<string, unknown>;
    }

    const metaPath = path.join(this.templatesDir, `${id}.json`);
    if (!fs.existsSync(metaPath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>;
  }

  private async getSkillWithDbFallback(id: string): Promise<Record<string, unknown> | null> {
    const dbSkill = await this.skillRepository.findById(id);
    if (dbSkill) {
      return dbSkill as Record<string, unknown>;
    }

    const legacyCandidates = [
      path.join(this.templatesDir, `skill_${id}.json`),
      path.join(this.templatesDir, 'skills', `${id}.json`),
    ];

    for (const skillPath of legacyCandidates) {
      if (fs.existsSync(skillPath)) {
        return JSON.parse(fs.readFileSync(skillPath, 'utf-8')) as Record<string, unknown>;
      }
    }

    return null;
  }
}
