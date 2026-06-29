import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { SkillRepository } from '../../template/repository/skill.repository';
import { TemplateRepository } from '../../template/repository/template.repository';

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

  private cloneSampleData<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((item) => this.cloneSampleData(item)) as T;
    }
    if (this.isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [key, this.cloneSampleData(nested)])
      ) as T;
    }
    return value;
  }

  private pickFirstNonEmptyValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      for (const item of value) {
        const picked = this.pickFirstNonEmptyValue(item);
        if (picked !== undefined) {
          return picked;
        }
      }
      return undefined;
    }

    if (this.isPlainObject(value)) {
      for (const nested of Object.values(value)) {
        const picked = this.pickFirstNonEmptyValue(nested);
        if (picked !== undefined) {
          return picked;
        }
      }
      return undefined;
    }

    if (typeof value === 'string') {
      return value.trim() ? value : undefined;
    }

    return value ?? undefined;
  }

  private inferSampleValue(pathValue: string, skill: Record<string, unknown>): unknown {
    const seedData = this.getPreviewSeedDataFromSkill(skill);
    if (seedData) {
      const segments = this.parsePathSegments(pathValue);
      let current: unknown = seedData;
      for (const segment of segments) {
        if (typeof segment === 'number') {
          if (!Array.isArray(current)) {
            current = undefined;
            break;
          }
          current = current[segment];
        } else if (this.isPlainObject(current)) {
          current = current[segment];
        } else {
          current = undefined;
          break;
        }
      }

      const picked = this.pickFirstNonEmptyValue(current);
      if (picked !== undefined) {
        return this.cloneSampleData(picked);
      }
    }

    const leaf = pathValue.split('.').pop() || 'value';
    const humanized = leaf
      .replace(/\[\]/g, '')
      .replace(/_/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .trim();

    return humanized ? `Sample ${humanized}` : 'Sample Value';
  }

  private buildHydratedSkillSampleData(skill: Record<string, unknown>): Record<string, unknown> | null {
    const parameters = Array.isArray(skill.parameters) ? skill.parameters : [];
    if (parameters.length === 0) {
      return this.getPreviewSeedDataFromSkill(skill);
    }

    const hydrated: Record<string, unknown> = {};
    for (const parameter of parameters) {
      if (!this.isPlainObject(parameter)) {
        continue;
      }
      const pathValue =
        typeof parameter.path === 'string'
          ? parameter.path
          : typeof parameter.key === 'string'
            ? parameter.key
            : null;

      if (!pathValue) {
        continue;
      }

      const sampleValue =
        parameter.sampleValue ??
        parameter.example ??
        this.inferSampleValue(pathValue, skill);

      this.setNestedValue(hydrated, pathValue, sampleValue);
    }

    const normalizedHydrated = this.normalizeRenderData(hydrated);
    if (Object.keys(normalizedHydrated).length > 0) {
      return normalizedHydrated;
    }

    return this.getPreviewSeedDataFromSkill(skill);
  }

  private resolveTemplateId(
    explicitTemplateId: string | undefined,
    skill: Record<string, unknown>
  ): string | undefined {
    if (explicitTemplateId) {
      return explicitTemplateId;
    }
    const templateId = skill.templateId;
    return typeof templateId === 'string' && templateId.trim().length > 0
      ? templateId.trim()
      : undefined;
  }

  private resolveRenderSkillId(
    resolvedTemplateId: string | undefined,
    skill: Record<string, unknown>,
    addLog: (message: string) => void
  ): string | undefined {
    const skillId = typeof skill.id === 'string' && skill.id.trim().length > 0 ? skill.id : undefined;
    if (!skillId) {
      return undefined;
    }

    const templateIdFromSkill =
      typeof skill.templateId === 'string' && skill.templateId.trim().length > 0
        ? skill.templateId.trim()
        : undefined;

    if (!resolvedTemplateId || !templateIdFromSkill || templateIdFromSkill === resolvedTemplateId) {
      return skillId;
    }

    addLog(
      `skill.templateId(${templateIdFromSkill}) 与目标模板 ${resolvedTemplateId} 不一致，renderResolvedRequest 不注入 skillId`
    );
    return undefined;
  }

  private async resolveSkill(
    input: GenerateRenderDataWithSkillInput,
    addLog: (message: string) => void
  ): Promise<Record<string, unknown> | null> {
    if (input.skill && this.isPlainObject(input.skill)) {
      addLog('使用调用方直接提供的 skill');
      return input.skill;
    }

    if (input.skillId) {
      const skill = await this.skillRepository.findById(input.skillId);
      if (skill) {
        addLog(`通过 skillRepository 找到 skill: ${input.skillId}`);
        return skill;
      }
      addLog(`skillRepository 未找到 skill: ${input.skillId}`);
    }

    if (input.templateId) {
      const template = await this.templateRepository.findById(input.templateId);
      if (template?.skillId) {
        const skill = await this.skillRepository.findById(template.skillId);
        if (skill) {
          addLog(`通过 template.skillId 找到 skill: ${template.skillId}`);
          return skill;
        }
      }
    }

    return null;
  }

  private generateSimulatedData(skillData: Record<string, unknown>): Record<string, unknown> {
    const sampleData: Record<string, unknown> = {};

    if (!Array.isArray(skillData.parameters)) {
      return sampleData;
    }

    for (const parameter of skillData.parameters) {
      if (!this.isPlainObject(parameter) || typeof parameter.path !== 'string') {
        continue;
      }

      const sampleValue =
        parameter.sampleValue ??
        parameter.example ??
        this.inferSampleValue(parameter.path, skillData);
      this.setNestedValue(sampleData, parameter.path, sampleValue);
    }

    return sampleData;
  }

  async loadTemplateSkill(templateId: string): Promise<Record<string, unknown> | null> {
    const template = await this.templateRepository.findById(templateId);
    if (!template?.skillId) {
      return null;
    }

    return this.skillRepository.findById(template.skillId);
  }

  async loadWorkflowInputParams(templateId: string): Promise<Record<string, unknown> | null> {
    const workflowJsonPath = path.join(this.templatesDir, `${templateId}.workflow.json`);
    if (!fs.existsSync(workflowJsonPath)) {
      return null;
    }

    try {
      const workflowJson = JSON.parse(fs.readFileSync(workflowJsonPath, 'utf-8'));
      return this.isPlainObject(workflowJson?.inputParams)
        ? (workflowJson.inputParams as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}
